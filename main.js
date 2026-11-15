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
import { ClimateView, YearView } from './src/engine/mirror.js';
import { OrbitCycles } from './src/engine/orbit.js';
import { PARAMS } from './src/engine/plates.js';
import { CLIMATE, NZ } from './src/engine/climate.js';
import { CARBON } from './src/engine/carbon.js';
import { Polarity } from './src/engine/polarity.js';
import { monthName, monthAt, S0, solarLongitude } from './src/engine/orbit.js';
import { Scheduler, formatRate, formatTime } from './src/clock.js';
import { Orbit } from './src/render/camera.js';
import { createGlobe } from './src/render/globe.js';
import { drawOverlay, placeLine, capOf, capFaces, matchLines, link } from './src/render/overlay.js';
import { makeStars, ecliptic } from './src/render/sky.js';
import { shownU } from './src/render/along.js';
import { traceBoundaries } from './src/render/lines.js';
import { traceRivers } from './src/render/rivers.js';
import { drawZonal, drawHypsometry, drawPolarity, drawZoneKey, drawRecord, drawOrbit, drawModel } from './src/render/figures.js';
import { gpuDevice } from './src/gpu/device.js';
import { GpuWeather, weatherForcing } from './src/gpu/weather.js';
import { GpuSeason } from './src/gpu/season.js';
import { drawKey } from './src/render/key.js';
import { Year } from './src/engine/year.js';
import { linkCharts, chartFrame } from './src/render/chart.js';

const POL_DT = 0.02;          // Myr per polarity-table entry
const POL_SPAN = 420;         // Myr the table covers
const PLATE_STEP = 5e5;       // years: the largest plate step (a tenth of a second's worth, down to 50 kyr)
const WEATHER_GPU_MS = 12;    // the weather's share of the GPU's frame, when it runs live
// The engine's grid: 55 km (level 7), or 110 km on phones and tablets (a quarter of the work;
// ?level= overrides), and the drawn mesh and the weather's (55 km), onto which a coarser
// engine's fields are refined.
const LEVEL = Math.max(5, Math.min(7, +(new URLSearchParams(location.search).get('level') || (matchMedia('(pointer: coarse)').matches ? 6 : 7))));
const MESH_LEVEL = 7;
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
const grid = buildGrid(LEVEL);
const mesh = LEVEL < MESH_LEVEL ? buildGrid(MESH_LEVEL) : grid;
const engine = new Worker(new URL('./src/engine/worker.js', import.meta.url), { type: 'module' });
let tecStats = { plates: 0, land: 0, seaLevel: 0, fastest: 0, meanOceanAge: 0 };
const tec = { grid, t: 0, seaLevel: 0, elev: new Float32Array(grid.n), plates: [], stats: () => tecStats };
const climate = new ClimateView(grid);
const ice = { H: new Float32Array(grid.n), vel: null, stats: { seaLevel: 0, volume: 0 } };
const carbon = { pco2: 280, flux: { out: 0, weather: 0, lip: 0, burial: 0, oxid: 0 }, wF: 0, wF0: 0, balance: 280 };
const land = { flux: { eroded: 0, toSea: 0 } };
const plumes = { hot: [], lips: [] };
const year = new YearView();
const eruptionSeen = new Map();     // each eruption's key → when (ms) the page's clock passed it
const P = { years: 0, seaLevel0: 0, landBank: 0, record: new Record(), orbit: new OrbitCycles(seed), agg: null, get ocean() { return climate.ocean; } };
let wx = null;                     // the weather, on the GPU (src/gpu/weather.js), once there is a device
const polarity = new Polarity(seed);
const scheduler = new Scheduler([{ name: 'plates', step: PLATE_STEP, budget: 4 }]);
const camera = new Orbit();

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let playing = !reducedMotion;
let view = 'relief';
let wxMode = 'pressure';            // the Weather view's chart: pressure, temperature or humidity
// The Moon as the engine last reported it, and the tide's last solve (per unit equilibrium tide).
const moon = { a: 3.844e8, Omega: 7.2921e-5, omega: 1.4052e-4, P: 0, day: 23.93 };
let tide = null;
// The sky's clock: the planet's sidereal angle θ and the Moon's longitude, advanced with the
// planet's clock; the tide's phases follow from them (its bulge sits under the Moon).
const skyClock = { years: null, theta: 0, lamM: 0, thetaShown: 0 };
const stars = makeStars(seed);
let lastSky = null;
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
// Surfaces come from the engine irregularly (a landscape step makes some
// slower), so they queue, and the globe shows a moment τ that follows them
// about a step behind at the pace the engine is keeping, easing faster when it
// falls behind and slower when it gains rather than stopping. Between the two
// surfaces either side of τ the globe blends, and the lines turn with their
// plates and morph to τ.
let stepsSent = 0, stepsDone = 0, engineMsPerStep = 50, engineProf = {};
const queue = [];                   // surfaces waiting to be shown, oldest first
let shown = null, shownFrom = 0;    // the surface blended to, and the time of the one blended from (Myr)
let tau = null, engineRate = 0, pace = 0, lastArrive = -1;
const arrivals = [];               // [wall ms, model Myr] of recent surfaces, for the engine's pace
let riversT = 0, linesT = 0, riversGone = [], surfaceMsg = null;
function onSurface(m) {
  surfaceMsg = m;
  tec.seaLevel = m.seaLevel; tec.elev = m.elev; tecStats = m.stats;
  if (m.stepsDone != null) { stepsDone = m.stepsDone; engineMsPerStep = m.msPerStep; }
  if (m.fromStep) {
    // The engine's pace: Myr of surface a second over the last few seconds of arrivals
    // (they come irregularly, often in pairs, so one gap says little).
    const now = performance.now();
    arrivals.push([now, m.t]);
    while (arrivals.length > 2 && now - arrivals[0][0] > 3000) arrivals.shift();
    const [w0, t0] = arrivals[0];
    if (now - w0 > 300) engineRate = Math.min(2 * rate() / 1e6, (m.t - t0) / ((now - w0) / 1000));
    else if (!engineRate) engineRate = rate() / 1e6;
    lastArrive = now;
    queue.push(m);
    if (stepOnceAt > now - 500) { while (queue.length) advance(); tau = shown.t; }
  } else if (queue.length) {
    // The sea moved without a step: the newest waiting surface takes the new fields.
    const q = queue[queue.length - 1];
    queue[queue.length - 1] = { ...m, fromStep: true, t: q.t, stepYears: q.stepYears, rivers: m.rivers || q.rivers, riversId: m.rivers ? m.riversId : q.riversId };
  } else if (shown) {
    // Or the one shown: its fields change in place, the blend from its predecessor carries on.
    m.t = shown.t;
    show(m, 'refresh');
  } else { show(m, 'reset'); tau = m.t; shownFrom = m.t; }
  figuresDirty = true; drawDirty = true; climateDirty = true;
  caption(false);
}
/**
 * Which side stays on top, remembered: each point takes half its predecessor's value at
 * the corresponding point (negated if the plates are on the other sides), so a trench's
 * teeth change sides only when the plates' behaviour does, not with each retrace.
 */
