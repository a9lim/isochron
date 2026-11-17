// The climate's energy balance on the GPU (src/engine/climate.js is the
// reference, `ebm` and `fineTemperature`; its header has the physics). One
// step of the fixed point T ← G(T) runs here whole; Anderson's mixing over the
// steps stays on the CPU (`energyBalance`), which reads back only the coarse
// harmonics (5 fields on the 220 km grid) each step and the fine ones at the end.
//
// A step, on the nested grids packed by src/gpu/hierarchy.js (the engine's
// level down to level 1):
//   forcing   each fine cell's absorbed sunlight at 24 points of the year
//             through its albedo, as harmonics; its snow-and-ice share; its
//             heat capacity's admittances 1/(B + K + ikωC) for the continental
//             seasons, and the forcing through them
//   restrict  those to the energy balance's grid (area-weighted means)
//   solve     the annual mean (real) and the two harmonics (complex) at once,
//             B T̄ − ∇·D∇T̄ = F̄ − A + ΔF and Z T̂ − ∇·D∇T̂ = ⟨F̂Y⟩/⟨Y⟩, by
//             multigrid: V-cycles of damped Jacobi on the levels below
//             (coarse diagonals by lumped Galerkin, own + half of each
//             midpoint's), level 1 by sweeps in one workgroup
//   fine T    the annual mean prolonged; each cell's seasons from its own
//             capacity, the transport prolonged and the exchange's net
//             returned evenly (sums by a two-pass reduction)
// The albedo is linear in two ramps of the temperature per cell, so the CPU
// packs each cell's coefficients once per energy balance (`begin`).
import { kernel, storage, uniform } from './device.js';
import { hierarchy } from './hierarchy.js';
import { prolongT } from '../grid/transfer.js';
import { CLIMATE } from '../engine/climate.js';

const NS = 24, NLAT = 181, NR = 10, NPF = 9;   // samples of the year; latitude rows; restricted fields (+ snow); prolonged fields

// Per level: n, off, nc, offc (the next coarser level's), N (all levels), and the systems' diffusivities.
const HEAD = /* wgsl */`
struct Lv { n: u32, off: u32, nc: u32, offc: u32, N: u32, flag: u32, p0: u32, p1: u32, D: vec4f, k: vec4f };
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
fn cdiv(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }
fn ramp(x: f32, a: f32, b: f32) -> f32 { let t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
`;

// The operator, system s (id.z) at cell c: d x + D Σ w (x − x_j). k.x: Jacobi's weight.
const SMOOTH = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read> geo: array<f32>;
@group(0) @binding(3) var<storage, read> dg: array<vec2f>;
@group(0) @binding(4) var<storage, read> xin: array<vec2f>;
@group(0) @binding(5) var<storage, read> b: array<vec2f>;
@group(0) @binding(6) var<storage, read_write> xout: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  let o = id.z * U.N;
  let xi = xin[o + c];
  var kx = vec2f(0.0);
  var sw = 0.0;
  for (var k = 0u; k < 6u; k++) {
    let w = geo[8u * c + k];
    kx += w * (xi - xin[o + U.off + topo[12u * c + k]]);
    sw += w;
  }
  let D = U.D[id.z];
  let d = dg[o + c];
  let r = b[o + c] - cmul(d, xi) - D * kx;
  xout[o + c] = xi + U.k.x * cdiv(r, d + vec2f(D * sw, 0.0));
}`;

// The residual to the next coarser level: a coarse cell's own and half of each midpoint's; x there zeroed.
const RESTRICT = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read> geo: array<f32>;
@group(0) @binding(3) var<storage, read> dg: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> x: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> b: array<vec2f>;
fn resid(i: u32, o: u32, D: f32) -> vec2f {
  let c = U.off + i;
  let xi = x[o + c];
  var kx = vec2f(0.0);
  for (var k = 0u; k < 6u; k++) { kx += geo[8u * c + k] * (xi - x[o + U.off + topo[12u * c + k]]); }
  return b[o + c] - cmul(dg[o + c], xi) - D * kx;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.nc) { return; }
  let o = id.z * U.N;
  let D = U.D[id.z];
  let c = U.off + i;
  var r = resid(i, o, D);
  for (var k = 0u; k < 6u; k++) {
    let j = topo[12u * c + k];
    if (j != i) { r += 0.5 * resid(j, o, D); }
  }
  b[o + U.offc + i] = r;
  x[o + U.offc + i] = vec2f(0.0);
}`;

