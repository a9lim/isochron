// Isochron: an Earth-like planet on one globe (docs/PLAN.md). Boots a seeded
// planet (src/engine/planet.js), spins it up so it opens in motion, and runs
// it under the dial: plates, plumes and landscape step in banked half-Myr;
// carbon and ice follow each frame; the climate relaxes toward everything in
// the background, a few milliseconds a frame.
//
// Globals from the shared layer: _PALETTE, _themePalette, _colophon,
// initAboutPanel, initShortcuts, _loadTextFonts.
import { gradient } from './src/grid/icosphere.js';
import { Planet } from './src/engine/planet.js';
import { PARAMS } from './src/engine/plates.js';
import { CLIMATE, NZ } from './src/engine/climate.js';
import { CARBON } from './src/engine/carbon.js';
import { PLUMES } from './src/engine/plumes.js';
import { Polarity } from './src/engine/polarity.js';
import { monthName, S0 } from './src/engine/orbit.js';
import { Scheduler, formatRate, formatTime } from './src/clock.js';
import { Orbit } from './src/render/camera.js';
import { createGlobe } from './src/render/globe.js';
import { drawOverlay } from './src/render/overlay.js';
import { traceBoundaries } from './src/render/lines.js';
import { traceRivers } from './src/render/rivers.js';
import { drawZonal, drawHypsometry, drawPolarity, drawZoneKey, drawRecord, drawOrbit, drawModel } from './src/render/figures.js';
import { WEATHER } from './src/engine/weather.js';
import { chartLines } from './src/render/chart.js';
import { drawKey } from './src/render/key.js';
import { prolong } from './src/grid/transfer.js';

const RELIEF = 20;            // vertical exaggeration of the hillshade
const R_KM = 6371;
const POL_DT = 0.02;          // Myr per polarity-table entry
const POL_SPAN = 420;         // Myr the table covers
const PLATE_STEP = 5e5;       // years
const CLIMATE_MS = 5;         // the climate's share of a frame
const ICE_MS = 3;             // the ice's
const WEATHER_MS = 8;         // the weather's, when it runs live
const SPINUP_DAYS = 12;       // the weather's spin-up from the climate's state
const RECORD_SECONDS = 40;    // the record's window, in seconds of the dial

const query = new URLSearchParams(location.search);
const seed = query.get('seed') || 'earthlike';
const $ = id => document.getElementById(id);
const els = {
  stage: document.querySelector('.globe-stage'),
  gpu: $('globe-gpu'), overlay: $('globe-overlay'), nogpu: $('globe-nogpu'),
  caption: $('globe-caption'), dial: $('dial'), dialOut: $('dial-out'),
  knob: $('knob'), knobLabel: $('knob-label'), knobInput: $('knob-input'), knobOut: $('knob-out'),
  views: document.querySelectorAll('#view-picker .view-btn'),
  keyBtn: $('key-btn'), key: $('globe-key'), keyCanvas: $('key-canvas'),
  wxPicker: $('wx-picker'), wxBtns: document.querySelectorAll('#wx-picker .view-btn'),
  experiments: $('experiments'),
  figRecord: $('fig-record'), capRecord: $('cap-record'), figOrbit: $('fig-orbit'), capOrbit: $('cap-orbit'),
  figZonal: $('fig-zonal'), capZonal: $('cap-zonal'), zoneKey: $('zone-key'),
  figHyps: $('fig-hyps'), capHyps: $('cap-hyps'), figPol: $('fig-pol'), capPol: $('cap-pol'),
  figModel: $('fig-model'), capModel: $('cap-model'),
};

// ── The planet ──
const P = new Planet(seed);
const { grid, tec, land, climate, ice, carbon, plumes, weather: wx } = P;
const polarity = new Polarity(seed);
const scheduler = new Scheduler([{ name: 'plates', step: PLATE_STEP, budget: 4 }]);
const camera = new Orbit();
let climatePending = 3;            // cycles owed while paused (the first is cold)

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let playing = !reducedMotion;
let view = 'relief';
let wxMode = 'pressure';            // the Weather view's chart: pressure, temperature or humidity
let globe = null;
let surfaceDirty = true, drawDirty = true, climateDirty = true, figuresDirty = true;
let lines = null, rivers = null;
let seaDrawn = tec.seaLevel;

