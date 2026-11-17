// The planet's engine thread. The page keeps the clock and draws; this runs
// everything else on the CPU (plates, plumes, landscape, ice, carbon, the
// climate's cycles) and prepares what is drawn from it (the surface's fields,
// the boundaries and rivers traced into lines), posting snapshots back:
//
//   surface   after plate steps, or when the sea has moved: the drawn fields,
//             the lines, the plates' rotations, the crust's statistics
//   climate   after each completed climate cycle: its harmonics and zones (and
//             what rides with them: the export, the dust, the permafrost)
//   fast      ~10 times a second: ice, carbon, plumes, the regolith's and the
//             crust's flexure's statistics, the record's samples
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
//   lakes     when the lakes have changed, at most ~4 times a second: their
//             drawn depth and salt flats (src/render/surface.js, lakeFields)
//
//   cover     when the plants' cover has changed, at most twice a second: the
//             Relief view's eight colour weights a cell (src/engine/life.js)
//
// In the People experiment the page hands this thread a port to the people's own
// (src/engine/people-worker.js): their fields go to it after each climate cycle and
// the air and regolith a few times a second; their write-back (farmed shares,
// tillage, carbon, forcing) comes from it and goes into the planet's own inputs
// around each fast step (src/engine/peoplelink.js).
//
// The ground's live state is stepped on this thread's GPU device (src/gpu/
// soil.js) and read back ~10 times a second: the lakes' runoff, the climate's
// evaporation, and the rivers' month.
//
// The page sends a tick each frame it plays (the years to advance and the
// plate steps its scheduler planned) and the experiments' parameters.
import { Planet, CLIMATE, CARBON } from './planet.js';
import { PARAMS } from './plates.js';
import { PLUMES } from './plumes.js';
import { VOLC } from './volcanoes.js';
import { Year, YEAR } from './year.js';
import { monthAt } from './orbit.js';
import { accumulatePass } from './landscape.js';
import { NZ } from './climate.js';
import { surfaceFields, lakeFields } from '../render/surface.js';
import { traceBoundaries } from '../render/lines.js';
import { traceRivers, drainage, lakesKey, RIVER_MIN } from '../render/rivers.js';
import { gpuDevice } from '../gpu/device.js';
import { GpuIce } from '../gpu/ice.js';
import { GpuFlexure } from '../gpu/flexure.js';
import { GpuSoil } from '../gpu/soil.js';
import { GpuMoisture } from '../gpu/moisture.js';
import { GpuEnergyBalance } from '../gpu/ebm.js';
import { GpuDust } from '../gpu/dust.js';
import { GpuTides } from '../gpu/tides.js';
import { GpuPlates } from '../gpu/plates.js';
import { GpuSurface } from '../gpu/surface.js';
import { buildGrid } from '../grid/icosphere.js';
import { makeTransfer, prolong } from '../grid/transfer.js';
import { PeopleLink, fieldsOf, soilOf, peopleLevel } from './peoplelink.js';

// The climate's slice (ms), and while it hasn't settled (the opening's ~10 cycles) the gap between its
// slices while the plates pump, in slices: 10 after (a tenth of a busy thread), 3 before (a quarter).
const CLIMATE_MS = 10, CLIMATE_OPENING = 3, ICE_MS = 4;
let P = null, playing = false, pending = 3, scheduled = false, tides = null;
const ticks = [];
let samples = [], lastFast = 0, lastSeaCheck = 0, seaSent = 0, riversSteps = -1, stepYears = 0, stepsDone = 0, msPerStep = 50;
let yearSent = -1, yearLiveSent = -1, eruptId = null, eruptWaiting = null, riversId = 0, riversCells = null, riversQ12 = null, riversRt = null, lastRate = 1;
let lakesSent = -1, lastLakes = 0;
let coverSent = -1, lastCover = 0, pulseId = null, pulseWaiting = null;