// The diagonal to the next coarser level (lumped Galerkin: own + half of each midpoint's).
const DIAG = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read_write> dg: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.nc) { return; }
  let o = id.z * U.N;
  let c = U.off + i;
  var d = dg[o + c];
  for (var k = 0u; k < 6u; k++) {
    let j = topo[12u * c + k];
    if (j != i) { d += 0.5 * dg[o + U.off + j]; }
  }
  dg[o + U.offc + i] = d;
}`;

const PROLONG = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read_write> x: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let o = id.z * U.N;
  let c = U.off + i;
  var corr = vec2f(0.0);
  if (i < U.nc) {
    corr = x[o + U.offc + i];
  } else {
    for (var k = 0u; k < 6u; k++) {
      let j = topo[12u * c + k];
      if (j < U.nc) { corr += 0.5 * x[o + U.offc + j]; }
    }
  }
  x[o + c] = x[o + c] + corr;
}`;

// The coarsest level (≤ 64 cells): k.y damped Jacobi sweeps in one workgroup per system.
const COARSE = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read> geo: array<f32>;
@group(0) @binding(3) var<storage, read> dg: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> x: array<vec2f>;
@group(0) @binding(5) var<storage, read> b: array<vec2f>;
var<workgroup> xs: array<vec2f, 64>;
@compute @workgroup_size(64)
fn main(@builtin(local_invocation_id) l: vec3u, @builtin(workgroup_id) g: vec3u) {
  let i = l.x;
  let on = i < U.n;
  let ii = min(i, U.n - 1u);
  let o = g.z * U.N;
  let c = U.off + ii;
  let D = U.D[g.z];
  var sw = 0.0;
  for (var k = 0u; k < 6u; k++) { sw += geo[8u * c + k]; }
  let d = dg[o + c];
  let bb = b[o + c];
  let den = d + vec2f(D * sw, 0.0);
  xs[i] = select(vec2f(0.0), x[o + c], on);
  workgroupBarrier();
  let sweeps = u32(U.k.y);
  for (var s = 0u; s < sweeps; s++) {
    let xi = xs[ii];
    var kx = vec2f(0.0);
    for (var k = 0u; k < 6u; k++) { kx += geo[8u * c + k] * (xi - xs[topo[12u * c + k]]); }
    let nx = xi + U.k.x * cdiv(bb - cmul(d, xi) - D * kx, den);
    workgroupBarrier();
    if (on) { xs[i] = nx; }
    workgroupBarrier();
  }
  if (on) { x[o + c] = xs[i]; }
}`;

// Each fine cell's absorbed sunlight through the year, as harmonics; its snow-and-ice share; the
// continental seasons' admittances and forcing; the fields to restrict (rf, field-major over all levels).
// pa: (o, c0, c1, c2): v = T + o, albedo c0 + c1 r₁(v) + c2 ramp(−v, 0, 4.5), r₁ land's ramp(−v, −1, 5)
// or the sea's ramp(−v, 1.5, 6); pb: (latitude row, its weight, land, dust's forcing); mar: maritime air
// (src/engine/maritime.js), per cell its forcing on the two harmonics (re, im, re, im) and K m.
const FORCING = /* wgsl */`
struct Fu { n: u32, N: u32, off: u32, p0: u32, c: vec4f, ang: array<vec4f, ${NS}> };
fn ramp(x: f32, a: f32, b: f32) -> f32 { let t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
@group(0) @binding(0) var<uniform> U: Fu;
@group(0) @binding(1) var<storage, read> tf: array<f32>;
@group(0) @binding(2) var<storage, read> pa: array<vec4f>;
@group(0) @binding(3) var<storage, read> pb: array<vec4f>;
@group(0) @binding(4) var<storage, read> q: array<f32>;
@group(0) @binding(5) var<storage, read_write> fh: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> yv: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> rf: array<f32>;
@group(0) @binding(8) var<storage, read> mar: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let n = U.n;
  let T0 = tf[i]; let T1 = tf[n + i]; let T2 = tf[2u * n + i]; let T3 = tf[3u * n + i]; let T4 = tf[4u * n + i];
  let A = pa[i];
  let P = pb[i];
  let row = u32(P.x);
  let w = P.y;
  let land = P.z > 0.5;
  let lo = select(1.5, -1.0, land);
  let hi = select(6.0, 5.0, land);
  var f0 = 0.0; var a1 = 0.0; var b1 = 0.0; var a2 = 0.0; var b2 = 0.0; var cold = 0.0;
  for (var s = 0u; s < ${NS}u; s++) {
    let g = U.ang[s];
    let qs = q[row * ${NS}u + s] * (1.0 - w) + q[(row + 1u) * ${NS}u + s] * w;
    let v = T0 + T1 * g.x - T2 * g.y + T3 * g.z - T4 * g.w + A.x;
    let r1 = ramp(-v, lo, hi);
    let fa = qs * (1.0 - (A.y + A.z * r1 + A.w * ramp(-v, 0.0, 4.5)));
    f0 += fa; a1 += fa * g.x; b1 -= fa * g.y; a2 += fa * g.z; b2 -= fa * g.w;
    cold += r1;
  }
  let F = vec4f(2.0 * a1, 2.0 * b1, 2.0 * a2, 2.0 * b2) / ${NS}.0 + mar[2u * i];
  let snow = cold / ${NS}.0;
  fh[i] = F;
  // Heat capacity: land, or the sea by its share of the year under ice; the admittances (c: B + K, C_LAND, C_OCEAN, C_ICE).
  let C = select(U.c.z + (U.c.w - U.c.z) * snow, U.c.y, land);
  let bk = U.c.x + mar[2u * i + 1u].x;
  let z1 = 6.283185307 * C;
  let m1 = 1.0 / (bk * bk + z1 * z1);
  let y1 = vec2f(bk * m1, -z1 * m1);
  let z2 = 12.56637061 * C;
  let m2 = 1.0 / (bk * bk + z2 * z2);
  let y2 = vec2f(bk * m2, -z2 * m2);
  yv[i] = vec4f(y1, y2);
  let N = U.N;
  let c = U.off + i;
  rf[c] = f0 / ${NS}.0 + P.w;
  rf[N + c] = y1.x; rf[2u * N + c] = y1.y;
  rf[3u * N + c] = F.x * y1.x - F.y * y1.y; rf[4u * N + c] = F.x * y1.y + F.y * y1.x;
  rf[5u * N + c] = y2.x; rf[6u * N + c] = y2.y;
  rf[7u * N + c] = F.z * y2.x - F.w * y2.y; rf[8u * N + c] = F.z * y2.y + F.w * y2.x;
  rf[9u * N + c] = snow;
}`;

// Fields to the next coarser level as area-weighted means (src/grid/transfer.js's restrict). p0: the fields.
const RESTRICT_F = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read> geo: array<f32>;
@group(0) @binding(3) var<storage, read_write> f: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.nc) { return; }
  let c = U.off + i;
  let a0 = geo[8u * c + 6u];
  var ws = a0;
  for (var k = 0u; k < 6u; k++) { let j = topo[12u * c + k]; if (j != i) { ws += 0.5 * geo[8u * (U.off + j) + 6u]; } }
  for (var m = 0u; m < U.p0; m++) {
    let o = m * U.N;
    var s = a0 * f[o + c];
    for (var k = 0u; k < 6u; k++) { let j = topo[12u * c + k]; if (j != i) { s += 0.5 * geo[8u * (U.off + j) + 6u] * f[o + U.off + j]; } }
    f[o + U.offc + i] = s / ws;
  }
}`;

