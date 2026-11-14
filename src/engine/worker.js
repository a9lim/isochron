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
// The page sends a tick each frame it plays (the years to advance and the
// plate steps its scheduler planned) and the experiments' parameters.
import { Planet, CLIMATE, CARBON } from './planet.js';
import { PARAMS } from './plates.js';
import { PLUMES } from './plumes.js';
import { NZ } from './climate.js';
import { surfaceFields } from '../render/surface.js';
import { traceBoundaries } from '../render/lines.js';
import { traceRivers } from '../render/rivers.js';
import { gpuDevice } from '../gpu/device.js';
import { GpuIce } from '../gpu/ice.js';
import { GpuMoisture } from '../gpu/moisture.js';

const CLIMATE_MS = 10, ICE_MS = 4;
let P = null, playing = false, pending = 3, scheduled = false;
const ticks = [];
let samples = [], lastFast = 0, lastSeaCheck = 0, seaSent = 0, riversSteps = -1, stepYears = 0, stepsDone = 0, msPerStep = 50;

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
    gpuDevice().then(device => { P.iceGpu = new GpuIce(device, P.ice); P.climate.gpu = new GpuMoisture(device, P.grid); }, err => console.warn('[isochron] engine GPU:', err.message));
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
  Object.assign(CLIMATE, p.CLIMATE || {}); Object.assign(CARBON, p.CARBON || {}); Object.assign(PARAMS, p.PARAMS || {});
  // An experiment that holds CO₂ where it stands.
  if (CARBON.FIXED === 'now') CARBON.FIXED = Math.round(P.carbon.pco2);
}

function pump() {
  scheduled = false;
  if (!P) return;
  // Ticks first, all of them (a slow step coalesces the frames behind it).
  let stepped = 0;
  const t0 = performance.now();
  let ta = performance.now();
  const lap = k => { const tb = performance.now(); prof[k] = (prof[k] || 0) + tb - ta; ta = tb; };
  while (ticks.length) {
    const m = ticks.shift();
    P.years += m.adv;
    for (const dt of m.steps) { P.plateStep(dt); stepYears += dt; stepped++; pending = Math.max(pending, 1); }
    lap('plates');
    P.setOrbit(m.window);
    P.fast(m.adv, ICE_MS);
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
  if (now - lastFast > 100) { sendFast(false); lap('fastMsg'); }
  if ((playing || pending > 0) && !climateRunning) climateLoop();
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
  if (land.steps !== riversSteps) { m.rivers = traceRivers(grid, land); riversSteps = land.steps; }
  post(m, [f.elevRel.buffer, f.normals.buffer, f.tfDraw.buffer, f.lakeDraw.buffer, f.felsic.buffer, m.elev.buffer]);
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
    plumes: { hot: plumes.hot.map(h => h.p), lips: plumes.active().map(L => ({ p: L.p, age: tec.t - L.t0, radius: PLUMES.LIP_R })) },
  };
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
  post(m, [m.samples.buffer, m.iceH.buffer, m.iceVel.buffer]);
}