const post = (m, transfer = []) => self.postMessage(m, transfer);
// The engine's own GPU device, asked for as the thread starts, so the GPU's own start overlaps the
// planet's spin-up; the pump waits for it (a level-7 plate step on the CPU is ~250 ms cold) unless
// there is none.
const deviceP = typeof navigator !== 'undefined' && navigator.gpu ? gpuDevice() : Promise.reject(new Error('no WebGPU'));
deviceP.catch(() => {});
let gpuWait = true;
const ch = new MessageChannel();
ch.port1.onmessage = pump;
function schedule() { if (!scheduled) { scheduled = true; ch.port2.postMessage(0); } }

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') {
    P = new Planet(m.seed, { level: m.level });
    // The ground steps live on the GPU only (on the CPU a month costs ~13 ms at level 7); the
    // lakes rebuild for the ice at most once a second.
    P.ground.cpuLive = false; P.lakesMinGap = 1000;
    // The regolith takes the ice's integrals as they come back (~400 ms), at most every 250 ms.
    P.regolith.minGap = 250;
    apply(m.params);
    // The engine's own GPU device: the ice, the climate's heavy solves, the plates and the rest.
    deviceP.then(device => {
      P.iceGpu = new GpuIce(device, P.ice); P.climate.gpu = new GpuMoisture(device, P.grid);
      P.climate.ebmGpu = new GpuEnergyBalance(device, P.climate, { have: P.ice.flex.levels.map(l => l.g) });
      if (P.aeolian) P.aeolian.gpu = new GpuDust(device, P.aeolian.dust);
      // The bed's ELRA and the crust's flexure on this device (src/gpu/flexure.js), sharing the coarser grids.
      const have = P.ice.flex.levels.map(l => l.g);
      P.iceGpu.attachFlexure(new GpuFlexure(device, P.grid, { have }));
      if (P.crustFlex) P.crustFlex.useSolver(new GpuFlexure(device, P.grid, { have }));
      P.ground.gpu = new GpuSoil(device, P.grid.n, 0);
      // The plates' step and the drawn surface too (src/gpu/plates.js says what stays here).
      try { P.tec.gpu = new GpuPlates(device, P.tec); surfaceGpu = new GpuSurface(device, P.grid); } catch (err) { console.warn('[isochron] plates on the GPU:', err.message); }
      // The tide at level 6 at most (its cells nest first in a finer grid), so the Moon recedes alike at every level.
      const tg = P.grid.level > 6 ? buildGrid(6) : P.grid;
      tides = { gpu: new GpuTides(device, tg), T: tg === P.grid ? null : makeTransfer(P.grid, tg), at: -Infinity, running: false };
    }, err => console.warn('[isochron] engine GPU:', err.message)).finally(() => { gpuWait = false; schedule(); });
    post({ type: 'ready', seaLevel0: P.seaLevel0, years: P.years, pco2: P.carbon.pco2 });
    sendSurface(false);
    sendLakes();
    sendFast(true);
  } else if (m.type === 'people') startPeople(m.port);
  else if (m.type === 'tick') ticks.push(m);
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
  // The Pulse experiment: one pulse each time its size is set, once the sea has settled.
  if (p.PULSE && p.PULSE.id !== pulseId) { pulseId = p.PULSE.id; pulseWaiting = p.PULSE.PgC; }
}
function pulseWhenSettled() {
  if (pulseWaiting !== null && P.carbon.settled) { P.carbon.startPulse(pulseWaiting); pulseWaiting = null; }
}
function eruptWhenWarm() {
  if (eruptWaiting !== null && P.climate.stats.cycles >= 2) { P.year.eruptTagged(eruptWaiting, P.years); eruptWaiting = null; }
}

// The plates step on the GPU, so a pump awaits them; one pump at a time. While pumps run back
// to back the climate takes a slice every 100 ms (a tenth of the thread; every 30 ms until it has
// settled; it may fill a pump’s wait on the GPU), and runs freely between them.
let surfaceGpu = null, pumping = false, lastSlice = 0;
async function pump() {
  scheduled = false;
  if (!P || pumping || gpuWait) return;
  pumping = true;
  try { await pumpTicks(); } finally { pumping = false; wakeClimate(); }
  if (ticks.length) schedule();
}

