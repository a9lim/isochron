// Phase 7's ice on the GPU (src/gpu/ice.js) against the CPU reference
// (src/engine/ice.js), headless (WebGPU in node via tests/webgpu-node.mjs;
// skipped without it): a cap sliding on a half-soft bed with a thaw front
// across it, its erosion, till and outwash, and its bed bent by flexure
// (GpuFlexure read in place against Flexure); and the step's cost at level 7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGPU } from './webgpu-node.mjs';
import { buildGrid } from '../src/grid/icosphere.js';
import { Ice, ICE } from '../src/engine/ice.js';
import { Flexure } from '../src/engine/flexure.js';

const skip = hasGPU ? false : 'no WebGPU in node (npm install in tests/)';
const say = (...a) => console.log('  ', ...a);
const grids = [];
const grid = L => { for (let l = 1; l <= L; l++) grids[l] ||= buildGrid(l); return grids[L]; };

/** A cap on a flat bed: soft where x > 0, warm (Ts0 0 °C, 80 mW/m²) where y > 0 and cold (−40 °C, 20 mW/m²) where not. */
function scene(g) {
  const n = g.n, tec = { grid: g, elev: new Float32Array(n).fill(0.5), seaLevel: 0, updateElevation() {} };
  const make = () => {
    const ice = new Ice(tec, { version: 0, tAt: () => 0, pAt: () => 0 });
    ice.mbVersion = 0;                                   // the mass balance is set by hand
    for (let i = 0; i < n; i++) {
      const x = g.pos[3 * i], y = g.pos[3 * i + 1], r = Math.acos(Math.min(1, g.pos[3 * i + 2]));
      ice.M[i] = r < 0.25 ? 0.3 : -50; ice.melt[i] = r < 0.25 ? 0 : 50;
      ice.Ts0[i] = y > 0 ? 0 : -40; ice.geo[i] = y > 0 ? 0.08 : 0.02;
      ice.soft[i] = x > 0 ? 1 : 0;
    }
    ice.setSoftness(ice.soft);
    return ice;
  };
  return { tec, make };
}
const sum = (a, w) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * (w ? w[i] : 1); return s; };
const settle = async gi => { while (gi.reading) await new Promise(r => setTimeout(r, 5)); await gi.read(true); };

