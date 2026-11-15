// The ground on the GPU (src/gpu/soil.js) against its CPU reference
// (src/engine/soil.js), and its cost at level 7. WebGPU in node via
// tests/webgpu-node.mjs; skipped without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGPU } from './webgpu-node.mjs';
import { Soil, potentialEvaporation } from '../src/engine/soil.js';

const skip = hasGPU ? false : 'no WebGPU in node (npm install in tests/)';
const season = m => Math.cos(2 * Math.PI * (m - 6) / 12);
const jitter = i => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
const CLIMATES = [];
for (const mat of [-15, -10, -5, 0, 5, 10, 15, 20, 25]) for (const A of [0, 5, 10, 15, 20])
  for (const map of [100, 250, 500, 1000, 2000, 3000]) for (const ph of [0, 1, -1]) CLIMATES.push({ mat, A, map, ph });
/** n cells' forcing, 12 per cell, from the climates above, jittered; every fourth cell sea. */
function forcing(n) {
  const T = new Float32Array(12 * n), P = new Float32Array(12 * n), Smax = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = CLIMATES[i % CLIMATES.length], dt = 2 * jitter(i + 1), rf = 0.8 + 0.4 * jitter(i);
    Smax[i] = i % 4 === 3 ? 0 : 50 + 300 * jitter(i + 2);
    for (let m = 0; m < 12; m++) { T[12 * i + m] = c.mat + c.A * season(m) + dt; P[12 * i + m] = c.map / 12 * (1 + 0.8 * c.ph * season(m)) * rf; }
  }
  return { T, P, PET: potentialEvaporation(T), Smax };
}
const device = async () => (await import('../src/gpu/device.js')).gpuDevice();

test('the ground on the GPU: the CPU reference, month by month and twelve at a dispatch, with anomalies', { skip }, async t => {
  const { GpuSoil } = await import('../src/gpu/soil.js');
  const n = 4 * CLIMATES.length, f = forcing(n);
  const cpu = new Soil(n, f.Smax);
  cpu.equilibrium(f.T, f.P, f.PET, { cold: true });
  const gpu = new GpuSoil(await device(), n, f.Smax);
  gpu.setForcing(f.T, f.P, f.PET);
  gpu.setState(cpu.S, cpu.SWE, cpu.Tg);
  const dT = new Float32Array(12 * n), rf = new Float32Array(12 * n);
  const anomalies = y => { for (let j = 0; j < 12 * n; j++) { dT[j] = 6 * (jitter(j + 31 * y) - 0.5); rf[j] = 0.3 + 1.4 * jitter(j + 17 * y + 5); } };
  // A year a month at a time, then two years twelve months at a dispatch.
  anomalies(0);
  for (let m = 0; m < 12; m++) {
    const a = dT.subarray(m * n, (m + 1) * n), b = rf.subarray(m * n, (m + 1) * n);
    cpu.stepMonth(m, f.T, f.P, f.PET, a, b);
    gpu.setAnomaly(a, b, 1); gpu.step(m, 1);
  }
  for (let y = 1; y < 3; y++) {
    anomalies(y);
    for (let m = 0; m < 12; m++) cpu.stepMonth(m, f.T, f.P, f.PET, dT.subarray(m * n, (m + 1) * n), rf.subarray(m * n, (m + 1) * n));
    gpu.setAnomaly(dT, rf, 12); gpu.step(0, 12);
  }
  cpu.aggregate();
  const r = await gpu.read({ monthly: true, state: true });
  let dS = 0, dW = 0, dG = 0, dR = 0, dRm = 0, dWet = 0, dPf = 0, sumR = 0;
  for (let i = 0; i < n; i++) {
    if (!(f.Smax[i] > 0)) { assert.equal(r.runoff[i], 0); continue; }
    dS = Math.max(dS, Math.abs(r.S[i] - cpu.S[i])); dW = Math.max(dW, Math.abs(r.SWE[i] - cpu.SWE[i]));
    dG = Math.max(dG, Math.abs(r.Tg[i] - cpu.Tg[i]));
    dR += Math.abs(r.runoff[i] - cpu.runoff[i]); sumR += cpu.runoff[i];
    for (let m = 0; m < 12; m++) { const k = 12 * i + m; dRm = Math.max(dRm, Math.abs(r.runoffM[k] - cpu.out.quick[k] - cpu.out.base[k])); }
    dWet = Math.max(dWet, Math.abs(r.wet[i] - cpu.wet[i])); dPf = Math.max(dPf, Math.abs(r.permafrost[i] - cpu.permafrost[i]));
  }
  const msg = `S ${dS.toFixed(3)} mm, SWE ${dW.toFixed(3)} mm, Tg ${dG.toFixed(4)} K, runoff ${(100 * dR / sumR).toFixed(4)}% in all, a month's ${dRm.toFixed(3)} mm, wetness ${dWet.toExponential(1)}, permafrost ${dPf.toExponential(1)}`;
  t.diagnostic(`worst cell after three years: ${msg}`);
  assert.ok(dS < 0.05 && dW < 0.05 && dG < 0.005 && dR < 1e-4 * sumR && dRm < 0.05 && dWet < 1e-3 && dPf < 1e-3, msg);
});

