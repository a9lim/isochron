// The planet's engine thread. The page keeps the clock and draws; this runs
// everything else on the CPU (plates, plumes, landscape, ice, carbon, the
// climate's cycles) and prepares what is drawn from it (the surface's fields,
// the boundaries and rivers traced into lines), posting snapshots back:
//
//   surface   after plate steps, or when the sea has moved: the drawn fields,
//             the lines, the plates' rotations, the crust's statistics
//   climate   after each completed climate cycle: its harmonics and zones
//   fast      ~10 times a second: ice, carbon, plumes, the record's samples
//
//   year      after each of the year's steps (src/engine/year.js, live below
//             ~100 yr/s): the anomaly at the step's end on the engine's grid,
//             the step's two ends, the veil's bands, the eruptions; the page
//             draws between the ends by its own clock
//
//   tides     after each solve of the tide (every ~2 Myr, or when the day has
//             drifted): the semidiurnal harmonic and the dissipation, per unit
//             equilibrium tide, on the engine's grid
//
// The page sends a tick each frame it plays (the years to advance and the
// plate steps its scheduler planned) and the experiments' parameters.
import { Planet, CLIMATE, CARBON } from './planet.js';
import { PARAMS } from './plates.js';
import { PLUMES } from './plumes.js';
import { VOLC } from './volcanoes.js';
import { Year, YEAR } from './year.js';
import { monthAt } from './orbit.js';
import { accumulate } from './landscape.js';
import { NZ } from './climate.js';
import { surfaceFields } from '../render/surface.js';
import { traceBoundaries } from '../render/lines.js';
import { traceRivers } from '../render/rivers.js';
import { gpuDevice } from '../gpu/device.js';
import { GpuIce } from '../gpu/ice.js';
import { GpuMoisture } from '../gpu/moisture.js';
import { GpuTides } from '../gpu/tides.js';
import { buildGrid } from '../grid/icosphere.js';
import { makeTransfer, prolong } from '../grid/transfer.js';

const CLIMATE_MS = 10, ICE_MS = 4;
let P = null, playing = false, pending = 3, scheduled = false, tides = null;
const ticks = [];
let samples = [], lastFast = 0, lastSeaCheck = 0, seaSent = 0, riversSteps = -1, stepYears = 0, stepsDone = 0, msPerStep = 50;
let yearSent = -1, yearLiveSent = -1, eruptId = null, eruptWaiting = null, riversId = 0, riversCells = null, riversQ12 = null, lastRate = 1;

const post = (m, transfer = []) => self.postMessage(m, transfer);
const ch = new MessageChannel();
ch.port1.onmessage = pump;
function schedule() { if (!scheduled) { scheduled = true; ch.port2.postMessage(0); } }

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') {
    P = new Planet(m.seed, { level: m.level });
    apply(m.params);
    // The engine's own GPU device, for the ice (and the climate's heavy solves).
    gpuDevice().then(device => {
      P.iceGpu = new GpuIce(device, P.ice); P.climate.gpu = new GpuMoisture(device, P.grid);
      // The tide at level 6 at most (its cells nest first in a finer grid), so the Moon recedes alike at every level.
      const tg = P.grid.level > 6 ? buildGrid(6) : P.grid;
      tides = { gpu: new GpuTides(device, tg), T: tg === P.grid ? null : makeTransfer(P.grid, tg), at: -Infinity, running: false };
      schedule();
    }, err => console.warn('[isochron] engine GPU:', err.message));
    post({ type: 'ready', seaLevel0: P.seaLevel0, years: P.years, pco2: P.carbon.pco2 });
    sendSurface(false);
    sendFast(true);
  } else if (m.type === 'tick') ticks.push(m);
  else if (m.type === 'params') { apply(m.params); pending = Math.max(pending, 2); }
  else if (m.type === 'play') playing = m.playing;
  else if (m.type === 'climate') pending = Math.max(pending, m.cycles);
  schedule();
};

