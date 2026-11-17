// The season on the globe, on the GPU: each frame, the snow and sea ice at
// the planet's date (or the share of the year under them, at a fast dial),
// from the climate's harmonics; smoothed so their edges are curves and
// one-cell patches melt away, and eased over ~0.8 s when a new climate
// cycle lands. Written straight into the globe's climate buffer with the sea
// surface temperature, the gyres' streamfunction and the ice sheets' thickness.
// The land's snow and the sea's ice are two fields, each smoothed among its own
// side's cells and carried two rings across the coast onto the other's, so the
// globe draws each side by its own up to the coast however the coast falls
// between the cells. As one field smoothed across the coast, a bay's sea ice
// took the summer's bare land around it and opened short of the shore, and a
// cell the drawn coast puts in the sea (as it does ~40% of coastal land cells)
// had its snow and ice dropped.
// The year's anomaly (src/engine/year.js) shifts the date's temperature: the
// page keeps the anomaly at the year's last two step ends and blends them by
// its clock, weighted by how live the year is.
import { kernel, storage, uniform } from './device.js';

const HEAD = /* wgsl */`
struct Su { c1: f32, s1: f32, c2: f32, s2: f32, sw: f32, lapse: f32, ease: f32, n: u32, af: f32, aw: f32, p0: f32, p1: f32 };
@group(0) @binding(0) var<uniform> U: Su;
fn ramp(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
`;
// Per cell, clim: (T̄, T₁ cos, T₁ sin, T₂ cos) · (T₂ sin, snow share, height km, land) · (sea-surface °C, gyre Sv, 0, 0).
// The state between passes, per cell: (the land's field, the sea's, the ice's thickness, k), k the
// cell's side (1 land, 0 sea, by the climate's) plus 2 once the other side's field is carried onto it.
const COLD = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> clim: array<vec4f>;
@group(0) @binding(2) var<storage, read> iceH: array<f32>;
@group(0) @binding(3) var<storage, read_write> ci: array<vec4f>;
@group(0) @binding(4) var<storage, read> anA: array<f32>;
@group(0) @binding(5) var<storage, read> anB: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let a = clim[3u * i];
  let b = clim[3u * i + 1u];
  let land = b.w > 0.5;
  var cold = b.y;
  if (U.sw > 0.001) {
    // At sea, the surface's temperature: the air's plus the gyres' anomaly (clim's sea-surface slot less T̄);
    // everywhere, the year's anomaly between its last two steps.
    let tp = select(clim[3u * i + 2u].x - a.x, 0.0, land);
    let an = U.aw * mix(anA[i], anB[i], U.af);
    let T = a.x + a.y * U.c1 - a.z * U.s1 + a.w * U.c2 - b.x * U.s2 + tp + an;
    let now = select(ramp(1.5, 6.0, -T), ramp(-1.0, 5.0, -(T - U.lapse * b.z)), land);
    cold = U.sw * now + (1.0 - U.sw) * cold;
  }
  ci[i] = select(vec4f(0.0, cold, iceH[i], 0.0), vec4f(cold, 0.0, iceH[i], 1.0), land);
}`;
// One pass: each side's field smoothed among that side's cells (a cell with none of its side beside
// it keeps its own), and carried onto the other side's cells as the mean of the neighbours that
// hold it (that side's cells, or the other's it was carried onto last pass: two passes, two rings).
// The ice's thickness is smoothed over every neighbour.
const SMOOTH = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> nbr: array<u32>;
@group(0) @binding(2) var<storage, read> src: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> dst: array<vec4f>;
fn isLand(k: f32) -> bool { return k - 2.0 * floor(0.5 * k) > 0.5; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let a = src[i];
  let land = isLand(a.w);
  var own = 0.0;      // this side's field among this side's neighbours
  var mOwn = 0.0;
  var other = 0.0;    // the other side's field, from the neighbours that hold it
  var mOther = 0.0;
  var h = 0.0;
  var m = 0.0;
  for (var k = 0u; k < 6u; k++) {
    let j = nbr[6u * i + k];
    if (j == i) { continue; }
    let b = src[j];
    let bl = isLand(b.w);
    let bc = b.w > 1.5;
    h += b.z; m += 1.0;
    if (bl == land) {
      own += select(b.y, b.x, land); mOwn += 1.0;
      if (bc) { other += select(b.x, b.y, land); mOther += 1.0; }
    } else {
      other += select(b.x, b.y, land); mOther += 1.0;
    }
  }
  let mine = select(a.y, a.x, land);
  let v = select(mine, 0.4 * mine + 0.6 * own / max(mOwn, 1.0), mOwn > 0.0);
  let o = select(0.0, other / max(mOther, 1.0), mOther > 0.0);
  let kk = select(0.0, 1.0, land) + select(0.0, 2.0, mOther > 0.0);
  dst[i] = vec4f(select(o, v, land), select(v, o, land), 0.4 * a.z + 0.6 * h / max(m, 1.0), kk);
}`;
// The land's field and the sea's, eased from where they stood; the climate buffer takes two vec4s a
// cell: (the land's snow, sea-surface °C, gyre Sv, ice m) and (the sea's ice, 0, 0, 0).
const COMPOSE = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> clim: array<vec4f>;
@group(0) @binding(2) var<storage, read> ci: array<vec4f>;
@group(0) @binding(3) var<storage, read> prior: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> shown: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> out: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let v = ci[i];
  let c = prior[i] + U.ease * (v.xy - prior[i]);
  shown[i] = c;
  let o = clim[3u * i + 2u];
  out[2u * i] = vec4f(c.x, o.x, o.y, v.z);
  out[2u * i + 1u] = vec4f(c.y, 0.0, 0.0, 0.0);
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
    this.A = storage(device, 16 * n); this.B = storage(device, 16 * n);
    this.from = storage(device, 8 * n); this.shown = storage(device, 8 * n);
    this.anA = storage(device, 4 * n); this.anB = storage(device, 4 * n);
    this.u = new ArrayBuffer(48);
    this.U = uniform(device, new Uint32Array(this.u));
    const K = { cold: kernel(device, COLD, 'cold'), smooth: kernel(device, SMOOTH, 'smooth'), compose: kernel(device, COMPOSE, 'compose') };
    const x = Math.ceil(n / 64), U = this.U;
    this.list = [
      [K.cold, K.cold.bind({ U, clim: this.clim, iceH: this.iceH, ci: this.A, anA: this.anA, anB: this.anB }), x],
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
    enc.copyBufferToBuffer(this.shown, 0, this.from, 0, 8 * n);
    this.device.queue.submit([enc.finish()]);
  }
  setIce(H) { this.device.queue.writeBuffer(this.iceH, 0, H); }
  /** The year's anomaly at its newest step's end (K per cell); the last becomes its start, unless `prev` is given. */
  setAnomaly(next, prev = null) {
    if (prev) this.device.queue.writeBuffer(this.anA, 0, prev);
    else { const enc = this.device.createCommandEncoder(); enc.copyBufferToBuffer(this.anB, 0, this.anA, 0, 4 * this.n); this.device.queue.submit([enc.finish()]); }
    this.device.queue.writeBuffer(this.anB, 0, next);
  }

  /**
   * Draw the season at year phase τ with weight sw (1: the date, 0: the year's share), eased by
   * `ease`, with the year's anomaly `af` of the way between its two steps, weighted by `aw`.
   */
  draw(tau, sw, lapse, ease, af = 1, aw = 0) {
    const c = Math.cos(2 * Math.PI * tau), s = Math.sin(2 * Math.PI * tau);
    const f = new Float32Array(this.u), u = new Uint32Array(this.u);
    f.set([c, s, c * c - s * s, 2 * s * c, sw, lapse, ease]); u[7] = this.n; f[8] = af; f[9] = aw;
    this.device.queue.writeBuffer(this.U, 0, this.u);
    const enc = this.device.createCommandEncoder(), pass = enc.beginComputePass();
    for (const [K, bg, x] of this.list) { pass.setPipeline(K.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(x); }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }
}
