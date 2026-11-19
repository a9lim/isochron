// Isochron: an Earth-like planet on one globe (docs/design.md; AGENTS.md maps the rest). The planet runs
// on its own thread (src/engine/worker.js): it boots a seeded planet, spins it
// up so it opens in motion, and steps it as this page's clock asks (plates,
// plumes and landscape in banked steps; carbon and ice each frame; the
// climate's cycles in between), posting back what is drawn. This thread keeps
// the clock and the dial, runs the weather on the GPU (src/gpu/weather.js),
// and draws: the globe blends each step's surface into the next, and the
// lines turn with their plates.
//
// In the People scenario the people run on a third thread (src/engine/people-worker.js),
// linked to the engine's by a port: this thread sends them its ticks, holds the clock while
// they are behind, sets the dial by their doubling time (the follow dial) until it is taken,
// and draws them (the People view).
//
// Globals from the shared layer: _PALETTE, _themePalette, _colophon,
// initAboutPanel, initShortcuts, _loadTextFonts.
import { buildGrid, cellCount } from './src/grid/icosphere.js';
import { Record } from './src/engine/record.js';
import { ClimateView, YearView } from './src/engine/mirror.js';
import { OrbitCycles, EARTH_CYCLES } from './src/engine/orbit.js';
import { isEarth } from './src/engine/earth.js';
import { GTS2012, CNS_START } from './src/engine/gpts.js';
import { PARAMS } from './src/engine/plates.js';
import { CLIMATE, NZ } from './src/engine/climate.js';
import { CARBON } from './src/engine/carbon.js';
import { Polarity } from './src/engine/polarity.js';
import { monthName, monthAt, S0, solarLongitude } from './src/engine/orbit.js';
import { Scheduler, formatRate, formatTime } from './src/clock.js';
import { Orbit } from './src/render/camera.js';
import { createGlobe } from './src/render/globe.js';
import { drawOverlay, placeLine, capOf, capFaces, matchLines, link, lakeAlong } from './src/render/overlay.js';
import { makeStars, starDistances, ecliptic, moonFace } from './src/render/sky.js';
import { stream } from './src/rng.js';
import { shownU } from './src/render/along.js';
import { traceBoundaries } from './src/render/lines.js';
import { succeedRivers } from './src/render/rivers.js';
import { drawPeople, drawAges, agesCaption, drawZonal, drawHypsometry, drawPolarity, drawZoneKey, drawRecord, drawOrbit, drawModel } from './src/render/figures.js';
import { ECONOMY, economyOf, economyCaption, count, sci } from './src/render/economy.js';
import { systemOf, systemCaption, drawSystem } from './src/render/system.js';
import { solarSystem } from './src/engine/solar.js';
import { gpuDevice } from './src/gpu/device.js';
import { GpuWeather, weatherForcing } from './src/gpu/weather.js';
import { GpuSeason } from './src/gpu/season.js';
import { drawKey } from './src/render/key.js';
import { STREAM_GAP } from './src/render/streamlines.js';
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
const SPINUP_DAYS = 5;        // the weather's spin-up from the climate's state (its storms reach their equilibrium in ~4)
const RECORD_SECONDS = 40;    // the record's window, in seconds of the dial

