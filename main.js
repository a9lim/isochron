// Isochron: an Earth-like planet on one globe (docs/PLAN.md). Boots a seeded
// planet, spins it up so it opens in motion, and runs it under the dial: the
// plates and the landscape step in banked time, and the climate relaxes
// toward the geography in the background, a few milliseconds a frame.
//
// Globals from the shared layer: _PALETTE, _themePalette, _colophon,
// initAboutPanel, initShortcuts, _loadTextFonts.
import { buildGrid, gradient } from './src/grid/icosphere.js';
import { Tectonics } from './src/engine/plates.js';
import { Landscape } from './src/engine/landscape.js';
import { Climate, CLIMATE, NZ, ZONES } from './src/engine/climate.js';
import { genesis } from './src/engine/genesis.js';
import { Polarity } from './src/engine/polarity.js';
import { monthName } from './src/engine/orbit.js';
import { Scheduler, formatRate, formatTime } from './src/clock.js';
import { Orbit } from './src/render/camera.js';
import { createGlobe } from './src/render/globe.js';
import { drawOverlay } from './src/render/overlay.js';
import { traceBoundaries } from './src/render/lines.js';
import { traceRivers } from './src/render/rivers.js';
import { drawZonal, drawHypsometry, drawPolarity, drawZoneKey } from './src/render/figures.js';

const LEVEL = 6;              // 40,962 cells, ~110 km
const RELIEF = 20;            // vertical exaggeration of the hillshade
const R_KM = 6371;
const POL_DT = 0.02;          // Myr per polarity-table entry
const POL_SPAN = 420;         // Myr the table covers
const PLATE_STEP = 5e5;       // years
const CLIMATE_MS = 5;         // the climate's share of a frame

const query = new URLSearchParams(location.search);
const seed = query.get('seed') || 'earthlike';
const $ = id => document.getElementById(id);
const els = {
  stage: document.querySelector('.globe-stage'),
  gpu: $('globe-gpu'), overlay: $('globe-overlay'), nogpu: $('globe-nogpu'),
  caption: $('globe-caption'), dial: $('dial'), dialOut: $('dial-out'),
  views: document.querySelectorAll('#view-picker .view-btn'),
  figZonal: $('fig-zonal'), capZonal: $('cap-zonal'), zoneKey: $('zone-key'),
  figHyps: $('fig-hyps'), capHyps: $('cap-hyps'), figPol: $('fig-pol'), capPol: $('cap-pol'),
};

// ── The planet ──
const grid = buildGrid(LEVEL);
const tec = new Tectonics(grid);
const land = new Landscape(tec);
genesis(tec, seed, { spinup: 40, landscape: land });
land.reroute();
const climate = new Climate(tec, land);
const polarity = new Polarity(seed);
const seaLevel0 = tec.seaLevel;
const scheduler = new Scheduler([{ name: 'plates', step: PLATE_STEP, budget: 4 }]);
const camera = new Orbit();
let years = tec.t * 1e6;           // the planet's clock; the plates step in banked half-Myr
let climatePending = 3;            // cycles still owed to the geography (the first is cold)

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let playing = !reducedMotion;
let view = 'relief';
let globe = null;
let surfaceDirty = true, drawDirty = true, climateDirty = true, figuresDirty = true;
let lines = null, rivers = null;

const elevRel = new Float32Array(grid.n);
const normals = new Float32Array(3 * grid.n);
const grad = new Float64Array(3 * grid.n);
const tfDraw = new Float32Array(grid.n), tfTmp = new Float32Array(grid.n);
const lakeDraw = new Float32Array(grid.n);
const climDraw = new Float32Array(4 * grid.n);
const areaM2 = Float64Array.from(grid.area, a => a * 6.371e6 * 6.371e6);