const elevRel = new Float32Array(grid.n);
const normals = new Float32Array(3 * grid.n);
const grad = new Float64Array(3 * grid.n);
const tfDraw = new Float32Array(grid.n), tfTmp = new Float32Array(grid.n);
const lakeDraw = new Float32Array(grid.n);
const climDraw = new Float32Array(4 * grid.n);
const wxDraw = new Float32Array(4 * grid.n);
const wxFine = new Float64Array(grid.n), wxFine2 = new Float64Array(grid.n), wxEddy = new Float64Array(wx.n);
const wxFineT = new Float64Array(grid.n), wxFineH = new Float64Array(grid.n), wxRH = new Float64Array(wx.n);
const wsatW = T => 25 * Math.exp(0.065 * (Math.max(-45, Math.min(45, T)) - 15));
const areaM2 = Float64Array.from(grid.area, a => a * 6.371e6 * 6.371e6);

function palette() {
  const T = _themePalette();
  const dark = document.documentElement.dataset.theme === 'dark';
  // Tint floor and span for the sea's depth and the land's height. On the dark
  // ground the land takes more ink, so it stays lighter than the sea in both themes.
  const tint = dark ? [0.14, 0.26, 0.50, 0.25] : [0.18, 0.36, 0.24, 0.34];
  return { canvas: T.canvas, text: T.text, accent: T.accent, ocean: T.ocean, land: T.land, muted: T.textMuted, inks: T.inks, tint, dark };
}