async function pumpTicks() {
  // Ticks first, all of them (a slow step coalesces the frames behind it).
  let stepped = 0;
  const t0 = performance.now();
  let ta = performance.now();
  const lap = k => { const tb = performance.now(); prof[k] = (prof[k] || 0) + tb - ta; ta = tb; };
  eruptWhenWarm();
  pulseWhenSettled();
  while (ticks.length) {
    const m = ticks.shift();
    lastRate = m.rate ?? m.window / 2;
    P.years += m.adv;
    for (const dt of m.steps) { await P.plateStepAsync(dt); stepYears += dt; stepped++; pending = Math.max(pending, 1); }
    lap('plates');
    P.setOrbit(m.window);
    if (people) people.link.beforeFast();
    P.fast(m.adv, ICE_MS, m.rate ?? m.window / 2);
    if (people) people.link.afterFast();
    lap('fast');
    if (m.adv > 0) samples.push(P.years, ...P.sample());
    lap('sample');
  }
  const now = performance.now();
  if (stepped) {
    await sendSurface(true, stepped, performance.now() - t0);
    lap('surface');
  }
  else if (now - lastSeaCheck > 250) {
    // Ice moves the sea; the coast is redrawn when it has moved a few metres.
    lastSeaCheck = now;
    if (Math.abs(P.tec.seaLevel - seaSent) > 0.004) await sendSurface(false);
    lap('sea');
  }
  if (P.year.steps !== yearSent || (P.year.live > 0) !== yearLiveSent) { sendYear(); lap('year'); }
  if (P.lakesVersion !== lakesSent && now - lastLakes > 250) { sendLakes(); lap('lakes'); }
  if (now - lastFast > 100) { sendFast(false); lap('fastMsg'); }
  if (P.life.version !== coverSent && now - lastCover > 500) { sendCover(); lap('cover'); }
  if ((playing || pending > 0) && !climateRunning) climateLoop();
  solveTides();
}

// The climate runs alongside: a slice of its cycle at a time, awaiting the GPU's work
// where the cycle hands it some, and letting the ticks in between slices.
let climateRunning = false, cycleStart = 0, cycleMs = 0;
const prof = {};                   // ms spent per section since the last fast message, for tuning
// A macrotask's turn (one channel for all of them), and a wait until the climate's next slice is due
// or the pump has ended, whichever is first: spinning on turns for it kept the thread busy and made garbage.
const taskCh = new MessageChannel(), taskQ = [];
taskCh.port1.onmessage = () => taskQ.shift()();
const nextTask = () => new Promise(res => { taskQ.push(res); taskCh.port2.postMessage(0); });
let wake = null;
function wakeClimate() { if (wake) { const w = wake; wake = null; w(); } }
const untilSlice = ms => new Promise(res => { const id = setTimeout(() => { wake = null; res(); }, ms); wake = () => { clearTimeout(id); res(); }; });
// A cycle, then what follows one (src/engine/planet.js), each sliced alike.
function* cycleThenAfter() { yield* P.climate.cycle(); yield* P.afterClimateSteps(); }
async function climateLoop() {
  climateRunning = true;
  const c = P.climate;
  try {
    while (playing || pending > 0) {
      const due = lastSlice + (c.stats.settled ? 10 : CLIMATE_OPENING) * CLIMATE_MS - performance.now();
      if (pumping && due > 0) { await untilSlice(due); continue; }
      if (!c.it) { c.it = cycleThenAfter(); cycleStart = performance.now(); }
      const t0 = performance.now();
      let r;
      const tc = performance.now();
      let waited = 0;
      do {
        const ts = performance.now();
        r = c.it.next();
        prof.climateMax = Math.max(prof.climateMax || 0, performance.now() - ts);
        if (r.value && r.value.then) { const tw = performance.now(); await r.value; waited = performance.now() - tw; break; }
      } while (!r.done && performance.now() - t0 < CLIMATE_MS);
      prof.climate = (prof.climate || 0) + performance.now() - tc - waited;
      prof.climateGpu = (prof.climateGpu || 0) + waited;
      lastSlice = performance.now();
      if (r.done) {
        c.it = null; cycleMs = performance.now() - cycleStart; pending = Math.max(0, pending - 1);
        const ts = performance.now();
        sendClimate();
        sendPeopleFields();
        prof.sendClimate = (prof.sendClimate || 0) + performance.now() - ts;
      }
      await nextTask();
    }
  } finally { climateRunning = false; }
}

