// Marine margins (src/engine/ice.js): the calving law's response to the water's depth and the
// sea's warmth, and a sheet's front against it. A cap of snow on land runs out onto a shelf: in a
// cold sea over a shallow shelf the front grounds across it, in a warm sea or deep water it holds
// at the coast; the budget closes (snow = calving + basal melt + the ice's gain, no surface melt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/grid/icosphere.js';
import { Ice, ICE, calveOf, frontRate } from '../src/engine/ice.js';
import { hasGPU } from './webgpu-node.mjs';

const say = (...a) => console.log('  ', ...a);

test('the calving law: linear in depth and in the thermal forcing above a cold floor; nothing on land', () => {
  const f = calveOf(0), w = calveOf(ICE.TF_REF);
  assert.ok(Math.abs(w - ICE.CALVE) < 1e-12, 'at the reference forcing, Pelto and Warren\'s slope');
  assert.ok(Math.abs(f / w - ICE.TF_COLD / (ICE.TF_REF + ICE.TF_COLD)) < 1e-12 && calveOf(-3) === f, 'a freezing sea keeps the floor');
  assert.ok(Math.abs((calveOf(4) - calveOf(2)) - (calveOf(2) - calveOf(0))) < 1e-12, 'linear in the forcing');
  const a = 3e9, l = 0.577;
  const r1 = frontRate(w, -200, 1000, l, a), r2 = frontRate(w, -400, 1000, l, a);
  assert.ok(Math.abs(r2 / r1 - 2) < 1e-12, 'twice the depth, twice the ablation (thick ice)');
  const thin = frontRate(w, -400, 10, l, a), flot = frontRate(w, -400, ICE.RHO_W * 400 / ICE.RHO_I, l, a);
  assert.ok(Math.abs(thin / flot - 1) < 1e-12, 'a thin front ablates as the flotation thickness');
  assert.equal(frontRate(w, 50, 1000, l, a), 0, 'ice on land has no front in the water');
  // The speed at 300 m in Alaska's fjords' warmth: Pelto and Warren's 70 + 8.33 d less its intercept.
  say(`u_f at 300 m: ${(calveOf(0) * 300).toFixed(0)} m/yr in a freezing sea, ${(calveOf(3) * 300).toFixed(0)} at 3 K, ${(calveOf(5) * 300).toFixed(0)} at 5 K`);
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
function margin(shelf, tf, kyr = 40) {
  const { n, r, ice } = marginIce(shelf, tf);
  let snow = 0, calved = 0, basal = 0;
  const V = () => ice.H.reduce((s, h, i) => s + h * ice.areaM[i], 0);
  for (let k = 0; k < kyr; k++) {
    const v0 = V();
    ice.advance(1000, 1e9);
    snow += ice.stats.snow * 1000; calved += ice.stats.calving * 1000; basal += (ice.stats.basal + ice.stats.melt) * 1000;
    if (k === kyr - 1) ice.dV = V() - v0;
  }
  // The front: the outermost ice, and the sea's area under grounded and floating ice.
  let front = 0, grounded = 0, floating = 0;
  for (let i = 0; i < n; i++) if (ice.H[i] > 0) {
    front = Math.max(front, r[i]);
    if (r[i] >= 0.3) { if (ice.H[i] * ICE.RHO_I >= -ice.bed(i) * ICE.RHO_W) grounded += ice.areaM[i]; else floating += ice.areaM[i]; }
  }
  const total = V();
  return { front, grounded: grounded / 1e12, floating: floating / 1e12, snow, calved, basal, total, dV: ice.dV };
}

test('a marine front: a cold sea lets it ground across a shelf; a warm sea or deep water holds it at the coast', () => {
  const cold = margin(200, 0), warm = margin(200, 5), deep = margin(1500, 0);
  for (const [name, m] of [['cold, 200 m shelf', cold], ['5 K, 200 m shelf', warm], ['cold, 1,500 m shelf', deep]]) {
    say(`${name}: front at ${(m.front * 6371).toFixed(0)} km (coast at ${(0.3 * 6371).toFixed(0)}), the shelf under grounded ice ${m.grounded.toFixed(2)} M km², floating ${m.floating.toFixed(3)}; snow ${(m.snow / 1e15).toFixed(1)} M km³ against calving ${(m.calved / 1e15).toFixed(1)}, basal melt ${(m.basal / 1e15).toFixed(1)} and the ice's ${(m.total / 1e15).toFixed(2)}`);
  }
  assert.ok(cold.grounded > 1 && cold.front > warm.front, 'the cold front grounds out onto the shelf');
  assert.ok(warm.grounded === 0 && deep.grounded === 0, 'a warm sea or deep water holds the front at the coast');
  assert.ok(warm.total < cold.total && deep.total < cold.total);
  // The budget: what fell is calved, melted at the bed, or held (no surface melt; the cap started bare).
  for (const m of [cold, warm, deep]) assert.ok(Math.abs(m.snow - m.calved - m.basal - m.total) < 1e-3 * m.snow, `snow ${m.snow} against calving ${m.calved}, basal melt ${m.basal} and ice ${m.total}`);
});

test('a marine front on the GPU: the CPU reference (the cold shelf)', { skip: hasGPU ? false : 'no WebGPU in node (npm install in tests/)' }, async () => {
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
  say(`level 6: worst cell off by ${worst.toFixed(1)} m of a ${Hm.toFixed(0)} m dome; ice beyond the coast ${(sg / 1e12).toFixed(2)} M km² against ${(sc / 1e12).toFixed(2)}; calving over the last 10 kyr ${(gc / 1e9 / 10).toFixed(0)} km³/yr against ${(cc / 1e9 / 10).toFixed(0)}`);
  assert.ok(worst < 0.02 * Hm, 'thickness');
  assert.ok(Math.abs(sg - sc) <= 0.05 * sc, 'the front');
  assert.ok(Math.abs(gc / cc - 1) < 0.05, 'the calving rate');
});
