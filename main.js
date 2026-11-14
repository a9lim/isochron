// Isochron: an Earth-like planet on one globe (docs/PLAN.md). The planet runs
// on its own thread (src/engine/worker.js): it boots a seeded planet, spins it
// up so it opens in motion, and steps it as this page's clock asks (plates,
// plumes and landscape in banked steps; carbon and ice each frame; the
// climate's cycles in between), posting back what is drawn. This thread keeps
// the clock and the dial, runs the weather on the GPU (src/gpu/weather.js),
// and draws: the globe blends each step's surface into the next, and the
// lines turn with their plates.
//
// Globals from the shared layer: _PALETTE, _themePalette, _colophon,
// initAboutPanel, initShortcuts, _loadTextFonts.
import { buildGrid } from './src/grid/icosphere.js';
import { Record } from './src/engine/record.js';
import { ClimateView } from './src/engine/mirror.js';
import { OrbitCycles } from './src/engine/orbit.js';
import { PARAMS } from './src/engine/plates.js';
import { CLIMATE, NZ } from './src/engine/climate.js';
import { CARBON } from './src/engine/carbon.js';
import { Polarity } from './src/engine/polarity.js';
import { monthName, S0 } from './src/engine/orbit.js';
import { Scheduler, formatRate, formatTime } from './src/clock.js';
import { Orbit } from './src/render/camera.js';
import { createGlobe } from './src/render/globe.js';
import { drawOverlay, turned, morphed, matchLines } from './src/render/overlay.js';
import { traceBoundaries } from './src/render/lines.js';
import { traceRivers } from './src/render/rivers.js';
import { drawZonal, drawHypsometry, drawPolarity, drawZoneKey, drawRecord, drawOrbit, drawModel } from './src/render/figures.js';
import { gpuDevice } from './src/gpu/device.js';
import { GpuWeather, weatherForcing } from './src/gpu/weather.js';
import { GpuSeason } from './src/gpu/season.js';
import { drawKey } from './src/render/key.js';

const POL_DT = 0.02;          // Myr per polarity-table entry
const POL_SPAN = 420;         // Myr the table covers
const PLATE_STEP = 5e5;       // years: the largest plate step (a tenth of a second's worth, down to 50 kyr)
const WEATHER_GPU_MS = 12;    // the weather's share of the GPU's frame, when it runs live
const MESH_LEVEL = 7;         // the drawn mesh and the weather: a level finer than the engine's grid (55 km)
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
// Mirrors of the engine's state, as of its last snapshots (src/engine/mirror.js).
const grid = buildGrid(6);
const mesh = buildGrid(MESH_LEVEL);
const engine = new Worker(new URL('./src/engine/worker.js', import.meta.url), { type: 'module' });
let tecStats = { plates: 0, land: 0, seaLevel: 0, fastest: 0, meanOceanAge: 0 };
const tec = { grid, t: 0, seaLevel: 0, elev: new Float32Array(grid.n), plates: [], stats: () => tecStats };
const climate = new ClimateView(grid);
const ice = { H: new Float32Array(grid.n), vel: null, stats: { seaLevel: 0, volume: 0 } };
const carbon = { pco2: 280, flux: { out: 0, weather: 0, lip: 0, burial: 0, oxid: 0 }, wF: 0, wF0: 0, balance: 280 };
const land = { flux: { eroded: 0, toSea: 0 } };
const plumes = { hot: [], lips: [] };
const P = { years: 0, seaLevel0: 0, landBank: 0, record: new Record(), orbit: new OrbitCycles(seed), agg: null, get ocean() { return climate.ocean; } };
let wx = null;                     // the weather, on the GPU (src/gpu/weather.js), once there is a device
const polarity = new Polarity(seed);
const scheduler = new Scheduler([{ name: 'plates', step: PLATE_STEP, budget: 4 }]);
const camera = new Orbit();

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let playing = !reducedMotion;
let view = 'relief';
let wxMode = 'pressure';            // the Weather view's chart: pressure, temperature or humidity
let globe = null;
let drawDirty = true, climateDirty = true, figuresDirty = true;
let lines = null, rivers = null;
let elevRel = new Float32Array(grid.n);
const wxForc = new Float32Array(4 * grid.n), wxMean = new Float32Array(4 * grid.n);
const wsatW = T => 25 * Math.exp(0.065 * (Math.max(-45, Math.min(45, T)) - 15));

