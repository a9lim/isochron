// Dust on the GPU (src/gpu/dust.js) against the CPU's reference (src/engine/dust.js),
// headless (WebGPU in node via tests/webgpu-node.mjs; skipped without it), and its
// cost at the page's levels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGPU } from './webgpu-node.mjs';
import { buildGrid } from '../src/grid/icosphere.js';
import { Dust, NP, carryingWind } from '../src/engine/dust.js';

const skip = hasGPU ? false : 'no WebGPU in node (npm install in tests/)';

/** A divergent and rotating wind, patchy rain and sources (as tests/dust.test.mjs's). */
function testCase(level, opts = {}) {
  const g = buildGrid(level), n = g.n, d = new Dust(g, opts);
  const wind = new Float32Array(3 * n), rain = new Float32Array(n), source = new Float32Array(n);
  for (let p = 0; p < NP; p++) {
    const a = [Math.cos(p), Math.sin(p), 0.4];
    for (let i = 0; i < n; i++) {
      const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2], dot = a[0] * x + a[1] * y + a[2] * z;
      wind[3 * i] = -8 * y + 6 * (a[0] - dot * x); wind[3 * i + 1] = 8 * x + 6 * (a[1] - dot * y); wind[3 * i + 2] = 6 * (a[2] - dot * z);
      rain[i] = Math.max(0, 3 + 4 * Math.sin(5 * x + p) * Math.cos(3 * z));
      source[i] = Math.max(0, Math.sin(4 * x + 2 * y) * Math.cos(5 * z + p) - 0.3);
    }
    d.phase(p, { wind, rain, source });
  }
  return d;
}

const l1 = (a, b) => { let d = 0, s = 0; for (let k = 0; k < a.length; k++) { d += Math.abs(a[k] - b[k]); s += Math.abs(b[k]); } return d / s; };

test('dust on the GPU: the balance the CPU converges to, for one to four bins, and conserved', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuDust } = await import('../src/gpu/dust.js');
  const device = await gpuDevice();
  const bins = [
    [{ name: 'one', share: 1, vd: 0.004, mee: 0.5 }],
    null,   // the default two
    [{ name: 'a', share: 0.2, vd: 0.001, mee: 1 }, { name: 'b', share: 0.5, vd: 0.005, mee: 0.4 }, { name: 'c', share: 0.3, vd: 0.02, mee: 0.1, scav: 0.2 }],
    [{ name: 'a', share: 0.1, vd: 0.0005, mee: 1 }, { name: 'b', share: 0.3, vd: 0.002, mee: 0.6 }, { name: 'c', share: 0.3, vd: 0.008, mee: 0.3 }, { name: 'd', share: 0.3, vd: 0.03, mee: 0.1 }],
  ];
  for (const B of bins) {
    const cpu = testCase(5, B ? { BINS: B } : {}), gpu = testCase(5, B ? { BINS: B } : {});
    cpu.solve(4000, 1e-7);
    await new GpuDust(device, gpu).solve(3000);
    const off = l1(gpu.L, cpu.L);
    assert.ok(off < 2e-4, `${gpu.nb} bins: GPU off the CPU by ${off.toExponential(2)} (L1)`);
    gpu.finish();
    const s = gpu.stats, err = Math.abs(s.emission - s.deposition) / s.emission;
    assert.ok(err < 1e-4, `${gpu.nb} bins: emitted ${s.emission.toFixed(3)} Tg/yr, deposited ${s.deposition.toFixed(3)}`);
  }
});

/** The opening planet's dust inputs: the arid share as the source, the climate's winds and rain. */
function planetInputs(P) {
  const c = P.climate, g = c.grid, n = g.n, source = new Float32Array(n), carry = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) if (c.landMask[i]) source[i] = (c.zones[16 * i + 4] + c.zones[16 * i + 5]) * (1 - c.snowAnn[i]);
  return (d, f = 1) => {
    for (let p = 0; p < NP; p++) {
      const w = f === 1 ? c.windPhase[p] : c.windPhase[p].map(x => f * x);
      d.phase(p, { wind: w, carry: carryingWind(g, w, carry), rain: c.Pph[p], source });
    }
  };
}