// Fields from the next coarser level (copy; parents averaged at midpoints). p0: the fields.
const PROLONG_F = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read_write> f: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  var p = vec2u(i, i);
  if (i >= U.nc) {
    var m = 0u;
    for (var k = 0u; k < 6u; k++) { let j = topo[12u * c + k]; if (j < U.nc && m < 2u) { p[m] = j; m++; } }
  }
  for (var m = 0u; m < U.p0; m++) {
    let o = m * U.N;
    f[o + c] = 0.5 * (f[o + U.offc + p.x] + f[o + U.offc + p.y]);
  }
}`;

// On the energy balance's grid: each system's diagonal and right-hand side (k: A, B, K, ΔF).
const SETUP = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> geo: array<f32>;
@group(0) @binding(2) var<storage, read> rf: array<f32>;
@group(0) @binding(3) var<storage, read_write> dg: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> b: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  let N = U.N;
  let A = geo[8u * c + 6u];
  dg[c] = vec2f(A * U.k.y, 0.0);
  b[c] = vec2f(A * (rf[c] - U.k.x + U.k.w), 0.0);
  for (var h = 0u; h < 2u; h++) {
    let r = 1u + 4u * h;
    let Z = cdiv(vec2f(1.0, 0.0), vec2f(rf[r * N + c], rf[(r + 1u) * N + c])) - vec2f(U.k.z, 0.0);
    let G = vec2f(rf[(r + 2u) * N + c], rf[(r + 3u) * N + c]);
    dg[(h + 1u) * N + c] = A * Z;
    b[(h + 1u) * N + c] = A * cmul(Z + vec2f(U.k.z, 0.0), G);
  }
}`;