// The tide, re-solved when the coasts have had ~2 Myr to move or the day has drifted
// (its frequency 2(Ω − n) moves the basins' resonances); warm from the last.
function solveTides() {
  if (!tides || tides.running) return;
  const m = P.moon, drift = Math.abs(m.omega / m.omegaSolved - 1);
  if ((P.tec.t - tides.at < 2 && drift < 0.003) || !(m.omega > 0)) return;
  tides.running = true; tides.at = P.tec.t;
  const g = tides.gpu, omega = m.omega, Omega = m.Omega, t0 = performance.now();
  g.ocean(P.tideDepth(g.n));
  g.solve(omega, Omega).then(r => {
    // A solve that failed would carry into every warm start after it: drop it, start the next cold.
    if (!Number.isFinite(r.P)) { console.warn('[isochron] tides: a solve diverged; the next starts cold'); g.reset(); tides.at = -Infinity; return; }
    m.solved(r.P, omega, Omega);
    const up = a => { if (!tides.T) return Float32Array.from(a); const f = new Float64Array(P.grid.n); prolong(tides.T, a, f); return Float32Array.from(f); };
    const msg = { type: 'tides', C: up(r.C), S: up(r.S), diss: up(r.diss), Punit: r.P, omega, ms: performance.now() - t0 };
    post(msg, [msg.C.buffer, msg.S.buffer, msg.diss.buffer]);
  }, err => console.warn('[isochron] tides:', err.message)).finally(() => { tides.running = false; });
}

async function sendSurface(fromStep, steps = 0, ms = 0) {
  // What a step costs, with drawing's share, so the page can plan steps the engine keeps up with.
  if (steps) { stepsDone += steps; msPerStep = 0.7 * msPerStep + 0.3 * ms / steps; }
  const { grid, tec, land, ice } = P, tSend = performance.now();
  const f = surfaceGpu ? await surfaceGpu.fields(tec) : surfaceFields(grid, tec, land, ice);
  seaSent = tec.seaLevel;
  const m = {
    type: 'surface', fromStep, t: tec.t, seaLevel: tec.seaLevel, ...f,
    elev: Float32Array.from(tec.elev), lines: traceBoundaries(tec),
    plates: tec.plates.map(p => ({ w: p.w.slice(), alive: p.alive })), stats: tec.stats(),
    landSteps: land.steps, landBank: P.landBank || 0, stepYears, stepsDone, msPerStep: msPerStep + (performance.now() - tSend),
  };
  stepYears = 0;
  // Rivers retrace after the landscape steps, the climate's months change, or a lake opens or
  // closes; they run on their own drainage, which ends at closed lakes.
  const rk = `${land.steps}:${P.climate.version}:${lakesKey(P.lakes)}`;
  if (rk !== riversSteps) {
    const rt = riversRt = drainage(grid, land, P.lakes);
    riversQ12 = land.monthly(P.climate.runoffM, rt);
    m.rivers = traceRivers(grid, land, f.elevRel, riversQ12, RIVER_MIN, rt, lakesDraw); riversSteps = rk;
    m.riversId = ++riversId; riversCells = m.rivers.map(r => r.cells);
  }
  post(m, [f.elevRel.buffer, f.normals.buffer, f.tfDraw.buffer, f.felsic.buffer, m.elev.buffer]);
}

// The lakes as drawn: their depth from their water, and the salt flats.
let lakesDraw = null;
function sendLakes() {
  lastLakes = performance.now(); lakesSent = P.lakesVersion;
  const f = lakeFields(P.grid, P.tec, P.lakes, P.ice.H);
  lakesDraw = Float32Array.from(f.draw);      // kept: rivers run to the lakes the page draws
  post({ type: 'lakes', draw: f.draw, salt: f.salt }, [f.draw.buffer, f.salt.buffer]);
}

