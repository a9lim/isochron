// The dust balance on the GPU (src/engine/dust.js is the reference): every
// (cell, point of the year) at once, all size bins together, many Jacobi
// passes from the last solution. The coefficients are the CPU's packing:
// six inflow coefficients, the diagonal's transport part and area × rain per
// (cell, phase); area × emission per (cell, phase); the cell's area. The bins
// differ only in their dry removal, scavenging and share of the emission,
// which the uniform carries, so one thread solves every bin of its
// (cell, phase) as a vector. The layout is cell-major, so the six phases of
// a cell are neighbouring threads and read their neighbours' loads from
// neighbouring memory.
import { kernel, storage, uniform } from './device.js';
import { NP } from '../engine/dust.js';

function source(nb) {
  const T = nb === 1 ? 'f32' : `vec${nb}f`, S = ['.x', '.xy', '.xyz', ''][nb - 1];
  return /* wgsl */`
struct Du { m: u32, np: u32, _a: u32, _b: u32, kd: vec4f, sc: vec4f, sh: vec4f };
@group(0) @binding(0) var<uniform> U: Du;
@group(0) @binding(1) var<storage, read> nb: array<u32>;
@group(0) @binding(2) var<storage, read> co: array<vec4f>;
@group(0) @binding(3) var<storage, read> src: array<f32>;
@group(0) @binding(4) var<storage, read> area: array<f32>;
@group(0) @binding(5) var<storage, read> lin: array<${T}>;
@group(0) @binding(6) var<storage, read_write> lout: array<${T}>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let s = id.x;
  if (s >= U.m) { return; }
  let i = s / U.np;
  let p = s - i * U.np;
  let c0 = co[2u * s];
  let c1 = co[2u * s + 1u];
  let o = 6u * i;
  let r = U.sh${S} * src[s]
    + c0.x * lin[nb[o] * U.np + p] + c0.y * lin[nb[o + 1u] * U.np + p] + c0.z * lin[nb[o + 2u] * U.np + p]
    + c0.w * lin[nb[o + 3u] * U.np + p] + c1.x * lin[nb[o + 4u] * U.np + p] + c1.y * lin[nb[o + 5u] * U.np + p];
  lout[s] = r / (c1.z + area[i] * U.kd${S} + c1.w * U.sc${S});
}`;
}

export class GpuDust {
  /** device: the engine's; dust: a Dust (src/engine/dust.js), whose grid, bins and state this solves. */
  constructor(device, dust) {
    this.device = device;
    this.dust = dust;
    const n = dust.n, nbins = dust.nb, m = this.m = n * NP;
    this.vec = nbins === 3 ? 4 : nbins;      // vec3 is padded to 16 bytes in a storage array
    this.nb = storage(device, dust.nbr6.byteLength, dust.nbr6);
    this.area = storage(device, dust.areaKm.byteLength, dust.areaKm);
    this.co = storage(device, dust.co.byteLength);
    this.src = storage(device, dust.src.byteLength);
    const bytes = 4 * this.vec * m;
    this.A = storage(device, bytes); this.B = storage(device, bytes);
    const ub = new ArrayBuffer(64), u = new Uint32Array(ub), f = new Float32Array(ub);
    u[0] = m; u[1] = NP;
    for (let b = 0; b < nbins; b++) { f[4 + b] = dust.kdry[b]; f[8 + b] = dust.scav[b]; f[12 + b] = dust.share[b]; }
    this.U = uniform(device, f);
    this.K = kernel(device, source(nbins), 'dust');
    const bind = (lin, lout) => this.K.bind({ U: this.U, nb: this.nb, co: this.co, src: this.src, area: this.area, lin, lout });
    this.ab = bind(this.A, this.B); this.ba = bind(this.B, this.A);
    this.readBuf = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.stage = this.vec === nbins ? null : new Float32Array(this.vec * m);
  }

  /** Upload the packed coefficients and the warm start (dust.L), run `passes` Jacobi passes, read the loads back into dust.L. */
  async solve(passes = this.dust.warm ? this.dust.P.GPU_PASSES : 4 * this.dust.P.GPU_PASSES) {
    const dev = this.device, d = this.dust, nbins = d.nb, v = this.vec, m = this.m;
    dev.queue.writeBuffer(this.co, 0, d.co);
    dev.queue.writeBuffer(this.src, 0, d.src);
    if (this.stage) {
      for (let s = 0; s < m; s++) for (let b = 0; b < nbins; b++) this.stage[v * s + b] = d.L[nbins * s + b];
      dev.queue.writeBuffer(this.A, 0, this.stage);
    } else dev.queue.writeBuffer(this.A, 0, d.L);
    const enc = dev.createCommandEncoder(), pass = enc.beginComputePass(), x = Math.ceil(m / 64);
    pass.setPipeline(this.K.pipeline);
    const even = passes + (passes & 1);
    for (let k = 0; k < even; k++) { pass.setBindGroup(0, k & 1 ? this.ba : this.ab); pass.dispatchWorkgroups(x); }
    pass.end();
    enc.copyBufferToBuffer(this.A, 0, this.readBuf, 0, 4 * v * m);
    dev.queue.submit([enc.finish()]);
    await this.readBuf.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(this.readBuf.getMappedRange());
    if (this.stage) { for (let s = 0; s < m; s++) for (let b = 0; b < nbins; b++) d.L[nbins * s + b] = out[v * s + b]; }
    else d.L.set(out);
    this.readBuf.unmap();
    d.warm = true;
    return even;
  }
}