function refreshSurface() {
  const Pp = grid.pos, nbrOff = grid.nbrOff, nbr = grid.nbr;
  // Drawn relief is the model's, eased once toward its neighbours' mean: a
  // margin then reads as a slope across a cell rather than a stair of hexagons.
  for (let i = 0; i < grid.n; i++) {
    let s = 0;
    const o = nbrOff[i], e = nbrOff[i + 1];
    for (let t = o; t < e; t++) s += tec.elev[nbr[t]];
    elevRel[i] = 0.5 * tec.elev[i] + 0.5 * s / (e - o) - tec.seaLevel;
  }
  // The deep sea is eased further, so isobaths read as curves, not facets; the
  // coast and the shelf keep the single easing.
  for (let pass = 0; pass < 2; pass++) {
    tfTmp.set(elevRel);
    for (let i = 0; i < grid.n; i++) {
      if (tfTmp[i] > -0.4) continue;
      let s = 0, deep = true;
      const o = nbrOff[i], e = nbrOff[i + 1];
      for (let t = o; t < e; t++) { const v = tfTmp[nbr[t]]; if (v > -0.4) { deep = false; break; } s += v; }
      if (deep) elevRel[i] = 0.4 * tfTmp[i] + 0.6 * s / (e - o);
    }
  }
  gradient(grid, elevRel, grad);
  for (let i = 0; i < grid.n; i++) {
    // Land relief at full exaggeration; the sea floor at a third (depth is shown by tint).
    const k = (elevRel[i] < 0 ? RELIEF / 3 : RELIEF) / R_KM;
    let x = Pp[3 * i] - k * grad[3 * i], y = Pp[3 * i + 1] - k * grad[3 * i + 1], z = Pp[3 * i + 2] - k * grad[3 * i + 2];
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
  // Lakes are drawn from a smoothed depth (signed: dry land below zero), so their
  // shores are curves like the coast's rather than the grid's hexagons.
  for (let i = 0; i < grid.n; i++) {
    const L = land.lake[i];
    lakeDraw[i] = L > 0 && !(ice.H[i] > 20) ? L * Math.min(1, land.discharge[i] * 3.156e7 / (areaM2[i] * 1.0)) : 0;
    if (!(lakeDraw[i] > 0.03)) lakeDraw[i] = elevRel[i] > 0 ? -0.05 : 0;
  }
  // A lake of one cell would draw as a hexagon (interpolation round one vertex can't
  // make a curve), so lakes are drawn from two cells up.
  for (let i = 0; i < grid.n; i++) {
    if (!(lakeDraw[i] > 0)) continue;
    let mate = false;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (lakeDraw[nbr[t]] > 0) { mate = true; break; }
    if (!mate) lakeDraw[i] = -0.05;
  }
  for (let pass = 0; pass < 2; pass++) {
    tfTmp.set(lakeDraw);
    for (let i = 0; i < grid.n; i++) {
      if (elevRel[i] <= 0) continue;
      let s = 0;
      const o = nbrOff[i], e = nbrOff[i + 1];
      for (let t = o; t < e; t++) s += elevRel[nbr[t]] > 0 ? tfTmp[nbr[t]] : -0.05;
      lakeDraw[i] = 0.4 * tfTmp[i] + 0.6 * s / (e - o);
    }
  }
  lines = traceBoundaries(tec);
  rivers = traceRivers(grid, land);
  seaDrawn = tec.seaLevel;
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

// ── The season, snow and ice ──
// Below a few years a second the globe shows the season at the planet's
// clock; above a few tens it shows the year's average (the share of it under
// snow or ice). Between, it blends.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let seasonDrawn = -1, seasonWeightDrawn = -1, climateVersionDrawn = -1, iceFrame = 0;
function refreshClimate(force) {
  const tau = ((P.years % 1) + 1) % 1;
  const sw = 1 - smooth(0.6, 1.6, Math.log10(rate()));
  const moved = Math.abs(tau - seasonDrawn) > 1 / 240 || Math.abs(sw - seasonWeightDrawn) > 0.02;
  const iceTick = playing && ++iceFrame % 6 === 0;
  if (!force && !moved && !iceTick && climate.version === climateVersionDrawn) return;
  const L = CLIMATE.LAPSE;
  for (let i = 0; i < grid.n; i++) {
    let cold = climate.snowAnn[i];
    if (sw > 0.001) {
      const T = climate.tAt(i, tau);
      const now = climate.landMask[i] ? smooth(-1, 5, -(T - L * climate.elevPos[i])) : smooth(1.5, 6, -T);
      cold = sw * now + (1 - sw) * cold;
    }
    // Land newly dry or drowned since the climate last saw it takes no snow or ice.
    if ((elevRel[i] > 0) !== (climate.landMask[i] === 1) && !(ice.H[i] > 0)) cold = 0;
    climDraw[4 * i] = cold;
    climDraw[4 * i + 1] = climate.Tf[0][i] + P.ocean.sst[i];
    climDraw[4 * i + 2] = P.ocean.psi[i] / 1e6;
    climDraw[4 * i + 3] = ice.H[i];
  }
  seasonDrawn = tau; seasonWeightDrawn = sw;
  if (globe) {
    globe.setClimate(climDraw);
    globe.setIce(ice.vel);
    if (climate.version !== climateVersionDrawn) globe.setZones(climate.zones);
  }
  if (climate.version !== climateVersionDrawn) figuresDirty = true;
  climateVersionDrawn = climate.version;
  drawDirty = true;
}

// ── The weather ──
// Runs only while its view is shown. It starts from the climate at the
// season, spins up for ~12 days, then steps in real time within a budget; when
// the dial outruns it the chart crossfades to the climate's mean (the
// template's pressure and the mean rain), which is what weather averages to.
let wxBehind = 0, wxSeason = -1, wxVersion = -1, wxLive = 0, chart = null, lastChart = 0, lastWxDraw = 0;
const wxTmp = new Float64Array(grid.n);
function smoothFine(f, passes) {
  const nbrOff = grid.nbrOff, nbr = grid.nbr;
  for (let p = 0; p < passes; p++) {
    wxTmp.set(f);
    for (let i = 0; i < grid.n; i++) {
      let s = 0;
      const o = nbrOff[i], e = nbrOff[i + 1];
      for (let t = o; t < e; t++) s += wxTmp[nbr[t]];
      f[i] = 0.4 * wxTmp[i] + 0.6 * s / (e - o);
    }
  }
}
const wxP = new Float64Array(grid.n);
function weatherLive() {
  // Fully live below ~3 days a second, the climate's mean above ~30.
  return 1 - smooth(Math.log10(3 / 365.25), Math.log10(30 / 365.25), Math.log10(rate()));
}
function stepWeather(advYears, now) {
  if (climate.stats.cycles < 2) return;     // the weather starts from a warm climate
  const tau = ((P.years % 1) + 1) % 1;
  if (!wx.started) { wx.start(tau); wxSeason = tau; wxVersion = climate.version; }
  if (Math.abs(tau - wxSeason) > 1 / 120 || climate.version !== wxVersion) { wx.forcing(tau); wxSeason = tau; wxVersion = climate.version; }
  const t0 = performance.now();
  if (wx.t < SPINUP_DAYS * 86400) {
    while (performance.now() - t0 < 24 && wx.t < SPINUP_DAYS * 86400) wx.step();
  } else {
    wxBehind = Math.min(2 * 86400, wxBehind + advYears * 3.156e7);
    while (wxBehind >= WEATHER.DT && performance.now() - t0 < WEATHER_MS) { wx.step(); wxBehind -= WEATHER.DT; }
    if (wxBehind > 86400) wxBehind = 86400;    // what it couldn't keep up with is dropped
  }
}
function refreshWeather(force) {
  const nowMs = performance.now();
  if (!force && nowMs - lastWxDraw < 100) return;
  lastWxDraw = nowMs;
  const tau = ((P.years % 1) + 1) % 1;
  const spun = wx.started ? Math.min(1, wx.t / (SPINUP_DAYS * 86400)) : 0;
  wxLive = spun >= 1 ? weatherLive() : 0;
  if (wx.started && wxLive > 0) {
    wx.eddyPressure(wxEddy);
    prolong(climate.T, wxEddy, wxFine);
    prolong(climate.T, wx.rain, wxFine2);
    prolong(climate.T, wx.theta, wxFineT);
    for (let i = 0; i < wx.n; i++) wxRH[i] = Math.min(1.2, wx.qv[i] / wsatW(wx.theta[i]));
    prolong(climate.T, wxRH, wxFineH);
  }
  // The climate's own temperature and humidity at the season, for the mean chart.
  const ph = Math.min(5, Math.max(0, Math.round(tau * 6 - 0.5))), Wc = climate.W[ph];
  // Pressure is drawn smoothed: isobars on the grid's cells would stair-step.
  for (let i = 0; i < grid.n; i++) wxP[i] = climate.presAt(i, tau) + wxLive * wxFine[i];
  smoothFine(wxP, 3);
  const L = CLIMATE.LAPSE;
  for (let i = 0; i < grid.n; i++) {
    const Tsl = climate.tAt(i, tau), lapse = L * climate.elevPos[i];
    wxDraw[4 * i] = wxP[i];
    wxDraw[4 * i + 1] = (1 - wxLive) * climate.pAt(i, tau) + wxLive * wxFine2[i];
    wxDraw[4 * i + 2] = (1 - wxLive) * Tsl + wxLive * wxFineT[i] - lapse;
    wxDraw[4 * i + 3] = Math.min(1, (1 - wxLive) * Wc[i] / wsatW(Tsl - lapse) + wxLive * wxFineH[i]);
  }
  if (globe) globe.setWeather(wxDraw);
  const now = performance.now();
  if (wxLive > 0 && now - lastChart > 250) {
    lastChart = now;
    const pc = new Float64Array(wx.n);
    for (let i = 0; i < wx.n; i++) pc[i] = 0;
    // The chart's highs and lows on the coarse grid: the template's belts plus the storms.
    const T = climate.T;
    for (let i = 0; i < wx.n; i++) pc[i] = climate.presAt(i, tau) + wxEddy[i];   // coarse cells are the fine grid's first
    chart = chartLines(wx, pc);
  }
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
els.dial.addEventListener('input', () => { syncDial(); caption(true); figuresDirty = true; });
syncDial();
function setDial(v) { els.dial.value = String(v); syncDial(); }

// ── The view ──
// ── The key ──
function drawTheKey() { if (!els.key.hidden) drawKey(els.keyCanvas, view === 'weather' ? `weather-${wxMode}` : view, palette()); }
function setWxMode(m) {
  wxMode = m;
  for (const b of els.wxBtns) b.setAttribute('aria-checked', b.dataset.wx === m ? 'true' : 'false');
  drawTheKey();
  drawDirty = true;
  caption(true);
}
for (const b of els.wxBtns) b.addEventListener('click', () => setWxMode(b.dataset.wx));
function setKey(on) {
  els.key.hidden = !on;
  els.keyBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  drawTheKey();
}
els.keyBtn.addEventListener('click', () => setKey(els.key.hidden));
setKey(window.innerWidth > 860);

function setView(v) {
  view = v;
  els.wxPicker.hidden = v !== 'weather';
  drawTheKey();
  if (v === 'weather') { refreshWeather(true); }
  for (const b of els.views) b.setAttribute('aria-checked', b.dataset.view === v ? 'true' : 'false');
  drawDirty = true;
  caption(true);
}
for (const b of els.views) b.addEventListener('click', () => setView(b.dataset.view));

// ── Experiments: each one knob, a measured number in the caption ──
const BASE = { K_SLAB: PARAMS.K_SLAB, K_RIDGE: PARAMS.K_RIDGE, V_MAX: PARAMS.V_MAX };
const pct = v => `${Math.round(v)}%`;
const EXPERIMENTS = [
  { id: 'earth', name: 'Earth-like', dial: 6, view: 'relief' },
  { id: 'snowball', name: 'Snowball', dial: 4, view: 'relief',
    setup: () => { CARBON.FIXED = Math.round(carbon.pco2); },
    knob: { label: 'Sunlight', min: 82, max: 106, step: 0.5, value: 100, fmt: v => `${(+v).toFixed(1)}%`, apply: v => { CLIMATE.S = S0 * v / 100; } } },
  { id: 'iceages', name: 'Ice ages', dial: 4, view: 'relief',
    knob: { label: 'CO₂', min: 150, max: 450, step: 5, value: 220, fmt: v => `${v} ppm`, apply: v => { CARBON.FIXED = +v; } } },
  { id: 'highstand', name: 'High stand', dial: 6, view: 'relief',
    knob: { label: 'Mantle heat', min: 0.5, max: 2, step: 0.05, value: 1.6, fmt: v => `${(+v).toFixed(2)}×`, apply: v => { PARAMS.K_SLAB = BASE.K_SLAB * v; PARAMS.K_RIDGE = BASE.K_RIDGE * v; PARAMS.V_MAX = BASE.V_MAX * Math.sqrt(v); } } },
  { id: 'thermostat', name: 'Thermostat', dial: 5, view: 'climate',
    knob: { label: 'Outgassing', min: 0.25, max: 4, step: 0.05, value: 2, fmt: v => `${(+v).toFixed(2)}×`, apply: v => { CARBON.OUTGAS = +v; } } },
];
let experiment = EXPERIMENTS[0];
// Each experiment starts from the planet's opening (a snowball can't be undone
// by turning the sun back up: that's the point of it), so choosing one reloads
// with ?exp=; the knob then acts live.
function chooseExperiment(id) {
  if (id === experiment.id) return;
  const q = new URLSearchParams(location.search);
  if (id === 'earth') q.delete('exp'); else q.set('exp', id);
  location.search = q.toString();
}
function defaults() {
  CLIMATE.S = S0; CARBON.FIXED = 0; CARBON.OUTGAS = 1;
  Object.assign(PARAMS, BASE);
}
function setExperiment(id) {
  experiment = EXPERIMENTS.find(e => e.id === id) || EXPERIMENTS[0];
  defaults();
  if (experiment.setup) experiment.setup();
  const k = experiment.knob;
  els.knob.hidden = !k;
  if (k) {
    els.knobLabel.textContent = k.label;
    Object.assign(els.knobInput, { min: k.min, max: k.max, step: k.step });
    els.knobInput.value = String(k.value);
    els.knobOut.textContent = k.fmt(k.value);
    k.apply(k.value);
  }
  setDial(experiment.dial);
  setView(experiment.view);
  for (const b of els.experiments.querySelectorAll('.exp-btn')) b.setAttribute('aria-pressed', b.dataset.exp === experiment.id ? 'true' : 'false');
  climatePending = Math.max(climatePending, 2);
  setPlaying(true);
  caption(true);
}
els.knobInput.addEventListener('input', () => {
  const k = experiment.knob;
  if (!k) return;
  els.knobOut.textContent = k.fmt(els.knobInput.value);
  k.apply(+els.knobInput.value);
  climatePending = Math.max(climatePending, 2);
  caption(true);
});
for (const e of EXPERIMENTS) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.className = 'exp-btn'; b.dataset.exp = e.id; b.setAttribute('aria-pressed', e.id === 'earth' ? 'true' : 'false');
  b.innerHTML = `<span>${e.name}</span><span class="exp-knob">${e.knob ? e.knob.label : ''}</span>`;
  b.addEventListener('click', () => chooseExperiment(e.id));
  li.appendChild(b);
  els.experiments.appendChild(li);
}

/** The ice's dominant period (kyr) in the record, by periodogram over 15–150 kyr. */
function icePeriod() {
  const { t, v } = P.record.window(4e5);
  const n = t.length;
  if (n < 60 || t[n - 1] - t[0] < 1.5e5) return null;
  const x = v[3];
  let mean = 0; for (let k = 0; k < n; k++) mean += x[k]; mean /= n;
  let best = 0, bp = null;
  for (let p = 15; p <= 150; p += 1) {
    let a = 0, b = 0;
    for (let k = 0; k < n; k++) { const th = 2 * Math.PI * t[k] / (p * 1000); a += (x[k] - mean) * Math.cos(th); b += (x[k] - mean) * Math.sin(th); }
    const pw = a * a + b * b;
    if (pw > best) { best = pw; bp = p; }
  }
  return bp;
}

// ── Captions: the view's name and live values ──
const setCaption = window._colophon ? window._colophon.caption(els.caption, 250) : t => { els.caption.textContent = t; };
let lastCaption = 0;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function dateOf(tau) {
  const day = ((tau * 365.2422 + 78.5) % 365.2422 + 365.2422) % 365.2422;
  const ends = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365.25];
  let m = 0;
  while (m < 11 && day >= ends[m]) m++;
  const d = Math.floor(day - (m ? ends[m - 1] : 0)) + 1, h = Math.floor((day % 1) * 24);
  return `${d} ${MONTHS[m]}, ${String(h).padStart(2, '0')}:00`;
}
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
  const parts = [view === 'climate' ? 'Climate' : view === 'weather' ? `Weather, ${wxMode}` : 'Relief', formatTime(P.years)];
  if (rate() < 300) parts.push(rate() < 0.05 ? dateOf(((P.years % 1) + 1) % 1) : monthName(((P.years % 1) + 1) % 1));
  if (view === 'weather') {
    const spun = wx.started ? Math.min(1, wx.t / (SPINUP_DAYS * 86400)) : 0;
    if (spun < 1 && wx.started) parts.push('spinning up');
    else if (wxLive > 0.5 && chart) {
      const nf = chart.fronts.length, nd = chart.dry.length;
      parts.push(`${chart.lows.length} lows`, `${chart.highs.length} highs`, `${nf} ${nf === 1 ? 'front' : 'fronts'}`, `${nd} dry ${nd === 1 ? 'line' : 'lines'}`, `wind to ${Math.round(wx.stats.maxWind)} m/s`);
    } else parts.push('the climate’s mean pressure and rain');
    setCaption(parts.join(' · '), true);
    return;
  }
  // The experiment's measured number.
  const cs = climate.stats;
  if (experiment.id === 'snowball') parts.push(`ice line ${Math.round(cs.iceLat)}°`);
  if (experiment.id === 'iceages') { const p = icePeriod(); parts.push(`ice ${Math.round(ice.stats.seaLevel)} m of sea`, p ? `period ${p} kyr` : 'period —'); }
  if (experiment.id === 'thermostat') parts.push(`CO₂ ${Math.round(carbon.pco2)} ppm`, `balance ${Math.round(carbon.equilibrium(carbon.flux.out))} ppm`);
  if (view === 'climate') {
    const sh = zoneShares();
    const g = [[0, 4], [4, 6], [6, 9], [9, 12], [12, 14]].map(([a, b]) => { let v = 0; for (let k = a; k < b; k++) v += sh[k]; return Math.round(100 * v); });
    parts.push(`mean ${cs.meanT.toFixed(1)} °C`);
    if (experiment.id !== 'thermostat') parts.push(`CO₂ ${Math.round(carbon.pco2)} ppm`);
    parts.push(`rain ${Math.round(cs.meanP || 0)} mm/yr`);
    if (experiment.id !== 'snowball') parts.push(`ice line ${Math.round(cs.iceLat)}°`);
    parts.push(`A ${g[0]}% · B ${g[1]}% · C ${g[2]}% · D ${g[3]}% · E ${g[4]}% of land`);
  } else {
    const s = tec.stats();
    parts.push(`${s.plates} plates`, `land ${Math.round(100 * s.land)}%`, `sea level ${signed(Math.round((s.seaLevel - P.seaLevel0) * 1000), 'm')}`);
    if (experiment.id !== 'iceages') parts.push(`ice ${Math.round(ice.stats.seaLevel)} m`);
    parts.push(`fastest ${s.fastest.toFixed(1)} cm/yr`, `seafloor ${Math.round(s.meanOceanAge)} Myr`, polarity.at(tec.t) > 0 ? 'field normal' : 'field reversed');
  }
  setCaption(parts.join(' · '), true);
}

