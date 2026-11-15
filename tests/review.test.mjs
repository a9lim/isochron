// The review of the roadmap run (docs/LOG.md, "Review fixes"): each finding's own case, which
// failed before its fix. The water's cross-ledger check (finding 4) is in water.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGPU } from './webgpu-node.mjs';
import { buildGrid } from '../src/grid/icosphere.js';
import { CLIMATE } from '../src/engine/climate.js';
import { Year, YEAR, boxResponse } from '../src/engine/year.js';
import { Volcanoes, VOLC } from '../src/engine/volcanoes.js';
import { OceanCarbon, OC } from '../src/engine/oceancarbon.js';
import { Soil, potentialEvaporation } from '../src/engine/soil.js';
import { Ground } from '../src/engine/ground.js';

/** A climate with only what the year reads (as year.test.mjs): land (or none), no ice. */
function world(level, land = () => false) {
  const g = buildGrid(level), n = g.n;
  const landMask = Uint8Array.from({ length: n }, (_, i) => land(g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]) ? 1 : 0);
  return { grid: g, landMask, snowAnn: new Float32Array(n), stats: { cycles: 3 } };
}
const tecOf = (g, cell = -1) => { const arc = new Float32Array(g.n); if (cell >= 0) arc[cell] = 5; return { grid: g, arc, t: 0 }; };
const equatorCell = g => { let b = 0; for (let i = 0; i < g.n; i++) if (Math.abs(g.pos[3 * i + 2]) < Math.abs(g.pos[3 * b + 2])) b = i; return b; };
const shares = g => Float64Array.from(g.area, a => a / (4 * Math.PI));

test('1: a jump of the clock at a slow dial takes the closure (a plate step by "."): bounded months, all finite', () => {
  const c = world(4), g = c.grid, V = new Volcanoes(tecOf(g, equatorCell(g)), null, null, 'jump');
  const y = new Year(c, V, 'jump'), months = [], closures = [];
  y.soil = { step: inp => months.push(inp.months), closure: inp => closures.push(inp.live) };
  for (let t = 0; t <= 1; t += 1 / 60) y.advance(t, 1);
  y.advance(1 + 5e5, 1);                       // half a million years, the dial still at 1 yr/s
  y.advance(1 + 5e5 + 1 / 12, 1);
  const top = Math.max(...months);
  assert.ok(top <= 12 * YEAR.JUMP + 1, `a step of ${top} months`);
  assert.ok(closures.includes(0), 'the ground dropped its live state over the jump');
  assert.ok(Number.isFinite(V.global()) && y.Ta.every(Number.isFinite) && Number.isFinite(y.stats.meanT), `finite: aod ${V.global()}, mean ${y.stats.meanT}`);
  // The veil alone over a long live step: each eruption from its own moment, nothing 0/0.
  const W = new Volcanoes(tecOf(g, equatorCell(g)), null, null, 'long');
  W.step(0, 1000, true);
  assert.ok(W.aod.every(Number.isFinite) && W.global() < 10, `the veil after a 1,000-year live step: ${W.global()}`);
});

test('2: back from the closure, eruptions resume where they stood (none replayed), and the first comes at its rate', () => {
  const g = buildGrid(3), tec = tecOf(g, equatorCell(g));
  let replayed = 0;
  for (let k = 0; k < 20; k++) {
    const V = new Volcanoes(tec, null, null, `replay${k}`);
    V.step(0, 1 / 12, true);
    V.step(1 / 12, 1000, false);               // the closure: no eruptions over 1,000 years
    V.step(1000 + 1 / 12, 1 / 12, true);       // the first live month after it
    replayed += V.recent.length;
  }
  // 20 months at 0.1 a year: ~0.17 expected.
  assert.ok(replayed <= 3, `${replayed} eruptions in 20 first months back`);
  // The first arrival: 1/rate = 10 yr on average.
  let sum = 0;
  const N = 400;
  for (let k = 0; k < N; k++) {
    const V = new Volcanoes(tec, null, null, `first${k}`);
    let t = 0;
    while (!V.recent.length && t < 300) { V.step(t, 1, true); t++; }
    sum += V.recent.length ? V.recent[0].t : 300;
  }
  assert.ok(Math.abs(sum / N - 1 / VOLC.ARC_RATE) < 1.5, `first eruption at ${(sum / N).toFixed(2)} yr on average`);
});

test("3: the slowest dial's steps integrate the sea: a 1e-6 yr step carries what the land gave the air", () => {
  const m = new OceanCarbon(), i0 = m.inventory();
  m.step(1e-6, { land: 1e6 });                // 1 Pg C over the step
  const moved = (m.inventory().C - i0.C) / OC.PG;
  assert.ok(Math.abs(moved - 1) < 1e-3, `${moved} Pg C moved`);
});