function keepSides(ls) {
  for (const l of ls) {
    const q = l.prev, c = l.corr;
    if (!q || !c || !q.over) continue;
    const sg = q.left === l.left ? 1 : -1, m = l.over.length;
    for (let k = 0; k < m; k++) {
      const j = Math.min(q.over.length - 2, c[2 * k]), t = c[2 * k + 1];
      const v = sg * (q.over[j] + t * (q.over[j + 1] - q.over[j]));
      l.over[k] = 0.5 * l.over[k] + 0.5 * v;
      const a = q.arc[j] + t * (q.arc[j + 1] - q.arc[j]);
      l.arc[k] = 0.5 * l.arc[k] + 0.5 * a;
    }
  }
}
/** The next waiting surface becomes the one blended to. */
function advance() {
  const m = queue.shift();
  shownFrom = shown ? shown.t : m.t - m.stepYears / 1e6;
  show(m, 'step');
}
function show(m, mode) {
  const old = shown;
  shown = m;
  tec.t = m.t; tec.plates = m.plates;
  P.landBank = m.landBank;
  elevRel = m.elevRel;
  // Each new line remembers its predecessor (and when that was traced), to morph from.
  if (mode !== 'refresh' || !lines) {
    const oldLines = lines, oldT = linesT;
    lines = m.lines;
    linesT = m.t;
    matchLines(oldLines, lines, l => l.left < l.right ? `${l.left},${l.right}` : `${l.right},${l.left}`);
    for (const l of lines) l.prevT = oldT;
    keepSides(lines);
    // A line morphs from its predecessor, and a retrace without a step from that one's (below):
    // nothing further back is needed, and kept it would hold every line ever traced.
    for (const l of lines) if (l.prev) { l.prev.prev = null; l.prev.corr = null; }
  } else {
    // Retraced without a step: the same line, so it carries on morphing from its predecessor's predecessor.
    const oldLines = lines;
    lines = m.lines;
    matchLines(oldLines, lines, l => l.left < l.right ? `${l.left},${l.right}` : `${l.right},${l.left}`);
    for (const l of lines) {
      const q = l.prev;
      if (q && q.prev) { link(l, q.prev); l.prevT = q.prevT; }
      else { l.prev = null; l.corr = null; }
    }
    keepSides(lines);
  }
  for (const l of lines) capOf(l);
  if (m.rivers) {
    const oldR = rivers, oldRT = riversT;
    rivers = m.rivers; riversT = m.t; rivers.id = m.riversId;
    riversGone = matchLines(oldR, rivers, r => r.plate, true);
    for (const r of rivers) { r.prevT = oldRT; if (r.prev) { r.prev.prev = null; r.prev.corr = null; } capOf(r); }
    for (const r of riversGone) { r.goneT = oldRT; r.prev = null; r.corr = null; capOf(r); }
  }
  if (globe) uploadSurface(m, mode);
  void old;
}
/** Move τ on by dt seconds; returns the blend between the two surfaces either side of it. */
function stepTau(dt) {
  if (!shown) return 1;
  const newest = queue.length ? queue[queue.length - 1].t : shown.t;
  const step = Math.max(1e-6, shown.t - shownFrom);
  // A step and a half behind the newest while playing (room for irregular arrivals); all the
  // way when paused. The pace is the engine's, nudged by how far τ is from its aim, and eased.
  const aim = playing ? newest - 1.5 * step : newest;
  if (tau == null) tau = shownFrom;
  const want = playing ? engineRate * Math.max(0.25, Math.min(2, 1 + 0.5 * (aim - tau) / step)) : Math.max(engineRate, step / 0.4) * (aim > tau ? 1 : 0);
  // With nothing waiting, ease into the newest rather than run into it.
  const room = queue.length ? 1 : Math.min(1, Math.max(0, (shown.t - tau) / (0.5 * step)));
  pace += (want * room - pace) * (1 - Math.exp(-dt / 0.3));
  tau = playing ? tau + pace * dt : Math.min(Math.max(aim, tau), tau + pace * dt);
  while (queue.length && tau >= shown.t) advance();
  tau = Math.min(tau, shown.t);
  return Math.min(1, Math.max(0, (tau - shownFrom) / Math.max(1e-9, shown.t - shownFrom)));
}
function onFast(m) {
  for (let k = 0; k < m.samples.length; k += 8) P.record.push(m.samples[k], m.samples.subarray(k + 1, k + 8));
  ice.H = m.iceH; ice.vel = m.iceVel; ice.stats = m.iceStats;
  Object.assign(carbon, m.carbon);
  land.flux = m.landFlux;
  P.regolith = m.regolith; P.flex = m.flex;
  plumes.hot = m.plumes.hot; plumes.lips = m.plumes.lips;
  if (m.agg) P.agg = m.agg;
  if (m.life) life = m.life;
  if (m.moon) Object.assign(moon, m.moon);
  if (m.prof) engineProf = m.prof;
  if (m.year) year.stats(m.year);
  if (m.rivAnom && rivers && rivers.id === m.riversId) {
    let k = 0;
    for (const r of rivers) { const L = r.cells ? r.cells.length : 0; r.anom = m.rivAnom.subarray(k, k + L); k += L; }
  }
  if (globe) { globe.setIce(ice.vel); season.setIce(ice.H); climateDirty = true; }
  if (!playing) drawDirty = true;
}
function onYear(m) {
  year.step(m);
  if (m.anom && season) season.setAnomaly(m.anom, m.anomPrev || null);
  climateDirty = true;
}
const yearPhase = () => year.phase(P.years);
/**
 * The year's marks for this frame: the veil's bands between the step's ends (drawn only at a
 * slow dial, below ~10 yr/s), and each eruption once the clock has passed it, for 1.5 s.
 */