function palette() {
  const T = _themePalette();
  const dark = document.documentElement.dataset.theme === 'dark';
  // Tint floor and span for the sea's depth and the land's height. On the dark
  // ground the land takes more ink, so it stays lighter than the sea in both themes.
  const tint = dark ? [0.14, 0.26, 0.50, 0.25] : [0.18, 0.36, 0.24, 0.34];
  return { canvas: T.canvas, text: T.text, accent: T.accent, ocean: T.ocean, land: T.land, muted: T.textMuted, inks: T.inks, tint, dark };
}

// ── The surface, as the engine posts it ──
// Each step's surface arrives a little after the dial passed it, and is shown
// blended in from the last over about as long as the next takes to come.
let stepYears = PLATE_STEP, stepArrive = -1e9, stepSpan = 100, riversT = 0, linesT = 0, riversGone = [], surfaceMsg = null;
function onSurface(m) {
  surfaceMsg = m;
  tec.t = m.t; tec.seaLevel = m.seaLevel; tec.elev = m.elev; tec.plates = m.plates; tecStats = m.stats;
  P.landBank = m.landBank;
  elevRel = m.elevRel;
  if (m.fromStep) {
    const now = performance.now(), gap = now - stepArrive;
    stepYears = m.stepYears;
    // The blend lasts as long as the dial takes to pass the step, or as long as steps are taking to come.
    stepSpan = Math.max(16, Math.min(1000, Math.max(1000 * stepYears / rate(), gap < 2000 ? 0.9 * gap : 0)));
    if (stepOnceAt > now - 500) stepSpan = 1;
    stepArrive = now;
  }
  // Each new line remembers its predecessor (and when that was traced), to morph from.
  const oldLines = lines, oldT = linesT;
  lines = m.lines;
  linesT = tec.t;
  matchLines(oldLines, lines, l => l.left < l.right ? `${l.left},${l.right}` : `${l.right},${l.left}`);
  for (const l of lines) {
    if (m.fromStep) { l.prevT = oldT; continue; }
    // Retraced without a step (the sea moved; boundaries don't care): the same line,
    // so it carries on morphing from its predecessor's predecessor.
    const q = l.prev;
    if (q && q.P.length === l.P.length) { l.prev = q.prev; l.corr = q.corr; l.prevT = q.prevT; }
    else { l.prev = null; l.corr = null; }
  }
  if (m.rivers) {
    const old = rivers, oldRT = riversT;
    rivers = m.rivers; riversT = tec.t;
    riversGone = matchLines(old, rivers, r => r.plate, true);
    for (const r of rivers) r.prevT = oldRT;
    for (const r of riversGone) r.goneT = oldRT;
  }
  figuresDirty = true; drawDirty = true; climateDirty = true;
  caption(false);
  if (globe) uploadSurface(m);
}
function onFast(m) {
  for (let k = 0; k < m.samples.length; k += 7) P.record.push(m.samples[k], m.samples.subarray(k + 1, k + 7));
  ice.H = m.iceH; ice.vel = m.iceVel; ice.stats = m.iceStats;
  Object.assign(carbon, m.carbon);
  land.flux = m.landFlux;
  plumes.hot = m.plumes.hot; plumes.lips = m.plumes.lips;
  if (m.agg) P.agg = m.agg;
  if (globe) { globe.setIce(ice.vel); season.setIce(ice.H); climateDirty = true; }
  if (!playing) drawDirty = true;
}
function uploadSurface(m) {
  const T0 = globe.polarityOrigin;
  if (!polarityReady || tec.t > T0 + POL_SPAN - 10) {
    const origin = tec.t - (POL_SPAN - 60);
    globe.setPolarity(polarity.table(origin, POL_DT, Math.ceil(POL_SPAN / POL_DT)), origin, POL_DT);
    polarityReady = true;
  }
  globe.setFields(m.elevRel, m.tfDraw, m.felsic, m.lakeDraw, m.normals, m.fromStep);
  season.setSurface(m.elevRel);
}
let polarityReady = false;

// ── The season, snow and ice ──
// Below a few years a second the globe shows the season at the planet's
// clock; above a few tens it shows the year's average (the share of it under
// snow or ice). Between, it blends.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let seasonDrawn = -1, seasonWeightDrawn = -1, climateVersionDrawn = -1, coldEaseStart = -1e9, season = null;
function refreshClimate(force) {
  if (!season) return;
  const tau = ((P.years % 1) + 1) % 1, nowMs = performance.now();
  const sw = 1 - smooth(0.6, 1.6, Math.log10(rate()));
  const moved = Math.abs(tau - seasonDrawn) > 1 / 240 || Math.abs(sw - seasonWeightDrawn) > 0.02;
  const easing = nowMs - coldEaseStart < 900;
  if (!force && !moved && !easing && climate.version === climateVersionDrawn) return;
  if (climate.version !== climateVersionDrawn) {
    season.setClimate(climate);
    if (climateVersionDrawn >= 0) coldEaseStart = nowMs;
    globe.setZones(climate.zones);
    figuresDirty = true;
    climateVersionDrawn = climate.version;
  }
  season.draw(tau, sw, CLIMATE.LAPSE, smooth(0, 1, (nowMs - coldEaseStart) / 800));
  globe.refineClimate();
  seasonDrawn = tau; seasonWeightDrawn = sw;
  drawDirty = true;
}

