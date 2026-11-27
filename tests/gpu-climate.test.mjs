// The climate's GPU paths against their CPU references from one warm state: the energy balance (src/gpu/ebm.js,
// with the clouds and moist static energy), the moisture (src/gpu/moisture.js: its packing, and its balance against the CPU's sweeps), the tide.
import test from 'node:test';
import assert from 'node:assert/strict';
import { skip } from './webgpu-node.mjs';


/** A warm level-5 climate (moisture on the GPU), its device, and a way to run a generator awaiting the GPU. */
async function warm() {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuMoisture } = await import('../src/gpu/moisture.js');
  const { Planet } = await import('../src/engine/planet.js');
  const P = new Planet('earthlike', { level: 4, spinup: 10 });
  const device = await gpuDevice(), c = P.climate;
  c.gpu = new GpuMoisture(device, c.grid);
  for (let k = 0; k < 3; k++) { await c.solveAsync(1); P.afterClimate(); }
  const drive = async it => { for (let r = it.next(); !r.done; r = it.next()) if (r.value && r.value.then) await r.value; };
  return { P, c, device, drive };
}
const rmsDiff = (a, b, w) => { let s = 0, ws = 0, mx = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += w[i] * d * d; ws += w[i]; mx = Math.max(mx, Math.abs(d)); } return [Math.sqrt(s / ws), mx]; };

test('the energy balance on the GPU: the CPU\'s fixed point, solved tightly', { skip }, async () => {
  const { GpuEnergyBalance } = await import('../src/gpu/ebm.js');
  const { CLIMATE } = await import('../src/engine/climate.js');
  const { c, device, drive } = await warm();
  // One energy balance each way from the same state, Anderson's memory cleared (so neither
  // starts from the other's seasons), the CPU's solves converged far past their default.
  assert.ok(c.airHeat.on, 'the air\'s heat carried by the wind (src/engine/airheat.js) is on');
  assert.ok(c.clouds.stats.points >= 18, 'the clouds diagnosed from the moisture (src/engine/clouds.js)');
  assert.ok(c.mseOn, 'moist static energy\'s latent part: its edges\' factor on every level and its lagged rest (src/engine/climate.js, `latentSource`)');
  // The lakes' heat (`heatCapacity`) on a fifth of the land, packed with the land's flag (this planet holds no lakes at level 4).
  for (let i = 0; i < c.grid.n; i++) if (c.landMask[i] && i % 5 === 0) c.lakeHeat[i] = 1.5;
  c.ebmWs.hist = 0;
  const snap = { Tc: c.Tc.map(a => a.slice()), Tf: c.Tf.map(a => a.slice()), snow: c.snowAnn.slice(), ws: structuredClone(c.ebmWs), th: c.seaHeat.theta.slice(), deep: c.seaHeat.deep };
  const cg = CLIMATE.EBM_CG.slice();
  CLIMATE.EBM_CG.splice(0, 2, 1e-11, 3000);
  try { await drive(c.energyBalance()); } finally { CLIMATE.EBM_CG.splice(0, 4, ...cg); }
  const cpu = { Tc: c.Tc.map(a => a.slice()), Tf: c.Tf.map(a => a.slice()), snow: c.snowAnn.slice(), meanT: c.stats.meanT, steps: c.stats.ebmSteps };
  snap.Tc.forEach((a, k) => c.Tc[k].set(a)); snap.Tf.forEach((a, k) => c.Tf[k].set(a)); c.snowAnn.set(snap.snow); c.ebmWs = snap.ws;
  c.seaHeat.theta.set(snap.th); c.seaHeat.deep = snap.deep;   // the sea's water warm-starts from its last solution
  c.ebmGpu = new GpuEnergyBalance(device, c);
  await drive(c.energyBalance());
  assert.equal(c.stats.ebmSteps, cpu.steps, 'the same number of fixed-point steps');
  const A = c.coarse.area, a = c.grid.area;
  for (let k = 0; k < 5; k++) {
    const [r, m] = rmsDiff(cpu.Tc[k], c.Tc[k], A), [rf, mf] = rmsDiff(cpu.Tf[k], c.Tf[k], a);
    // f32 against f64, rms and the worst cell (1.1e-3 K in the second harmonic on the planet with
    // Earth's relief, 2026-11-18; under 1e-3 before).
    assert.ok(r < 2e-4 && m < 2e-3, `coarse harmonic ${k}: ${r.toExponential(2)} K rms, ${m.toExponential(2)} max`);
    assert.ok(rf < 2e-4 && mf < 2e-3, `fine harmonic ${k}: ${rf.toExponential(2)} K rms, ${mf.toExponential(2)} max`);
  }
  const [rs] = rmsDiff(cpu.snow, c.snowAnn, a);
  assert.ok(rs < 1e-5, `snow-and-ice share: ${rs.toExponential(2)} rms`);
  assert.ok(Math.abs(c.stats.meanT - cpu.meanT) < 1e-4, `mean temperature ${c.stats.meanT} against ${cpu.meanT}`);
});