const query = new URLSearchParams(location.search);
// The planet's seed: the link's, or a new one written into it, so the link always names this planet.
const seed = query.get('seed') || Array.from(crypto.getRandomValues(new Uint32Array(6)), v => 'abcdefghijkmnpqrstuvwxyz23456789'[v % 32]).join('');
if (!query.get('seed')) { query.set('seed', seed); history.replaceState(null, '', `${location.pathname}?${query}${location.hash}`); }
const $ = id => document.getElementById(id);
const els = {
  stage: document.querySelector('.globe-stage'),
  gpu: $('globe-gpu'), overlay: $('globe-overlay'), nogpu: $('globe-nogpu'),
  caption: $('globe-caption'), dial: $('dial'), dialOut: $('dial-out'),
  views: document.querySelectorAll('#view-picker .view-btn'),
  mapPickers: document.querySelectorAll('.map-picker'), maps: document.querySelectorAll('.map-picker .view-btn'),
  keyBtn: $('key-btn'), key: $('globe-key'), keyCanvas: $('key-canvas'),
  scenarios: document.querySelectorAll('#scenario-picker .view-btn'), followBtn: $('follow-btn'), peopleTab: document.querySelector('.tab-btn[data-tab="people"]'),
  figRecord: $('fig-record'), capRecord: $('cap-record'), figOrbit: $('fig-orbit'), capOrbit: $('cap-orbit'),
  figZonal: $('fig-zonal'), capZonal: $('cap-zonal'), zoneKey: $('zone-key'),
  figHyps: $('fig-hyps'), capHyps: $('cap-hyps'), figPol: $('fig-pol'), capPol: $('cap-pol'),
  figModel: $('fig-model'), capModel: $('cap-model'), figPeople: $('fig-people'), capPeople: $('cap-people'),
  figAges: $('fig-ages'), capAges: $('cap-ages'),
  figSystem: $('fig-system'), capSystem: $('cap-system'), figSystemWrap: $('fig-system-wrap'),
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
const P = { years: 0, seaLevel0: 0, landBank: 0, record: new Record(), orbit: new OrbitCycles(seed, isEarth(seed) ? EARTH_CYCLES : null), agg: null, get ocean() { return climate.ocean; } };
let wx = null;                     // the weather, on the GPU (src/gpu/weather.js), once there is a device
const polarity = new Polarity(seed, -400, isEarth(seed) ? { reversals: GTS2012, quietFrom: CNS_START } : null);
const scheduler = new Scheduler([{ name: 'plates', step: PLATE_STEP, budget: 4 }]);
const camera = new Orbit();

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let playing = !reducedMotion;
let view = 'relief';
let wxMode = 'pressure';            // the Weather view's chart: pressure, temperature or humidity
let clMode = 'zones';               // the Climate view's map: its zones, or the air (winds, dust, the veil)
let pmMode = 'settlement';          // the People view's map: where people have reached, their and the robots' density, their knowledge and works, or who they are
// The Moon as the engine last reported it, and the tide's last solve (per unit equilibrium tide).
const moon = { a: 3.844e8, Omega: 7.2921e-5, omega: 1.4052e-4, P: 0, day: 23.93 };
let tide = null;
// The sky's clock: the planet's sidereal angle θ and the Moon's longitude, advanced with the
// planet's clock; the tide's phases follow from them (its bulge sits under the Moon).
const skyClock = { years: null, theta: 0, lamM: 0, thetaShown: 0 };
const stars = makeStars(seed), starDist = starDistances(seed, stars);
const solar = solarSystem(seed, isEarth(seed));   // the planet's solar system: today's on `earth`, else seeded (Fig. 10, the people off-world)
// The Moon's face (today's Earth's near side, or basins seeded with the planet) and the Sun's cycle's
// phase at year 0 (today's Earth's: cycle 25 just past its maximum in 2025, from memory; else seeded).
const moonFaceOf = moonFace(seed, isEarth(seed)), solarPhase = isEarth(seed) ? 0.5 : stream(seed, 'sun').uniform();
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
let engineOpened = false;           // the engine's opening over (its climate settled, a seeded planet's ice at its balance): the clock waits for it
const queue = [];                   // surfaces waiting to be shown, oldest first
let shown = null, shownFrom = 0;    // the surface blended to, and the time of the one blended from (Myr)
let tau = null, engineRate = 0, pace = 0, lastArrive = -1;
const arrivals = [];               // [wall ms, model Myr] of recent surfaces, for the engine's pace
let riversT = 0, linesT = 0, riversGone = [], surfaceMsg = null;
// Rivers crossfade where a retrace changed them, as the shown moment crosses the step that brought
// it ([riversFrom, riversT] Myr), and within RIVER_FADE ms of the wall clock whatever the clock
// does (a pause, or a retrace once the shown moment has caught up, neither holds nor skips one).
let riversFrom = 0, riversWall = 0, riversFading = false;
const RIVER_FADE = 400;
const riverSpacing = 1.07 * Math.sqrt(4 * Math.PI / grid.n);   // rad between neighbouring cells
const riverPhi = t => Math.min(1, Math.max(riversT > riversFrom ? (t - riversFrom) / (riversT - riversFrom) : 0, (performance.now() - riversWall) / RIVER_FADE));
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
  if (!old) caption(true);
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
    // No morph: an unchanged course stays, a changed one crossfades where it changed, from now
    // until the shown moment reaches the new rivers' (src/render/rivers.js, `succeedRivers`).
    const drawn = rivers ? rivers.concat(riversGone) : [], t = tau ?? m.t;
    riversGone = succeedRivers(drawn, m.rivers, riverPhi(t), riverSpacing);
    rivers = m.rivers; rivers.id = m.riversId;
    riversFrom = Math.min(t, m.t); riversT = m.t; riversWall = performance.now();
    riversFading = riversGone.length > 0 || rivers.some(r => r.fa0);
    for (const r of rivers) capOf(r);
    for (const r of riversGone) capOf(r);
    // Cut where the drawn lakes' shores cross them (overlay.js, lakeAlong).
    if (lakesDrawn) lakeAlong(grid, rivers.concat(riversGone), lakesDrawn.draw);
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
  // Sea level from the settled opening once the engine has one (Planet.zeroSea): the record so far moves with it.
  if (m.seaLevel0 !== undefined && m.seaLevel0 !== P.seaLevel0) { P.record.shift('sea', (P.seaLevel0 - m.seaLevel0) * 1000); P.seaLevel0 = m.seaLevel0; }
  for (let k = 0; k < m.samples.length; k += 8) P.record.push(m.samples[k], m.samples.subarray(k + 1, k + 8));
  ice.H = m.iceH; ice.vel = m.iceVel; ice.stats = m.iceStats;
  Object.assign(carbon, m.carbon);
  land.flux = m.landFlux;
  P.regolith = m.regolith; P.flex = m.flex;
  plumes.hot = m.plumes.hot; plumes.lips = m.plumes.lips;
  if (m.agg) P.agg = m.agg;
  if (m.life) life = m.life;
  if (m.runaway) runaway = m.runaway;
  if (m.people) people.link = m.people;
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
  // A preserving AI's sprayed sulfate as a standing veil at every dial, global as the volcanoes' (its
  // optical depth by their −25 W/m² per unit, src/engine/volcanoes.js); coal's is a haze where the
  // winds carry it (`coalHaze`, src/engine/peoplelink.js).
  const tp = people.msg ? Math.max(0, -(people.msg.forcing.geo || 0) / 25) : 0;
  for (let b = 0; b < 36; b++) veil[b] = vis * (year.bandsPrev[b] + f * (year.bands[b] - year.bandsPrev[b])) + tp;
  const marks = [];
  for (const e of year.eruptions) {
    const key = `${e.t}:${e.M}`;
    if (P.years < e.t) continue;
    if (!eruptionSeen.has(key)) eruptionSeen.set(key, now);
    const a = live * (1 - (now - eruptionSeen.get(key)) / 1500);
    if (a > 0) marks.push({ p: e.p, M: e.M, a });
  }
  if (eruptionSeen.size > 200) for (const [k, t] of eruptionSeen) if (now - t > 5000) eruptionSeen.delete(k);
  return { veil, marks, coal: coalHaze() };
}
/** Coal's sulfate's optical depth where its burden's pattern is 1 (its global mean, by the same −25 W/m² per unit). */
function coalHaze() {
  const F = people.msg ? people.msg.forcing : null;
  return F && sulfPattern ? Math.max(0, -(F.aer - (F.geo || 0)) / 25) : 0;
}
// Coal's sulfate's pattern on the engine's grid (mean 1), from the engine after each cycle that carried it.
let sulfPattern = null;
// The lakes as drawn (their shore's field and tint from their water, and the salt flats), eased in by the globe.
let lakesDrawn = null;
function onLakes(m) {
  lakesDrawn = m;
  if (globe) globe.setLakes(m.draw, m.salt, m.tint);
  if (rivers) lakeAlong(grid, rivers.concat(riversGone), m.draw);
  drawDirty = true;
}
// The plants' cover as the Relief view draws it (src/engine/life.js), and the land's and the sea's carbon.
let coverDrawn = null, life = null, runaway = null;   // the cover's colour; life's sums; the runaway's steam (src/engine/runaway.js)
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
/** Rivers by the month where the globe shows the season (as the snow: below ~1.4 yr/s), else by the year. */
function riverMonth() {
  if (seasonShown() < 0.5) return null;
  return { ...monthAt(((P.years % 1) + 1) % 1), aw: anomalyShown() };
}
const lg01 = (v, a, b) => Math.max(0, Math.min(1, (Math.log10(Math.max(v, 1)) - a) / (b - a)));
/** The Moon's city's uses as far as each has grown (0–1, log): residences by the Moon's people (to its surface's ~1.5 × 10¹¹), datacenters by off-world compute's power, factories by the rest of off-world power. */
function moonbase() {
  const m = people.msg;
  if (!m || !m.last) return [0, 0, 0];
  const allE = m.last.energy || 0, Wc = m.econ ? m.econ.Wc : 0, Es = m.Es || 0, cs = allE > 0 ? Math.min(1, Wc / allE) : 0;
  return [lg01(m.off ? m.off.worlds.moon : m.space, 3, 11), lg01(Es * cs, 10, 20), lg01(Es * (1 - cs), 11, 21)];
}
/** The off-world sky: the swarm's shade (sacrificed endings), the L4 and L5 habitats either side of the Moon, the stars whose settlement's light is back. */
function offSky(lamM, eps) {
  const m = people.msg, end = m && m.ending;
  if (!m || !m.off) return {};
  const st = m.off.stars, sw = m.sun ? (m.Es || 0) / m.sun : 0;
  return {
    shade: end && !end.preserve ? sw : 0,
    l45: { n: lg01(m.off.worlds.l45, 3, 11), dirs: [ecliptic(lamM + Math.PI / 3, eps), ecliptic(lamM - Math.PI / 3, eps)] },
    lit: st && st.seen > 0 ? { seen: st.seen, aligned: !!(end && end.aligned) } : null,
  };
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
  // The sky turns only where the dial resolves the day (a day in ~2 s or more, DAY_HI); above, it
  // holds where it was. The night side shows on the globe there too (dayShown), in the Sun's
  // direction turned back by the sky's angle into the globe's frame.
  if (lr < DAY_HI) skyClock.thetaShown = skyClock.theta;
  const amp = lunarTide(moon.a), rho = 0.46 * lunarTide(3.844e8) / amp;
  // The sea's height now only where the dial resolves a tide (a cycle of a few seconds or more).
  const now = 1 - smooth(-3.4, -3.0, lr);
  const ct = Math.cos(skyClock.thetaShown), st = Math.sin(skyClock.thetaShown);
  return {
    tides: { m: [Math.cos(m2) + rho * Math.cos(s2), Math.sin(m2) + rho * Math.sin(s2)], hw: [Math.cos(m2), Math.sin(m2)], amp: tide ? amp : 0, now },
    day: { dir: [ct * sun[0] + st * sun[1], -st * sun[0] + ct * sun[1], sun[2]], w: dayShown() },
    sky: { stars, theta: skyClock.thetaShown, sun, sunAlpha: 1 - smooth(-0.6, -0.2, lr), moon: mo, moonAlpha: 1 - smooth(-1.75, -1.3, lr), moonDist: moon.a,
      swarm: people.msg ? people.msg.Es / people.msg.sun : 0, moonbase: moonbase(), years: y, eps, solarPhase, face: moonFaceOf, starDist, ...offSky(skyClock.lamM, eps),
    },
  };
}
function uploadSurface(m, mode) {
  const T0 = globe.polarityOrigin;
  if (!polarityReady || m.t > T0 + POL_SPAN - 10) {
    const origin = m.t - (POL_SPAN - 60);
    globe.setPolarity(polarity.table(origin, POL_DT, Math.ceil(POL_SPAN / POL_DT)), origin, POL_DT);
    polarityReady = true;
  }
  globe.setFields(m.elevRel, m.tfDraw, m.felsic, m.coast, m.normals, mode);
}
let polarityReady = false;

