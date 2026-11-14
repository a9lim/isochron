// The season on the globe, on the GPU: each frame, the snow and sea ice at
// the planet's date (or the share of the year under them, at a fast dial),
// from the climate's harmonics; smoothed so their edges are curves and
// one-cell patches melt away, and eased over ~0.8 s when a new climate
// cycle lands. Written straight into the globe's climate buffer with the sea
// surface temperature, the gyres' streamfunction and the ice sheets' thickness.
import { kernel, storage, uniform } from './device.js';

const HEAD = /* wgsl */`
struct Su { c1: f32, s1: f32, c2: f32, s2: f32, sw: f32, lapse: f32, ease: f32, n: u32 };
@group(0) @binding(0) var<uniform> U: Su;
fn ramp(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
`;
// Per cell, clim: (T̄, T₁ cos, T₁ sin, T₂ cos) · (T₂ sin, snow share, height km, land) · (sea-surface °C, gyre Sv, 0, 0).
const COLD = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> clim: array<vec4f>;
@group(0) @binding(2) var<storage, read> iceH: array<f32>;
@group(0) @binding(3) var<storage, read> elevRel: array<f32>;
@group(0) @binding(4) var<storage, read_write> ci: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let a = clim[3u * i];
  let b = clim[3u * i + 1u];
  var cold = b.y;
  if (U.sw > 0.001) {
    // At sea, the surface's temperature: the air's plus the gyres' anomaly (clim's sea-surface slot less T̄).
    let tp = select(clim[3u * i + 2u].x - a.x, 0.0, b.w > 0.5);
    let T = a.x + a.y * U.c1 - a.z * U.s1 + a.w * U.c2 - b.x * U.s2 + tp;
    let now = select(ramp(1.5, 6.0, -T), ramp(-1.0, 5.0, -(T - U.lapse * b.z)), b.w > 0.5);
    cold = U.sw * now + (1.0 - U.sw) * cold;
  }
  // Land newly dry or drowned since the climate last saw it takes no snow or ice.
  let H = iceH[i];
  if (((elevRel[i] > 0.0) != (b.w > 0.5)) && !(H > 0.0)) { cold = 0.0; }
  ci[i] = vec2f(cold, H);
}`;
const SMOOTH = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> nbr: array<u32>;
@group(0) @binding(2) var<storage, read> src: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> dst: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  var s = vec2f(0.0);
  var m = 0.0;
  for (var k = 0u; k < 6u; k++) {
    let j = nbr[6u * i + k];
    if (j != i) { s += src[j]; m += 1.0; }
  }
  dst[i] = 0.4 * src[i] + 0.6 * s / m;
}`;
const COMPOSE = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> clim: array<vec4f>;
@group(0) @binding(2) var<storage, read> ci: array<vec2f>;
@group(0) @binding(3) var<storage, read> prior: array<f32>;
@group(0) @binding(4) var<storage, read_write> shown: array<f32>;
@group(0) @binding(5) var<storage, read_write> out: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let v = ci[i];
  let c = prior[i] + U.ease * (v.x - prior[i]);
  shown[i] = c;
  let o = clim[3u * i + 2u];
  out[i] = vec4f(c, o.x, o.y, v.y);
}`;

export class GpuSeason {
  constructor(device, grid, out) {
    const n = this.n = grid.n;
    this.device = device; this.grid = grid;
    const nbr = new Uint32Array(6 * n);
    for (let i = 0; i < n; i++) {
      const o = grid.nbrOff[i], d = grid.nbrOff[i + 1] - o;
      for (let k = 0; k < 6; k++) nbr[6 * i + k] = k < d ? grid.nbr[o + k] : i;
    }
    this.nbr = storage(device, nbr.byteLength, nbr);
    this.clim = storage(device, 48 * n);
    this.iceH = storage(device, 4 * n);
    this.elevRel = storage(device, 4 * n);
    this.A = storage(device, 8 * n); this.B = storage(device, 8 * n);
    this.from = storage(device, 4 * n); this.shown = storage(device, 4 * n);
    this.u = new ArrayBuffer(32);
    this.U = uniform(device, new Uint32Array(this.u));
    const K = { cold: kernel(device, COLD, 'cold'), smooth: kernel(device, SMOOTH, 'smooth'), compose: kernel(device, COMPOSE, 'compose') };
    const x = Math.ceil(n / 64), U = this.U;
    this.list = [
      [K.cold, K.cold.bind({ U, clim: this.clim, iceH: this.iceH, elevRel: this.elevRel, ci: this.A }), x],
      [K.smooth, K.smooth.bind({ U, nbr: this.nbr, src: this.A, dst: this.B }), x],
      [K.smooth, K.smooth.bind({ U, nbr: this.nbr, src: this.B, dst: this.A }), x],
      [K.compose, K.compose.bind({ U, clim: this.clim, ci: this.A, prior: this.from, shown: this.shown, out }), x],
    ];
    this.staged = new Float32Array(12 * n);
  }

  /** A new climate cycle: its harmonics, snow share, heights, land, and the ocean; the drawn snow eases from where it stands. */
  setClimate(climate) {
    const n = this.n, a = this.staged, T = climate.Tf, sst = climate.ocean.sst, psi = climate.ocean.psi;
    for (let i = 0; i < n; i++) {
      const o = 12 * i;
      a[o] = T[0][i]; a[o + 1] = T[1][i]; a[o + 2] = T[2][i]; a[o + 3] = T[3][i];
      a[o + 4] = T[4][i]; a[o + 5] = climate.snowAnn[i]; a[o + 6] = climate.elevPos[i]; a[o + 7] = climate.landMask[i];
      a[o + 8] = T[0][i] + sst[i]; a[o + 9] = psi[i] / 1e6; a[o + 10] = 0; a[o + 11] = 0;
    }
    this.device.queue.writeBuffer(this.clim, 0, a);
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.shown, 0, this.from, 0, 4 * n);
    this.device.queue.submit([enc.finish()]);
  }
  setIce(H) { this.device.queue.writeBuffer(this.iceH, 0, H); }
  setSurface(elevRel) { this.device.queue.writeBuffer(this.elevRel, 0, elevRel); }

  /** Draw the season at year phase τ with weight sw (1: the date, 0: the year's share), eased by `ease`. */
  draw(tau, sw, lapse, ease) {
    const c = Math.cos(2 * Math.PI * tau), s = Math.sin(2 * Math.PI * tau);
    const f = new Float32Array(this.u), u = new Uint32Array(this.u);
    f.set([c, s, c * c - s * s, 2 * s * c, sw, lapse, ease]); u[7] = this.n;
    this.device.queue.writeBuffer(this.U, 0, this.u);
    const enc = this.device.createCommandEncoder(), pass = enc.beginComputePass();
    for (const [K, bg, x] of this.list) { pass.setPipeline(K.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(x); }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }
}
