// The QG weather's kernels (src/gpu/weather.js), which have no CPU reference: the multigrid's V-cycles
// converge geometrically, the potential vorticity's integral holds over many steps, and storms grow above
// Phillips' criterion and die below it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { skip } from './webgpu-node.mjs';
import { buildGrid } from '../src/grid/icosphere.js';

const setup = async () => {
  const { gpuDevice } = await import('../src/gpu/device.js');
  return { device: await gpuDevice(), ...(await import('../src/gpu/weather.js')), ...(await import('../src/gpu/hierarchy.js')) };
};
async function readBuf(device, buf, offset, size) {
  const rb = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, offset, rb, 0, size);
  device.queue.submit([enc.finish()]);
  await rb.mapAsync(GPUMapMode.READ);
  const a = new Float32Array(rb.getMappedRange().slice(0));
  rb.unmap(); rb.destroy();
  return a;
}
/** A planet with no land, the climate's temperature by latitude. */
function forcing(g) {
  const f4 = new Float32Array(4 * g.n);
  let s = 0, A = 0;
  for (let i = 0; i < g.n; i++) {
    const z = g.pos[3 * i + 2], T = 30 - 45 * z * z;
    f4[4 * i] = T; f4[4 * i + 1] = T;
    s += T * g.area[i]; A += g.area[i];
  }
  return { f4, tmean: s / A };
}

test('the weather on the GPU: the multigrid inverts both layers, its error falling geometrically', { skip }, async () => {
  const { device, GpuWeather, A_M } = await setup();
  const g = buildGrid(6), w = new GpuWeather(device, g), n = g.n;
  // A field with structure at many scales, and its right-hand side by the same operator (f64).
  const xs = new Float64Array(2 * n), b = new Float32Array(2 * n);
  for (let i = 0; i < n; i++) {
    const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2];
    xs[2 * i] = 1e7 * (x * y + Math.sin(7 * x + 3 * z) + 0.3 * Math.cos(23 * y - 11 * z));
    xs[2 * i + 1] = 1e7 * (z * z * x + Math.cos(13 * x * y) + 0.2 * Math.sin(31 * z + 5 * x));
  }
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
    let s = 0;
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) s += Math.fround(g.ell[t] / g.dist[t]) * (xs[2 * i + c] - xs[2 * g.nbr[t] + c]);
    b[2 * i + c] = s + g.area[i] * A_M * A_M * w.k2[c] * xs[2 * i + c];
  }
  device.queue.writeBuffer(w.Bv, 8 * w.off, b);
  device.queue.writeBuffer(w.X, 8 * w.off, new Float32Array(2 * n));
  const errs = [];
  for (let k = 0; k < 6; k++) {
    const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
    for (const [K, bg, x] of w.cycle) { pass.setPipeline(K.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(x); }
    pass.end(); device.queue.submit([enc.finish()]);
    const X = await readBuf(device, w.X, 8 * w.off, 8 * n), e = [0, 0], m = [0, 0];
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) { e[c] += (X[2 * i + c] - xs[2 * i + c]) ** 2; m[c] += xs[2 * i + c] ** 2; }
    errs.push([Math.sqrt(e[0] / m[0]), Math.sqrt(e[1] / m[1])]);
  }
  const rate = c => (errs[4][c] / errs[1][c]) ** (1 / 3);
  assert.ok(errs[1][0] < 0.1 && errs[1][1] < 0.1 && rate(0) < 0.4 && rate(1) < 0.4 && errs[5][0] < 1e-3,
    `relative error by cycle ${errs.map(e => e.map(v => v.toExponential(1)).join('/')).join(', ')}`);
});

test('the weather on the GPU: the potential vorticity is kept over ten days, and nothing blows up', { skip }, async () => {
  const { device, GpuWeather, A_M } = await setup();
  const g = buildGrid(6), { f4, tmean } = forcing(g), w = new GpuWeather(device, g, 'conserve');
  w.setForcing(f4, tmean);
  w.start();
  const total = async () => {
    const S = await readBuf(device, w.S[w.cur], 0, 32 * g.n);
    let q = 0, qa = 0, bad = 0;
    for (let i = 0; i < g.n; i++) {
      const v = S[8 * i] + S[8 * i + 1] - 4 * 7.292e-5 * g.pos[3 * i + 2];
      if (!Number.isFinite(v)) bad++;
      q += g.area[i] * v; qa += g.area[i] * Math.abs(v);
    }
    return { q, qa, bad };
  };
  const a = await total();
  for (let s = 0; s < 10 * 86400 / w.dt; s += 120) w.advance(120);
  const b = await total(), r = await w.read();
  let wind = 0;
  for (let i = 0; i < g.n; i++) {
    let gx = 0, gy = 0, gz = 0;
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) { const d = r.psi2[g.nbr[t]] - r.psi2[i]; gx += d * g.gw[3 * t]; gy += d * g.gw[3 * t + 1]; gz += d * g.gw[3 * t + 2]; }
    wind = Math.max(wind, Math.hypot(gx, gy, gz) / A_M);
  }
  const drift = Math.abs(b.q - a.q) / Math.max(a.qa, b.qa);
  assert.ok(b.bad === 0 && drift < 1e-4 && wind < 150, `PV drift ${drift.toExponential(1)} over 10 days, lower wind to ${wind.toFixed(0)} m/s`);
});

test("the weather on the GPU: storms grow above Phillips' criterion and die below it", { skip }, async () => {
  const { device, GpuWeather, WEATHER } = await setup();
  const g = buildGrid(5), { f4, tmean } = forcing(g), lat = i => Math.asin(g.pos[3 * i + 2]);
  // The eddies' energy in midlatitudes: the lower stream function's departure from its band's mean.
  const eddies = psi2 => {
    const nb = 36, sum = new Float64Array(nb), cnt = new Float64Array(nb), band = i => Math.min(nb - 1, Math.floor((lat(i) + Math.PI / 2) / Math.PI * nb));
    for (let i = 0; i < g.n; i++) { sum[band(i)] += psi2[i]; cnt[band(i)]++; }
    let e = 0;
    for (let i = 0; i < g.n; i++) if (Math.abs(lat(i)) > 0.5 && Math.abs(lat(i)) < 1.2) e += (psi2[i] - sum[band(i)] / cnt[band(i)]) ** 2;
    return e / g.n;
  };
  const energy = async shear => {
    const base = WEATHER.SHEAR;
    WEATHER.SHEAR = shear;
    try {
      const w = new GpuWeather(device, g, 'phillips');
      w.setForcing(f4, tmean);
      w.start();
      for (let s = 0; s < 25 * 86400 / w.dt; s += 100) w.advance(100);
      const r = await w.read();
      assert.ok(r.psi2.every(Number.isFinite));
      return eddies(r.psi2);
    } finally { WEATHER.SHEAR = base; }
  };
  const strong = await energy(2.2e6), weak = await energy(1.5e5);
  assert.ok(strong > 30 * weak, `eddy energy ${strong.toExponential(2)} against ${weak.toExponential(2)}`);
});