function palette() {
  const T = _themePalette();
  const dark = document.documentElement.dataset.theme === 'dark';
  // Tint floor and span for the sea's depth and the land's height. On the dark
  // ground the land takes more ink, so it stays lighter than the sea in both themes.
  const tint = dark ? [0.14, 0.26, 0.50, 0.25] : [0.18, 0.36, 0.24, 0.34];
  return { canvas: T.canvas, text: T.text, accent: T.accent, ocean: T.ocean, land: T.land, muted: T.textMuted, inks: T.inks, tint };
}

function refreshSurface() {
  const P = grid.pos, nbrOff = grid.nbrOff, nbr = grid.nbr;
  // Drawn relief is the model's, eased once toward its neighbours' mean: a
  // margin then reads as a slope across a cell rather than a stair of hexagons.
  for (let i = 0; i < grid.n; i++) {
    let s = 0;
    const o = nbrOff[i], e = nbrOff[i + 1];
    for (let t = o; t < e; t++) s += tec.elev[nbr[t]];
    elevRel[i] = 0.5 * tec.elev[i] + 0.5 * s / (e - o) - tec.seaLevel;
  }
  gradient(grid, elevRel, grad);
  for (let i = 0; i < grid.n; i++) {
    // Land relief at full exaggeration; the sea floor at a third (depth is shown by tint).
    const k = (elevRel[i] < 0 ? RELIEF / 3 : RELIEF) / R_KM;
    let x = P[3 * i] - k * grad[3 * i], y = P[3 * i + 1] - k * grad[3 * i + 1], z = P[3 * i + 2] - k * grad[3 * i + 2];
    const r = Math.hypot(x, y, z);
    normals[3 * i] = x / r; normals[3 * i + 1] = y / r; normals[3 * i + 2] = z / r;
  }
  // Formation times are laid down a step and a cell at a time; eased twice
  // across each plate's own seafloor, the stripes follow the ridge rather than
  // the hexagons. Ridges (where two plates meet) stay sharp.
  tfDraw.set(tec.tf);
  for (let pass = 0; pass < 2; pass++) {
    tfTmp.set(tfDraw);
    for (let i = 0; i < grid.n; i++) {
      if (tec.phi[i] >= 0.5) continue;
      let s = 0, c = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        if (tec.owner[j] !== tec.owner[i] || tec.phi[j] >= 0.5) continue;
        s += tfTmp[j]; c++;
      }
      if (c) tfDraw[i] = 0.5 * tfTmp[i] + 0.5 * s / c;
    }
  }
  // Lakes hold water only where their inflow outpaces evaporation off them (~1 m/yr).
  for (let i = 0; i < grid.n; i++) {
    const L = land.lake[i];
    lakeDraw[i] = L > 0 ? L * Math.min(1, land.discharge[i] * 3.156e7 / (areaM2[i] * 1.0)) : 0;
  }
  lines = traceBoundaries(tec);
  rivers = traceRivers(grid, land);
  figuresDirty = true;
  if (!globe) return;
  const T0 = globe.polarityOrigin;
  if (!polarityReady || tec.t > T0 + POL_SPAN - 10) {
    const origin = tec.t - (POL_SPAN - 60);
    globe.setPolarity(polarity.table(origin, POL_DT, Math.ceil(POL_SPAN / POL_DT)), origin, POL_DT);
    polarityReady = true;
  }
  globe.setFields(elevRel, tfDraw, tec.phi, lakeDraw, normals);
}
let polarityReady = false;