function apply(p) {
  if (!p) return;
  Object.assign(CLIMATE, p.CLIMATE || {}); Object.assign(CARBON, p.CARBON || {}); Object.assign(PARAMS, p.PARAMS || {}); Object.assign(VOLC, p.VOLC || {});
  // An experiment that holds CO₂ where it stands.
  if (CARBON.FIXED === 'now') CARBON.FIXED = Math.round(P.carbon.pco2);
  // The Eruption experiment: one tagged eruption each time its size is set, once the climate
  // is warm (the anomaly's heat capacity reads its land and sea ice).
  if (p.ERUPT && p.ERUPT.id !== eruptId) { eruptId = p.ERUPT.id; eruptWaiting = p.ERUPT.M; }
}
function eruptWhenWarm() {
  if (eruptWaiting !== null && P.climate.stats.cycles >= 2) { P.year.eruptTagged(eruptWaiting, P.years); eruptWaiting = null; }
}

function pump() {
  scheduled = false;
  if (!P) return;
  // Ticks first, all of them (a slow step coalesces the frames behind it).
  let stepped = 0;
  const t0 = performance.now();
  let ta = performance.now();
  const lap = k => { const tb = performance.now(); prof[k] = (prof[k] || 0) + tb - ta; ta = tb; };
  eruptWhenWarm();
  while (ticks.length) {
    const m = ticks.shift();
    lastRate = m.rate ?? m.window / 2;
    P.years += m.adv;
    for (const dt of m.steps) { P.plateStep(dt); stepYears += dt; stepped++; pending = Math.max(pending, 1); }
    lap('plates');
    P.setOrbit(m.window);
    P.fast(m.adv, ICE_MS, m.rate ?? m.window / 2);
    lap('fast');
    if (m.adv > 0) samples.push(P.years, ...P.sample());
    lap('sample');
  }
  const now = performance.now();
  if (stepped) {
    sendSurface(true, stepped, performance.now() - t0);
    lap('surface');
  }
  else if (now - lastSeaCheck > 250) {
    // Ice moves the sea; the coast is redrawn when it has moved a few metres.
    lastSeaCheck = now;
    if (Math.abs(P.tec.seaLevel - seaSent) > 0.004) sendSurface(false);
    lap('sea');
  }
  if (P.year.steps !== yearSent || (P.year.live > 0) !== yearLiveSent) { sendYear(); lap('year'); }
  if (now - lastFast > 100) { sendFast(false); lap('fastMsg'); }
  if ((playing || pending > 0) && !climateRunning) climateLoop();
  solveTides();
  if (ticks.length) schedule();
}

// The climate runs alongside: a slice of its cycle at a time, awaiting the GPU's work
// where the cycle hands it some, and letting the ticks in between slices.
let climateRunning = false, cycleStart = 0, cycleMs = 0;
const prof = {};                   // ms spent per section since the last fast message, for tuning
const nextTask = () => new Promise(res => { const c = new MessageChannel(); c.port1.onmessage = () => res(); c.port2.postMessage(0); });
async function climateLoop() {
  climateRunning = true;
  const c = P.climate;
  try {
    while (playing || pending > 0) {
      if (!c.it) { c.it = c.cycle(); cycleStart = performance.now(); }
      const t0 = performance.now();
      let r;
      const tc = performance.now();
      do {
        r = c.it.next();
        if (r.value && r.value.then) { await r.value; break; }
      } while (!r.done && performance.now() - t0 < CLIMATE_MS);
      prof.climate = (prof.climate || 0) + performance.now() - tc;
      if (r.done) { c.it = null; cycleMs = performance.now() - cycleStart; P.afterClimate(); pending = Math.max(0, pending - 1); sendClimate(); }
      await nextTask();
    }
  } finally { climateRunning = false; }
}

// The tide, re-solved when the coasts have had ~2 Myr to move or the day has drifted
// (its frequency 2(Ω − n) moves the basins' resonances); warm from the last.
function solveTides() {
  if (!tides || tides.running) return;
  const m = P.moon, drift = m.omegaSolved ? Math.abs(m.omega / m.omegaSolved - 1) : 1;
  if (P.tec.t - tides.at < 2 && drift < 0.003) return;
  tides.running = true; tides.at = P.tec.t;
  const g = tides.gpu, omega = m.omega, t0 = performance.now();
  g.ocean(P.tideDepth(g.n));
  g.solve(omega, m.Omega).then(r => {
    m.Punit = r.P; m.omegaSolved = omega;
    const up = a => { if (!tides.T) return Float32Array.from(a); const f = new Float64Array(P.grid.n); prolong(tides.T, a, f); return Float32Array.from(f); };
    const msg = { type: 'tides', C: up(r.C), S: up(r.S), diss: up(r.diss), Punit: r.P, omega, ms: performance.now() - t0 };
    post(msg, [msg.C.buffer, msg.S.buffer, msg.diss.buffer]);
  }, err => console.warn('[isochron] tides:', err.message)).finally(() => { tides.running = false; });
}