// ── The season, snow and ice ──
// Where a year lasts long enough to watch (below ~0.8 yr/s) the globe shows the season at the
// planet's clock, and the year's anomaly where a year lasts a second or more; above ~3 yr/s, the
// year's average (the share of it under snow or ice), and no anomaly. Between, it blends. (From 4 to
// 40 yr/s, as it was, the snow line and the sea ice swept through 4–40 seasons and as many years'
// anomalies a second, and flickered.) The rivers' months and the caption's date follow the season.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const seasonShown = () => 1 - smooth(-0.1, 0.5, Math.log10(rate()));
// The day: where it takes a few seconds (half shown at ~6 hours a second) the globe shows its night
// side, crossfading over half a decade of the dial (a day in ~7 s at DAY_LO, ~2 s at DAY_HI) as the
// scheduler crossfades summaries, so the terminator never sweeps by faster than the eye follows.
const DAY_LO = -3.4, DAY_HI = -2.9;
const dayShown = () => 1 - smooth(DAY_LO, DAY_HI, Math.log10(rate()));
const anomalyShown = () => (year.live > 0 ? Year.liveWeight(rate()) : 0) * (1 - smooth(0, 0.5, Math.log10(rate())));
let seasonDrawn = -1, seasonWeightDrawn = -1, climateVersionDrawn = -1, coldEaseStart = -1e9, season = null, anomDrawn = -1;
function refreshClimate(force) {
  if (!season) return;
  const tau = ((P.years % 1) + 1) % 1, nowMs = performance.now();
  const sw = seasonShown();
  // The year's anomaly, between its two step ends by the clock, where a year lasts long enough to see.
  const af = yearPhase(), aw = anomalyShown(), ak = aw * (1 + af);
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
// starts from the climate at the season, spins up for ~5 days at twice its
// share of the GPU's frame, then steps with the dial within that share; when
// the dial outruns it the globe crossfades to the climate's mean (the
// template's pressure and the mean rain), which is what weather averages to,
// and once it is wholly the mean the weather waits. A kernel writes the globe's
// weather fields each frame; the chart is read back and traced in a worker.
let wxBehind = 0, wxSeason = -1, wxVersion = -1, wxLive = 0, chart = null, lastChart = 0, lastMean = -1e9, chartBusy = false;
const SPINUP = SPINUP_DAYS * 86400;
const chartWorker = new Worker(new URL('./src/render/chart-worker.js', import.meta.url), { type: 'module' });
chartWorker.postMessage({ type: 'init', level: MESH_LEVEL, chartLevel: 6 });
// Each new chart is linked to the last and drawn morphing from it over about as long as charts take to come.
let chartGone = null, chartArrive = 0, chartSpan = 150;
chartWorker.onmessage = e => {
  const c = e.data, now = performance.now();
  if (c.type === 'air') { onAir(c); return; }
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
  if (!wx || climate.stats.cycles < 1) return;     // the weather starts from the climate's first cycle
  const tau = ((P.years % 1) + 1) % 1;
  wxForcing(tau);
  if (!wx.started) { wx.start(); wxBehind = 0; chart = chartGone = null; chartWorker.postMessage({ type: 'reset' }); }
  const budget = Math.max(1, Math.floor(WEATHER_GPU_MS / Math.max(0.02, wx.msPerStep)));
  if (wx.t < SPINUP) wx.advance(Math.min(Math.ceil((SPINUP - wx.t) / wx.dt), 2 * budget));
  else if (weatherLive() <= 0) wxBehind = 0;           // not shown: the climate's mean is
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
      // A blown-up run (a planet pushed far outside the model's range) starts again from the climate.
      if (!r.psi2.every(Number.isFinite)) { wx.started = false; chartBusy = false; chart = null; return; }
      const pres = new Float32Array(grid.n), landF = new Float32Array(grid.n);
      for (let i = 0; i < grid.n; i++) { pres[i] = climate.presAt(i, tau); landF[i] = climate.landMask[i]; }
      chartWorker.postMessage({ type: 'chart', ...r, pres, land: landF }, [r.psi2.buffer, r.theta.buffer, r.qv.buffer, pres.buffer, landF.buffer]);
    }, () => { chartBusy = false; });
  }
  drawDirty = true;
}

