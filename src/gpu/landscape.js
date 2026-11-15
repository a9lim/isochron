// The landscape's crustal diffusion on the GPU (src/engine/landscape.js, `diffuse`,
// is the reference): thickness spreads between continental cells, explicit and
// conservative, in substeps the CPU plans (κ is read at the step's start, and the
// substeps scale with κ_max·dt over the smallest cell, so they grow fourfold a
// level and with the step: ~10 at level 7 for 0.5 Myr). The CPU does it edge by
// edge; here each cell gathers its own edges' flows, every substep a dispatch,
// all in one pass, and the change d is diffused on top of the step's thickness
// (flows from (h_j − h_i) + (d_j − d_i)), so f32 keeps the small change exact to
// its own ulp rather than the thickness's. The flows are antisymmetric, so the
// crust is conserved to f32's rounding (tests/gpu-landscape.test.mjs). What
// stays on the CPU (landscape.js): routing, the stream-power cut, sediment and
// the coast, which are sequential down the drainage and cost less than the
// readbacks a port would need.
import { kernel, storage, uniform } from './device.js';

const SUB = /* wgsl */`
struct Du { n: u32, ds: f32, p0: f32, p1: f32 };
@group(0) @binding(0) var<uniform> U: Du;
@group(0) @binding(1) var<storage, read> nb: array<u32>;
@group(0) @binding(2) var<storage, read> geo: array<vec4f>;
@group(0) @binding(3) var<storage, read> h: array<f32>;
@group(0) @binding(4) var<storage, read> kap: array<f32>;
@group(0) @binding(5) var<storage, read> din: array<f32>;
@group(0) @binding(6) var<storage, read_write> dout: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let ki = kap[i];
  let di = din[i];
  if (ki < 0.0) { dout[i] = di; return; }
  let g0 = geo[2u * i];
  let g1 = geo[2u * i + 1u];
  let gs = array<f32, 6>(g0.x, g0.y, g0.z, g0.w, g1.x, g1.y);
  let hi = h[i];
  var s = 0.0;
  for (var k = 0u; k < 6u; k++) {
    let j = nb[6u * i + k];
    let kj = kap[j];
    if (j == i || kj < 0.0) { continue; }
    s += 0.5 * (ki + kj) * U.ds * gs[k] * ((h[j] - hi) + (din[j] - di));
  }
  dout[i] = di + s / g1.z;
}`;

export class GpuDiffusion {
  constructor(device, grid) {
    const n = this.n = grid.n, R2 = 6371 * 6371;
    this.device = device;
    // Per cell: six neighbours (padded with the cell itself) and (ell/dist ×6, area km², 0).
    const nb = new Uint32Array(6 * n), geo = new Float32Array(8 * n);
    for (let i = 0; i < n; i++) {
      const o = grid.nbrOff[i], d = grid.nbrOff[i + 1] - o;
      for (let k = 0; k < 6; k++) {
        nb[6 * i + k] = k < d ? grid.nbr[o + k] : i;
        geo[8 * i + k] = k < d ? grid.ell[o + k] / grid.dist[o + k] : 0;
      }
      geo[8 * i + 6] = grid.area[i] * R2;
    }
    this.nb = storage(device, nb.byteLength, nb);
    this.geo = storage(device, geo.byteLength, geo);
    this.h = storage(device, 4 * n); this.kap = storage(device, 4 * n);
    this.D0 = storage(device, 4 * n); this.D1 = storage(device, 4 * n);
    this.U = uniform(device, new Float32Array(4));
    this.K = kernel(device, SUB, 'diffusion');
    const bind = (din, dout) => this.K.bind({ U: this.U, nb: this.nb, geo: this.geo, h: this.h, kap: this.kap, din, dout });
    this.ab = bind(this.D0, this.D1); this.ba = bind(this.D1, this.D0);
    this.readBuf = device.createBuffer({ size: 4 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.out = new Float32Array(n);
  }

  /** `sub` substeps of `ds` years on thickness `h` (km, f32) with κ `kap` (km²/yr, −1 off the continents); resolves to the change (km). */
  async diffuse(h, kap, sub, ds) {
    const dev = this.device, n = this.n;
    const ub = new ArrayBuffer(16);
    new Uint32Array(ub)[0] = n; new Float32Array(ub)[1] = ds;
    dev.queue.writeBuffer(this.U, 0, ub);
    dev.queue.writeBuffer(this.h, 0, h);
    dev.queue.writeBuffer(this.kap, 0, kap);
    const enc = dev.createCommandEncoder();
    enc.clearBuffer(this.D0);
    const pass = enc.beginComputePass(), x = Math.ceil(n / 64);
    pass.setPipeline(this.K.pipeline);
    for (let s = 0; s < sub; s++) { pass.setBindGroup(0, s & 1 ? this.ba : this.ab); pass.dispatchWorkgroups(x); }
    pass.end();
    enc.copyBufferToBuffer(sub & 1 ? this.D1 : this.D0, 0, this.readBuf, 0, 4 * n);
    dev.queue.submit([enc.finish()]);
    await this.readBuf.mapAsync(GPUMapMode.READ);
    this.out.set(new Float32Array(this.readBuf.getMappedRange(), 0, n));
    this.readBuf.unmap();
    return this.out;
  }
}
