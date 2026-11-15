// The climate's cycle on the GPU against its CPU reference (src/engine/climate.js),
// headless (WebGPU in node via tests/webgpu-node.mjs; skipped without it):
// the energy balance's steps (src/gpu/ebm.js) and the moisture's packing
// (src/gpu/moisture.js, solveFrom), each from one warm state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGPU } from './webgpu-node.mjs';

const skip = hasGPU ? false : 'no WebGPU in node (npm install in tests/)';

/** A warm level-5 climate (moisture on the GPU), its device, and a way to run a generator awaiting the GPU. */
async function warm() {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuMoisture } = await import('../src/gpu/moisture.js');
  const { Planet } = await import('../src/engine/planet.js');
  const P = new Planet('earthlike', { level: 5, spinup: 10 });
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
  c.ebmWs.hist = 0;
  const snap = { Tc: c.Tc.map(a => a.slice()), Tf: c.Tf.map(a => a.slice()), snow: c.snowAnn.slice(), ws: structuredClone(c.ebmWs) };
  const cg = CLIMATE.EBM_CG.slice();
  CLIMATE.EBM_CG.splice(0, 2, 1e-11, 3000);
  try { await drive(c.energyBalance()); } finally { CLIMATE.EBM_CG.splice(0, 4, ...cg); }
  const cpu = { Tc: c.Tc.map(a => a.slice()), Tf: c.Tf.map(a => a.slice()), snow: c.snowAnn.slice(), meanT: c.stats.meanT, steps: c.stats.ebmSteps };
  snap.Tc.forEach((a, k) => c.Tc[k].set(a)); snap.Tf.forEach((a, k) => c.Tf[k].set(a)); c.snowAnn.set(snap.snow); c.ebmWs = snap.ws;
  c.ebmGpu = new GpuEnergyBalance(device, c);
  await drive(c.energyBalance());
  assert.equal(c.stats.ebmSteps, cpu.steps, 'the same number of fixed-point steps');
  const A = c.coarse.area, a = c.grid.area;
  for (let k = 0; k < 5; k++) {
    const [r, m] = rmsDiff(cpu.Tc[k], c.Tc[k], A), [rf, mf] = rmsDiff(cpu.Tf[k], c.Tf[k], a);
    assert.ok(r < 1e-4 && m < 1e-3, `coarse harmonic ${k}: ${r.toExponential(2)} K rms, ${m.toExponential(2)} max`);
    assert.ok(rf < 1e-4 && mf < 1e-3, `fine harmonic ${k}: ${rf.toExponential(2)} K rms, ${mf.toExponential(2)} max`);
  }
  const [rs] = rmsDiff(cpu.snow, c.snowAnn, a);
  assert.ok(rs < 1e-5, `snow-and-ice share: ${rs.toExponential(2)} rms`);
  assert.ok(Math.abs(c.stats.meanT - cpu.meanT) < 1e-4, `mean temperature ${c.stats.meanT} against ${cpu.meanT}`);
});

test('the moisture\'s coefficients packed on the GPU: the CPU\'s packing, solved alike', { skip }, async () => {
  const { c, drive } = await warm();
  const gm = c.gpu, n = c.grid.n, a = c.grid.area;
  // The CPU's packing goes through `solve` (a solver without `solveFrom`); the GPU's through `solveFrom`.
  const old = { solve: (...x) => gm.solve(...x) };
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
