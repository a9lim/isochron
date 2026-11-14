// The climate's moisture balance on the GPU (src/engine/climate.js, `moisture`):
// each cell's column water W solves a W + A P(W) = b, upwinded transport and
// eddy mixing from its neighbours, evaporation toward saturation, and rain
// convex in W (Newton, four iterations, then the rain cap). The CPU sweeps it
// Gauss–Seidel in four orders; here every cell updates at once from its
// neighbours' last values (Jacobi), many times over, which converges to the
// same balance (tests/gpu-node.test.mjs). The page's climate runs on the
// engine's worker, so this uses the engine's device.
import { kernel, storage, uniform } from './device.js';

// Per cell, 16 floats: the six neighbours' coefficients in b (c₀..c₅), the diagonal a,
// the constant part of b, k₀ and α of the convective rain, λ, W_s, the area A, A·P_max.
const SWEEP = /* wgsl */`
struct Mu { n: u32, ca: f32, cr: f32, pmax: f32 };
@group(0) @binding(0) var<uniform> U: Mu;
@group(0) @binding(1) var<storage, read> nb: array<u32>;
@group(0) @binding(2) var<storage, read> co: array<vec4f>;
@group(0) @binding(3) var<storage, read> win: array<f32>;
@group(0) @binding(4) var<storage, read_write> wout: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c0 = co[4u * i];
  let c1 = co[4u * i + 1u];
  let c2 = co[4u * i + 2u];
  let c3 = co[4u * i + 3u];
  let o = 6u * i;
  var b = c1.w + c0.x * win[nb[o]] + c0.y * win[nb[o + 1u]] + c0.z * win[nb[o + 2u]] + c0.w * win[nb[o + 3u]] + c1.x * win[nb[o + 4u]] + c1.y * win[nb[o + 5u]];
  let a = c1.z;
  let k0 = c2.x;
  let al = c2.y;
  let lam = c2.z;
  let ws = c2.w;
  var w = min(win[i], b / a);
  for (var it = 0; it < 4; it++) {
    let ex = k0 * exp(min(40.0, al * w));
    w -= (a * w + ex - b) / (a + al * ex);
  }
  // The cap: rain held at P_max, the rest of the water carried on.
  if (lam * w + ws / 60.0 * exp(min(40.0, U.ca * (w / ws - U.cr))) > U.pmax) {
    w = max(w, (b - c3.y) / max(1e-9, a - c3.x * lam));
  }
  wout[i] = max(0.0, w);
}`;

export class GpuMoisture {
  constructor(device, grid) {
    const n = this.n = grid.n;
    this.device = device;
    const nb = new Uint32Array(6 * n);
    for (let i = 0; i < n; i++) {
      const o = grid.nbrOff[i], d = grid.nbrOff[i + 1] - o;
      for (let k = 0; k < 6; k++) nb[6 * i + k] = k < d ? grid.nbr[o + k] : i;
    }
    this.nb = storage(device, nb.byteLength, nb);
    this.co = storage(device, 64 * n);
    this.A = storage(device, 4 * n); this.B = storage(device, 4 * n);
    this.U = uniform(device, new Float32Array(4));
    this.K = kernel(device, SWEEP, 'moisture');
    const bind = (win, wout) => this.K.bind({ U: this.U, nb: this.nb, co: this.co, win, wout });
    this.ab = bind(this.A, this.B); this.ba = bind(this.B, this.A);
    this.readBuf = device.createBuffer({ size: 4 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  }

  /** Solve from `W` (warm start) with the packed coefficients, `iters` Jacobi passes; W is overwritten. */
  async solve(co, W, iters, ca, cr, pmax) {
    const dev = this.device, n = this.n;
    const ub = new ArrayBuffer(16);
    new Uint32Array(ub)[0] = n; new Float32Array(ub).set([ca, cr, pmax], 1);
    dev.queue.writeBuffer(this.U, 0, ub);
    dev.queue.writeBuffer(this.co, 0, co);
    dev.queue.writeBuffer(this.A, 0, W instanceof Float32Array ? W : Float32Array.from(W));
    const enc = dev.createCommandEncoder(), pass = enc.beginComputePass(), x = Math.ceil(n / 64);
    pass.setPipeline(this.K.pipeline);
    const even = iters + (iters & 1);
    for (let k = 0; k < even; k++) { pass.setBindGroup(0, k & 1 ? this.ba : this.ab); pass.dispatchWorkgroups(x); }
    pass.end();
    enc.copyBufferToBuffer(this.A, 0, this.readBuf, 0, 4 * n);
    dev.queue.submit([enc.finish()]);
    await this.readBuf.mapAsync(GPUMapMode.READ);
    W.set(new Float32Array(this.readBuf.getMappedRange()));
    this.readBuf.unmap();
  }
}
