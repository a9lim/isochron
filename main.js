// Isochron: an Earth-like planet on one globe (docs/PLAN.md). Phase 1: the
// tectonic globe. Boots a seeded planet, spins it up so it opens in motion,
// and runs the plates under the dial.
//
// Globals from the shared layer: _PALETTE, _themePalette, _colophon,
// initAboutPanel, initShortcuts, _loadTextFonts.
import { buildGrid, gradient } from './src/grid/icosphere.js';
import { Tectonics, CM_PER_YR } from './src/engine/plates.js';
import { genesis } from './src/engine/genesis.js';
import { Polarity } from './src/engine/polarity.js';
import { Scheduler, formatRate, formatTime } from './src/clock.js';
import { Orbit } from './src/render/camera.js';
import { createGlobe } from './src/render/globe.js';
import { drawOverlay } from './src/render/overlay.js';

const LEVEL = 6;              // 40,962 cells, ~110 km
const RELIEF = 20;            // vertical exaggeration of the hillshade
const R_KM = 6371;
const POL_DT = 0.02;          // Myr per polarity-table entry
const POL_SPAN = 420;         // Myr the table covers
const PLATE_STEP = 5e5;       // years

const query = new URLSearchParams(location.search);
const seed = query.get('seed') || 'earthlike';
const $ = id => document.getElementById(id);
const els = {
  stage: document.querySelector('.globe-stage'),
  gpu: $('globe-gpu'), overlay: $('globe-overlay'), nogpu: $('globe-nogpu'),
  caption: $('globe-caption'), dial: $('dial'), dialOut: $('dial-out'),
};

// ── The planet ──
const grid = buildGrid(LEVEL);
const tec = new Tectonics(grid);
genesis(tec, seed, { spinup: 40 });
const polarity = new Polarity(seed);
const seaLevel0 = tec.seaLevel;
const scheduler = new Scheduler([{ name: 'plates', step: PLATE_STEP, budget: 4 }]);
const camera = new Orbit();

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let playing = !reducedMotion;
let globe = null;
let surfaceDirty = true, drawDirty = true;
let edges = null;

const elevRel = new Float32Array(grid.n);
const normals = new Float32Array(3 * grid.n);
const grad = new Float64Array(3 * grid.n);
const tfDraw = new Float32Array(grid.n), tfTmp = new Float32Array(grid.n);

function palette() {
  const T = _themePalette();
  const dark = document.documentElement.dataset.theme === 'dark';
  // Tint floor and span for the sea's depth and the land's height. On the dark
  // ground the land takes more ink, so it stays lighter than the sea in both themes.
  const tint = dark ? [0.08, 0.30, 0.50, 0.25] : [0.10, 0.42, 0.24, 0.34];
  return { canvas: T.canvas, text: T.text, accent: T.accent, ocean: T.ocean, land: T.land, muted: T.textMuted, tint };
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
  edges = tec.boundaries();
  if (!globe) return;
  const T0 = globe.polarityOrigin;
  if (!polarityReady || tec.t > T0 + POL_SPAN - 10) {
    const origin = tec.t - (POL_SPAN - 60);
    globe.setPolarity(polarity.table(origin, POL_DT, Math.ceil(POL_SPAN / POL_DT)), origin, POL_DT);
    polarityReady = true;
  }
  globe.setFields(elevRel, tfDraw, tec.phi, normals);
}
let polarityReady = false;

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
  drawDirty = true;
}
new ResizeObserver(resize).observe(els.stage);
resize();

// ── The dial ──
function rate() { return 10 ** +els.dial.value; }
function syncDial() { els.dialOut.textContent = formatRate(rate()); }
els.dial.addEventListener('input', syncDial);
syncDial();

// ── The caption: the view's name and live values ──
const setCaption = window._colophon ? window._colophon.caption(els.caption, 250) : t => { els.caption.textContent = t; };
let lastCaption = 0;
function caption(force) {
  const now = performance.now();
  if (!force && now - lastCaption < 250) return;
  lastCaption = now;
  const s = tec.stats();
  const dSea = Math.round((s.seaLevel - seaLevel0) * 1000);
  const parts = [
    'Relief',
    formatTime(tec.t * 1e6),
    `${s.plates} plates`,
    `land ${Math.round(100 * s.land)}%`,
    `sea level ${dSea > 0 ? '+' : dSea < 0 ? '−' : ''}${Math.abs(dSea)} m`,
    `fastest ${s.fastest.toFixed(1)} cm/yr`,
    `seafloor ${Math.round(s.meanOceanAge)} Myr`,
    polarity.at(tec.t) > 0 ? 'field normal' : 'field reversed',
  ];
  setCaption(parts.join(' · '), true);
}

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
function stepOnce() {
  setPlaying(false);
  tec.step(PLATE_STEP / 1e6);
  surfaceDirty = true;
}
function nudgeDial(d) {
  els.dial.value = String(Math.min(+els.dial.max, Math.max(+els.dial.min, +els.dial.value + d)));
  syncDial();
}

window.addEventListener('DOMContentLoaded', () => {
  if (window._colophon) {
    colophon = window._colophon.mount({
      themeKey: 'isochron-theme',
      playing,
      onPlay: () => { setPlaying(!playing); return playing; },
      onStep: () => stepOnce(),
      onTheme: () => { drawDirty = true; },
      onHelp: () => {},
    });
  }
  const shortcuts = [
    { key: 'space', group: 'Simulation', label: 'Play / pause', action: () => setPlaying(!playing) },
    { key: '.', group: 'Simulation', label: 'Step 0.5 Myr', action: () => stepOnce() },
    { key: ']', group: 'Simulation', label: 'Faster', action: () => nudgeDial(0.25) },
    { key: '[', group: 'Simulation', label: 'Slower', action: () => nudgeDial(-0.25) },
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
        'Climate, ice, the carbon cycle, the oceans and the weather are to come, coupled on the same globe.',
      controls: [
        { label: 'Turn the globe', value: 'Drag' },
        { label: 'Zoom', value: 'Scroll, pinch, or = - 0' },
        { label: 'Rate', value: 'The dial, or [ and ]' },
      ],
      shortcuts,
      repo: 'https://github.com/a9lim/a9lim.github.io',
      lastUpdated: '2026-11-13',
    });
  }
  if (typeof _loadTextFonts === 'function') _loadTextFonts().then(() => { drawDirty = true; });
});

// ── The loop ──
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing) {
    const { plan } = scheduler.advance(rate() * dt);
    const p = plan[0];
    for (let s = 0; s < p.steps; s++) tec.step(p.step / 1e6);
    if (p.steps > 0) surfaceDirty = true;
  }
  if (surfaceDirty) { refreshSurface(); surfaceDirty = false; drawDirty = true; caption(false); }
  if (drawDirty && globe && !globe.lost) {
    const pal = palette();
    globe.draw(camera, tec.t, pal);
    drawOverlay(octx, cssW, cssH, dpr, camera, grid, edges, tec.arc, pal);
    drawDirty = false;
  }
  requestAnimationFrame(frame);
}

createGlobe(els.gpu, grid).then(g => {
  globe = g;
  surfaceDirty = true;
  caption(true);
}).catch(err => {
  console.warn('[isochron] WebGPU unavailable:', err.message);
  els.nogpu.hidden = false;
  caption(true);
});
requestAnimationFrame(frame);

window.__isochron = { grid, tec, polarity, camera, scheduler, setPlaying };