// ── Fig. 7: the model, with its live fluxes ──
function modelSnapshot() {
  const cs = climate.stats, z = climate.zonal, cf = carbon.flux, st = tec.stats();
  let snow = 0, iceArea = 0, run = 0, la = 0, hiLand = 0, sstLo = 0, sstHi = 0, bShare = 0;
  for (let i = 0; i < grid.n; i++) {
    const a = areaM2[i];
    if (ice.H[i] > 0 && ice.M[i] > 0) snow += ice.M[i] * a;
    if (ice.H[i] > 20) iceArea += a;
    if (climate.landMask[i]) { run += climate.runoff[i] * a; la += a; bShare += a * (climate.zones[NZ * i + 4] + climate.zones[NZ * i + 5]); }
    hiLand = Math.max(hiLand, tec.elev[i] - tec.seaLevel);
    if (P.ocean.sea[i]) { sstLo = Math.min(sstLo, P.ocean.sst[i]); sstHi = Math.max(sstHi, P.ocean.sst[i]); }
  }
  const dT = z ? z.T[45] - 0.5 * (z.T[15] + z.T[75]) : 40;
  const forcing = 5.35 * Math.log(carbon.pco2 / CARBON.PCO2_0);
  const s65 = P.orbit.summer65(P.years / 1000);
  const wRel = carbon.wF0 > 0 ? carbon.wF / carbon.wF0 : 1;
  const fmt = (v, d = 2) => v.toFixed(d);
  const sea = Math.round((tec.seaLevel - P.seaLevel0) * 1000);
  return {
    values: {
      climate: `${cs.meanT.toFixed(1)} °C`, carbon: `${Math.round(carbon.pco2)} ppm`, ice: `${(ice.stats.volume / 1e15).toFixed(1)} M km³`,
      sea: `${sea > 0 ? '+' : sea < 0 ? '−' : ''}${Math.abs(sea)} m`, plates: `${st.plates} plates`, plumes: `${plumes.hot.length} hotspots`,
      ocean: `${P.ocean.stats.maxSv.toFixed(0)} Sv`, weather: wx.started && chart ? `${chart.lows.length} lows` : 'idle',
      orbit: `tilt ${(P.orbit.at(P.years / 1000).obliquity * 180 / Math.PI).toFixed(1)}°`,
      landscape: `${land.flux.eroded.toFixed(1)} km³/yr`, zones: `B ${Math.round(100 * bShare / (la || 1))}%`,
    },
    edges: [
      { from: 'orbit', to: 'climate', w: (s65 - 420) / 120, label: `${Math.round(s65)} W/m²`, bend: -0.1 },
      { from: 'climate', to: 'weather', w: dT / 45, label: `${Math.round(dT)} K` },
      { from: 'climate', to: 'ocean', w: P.ocean.stats.maxSv / 30, label: 'wind' },
      { from: 'ocean', to: 'climate', w: (sstHi - sstLo) / 12, label: `±${Math.round(Math.max(-sstLo, sstHi))} K` },
      { from: 'climate', to: 'zones', w: 0.5 },
      { from: 'zones', to: 'climate', w: bShare / (la || 1) / 0.6, label: 'albedo' },
      { from: 'climate', to: 'ice', w: snow / 1e9 / 4000, label: `${Math.round(snow / 1e9)} km³/yr` },
      { from: 'ice', to: 'climate', w: iceArea / 1e12 / 20, label: 'albedo' },
      { from: 'ice', to: 'sea', w: ice.stats.seaLevel / 100, label: `−${Math.round(ice.stats.seaLevel)} m` },
      { from: 'climate', to: 'landscape', w: run / (la || 1) / 0.5, label: `${Math.round(1000 * run / (la || 1))} mm/yr` },
      { from: 'landscape', to: 'sea', w: land.flux.toSea / 6, label: `${land.flux.toSea.toFixed(1)} km³/yr`, bend: 0.08 },
      { from: 'climate', to: 'carbon', w: cf.weather / 0.2, label: `${fmt(cf.weather, 3)} Pg/yr` },
      { from: 'carbon', to: 'climate', w: Math.abs(forcing) / 6, label: `${forcing >= 0 ? '+' : '−'}${Math.abs(forcing).toFixed(1)} W/m²` },
      { from: 'plates', to: 'carbon', w: cf.out / 0.2, label: `${fmt(cf.out - cf.lip, 3)} Pg/yr`, red: true },
      { from: 'plumes', to: 'carbon', w: cf.lip / 0.5, label: cf.lip > 0.001 ? `${fmt(cf.lip, 3)} Pg/yr` : '', red: true, bend: 0 },
      { from: 'plates', to: 'landscape', w: hiLand / 6, label: `${hiLand.toFixed(1)} km`, bend: 0 },
      { from: 'plates', to: 'sea', w: 60 / Math.max(20, st.meanOceanAge), label: `${Math.round(st.meanOceanAge)} Myr` },
      { from: 'plumes', to: 'plates', w: 0.3, bend: 0 },
      { from: 'zones', to: 'carbon', w: wRel / 2, label: `${wRel.toFixed(2)}×`, bend: 0 },
      { from: 'landscape', to: 'carbon', w: (cf.burial || 0) / 0.04, label: `buried ${(cf.burial || 0).toFixed(3)}` },
    ],
  };
}