// The plants' cover as the Relief view draws it: eight colour weights a cell.
function sendCover() {
  lastCover = performance.now(); coverSent = P.life.version;
  const w = P.life.colours();
  post({ type: 'cover', w }, [w.buffer]);
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

// The rivers' discharge against the climate's this month, routed: a factor per cell of each
// traced river. From the live ground's runoff this month (which lags the rain by the soil's
// memory and the snowpack's melt), or before it has a month to give, the climate's under the
// year's rain anomaly (through runoff's elasticity). Only where the page draws rivers by the
// month (below ~12 yr/s) and the year is live.
function riverAnomaly() {
  const Y = P.year, land = P.land, c = P.climate, g = P.grid, n = g.n, G = P.ground, rt = riversRt;
  if (!(Y.live > 0) || lastRate > 15 || !riversCells || !riversQ12 || !rt) return null;
  const month = monthAt(((P.years % 1) + 1) % 1).i, e = YEAR.ELASTIC, toM3s = 1e6 * 12 / 3.156e7;
  const w = riverAnomaly.w || (riverAnomaly.w = new Float64Array(n)), q = riverAnomaly.q || (riverAnomaly.q = new Float64Array(n));
  if (G.live && G.monthRunoff && G.monthOf === month) {
    const R = G.monthRunoff;
    for (let i = 0; i < n; i++) w[i] = land.base[i] ? 0 : land.areaKm[i] * R[i] / 1000;
  } else {
    const Z = Y.rainUnitFine(riverAnomaly.z || (riverAnomaly.z = new Float32Array(n)));
    for (let i = 0; i < n; i++) {
      const ro = c.runoffM[12 * i + month];
      if (land.base[i] || !(ro > 0)) { w[i] = 0; continue; }
      const s = Y.rsig[i] * Y.live;
      w[i] = land.areaKm[i] * ro * Math.exp(e * s * Z[i] - 0.5 * e * e * s * s);
    }
  }
  accumulatePass(rt, w, q);
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
    sst: f32(o.fine.sst), psi: f32(o.fine.psi), oceanStats: { ...o.stats }, prod: f32(P.life.export),
    dust: P.aeolian ? f32(P.aeolian.load) : null, dustStats: P.aeolian ? { ...P.aeolian.stats } : null,
    permafrost: drawnPermafrost(c.soil),
  };
  const transfer = [...m.Tf, ...m.Pf, ...m.presPhase, ...m.W, m.snowAnn, m.landMask, m.elevPos, m.zones, m.sst, m.psi, m.prod, m.permafrost, ...(m.dust ? [m.dust] : [])].map(a => a.buffer);
  post(m, transfer);
}

// The permafrost's share as the globe draws it: the climate's closure's (src/engine/soil.js), and on a
// cell without soil (the sea, grounded ice) its soil neighbours' mean, so the share the globe
// interpolates toward a coast or an ice sheet's margin stays the land's.
function drawnPermafrost(soil) {
  const { n, nbrOff, nbr } = P.grid, pf = soil.permafrost, cap = soil.Smax, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (cap[i] > 0) { out[i] = pf[i]; continue; }
    let t = 0, k = 0;
    for (let e = nbrOff[i], end = nbrOff[i + 1]; e < end; e++) { const j = nbr[e]; if (cap[j] > 0) { t += pf[j]; k++; } }
    out[i] = k ? t / k : 0;
  }
  return out;
}

/** The ice's flow as the globe draws it: its direction as long as sliding's share of the speed, and the speed (m/yr). */
function drawnFlow(ice) {
  const v = Float32Array.from(ice.vel), n = ice.grid.n;
  for (let i = 0; i < n; i++) {
    const o = 4 * i, sp = v[o + 3], s = sp > 0 ? Math.min(1, Math.max(1e-3, ice.ub[i] / sp)) : 0;
    v[o] *= s; v[o + 1] *= s; v[o + 2] *= s;
  }
  return v;
}

// The people (the People experiment): their link into the planet, and the transfer to their grid.
let people = null;
function startPeople(port) {
  const level = peopleLevel(P.grid.level), T = level < P.grid.level ? makeTransfer(P.grid, buildGrid(level)) : null;
  people = { port, T, link: new PeopleLink(P, T), sentVersion: -1, lastAir: 0, soil: new Float32Array(T ? T.coarse.n : P.grid.n) };
  port.onmessage = e => { if (e.data.type === 'writeback') people.link.receive(e.data); };
  sendPeopleFields();
}
/** The planet's fields on the people's grid, once a climate cycle has run and after each. */
function sendPeopleFields() {
  if (!people || P.climate.stats.cycles < 1 || P.climate.version === people.sentVersion) return;
  people.sentVersion = P.climate.version;
  const t0 = performance.now(), f = fieldsOf(P, null, people.T), tr = [];
  people.fieldsMs = performance.now() - t0;
  for (const v of Object.values(f)) if (ArrayBuffer.isView(v)) tr.push(v.buffer);
  delete f.grid;
  people.port.postMessage({ type: 'fields', f }, tr);
}
function sendPeopleAir() {
  if (!people || performance.now() - people.lastAir < 250) return;
  people.lastAir = performance.now();
  const soil = soilOf(P, new Float32Array(people.soil.length), people.T);
  people.port.postMessage({ type: 'air', co2: P.carbon.pco2, soil, boiled: P.runaway.b, meanT: P.climate.stats.meanT, years: P.years }, [soil.buffer]);
}