function yearFrame() {
  const lr = Math.log10(rate()), live = Year.liveWeight(rate()), f = yearPhase(), now = performance.now();
  const vis = live * (1 - smooth(0.5, 1.5, lr));
  const veil = new Float32Array(36);
  for (let b = 0; b < 36; b++) veil[b] = vis * (year.bandsPrev[b] + f * (year.bands[b] - year.bandsPrev[b]));
  const marks = [];
  for (const e of year.eruptions) {
    const key = `${e.t}:${e.M}`;
    if (P.years < e.t) continue;
    if (!eruptionSeen.has(key)) eruptionSeen.set(key, now);
    const a = live * (1 - (now - eruptionSeen.get(key)) / 1500);
    if (a > 0) marks.push({ p: e.p, M: e.M, a });
  }
  if (eruptionSeen.size > 200) for (const [k, t] of eruptionSeen) if (now - t > 5000) eruptionSeen.delete(k);
  return { veil, marks };
}
// The lakes as drawn (their depth from their water, and the salt flats), eased in by the globe.
let lakesDrawn = null;
function onLakes(m) {
  lakesDrawn = m;
  if (globe) globe.setLakes(m.draw, m.salt);
  drawDirty = true;
}
// The plants' cover as the Relief view draws it (src/engine/life.js), and the land's and the sea's carbon.
let coverDrawn = null, life = null;
function onCover(m) {
  coverDrawn = m.w;
  if (globe) globe.setCover(m.w);
  drawDirty = true;
}
function onTides(m) {
  // The largest amplitude (per unit equilibrium tide), for the caption.
  let mx = 0;
  for (let i = 0; i < m.C.length; i++) mx = Math.max(mx, Math.hypot(m.C[i], m.S[i]));
  tide = { ...m, maxA: mx };
  if (globe) globe.setTides(m.C, m.S, m.diss);
  if (view === 'tides') { drawDirty = true; caption(true); }
}
// The lunar semidiurnal equilibrium tide at the Moon's distance (src/engine/tides.js).
const lunarTide = a => 0.75 * (7.342e22 / 5.972e24) * (6.371e6 / a) ** 3 * 6.371e6;
/**
 * The sky and the tide's clock for this frame. θ turns at the spin and the Moon's longitude
 * at its mean motion; the Sun's comes from the date (the orbit's calendar). The lunar
 * semidiurnal tide's phase is 2(θ − the Moon's right ascension), the solar's likewise.
 */
/** Rivers by the month where the globe shows the season (as the snow: below ~12 yr/s), else by the year. */
function riverMonth() {
  if (1 - smooth(0.6, 1.6, Math.log10(rate())) < 0.5) return null;
  return { ...monthAt(((P.years % 1) + 1) % 1), aw: year.live > 0 ? Year.liveWeight(rate()) : 0 };
}
function skyFrame() {
  const y = P.years, YR = 3.15576e7, lr = Math.log10(rate());
  if (skyClock.years !== null) {
    const s = (y - skyClock.years) * YR, n = Math.sqrt(6.674e-11 * (5.972e24 + 7.342e22) / moon.a ** 3);
    skyClock.theta = (skyClock.theta + moon.Omega * s) % (2 * Math.PI);
    skyClock.lamM = (skyClock.lamM + n * s) % (2 * Math.PI);
  }
  skyClock.years = y;
  const o = P.orbit.at(y / 1000), eps = o.obliquity, tau = ((y % 1) + 1) % 1;
  const sun = ecliptic(solarLongitude(tau, o), eps), mo = ecliptic(skyClock.lamM, eps);
  const raM = Math.atan2(mo[1], mo[0]), raS = Math.atan2(sun[1], sun[0]);
  const m2 = 2 * (skyClock.theta - raM), s2 = 2 * (skyClock.theta - raS);
  // The sky turns only where a day takes a few seconds or more; above, it holds where it was.
  if (lr < Math.log10(6.8e-4)) skyClock.thetaShown = skyClock.theta;
  const amp = lunarTide(moon.a), rho = 0.46 * lunarTide(3.844e8) / amp;
  // The sea's height now only where the dial resolves a tide (a cycle of a few seconds or more).
  const now = 1 - smooth(-3.4, -3.0, lr);
  return {
    tides: { m: [Math.cos(m2) + rho * Math.cos(s2), Math.sin(m2) + rho * Math.sin(s2)], hw: [Math.cos(m2), Math.sin(m2)], amp: tide ? amp : 0, now },
    sky: { stars, theta: skyClock.thetaShown, sun, sunAlpha: 1 - smooth(-0.6, -0.2, lr), moon: mo, moonAlpha: 1 - smooth(-1.75, -1.3, lr), moonDist: moon.a },
  };
}
function uploadSurface(m, mode) {
  const T0 = globe.polarityOrigin;
  if (!polarityReady || m.t > T0 + POL_SPAN - 10) {
    const origin = m.t - (POL_SPAN - 60);
    globe.setPolarity(polarity.table(origin, POL_DT, Math.ceil(POL_SPAN / POL_DT)), origin, POL_DT);
    polarityReady = true;
  }
  globe.setFields(m.elevRel, m.tfDraw, m.felsic, null, m.normals, mode);
  season.setSurface(m.elevRel);
}
let polarityReady = false;