test('the ground on the GPU: the periodic year stays periodic', { skip }, async t => {
  const { GpuSoil } = await import('../src/gpu/soil.js');
  const n = 4 * CLIMATES.length, f = forcing(n);
  const cpu = new Soil(n, f.Smax);
  cpu.equilibrium(f.T, f.P, f.PET, { cold: true });
  const gpu = new GpuSoil(await device(), n, f.Smax);
  gpu.setForcing(f.T, f.P, f.PET);
  gpu.setState(cpu.S, cpu.SWE, cpu.Tg);
  gpu.step(0, 60);   // five years in one dispatch
  const r = await gpu.read({ state: true });
  let d = 0, dr = 0, s = 0;
  for (let i = 0; i < n; i++) {
    if (!(f.Smax[i] > 0)) continue;
    d = Math.max(d, Math.abs(r.S[i] - cpu.S[i]), Math.abs(r.SWE[i] - cpu.SWE[i]));
    dr += Math.abs(r.runoff[i] - cpu.runoff[i]); s += cpu.runoff[i];
  }
  const msg = `after five years: state off by ${d.toFixed(3)} mm at worst, runoff by ${(100 * dr / s).toFixed(4)}% in all`;
  t.diagnostic(msg);
  assert.ok(d < 0.5 && dr < 1e-3 * s, msg);
});

test('the ground on the GPU: the cost at level 7', { skip }, async t => {
  const { GpuSoil } = await import('../src/gpu/soil.js');
  const dev = await device(), n = 163842, f = forcing(n);
  f.Smax.fill(150);   // every cell land: the worst case
  const gpu = new GpuSoil(dev, n, f.Smax);
  gpu.setForcing(f.T, f.P, f.PET);
  const time = async (k, reps) => {
    gpu.step(0, k); await dev.queue.onSubmittedWorkDone();
    const t0 = performance.now();
    for (let r = 0; r < reps; r++) gpu.step((r * k) % 12, k);
    await dev.queue.onSubmittedWorkDone();
    return (performance.now() - t0) / reps;
  };
  const one = await time(1, 50), twelve = await time(12, 20), many = await time(120, 3);
  let t0 = performance.now();
  await gpu.read();
  const ra = performance.now() - t0;
  t0 = performance.now();
  await gpu.read({ monthly: true });
  const rm = performance.now() - t0;
  t.diagnostic(`${n} cells: a month ${one.toFixed(2)} ms a dispatch; 12 months ${twelve.toFixed(2)} ms; 120 months ${many.toFixed(1)} ms (${(many / 120).toFixed(3)} ms a month); read: aggregates ${ra.toFixed(1)} ms, with the months' runoff ${rm.toFixed(1)} ms`);
  assert.ok(many / 120 < 5, 'a month under 5 ms');
});