// ── The weather ──
// Runs on the GPU (src/gpu/weather.js) only while its view is shown. It
// starts from the climate at the season, spins up for ~12 days, then steps
// with the dial within a share of the GPU's frame; when the dial outruns it
// the globe crossfades to the climate's mean (the template's pressure and the
// mean rain), which is what weather averages to. A kernel writes the globe's
// weather fields each frame; the chart is read back and traced in a worker.
let wxBehind = 0, wxSeason = -1, wxVersion = -1, wxLive = 0, chart = null, lastChart = 0, lastMean = -1e9, chartBusy = false;
const SPINUP = SPINUP_DAYS * 86400;
const chartWorker = new Worker(new URL('./src/render/chart-worker.js', import.meta.url), { type: 'module' });
chartWorker.postMessage({ type: 'init', level: MESH_LEVEL, chartLevel: grid.level });
chartWorker.onmessage = e => { chart = e.data; chartBusy = false; drawDirty = true; };
chartWorker.onerror = e => { console.warn('[isochron] chart:', e.message); chartBusy = false; };
function weatherLive() {
  // Fully live below ~3 days a second, the climate's mean above ~30.
  return 1 - smooth(Math.log10(3 / 365.25), Math.log10(30 / 365.25), Math.log10(rate()));
}
function wxForcing(tau) {
  if (Math.abs(tau - wxSeason) <= 1 / 120 && climate.version === wxVersion) return;
  wx.setForcing(wxForc, weatherForcing(climate, tau, wxForc));
  wxSeason = tau; wxVersion = climate.version;
}
function stepWeather(advYears) {
  if (!wx || climate.stats.cycles < 2) return;     // the weather starts from a warm climate
  const tau = ((P.years % 1) + 1) % 1;
  wxForcing(tau);
  if (!wx.started) { wx.start(); wxBehind = 0; chartWorker.postMessage({ type: 'reset' }); }
  const budget = Math.max(1, Math.floor(WEATHER_GPU_MS / Math.max(0.02, wx.msPerStep)));
  if (wx.t < SPINUP) wx.advance(Math.min(Math.ceil((SPINUP - wx.t) / wx.dt), 3 * budget));
  else {
    wxBehind = Math.min(2 * 86400, wxBehind + advYears * 3.156e7);
    const k = Math.min(Math.floor(wxBehind / wx.dt), budget);
    wx.advance(k);
    wxBehind = Math.min(86400, wxBehind - k * wx.dt);    // what it couldn't keep up with is dropped
  }
}
function refreshWeather(force) {
  if (!wx || !globe) return;
  const tau = ((P.years % 1) + 1) % 1, nowMs = performance.now();
  wxForcing(tau);
  const spun = wx.started ? Math.min(1, wx.t / SPINUP) : 0;
  wxLive = spun >= 1 ? weatherLive() : 0;
  // The climate's own pressure, rain, temperature and humidity at the season, for the blend.
  if (force || nowMs - lastMean > 100) {
    lastMean = nowMs;
    const ph = Math.min(5, Math.max(0, Math.round(tau * 6 - 0.5))), Wc = climate.W[ph], L = CLIMATE.LAPSE;
    for (let i = 0; i < grid.n; i++) {
      const Tsl = climate.tAt(i, tau);
      wxMean[4 * i] = climate.presAt(i, tau);
      wxMean[4 * i + 1] = climate.pAt(i, tau);
      wxMean[4 * i + 2] = Tsl;
      wxMean[4 * i + 3] = Wc[i] / wsatW(Tsl - L * climate.elevPos[i]);
    }
    wx.setMean(wxMean);
  }
  wx.draw(globe.wxBuffer, wxLive);
  // The chart: one read and one trace in flight at a time.
  if (wxLive > 0 && !chartBusy && nowMs - lastChart > 120) {
    lastChart = nowMs; chartBusy = true;
    wx.read().then(r => {
      if (!r) { chartBusy = false; return; }
      // A blown-up run (an experiment far outside the model's range) starts again from the climate.
      if (!r.psi2.every(Number.isFinite)) { wx.started = false; chartBusy = false; chart = null; return; }
      const pres = new Float32Array(grid.n), landF = new Float32Array(grid.n);
      for (let i = 0; i < grid.n; i++) { pres[i] = climate.presAt(i, tau); landF[i] = climate.landMask[i]; }
      chartWorker.postMessage({ type: 'chart', ...r, pres, land: landF }, [r.psi2.buffer, r.theta.buffer, r.qv.buffer, pres.buffer, landF.buffer]);
    }, () => { chartBusy = false; });
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
    setup: () => { CARBON.FIXED = 'now'; },
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
/** The experiments' parameters, as the engine's thread holds them. */
function params() {
  return { CLIMATE: { S: CLIMATE.S }, CARBON: { FIXED: CARBON.FIXED, OUTGAS: CARBON.OUTGAS }, PARAMS: { K_SLAB: PARAMS.K_SLAB, K_RIDGE: PARAMS.K_RIDGE, V_MAX: PARAMS.V_MAX } };
}
function sendParams() { if (engineStarted) engine.postMessage({ type: 'params', params: params() }); }
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
  sendParams();
  setPlaying(true);
  caption(true);
}
els.knobInput.addEventListener('input', () => {
  const k = experiment.knob;
  if (!k) return;
  els.knobOut.textContent = k.fmt(els.knobInput.value);
  k.apply(+els.knobInput.value);
  sendParams();
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
    const spun = wx && wx.started ? Math.min(1, wx.t / SPINUP) : 0;
    if (spun < 1 && wx && wx.started) parts.push('spinning up');
    else if (wxLive > 0.5 && chart) {
      const nf = chart.fronts.length, nd = chart.dry.length;
      parts.push(`${chart.lows.length} lows`, `${chart.highs.length} highs`, `${nf} ${nf === 1 ? 'front' : 'fronts'}`, `${nd} dry ${nd === 1 ? 'line' : 'lines'}`, `wind to ${Math.round(chart.maxWind || 0)} m/s`);
    } else parts.push('the climate’s mean pressure and rain');
    setCaption(parts.join(' · '), true);
    return;
  }
  // The experiment's measured number.
  const cs = climate.stats;
  if (experiment.id === 'snowball') parts.push(`ice line ${Math.round(cs.iceLat)}°`);
  if (experiment.id === 'iceages') { const p = icePeriod(); parts.push(`ice ${Math.round(ice.stats.seaLevel)} m of sea`, p ? `period ${p} kyr` : 'period —'); }
  if (experiment.id === 'thermostat') parts.push(`CO₂ ${Math.round(carbon.pco2)} ppm`, `balance ${Math.round(carbon.balance)} ppm`);
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
  const { snow, iceArea, run, la, hiLand, sstLo, sstHi, bShare } = P.agg || { snow: 0, iceArea: 0, run: 0, la: 0, hiLand: 0, sstLo: 0, sstHi: 0, bShare: 0 };
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
      ocean: `${P.ocean.stats.maxSv.toFixed(0)} Sv`, weather: wx && wx.started && chart ? `${chart.lows.length} lows` : 'idle',
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
  engine.postMessage({ type: 'play', playing: p });
}
let stepOnceAt = -1e9;
function stepOnce() {
  setPlaying(false);
  P.years += PLATE_STEP;
  stepOnceAt = performance.now();           // a single step shows at once
  engine.postMessage({ type: 'tick', adv: PLATE_STEP, steps: [PLATE_STEP], window: rate() * 2 });
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
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);     // first, so a frame that throws doesn't stop the loop
  tick(now);
}
// Where the frame's time goes, in ms (an exponential mean), for tuning: __isochron.prof.
const prof = {};
let profT = 0;
const lap = k => { const t = performance.now(); prof[k] = 0.95 * (prof[k] || 0) + 0.05 * (t - profT); profT = t; };
function tick(now) {
  // A frame's timestamp can precede the clock's start (or a driven tick's): never step backward.
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = Math.max(last, now);
  profT = performance.now();
  if (playing) {
    // Plate steps: a tenth of a second's worth of the dial, between 50 kyr and 0.5 Myr.
    scheduler.layers[0].step = Math.min(PLATE_STEP, Math.max(5e4, rate() / 10));
    const { dt: adv, plan } = scheduler.advance(rate() * dt);
    P.years += adv;
    const p = plan[0];
    // The engine's tick: the years, the plate steps, and the orbit the climate sees
    // (averaged over what the dial passes in ~2 s).
    if (engineStarted) engine.postMessage({ type: 'tick', adv, steps: Array(Math.max(0, p.steps)).fill(p.step), window: rate() * 2 });
    if (view === 'weather') stepWeather(adv);
    figuresDirty = true;
    drawDirty = true;
  }
  lap('weather');
  if (climateDirty || playing || performance.now() - coldEaseStart < 900) { refreshClimate(climateDirty); climateDirty = false; }
  lap('season');
  if (view === 'weather' && wx && (playing || !wx.started || wx.t < SPINUP)) { if (!playing) stepWeather(0); refreshWeather(); }
  if (playing) caption(false);
  lap('chart');
  if (figuresDirty) figures(false);
  lap('figures');
  if (drawDirty && globe && !globe.lost) {
    const pal = palette();
    // Between steps the globe shows the blend of the last two states, and the
    // lines turn with their plates to the same moment.
    const phi = Math.min(1, Math.max(0, (performance.now() - stepArrive) / stepSpan));
    if (phi < 1) drawDirty = true;
    const tShow = tec.t - (1 - phi) * stepYears / 1e6;
    // Each line is turned with its plates to the shown moment and morphed from its
    // predecessor's course (rivers over the landscape's own step).
    if (lines) for (const ln of lines) {
      const a = tec.plates[ln.left], b = tec.plates[ln.right];
      const w = [0.5 * (a.w[0] + b.w[0]), 0.5 * (a.w[1] + b.w[1]), 0.5 * (a.w[2] + b.w[2])];
      const cur = turned(ln.P, w, tShow - linesT);
      ln.shown = ln.prev ? morphed(turned(ln.prev.P, w, tShow - ln.prevT), cur, phi, ln.corr) : cur;
      ln.shownL = turned(ln.L, w, tShow - linesT);
    }
    if (rivers) {
      const phiL = Math.min(1, ((P.landBank || 0) + phi * stepYears) / 2.5e5);
      for (const rv of rivers) {
        const pl = tec.plates[rv.plate];
        rv.alpha = rv.prev ? 1 : phiL;           // a river with no predecessor fades in
        if (!pl || !pl.alive) { rv.shown = rv.P; continue; }
        const cur = turned(rv.P, pl.w, tShow - riversT);
        rv.shown = rv.prev ? morphed(turned(rv.prev.P, pl.w, tShow - rv.prevT), cur, phiL, rv.corr) : cur;
      }
      for (const rv of riversGone) {
        const pl = tec.plates[rv.plate];
        rv.alpha = 1 - phiL;                     // and one with no successor fades out
        rv.shown = pl && pl.alive ? turned(rv.P, pl.w, tShow - rv.goneT) : rv.P;
      }
    }
    lap('lines');
    globe.draw(camera, tShow, pal, { view, wx: wxMode, blend: phi });
    lap('globe');
    drawOverlay(octx, cssW, cssH, dpr, camera, { boundaries: lines, rivers: rivers && riversGone.length ? rivers.concat(riversGone) : rivers, plumes, view, chart, chartFade: wxLive, wxNow: wx ? wx.t : 0 }, pal);
    if (phi >= 1) drawDirty = false;
    lap('overlay');
  }
}

