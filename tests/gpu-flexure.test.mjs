// Flexure on the GPU (src/gpu/flexure.js) against the CPU reference
// (src/engine/flexure.js), headless (WebGPU in node via tests/webgpu-node.mjs;
// skipped without it): one V-cycle step for step, the converged solution, and
// the cost at levels 6 and 7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGPU } from './webgpu-node.mjs';
import { buildGrid } from '../src/grid/icosphere.js';
import { Flexure, breakAtBoundaries, teForLength } from '../src/engine/flexure.js';

const skip = hasGPU ? false : 'no WebGPU in node (npm install in tests/)';
const say = (...a) => console.log('  ', ...a);

const grids = [];
const grid = L => { for (let l = 1; l <= L; l++) grids[l] ||= buildGrid(l); return grids[L]; };

// Twelve plates, Tₑ 15–75 km varying within them, broken at their boundaries; a rough load with point-like peaks.
function scene(g) {
  const n = g.n;
  const seeds = Array.from({ length: 12 }, (_, k) => { const z = 1 - 2 * (k + 0.5) / 12, r = Math.sqrt(1 - z * z); return [r * Math.cos(2.4 * k), r * Math.sin(2.4 * k), z]; });
  const owner = new Int16Array(n), Te = new Float32Array(n), q = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2];
    let best = 0, bd = -2;
    seeds.forEach((s, k) => { const d = s[0] * x + s[1] * y + s[2] * z; if (d > bd) { bd = d; best = k; } });
    owner[i] = best;
    Te[i] = 15 + 60 * (0.5 + 0.5 * Math.sin(3 * x + 2 * y) * Math.cos(4 * z));
    q[i] = 2.5e7 * (Math.sin(7 * x) * Math.cos(5 * y + z) + (Math.sin(40 * x * y) > 0.95 ? 3 : 0));
  }
  breakAtBoundaries(g, owner, Te);
  return { Te, q };
}
const relMax = (a, b) => { let d = 0, m = 0; for (let i = 0; i < a.length; i++) { d = Math.max(d, Math.abs(a[i] - b[i])); m = Math.max(m, Math.abs(b[i])); } return d / m; };

test('flexure on the GPU: one V-cycle as the CPU takes it, and the converged plate', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuFlexure } = await import('../src/gpu/flexure.js');
  const device = await gpuDevice();
  for (const L of [6, 7]) {
    const g = grid(L), { Te, q } = scene(g);
    const cpu = new Flexure(g, { have: grids.filter(Boolean) }), gpu = new GpuFlexure(device, g, { have: grids.filter(Boolean) });
    cpu.setRigidity(Te); gpu.setRigidity(Te);
    const c1 = Float64Array.from(cpu.solve(q, null, { cycles: 1, warm: false }));
    const g1 = await gpu.solve(q, null, { cycles: 1, warm: false });
    const one = relMax(g1, c1);
    const ref = Float64Array.from(cpu.solve(q, null, { tol: 1e-10, warm: false }));
    const gc = await gpu.solve(q, null, { cycles: 30, warm: false });
    const conv = relMax(gc, ref);
    // A uniform plate under a line load at the equator, α 300 km.
    const te = teForLength(3e5), T2 = new Float32Array(g.n).fill(te), h = Math.sqrt(4 * Math.PI / g.n) * 6.371e6, sig = 0.6 * h;
    const q2 = Float32Array.from({ length: g.n }, (_, i) => { const x = 6.371e6 * Math.asin(g.pos[3 * i + 2]); return 1e12 * Math.exp(-x * x / (2 * sig * sig)) / (Math.sqrt(2 * Math.PI) * sig); });
    const r2 = Float64Array.from(cpu.solve(q2, T2, { tol: 1e-10, warm: false }));
    const g2 = await gpu.solve(q2, T2, { cycles: 30, warm: false });
    const line = relMax(g2, r2);
    // The load from a buffer on the device (an ice sheet's thickness, scaled by ρᵢg), as the ice's bed would take it.
    const Hice = Float32Array.from({ length: g.n }, (_, i) => { const r = Math.acos(Math.min(1, g.pos[3 * i + 2])) / 0.19; return r < 1 ? 3000 * (1 - r ** (4 / 3)) ** (3 / 8) : 0; });
    const { storage } = await import('../src/gpu/device.js');
    const Hbuf = storage(device, 4 * g.n, Hice);
    const r3 = Float64Array.from(cpu.solve(Float64Array.from(Hice, h => 917 * 9.81 * h), Te, { tol: 1e-10, warm: false }));
    gpu.setRigidity(Te); gpu.useLoad(Hbuf, 917 * 9.81);
    const g3 = await gpu.solve(null, null, { cycles: 30, warm: false });
    const ice = relMax(g3, r3);
    say(`level ${L}: one V-cycle from rest, GPU against CPU ${one.toExponential(2)} of max |w|; converged (30 cycles), broken varying plates ${conv.toExponential(2)}, ` +
      `line load ${line.toExponential(2)}, an ice sheet's load from a device buffer ${ice.toExponential(2)}`);
    assert.ok(one < 1e-3, `one cycle ${one}`);
    assert.ok(conv < 2e-4 && line < 2e-4 && ice < 2e-4, `converged ${conv}, ${line}, ${ice}`);
  }
});