// The fine temperature's fields on the energy balance's grid, to prolong (pf): T̄; per harmonic the
// transport per unit area L = (Z T̂ − (Z + K)⟨F̂Y⟩) A/W, and T̂ (the coarse cell's mean). wt: W = Pᵀ area.
const LFIELD = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> geo: array<f32>;
@group(0) @binding(2) var<storage, read> rf: array<f32>;
@group(0) @binding(3) var<storage, read> x: array<vec2f>;
@group(0) @binding(4) var<storage, read> wt: array<f32>;
@group(0) @binding(5) var<storage, read_write> pf: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  let N = U.N;
  let s = geo[8u * c + 6u] / wt[i];
  pf[c] = x[c].x;
  for (var h = 0u; h < 2u; h++) {
    let r = 1u + 4u * h;
    let Z = cdiv(vec2f(1.0, 0.0), vec2f(rf[r * N + c], rf[(r + 1u) * N + c])) - vec2f(U.k.z, 0.0);
    let G = vec2f(rf[(r + 2u) * N + c], rf[(r + 3u) * N + c]);
    let xh = x[(h + 1u) * N + c];
    let L = (cmul(Z, xh) - cmul(Z + vec2f(U.k.z, 0.0), G)) * s;
    pf[(1u + 2u * h) * N + c] = L.x; pf[(2u + 2u * h) * N + c] = L.y;
    pf[(5u + 2u * h) * N + c] = xh.x; pf[(6u + 2u * h) * N + c] = xh.y;
  }
}`;

// The exchange's net over the fine cells, per workgroup (8 sums: Σ a(Y fr − T̂ₘ) and Σ a Y per harmonic).
const SUMS = /* wgsl */`
struct Su { n: u32, N: u32, off: u32, p0: u32, k: vec4f };
@group(0) @binding(0) var<uniform> U: Su;
@group(0) @binding(1) var<storage, read> geo: array<f32>;
@group(0) @binding(2) var<storage, read> pf: array<f32>;
@group(0) @binding(3) var<storage, read> fh: array<vec4f>;
@group(0) @binding(4) var<storage, read> yv: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> part: array<vec4f>;
var<workgroup> sa: array<vec4f, 256>;
var<workgroup> sb: array<vec4f, 256>;
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_id) l: vec3u, @builtin(workgroup_id) g: vec3u) {
  let i = id.x;
  var e = vec4f(0.0);
  var y = vec4f(0.0);
  if (i < U.n) {
    let c = U.off + i;
    let N = U.N;
    let a = geo[8u * c + 6u];
    let K = U.k.x;
    let F = fh[i];
    let Y = yv[i];
    let m1 = vec2f(pf[5u * N + c], pf[6u * N + c]);
    let m2 = vec2f(pf[7u * N + c], pf[8u * N + c]);
    let f1 = F.xy + vec2f(pf[N + c], pf[2u * N + c]) + K * m1;
    let f2 = F.zw + vec2f(pf[3u * N + c], pf[4u * N + c]) + K * m2;
    e = a * vec4f(cmul(f1, Y.xy) - m1, cmul(f2, Y.zw) - m2);
    y = a * Y;
  }
  sa[l.x] = e; sb[l.x] = y;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (l.x < s) { sa[l.x] += sa[l.x + s]; sb[l.x] += sb[l.x + s]; }
    workgroupBarrier();
  }
  if (l.x == 0u) { part[2u * g.x] = sa[0]; part[2u * g.x + 1u] = sb[0]; }
}`;

// δ per harmonic from the partial sums: δ (Σa − K Σ a Y) = K Σ a (Y fr − T̂ₘ). p0: the partials; k: K, Σa.
const DELTA = /* wgsl */`
struct Su { n: u32, N: u32, off: u32, p0: u32, k: vec4f };
@group(0) @binding(0) var<uniform> U: Su;
@group(0) @binding(1) var<storage, read> part: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dl: array<vec4f>;
var<workgroup> sa: array<vec4f, 256>;
var<workgroup> sb: array<vec4f, 256>;
fn cdiv(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) l: vec3u) {
  var e = vec4f(0.0);
  var y = vec4f(0.0);
  for (var j = l.x; j < U.p0; j += 256u) { e += part[2u * j]; y += part[2u * j + 1u]; }
  sa[l.x] = e; sb[l.x] = y;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (l.x < s) { sa[l.x] += sa[l.x + s]; sb[l.x] += sb[l.x + s]; }
    workgroupBarrier();
  }
  if (l.x == 0u) {
    let K = U.k.x;
    let E = sa[0];
    let Y = sb[0];
    let d1 = K * cdiv(E.xy, vec2f(U.k.y, 0.0) - K * Y.xy);
    let d2 = K * cdiv(E.zw, vec2f(U.k.y, 0.0) - K * Y.zw);
    dl[0] = vec4f(d1, d2);
  }
}`;

// The fine harmonics: T̄ prolonged; each cell's seasons (F̂ + L + δ + K T̂ₘ) Y, or with no seasons
// of its own yet (p0 = 0) the coarse harmonics prolonged.
const FINE = /* wgsl */`
struct Su { n: u32, N: u32, off: u32, p0: u32, k: vec4f };
@group(0) @binding(0) var<uniform> U: Su;
@group(0) @binding(1) var<storage, read> pf: array<f32>;
@group(0) @binding(2) var<storage, read> fh: array<vec4f>;
@group(0) @binding(3) var<storage, read> yv: array<vec4f>;
@group(0) @binding(4) var<storage, read> dl: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> tf: array<f32>;
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let n = U.n;
  let N = U.N;
  let c = U.off + i;
  tf[i] = pf[c];
  let m1 = vec2f(pf[5u * N + c], pf[6u * N + c]);
  let m2 = vec2f(pf[7u * N + c], pf[8u * N + c]);
  var t1 = m1;
  var t2 = m2;
  if (U.p0 != 0u) {
    let K = U.k.x;
    let F = fh[i];
    let Y = yv[i];
    let d = dl[0];
    t1 = cmul(F.xy + vec2f(pf[N + c], pf[2u * N + c]) + d.xy + K * m1, Y.xy);
    t2 = cmul(F.zw + vec2f(pf[3u * N + c], pf[4u * N + c]) + d.zw + K * m2, Y.zw);
  }
  tf[n + i] = t1.x; tf[2u * n + i] = t1.y; tf[3u * n + i] = t2.x; tf[4u * n + i] = t2.y;
}`;

const wg = n => Math.ceil(n / 64);

export const EBM_GPU = {
  CYCLES: 4, CYCLES_COLD: 12,   // V-cycles a solve, warm and cold
  PRE: 2, POST: 2, JACOBI: 0.8, COARSE_SWEEPS: 300,
};

export class GpuEnergyBalance {
  /** device: the engine's; climate: the Climate (its fine and coarse grids, its transfer's grids lent to the hierarchy). */
  constructor(device, climate, { have = [] } = {}) {
    this.device = device;
    const fine = climate.grid, cg = climate.coarse, n = this.n = fine.n;
    const lend = [cg, ...have];
    for (let T = climate.T; T && T.chain; T = T.chain[0]) lend.push(T.chain[0].coarse);
    const H = this.H = hierarchy(fine, 1, lend), N = this.N = H.N;
    const lv = H.levels, top = lv.length - 1, ci = this.ci = lv.findIndex(l => l.L === cg.level);
    if (ci < 1 || lv[0].n > 64) throw new Error('ebm: the hierarchy has no level below the energy balance\'s');
    this.nc = cg.n; this.offc = lv[ci].off; this.offTop = lv[top].off;
    // The energy balance's edge weights carry the diffusivity's shape in latitude (1 + D_LAT sin²φ at the edge's middle).
    const geo = Float32Array.from(H.geo);
    for (const { g, off } of lv) for (let i = 0; i < g.n; i++) {
      const o = g.nbrOff[i], d = g.nbrOff[i + 1] - o;
      for (let k = 0; k < d; k++) {
        const z = 0.5 * (g.pos[3 * i + 2] + g.pos[3 * g.nbr[o + k] + 2]);
        geo[8 * (off + i) + k] = (g.ell[o + k] / g.dist[o + k]) * (1 + CLIMATE.D_LAT * z * z);
      }
    }
    const B = (size, data) => storage(device, size, data);
    this.topo = B(H.topo.byteLength, H.topo); this.geo = B(geo.byteLength, geo);
    this.X = B(8 * 3 * N); this.Y = B(8 * 3 * N); this.Bv = B(8 * 3 * N); this.Dg = B(8 * 3 * N);
    this.RF = B(4 * NR * N); this.PF = B(4 * NPF * N);
    this.TF = B(4 * 5 * n); this.PA = B(16 * n); this.PB = B(16 * n); this.Q = B(4 * NLAT * NS);
    this.FH = B(16 * n); this.YV = B(16 * n);
    this.WT = B(4 * cg.n, Float32Array.from(prolongT(climate.T, fine.area, new Float64Array(cg.n))));
    this.parts = Math.ceil(n / 256);
    this.PART = B(32 * this.parts); this.DL = B(16);
    this.area = 0; for (let i = 0; i < n; i++) this.area += fine.area[i];
    const K = this.K = {
      smooth: kernel(device, SMOOTH, 'ebm-smooth'), restrict: kernel(device, RESTRICT, 'ebm-restrict'), diag: kernel(device, DIAG, 'ebm-diag'),
      prolong: kernel(device, PROLONG, 'ebm-prolong'), coarse: kernel(device, COARSE, 'ebm-coarse'), forcing: kernel(device, FORCING, 'ebm-forcing'),
      rf: kernel(device, RESTRICT_F, 'ebm-restrict-f'), pf: kernel(device, PROLONG_F, 'ebm-prolong-f'), setup: kernel(device, SETUP, 'ebm-setup'),
      lfield: kernel(device, LFIELD, 'ebm-lfield'), sums: kernel(device, SUMS, 'ebm-sums'), delta: kernel(device, DELTA, 'ebm-delta'), fine: kernel(device, FINE, 'ebm-fine'),
    };
    // Uniforms: per level for the solve (the diffusivities; Jacobi's weight and the coarsest sweeps in k),
    // per level for the field transfers (p0 fields), the energy balance's grid's constants (k: A, B, K, ΔF),
    // the forcing's, and the fine kernels' (the partials' count, or whether the cells have seasons of their own).
    const U = ab => uniform(device, new Uint8Array(ab));
    this.Lu = lv.map((_, k) => U(this.lvBuf(k)));
    const Urf = lv.map((_, k) => U(this.lvBuf(k, NR))), Upf = lv.map((_, k) => U(this.lvBuf(k, NPF)));
    this.Uc = U(this.lvBuf(ci));
    this.Fu = uniform(device, new Float32Array(8 + 4 * NS));
    this.Su = [0, 1].map(() => uniform(device, new Float32Array(8)));
    const { topo, X, Y, Bv, Dg, RF, PF } = this, gb = this.geo;
    this.MAR = B(32 * n); this.mar = new Float32Array(8 * n); this.marOn = false;
    const step = [[K.forcing, K.forcing.bind({ U: this.Fu, tf: this.TF, pa: this.PA, pb: this.PB, q: this.Q, fh: this.FH, yv: this.YV, rf: RF, mar: this.MAR }), [wg(n)]]];
    for (let k = top; k > ci; k--) step.push([K.rf, K.rf.bind({ U: Urf[k], topo, geo: gb, f: RF }), [wg(lv[k - 1].n)]]);
    step.push([K.setup, K.setup.bind({ U: this.Uc, geo: gb, rf: RF, dg: Dg, b: Bv }), [wg(lv[ci].n)]]);
    for (let k = ci; k >= 1; k--) step.push([K.diag, K.diag.bind({ U: this.Lu[k], topo, dg: Dg }), [wg(lv[k - 1].n), 1, 3]]);
    this.stepList = step;
    const smooths = (k, m) => {
      const out = [];
      for (let s = 0; s < m; s += 2) {
        out.push([K.smooth, K.smooth.bind({ U: this.Lu[k], topo, geo: gb, dg: Dg, xin: X, b: Bv, xout: Y }), [wg(lv[k].n), 1, 3]]);
        out.push([K.smooth, K.smooth.bind({ U: this.Lu[k], topo, geo: gb, dg: Dg, xin: Y, b: Bv, xout: X }), [wg(lv[k].n), 1, 3]]);
      }
      return out;
    };
    const cyc = [];
    for (let k = ci; k >= 1; k--) {
      cyc.push(...smooths(k, EBM_GPU.PRE));
      cyc.push([K.restrict, K.restrict.bind({ U: this.Lu[k], topo, geo: gb, dg: Dg, x: X, b: Bv }), [wg(lv[k - 1].n), 1, 3]]);
    }
    cyc.push([K.coarse, K.coarse.bind({ U: this.Lu[0], topo, geo: gb, dg: Dg, x: X, b: Bv }), [1, 1, 3]]);
    for (let k = 1; k <= ci; k++) {
      cyc.push([K.prolong, K.prolong.bind({ U: this.Lu[k], topo, x: X }), [wg(lv[k].n), 1, 3]]);
      cyc.push(...smooths(k, EBM_GPU.POST));
    }
    this.cycleList = cyc;
    const fl = [[K.lfield, K.lfield.bind({ U: this.Uc, geo: gb, rf: RF, x: X, wt: this.WT, pf: PF }), [wg(lv[ci].n)]]];
    for (let k = ci + 1; k <= top; k++) fl.push([K.pf, K.pf.bind({ U: Upf[k], topo, f: PF }), [wg(lv[k].n)]]);
    fl.push([K.sums, K.sums.bind({ U: this.Su[0], geo: gb, pf: PF, fh: this.FH, yv: this.YV, part: this.PART }), [this.parts]]);
    fl.push([K.delta, K.delta.bind({ U: this.Su[0], part: this.PART, dl: this.DL }), [1]]);
    fl.push([K.fine, K.fine.bind({ U: this.Su[1], pf: PF, fh: this.FH, yv: this.YV, dl: this.DL, tf: this.TF }), [wg(n)]]);
    this.fineList = fl;
    this.readC = device.createBuffer({ size: 8 * 3 * cg.n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.readF = device.createBuffer({ size: 4 * 6 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.pa = new Float32Array(4 * n); this.pb = new Float32Array(4 * n);
    this.qkey = null; this.hasSub = false;
  }

  /** A level's uniform (Lv): sizes and offsets, p0, the systems' diffusivities, and k (default: Jacobi's weight, the coarsest sweeps). */
  lvBuf(k, p0 = 0, kv = [EBM_GPU.JACOBI, EBM_GPU.COARSE_SWEEPS, 0, 0]) {
    const lv = this.H.levels, L = lv[k], c = k > 0 ? lv[k - 1] : null, ab = new ArrayBuffer(64), u = new Uint32Array(ab), f = new Float32Array(ab);
    u[0] = L.n; u[1] = L.off; u[2] = c ? c.n : 0; u[3] = c ? c.off : 0; u[4] = this.N; u[6] = p0;
    f[8] = CLIMATE.D; f[9] = CLIMATE.D_SEASON; f[10] = CLIMATE.D_SEASON;
    f.set(kv, 12);
    return ab;
  }
  /** The fine kernels' uniform: j 0 the partials' count, 1 whether the cells have seasons of their own yet. */
  suBuf(j) {
    const sb = new ArrayBuffer(32), su = new Uint32Array(sb), sf = new Float32Array(sb);
    su[0] = this.n; su[1] = this.N; su[2] = this.offTop; su[3] = j === 0 ? this.parts : (this.hasSub ? 1 : 0);
    sf[4] = CLIMATE.SUB_K; sf[5] = this.area;
    return sb;
  }

  /** The constants that can change between solves (the parameters, CO₂, the orbit's table), written before a step. */
  constants(climate) {
    const P = CLIMATE, q = this.device.queue, lv = this.H.levels;
    lv.forEach((_, k) => q.writeBuffer(this.Lu[k], 0, this.lvBuf(k)));
    this.writeForcing();
    const fu = new ArrayBuffer(32 + 16 * NS), u = new Uint32Array(fu), ff = new Float32Array(fu);
    u[0] = this.n; u[1] = this.N; u[2] = this.offTop;
    ff[4] = P.B + P.SUB_K; ff[5] = P.C_LAND; ff[6] = P.C_OCEAN; ff[7] = P.C_ICE;
    for (let s = 0; s < NS; s++) {
      const c = Math.cos(2 * Math.PI * (s + 0.5) / NS), sv = Math.sin(2 * Math.PI * (s + 0.5) / NS);
      ff.set([c, sv, c * c - sv * sv, 2 * sv * c], 8 + 4 * s);
    }
    q.writeBuffer(this.Fu, 0, fu);
    q.writeBuffer(this.Su[0], 0, this.suBuf(0));
    const tab = climate.insolationRows();
    if (climate.qkey !== this.qkey) { q.writeBuffer(this.Q, 0, Float32Array.from(tab)); this.qkey = climate.qkey; }
  }

  /**
   * Before an energy balance: each cell's albedo coefficients and its row of the insolation table
   * (the geography, zones, cover, lakes, dust and the gyres' anomaly as they stand: `packAlbedo`),
   * the constants, the fine harmonics, and the coarse ones as the warm start.
   */
  begin(climate) {
    const n = this.n, q = this.device.queue;
    climate.packAlbedo(this.pa, this.pb);
    q.writeBuffer(this.PA, 0, this.pa); q.writeBuffer(this.PB, 0, this.pb);
    const tf = this.tfStage || (this.tfStage = new Float32Array(5 * n));
    for (let k = 0; k < 5; k++) tf.set(climate.Tf[k], k * n);
    q.writeBuffer(this.TF, 0, tf);
    this.upload(climate.Tc);
    this.constants(climate);
  }

  /** The coarse harmonics (5 arrays) into the solve's top level: the warm start, or Anderson's next point. */
  upload(Tc) {
    const nc = this.nc, N = this.N, o = this.offc, s = this.xStage || (this.xStage = new Float32Array(2 * nc)), q = this.device.queue;
    for (let j = 0; j < 3; j++) {
      const re = Tc[j === 0 ? 0 : 2 * j - 1], im = j === 0 ? null : Tc[2 * j];
      for (let I = 0; I < nc; I++) { s[2 * I] = re[I]; s[2 * I + 1] = im ? im[I] : 0; }
      q.writeBuffer(this.X, 8 * (j * N + o), s);
    }
  }

  encode(lists) {
    const enc = this.device.createCommandEncoder({ label: 'ebm' }), pass = enc.beginComputePass();
    for (const list of lists) for (const [k, bg, d] of list) { pass.setPipeline(k.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(...d); }
    pass.end();
    return enc;
  }

  /** Anderson's next point x (5 coarse fields): the fine temperature from it, with the last step's seasons. */
  start(x) {
    this.upload(x);
    this.device.queue.writeBuffer(this.Su[1], 0, this.suBuf(1));
    this.device.queue.submit([this.encode([this.fineList]).finish()]);
  }

  /** The forcing outside the sunlight (CO₂, volcanoes, people, the OLR's departure: src/engine/runaway.js), when it has changed. */
  writeForcing() {
    const P = CLIMATE, f = 5.35 * Math.log(P.CO2 / P.CO2_REF) + P.F_VOLC + P.F_PEOPLE + P.F_OLR;
    if (f === this.lastForcing) return;
    this.lastForcing = f;
    this.device.queue.writeBuffer(this.Uc, 0, this.lvBuf(this.ci, 0, [P.A, P.B, P.SUB_K, f]));
  }

  /** Maritime air's terms for the next step (src/engine/maritime.js: `km`, `F`), or none. */
  setMaritime(m) {
    const n = this.n, a = this.mar;
    if (!m) { if (this.marOn) { a.fill(0); this.device.queue.writeBuffer(this.MAR, 0, a); this.marOn = false; } return; }
    const km = m.km, F = m.F;
    for (let i = 0; i < n; i++) {
      const o = 8 * i;
      a[o] = F[1][i]; a[o + 1] = F[2][i]; a[o + 2] = F[3][i]; a[o + 3] = F[4][i]; a[o + 4] = km[i];
    }
    this.device.queue.writeBuffer(this.MAR, 0, a);
    this.marOn = true;
  }

  /** One step T ← G(T) (forcing, restriction, the solves, the fine temperature); resolves once G's coarse harmonics are in Tc. */
  async step(Tc, warm = true) {
    this.writeForcing();
    const lists = [this.stepList];
    for (let c = 0, m = warm ? EBM_GPU.CYCLES : EBM_GPU.CYCLES_COLD; c < m; c++) lists.push(this.cycleList);
    lists.push(this.fineList);
    this.hasSub = true;
    this.device.queue.writeBuffer(this.Su[1], 0, this.suBuf(1));
    const enc = this.encode(lists), nc = this.nc, N = this.N, o = this.offc;
    for (let j = 0; j < 3; j++) enc.copyBufferToBuffer(this.X, 8 * (j * N + o), this.readC, 8 * j * nc, 8 * nc);
    this.device.queue.submit([enc.finish()]);
    await this.readC.mapAsync(GPUMapMode.READ);
    const r = new Float32Array(this.readC.getMappedRange());
    for (let I = 0; I < nc; I++) {
      Tc[0][I] = r[2 * I];
      Tc[1][I] = r[2 * (nc + I)]; Tc[2][I] = r[2 * (nc + I) + 1];
      Tc[3][I] = r[2 * (2 * nc + I)]; Tc[4][I] = r[2 * (2 * nc + I) + 1];
    }
    this.readC.unmap();
  }

  /** The fine harmonics (5 arrays) and the snow-and-ice share, as last computed. */
  async readFine(Tf, snow) {
    const n = this.n, enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.TF, 0, this.readF, 0, 4 * 5 * n);
    enc.copyBufferToBuffer(this.RF, 4 * (9 * this.N + this.offTop), this.readF, 4 * 5 * n, 4 * n);
    this.device.queue.submit([enc.finish()]);
    await this.readF.mapAsync(GPUMapMode.READ);
    const r = new Float32Array(this.readF.getMappedRange());
    for (let k = 0; k < 5; k++) Tf[k].set(r.subarray(k * n, (k + 1) * n));
    snow.set(r.subarray(5 * n, 6 * n));
    this.readF.unmap();
  }
}