// ── The engine's snapshots ──
let engineStarted = false;
engine.onmessage = e => {
  const m = e.data;
  if (m.type === 'ready') {
    P.seaLevel0 = m.seaLevel0; P.years = m.years; carbon.pco2 = m.pco2;
  } else if (m.type === 'surface') onSurface(m);
  else if (m.type === 'climate') { climate.update(m); climateDirty = true; figuresDirty = true; caption(false); }
  else if (m.type === 'fast') onFast(m);
};
engine.onerror = e => console.warn('[isochron] engine:', e.message);

if (query.get('exp')) setExperiment(query.get('exp'));
engine.postMessage({ type: 'init', seed, params: params() });
engineStarted = true;
engine.postMessage({ type: 'play', playing });

gpuDevice().then(device => createGlobe(els.gpu, mesh, grid, device)).then(g => {
  globe = g;
  season = new GpuSeason(g.device, grid, g.climBuffer);
  wx = new GpuWeather(g.device, mesh, seed, g.refiner);
  if (view === 'weather') refreshWeather(true);
  if (surfaceMsg) uploadSurface(surfaceMsg);
  climateDirty = true;
  climateVersionDrawn = -1;
  caption(true);
}).catch(err => {
  console.warn('[isochron] WebGPU unavailable:', err.message);
  els.nogpu.hidden = false;
  caption(true);
});
requestAnimationFrame(frame);

window.__isochron = { P, engine, grid, tec, land, climate, ice, carbon, plumes, polarity, camera, scheduler, setPlaying, setView, setExperiment, get wx() { return wx; }, get globe() { return globe; }, tick, prof, get chart() { return chart; } };