test("5: a cut in the soil's capacity runs the water past it off, and the books close", () => {
  const s = new Soil(1, 150);
  s.S[0] = 100; s.SWE[0] = 30; s.G[0] = 20; s.Tg[0] = 5;
  const before = s.S[0] + s.SWE[0] + s.G[0];
  s.setCapacity(40);
  const T = new Float32Array(12).fill(10), P = new Float32Array(12), PET = potentialEvaporation(T);
  s.stepMonth(0, T, P, PET);                   // a dry month
  const o = s.out, gone = o.quick[0] + o.base[0] + o.evap[0], after = s.S[0] + s.SWE[0] + s.G[0];
  assert.ok(s.S[0] <= 40 + 1e-9, `S ${s.S[0]}`);
  assert.ok(Math.abs(before - after - gone) < 1e-4, `off by ${(before - after - gone).toFixed(3)} mm`);   // the month's record is f32
  assert.ok(o.quick[0] >= 60 - 1e-4, `the excess ran off (${o.quick[0].toFixed(1)} mm quick flow)`);
});

test('5: the same cut on the GPU matches the CPU', { skip: hasGPU ? false : 'no WebGPU in node (npm install in tests/)' }, async () => {
  const { GpuSoil } = await import('../src/gpu/soil.js');
  const { gpuDevice } = await import('../src/gpu/device.js');
  const n = 3, T = new Float32Array(12 * n).fill(10), P = new Float32Array(12 * n).fill(20), PET = potentialEvaporation(T);
  const S = Float64Array.of(100, 140, 20), W = Float64Array.of(30, 0, 5), Tg = Float64Array.of(5, 5, 5), Gw = Float64Array.of(20, 10, 0);
  const cpu = new Soil(n, 150), gpu = new GpuSoil(await gpuDevice(), n, 150);
  cpu.S.set(S); cpu.SWE.set(W); cpu.Tg.set(Tg); cpu.G.set(Gw);
  gpu.setForcing(T, P, PET); gpu.setState(S, W, Tg, Gw);
  const cut = Float32Array.of(40, 60, 60);
  cpu.setCapacity(cut); gpu.setCapacity(cut);
  cpu.stepMonth(0, T, P, PET); gpu.step(0, 1);
  const r = await gpu.read({ monthly: true, state: true });
  for (let i = 0; i < n; i++) {
    assert.ok(Math.abs(r.runoffM[12 * i] - (cpu.out.quick[12 * i] + cpu.out.base[12 * i])) < 1e-3, `cell ${i}: runoff ${r.runoffM[12 * i]} against ${cpu.out.quick[12 * i] + cpu.out.base[12 * i]}`);
    assert.ok(Math.abs(r.S[i] - cpu.S[i]) < 1e-3, `cell ${i}: S ${r.S[i]} against ${cpu.S[i]}`);
  }
});

test('6: back from the closure the anomaly has had its gap: an old one decays, and the noise refills the spread', () => {
  const c = world(4, (x, y, z) => z > 0.4), g = c.grid;
  // No weather: a 10 K anomaly (and a tag's response) after 1 Myr outrun are gone.
  const y = new Year(c, null, 'gap');
  y.q.fill(0); y.capacity(true);
  y.advance(0, 1);
  y.Ta.fill(10); y.tagT.fill(5);
  y.advance(1e6, 1e4);
  y.advance(1e6 + 1 / 12, 1);
  assert.ok(y.Ta.every(v => Math.abs(v) < 1e-6) && y.tagT.every(v => Math.abs(v) < 1e-6), `left: ${Math.max(...y.Ta.map(Math.abs)).toFixed(3)} K`);
  // With the weather: the closure's spread, about no offset.
  const z = new Year(c, null, 'gap-noise');
  z.capacity(true);
  z.advance(0, 1);
  z.Ta.fill(10);
  z.advance(1e6, 1e4);
  z.advance(1e6 + 1 / 12, 1);
  let m = 0, r2 = 0;
  for (let i = 0; i < z.n; i++) { m += z.Ta[i] * g.area[i]; r2 += (z.Ta[i] / z.sigma[i]) ** 2 * g.area[i]; }
  m /= 4 * Math.PI; r2 = Math.sqrt(r2 / (4 * Math.PI));
  assert.ok(Math.abs(m) < 1, `mean ${m.toFixed(2)} K`);
  assert.ok(r2 > 0.6 && r2 < 1.5, `spread ${r2.toFixed(2)} of the closure's`);
});