function sendSurface(fromStep, steps = 0, ms = 0) {
  // What a step costs, with drawing's share, so the page can plan steps the engine keeps up with.
  if (steps) { stepsDone += steps; msPerStep = 0.7 * msPerStep + 0.3 * ms / steps; }
  const { grid, tec, land, ice } = P, tSend = performance.now();
  const f = surfaceFields(grid, tec, land, ice);
  seaSent = tec.seaLevel;
  const m = {
    type: 'surface', fromStep, t: tec.t, seaLevel: tec.seaLevel, ...f,
    elev: Float32Array.from(tec.elev), lines: traceBoundaries(tec),
    plates: tec.plates.map(p => ({ w: p.w.slice(), alive: p.alive })), stats: tec.stats(),
    landSteps: land.steps, landBank: P.landBank || 0, stepYears, stepsDone, msPerStep: msPerStep + (performance.now() - tSend),
  };
  stepYears = 0;
  // Rivers retrace after the landscape steps or the climate's months change.
  const rk = land.steps * 1e6 + P.climate.version;
  if (rk !== riversSteps) {
    riversQ12 = land.monthly(P.climate.runoffM);
    m.rivers = traceRivers(grid, land, f.elevRel, riversQ12); riversSteps = rk;
    m.riversId = ++riversId; riversCells = m.rivers.map(r => r.cells);
  }
  post(m, [f.elevRel.buffer, f.normals.buffer, f.tfDraw.buffer, f.lakeDraw.buffer, f.felsic.buffer, m.elev.buffer]);
}

// The year's step: the anomaly at its end (the page holds the last as this one's start), the veil, the eruptions.
let yearAnomSent = -1;
function sendYear() {
  const Y = P.year, V = P.volcanoes, live = Y.live > 0;
  const cont = Y.steps === yearSent + 1 && yearAnomSent === yearSent;
  yearSent = Y.steps; yearLiveSent = live;
  const m = { type: 'year', live: Y.live, t0: Y.prev.t, t1: Y.t1, meanT: Y.stats.meanT, meanPrev: Y.stats.meanPrev,
    bands: Float32Array.from(V.aod), bandsPrev: Float32Array.from(Y.prev.aod),
    eruptions: V.recent.map(e => ({ p: e.p, M: e.M, t: e.t, kind: e.kind })) };
  const tr = [m.bands.buffer, m.bandsPrev.buffer];
  if (live) {
    m.anom = Y.toFine(Y.Ta, new Float32Array(P.grid.n)); tr.push(m.anom.buffer);
    if (!cont) { m.anomPrev = Y.toFine(Y.prev.T, new Float32Array(P.grid.n)); tr.push(m.anomPrev.buffer); }
    yearAnomSent = Y.steps;
  }
  post(m, tr);
}

// The rivers' discharge against the climate's this month, under the year's rain anomaly
// (through runoff's elasticity), routed: a factor per cell of each traced river. Only where
// the page draws rivers by the month (below ~12 yr/s) and the year is live.
function riverAnomaly() {
  const Y = P.year, land = P.land, c = P.climate, g = P.grid, n = g.n, r = land.r;
  if (!(Y.live > 0) || lastRate > 15 || !riversCells || !riversQ12 || !r) return null;
  const month = monthAt(((P.years % 1) + 1) % 1).i, e = YEAR.ELASTIC, toM3s = 1e6 * 12 / 3.156e7;
  const Z = Y.rainUnitFine(riverAnomaly.z || (riverAnomaly.z = new Float32Array(n)));
  const w = riverAnomaly.w || (riverAnomaly.w = new Float64Array(n)), q = riverAnomaly.q || (riverAnomaly.q = new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const ro = c.runoffM[12 * i + month];
    if (land.base[i] || !(ro > 0)) { w[i] = 0; continue; }
    const s = Y.rsig[i] * Y.live;
    w[i] = land.areaKm[i] * ro * Math.exp(e * s * Z[i] - 0.5 * e * e * s * s);
  }
  accumulate(r.order, r.count, r.rcv, w, q);
  let len = 0;
  for (const cs of riversCells) len += cs.length;
  const out = new Float32Array(len);
  let k = 0;
  for (const cs of riversCells) for (const i of cs) { const q0 = riversQ12[12 * i + month]; out[k++] = q0 > 0 ? q[i] * toM3s / q0 : 1; }
  return out;
}