test('the moisture\'s coefficients packed on the GPU: the CPU\'s packing, solved alike', { skip }, async () => {
  const { c, drive } = await warm();
  const { CLIMATE } = await import('../src/engine/climate.js'), { VEG } = await import('../src/engine/vegetation.js');
  const gm = c.gpu, n = c.grid.n, a = c.grid.area;
  // The CPU's packing goes through `solve` (a solver without `solveFrom`); the GPU's through `solveFrom`,
  // from the geography a cycle packs before its six points.
  const old = { solve: (...x) => gm.solve(...x) };
  gm.setGeography(c, CLIMATE, VEG);
  for (const p of [0, 3]) {
    const W0 = c.W[p].slice();
    c.gpu = old; await drive(c.phase(p));
    const ref = { W: c.W[p].slice(), P: c.Pph[p].slice() };
    c.W[p].set(W0);
    c.gpu = gm; await drive(c.phase(p));
    let dw = 0, sw = 0, dp = 0, sp = 0;
    for (let i = 0; i < n; i++) { dw += a[i] * (ref.W[i] - c.W[p][i]) ** 2; sw += a[i] * ref.W[i] ** 2; dp += a[i] * (ref.P[i] - c.Pph[p][i]) ** 2; sp += a[i] * ref.P[i] ** 2; }
    assert.ok(Math.sqrt(dw / sw) < 1e-5, `point ${p}: column water off by ${Math.sqrt(dw / sw).toExponential(2)} (relative rms)`);
    assert.ok(Math.sqrt(dp / sp) < 1e-4, `point ${p}: rain off by ${Math.sqrt(dp / sp).toExponential(2)} (relative rms)`);
  }
});

test('moisture on the GPU: the balance the CPU sweeps converge to', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuMoisture } = await import('../src/gpu/moisture.js');
  const { Planet, CLIMATE } = await import('../src/engine/planet.js');
  const { VEG } = await import('../src/engine/vegetation.js');
  const P = new Planet('earthlike', { level: 4, spinup: 10 });
  const c = P.climate;
  c.solve(4);
  // Each point of the year from the same state each way, the CPU's sweeps run to convergence (point by
  // point: a whole cycle's rain also answers the state it carries on, which moist static energy's
  // opening moves ~10% a cycle).
  const gm = new GpuMoisture(await gpuDevice(), c.grid), base = CLIMATE.SWEEPS;
  const drive = async it => { for (let r = it.next(); !r.done; r = it.next()) if (r.value && r.value.then) await r.value; };
  let d = 0, sum = 0;
  for (let p = 0; p < 6; p++) {
    const W0 = c.W[p].slice();
    c.gpu = null; CLIMATE.SWEEPS = 60;
    try { await drive(c.phase(p)); } finally { CLIMATE.SWEEPS = base; }
    const ref = c.Pph[p].slice();
    c.W[p].set(W0);
    c.gpu = gm; gm.setGeography(c, CLIMATE, VEG);
    await drive(c.phase(p));
    for (let i = 0; i < c.grid.n; i++) { d += Math.abs(c.Pph[p][i] - ref[i]); sum += ref[i]; }
  }
  // The GPU's sweeps stop at their own count (1.16% on the planet with Earth's relief, 2026-11-18; under 1% before).
  assert.ok(d < 0.015 * sum, `rain off by ${(100 * d / sum).toFixed(2)}% in all`);
});

test('the tide on the GPU: the CPU reference, on the opening planet', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuTides } = await import('../src/gpu/tides.js');
  const { Tides, Moon } = await import('../src/engine/tides.js');
  const { Planet } = await import('../src/engine/planet.js');
  const P = new Planet('earthlike', { level: 4, spinup: 10 }), g = P.grid, m = new Moon();
  const depth = P.tideDepth(g.n);
  const cpu = new Tides(g); cpu.ocean(depth);
  const gpu = new GpuTides(await gpuDevice(), g); gpu.ocean(depth);
  const a = cpu.solve(m.omega, m.Omega, 12), b = await gpu.solve(m.omega, m.Omega, 12);
  let d = 0, s = 0;
  for (let i = 0; i < g.n; i++) { d += Math.hypot(a.C[i] - b.C[i], a.S[i] - b.S[i]) * g.area[i]; s += Math.hypot(a.C[i], a.S[i]) * g.area[i]; }
  assert.ok(d < 0.005 * s, `harmonic off by ${(100 * d / s).toFixed(3)}%`);
  assert.ok(Math.abs(a.P - b.P) < 0.005 * a.P, `dissipation ${b.P.toExponential(3)} against ${a.P.toExponential(3)}`);
});