// ── The season, snow and ice ──
// Below a few years a second the globe shows the season at the planet's
// clock; above a few tens it shows the year's average (the share of it under
// snow or ice). Between, it blends.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let seasonDrawn = -1, seasonWeightDrawn = -1, climateVersionDrawn = -1, coldEaseStart = -1e9, season = null, anomDrawn = -1;
function refreshClimate(force) {
  if (!season) return;
  const tau = ((P.years % 1) + 1) % 1, nowMs = performance.now();
  const sw = 1 - smooth(0.6, 1.6, Math.log10(rate()));
  // The year's anomaly, between its two step ends by the clock, as live as the year is.
  const af = yearPhase(), aw = year.live > 0 ? Year.liveWeight(rate()) : 0, ak = aw * (1 + af);
  const moved = Math.abs(tau - seasonDrawn) > 1 / 240 || Math.abs(sw - seasonWeightDrawn) > 0.02 || Math.abs(ak - anomDrawn) > 0.01;
  const easing = nowMs - coldEaseStart < 900;
  if (!force && !moved && !easing && climate.version === climateVersionDrawn) return;
  if (climate.version !== climateVersionDrawn) {
    season.setClimate(climate);
    if (climateVersionDrawn >= 0) coldEaseStart = nowMs;
    globe.setZones(climate.zones);
    globe.setPermafrost(climate.permafrost);
    figuresDirty = true;
    climateVersionDrawn = climate.version;
  }
  season.draw(tau, sw, CLIMATE.LAPSE, smooth(0, 1, (nowMs - coldEaseStart) / 800), af, aw);
  globe.refineClimate();
  seasonDrawn = tau; seasonWeightDrawn = sw; anomDrawn = ak;
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
chartWorker.postMessage({ type: 'init', level: MESH_LEVEL, chartLevel: 6 });
// Each new chart is linked to the last and drawn morphing from it over about as long as charts take to come.
let chartGone = null, chartArrive = 0, chartSpan = 150;
chartWorker.onmessage = e => {
  const c = e.data, now = performance.now();
  if (chart) chartSpan = 0.7 * chartSpan + 0.3 * Math.max(60, Math.min(1000, now - chartArrive));
  c.prevT = chart ? chart.t : c.t;
  chartGone = linkCharts(chart, c);
  chart = c; chartArrive = now; chartBusy = false; drawDirty = true;
};
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
  // Between the last two steps, by how far the clock is into the next (one step behind it).
  wx.draw(globe.wxBuffer, wxLive, wx.started ? wxBehind / wx.dt : 1);
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
  if (v === 'weather') {
    // A weather built for an earlier spin is rebuilt (the Moon's tides lengthen the day).
    if (wx && globe && Math.abs(wx.Omega / moon.Omega - 1) > 0.003) wx = new GpuWeather(globe.device, mesh, seed, globe.refiner, moon.Omega);
    refreshWeather(true);
  }
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
    knob: { label: 'CO₂', min: 100, max: 450, step: 5, value: 180, fmt: v => `${v} ppm`, apply: v => { CARBON.FIXED = +v; } } },
  { id: 'highstand', name: 'High stand', dial: 6, view: 'relief',
    knob: { label: 'Mantle heat', min: 0.5, max: 2, step: 0.05, value: 1.6, fmt: v => `${(+v).toFixed(2)}×`, apply: v => { PARAMS.K_SLAB = BASE.K_SLAB * v; PARAMS.K_RIDGE = BASE.K_RIDGE * v; PARAMS.V_MAX = BASE.V_MAX * Math.sqrt(v); } } },
  { id: 'thermostat', name: 'Thermostat', dial: 5, view: 'climate',
    knob: { label: 'Outgassing', min: 0.25, max: 4, step: 0.05, value: 2, fmt: v => `${(+v).toFixed(2)}×`, apply: v => { CARBON.OUTGAS = +v; } } },
  // One eruption at the start, at the most active tropical arc; each new size erupts again.
  { id: 'eruption', name: 'Eruption', dial: 0, view: 'relief',
    setup: () => { erupt.id = 1; },
    knob: { label: 'Sulfate', min: -1, max: Math.log10(30), step: 0.01, value: 1, fmt: v => `${pinatubos(10 ** v)} Pinatubos`, apply: v => { erupt.M = 10 ** v; } } },
  // One pulse of carbon into the air once the sea has settled; each new size pulses again.
  { id: 'pulse', name: 'Pulse', dial: 3.5, view: 'climate',
    setup: () => { pulse.id = 1; },
    knob: { label: 'Carbon', min: Math.log10(500), max: 4, step: 0.01, value: Math.log10(2000), fmt: v => `${pgc(10 ** v)} Pg C`, apply: v => { pulse.PgC = 10 ** v; } } },
];
// The Pulse experiment's pulse: its size (Pg C) and a count, so the engine pulses once per size set.
const pulse = { PgC: 2000, id: 0 };
const pgc = v => (v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 100) * 100).toLocaleString('en');
// The Eruption experiment's eruption: its size (Pinatubos) and a count, so the engine erupts once per size set.
const erupt = { M: 10, id: 0 };
let eruptTimer = 0;
const pinatubos = M => M < 1 ? M.toFixed(1) : M < 10 ? M.toFixed(1).replace(/\.0$/, '') : Math.round(M).toString();
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
  return { CLIMATE: { S: CLIMATE.S }, CARBON: { FIXED: CARBON.FIXED, OUTGAS: CARBON.OUTGAS }, PARAMS: { K_SLAB: PARAMS.K_SLAB, K_RIDGE: PARAMS.K_RIDGE, V_MAX: PARAMS.V_MAX },
    ERUPT: experiment.id === 'eruption' && erupt.id > 0 ? { M: erupt.M, id: erupt.id } : null,
    PULSE: experiment.id === 'pulse' && pulse.id > 0 ? { PgC: pulse.PgC, id: pulse.id } : null };
}
function sendParams() { if (engineStarted) engine.postMessage({ type: 'params', params: params() }); }
function defaults() {
  CLIMATE.S = S0; CARBON.FIXED = 0; CARBON.OUTGAS = 1; pulse.id = 0;
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
  // A new size erupts again once the knob rests.
  if (experiment.id === 'eruption') { clearTimeout(eruptTimer); eruptTimer = setTimeout(() => { erupt.id++; sendParams(); caption(true); }, 350); }
  else if (experiment.id === 'pulse') { clearTimeout(eruptTimer); eruptTimer = setTimeout(() => { pulse.id++; sendParams(); caption(true); }, 350); }
  else sendParams();
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
  // The ice's record less its linear trend (a sheet still growing would read as the longest period).
  const x = v[3];
  let mt = 0, mx = 0; for (let k = 0; k < n; k++) { mt += t[k]; mx += x[k]; } mt /= n; mx /= n;
  let sxy = 0, sxx = 0; for (let k = 0; k < n; k++) { sxy += (t[k] - mt) * (x[k] - mx); sxx += (t[k] - mt) ** 2; }
  const slope = sxx > 0 ? sxy / sxx : 0, y = Array.from(x, (v, k) => v - mx - slope * (t[k] - mt));
  let best = 0, bp = null;
  for (let p = 15; p <= 150; p += 1) {
    let a = 0, b = 0;
    for (let k = 0; k < n; k++) { const th = 2 * Math.PI * t[k] / (p * 1000); a += y[k] * Math.cos(th); b += y[k] * Math.sin(th); }
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
  const parts = [view === 'climate' ? 'Climate' : view === 'weather' ? `Weather, ${wxMode}` : view === 'tides' ? 'Tides' : 'Relief', formatTime(P.years)];
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
  if (view === 'tides') {
    const YR = 3.15576e7, day = 2 * Math.PI / (moon.Omega - 2 * Math.PI / YR) / 3600;
    if (tide) parts.push(`range to ${(2 * tide.maxA * lunarTide(moon.a)).toFixed(1)} m`, `${(moon.P / 1e12).toFixed(1)} TW`);
    else parts.push('solving the tide');
    parts.push(`day ${day.toFixed(2)} h`, `Moon ${Math.round(moon.a / 1000).toLocaleString('en')} km`);
    setCaption(parts.join(' · '), true);
    return;
  }
  // The experiment's measured number.
  const cs = climate.stats;
  if (experiment.id === 'snowball') parts.push(`ice line ${Math.round(cs.iceLat)}°`);
  if (experiment.id === 'iceages') { const p = icePeriod(); parts.push(`ice ${(ice.stats.volume / 1e15).toFixed(1)} M km³`, p ? `period ${p} kyr` : 'period —'); }
  if (experiment.id === 'thermostat') parts.push(`CO₂ ${Math.round(carbon.pco2)} ppm`, `balance ${Math.round(carbon.balance)} ppm`);
  if (experiment.id === 'eruption') {
    // The eruption's own cooling (its response alone: the model is linear) against the
    // anomaly model's analytic response, independent boxes under the veil's decaying forcing.
    const g = year.tag, K = v => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)} K`;
    if (g) {
      const yr = v => v != null ? `${v.toFixed(1)} yr` : '—';
      parts.push(`${pinatubos(g.M)} Pinatubos`, `peak ${K(g.peak)} at ${yr(g.tPeak)}`, `e-folding ${yr(g.efold)}`, `theory ${K(g.theory.peak)} at ${yr(g.theory.tPeak)}, ${yr(g.theory.efold)}`);
    } else parts.push(`${pinatubos(erupt.M)} Pinatubos`, 'waiting for the climate');
    if (view === 'relief') { setCaption(parts.join(' · '), true); return; }
  }
  if (experiment.id === 'pulse') {
    // The share of the pulse still in the air (against a twin of the sea without it) after 1, 10
    // and 100 kyr, and the theory's: the closed sea, the compensated sea, then weathering.
    const g = carbon.pulse, sh = v => (v == null ? '—' : `${(100 * v).toFixed(v < 0.1 ? 1 : 0)}%`);
    if (g) {
      parts.push(`${pgc(g.PgC)} Pg C`, `CO₂ ${Math.round(carbon.pco2)} ppm`, `in the air ${sh(g.share)}`,
        `1 kyr ${sh(g.at[0])} · 10 kyr ${sh(g.at[1])} · 100 kyr ${sh(g.at[2])}`, `theory ${sh(g.theory.s1)}, ${sh(g.theory.s10)}, ${sh(g.theory.s100)}`);
    } else parts.push(`${pgc(pulse.PgC)} Pg C`, 'waiting for the sea');
    setCaption(parts.join(' · '), true);
    return;
  }
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
  const { snow, iceArea, run, la, hiLand, sstLo, sstHi, bShare, rain = 0, ground = { wet: 0, beta: 0, live: 0 }, lakes = { n: 0, area: 0, inflow: 0 } } = P.agg || { snow: 0, iceArea: 0, run: 0, la: 0, hiLand: 0, sstLo: 0, sstHi: 0, bShare: 0 };
  const dT = z ? z.T[45] - 0.5 * (z.T[15] + z.T[75]) : 40;
  const forcing = 5.35 * Math.log(carbon.pco2 / CARBON.PCO2_0);
  const s65 = P.orbit.summer65(P.years / 1000);
  const wRel = carbon.wF0 > 0 ? carbon.wF / carbon.wF0 : 1;
  const fmt = (v, d = 2) => v.toFixed(d);
  const sea = Math.round((tec.seaLevel - P.seaLevel0) * 1000);
  // The year: its anomaly's global mean now, the veil's forcing (its departure from the eruption rate's mean, live), and the mean's.
  const yearMean = year.meanAt(P.years);
  // The plants and the sea's carbon (src/engine/life.js, src/engine/oceancarbon.js).
  const L = life || { trees: 0, npp: 0, air: 0, bio: 1, shelf: 0 }, seaC = carbon.sea || { ccd: 0 }, gas = cf.gas || 0, Pg = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(Math.abs(v) < 0.1 ? 3 : 2)} Pg/yr`;
  const reg = P.regolith;
  // Dust (src/engine/aeolian.js), as of the climate's last cycle.
  const D = climate.dust, Tg = v => `${Math.round(v)} Tg/yr`;
  const r = year.rates || { arcs: 0.1, hot: 0, flood: 0 }, Wm = v => { const a = Math.abs(v), t = a.toFixed(a < 0.1 ? 2 : 1); return `${+t === 0 ? '' : v > 0 ? '+' : '−'}${t} W/m²`; };
  return {
    values: {
      climate: `${cs.meanT.toFixed(1)} °C`, carbon: `${Math.round(carbon.pco2)} ppm`, ice: `${(ice.stats.volume / 1e15).toFixed(1)} M km³`,
      sea: `${sea > 0 ? '+' : sea < 0 ? '−' : ''}${Math.abs(sea)} m`, plates: `${st.plates} plates`, plumes: `${plumes.hot.length} hotspots`,
      ocean: `${P.ocean.stats.maxSv.toFixed(0)} Sv`, weather: wx && wx.started && chart ? `${chart.lows.length} lows` : 'idle',
      orbit: `tilt ${(P.orbit.at(P.years / 1000).obliquity * 180 / Math.PI).toFixed(1)}°`,
      landscape: `${land.flux.eroded.toFixed(1)} km³/yr`, zones: `B ${Math.round(100 * bShare / (la || 1))}%`,
      tides: tide ? `${(moon.P / 1e12).toFixed(1)} TW` : '—',
      year: year.live > 0 ? `${yearMean >= 0 ? '+' : '−'}${Math.abs(yearMean).toFixed(2)} K` : `±${year.sigma.toFixed(1)} K`,
      volcanoes: `τ ${year.aod.toFixed(3)}`,
      ground: `soil ${Math.round(100 * ground.wet)}%`, lakes: `${Math.round(lakes.area / 1e3)}k km²`,
      veg: `${Math.round(100 * L.trees)}% trees`, seaC: `CCD ${(seaC.ccd / 1000).toFixed(1)} km`,
      regolith: reg ? `${reg.mean.toFixed(1)} m` : '—',
      dust: climate.dust ? Tg(climate.dust.emission) : '—',
    },
    edges: [
      // The basins set the tide; the tide slows the spin, which the climate, the gyres and the weather turn with.
      { from: 'plates', to: 'tides', w: moon.P / 6e12, label: 'basins', bend: 0.3 },
      { from: 'tides', to: 'climate', w: 0.35, label: `day ${(2 * Math.PI / (moon.Omega - 2 * Math.PI / 3.15576e7) / 3600).toFixed(2)} h`, bend: 0 },
      { from: 'tides', to: 'weather', w: 0.2, label: 'spin', bend: 0 },
      { from: 'tides', to: 'ocean', w: 0.2, bend: 0.1 },
      { from: 'orbit', to: 'climate', w: (s65 - 420) / 120, label: `${Math.round(s65)} W/m²`, bend: -0.1 },
      { from: 'climate', to: 'weather', w: dT / 45, label: `${Math.round(dT)} K` },
      { from: 'climate', to: 'ocean', w: P.ocean.stats.maxSv / 30, label: 'wind' },
      { from: 'ocean', to: 'climate', w: (sstHi - sstLo) / 12, label: `±${Math.round(Math.max(-sstLo, sstHi))} K` },
      { from: 'climate', to: 'zones', w: 0.5 },
      { from: 'zones', to: 'climate', w: bShare / (la || 1) / 0.6, label: 'albedo' },
      { from: 'climate', to: 'ice', w: snow / 1e9 / 4000, label: `${Math.round(snow / 1e9)} km³/yr` },
      { from: 'ice', to: 'climate', w: iceArea / 1e12 / 20, label: 'albedo' },
      { from: 'ice', to: 'sea', w: ice.stats.seaLevel / 100, label: `−${Math.round(ice.stats.seaLevel)} m` },
      // The ground: rain in, evaporation (its efficiency) and runoff out; the lakes from its runoff, in the landscape's basins behind the ice's dams.
      { from: 'climate', to: 'ground', w: rain / (la || 1) / 1.5, label: `${Math.round(1000 * rain / (la || 1))} mm/yr`, bend: 0.35 },
      { from: 'ground', to: 'climate', w: ground.beta, label: `β ${ground.beta.toFixed(2)}`, bend: 0.35 },
      { from: 'year', to: 'ground', w: 0.4 * ground.live, bend: 0.1 },
      { from: 'ground', to: 'landscape', w: run / (la || 1) / 0.5, label: `${Math.round(1000 * run / (la || 1))} mm/yr`, bend: -0.05 },
      { from: 'ground', to: 'lakes', w: lakes.inflow / 1500, label: `${Math.round(lakes.inflow)} km³/yr`, bend: 0.05 },
      { from: 'landscape', to: 'lakes', w: 0.25, label: 'basins', bend: 0.1 },
      { from: 'ice', to: 'lakes', w: iceArea > 0 ? 0.25 : 0.05, label: 'dams', bend: -0.1 },
      { from: 'lakes', to: 'climate', w: lakes.area / 1e6, label: 'open water', bend: -0.25 },
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
      // The year: arcs and plumes erupt; the veil forces the anomaly (live) and its mean the climate; the anomaly's spread is the zones' widths.
      { from: 'plates', to: 'volcanoes', w: r.arcs / 0.2, red: true, bend: -0.1 },
      { from: 'plumes', to: 'volcanoes', w: (r.hot + 10 * r.flood) / 0.05, red: true, bend: 0 },
      { from: 'volcanoes', to: 'year', w: year.live * Math.abs(year.F) / 2, label: year.live > 0 ? Wm(year.F) : '', red: true, bend: 0 },
      { from: 'volcanoes', to: 'climate', w: Math.abs(year.Frate) / 1, label: Wm(year.Fmean), red: true, bend: -0.1 },
      { from: 'climate', to: 'year', w: 0.25, bend: -0.15 },
      { from: 'year', to: 'zones', w: year.sigma / 2, label: `±${year.sigma.toFixed(1)} K`, bend: 0.1 },
      // The plants: grown by the climate's warmth and rain, fed by the CO₂; their
      // albedo (masking snow) and transpiration back to the climate; their carbon to the air, and their
      // cover into weathering's map.
      { from: 'climate', to: 'veg', w: L.npp / 60, label: `NPP ${Math.round(L.npp)} Pg/yr`, bend: 0.15 },
      { from: 'veg', to: 'climate', w: L.trees / 0.5, label: 'albedo', bend: 0.15 },
      { from: 'veg', to: 'carbon', w: Math.abs(L.air) / 0.5, label: Math.abs(L.air) > 5e-4 ? Pg(L.air) : '', bend: 0.05 },
      { from: 'carbon', to: 'veg', w: 0.15, bend: 0.05 },
      // The sea's carbon: the air–sea exchange (either way), the gyres' temperatures and upwelling,
      // the shelves the sea level floods, the rivers' nutrients, and the carbonate the plates carry down.
      gas >= 0 ? { from: 'carbon', to: 'seaC', w: gas / 0.5, label: Pg(gas).replace('+', ''), bend: 0.12 }
        : { from: 'seaC', to: 'carbon', w: -gas / 0.5, label: Pg(-gas).replace('+', ''), bend: 0.12 },
      { from: 'ocean', to: 'seaC', w: (cf.export || 0) / 5, label: `export ${(cf.export || 0).toFixed(1)} Pg/yr`, bend: -0.25 },
      { from: 'sea', to: 'seaC', w: (L.shelf || 0) / 30, label: 'shelves', bend: -0.2 },
      { from: 'landscape', to: 'seaC', w: L.bio / 2, label: `${L.bio.toFixed(2)}×`, bend: -0.1 },
      { from: 'plates', to: 'seaC', w: (cf.arc || 0) / 0.1, bend: 0.1 },
      // The regolith: the ice strips it and lays till, the rivers strip it; it softens the ice's bed, holds the
      // soil's water and feeds weathering fresh rock. The ice's outwash is the rivers' sediment; loads bend the crust.
      ...(reg ? [
        { from: 'ice', to: 'regolith', w: reg.glacial / 0.1, label: `${reg.glacial.toFixed(2)} mm/yr`, bend: 0.15 },
        { from: 'regolith', to: 'ice', w: reg.iceBed, label: `bed ${reg.iceBed.toFixed(2)}`, bend: 0.15 },
        { from: 'landscape', to: 'regolith', w: 0.2, bend: -0.1 },
        { from: 'regolith', to: 'ground', w: (P.agg?.cap || 0) / 300, label: `${Math.round(P.agg?.cap || 0)} mm`, bend: -0.2 },
        { from: 'regolith', to: 'carbon', w: (P.agg?.supply || 0) / 1.5, label: `supply ${(P.agg?.supply || 0).toFixed(2)}`, bend: 0.1 },
        { from: 'ice', to: 'landscape', w: (land.flux.outwash || 0) / 0.5, label: land.flux.outwash > 0.005 ? `${land.flux.outwash.toFixed(2)} km³/yr` : '', bend: -0.15 },
      ] : []),
      ...(P.flex ? [{ from: 'landscape', to: 'plates', w: P.flex.rms / 300, label: `±${Math.round(P.flex.rms)} m`, bend: -0.25 }] : []),
      { from: 'ice', to: 'plates', w: ice.stats.area > 0 ? 0.3 : 0.05, label: 'bed', bend: 0.25 },
      // Dust: lifted by the climate's winds from bare, dry ground (the cover), dry lake beds and the ice's outwash;
      // it scatters sunlight, darkens snow and ice (faster melt), brings the cold sea iron and settles as loess.
      ...(D ? [
        { from: 'climate', to: 'dust', w: D.emission / 3000, label: 'wind', bend: 0.05 },
        { from: 'veg', to: 'dust', w: D.fromBare / 2000, label: D.fromBare >= 1 ? Tg(D.fromBare) : '', bend: 0.1 },
        { from: 'lakes', to: 'dust', w: D.fromSalt / 100, label: D.fromSalt >= 1 ? Tg(D.fromSalt) : '', bend: -0.15 },
        { from: 'ice', to: 'dust', w: D.fromOutwash / 100, label: D.fromOutwash >= 1 ? Tg(D.fromOutwash) : '', bend: 0.1 },
        { from: 'dust', to: 'climate', w: Math.abs(D.forcing) / 0.2, label: Wm(D.forcing), bend: 0.05 },
        { from: 'dust', to: 'ice', w: (D.dark || 0) / 0.01, label: D.dark >= 5e-4 ? `α −${D.dark.toFixed(3)}` : '', bend: -0.1 },
        { from: 'dust', to: 'seaC', w: Math.abs((D.iron || 1) - 1) / 0.3 + 0.1, label: `iron ${(D.iron || 1).toFixed(2)}×`, bend: -0.1 },
        { from: 'dust', to: 'regolith', w: (D.loess || 0) / 1000, label: D.loess >= 1 ? `loess ${Tg(D.loess)}` : '', bend: 0.1 },
      ] : []),
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
  engine.postMessage({ type: 'tick', adv: PLATE_STEP, steps: [PLATE_STEP], window: rate() * 2, rate: rate() });
  stepsSent++;
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
    { key: '4', group: 'View', label: 'Tides', action: () => setView('tides') },
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
  const frameDt = Math.max(0, Math.min(0.25, (now - last) / 1000));   // the shown moment keeps real time
  last = Math.max(last, now);
  profT = performance.now();
  if (playing) {
    // Plate steps: a tenth of a second's worth of the dial, between 50 kyr and 0.5 Myr, and
    // no shorter than the engine can keep up with; the clock waits while it is two steps behind.
    const keep = rate() * engineMsPerStep / 1000 * 1.3;
    scheduler.layers[0].step = Math.min(PLATE_STEP, Math.max(5e4, rate() / 10, keep));
    const behind = stepsSent - stepsDone >= 2;
    const { dt: adv, plan } = scheduler.advance(behind ? 0 : rate() * dt);
    P.years += adv;
    const p = plan[0];
    // The engine's tick: the years, the plate steps, and the orbit the climate sees
    // (averaged over what the dial passes in ~2 s).
    if (engineStarted && adv > 0) { engine.postMessage({ type: 'tick', adv, steps: Array(Math.max(0, p.steps)).fill(p.step), window: rate() * 2, rate: rate() }); stepsSent += Math.max(0, p.steps); }
    if (view === 'weather') stepWeather(adv);
    figuresDirty = true;
    drawDirty = true;
  }
  lap('weather');
  if (climateDirty || playing || performance.now() - coldEaseStart < 900) { refreshClimate(climateDirty); climateDirty = false; }
  lap('season');
  if (view === 'weather' && wx && (playing || !wx.started || wx.t < SPINUP)) { if (!playing) stepWeather(0); refreshWeather(); }
  if (playing && rate() < 20) drawDirty = true;   // the sky, the Sun, the Moon, the tide and the rivers' months move at a slow dial
  if (playing && year.live > 0 && year.eruptions.length) drawDirty = true;   // eruptions come and fade
  if (playing) caption(false);
  lap('chart');
  if (figuresDirty) figures(false);
  lap('figures');
  if (drawDirty && globe && !globe.lost) {
    const pal = palette();
    // Between steps the globe shows the blend of the last two states, and the
    // lines turn with their plates to the same moment.
    const phi = stepTau(frameDt);
    if (phi < 1 || queue.length) drawDirty = true;
    const tShow = tau ?? tec.t;
    // Each line is turned with its plates to the shown moment and morphed from its
    // predecessor's course (rivers over the landscape's own step).
    // A line wholly behind the globe is neither placed nor drawn (`hidden`).
    const cm = camera.m, w = [0, 0, 0];
    if (lines) for (const ln of lines) {
      const a = tec.plates[ln.left], b = tec.plates[ln.right];
      w[0] = 0.5 * (a.w[0] + b.w[0]); w[1] = 0.5 * (a.w[1] + b.w[1]); w[2] = 0.5 * (a.w[2] + b.w[2]);
      ln.hidden = view === 'climate' || view === 'tides' || view === 'weather' || !capFaces(ln, w, tShow - linesT, cm);
      if (ln.hidden) continue;
      placeLine(ln, w, tShow - linesT, tShow - ln.prevT, phi);
      ln.shownU = shownU(ln, phi);
    }
    if (rivers) {
      // Rivers morph over the landscape's own step, from their predecessors' time to theirs.
      const phiL = rivers.length && rivers[0].prevT < riversT ? Math.min(1, Math.max(0, (tShow - rivers[0].prevT) / (riversT - rivers[0].prevT))) : 1;
      for (const rv of rivers) {
        const pl = tec.plates[rv.plate];
        rv.alpha = rv.prev ? 1 : phiL;           // a river with no predecessor fades in
        if (!pl || !pl.alive) { rv.shown = rv.P; rv.hidden = false; continue; }
        rv.hidden = !capFaces(rv, pl.w, tShow - riversT, cm);
        if (!rv.hidden) placeLine(rv, pl.w, tShow - riversT, tShow - rv.prevT, phiL);
      }
      for (const rv of riversGone) {
        const pl = tec.plates[rv.plate];
        rv.alpha = 1 - phiL;                     // and one with no successor fades out
        if (!pl || !pl.alive) { rv.shown = rv.P; rv.hidden = false; continue; }
        rv.hidden = !capFaces(rv, pl.w, tShow - rv.goneT, cm);
        if (!rv.hidden) placeLine(rv, pl.w, tShow - rv.goneT, 0, 1);
      }
    }
    lap('lines');
    const sf = lastSky = skyFrame(), yf = yearFrame();
    if (yf.marks.length) drawDirty = true;
    globe.draw(camera, tShow, pal, { view, wx: wxMode, blend: phi, tides: sf.tides, veil: yf.veil });
    lap('globe');
    drawOverlay(octx, cssW, cssH, dpr, camera, { boundaries: lines, rivers: rivers && riversGone.length ? rivers.concat(riversGone) : rivers, plumes, view, chart: view === 'weather' && chart && wx ? chartFrame(chart, chartGone, Math.min(1, (performance.now() - chartArrive) / chartSpan), wx.t) : null, chartFade: wxLive, wxNow: null, sky: sf.sky, riverMonth: riverMonth(), eruptions: yf.marks }, pal);
    if (phi >= 1 && !globe.lakesEasing) drawDirty = false;
    lap('overlay');
  }
}

// ── The engine's snapshots ──
let engineStarted = false;
engine.onmessage = e => {
  const m = e.data;
  if (m.type === 'ready') {
    // The ticks sent before the engine was ready still reach it, after its opening: the clock is the opening plus them.
    P.seaLevel0 = m.seaLevel0; P.years += m.years; carbon.pco2 = m.pco2;
  } else if (m.type === 'surface') onSurface(m);
  else if (m.type === 'climate') { climate.update(m); climateDirty = true; figuresDirty = true; caption(false); }
  else if (m.type === 'fast') onFast(m);
  else if (m.type === 'tides') onTides(m);
  else if (m.type === 'year') onYear(m);
  else if (m.type === 'lakes') onLakes(m);
  else if (m.type === 'cover') onCover(m);
};
engine.onerror = e => console.warn('[isochron] engine:', e.message);

if (query.get('exp')) setExperiment(query.get('exp'));
engine.postMessage({ type: 'init', seed, level: LEVEL, params: params() });
engineStarted = true;
engine.postMessage({ type: 'play', playing });

gpuDevice().then(device => createGlobe(els.gpu, mesh, grid, device)).then(g => {
  globe = g;
  season = new GpuSeason(g.device, grid, g.climBuffer);
  wx = new GpuWeather(g.device, mesh, seed, g.refiner, moon.Omega);
  if (tide) g.setTides(tide.C, tide.S, tide.diss);
  if (lakesDrawn) g.setLakes(lakesDrawn.draw, lakesDrawn.salt);
  if (coverDrawn) g.setCover(coverDrawn);
  if (view === 'weather') refreshWeather(true);
  if (shown) uploadSurface(shown, 'reset');
  climateDirty = true;
  climateVersionDrawn = -1;
  caption(true);
}).catch(err => {
  console.warn('[isochron] WebGPU unavailable:', err.message);
  els.nogpu.hidden = false;
  caption(true);
});
requestAnimationFrame(frame);

window.__isochron = { P, engine, grid, tec, land, climate, ice, carbon, plumes, polarity, camera, scheduler, setPlaying, setView, setExperiment, get wx() { return wx; }, get globe() { return globe; }, get tau() { return tau; }, get pace() { return { engineRate, pace, arrivals: arrivals.length, shownFrom, shownT: shown && shown.t, newest: queue.length ? queue[queue.length - 1].t : null }; }, get engineProf() { return engineProf; }, get queued() { return queue.length; }, tick, prof, get chart() { return chart; }, get sky() { return lastSky; }, get moon() { return moon; }, year, get lakes() { return lakesDrawn; }, get lines() { return lines; }, get rivers() { return rivers; } };