// ── The season ──
// Below a few years a second the globe shows the season at the planet's
// clock; above a few tens it shows the year's average (the share of it under
// snow or ice). Between, it blends.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let seasonDrawn = -1, seasonWeightDrawn = -1, climateVersionDrawn = -1;
function refreshClimate(force) {
  const tau = ((years % 1) + 1) % 1;
  const sw = 1 - smooth(0.6, 1.6, Math.log10(rate()));
  const moved = Math.abs(tau - seasonDrawn) > 1 / 240 || Math.abs(sw - seasonWeightDrawn) > 0.02;
  if (!force && !moved && climate.version === climateVersionDrawn) return;
  const L = CLIMATE.LAPSE;
  for (let i = 0; i < grid.n; i++) {
    let cold = climate.snowAnn[i];
    if (sw > 0.001) {
      const T = climate.tAt(i, tau);
      const now = climate.landMask[i] ? smooth(-1, 5, -(T - L * climate.elevPos[i])) : smooth(1.5, 6, -T);
      cold = sw * now + (1 - sw) * cold;
    }
    // Land newly dry or drowned since the climate last saw it takes no snow or ice.
    if ((elevRel[i] > 0) !== (climate.landMask[i] === 1)) cold = 0;
    climDraw[4 * i] = cold;
    climDraw[4 * i + 1] = climate.Pf[0][i] * 0.36525;
    climDraw[4 * i + 2] = climate.Tf[0][i];
  }
  seasonDrawn = tau; seasonWeightDrawn = sw;
  if (globe) {
    globe.setClimate(climDraw);
    if (climate.version !== climateVersionDrawn) globe.setZones(climate.zones);
  }
  if (climate.version !== climateVersionDrawn) figuresDirty = true;
  climateVersionDrawn = climate.version;
  drawDirty = true;
}

// ── Canvas sizing ──
let cssW = 1, cssH = 1, dpr = 1;
const octx = els.overlay.getContext('2d');
function resize() {
  const r = els.stage.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
  for (const c of [els.gpu, els.overlay]) {
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
  }
  drawDirty = true; figuresDirty = true;
}
new ResizeObserver(resize).observe(els.stage);
resize();

// ── The dial ──
function rate() { return 10 ** +els.dial.value; }
function syncDial() { els.dialOut.textContent = formatRate(rate()); }
els.dial.addEventListener('input', () => { syncDial(); caption(true); });
syncDial();

// ── The view ──
function setView(v) {
  view = v;
  for (const b of els.views) b.setAttribute('aria-checked', b.dataset.view === v ? 'true' : 'false');
  drawDirty = true;
  caption(true);
}
for (const b of els.views) b.addEventListener('click', () => setView(b.dataset.view));