test('flexure on the GPU: convergence, warm starts and cost at levels 6 and 7', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuFlexure } = await import('../src/gpu/flexure.js');
  const device = await gpuDevice();
  for (const L of [6, 7]) {
    const g = grid(L), { Te, q } = scene(g);
    const cpu = new Flexure(g, { have: grids.filter(Boolean) }), gpu = new GpuFlexure(device, g, { have: grids.filter(Boolean) });
    const ref = Float64Array.from(cpu.solve(q, Te, { tol: 1e-10, warm: false }));
    let t0 = performance.now();
    gpu.setRigidity(Te);
    const tSet = performance.now() - t0;
    // Error against the converged plate after k cycles from rest.
    const cold = [];
    for (const k of [1, 2, 4, 8, 12]) cold.push(`${k}: ${relMax(await gpu.solve(q, null, { cycles: k, warm: false }), ref).toExponential(1)}`);
    // Warm: the load changes by ~1% (a plate step's worth); the CPU's converged answer to the new load.
    await gpu.solve(q, null, { cycles: 20, warm: false });
    const q2 = Float32Array.from(q, (v, i) => v * (1 + 0.01 * Math.sin(20 * g.pos[3 * i + 1])));
    const ref2 = Float64Array.from(cpu.solve(q2, null, { tol: 1e-10 }));
    const warm = [`0: ${relMax(await gpu.read(), ref2).toExponential(1)}`];
    for (let k = 1; k <= 3; k++) warm.push(`${k}: ${relMax(await gpu.solve(q2, null, { cycles: 1 }), ref2).toExponential(1)}`);
    // Time per V-cycle: k cycles submitted at once, the GPU's work done, less the empty submit's.
    const timeIt = async k => { gpu.setLoad(q); await device.queue.onSubmittedWorkDone(); const t = performance.now(); gpu.run(k); await device.queue.onSubmittedWorkDone(); return performance.now() - t; };
    await timeIt(4);
    let best = Infinity, base = Infinity;
    for (let r = 0; r < 5; r++) { best = Math.min(best, await timeIt(40)); base = Math.min(base, await timeIt(0)); }
    const perCycle = (best - base) / 40;
    t0 = performance.now();
    await gpu.solve(q, null, { cycles: 6, warm: false });
    const tSolve = performance.now() - t0;
    say(`level ${L} (${g.n} cells, ${gpu.cycle.length} dispatches a cycle): ${perCycle.toFixed(3)} ms a V-cycle on the GPU; setting rigidity ${tSet.toFixed(1)} ms (CPU); ` +
      `a 6-cycle solve with its readback ${tSolve.toFixed(1)} ms; error from rest after cycles ${cold.join(', ')}; warm after a 1% change ${warm.join(', ')}`);
    assert.ok(relMax(await gpu.solve(q, null, { cycles: 16, warm: false }), ref) < 1e-3);
  }
});