test('sliding ice on the GPU: the CPU reference, with erosion, till, outwash and the flexed bed', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuIce } = await import('../src/gpu/ice.js');
  const { GpuFlexure } = await import('../src/gpu/flexure.js');
  const device = await gpuDevice();
  const g = grid(6), n = g.n, { make } = scene(g), Te = new Float32Array(n).fill(60);
  const cpu = make(), gpuIce = make();
  cpu.attachFlexure(new Flexure(g, { have: grids.filter(Boolean) }), { Te });
  const gi = new GpuIce(device, gpuIce);
  gi.mbVersion = 0;
  device.queue.writeBuffer(gi.M, 0, Float32Array.from(gpuIce.M));
  device.queue.writeBuffer(gi.Mx, 0, Float32Array.from({ length: 2 * n }, (_, k) => k % 2 ? gpuIce.Ts0[k >> 1] : gpuIce.melt[k >> 1]));
  gi.attachFlexure(new GpuFlexure(device, g, { have: grids.filter(Boolean) }), { Te });
  // Read back every 10 kyr, as the page does every ~100 ms: the GPU plans its steps from the limit it last read.
  for (let k = 0; k < 120; k++) { cpu.advance(1000, 1e9); gi.advance(1000, 400); if (k % 10 === 9) await settle(gi); }
  await settle(gi);
  const a = cpu.takeGlacial(), b = gpuIce.takeGlacial(), deb0 = [sum(cpu.debris, cpu.areaM), sum(gpuIce.debris, cpu.areaM)];
  for (let k = 0; k < 20; k++) { cpu.advance(1000, 1e9); gi.advance(1000, 400); if (k % 10 === 9) await settle(gi); }
  await settle(gi);
  const c = cpu.takeGlacial(), d = gpuIce.takeGlacial(), A = cpu.areaM;
  const H0 = cpu.H.reduce((m, v) => Math.max(m, v), 0), G0 = gpuIce.H.reduce((m, v) => Math.max(m, v), 0);
  let worst = 0, du = 0, su = 0, dw = 0, wm = 0;
  for (let i = 0; i < n; i++) {
    worst = Math.max(worst, Math.abs(gpuIce.H[i] - cpu.H[i]));
    du += Math.abs(gpuIce.ub[i] - cpu.ub[i]) * A[i]; su += cpu.ub[i] * A[i];
    dw = Math.max(dw, Math.abs(gpuIce.w[i] - cpu.w[i])); wm = Math.max(wm, Math.abs(cpu.w[i]));
  }
  const rel = (x, y) => Math.abs(x / y - 1), deb1 = [sum(cpu.debris, A), sum(gpuIce.debris, A)];
  const ero = [sum(c.eroded, A), sum(d.eroded, A)], till = [sum(c.till, A), sum(d.till, A)], out = [sum(c.outwash), sum(d.outwash)];
  say(`level 6: dome ${G0.toFixed(0)} m against ${H0.toFixed(0)}, worst cell off by ${worst.toFixed(0)} m; sliding off by ${(100 * du / su).toFixed(2)}% (area-weighted); ` +
    `thawed ${gpuIce.stats.thawed.toFixed(3)} against ${cpu.stats.thawed.toFixed(3)}; bed off by ${(100 * dw / wm).toFixed(2)}% of its ${wm.toFixed(0)} m; ` +
    `over the last 20 kyr: eroded ${(ero[1] / 1e9).toFixed(0)} km³ against ${(ero[0] / 1e9).toFixed(0)}, till ${(till[1] / 1e9).toFixed(0)} against ${(till[0] / 1e9).toFixed(0)}, ` +
    `outwash ${(out[1] / 1e12).toFixed(1)} against ${(out[0] / 1e12).toFixed(1)} thousand km³; debris ${(deb0[1] / 1e9).toFixed(0)} → ${(deb1[1] / 1e9).toFixed(0)} km³ ` +
    `against ${(deb0[0] / 1e9).toFixed(0)} → ${(deb1[0] / 1e9).toFixed(0)}, the GPU's budget off by ${(100 * (ero[1] - till[1] - deb1[1] + deb0[1]) / ero[1]).toFixed(2)}%`);
  assert.ok(Math.abs(G0 - H0) < 0.02 * H0 && worst < 0.05 * H0, 'thickness');
  assert.ok(du < 0.05 * su, 'sliding');
  assert.ok(dw < 0.02 * wm, 'the bed');
  assert.ok(rel(ero[1], ero[0]) < 0.01 && rel(till[1], till[0]) < 0.01 && rel(out[1], out[0]) < 0.01, 'the integrals');
  assert.ok(Math.abs(ero[1] - till[1] - deb1[1] + deb0[1]) < 1e-4 * ero[1], "the GPU's rock kept");
  assert.ok(sum(a.eroded, A) > 0 && sum(b.eroded, A) > 0);
});

test('sliding ice on the GPU: the step at level 7, and its cost', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuIce } = await import('../src/gpu/ice.js');
  const { GpuFlexure } = await import('../src/gpu/flexure.js');
  const device = await gpuDevice();
  const g = grid(7), n = g.n, { make } = scene(g);
  const res = {};
  for (const soft of [0, 1]) {
    const ice = make();
    ice.setSoftness(new Float32Array(n).fill(soft));
    const gi = new GpuIce(device, ice);
    gi.mbVersion = 0;
    device.queue.writeBuffer(gi.M, 0, Float32Array.from(ice.M));
    device.queue.writeBuffer(gi.Mx, 0, Float32Array.from({ length: 2 * n }, (_, k) => k % 2 ? ice.Ts0[k >> 1] : ice.melt[k >> 1]));
    gi.attachFlexure(new GpuFlexure(device, g, { have: grids.filter(Boolean) }), { Te: new Float32Array(n).fill(60) });
    for (let k = 0; k < 60; k++) gi.advance(1000, 400);       // a cap grown, then timed
    await settle(gi);
    const steps = 400;
    await device.queue.onSubmittedWorkDone();
    let t0 = performance.now();
    gi.advance(1e6, steps);
    await device.queue.onSubmittedWorkDone();
    const per = (performance.now() - t0) / steps;
    await settle(gi);
    t0 = performance.now();
    for (let k = 0; k < 20; k++) gi.flex.run(1);
    await device.queue.onSubmittedWorkDone();
    res[soft] = { dt: gi.dt, per, vc: (performance.now() - t0) / 20, dome: ice.H.reduce((m, v) => Math.max(m, v), 0) };
  }
  say(`level 7 (${n} cells): the step ${res[0].dt.toFixed(1)} yr on hard rock, ${res[1].dt.toFixed(1)} yr on soft till; ` +
    `${(1000 * res[0].per).toFixed(0)} µs a step (four dispatches) with the flexure's cycle ${(1000 * res[0].vc).toFixed(0)} µs, wall time on this device`);
  assert.ok(res[1].dt > 0 && res[1].dt <= res[0].dt * 1.0001);
});
