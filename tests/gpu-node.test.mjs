// The engine's GPU paths against their CPU references, headless (WebGPU in
// node via tests/webgpu-node.mjs; skipped without it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGPU } from './webgpu-node.mjs';
import { buildGrid } from '../src/grid/icosphere.js';
import { Ice } from '../src/engine/ice.js';

const skip = hasGPU ? false : 'no WebGPU in node (npm install in tests/)';

test("ice on the GPU: Vialov's cap, as the CPU's", { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuIce } = await import('../src/gpu/ice.js');
  const device = await gpuDevice();
  const g = buildGrid(5), n = g.n;
  const tec = { grid: g, elev: new Float32Array(n).fill(0.5), seaLevel: 0, updateElevation() {} };
  const climate = { version: 0, tAt: () => 0, pAt: () => 0 };
  const L = 0.25, r = Float64Array.from({ length: n }, (_, i) => Math.acos(Math.min(1, g.pos[3 * i + 2])));
  const cpu = new Ice(tec, climate), gpuIce = new Ice(tec, climate);
  cpu.mbVersion = 0;
  for (let i = 0; i < n; i++) cpu.M[i] = gpuIce.M[i] = r[i] < L ? 0.3 : -50;
  const gi = new GpuIce(device, gpuIce);
  gi.mbVersion = 0;                                   // the mass balance is set by hand
  device.queue.writeBuffer(gi.M, 0, Float32Array.from(gpuIce.M));
  for (let k = 0; k < 120; k++) { cpu.advance(1000, 1e9); gi.advance(1000, 400); }
  while (gi.reading) await new Promise(r => setTimeout(r, 5));
  await gi.read();
  const H0 = Math.max(...cpu.H), G0 = Math.max(...gpuIce.H);
  let worst = 0;
  for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(gpuIce.H[i] - cpu.H[i]));
  assert.ok(Math.abs(G0 - H0) < 0.02 * H0 && worst < 0.05 * H0, `dome ${G0.toFixed(0)} m against ${H0.toFixed(0)} m; worst cell off by ${worst.toFixed(0)} m`);
  assert.ok(Math.abs(gpuIce.stats.volume - cpu.stats.volume) < 0.03 * cpu.stats.volume, 'volume');
});

test('moisture on the GPU: the balance the CPU sweeps converge to', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuMoisture } = await import('../src/gpu/moisture.js');
  const { Planet, CLIMATE } = await import('../src/engine/planet.js');
  const P = new Planet('earthlike', { level: 5, spinup: 10 });
  const c = P.climate;
  c.solve(4);
  // One more cycle from the same state each way: the CPU's sweeps run to convergence.
  const keys = ['Tc', 'Tf', 'W', 'Pph', 'Pf', 'zones', 'snowAnn', 'runoff'];
  const snap = Object.fromEntries(keys.map(k => [k, structuredClone(c[k])]));
  const restore = () => { for (const k of keys) { if (Array.isArray(c[k])) c[k].forEach((a, i) => a.set(snap[k][i])); else c[k].set(snap[k]); } };
  const base = CLIMATE.SWEEPS;
  CLIMATE.SWEEPS = 60;
  c.solve(1);
  CLIMATE.SWEEPS = base;
  const ref = c.Pph.map(p => Float32Array.from(p));
  restore();
  c.gpu = new GpuMoisture(await gpuDevice(), c.grid);
  await c.solveAsync(1);
  let d = 0, sum = 0;
  for (let p = 0; p < 6; p++) for (let i = 0; i < c.grid.n; i++) { d += Math.abs(c.Pph[p][i] - ref[p][i]); sum += ref[p][i]; }
  assert.ok(d < 0.01 * sum, `rain off by ${(100 * d / sum).toFixed(2)}% in all`);
});