function sendClimate() {
  const c = P.climate, o = P.ocean, f32 = a => Float32Array.from(a);
  const m = {
    type: 'climate', version: c.version, stats: { ...c.stats, cycleMs }, zonal: c.zonal,
    Tf: c.Tf.map(f32), Pf: c.Pf.map(f32), presPhase: c.presPhase.map(f32), W: c.W.map(f32),
    snowAnn: f32(c.snowAnn), landMask: Uint8Array.from(c.landMask), elevPos: f32(c.elevPos), zones: f32(c.zones),
    sst: f32(o.fine.sst), psi: f32(o.fine.psi), oceanStats: { ...o.stats },
  };
  const transfer = [...m.Tf, ...m.Pf, ...m.presPhase, ...m.W, m.snowAnn, m.landMask, m.elevPos, m.zones, m.sst, m.psi].map(a => a.buffer);
  post(m, transfer);
}

function sendFast(first) {
  lastFast = performance.now();
  const { grid, tec, land, climate, ice, carbon, plumes, ocean } = P;
  const m = {
    type: 'fast', prof: { ...prof, span: lastFast - (sendFast.prev || lastFast) }, years: P.years, seaLevel: tec.seaLevel, samples: Float64Array.from(samples),
    iceH: Float32Array.from(ice.H), iceVel: Float32Array.from(ice.vel), iceStats: { ...ice.stats },
    carbon: { pco2: carbon.pco2, flux: { ...carbon.flux }, wF: carbon.wF, wF0: carbon.wF0, balance: carbon.equilibrium(carbon.flux.out) },
    landFlux: { ...land.flux },
    moon: { a: P.moon.a, Omega: P.moon.Omega, omega: P.moon.omega, P: P.moon.P, day: P.moon.day },
    plumes: { hot: plumes.hot.map(h => h.p), lips: plumes.active().map(L => ({ p: L.p, age: tec.t - L.t0, radius: PLUMES.LIP_R })) },
    year: { live: P.year.live, meanT: P.year.stats.meanT, sigma: P.year.stats.sigma, F: P.year.stats.F, Fmean: CLIMATE.F_VOLC, Frate: P.volcanoes.meanForcing(),
      aod: P.year.stats.aod, rates: P.volcanoes.rates(), tag: P.year.tagInfo ? { ...P.year.tagInfo, theory: { ...P.year.tagInfo.theory } } : null },
  };
  const ra = riverAnomaly();
  if (ra) { m.rivAnom = ra; m.riversId = riversId; }
  samples = [];
  for (const k in prof) prof[k] = 0;
  sendFast.prev = lastFast;
  // The model figure's sums over the planet, a few times a second.
  if (first || !sendFast.lastAgg || lastFast - sendFast.lastAgg > 400) {
    sendFast.lastAgg = lastFast;
    let snow = 0, iceArea = 0, run = 0, la = 0, hiLand = 0, sstLo = 0, sstHi = 0, bShare = 0;
    for (let i = 0; i < grid.n; i++) {
      const a = grid.area[i] * 6.371e6 * 6.371e6;
      if (ice.H[i] > 0 && ice.M[i] > 0) snow += ice.M[i] * a;
      if (ice.H[i] > 20) iceArea += a;
      if (climate.landMask[i]) { run += climate.runoff[i] * a; la += a; bShare += a * (climate.zones[NZ * i + 4] + climate.zones[NZ * i + 5]); }
      hiLand = Math.max(hiLand, tec.elev[i] - tec.seaLevel);
      if (ocean.fine.sea[i]) { sstLo = Math.min(sstLo, ocean.fine.sst[i]); sstHi = Math.max(sstHi, ocean.fine.sst[i]); }
    }
    m.agg = { snow, iceArea, run, la, hiLand, sstLo, sstHi, bShare };
  }
  post(m, [m.samples.buffer, m.iceH.buffer, m.iceVel.buffer, ...(m.rivAnom ? [m.rivAnom.buffer] : [])]);
}