// ── The Air chart ──
// The Climate view's winds: the climate's surface wind (its template's pressure through
// src/engine/climate.js's `surfaceWind`) at the date the globe shows, or the year's mean where it
// shows the year, traced into streamlines in the chart's worker (src/render/streamlines.js) on a
// grid no finer than 110 km. Retraced when the drawn wind has moved (the climate, the date, the
// season's weight, the spin) or the zoom crosses an octave, one trace in flight and at most one
// every AIR_GAP ms while only the date moves, so each new set crossfades from the last whole.
const AIR_LEVEL = Math.min(LEVEL, 6), AIR_N = cellCount(AIR_LEVEL), AIR_FADE = 300, AIR_GAP = 450;
const DSEP = 0.075;                 // rad between streamlines (~28 px on a globe of 380), halved past an octave of zoom
const air = { cur: null, prev: null, at: -1e9, busy: false, sent: null, sentAt: -1e9, id: 0, maxWind: 0 };
const airShown = () => view === 'climate' && clMode === 'air';
function refreshAir() {
  if (!airShown() || air.busy || climate.version < 0) return;
  const now = performance.now(), tau = ((P.years % 1) + 1) % 1, sw = seasonShown();
  const k = Math.max(0, Math.min(1, Math.round(Math.log2(camera.radius(cssW, cssH) / 380))));
  const s = air.sent, dTau = s ? Math.abs(((tau - s.tau) % 1 + 1.5) % 1 - 0.5) : 1;
  const moved = !s || climate.version !== s.version || k !== s.k || Math.abs(sw - s.sw) > 0.05 || (sw > 0.02 && dTau > 1 / 48) || Math.abs(moon.Omega / s.omega - 1) > 0.003;
  if (!moved || (s && now - air.sentAt < AIR_GAP && climate.version === s.version && k === s.k)) return;
  // The pressure the globe's date shows (the template's six points' harmonics), blended toward the year's mean.
  const pres = new Float64Array(AIR_N), ph = climate.presPhase, NPH = ph.length;
  for (let i = 0; i < AIR_N; i++) {
    let m = 0;
    for (let q = 0; q < NPH; q++) m += ph[q][i];
    pres[i] = sw > 0 ? sw * climate.presAt(i, tau) + (1 - sw) * m / NPH : m / NPH;
  }
  air.sent = { version: climate.version, tau, sw, k, omega: moon.Omega };
  air.sentAt = now; air.busy = true;
  chartWorker.postMessage({ type: 'air', id: ++air.id, level: AIR_LEVEL, pres, omega: moon.Omega, dsep: DSEP / 2 ** k }, [pres.buffer]);
}
function onAir(m) {
  air.busy = false;
  const now = performance.now();
  // A set that arrives before the last has half faded in replaces it; the outgoing keeps fading.
  if (!(air.cur && now - air.at < 0.5 * AIR_FADE)) air.prev = air.cur;
  air.cur = m; air.at = now; air.maxWind = m.maxWind;
  drawDirty = true;
  caption(true);
}
/** The sets to draw this frame, the new one fading in over the old. */
function airFrame() {
  if (!airShown() || !air.cur) return null;
  const f = smooth(0, 1, (performance.now() - air.at) / AIR_FADE);
  if (f < 1) drawDirty = true;
  return { sets: [{ lines: air.prev && air.prev.lines, alpha: 1 - f, gap: air.prev && STREAM_GAP * air.prev.dsep }, { lines: air.cur.lines, alpha: f, gap: STREAM_GAP * air.cur.dsep }] };
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
// The People scenario's follow dial (below): while it holds the dial, the rate is its eased value.
const follow = { on: true, secs: 10, v: null, active: false };   // 10 s a doubling (a9)
function rate() { return 10 ** (follow.active && follow.on && follow.v != null ? follow.v : +els.dial.value); }
function syncDial() { els.dialOut.textContent = formatRate(rate()); }
els.dial.addEventListener('input', () => { follow.on = false; clampDial(); syncDial(); syncControls(); caption(true); figuresDirty = true; });
function setDial(v) { els.dial.value = String(v); clampDial(); syncDial(); }

// ── The views ──
// Three groups of maps, by timescale: Relief (the surface, the climate's zones, the air), Weather
// (its three charts and the tides) and People. The Weather group's maps run only at WX_TOP or
// slower, where the weather is live (weatherLive, below): its button is disabled faster, and in it
// the dial stops there (and doesn't follow the people).
const WX_TOP = -2.1;          // log₁₀ yr/s: ~2.9 days a second
const EARTH_DIAL = -0.3;      // log₁₀ yr/s: today's Earth opens at half a year a second
const GROUP = { relief: 'relief', climate: 'relief', weather: 'weather', tides: 'weather', people: 'people' };
const MAPS = { relief: ['relief', 'zones', 'air'], weather: ['pressure', 'temperature', 'humidity', 'tides'], people: ['settlement', 'density', 'knowledge', 'culture', 'states'] };
const lastMap = { relief: 'relief', weather: 'pressure', people: 'settlement' };
const mapOf = () => view === 'climate' ? clMode : view === 'weather' ? wxMode : view === 'tides' ? 'tides' : view === 'people' ? pmMode : 'relief';
function clampDial() { if (GROUP[view] === 'weather' && +els.dial.value > WX_TOP) els.dial.value = String(WX_TOP); }
const weatherLocked = () => GROUP[view] !== 'weather' && Math.log10(rate()) > WX_TOP + 1e-6;
// The Weather button disabled where it would show nothing, and the follow dial's switch as it stands,
// checked each frame (the follow dial moves the rate; the dial taken by hand turns it off).
let wxLockShown = null, followShown = null;
function syncControls() {
  const wl = weatherLocked();
  if (wl !== wxLockShown) { wxLockShown = wl; for (const b of els.views) if (b.dataset.group === 'weather') b.disabled = wl; }
  const fo = follow.on ? 'true' : 'false';
  if (fo !== followShown) { followShown = fo; els.followBtn.setAttribute('aria-pressed', fo); }
  els.followBtn.disabled = GROUP[view] === 'weather';
}

// ── The key ──
// Where the globe shows its night side, every map's key names the night, and with people their light.
let nightKeyed = false;
const nightKey = () => dayShown() > 0.5;
function drawTheKey() {
  nightKeyed = nightKey();
  if (!els.key.hidden) drawKey(els.keyCanvas, view === 'weather' ? `weather-${wxMode}` : view === 'climate' ? `climate-${clMode}` : view === 'people' ? `people-${pmMode}` : view, palette(),
    nightKeyed ? [['night', 'Night'], ...(people.drawn ? [['light', 'Lights']] : [])] : []);
}
function setKey(on) {
  els.key.hidden = !on;
  els.keyBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  drawTheKey();
}
els.keyBtn.addEventListener('click', () => setKey(els.key.hidden));
setKey(window.innerWidth > 860);

/** Show a view (relief, climate, weather, tides, people) at its current map; entering Weather brings the dial into its range. */
function setView(v) {
  if (v === 'people' && !people.worker) v = 'relief';
  view = v;
  const g = GROUP[v];
  if (g === 'weather') { follow.on = false; clampDial(); syncDial(); }
  lastMap[g] = mapOf();
  for (const b of els.views) b.setAttribute('aria-checked', b.dataset.group === g ? 'true' : 'false');
  for (const p of els.mapPickers) p.hidden = p.dataset.maps !== g;
  for (const b of els.maps) b.setAttribute('aria-checked', b.dataset.map === mapOf() ? 'true' : 'false');
  drawTheKey();
  if (v === 'weather') {
    // A weather run under an earlier spin starts again under this one (the Moon's tides lengthen the day).
    if (wx && Math.abs(wx.Omega / moon.Omega - 1) > 0.003) wx.setSpin(moon.Omega);
    refreshWeather(true);
  }
  if (v === 'climate') refreshAir();
  syncControls();
  drawDirty = true;
  caption(true);
}
/** The Culture map's fields or the States map's into the globe's (they share its buffer). */
function peopleC() { if (globe && people.ids) globe.setPeopleC(pmMode === 'states' && people.st ? people.st : people.ids, people.grid); }
/** Show a map by name (MAPS). */
function setMap(m) {
  if (m === 'zones' || m === 'air') { clMode = m; setView('climate'); }
  else if (m === 'pressure' || m === 'temperature' || m === 'humidity') { wxMode = m; setView('weather'); }
  else if (m === 'tides') setView('tides');
  else if (m === 'settlement' || m === 'density' || m === 'knowledge' || m === 'culture' || m === 'states') { pmMode = m; setView('people'); peopleC(); }
  else setView('relief');
}
/** Show a group at the map it last showed; Weather only where it's live. */
function setGroup(g) {
  if ((g === 'weather' && weatherLocked()) || (g === 'people' && !people.worker)) return;
  setMap(lastMap[g]);
}
/** The next map in the group shown. */
function nextMap() { const ms = MAPS[GROUP[view]]; setMap(ms[(ms.indexOf(mapOf()) + 1) % ms.length]); }
// A view the reader picks stays: the People scenario's dry run opens the People view only if they haven't.
let viewChosen = false;
for (const b of els.views) b.addEventListener('click', () => { viewChosen = true; setGroup(b.dataset.group); });
for (const b of els.maps) b.addEventListener('click', () => { viewChosen = true; setMap(b.dataset.map); });

// ── Scenarios ──
// Two, each from the planet's opening (choosing one reloads, keeping the seed; ?scenario=people for
// the second): the planet alone, and people on it. The People scenario holds its planet at the
// opening while it loads and its climate settles (the climate, the cover, the lakes and the sea come
// to their balance, the climate's cycles back to back), then the first people come, the clock runs,
// the dial follows them, and their view, Fig. 8's tab and the follow dial's switch appear.
const scenario = query.get('scenario') === 'people' ? 'people' : 'world';
const peopleOn = () => scenario === 'people';
for (const b of els.scenarios) {
  b.setAttribute('aria-checked', b.dataset.scenario === scenario ? 'true' : 'false');
  b.addEventListener('click', () => {
    if (b.dataset.scenario === scenario) return;
    const q = new URLSearchParams(location.search);
    if (b.dataset.scenario === 'people') q.set('scenario', 'people'); else q.delete('scenario');
    q.delete('ending');
    location.search = q.toString();
  });
}
// A new planet: the link without its seed, in the same scenario.
$('new-planet').addEventListener('click', () => {
  const q = new URLSearchParams(location.search);
  q.delete('seed'); q.delete('ending');
  location.search = q.toString();
});
function showPeopleParts() {
  const on = !!people.worker;
  for (const b of els.views) if (b.dataset.group === 'people') b.hidden = !on;
  els.peopleTab.hidden = !on;
  els.followBtn.hidden = !on;
}
function setFollow(on) { if (GROUP[view] === 'weather') return; follow.on = on; follow.v = null; syncControls(); caption(true); }
els.followBtn.addEventListener('click', () => setFollow(!follow.on));

// ── The people (the People scenario) ──
// Their thread, its last report (the clock, what's owed, the record's last row, the ending), the
// drawn fields, the years sent since that report, and the follow dial: the rate at which a
// doubling (or halving) of what moves fastest takes `secs` seconds (People.pace), within the
// dial's range and what the people keep up with, eased; the dial taken by hand ends it.
const people = { worker: null, msg: null, sent: 0, events: [], link: null, grid: null };
const PEOPLE_LEVEL = Math.min(6, LEVEL);
function startPeople() {
  const w = people.worker = new Worker(new URL('./src/engine/people-worker.js', import.meta.url), { type: 'module' });
  const ch = new MessageChannel();
  const params = query.get('ending') ? { ENDING: query.get('ending') } : {};   // &ending=1a (1b, 2a, 2b) forces the ending
  w.postMessage({ type: 'init', level: PEOPLE_LEVEL, port: ch.port2, params, seed, earth: isEarth(seed) }, [ch.port2]);
  engine.postMessage({ type: 'people', port: ch.port1 }, [ch.port1]);
  people.grid = PEOPLE_LEVEL === LEVEL ? grid : buildGrid(PEOPLE_LEVEL);
  w.onmessage = e => {
    const m = e.data;
    if (m.type === 'people') {
      // The first people: the People view opens, unless the reader has picked one in the dry run.
      if (!people.msg && !viewChosen && GROUP[view] !== 'weather') setView('people');
      people.msg = m; people.sent = 0; if (m.events.length) people.events.push(...m.events); caption(false); figuresDirty = true;
    }
    else if (m.type === 'figure') { people.fig = m.fig; people.pyr = m.pyr; people.pyrRef = m.pyrRef; figuresDirty = true; }
    else if (m.type === 'routes') { people.routes = m; drawDirty = true; }
    else if (m.type === 'borders') { people.borders = m; drawDirty = true; }
    else if (m.type === 'drawn') {
      people.drawn = m.d; people.past = m.l; people.ids = m.c; people.st = m.s; people.zf = m.zf;
      if (globe) { globe.setPeople(m.d, people.grid); globe.setPeopleB(m.l, people.grid); peopleC(); }
      drawDirty = true;
    }
  };
  w.onerror = e => console.warn('[isochron] people:', e.message);
  showPeopleParts();
}
/** Years the people are owed: their last report's, and what was sent since. */
const peopleOwed = () => (people.msg ? people.msg.owed + people.sent : 0);
/** The follow dial's aim (log₁₀ yr/s), or null. */
function followAim() {
  const m = people.msg;
  if (!m) return null;
  const top = Math.min(+els.dial.max, Math.log10(Math.max(1e-3, m.cap)));
  // Before the tip, at least 5 kyr/s: the first people's spread over their continent doubles
  // every few decades, and at the control's seconds a doubling it took most of the run's first minute.
  const floor = m.era === 'first people' ? Math.log10(5e3) : -Infinity;
  const want = Math.max(floor, m.pace > 0 ? Math.log10(Math.LN2 / (m.pace * follow.secs)) : top);
  return Math.max(+els.dial.min, Math.min(top, want));
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
  // The year (the planet's, or with people their own, from the first people), the date where the
  // globe shows the season, and with people how many and the largest city. The view names itself;
  // the margin's figures carry the rest. Nothing while the People scenario's planet settles.
  if (!shown || (peopleOn() && !(people.msg && people.msg.last))) { setCaption('', true); return; }
  const m = people.msg, h = m && m.last, parts = [h ? `year ${Math.floor(m.t).toLocaleString('en')}` : formatTime(P.years)];
  if (seasonShown() >= 0.5) parts.push(rate() < 0.05 ? dateOf(((P.years % 1) + 1) % 1) : monthName(((P.years % 1) + 1) % 1));
  if (h) {
    const st = m.off && m.off.stars;
    parts.push(`${headcount(h.earth)} people` + (h.space >= 1e3 ? `, ${headcount(h.space)} off-planet` : '') + (st && st.people >= 1e3 ? `, ${headcount(st.people)} at other stars` : ''));
    if (m.city >= 1e5) parts.push(`largest city ${headcount(m.city)}`);
    // The Culture map counts the peoples (src/engine/peoples.js, `count`).
    if (view === 'people' && pmMode === 'culture' && h.peoples > 0) parts.push(`≈ ${Math.round(+h.peoples.toPrecision(2)).toLocaleString('en')} peoples`);
    // The States map counts the states (src/engine/polities.js, `count`).
    if (view === 'people' && pmMode === 'states' && h.states > 0) parts.push(`≈ ${Math.round(+h.states.toPrecision(2)).toLocaleString('en')} ${Math.round(h.states) === 1 ? 'state' : 'states'}`);
  }
  setCaption(parts.join(' · '), true);
}

/** "3.2 billion", "41 million", "12,000". */
const headcount = v => (v >= 1e12 ? count(v) : v >= 1e9 ? `${(v / 1e9).toPrecision(3)} billion` : v >= 1e6 ? `${(v / 1e6).toPrecision(3)} million` : Math.round(+v.toPrecision(2)).toLocaleString('en'));
/** "3.2 Myr", "41 kyr", "530 yr", "6.1 days", "3.0 h". */
function span(y) {
  const a = Math.abs(y);
  const p2 = v => (+v.toPrecision(2)).toLocaleString('en');   // "160", not "1.6e+2"
  if (a >= 1e6) return `${p2(a / 1e6)} Myr`;
  if (a >= 1e3) return `${p2(a / 1e3)} kyr`;
  if (a >= 1) return `${p2(a)} yr`;
  if (a * 365.25 >= 1) return `${p2(a * 365.25)} days`;
  return `${p2(a * 8766)} h`;
}
// ── Fig. 2: the model, with its live fluxes (a layer that isn't stepping has no value, and is left out) ──
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
      ocean: `${P.ocean.stats.maxSv.toFixed(0)} Sv`, weather: view === 'weather' && wxLive > 0 && chart ? `${chart.lows.length} lows` : null,
      orbit: `tilt ${(P.orbit.at(P.years / 1000).obliquity * 180 / Math.PI).toFixed(1)}°`,
      landscape: `${land.flux.eroded.toFixed(1)} km³/yr`, zones: `B ${Math.round(100 * bShare / (la || 1))}%`,
      tides: tide ? `${(moon.P / 1e12).toFixed(1)} TW` : null,
      year: year.live > 0 ? `${yearMean >= 0 ? '+' : '−'}${Math.abs(yearMean).toFixed(2)} K` : null,
      volcanoes: year.live > 0 ? `τ ${year.aod.toFixed(3)}` : null,
      ground: `soil ${Math.round(100 * ground.wet)}%`, lakes: `${Math.round(lakes.area / 1e3)}k km²`,
      veg: `${Math.round(100 * L.trees)}% trees`, seaC: `CCD ${(seaC.ccd / 1000).toFixed(1)} km`,
      regolith: reg ? `${reg.mean.toFixed(1)} m` : null,
      dust: climate.dust ? Tg(climate.dust.emission) : null,
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
      { from: 'climate', to: 'ice', w: snow / 1e9 / 4000, label: `${Math.round(snow / 1e9)} km³/yr`, on: snow > 0 },
      { from: 'ice', to: 'climate', w: iceArea / 1e12 / 20, label: 'albedo', on: iceArea > 0 },
      { from: 'ice', to: 'sea', w: ice.stats.seaLevel / 100, label: `−${Math.round(ice.stats.seaLevel)} m`, on: ice.stats.seaLevel > 0.5 },
      // The ground: rain in, evaporation (its efficiency) and runoff out; the lakes from its runoff, in the landscape's basins behind the ice's dams.
      { from: 'climate', to: 'ground', w: rain / (la || 1) / 1.5, label: `${Math.round(1000 * rain / (la || 1))} mm/yr`, bend: 0.35 },
      { from: 'ground', to: 'climate', w: ground.beta, label: `β ${ground.beta.toFixed(2)}`, bend: 0.35 },
      { from: 'year', to: 'ground', w: 0.4 * ground.live, bend: 0.1 },
      { from: 'ground', to: 'landscape', w: run / (la || 1) / 0.5, label: `${Math.round(1000 * run / (la || 1))} mm/yr`, bend: -0.05 },
      { from: 'ground', to: 'lakes', w: lakes.inflow / 1500, label: `${Math.round(lakes.inflow)} km³/yr`, bend: 0.05 },
      { from: 'landscape', to: 'lakes', w: 0.25, label: 'basins', bend: 0.1 },
      { from: 'ice', to: 'lakes', w: 0.25, label: 'dams', bend: -0.1, on: iceArea > 0 },
      { from: 'lakes', to: 'climate', w: lakes.area / 1e6, label: 'open water', bend: -0.25 },
      { from: 'landscape', to: 'sea', w: land.flux.toSea / 6, label: `${land.flux.toSea.toFixed(1)} km³/yr`, bend: 0.08 },
      { from: 'climate', to: 'carbon', w: cf.weather / 0.2, label: `${fmt(cf.weather, 3)} Pg/yr` },
      { from: 'carbon', to: 'climate', w: Math.abs(forcing) / 6, label: `${forcing >= 0 ? '+' : '−'}${Math.abs(forcing).toFixed(1)} W/m²` },
      { from: 'plates', to: 'carbon', w: cf.out / 0.2, label: `${fmt(cf.out - cf.lip, 3)} Pg/yr`, red: true },
      { from: 'plumes', to: 'carbon', w: cf.lip / 0.5, label: `${fmt(cf.lip || 0, 3)} Pg/yr`, red: true, bend: 0, on: cf.lip > 0.001 },
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
      { from: 'landscape', to: 'seaC', w: (L.bio ?? 1) / 2, label: `${(L.bio ?? 1).toFixed(2)}×`, bend: -0.1 },
      { from: 'plates', to: 'seaC', w: (cf.arc || 0) / 0.1, bend: 0.1 },
      // The regolith: the ice strips it and lays till, the rivers strip it; it softens the ice's bed, holds the
      // soil's water and feeds weathering fresh rock. The ice's outwash is the rivers' sediment; loads bend the crust.
      ...(reg ? [
        { from: 'ice', to: 'regolith', w: reg.glacial / 0.1, label: `${reg.glacial.toFixed(2)} mm/yr`, bend: 0.15, on: reg.glacial > 0.005 },
        { from: 'regolith', to: 'ice', w: reg.iceBed, label: `bed ${reg.iceBed.toFixed(2)}`, bend: 0.15, on: iceArea > 0 },
        { from: 'landscape', to: 'regolith', w: 0.2, bend: -0.1 },
        { from: 'regolith', to: 'ground', w: (P.agg?.cap || 0) / 300, label: `${Math.round(P.agg?.cap || 0)} mm`, bend: -0.2 },
        { from: 'regolith', to: 'carbon', w: (P.agg?.supply || 0) / 1.5, label: `supply ${(P.agg?.supply || 0).toFixed(2)}`, bend: 0.1 },
        { from: 'ice', to: 'landscape', w: (land.flux.outwash || 0) / 0.5, label: `${(land.flux.outwash || 0).toFixed(2)} km³/yr`, bend: -0.15, on: land.flux.outwash > 0.005 },
      ] : []),
      ...(P.flex ? [{ from: 'landscape', to: 'plates', w: P.flex.rms / 300, label: `±${Math.round(P.flex.rms)} m`, bend: -0.25 }] : []),
      { from: 'ice', to: 'plates', w: 0.3, label: 'bed', bend: 0.25, on: ice.stats.area > 0 },
      // Dust: lifted by the climate's winds from bare, dry ground (the cover), dry lake beds and the ice's outwash;
      // it scatters sunlight, darkens snow and ice (faster melt), brings the cold sea iron and settles as loess.
      ...(D ? [
        { from: 'climate', to: 'dust', w: D.emission / 3000, label: 'wind', bend: 0.05 },
        { from: 'veg', to: 'dust', w: D.fromBare / 2000, label: D.fromBare >= 1 ? Tg(D.fromBare) : '', bend: 0.1 },
        { from: 'lakes', to: 'dust', w: D.fromSalt / 100, label: Tg(D.fromSalt), bend: -0.15, on: D.fromSalt >= 1 },
        { from: 'ice', to: 'dust', w: D.fromOutwash / 100, label: Tg(D.fromOutwash), bend: 0.1, on: D.fromOutwash >= 1 },
        { from: 'dust', to: 'climate', w: Math.abs(D.forcing) / 0.2, label: Wm(D.forcing), bend: 0.05 },
        { from: 'dust', to: 'ice', w: (D.dark || 0) / 0.01, label: `α −${(D.dark || 0).toFixed(3)}`, bend: -0.1, on: D.dark >= 5e-4 },
        { from: 'dust', to: 'seaC', w: Math.abs((D.iron || 1) - 1) / 0.3 + 0.1, label: `iron ${(D.iron || 1).toFixed(2)}×`, bend: -0.1 },
        { from: 'dust', to: 'regolith', w: (D.loess || 0) / 1000, label: `loess ${Tg(D.loess || 0)}`, bend: 0.1, on: D.loess >= 1 },
      ] : []),
      // The runaway (src/engine/runaway.js): past the outgoing longwave's limit, the climate boils the sea.
      ...(runaway && runaway.boiled > 0 ? [{ from: 'climate', to: 'sea', w: runaway.boiled, label: `${Math.round(100 * runaway.boiled)}% boiled`, bend: 0.2 }] : []),
    ],
  };
}