test("7: the veil's cooling is the analytic convolution at every live step length", () => {
  const save = VOLC.BACKGROUND;
  VOLC.BACKGROUND = false;
  try {
    for (const months of [1, 12, 36, 60]) {
      const c = world(4), g = c.grid, V = new Volcanoes(tecOf(g, equatorCell(g)), null, null, 'dial');
      const y = new Year(c, V, 'dial');
      y.capacity(true); y.q.fill(0);
      y.t0 = y.t1 = 0;
      const info = y.eruptTagged(1, 0);
      const th = boxResponse(y.C, shares(g), CLIMATE.B, info.F0, VOLC.TAU);
      let worst = 0;
      for (let k = 0; k < Math.ceil(180 / months); k++) { y.step(months); worst = Math.max(worst, Math.abs(y.stats.meanT - th.at(y.t1))); }
      assert.ok(worst < 0.02 * Math.abs(th.peak), `${months}-month steps: off by ${worst.toFixed(4)} K (peak ${th.peak.toFixed(3)} K)`);
    }
  } finally { VOLC.BACKGROUND = save; }
});

test("4: the GPU's bank is the runoff of every month stepped since the last read, past twelve too", { skip: hasGPU ? false : 'no WebGPU in node (npm install in tests/)' }, async () => {
  const { GpuSoil } = await import('../src/gpu/soil.js');
  const { gpuDevice } = await import('../src/gpu/device.js');
  const n = 3, T = new Float32Array(12 * n), P = new Float32Array(12 * n);
  for (let i = 0; i < n; i++) for (let m = 0; m < 12; m++) { T[12 * i + m] = 5 * i + 8 * Math.cos(2 * Math.PI * (m - 6) / 12); P[12 * i + m] = 40 + 30 * i + 20 * Math.sin(m); }
  const PET = potentialEvaporation(T), Smax = Float32Array.of(80, 150, 250);
  const cpu = new Soil(n, Smax), gpu = new GpuSoil(await gpuDevice(), n, Smax);
  gpu.setForcing(T, P, PET);
  const sum = new Float64Array(n), run = months => { for (let k = 0; k < months; k++) { const m = k % 12; cpu.stepMonth(m, T, P, PET); for (let i = 0; i < n; i++) sum[i] += cpu.out.quick[12 * i + m] + cpu.out.base[12 * i + m]; } };
  gpu.step(0, 14); run(14);
  const a = await gpu.read({ bank: true }), b = await gpu.read({ bank: true });
  for (let i = 0; i < n; i++) {
    assert.ok(Math.abs(a.bank[i] - sum[i]) < 1e-4 * sum[i] + 1e-2, `cell ${i}: banked ${a.bank[i].toFixed(2)} mm against ${sum[i].toFixed(2)}`);
    assert.equal(b.bank[i], 0, 'emptied by the read');
  }
});

/** A climate with what the ground reads, n land cells. */
function groundClimate(n) {
  const z = k => new Float32Array(k * n);
  return {
    grid: { n }, soilWarm: true, version: 1, runoff: z(1).fill(0.3),
    soil: { Smax: z(1).fill(100), out: { S: z(12).fill(50), SWE: z(12), Tg: z(12).fill(5), G: z(12).fill(10), quick: z(12), base: z(12), evap: z(12) }, beta: z(1).fill(0.5) },
    T12: z(12).fill(10), P12: z(12).fill(60), PET12: z(12).fill(50),
  };
}

test('8: a ground read from before a closure is discarded once a new handover has landed', async () => {
  const n = 4;
  let land = null;
  const gpu = {
    reading: false,
    read() { this.reading = true; return new Promise(r => { land = v => { this.reading = false; r(v); }; }); },
    setCapacity() {}, setForcing() {}, setState() {}, setAnomaly() {}, step() {}, clearBank() {},
  };
  const G = new Ground(groundClimate(n), { gpu });
  const inp = years => ({ years, m0: 0, months: 1, live: 1, dT: new Float32Array(n), rf: new Float32Array(n).fill(1) });
  G.step(inp(10));
  const read = G.readBack(0, 10);              // started at year 10
  G.closure({ live: 0 });                      // outrun
  G.step(inp(100));                            // and back: a new handover at year 100
  const f = v => new Float32Array(n).fill(v);
  land({ runoff: f(300), evap: f(400), wet: f(0.5), beta: f(0.5), tg: f(5), permafrost: f(0), runoffMonth: f(25), bank: f(7) });
  assert.equal(await read, false, 'the stale read is refused');
  assert.ok(G.aggYears !== 10 && G.agg === null, `aggregates from year ${G.aggYears}`);
  assert.ok(G.bank.every(v => v === 0), 'and its water is not banked');
});