function sendFast(first) {
  lastFast = performance.now();
  sendPeopleAir();
  const { grid, tec, land, climate, ice, carbon, plumes, ocean } = P;
  // The live ground's last twelve months and this month's runoff, read back for the next message.
  if (P.ground.live && P.ground.gpu) P.ground.readBack(monthAt(((P.years % 1) + 1) % 1).i, P.years).catch(err => console.warn('[isochron] ground:', err.message));
  const m = {
    type: 'fast', prof: { ...prof, span: lastFast - (sendFast.prev || lastFast) }, years: P.years, seaLevel: tec.seaLevel, samples: Float64Array.from(samples),
    iceH: Float32Array.from(ice.H), iceVel: drawnFlow(ice), iceStats: { ...ice.stats },
    carbon: { pco2: carbon.pco2, flux: { ...carbon.flux }, wF: carbon.wF, wF0: carbon.wF0, balance: carbon.equilibrium(carbon.flux.out),
      sea: { ccd: carbon.sea.stats.ccd || 0, sat: carbon.sea.stats.saturation || 0 }, pulse: carbon.tag ? carbon.tag.info : null },
    life: { ...P.life.stats }, runaway: P.runaway.stats(),
    people: people ? { ...people.link.stats, F: people.link.F, fieldsMs: people.fieldsMs || 0 } : null,
    landFlux: { ...land.flux },
    regolith: { ...P.regolith.stats, ...P.regolith.budget }, flex: P.crustFlex ? { ...P.crustFlex.stats } : null,
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
    let snow = 0, iceArea = 0, run = 0, la = 0, hiLand = 0, sstLo = 0, sstHi = 0, bShare = 0, rain = 0, wet = 0, beta = 0, sa = 0, lakeIn = 0, cap = 0, supply = 0;
    const R = P.regolith;
    const G = P.ground, live = G.live && G.agg ? G.weight : 0, soil = climate.soil, L = P.lakes;
    const runoff = G.runoff(sendFast.ro || (sendFast.ro = new Float32Array(grid.n)));
    for (let i = 0; i < grid.n; i++) {
      const a = grid.area[i] * 6.371e6 * 6.371e6;
      if (ice.H[i] > 0 && ice.M[i] > 0) snow += ice.M[i] * a;
      if (ice.H[i] > 20) iceArea += a;
      if (climate.landMask[i]) {
        run += runoff[i] * a; la += a; bShare += a * (climate.zones[NZ * i + 4] + climate.zones[NZ * i + 5]); rain += climate.pAnn[i] * a;
        cap += a * R.capacity(i); supply += a * (0.25 + 0.75 * R.prod[i] / (R.prod[i] + CARBON.E_HALF));
        if (soil.Smax[i] > 0) { sa += a; wet += a * (live > 0 ? (1 - live) * soil.wet[i] + live * G.agg.wet[i] : soil.wet[i]); beta += a * (live > 0 ? (1 - live) * soil.beta[i] + live * G.agg.beta[i] : soil.beta[i]); }
        if (L.built && L.catch[i] >= 0) lakeIn += runoff[i] * a;
      }
      hiLand = Math.max(hiLand, tec.elev[i] - tec.seaLevel);
      if (ocean.fine.sea[i]) { sstLo = Math.min(sstLo, ocean.fine.sst[i]); sstHi = Math.max(sstHi, ocean.fine.sst[i]); }
    }
    const ls = L.built ? L.stats() : { lakes: 0, area: 0, closed: 0, saltArea: 0, volume: 0 };
    m.agg = { snow, iceArea, run, la, hiLand, sstLo, sstHi, bShare, rain, cap: la > 0 ? cap / la : 0, supply: la > 0 ? supply / la : 0,
      ground: { wet: sa > 0 ? wet / sa : 0, beta: sa > 0 ? beta / sa : 0, live },
      lakes: { n: ls.lakes, closed: ls.closed, area: ls.area, salt: ls.saltArea, volume: ls.volume, inflow: lakeIn / 1e9 } };
  }
  post(m, [m.samples.buffer, m.iceH.buffer, m.iceVel.buffer, ...(m.rivAnom ? [m.rivAnom.buffer] : [])]);
}