// ── Fig. 2 with people: their economy (src/render/economy.js), the planet's side from the mirrors ──
const peopleModel = () => !!(people.msg && people.msg.last);
function economyInputs() {
  const { rain = 0, la = 1 } = P.agg || {};
  return { m: people.msg, npp: life ? life.npp : 0, meanT: climate.stats.meanT, pco2: carbon.pco2, pco20: CARBON.PCO2_0, rain, la,
    boiled: runaway ? runaway.boiled : 0, farmed: people.link ? people.link.farmed : 0 };
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
    els.capHyps.textContent = `Hypsometry · land ${Math.round(100 * tecStats.land)}% · mean height ${(lh / la).toFixed(2)} km · mean depth ${(sd / sa).toFixed(1)} km`;
  }
  if (visible(els.figModel)) {
    if (peopleModel()) {
      drawModel(els.figModel, { nodes: ECONOMY, ...economyOf(economyInputs()) }, pal);
      els.capModel.textContent = economyCaption(people.msg);
    } else {
      drawModel(els.figModel, modelSnapshot(), pal);
      const cf = carbon.flux;
      els.capModel.textContent = `The model · outgassing ${cf.out.toFixed(3)} and weathering ${cf.weather.toFixed(3)} Pg C/yr · erosion ${land.flux.eroded.toFixed(1)} km³/yr`;
    }
  }
  if (visible(els.figPeople)) {
    const fg = people.fig;
    drawPeople(els.figPeople, fg, pal);
    const fit = fg && fg.fit;
    const left = fg ? fg.tStar - fg.now : 0;
    els.capPeople.textContent = !fg ? 'The people' : `The people · t* ${left > 0 ? `in ${span(left)}` : `${span(-left)} ago`}` +
      (fit ? ` · ${fg.which === 'minds' ? "minds'" : "people's"} exponent ${fit.p.toFixed(2)}, R² ${fit.r2.toFixed(2)} (an exponential's ${fit.r2exp.toFixed(2)})` : '');
  }
  if (visible(els.figAges)) {
    drawAges(els.figAges, people.pyr, people.pyrRef, pal);
    els.capAges.textContent = agesCaption(people.pyr);
  }
  // Fig. 10 once anything is off-world.
  const sys = peopleModel() ? systemOf(people.msg) : null;
  if (els.figSystemWrap.hidden !== !sys) els.figSystemWrap.hidden = !sys;
  if (sys && visible(els.figSystem)) {
    drawSystem(els.figSystem, sys, pal, solar);
    els.capSystem.textContent = systemCaption(sys, solar);
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
  follow.on = false;
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
    { key: '1', group: 'View', label: 'Relief', action: () => { viewChosen = true; setGroup('relief'); } },
    { key: '2', group: 'View', label: 'Weather', action: () => { viewChosen = true; setGroup('weather'); } },
    { key: '3', group: 'View', label: 'People', action: () => { viewChosen = true; setGroup('people'); } },
    { key: 'm', group: 'View', label: 'Next map', action: () => { viewChosen = true; nextMap(); } },
    { key: 'f', group: 'Simulation', label: 'Follow the people', action: () => { if (people.worker) setFollow(!follow.on); } },
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
        'and a carbon cycle in which volcanoes supply CO₂ and the weathering of rock takes it back. ' +
        'In the People scenario, people spread over it from the first of them, farm, industrialize and build minds of their own, and the planet answers.',
      controls: [
        { label: 'Turn the globe', value: 'Drag' },
        { label: 'Zoom', value: 'Scroll, pinch, or = - 0' },
        { label: 'Rate', value: 'The dial, or [ and ]' },
        { label: 'View', value: 'Relief, Weather, or People in its scenario; or 1 to 3, and M for the next map' },
        { label: 'Scenario', value: 'World or People, beside the caption' },
        { label: 'Follow', value: 'With people, the dial follows them until it is taken; Follow or F again' },
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
const held = {};   // frames played, by what held the clock (the engine's steps, the people's, the People opening) or free
let profT = 0;
const lap = k => { const t = performance.now(); prof[k] = 0.95 * (prof[k] || 0) + 0.05 * (t - profT); profT = t; };
function tick(now) {
  // A frame's timestamp can precede the clock's start (or a driven tick's): never step backward.
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  const frameDt = Math.max(0, Math.min(0.25, (now - last) / 1000));   // the shown moment keeps real time
  last = Math.max(last, now);
  profT = performance.now();
  if (playing) {
    // The follow dial: eased toward the people's doubling time.
    // (Its eased value is kept apart from the dial's input, which snaps to its step.)
    if (people.worker && follow.on) {
      const aim = followAim();
      if (aim !== null) {
        if (follow.v == null) follow.v = +els.dial.value;
        follow.active = true;
        follow.v += (aim - follow.v) * (1 - Math.exp(-dt / 0.6));
        setDial(follow.v);
      }
    }
    syncControls();
    // Plate steps: a tenth of a second's worth of the dial, between 50 kyr and 0.5 Myr, and
    // no shorter than the engine can keep up with; the clock waits while it is two steps behind,
    // or while the people are owed more than a quarter second's worth.
    const keep = rate() * engineMsPerStep / 1000 * 1.3;
    scheduler.layers[0].step = Math.min(PLATE_STEP, Math.max(5e4, rate() / 10, keep));
    // The People scenario holds the planet at its opening while its climate settles (the climate's
    // cycles run back to back on the engine's thread meanwhile), then runs from the first people.
    const heldBy = stepsSent - stepsDone >= 2 ? 'engine' : !engineOpened || (peopleOn() && !people.msg) ? 'opening' : people.msg && peopleOwed() > Math.max(0.25 * rate(), 1e-4) ? 'people' : null;
    const behind = heldBy !== null;
    if (heldBy) held[heldBy] = (held[heldBy] || 0) + 1; else held.free = (held.free || 0) + 1;
    const { dt: adv, plan } = scheduler.advance(behind ? 0 : rate() * dt);
    P.years += adv;
    const p = plan[0];
    // The engine's tick: the years, the plate steps, and the orbit the climate sees
    // (averaged over what the dial passes in ~2 s).
    if (engineStarted && adv > 0) { engine.postMessage({ type: 'tick', adv, steps: Array(Math.max(0, p.steps)).fill(p.step), window: rate() * 2, rate: rate() }); stepsSent += Math.max(0, p.steps); }
    if (people.msg && adv > 0) { people.worker.postMessage({ type: 'tick', adv }); people.sent += adv; }
    if (view === 'weather') stepWeather(adv);
    figuresDirty = true;
    drawDirty = true;
  }
  lap('weather');
  if (climateDirty || playing || performance.now() - coldEaseStart < 900) { refreshClimate(climateDirty); climateDirty = false; }
  lap('season');
  if (view === 'weather' && wx && (playing || !wx.started || wx.t < SPINUP)) { if (!playing) stepWeather(0); refreshWeather(); }
  if (airShown()) refreshAir();
  if (playing && rate() < 20) drawDirty = true;   // the sky, the Sun, the Moon, the tide and the rivers' months move at a slow dial
  if (playing && year.live > 0 && year.eruptions.length) drawDirty = true;   // eruptions come and fade
  if (playing) caption(false);
  if (nightKey() !== nightKeyed) drawTheKey();
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
    // Each boundary is turned with its plates to the shown moment and morphed from its
    // predecessor's course; rivers turn and fade (below).
    // A line wholly behind the globe is neither placed nor drawn (`hidden`).
    const cm = camera.m, w = [0, 0, 0];
    if (lines) for (const ln of lines) {
      const a = tec.plates[ln.left], b = tec.plates[ln.right];
      w[0] = 0.5 * (a.w[0] + b.w[0]); w[1] = 0.5 * (a.w[1] + b.w[1]); w[2] = 0.5 * (a.w[2] + b.w[2]);
      ln.hidden = view === 'climate' || view === 'tides' || view === 'weather' || view === 'people' || !capFaces(ln, w, tShow - linesT, cm);
      if (ln.hidden) continue;
      placeLine(ln, w, tShow - linesT, tShow - ln.prevT, phi);
      ln.shownU = shownU(ln, phi);
    }
    if (rivers) {
      // Rivers turn with their plates from the last retrace's moment (the old ones fading out
      // too, so a course that stays and the one it covers coincide), and fade point by point.
      const phiR = riverPhi(tShow);
      if (phiR >= 1 && riversFading) { riversFading = false; riversGone = []; for (const rv of rivers) rv.fa0 = rv.fa1 = null; }
      for (const rv of riversGone.length ? rivers.concat(riversGone) : rivers) {
        const pl = tec.plates[rv.plate];
        if (rv.fa0) {
          const a = rv.shownA && rv.shownA.length === rv.fa0.length ? rv.shownA : (rv.shownA = new Float32Array(rv.fa0.length));
          for (let k = 0; k < a.length; k++) a[k] = rv.fa0[k] + (rv.fa1[k] - rv.fa0[k]) * phiR;
        } else rv.shownA = null;
        if (!pl || !pl.alive) { rv.shown = rv.P; rv.hidden = false; continue; }
        rv.hidden = !capFaces(rv, pl.w, tShow - riversT, cm);
        if (!rv.hidden) placeLine(rv, pl.w, tShow - riversT, 0, 1);
      }
    }
    lap('lines');
    const sf = lastSky = skyFrame(), yf = yearFrame();
    if (yf.marks.length) drawDirty = true;
    globe.draw(camera, tShow, pal, { view, wx: wxMode, cl: clMode, pm: pmMode, blend: phi, tides: sf.tides, veil: yf.veil, sulf: yf.coal, steam: runaway ? 0.8 * (1 - Math.exp(-runaway.steam / 30)) : 0, fronts: people.zf, sun: sf.day });
    lap('globe');
    drawOverlay(octx, cssW, cssH, dpr, camera, { boundaries: lines, rivers: rivers && riversGone.length ? rivers.concat(riversGone) : rivers, plumes, view, chart: view === 'weather' && chart && wx ? chartFrame(chart, chartGone, Math.min(1, (performance.now() - chartArrive) / chartSpan), wx.t) : null, chartFade: wxLive, wxNow: null, sky: sf.sky, riverMonth: riverMonth(), eruptions: yf.marks, air: airFrame(), routes: view === 'people' && pmMode === 'knowledge' ? people.routes : null, borders: view === 'people' && pmMode === 'states' ? people.borders : null }, pal);
    if (phi >= 1 && !globe.lakesEasing && !riversFading) drawDirty = false;
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
  else if (m.type === 'climate') {
    climate.update(m); engineOpened = !!m.opened; climateDirty = true; figuresDirty = true; caption(false);
    if (peopleOn() && !people.worker && climate.stats.settled > 0) startPeople();   // the dry run over
  }
  else if (m.type === 'fast') onFast(m);
  else if (m.type === 'tides') onTides(m);
  else if (m.type === 'year') onYear(m);
  else if (m.type === 'lakes') onLakes(m);
  else if (m.type === 'cover') onCover(m);
  else if (m.type === 'sulfate') { sulfPattern = m.pat; if (globe) globe.setSulfate(m.pat); drawDirty = true; }
};
engine.onerror = e => console.warn('[isochron] engine:', e.message);

// Today's Earth opens at half a year a second: its seasons over its own continents (faster, its plates
// leave Earth's map for the sim's balance within a few Myr).
if (isEarth(seed) && !peopleOn()) els.dial.value = String(EARTH_DIAL);
syncDial();
showPeopleParts();
syncControls();
engine.postMessage({ type: 'init', seed, level: LEVEL });
engineStarted = true;
engine.postMessage({ type: 'play', playing });

gpuDevice().then(device => createGlobe(els.gpu, mesh, grid, device)).then(g => {
  globe = g;
  season = new GpuSeason(g.device, grid, g.climBuffer);
  wx = new GpuWeather(g.device, mesh, seed, g.refiner, moon.Omega);
  if (tide) g.setTides(tide.C, tide.S, tide.diss);
  if (lakesDrawn) g.setLakes(lakesDrawn.draw, lakesDrawn.salt, lakesDrawn.tint);
  if (coverDrawn) g.setCover(coverDrawn);
  if (people.drawn) { g.setPeople(people.drawn, people.grid); g.setPeopleB(people.past, people.grid); peopleC(); }
  if (sulfPattern) g.setSulfate(sulfPattern);
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

window.__isochron = { P, engine, grid, tec, land, climate, ice, carbon, plumes, polarity, camera, scheduler, setPlaying, setView, setMap, setDial, get wx() { return wx; }, get globe() { return globe; }, get tau() { return tau; }, get pace() { return { engineRate, pace, arrivals: arrivals.length, shownFrom, shownT: shown && shown.t, newest: queue.length ? queue[queue.length - 1].t : null, held }; }, get engineProf() { return engineProf; }, get queued() { return queue.length; }, tick, prof, get chart() { return chart; }, get sky() { return lastSky; }, get moon() { return moon; }, year, get lakes() { return lakesDrawn; }, get air() { return air; }, get lines() { return lines; }, get rivers() { return rivers; }, people, follow, get runaway() { return runaway; }, get econ() { return people.msg && people.msg.last ? economyInputs() : null; }, get sulfate() { return sulfPattern; } };
