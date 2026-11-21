// The ice on the GPU (src/gpu/ice.js) against the CPU reference: a cap sliding on a half-soft bed with a thaw front
// across it, its erosion, till and outwash, and its bed bent by flexure (GpuFlexure read in place); a marine front.
import test from 'node:test';
import assert from 'node:assert/strict';
import { skip } from './webgpu-node.mjs';
import { buildGrid } from '../src/grid/icosphere.js';
import { Ice, calveOf } from '../src/engine/ice.js';
import { Flexure } from '../src/engine/flexure.js';

const grids = [];
const grid = L => { for (let l = 1; l <= L; l++) grids[l] ||= buildGrid(l); return grids[L]; };

/** A cap on a flat bed: soft where x > 0, warm (Ts0 0 °C, 80 mW/m²) where y > 0 and cold (−40 °C, 20 mW/m²) where not. */
function scene(g) {
  const n = g.n;
  const make = () => {
    // Each its own crust: the elevation takes the ice's load (Ice.publish), and a shared one would stand each on the other's.
    const tec = { grid: g, elev: new Float32Array(n).fill(0.5), seaLevel: 0, updateElevation() {} };
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
  return { make };
}
const sum = (a, w) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * (w ? w[i] : 1); return s; };
const settle = async gi => { while (gi.reading) await new Promise(r => setTimeout(r, 5)); await gi.read(true); };

test('sliding ice on the GPU: the CPU reference, with erosion, till, outwash and the flexed bed', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuIce } = await import('../src/gpu/ice.js');
  const { GpuFlexure } = await import('../src/gpu/flexure.js');
  const device = await gpuDevice();
  const g = grid(5), n = g.n, { make } = scene(g), Te = new Float32Array(n).fill(60);
  const cpu = make(), gpuIce = make();
  cpu.attachFlexure(new Flexure(g, { have: grids.filter(Boolean) }), { Te });
  const gi = new GpuIce(device, gpuIce);
  gi.mbVersion = 0;
  device.queue.writeBuffer(gi.M, 0, Float32Array.from(gpuIce.M));
  device.queue.writeBuffer(gi.Mx, 0, Float32Array.from({ length: 4 * n }, (_, k) => [gpuIce.melt, gpuIce.Ts0, gpuIce.M, null][k & 3]?.[k >> 2] ?? 0));
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
  assert.ok(Math.abs(G0 - H0) < 0.02 * H0 && worst < 0.05 * H0, 'thickness');
  assert.ok(du < 0.05 * su, 'sliding');
  assert.ok(dw < 0.02 * wm, 'the bed');
  assert.ok(rel(ero[1], ero[0]) < 0.01 && rel(till[1], till[0]) < 0.01 && rel(out[1], out[0]) < 0.01, 'the integrals');
  assert.ok(Math.abs(ero[1] - till[1] - deb1[1] + deb0[1]) < 1e-4 * ero[1], "the GPU's rock kept");
  assert.ok(sum(a.eroded, A) > 0 && sum(b.eroded, A) > 0);
});

/** The scene: a cap of snow on land at the pole out to 0.30 rad, then a shelf `shelf` m deep to 0.5 rad, then the deep sea; no melt anywhere. */
function marginIce(shelf, tf, L = 6) {
  const g = buildGrid(L), n = g.n;
  const r = Float64Array.from({ length: n }, (_, i) => Math.acos(Math.min(1, g.pos[3 * i + 2])));
  const elev = Float32Array.from(r, v => v < 0.3 ? 0.5 : v < 0.5 ? -shelf / 1000 : -4);
  const tec = { grid: g, elev, seaLevel: 0, updateElevation() {} };
  const ice = new Ice(tec, { version: 0, tAt: () => 0, pAt: () => 0 });
  ice.mbVersion = 0;
  for (let i = 0; i < n; i++) { ice.M[i] = r[i] < 0.25 ? 0.3 : 0; ice.melt[i] = 0; }
  ice.Ts0.fill(-20); ice.setSoftness(new Float32Array(n));
  ice.cf.fill(calveOf(tf));
  return { g, n, r, ice };
}

test('a marine front on the GPU: the CPU reference (the cold shelf)', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuIce } = await import('../src/gpu/ice.js');
  const device = await gpuDevice();
  const a = marginIce(200, 0), b = marginIce(200, 0), n = a.n, cpu = a.ice, gpu = b.ice, r = a.r;
  const gi = new GpuIce(device, gpu);
  gi.mbVersion = 0;
  device.queue.writeBuffer(gi.M, 0, Float32Array.from(gpu.M));
  device.queue.writeBuffer(gi.Mx, 0, Float32Array.from({ length: 4 * n }, (_, k) => [gpu.melt, gpu.Ts0, gpu.M, null][k & 3]?.[k >> 2] ?? 0));
  const settle = async () => { while (gi.reading) await new Promise(res => setTimeout(res, 5)); await gi.read(true); };
  let cc = 0, gc = 0;
  for (let k = 0; k < 40; k++) {
    cpu.advance(1000, 1e9); gi.advance(1000, 400);
    if (k % 5 === 4) await settle();
    if (k >= 30) { cc += cpu.stats.calving; if (k % 5 === 4) gc += 5 * gpu.stats.calving; }
  }
  await settle();
  let worst = 0, Hm = 0, sc = 0, sg = 0;
  for (let i = 0; i < n; i++) {
    worst = Math.max(worst, Math.abs(gpu.H[i] - cpu.H[i])); Hm = Math.max(Hm, cpu.H[i]);
    if (r[i] >= 0.3) { if (cpu.H[i] > 0) sc += cpu.areaM[i]; if (gpu.H[i] > 0) sg += cpu.areaM[i]; }
  }
  assert.ok(worst < 0.02 * Hm, 'thickness');
  assert.ok(Math.abs(sg - sc) <= 0.05 * sc, 'the front');
  assert.ok(Math.abs(gc / cc - 1) < 0.05, 'the calving rate');
});