// ── Captions: the view's name and live values ──
const setCaption = window._colophon ? window._colophon.caption(els.caption, 250) : t => { els.caption.textContent = t; };
let lastCaption = 0;
const signed = (v, unit) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} ${unit}`;
function zoneShares() {
  const share = new Float64Array(NZ);
  let la = 0;
  for (let i = 0; i < grid.n; i++) {
    if (!climate.landMask[i]) continue;
    la += grid.area[i];
    for (let k = 0; k < NZ; k++) share[k] += climate.zones[NZ * i + k] * grid.area[i];
  }
  for (let k = 0; k < NZ; k++) share[k] /= la || 1;
  return share;
}
function caption(force) {
  const now = performance.now();
  if (!force && now - lastCaption < 250) return;
  lastCaption = now;
  const parts = [view === 'climate' ? 'Climate' : 'Relief', formatTime(years)];
  if (rate() < 300) parts.push(monthName(((years % 1) + 1) % 1));
  if (view === 'climate') {
    const s = climate.stats, sh = zoneShares();
    const g = [[0, 4], [4, 6], [6, 9], [9, 12], [12, 14]].map(([a, b]) => { let v = 0; for (let k = a; k < b; k++) v += sh[k]; return Math.round(100 * v); });
    parts.push(`mean ${s.meanT.toFixed(1)} °C`, `rain ${Math.round(s.meanP || 0)} mm/yr`, `ice line ${Math.round(s.iceLat)}°`,
      `A ${g[0]}% · B ${g[1]}% · C ${g[2]}% · D ${g[3]}% · E ${g[4]}% of land`);
  } else {
    const s = tec.stats();
    parts.push(`${s.plates} plates`, `land ${Math.round(100 * s.land)}%`, `sea level ${signed(Math.round((s.seaLevel - seaLevel0) * 1000), 'm')}`,
      `fastest ${s.fastest.toFixed(1)} cm/yr`, `seafloor ${Math.round(s.meanOceanAge)} Myr`,
      polarity.at(tec.t) > 0 ? 'field normal' : 'field reversed');
  }
  setCaption(parts.join(' · '), true);
}

// ── The margin's figures ──
let lastFigures = 0;
const visible = el => el && el.offsetParent !== null && el.clientWidth > 0;
function figures(force) {
  const now = performance.now();
  if (!force && now - lastFigures < 400) return;
  lastFigures = now; figuresDirty = false;
  const pal = palette();
  if (visible(els.figZonal)) {
    drawZonal(els.figZonal, climate.zonal, pal);
    const z = climate.zonal;
    if (z) {
      const lat = d => `${Math.abs(Math.round(d))}°${d > 0.5 ? 'N' : d < -0.5 ? 'S' : ''}`;
      els.capZonal.textContent = `Zonal means · ITCZ ${lat(z.itczLo)} to ${lat(z.itczHi)} · Hadley edge ${Math.round(z.hadley)}°`;
    }
    drawZoneKey(els.zoneKey, pal, zoneShares());
  }
  if (visible(els.figHyps)) {
    drawHypsometry(els.figHyps, tec, pal);
    let la = 0, lh = 0, sa = 0, sd = 0;
    for (let i = 0; i < grid.n; i++) {
      const e = tec.elev[i] - tec.seaLevel, a = grid.area[i];
      if (e > 0) { la += a; lh += a * e; } else { sa += a; sd -= a * e; }
    }
    els.capHyps.textContent = `Hypsometry · land ${Math.round(100 * la / (4 * Math.PI))}% · mean height ${(lh / la).toFixed(2)} km · mean depth ${(sd / sa).toFixed(1)} km`;
  }
  if (visible(els.figPol)) {
    drawPolarity(els.figPol, polarity, tec.t, pal);
    els.capPol.textContent = `Polarity · the last 160 Myr · ${polarity.recent(tec.t, 160).length} reversals`;
  }
}
for (const b of document.querySelectorAll('.margin-tabs .tab-btn')) b.addEventListener('click', () => requestAnimationFrame(() => figures(true)));

// ── Turning and zooming the globe ──
const pointers = new Map();
let pinch = 0;
els.overlay.addEventListener('pointerdown', e => {
  els.overlay.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
els.overlay.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 2) {
    p.x = e.clientX; p.y = e.clientY;
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch > 0) camera.zoomBy(d / pinch);
    pinch = d;
  } else {
    camera.drag(e.clientX - p.x, e.clientY - p.y, camera.radius(cssW, cssH));
    p.x = e.clientX; p.y = e.clientY;
  }
  drawDirty = true;
});
const release = e => { pointers.delete(e.pointerId); pinch = 0; };
els.overlay.addEventListener('pointerup', release);
els.overlay.addEventListener('pointercancel', release);
els.overlay.addEventListener('wheel', e => {
  e.preventDefault();
  camera.zoomBy(Math.exp(-e.deltaY * 0.0015));
  drawDirty = true;
}, { passive: false });

// ── Colophon, shortcuts, about ──
let colophon = null;
function setPlaying(p) {
  playing = p;
  if (colophon) colophon.setPlaying(p);
}
function stepPlates(dtYears) {
  tec.step(dtYears / 1e6);
  land.step(dtYears);
  climatePending = Math.max(climatePending, 1);
  surfaceDirty = true;
}
function stepOnce() {
  setPlaying(false);
  years += PLATE_STEP;
  stepPlates(PLATE_STEP);
}
function nudgeDial(d) {
  els.dial.value = String(Math.min(+els.dial.max, Math.max(+els.dial.min, +els.dial.value + d)));
  syncDial();
  caption(true);
}

window.addEventListener('DOMContentLoaded', () => {
  if (window._colophon) {
    colophon = window._colophon.mount({
      themeKey: 'isochron-theme',
      playing,
      onPlay: () => { setPlaying(!playing); return playing; },
      onStep: () => stepOnce(),
      onTheme: () => { drawDirty = true; figuresDirty = true; requestAnimationFrame(() => figures(true)); },
      onHelp: () => {},
    });
  }
  const shortcuts = [
    { key: 'space', group: 'Simulation', label: 'Play / pause', action: () => setPlaying(!playing) },
    { key: '.', group: 'Simulation', label: 'Step 0.5 Myr', action: () => stepOnce() },
    { key: ']', group: 'Simulation', label: 'Faster', action: () => nudgeDial(0.25) },
    { key: '[', group: 'Simulation', label: 'Slower', action: () => nudgeDial(-0.25) },
    { key: '1', group: 'View', label: 'Relief', action: () => setView('relief') },
    { key: '2', group: 'View', label: 'Climate', action: () => setView('climate') },
    { key: '=', group: 'View', label: 'Zoom in', action: () => { camera.zoomBy(1.2); drawDirty = true; } },
    { key: '-', group: 'View', label: 'Zoom out', action: () => { camera.zoomBy(1 / 1.2); drawDirty = true; } },
    { key: '0', group: 'View', label: 'Fit the globe', action: () => { camera.zoom = 1; drawDirty = true; } },
  ];
  if (typeof initShortcuts === 'function') initShortcuts(shortcuts);
  if (typeof initAboutPanel === 'function') {
    initAboutPanel({
      title: 'Isochron',
      description:
        'An Earth-like planet on one globe. Plates move under their own slab pull and ridge push; ' +
        'seafloor is made at the ridges and recorded in magnetic stripes, sinks at the trenches, and continents collide and rift. ' +
        'Rivers cut the mountains and carry them to the sea. The climate follows the geography: seasons, winds, rain and rain shadows, and the climate zones they make.',
      controls: [
        { label: 'Turn the globe', value: 'Drag' },
        { label: 'Zoom', value: 'Scroll, pinch, or = - 0' },
        { label: 'Rate', value: 'The dial, or [ and ]' },
        { label: 'View', value: 'Relief or Climate, or 1 and 2' },
      ],
      shortcuts,
      repo: 'https://github.com/a9lim/a9lim.github.io',
      lastUpdated: '2026-11-14',
    });
  }
  if (typeof _loadTextFonts === 'function') _loadTextFonts().then(() => { drawDirty = true; figures(true); });
});

// ── The loop ──
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing) {
    const { dt: adv, plan } = scheduler.advance(rate() * dt);
    years += adv;
    const p = plan[0];
    for (let s = 0; s < p.steps; s++) stepPlates(p.step);
  }
  if (surfaceDirty) { refreshSurface(); surfaceDirty = false; drawDirty = true; climateDirty = true; caption(false); }
  if (climatePending > 0 && climate.work(CLIMATE_MS)) { climatePending--; climateDirty = true; }
  if (climateDirty || playing) { refreshClimate(climateDirty); climateDirty = false; }
  if (playing) caption(false);
  if (figuresDirty) figures(false);
  if (drawDirty && globe && !globe.lost) {
    const pal = palette();
    globe.draw(camera, tec.t, pal, { view });
    drawOverlay(octx, cssW, cssH, dpr, camera, { boundaries: lines, rivers, view }, pal);
    drawDirty = false;
  }
  requestAnimationFrame(frame);
}

createGlobe(els.gpu, grid).then(g => {
  globe = g;
  surfaceDirty = true; climateDirty = true;
  climateVersionDrawn = -1;
  caption(true);
}).catch(err => {
  console.warn('[isochron] WebGPU unavailable:', err.message);
  els.nogpu.hidden = false;
  caption(true);
});
requestAnimationFrame(frame);

window.__isochron = { grid, tec, land, climate, polarity, camera, scheduler, setPlaying, setView, get years() { return years; } };