test('dust on the GPU at level 6, on the opening planet: parity, warm passes, cost', { skip, timeout: 300000 }, async t => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuDust } = await import('../src/gpu/dust.js');
  const { Planet } = await import('../src/engine/planet.js');
  const device = await gpuDevice();
  const P = new Planet('earthlike', { level: 6 });
  P.climate.solve(3);
  const pack = planetInputs(P), d = new Dust(P.climate.grid), G = new GpuDust(device, d);
  pack(d);
  const cpu = Float32Array.from((d.solve(1500, 1e-7), d.L));
  // Cold, by passes; then the converged GPU against the CPU.
  const cold = [];
  for (const N of [480, 960]) { d.L.fill(0); d.warm = false; await G.solve(N); cold.push(`${N} ${(100 * l1(d.L, cpu)).toFixed(2)}%`); }
  d.L.fill(0); await G.solve(4000);
  const ref = Float32Array.from(d.L);
  const off = l1(ref, cpu);
  assert.ok(off < 1e-3, `GPU off the CPU by ${off.toExponential(2)} on the planet`);
  // Warm: winds +3%, from the last solution.
  pack(d, 1.03);
  d.L.set(ref); await G.solve(4000);
  const ref2 = Float32Array.from(d.L), warm = [];
  for (const N of [120, 240, 480]) { d.L.set(ref); await G.solve(N); warm.push(`${N} ${(100 * l1(d.L, ref2)).toFixed(2)}%`); }
  // Cost: the passes alone (a solve of N less a solve of none: upload and read back).
  const time = async N => { let best = Infinity; for (let k = 0; k < 3; k++) { const t0 = performance.now(); await G.solve(N); best = Math.min(best, performance.now() - t0); } return best; };
  const t0 = await time(0), t240 = await time(240), t960 = await time(960);
  const tp = performance.now(); pack(d); const tPack = performance.now() - tp;
  const tf = performance.now(); d.finish(); const tFin = performance.now() - tf;
  t.diagnostic(`level 6: GPU against CPU ${off.toExponential(1)}; cold ${cold.join(', ')}; warm (+3% winds) from ${(100 * l1(ref, ref2)).toFixed(1)}%: ${warm.join(', ')}`);
  t.diagnostic(`level 6: upload + read ${t0.toFixed(1)} ms, ${((t960 - t0) / 960 * 1000).toFixed(1)} µs a pass, 240 warm passes ${(t240 - t0).toFixed(1)} ms; pack ${tPack.toFixed(0)} ms (6 phases), finish ${tFin.toFixed(0)} ms (CPU)`);
  assert.ok(warm.length === 3);
});

test('dust under a level-7 engine: solved on level 6, delivered on level 7, conserved; cost', { skip, timeout: 300000 }, async t => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuDust } = await import('../src/gpu/dust.js');
  const { Planet } = await import('../src/engine/planet.js');
  const device = await gpuDevice();
  const P = new Planet('earthlike', { level: 7 });
  P.climate.solve(3);
  const g = P.climate.grid, pack = planetInputs(P);
  const d = new Dust(g), G = new GpuDust(device, d);
  assert.equal(d.solveGrid.level, 6);
  const tp = performance.now(); pack(d); const tPack = performance.now() - tp;
  await G.solve(4000);
  const tf = performance.now(); const out = d.finish(); const tFin = performance.now() - tf;
  const s = d.stats;
  assert.equal(out.depAnn.length, g.n);
  assert.ok(Math.abs(s.emission - s.deposition) < 1e-4 * s.emission, `emitted ${s.emission.toFixed(1)} Tg/yr, the level-7 cells received ${s.deposition.toFixed(1)}`);
  const time = async N => { let best = Infinity; for (let k = 0; k < 3; k++) { const t0 = performance.now(); await G.solve(N); best = Math.min(best, performance.now() - t0); } return best; };
  const t0 = await time(0), t240 = await time(240);
  t.diagnostic(`level 7 engine: emission ${s.emission.toFixed(0)} Tg/yr, lifetime ${s.lifetime.toFixed(1)} d, wet ${(100 * s.wet / s.deposition).toFixed(0)}%`);
  t.diagnostic(`level 7 engine: pack ${tPack.toFixed(0)} ms (6 phases, CPU), GPU 240 passes ${(t240 - t0).toFixed(1)} ms + upload and read ${t0.toFixed(1)} ms, finish ${tFin.toFixed(0)} ms (CPU)`);
});