// ── The margin's figures ──
let lastFigures = 0;
const visible = el => el && el.offsetParent !== null && el.clientWidth > 0;
function recordSpan() { return Math.min(4e8, Math.max(40, rate() * RECORD_SECONDS)); }
function figures(force) {
  const now = performance.now();
  if (!force && now - lastFigures < 400) return;
  lastFigures = now; figuresDirty = false;
  const pal = palette();
  if (visible(els.figRecord)) {
    const span = recordSpan();
    drawRecord(els.figRecord, P.record, P.years, span, pal);
    els.capRecord.textContent = `The record · the last ${formatTime(span).replace(/\.0 /, ' ')}`;
  }
  if (visible(els.figOrbit)) {
    drawOrbit(els.figOrbit, P.orbit, P.years / 1000, pal);
    const o = P.orbit.at(P.years / 1000);
    els.capOrbit.textContent = `The orbit · tilt ${(o.obliquity * 180 / Math.PI).toFixed(1)}° · eccentricity ${o.eMean.toFixed(3)}`;
  }
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
  if (visible(els.figModel)) {
    drawModel(els.figModel, modelSnapshot(), pal);
    const cf = carbon.flux;
    els.capModel.textContent = `The model · outgassing ${cf.out.toFixed(3)} and weathering ${cf.weather.toFixed(3)} Pg C/yr · erosion ${land.flux.eroded.toFixed(1)} km³/yr`;
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
function stepPlates(dt) {
  P.plateStep(dt);
  climatePending = Math.max(climatePending, 1);
  surfaceDirty = true;
}
function stepOnce() {
  setPlaying(false);
  P.years += PLATE_STEP;
  stepPlates(PLATE_STEP);
}
function nudgeDial(d) {
  setDial(Math.min(+els.dial.max, Math.max(+els.dial.min, +els.dial.value + d)));
  caption(true);
}

window.addEventListener('DOMContentLoaded', () => {
  if (window._colophon) {
    colophon = window._colophon.mount({
      themeKey: 'isochron-theme',
      playing,
      onPlay: () => { setPlaying(!playing); return playing; },
      onStep: () => stepOnce(),
      onTheme: () => { drawDirty = true; figuresDirty = true; requestAnimationFrame(() => { figures(true); drawTheKey(); }); },
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
    { key: '3', group: 'View', label: 'Weather', action: () => setView('weather') },
    { key: 'k', group: 'View', label: 'Key', action: () => setKey(els.key.hidden) },
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
        'Rivers cut the mountains and carry them to the sea. The climate follows the geography and the orbit: seasons, winds, rain, ice sheets, ' +
        'and a carbon cycle in which volcanoes supply CO₂ and the weathering of rock takes it back.',
      controls: [
        { label: 'Turn the globe', value: 'Drag' },
        { label: 'Zoom', value: 'Scroll, pinch, or = - 0' },
        { label: 'Rate', value: 'The dial, or [ and ]' },
        { label: 'View', value: 'Relief, Climate or Weather, or 1, 2, 3' },
        { label: 'Experiments', value: 'The margin; each has one knob' },
      ],
      shortcuts,
      repo: 'https://github.com/a9lim/a9lim.github.io',
      lastUpdated: '2026-11-14',
    });
  }
  if (typeof _loadTextFonts === 'function') _loadTextFonts().then(() => { drawDirty = true; figures(true); drawTheKey(); });
});

// ── The loop ──
let last = performance.now(), lastSeaCheck = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing) {
    const { dt: adv, plan } = scheduler.advance(rate() * dt);
    P.years += adv;
    const p = plan[0];
    for (let s = 0; s < p.steps; s++) stepPlates(p.step);
    // The orbit the climate sees, averaged over what the dial passes in ~2 s.
    P.setOrbit(rate() * 2);
    P.fast(adv, ICE_MS);
    P.record.push(P.years, P.sample());
    if (view === 'weather') stepWeather(adv, now);
    // Ice moves the sea; redraw the coast when it has moved a few metres.
    if (now - lastSeaCheck > 250) { lastSeaCheck = now; if (Math.abs(tec.seaLevel - seaDrawn) > 0.004) surfaceDirty = true; }
    figuresDirty = true;
  }
  if (surfaceDirty) { refreshSurface(); surfaceDirty = false; drawDirty = true; climateDirty = true; caption(false); }
  if ((playing || climatePending > 0) && P.climateWork(CLIMATE_MS)) { climatePending = Math.max(0, climatePending - 1); climateDirty = true; }
  if (climateDirty || playing) { refreshClimate(climateDirty); climateDirty = false; }
  if (view === 'weather' && (playing || !wx.started || wx.t < SPINUP_DAYS * 86400)) { if (!playing) stepWeather(0, now); refreshWeather(); }
  if (playing) caption(false);
  if (figuresDirty) figures(false);
  if (drawDirty && globe && !globe.lost) {
    const pal = palette();
    const pl = { hot: plumes.hot.map(h => h.p), lips: plumes.active().map(L => ({ p: L.p, age: tec.t - L.t0, radius: PLUMES.LIP_R })) };
    globe.draw(camera, tec.t, pal, { view, wx: wxMode });
    drawOverlay(octx, cssW, cssH, dpr, camera, { boundaries: lines, rivers, plumes: pl, view, chart, chartFade: wxLive }, pal);
    drawDirty = false;
  }
  requestAnimationFrame(frame);
}

if (query.get('exp')) setExperiment(query.get('exp'));

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

window.__isochron = { P, grid, tec, land, climate, ice, carbon, plumes, wx, polarity, camera, scheduler, setPlaying, setView, setExperiment, get chart() { return chart; } };
