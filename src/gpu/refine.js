// Fields on the engine's grid refined onto the drawn mesh, a level finer, on
// the GPU: one step of Loop subdivision (standard), applied to the fields
// rather than the shape. A midpoint takes 3/8 of each end of its edge and 1/8
// of the two vertices across it; an old vertex of valence k keeps 1 − kβ of
// itself and takes β of each neighbour (β = 3/(8k), Warren's weights: 1/16 at
// six). Every weight is positive, so a refined share stays a share and
// nothing overshoots, and contours drawn on the finer mesh come out as curves
// where the coarse mesh's piecewise-linear fields drew the cells.
import { kernel, storage, uniform } from './device.js';

/** For each fine vertex, seven coarse sources and weights (padding has weight 0). */
export function loopStencil(fine, coarse) {
  const n = fine.n, nc = coarse.n, src = new Uint32Array(7 * n), w = new Float32Array(7 * n);
  const cn = (i) => coarse.nbr.subarray(coarse.nbrOff[i], coarse.nbrOff[i + 1]);
  for (let i = 0; i < nc; i++) {
    const nb = cn(i), k = nb.length, beta = k === 6 ? 1 / 16 : 3 / (8 * k);
    src[7 * i] = i; w[7 * i] = 1 - k * beta;
    for (let j = 0; j < 6; j++) { src[7 * i + 1 + j] = j < k ? nb[j] : i; w[7 * i + 1 + j] = j < k ? beta : 0; }
  }
  for (let i = nc; i < n; i++) {
    const par = [];
    for (let t = fine.nbrOff[i], e = fine.nbrOff[i + 1]; t < e; t++) if (fine.nbr[t] < nc) par.push(fine.nbr[t]);
    if (par.length !== 2) throw new Error(`refine: cell ${i} has ${par.length} parents`);
    const [a, b] = par, nb = cn(b), opp = [];
    for (const c of cn(a)) if (c !== b && nb.includes(c)) opp.push(c);
    if (opp.length !== 2) throw new Error(`refine: edge ${a}–${b} has ${opp.length} opposite vertices`);
    const o = 7 * i;
    src.set([a, b, opp[0], opp[1], a, a, a], o);
    w.set([3 / 8, 3 / 8, 1 / 8, 1 / 8, 0, 0, 0], o);
  }
  return { src, w };
}

const REFINE = /* wgsl */`
struct Ru { n: u32, m: u32 };
@group(0) @binding(0) var<uniform> U: Ru;
@group(0) @binding(1) var<storage, read> src: array<u32>;
@group(0) @binding(2) var<storage, read> w: array<f32>;
@group(0) @binding(3) var<storage, read> inp: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> outp: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let t = id.x;
  if (t >= U.n * U.m) { return; }
  let i = t / U.m;
  let c = t % U.m;
  var s = vec4f(0.0);
  for (var k = 0u; k < 7u; k++) { s += w[7u * i + k] * inp[src[7u * i + k] * U.m + c]; }
  outp[t] = s;
}`;

export class Refiner {
  constructor(device, fine, coarse) {
    this.device = device; this.fine = fine; this.coarse = coarse;
    const { src, w } = loopStencil(fine, coarse);
    this.src = storage(device, src.byteLength, src);
    this.w = storage(device, w.byteLength, w);
    this.K = kernel(device, REFINE, 'refine');
    this.U = new Map(); this.binds = new Map();
  }
  /** A coarse buffer of m vec4s per vertex, refined into a fine one (encoded into `enc`, or submitted alone). */
  run(inp, outp, m, enc = null) {
    if (!this.U.has(m)) this.U.set(m, uniform(this.device, new Uint32Array([this.fine.n, m, 0, 0])));
    let bg = this.binds.get(inp);
    if (!bg || bg.outp !== outp) {
      bg = { outp, group: this.K.bind({ U: this.U.get(m), src: this.src, w: this.w, inp, outp }) };
      this.binds.set(inp, bg);
    }
    const own = !enc, e = enc || this.device.createCommandEncoder(), pass = e.beginComputePass();
    pass.setPipeline(this.K.pipeline); pass.setBindGroup(0, bg.group); pass.dispatchWorkgroups(Math.ceil(this.fine.n * m / 64));
    pass.end();
    if (own) this.device.queue.submit([e.finish()]);
  }
}
