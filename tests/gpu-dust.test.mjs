// Dust on the GPU (src/gpu/dust.js) against the CPU's converged balance, for two bins and four.
import test from 'node:test';
import assert from 'node:assert/strict';
import { skip } from './webgpu-node.mjs';
import { buildGrid } from '../src/grid/icosphere.js';
import { Dust, NP } from '../src/engine/dust.js';


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

test('dust on the GPU: the balance the CPU converges to, for two bins and four, and conserved', { skip }, async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  const { GpuDust } = await import('../src/gpu/dust.js');
  const device = await gpuDevice();
  const bins = [
    null,   // the default two
    [{ name: 'a', share: 0.1, vd: 0.0005, mee: 1 }, { name: 'b', share: 0.3, vd: 0.002, mee: 0.6 }, { name: 'c', share: 0.3, vd: 0.008, mee: 0.3 }, { name: 'd', share: 0.3, vd: 0.03, mee: 0.1 }],
  ];
  for (const B of bins) {
    const cpu = testCase(4, B ? { BINS: B } : {}), gpu = testCase(4, B ? { BINS: B } : {});
    cpu.solve(4000, 1e-7);
    await new GpuDust(device, gpu).solve(3000);
    const off = l1(gpu.L, cpu.L);
    assert.ok(off < 2e-4, `${gpu.nb} bins: GPU off the CPU by ${off.toExponential(2)} (L1)`);
    gpu.finish();
    const s = gpu.stats, err = Math.abs(s.emission - s.deposition) / s.emission;
    assert.ok(err < 1e-4, `${gpu.nb} bins: emitted ${s.emission.toFixed(3)} Tg/yr, deposited ${s.deposition.toFixed(3)}`);
  }
});
