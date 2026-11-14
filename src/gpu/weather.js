// The weather (docs/PLAN.md, layer 8), on the GPU: two-layer quasi-geostrophic
// flow on the sphere (standard), on the engine's grid (level 7, 55 km).
//
//   q₁ = ∇²ψ₁ + F(ψ₂ − ψ₁) + f,   q₂ = ∇²ψ₂ + F(ψ₁ − ψ₂) + f + f₀ h_b/H
// Each layer's potential vorticity is carried by its own flow. Fluxes across
// each Voronoi edge are differences of ψ at its two corners, so the flow is
// exactly non-divergent and PV is conserved by the transport (partly upwinded
// for dissipation). The lower layer's state is q₂ less its orography, whose
// part is carried alongside, so the ground can change under the weather.
// Each step inverts once for ψ: the barotropic part by a Poisson solve and
// the baroclinic by a Helmholtz solve, both at once (a vec2), by multigrid
// V-cycles on the nested grids (src/gpu/hierarchy.js): weighted Jacobi
// smoothing, full-weighting transfer, and an exact solve on level 2 by a
// precomputed inverse. The barotropic solve carries a planetary-scale
// screening, (∇² − k₀²) with 1/k₀ ~ 32,000 km, which fixes ψ's arbitrary
// constant and touches the largest waves by ~2%.
// Forcing: the baroclinic streamfunction relaxes toward the climate's own
// thermal wind at the season (Held and Suarez's idea in a two-layer model),
// Ekman friction drags the lower layer, and the tropics, where QG fails, are
// damped (in flux form, so the damping conserves PV's integral). Baroclinic
// instability then makes the cyclones by itself (Phillips' criterion: shear
// above β L_d²/2).
//
// Tracers ride the lower layer: surface temperature, relaxed to the climate's,
// which deformation sharpens into fronts; and moisture, which the warm sea
// evaporates and which rains out where the column cools past saturation.
//
// The state never leaves the GPU except as a read for the chart (a worker
// traces it, src/render/chart-worker.js). The globe's weather fields are
// written by a kernel straight into its vertex buffer each frame.
//
// Units: SI inside; ψ in m²/s, q in 1/s, time in seconds.
import { kernel, storage, uniform } from './device.js';
import { hierarchy, coarseInverse, A_M } from './hierarchy.js';

const OMEGA = 7.292e-5;

export const WEATHER = {
  DT5: 800,             // s at level 5, halving with the cell: the advective limit through the spin-up, whose jets reach ~90 m/s
  LD: 8e5,              // m, the deformation radius
  TAU_RAD: 15 * 86400,  // relaxation of the shear toward the climate's
  TAU_EK: 4 * 86400,    // Ekman friction on the lower layer
  TAU_TROP: 1 * 86400,  // damping at the equator, fading by 15°
  SHEAR: 2.2e6,         // m²/s per K of the baroclinic ψ's equilibrium (the thermal wind)
  UPWIND: 0.2,          // share of upwinding in the PV transport
  NU4_5: 2e15,          // m⁴/s at level 5: hyperviscosity, damping the grid's scale in ~3 h; ∝ cell^3.2,
                        // so finer cells (whose noise grows faster) are damped faster, as models scale it
  TOPO: 0.3,            // share of orography in the lower layer's PV
  TAU_THETA: 5 * 86400, // surface temperature's pull toward the climate's
  TAU_EVAP: 2 * 86400,
  TAU_RAIN: 0.3 * 86400,
  K0: 1 / 3.16e7,       // 1/m: the barotropic solve's screening
  CYCLES: 2,            // V-cycles per step (warm-started)
  START: 0.5,           // the share of the climate's shear the upper layer starts with (all of it overshoots: storms grow
                        // explosively and the transient's jets pass the step's advective limit)
  JACOBI: 0.8,          // the smoother's weight
  NB: 60,               // latitude bands for the eddy pressure
};

const wsat = T => 25 * Math.exp(0.065 * (Math.max(-45, Math.min(45, T)) - 15));

const HEAD = /* wgsl */`
const A2: f32 = ${(A_M * A_M).toExponential(8)};
const OMEGA: f32 = ${OMEGA};
struct Lv { n: u32, off: u32, nc: u32, offc: u32, k2: vec2f, omega: f32, nf: u32 };
fn wsat(T: f32) -> f32 { return 25.0 * exp(0.065 * (clamp(T, -45.0, 45.0) - 15.0)); }
`;

const SMOOTH = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read> geo: array<f32>;
@group(0) @binding(3) var<storage, read> xin: array<vec2f>;
@group(0) @binding(4) var<storage, read> b: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> xout: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  let xi = xin[c];
  var s = vec2f(0.0);
  var ws = 0.0;
  for (var k = 0u; k < 6u; k++) {
    let w = geo[8u * c + k];
    s += w * (xi - xin[U.off + topo[12u * c + k]]);
    ws += w;
  }
  let m = geo[8u * c + 6u] * A2 * U.k2;
  xout[c] = xi + U.omega * (b[c] - s - m * xi) / (vec2f(ws) + m);
}`;

const RESTRICT = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read> geo: array<f32>;
@group(0) @binding(3) var<storage, read_write> x: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> b: array<vec2f>;
fn resid(i: u32) -> vec2f {
  let c = U.off + i;
  let xi = x[c];
  var s = vec2f(0.0);
  for (var k = 0u; k < 6u; k++) { s += geo[8u * c + k] * (xi - x[U.off + topo[12u * c + k]]); }
  return b[c] - s - geo[8u * c + 6u] * A2 * U.k2 * xi;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.nc) { return; }
  let c = U.off + i;
  var r = resid(i);
  for (var k = 0u; k < 6u; k++) {
    let j = topo[12u * c + k];
    if (j != i) { r += 0.5 * resid(j); }
  }
  b[U.offc + i] = r;
  x[U.offc + i] = vec2f(0.0);
}`;

const PROLONG = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read_write> x: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  var corr = vec2f(0.0);
  if (i < U.nc) {
    corr = x[U.offc + i];
  } else {
    for (var k = 0u; k < 6u; k++) {
      let j = topo[12u * c + k];
      if (j < U.nc) { corr += 0.5 * x[U.offc + j]; }
    }
  }
  x[c] = x[c] + corr;
}`;

const COARSE = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> inv: array<f32>;
@group(0) @binding(2) var<storage, read_write> x: array<vec2f>;
@group(0) @binding(3) var<storage, read> b: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let n = U.n;
  if (i >= n) { return; }
  var s = vec2f(0.0);
  for (var j = 0u; j < n; j++) {
    let bj = b[U.off + j];
    s += vec2f(inv[i * n + j] * bj.x, inv[n * n + i * n + j] * bj.y);
  }
  x[U.off + i] = s;
}`;

const RHS = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> geo: array<f32>;
@group(0) @binding(2) var<storage, read> s: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> b: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  let q = s[2u * i];
  let f = 2.0 * OMEGA * geo[8u * c + 7u];
  b[c] = -geo[8u * c + 6u] * A2 * vec2f(0.5 * (q.x + q.y) - f, 0.5 * (q.x - q.y));
}`;

const CORNERS = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> tris: array<u32>;
@group(0) @binding(2) var<storage, read> x: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> cp: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let f = id.x;
  if (f >= U.nf) { return; }
  let m = (x[U.off + tris[3u * f]] + x[U.off + tris[3u * f + 1u]] + x[U.off + tris[3u * f + 2u]]) / 3.0;
  cp[f] = vec2f(m.x + m.y, m.x - m.y);
}`;

const LAP = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read> geo: array<f32>;
@group(0) @binding(3) var<storage, read> s: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> lap: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  let si = s[2u * i];
  var acc = vec4f(0.0);
  for (var k = 0u; k < 6u; k++) { acc += geo[8u * c + k] * (s[2u * topo[12u * c + k]] - si); }
  lap[i] = acc / (geo[8u * c + 6u] * A2);
}`;

const TEND = HEAD + /* wgsl */`
struct Wx { dt: f32, F: f32, f0: f32, hbF: f32, nu4: f32, tmean: f32, shear: f32, upwind: f32,
            tauRad: f32, tauEk: f32, tauTrop: f32, tauTheta: f32, tauEvap: f32, tauRain: f32, abA: f32, abB: f32 };
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<uniform> P: Wx;
@group(0) @binding(2) var<storage, read> topo: array<u32>;
@group(0) @binding(3) var<storage, read> geo: array<f32>;
@group(0) @binding(4) var<storage, read> sIn: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> sOut: array<vec4f>;
@group(0) @binding(6) var<storage, read> x: array<vec2f>;
@group(0) @binding(7) var<storage, read> cp: array<vec2f>;
@group(0) @binding(8) var<storage, read> lap: array<vec4f>;
@group(0) @binding(9) var<storage, read> forc: array<vec4f>;
fn trop(z: f32) -> f32 { let l = asin(clamp(z, -1.0, 1.0)) / 0.18; return exp(-l * l); }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  let A = geo[8u * c + 6u] * A2;
  let z = geo[8u * c + 7u];
  let f = 2.0 * OMEGA * z;
  let ti = trop(z);
  let S = sIn[2u * i];
  let Pt = sIn[2u * i + 1u];
  let X = x[c];
  let psi = vec2f(X.x + X.y, X.x - X.y);
  let Fi = forc[i];
  let li = lap[i];
  var zeta = vec2f(0.0);
  var tz = vec2f(0.0);
  var hv = vec4f(0.0);
  var tr = vec4f(0.0);
  for (var k = 0u; k < 6u; k++) {
    let j = topo[12u * c + k];
    let w = geo[8u * c + k];
    let Xj = x[U.off + j];
    let dpsi = vec2f(Xj.x + Xj.y, Xj.x - Xj.y) - psi;
    zeta += w * dpsi;
    tz += w * 0.5 * (ti + trop(geo[8u * (U.off + j) + 7u])) * dpsi;
    hv += w * (lap[j] - li);
    // The edge to neighbour k runs from corner k−1 to corner k: its outward flux per layer.
    let Fl = -(cp[topo[12u * c + 6u + k]] - cp[topo[12u * c + 6u + (k + 5u) % 6u]]);
    let Sj = sIn[2u * j];
    let hj = forc[j].w;
    let u1 = 0.5 * P.upwind * sign(Fl.x);
    let u2 = 0.5 * P.upwind * sign(Fl.y);
    let d = S - Sj;
    let e1 = 0.5 * (S.x + Sj.x) + u1 * d.x;
    let e2 = 0.5 * (S.yzw + Sj.yzw) + u2 * d.yzw;
    let eh = 0.5 * (Fi.w + hj) + u2 * (Fi.w - hj);
    tr += vec4f(Fl.x * e1, Fl.y * (e2.x + P.hbF * eh), Fl.y * e2.y, Fl.y * e2.z);
  }
  var t = -tr / A;
  zeta = zeta / A;
  // Hyperviscosity (−ν∇⁴; the tracers lightly), and the tropics' damping in flux form.
  t -= P.nu4 * vec4f(1.0, 1.0, 0.5, 0.5) * hv / A;
  t = vec4f(t.xy - tz / (A * P.tauTrop), t.zw);
  // Relax the shear toward the climate's; Ekman below.
  let bcEq = P.shear * (f / P.f0) * (Fi.x - P.tmean);
  let relax = 2.0 * P.F * (X.y - bcEq) / P.tauRad;
  t.x += relax;
  t.y += -relax - zeta.y / P.tauEk;
  // Surface temperature toward the climate's; moisture from the sea, rain past saturation.
  t.z += (Fi.x - S.z) / P.tauTheta;
  let sea = 1.0 - Fi.z;
  let src = sea * max(0.0, 0.85 * wsat(Fi.y) - S.w) / P.tauEvap + (1.0 - sea) * 0.2 * max(0.0, 0.6 * wsat(S.z) - S.w) / P.tauEvap;
  let rain = max(0.0, S.w - 0.9 * wsat(S.z)) / P.tauRain;
  t.w += src - rain;
  var Sn = S + P.dt * (P.abA * t + P.abB * Pt);
  Sn.w = max(Sn.w, 0.0);
  sOut[2u * i] = Sn;
  sOut[2u * i + 1u] = t;
}`;

// The globe's fields: the eddy pressure (ρfψ₂ less its zonal mean) over the
// climate's template, rain, temperature and humidity, each blended with the
// climate's mean by how live the weather is.
const DRAWHEAD = HEAD + /* wgsl */`
struct Dw { live: f32, lapse: f32, nb: u32, tauRain: f32 };
fn pEddy(X: vec2f, z: f32) -> f32 { return 1.2 * 2.0 * OMEGA * z * (X.x - X.y) / 100.0; }
`;
const ZONAL = DRAWHEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> bandOff: array<u32>;
@group(0) @binding(2) var<storage, read> bandCells: array<u32>;
@group(0) @binding(3) var<storage, read> geo: array<f32>;
@group(0) @binding(4) var<storage, read> x: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> zm: array<f32>;
var<workgroup> acc: array<f32, 64>;
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
  let a = bandOff[wg.x];
  let e = bandOff[wg.x + 1u];
  var s = 0.0;
  for (var k = a + li; k < e; k += 64u) {
    let c = U.off + bandCells[k];
    s += pEddy(x[c], geo[8u * c + 7u]);
  }
  acc[li] = s;
  workgroupBarrier();
  for (var st = 32u; st > 0u; st = st >> 1u) {
    if (li < st) { acc[li] += acc[li + st]; }
    workgroupBarrier();
  }
  if (li == 0u) { zm[wg.x] = acc[0] / f32(max(1u, e - a)); }
}`;
const DRAW = DRAWHEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<uniform> D: Dw;
@group(0) @binding(2) var<storage, read> geo: array<f32>;
@group(0) @binding(3) var<storage, read> s: array<vec4f>;
@group(0) @binding(4) var<storage, read> x: array<vec2f>;
@group(0) @binding(5) var<storage, read> forc: array<vec4f>;
@group(0) @binding(6) var<storage, read> mean: array<vec4f>;
@group(0) @binding(7) var<storage, read> zm: array<f32>;
@group(0) @binding(8) var<storage, read_write> out: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  let z = geo[8u * c + 7u];
  let lat = asin(clamp(z, -1.0, 1.0));
  // The zonal mean, linear between the bands' centres (a step at each band's edge would draw).
  let xb = clamp((lat / 3.14159265 + 0.5) * f32(D.nb) - 0.5, 0.0, f32(D.nb - 1u));
  let b0 = u32(floor(xb));
  let b1 = min(b0 + 1u, D.nb - 1u);
  let S = s[2u * i];
  let M = mean[i];
  let L = D.live;
  let pE = pEddy(x[c], z) - mix(zm[b0], zm[b1], xb - f32(b0));
  let rainW = max(0.0, S.w - 0.9 * wsat(S.z)) / D.tauRain * 86400.0;
  let rhW = min(1.2, S.w / wsat(S.z));
  out[i] = vec4f(M.x + L * pE, (1.0 - L) * M.y + L * rainW, (1.0 - L) * M.z + L * S.z - D.lapse * forc[i].w, min(1.0, (1.0 - L) * M.w + L * rhW));
}`;
// Isobars on cells would stair-step: pressure is drawn eased toward its neighbours.
const SMOOTHP = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read> src: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> dst: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  let v = src[i];
  var s = 0.0;
  var m = 0.0;
  for (var k = 0u; k < 6u; k++) {
    let j = topo[12u * c + k];
    if (j != i) { s += src[j].x; m += 1.0; }
  }
  dst[i] = vec4f(0.4 * v.x + 0.6 * s / m, v.yzw);
}`;

const wg = n => Math.ceil(n / 64);

export class GpuWeather {
  constructor(device, grid, seed = 'weather') {
    const W = WEATHER;
    this.device = device; this.grid = grid; this.n = grid.n; this.level = grid.level;
    const s = 2 ** (grid.level - 5);
    this.dt = W.DT5 / s;
    this.f0 = 2 * OMEGA * Math.sin(Math.PI / 4);
    this.F = 1 / (W.LD * W.LD);
    const H = this.H = hierarchy(grid, 2), n = grid.n, N = H.N;
    const top = H.levels[H.levels.length - 1];
    this.off = top.off;
    this.lat = Float64Array.from({ length: n }, (_, i) => Math.asin(grid.pos[3 * i + 2]));
    const B = (size, data) => storage(device, size, data);
    this.topo = B(H.topo.byteLength, H.topo);
    this.geo = B(H.geo.byteLength, H.geo);
    this.X = B(8 * N); this.Y = B(8 * N); this.Bv = B(8 * N);
    this.S = [B(32 * n), B(32 * n)];
    this.C = B(8 * grid.nf);
    this.LAP = B(16 * n);
    this.Fo = B(16 * n);
    this.M = B(16 * n);
    this.T4 = B(16 * n);
    this.tris = B(grid.tris.byteLength, grid.tris);
    this.k2 = [W.K0 ** 2, 2 * this.F];
    this.inv = B(4 * 2 * H.levels[0].n ** 2, coarseInverse(H, this.k2));
    // Latitude bands, as lists of cells.
    const nb = W.NB, band = Int32Array.from(this.lat, l => Math.min(nb - 1, Math.floor((l / Math.PI + 0.5) * nb)));
    const bandOff = new Uint32Array(nb + 1);
    for (let i = 0; i < n; i++) bandOff[band[i] + 1]++;
    for (let b = 0; b < nb; b++) bandOff[b + 1] += bandOff[b];
    const fill = bandOff.slice(0, nb), bandCells = new Uint32Array(n);
    for (let i = 0; i < n; i++) bandCells[fill[band[i]]++] = i;
    this.bandOff = B(bandOff.byteLength, bandOff); this.bandCells = B(bandCells.byteLength, bandCells);
    this.zm = B(4 * nb);
    // A uniform per level: its cells and offset, the next coarser's, the pair of k², the smoother's weight.
    this.Lu = H.levels.map((lv, k) => {
      const ab = new ArrayBuffer(32), u = new Uint32Array(ab), f = new Float32Array(ab);
      const c = k > 0 ? H.levels[k - 1] : null;
      u[0] = lv.n; u[1] = lv.off; u[2] = c ? c.n : 0; u[3] = c ? c.off : 0;
      f[4] = this.k2[0]; f[5] = this.k2[1]; f[6] = W.JACOBI; u[7] = lv.L === grid.level ? grid.nf : 0;
      return uniform(device, u);
    });
    this.params = new Float32Array(16);
    this.Pu = uniform(device, this.params);
    this.dparams = new ArrayBuffer(16);
    this.Du = uniform(device, new Uint32Array(this.dparams));
    this.tmean = 14;
    this.writeParams(1, 0);

    const K = {
      smooth: kernel(device, SMOOTH, 'smooth'), restrict: kernel(device, RESTRICT, 'restrict'), prolong: kernel(device, PROLONG, 'prolong'),
      coarse: kernel(device, COARSE, 'coarse'), rhs: kernel(device, RHS, 'rhs'), corners: kernel(device, CORNERS, 'corners'),
      lap: kernel(device, LAP, 'lap'), tend: kernel(device, TEND, 'tend'),
      zonal: kernel(device, ZONAL, 'zonal'), draw: kernel(device, DRAW, 'draw'), smoothp: kernel(device, SMOOTHP, 'smoothp'),
    };
    this.K = K;
    const { topo, geo, X, Y, Bv } = this, Ltop = this.Lu[this.Lu.length - 1];
    // One V-cycle: smooth twice, restrict the residual, down to level 2; solve there; back up.
    const cycle = [];
    const lv = H.levels;
    for (let k = lv.length - 1; k >= 1; k--) {
      cycle.push([K.smooth, K.smooth.bind({ U: this.Lu[k], topo, geo, xin: X, b: Bv, xout: Y }), wg(lv[k].n)]);
      cycle.push([K.smooth, K.smooth.bind({ U: this.Lu[k], topo, geo, xin: Y, b: Bv, xout: X }), wg(lv[k].n)]);
      cycle.push([K.restrict, K.restrict.bind({ U: this.Lu[k], topo, geo, x: X, b: Bv }), wg(lv[k - 1].n)]);
    }
    cycle.push([K.coarse, K.coarse.bind({ U: this.Lu[0], inv: this.inv, x: X, b: Bv }), wg(lv[0].n)]);
    for (let k = 1; k < lv.length; k++) {
      cycle.push([K.prolong, K.prolong.bind({ U: this.Lu[k], topo, x: X }), wg(lv[k].n)]);
      cycle.push([K.smooth, K.smooth.bind({ U: this.Lu[k], topo, geo, xin: X, b: Bv, xout: Y }), wg(lv[k].n)]);
      cycle.push([K.smooth, K.smooth.bind({ U: this.Lu[k], topo, geo, xin: Y, b: Bv, xout: X }), wg(lv[k].n)]);
    }
    this.cycle = cycle;
    // A step reading state p and writing 1 − p.
    this.steps = [0, 1].map(p => {
      const list = [[K.rhs, K.rhs.bind({ U: Ltop, geo, s: this.S[p], b: Bv }), wg(n)]];
      for (let c = 0; c < W.CYCLES; c++) list.push(...cycle);
      list.push([K.corners, K.corners.bind({ U: Ltop, tris: this.tris, x: X, cp: this.C }), wg(grid.nf)]);
      list.push([K.lap, K.lap.bind({ U: Ltop, topo, geo, s: this.S[p], lap: this.LAP }), wg(n)]);
      list.push([K.tend, K.tend.bind({ U: Ltop, P: this.Pu, topo, geo, sIn: this.S[p], sOut: this.S[1 - p], x: X, cp: this.C, lap: this.LAP, forc: this.Fo }), wg(n)]);
      return list;
    });
    this.cur = 0;
    this.t = 0;
    this.started = false;
    this.rng = mulberry(hash(seed));
    this.readBuf = device.createBuffer({ size: 40 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.reading = false;
    // Timing: the steps' GPU time, from timestamps where the device has them.
    this.msPerStep = 0.3;
    this.calls = 0;
    if (device.features.has('timestamp-query')) {
      this.qs = device.createQuerySet({ type: 'timestamp', count: 2 });
      this.qResolve = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      this.qRead = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      this.qBusy = false;
    }
  }

  writeParams(abA, abB) {
    const W = WEATHER, s = 2 ** (this.level - 5);
    this.params.set([this.dt, this.F, this.f0, W.TOPO * this.f0 / 5000, W.NU4_5 / s ** 3.2, this.tmean, W.SHEAR, W.UPWIND,
      W.TAU_RAD, W.TAU_EK, W.TAU_TROP, W.TAU_THETA, W.TAU_EVAP, W.TAU_RAIN, abA, abB]);
    this.device.queue.writeBuffer(this.Pu, 0, this.params);
  }

  /** Forcing per cell (vec4: the climate's sea-level temperature, the sea's, land share, orography in m) and its mean temperature. */
  setForcing(f4, tmean) {
    this.forc = f4;
    this.tmean = tmean;
    this.device.queue.writeBuffer(this.Fo, 0, f4);
    this.writeParams(this.params[14], this.params[15]);
  }

  /** The climate's mean at the season, per cell (vec4: pressure hPa, rain mm/day, sea-level °C, humidity), for the blend. */
  setMean(m4) { this.device.queue.writeBuffer(this.M, 0, m4); }

  /** Start from the climate's shear and a little noise (needs the forcing). */
  start() {
    const g = this.grid, n = this.n, F = this.F, f4 = this.forc, rng = this.rng;
    const psi1 = new Float64Array(n), psi2 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const f = 2 * OMEGA * g.pos[3 * i + 2];
      const bcEq = WEATHER.SHEAR * (f / this.f0) * (f4[4 * i] - this.tmean);
      // The upper layer carries the thermal wind; the lower starts nearly at rest.
      psi1[i] = 2 * (WEATHER.START * bcEq * (1 + 0.02 * (rng() - 0.5)) + 2e5 * (rng() - 0.5));
      psi2[i] = 1e5 * (rng() - 0.5);
    }
    const lap = psi => {
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let t = g.nbrOff[i], e = g.nbrOff[i + 1]; t < e; t++) s += g.ell[t] / g.dist[t] * (psi[g.nbr[t]] - psi[i]);
        out[i] = s / (g.area[i] * A_M * A_M);
      }
      return out;
    };
    const z1 = lap(psi1), z2 = lap(psi2);
    const S = new Float32Array(8 * n), X = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) {
      const f = 2 * OMEGA * g.pos[3 * i + 2], T = f4[4 * i];
      S[8 * i] = z1[i] + F * (psi2[i] - psi1[i]) + f;
      S[8 * i + 1] = z2[i] + F * (psi1[i] - psi2[i]) + f;
      S[8 * i + 2] = T;
      S[8 * i + 3] = 0.6 * wsat(T);
      X[2 * i] = 0.5 * (psi1[i] + psi2[i]); X[2 * i + 1] = 0.5 * (psi1[i] - psi2[i]);
    }
    this.cur = 0;
    this.device.queue.writeBuffer(this.S[0], 0, S);
    this.device.queue.writeBuffer(this.X, 8 * this.off, X);
    // The first step is Euler's (no previous tendency), the rest Adams–Bashforth 2.
    this.writeParams(1, 0);
    this.advance(1);
    this.writeParams(1.5, -0.5);
    this.t = this.dt;
    this.started = true;
  }

  /** Encode and submit k steps. */
  advance(k) {
    if (k <= 0) return;
    const dev = this.device, enc = dev.createCommandEncoder();
    const timed = this.qs && !this.qBusy && (this.calls++ % 15 === 0);
    const pass = enc.beginComputePass(timed ? { timestampWrites: { querySet: this.qs, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {});
    for (let s = 0; s < k; s++) {
      for (const [K, bg, x] of this.steps[this.cur]) { pass.setPipeline(K.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(x); }
      this.cur = 1 - this.cur;
    }
    pass.end();
    if (timed) {
      enc.resolveQuerySet(this.qs, 0, 2, this.qResolve, 0);
      enc.copyBufferToBuffer(this.qResolve, 0, this.qRead, 0, 16);
    }
    dev.queue.submit([enc.finish()]);
    this.t += k * this.dt;
    if (!this.qs && !this.qBusy && this.calls++ % 15 === 0) {
      // No timestamps: time the batch by when the queue drains (an upper bound: it waits on what was queued before).
      this.qBusy = true;
      const t0 = performance.now();
      dev.queue.onSubmittedWorkDone().then(() => {
        const ms = (performance.now() - t0) / k;
        if (ms > 0 && ms < 100) this.msPerStep = 0.7 * this.msPerStep + 0.3 * ms;
        this.qBusy = false;
      });
    }
    if (timed) {
      this.qBusy = true;
      this.qRead.mapAsync(GPUMapMode.READ).then(() => {
        const q = new BigInt64Array(this.qRead.getMappedRange());
        const ms = Number(q[1] - q[0]) / 1e6 / k;
        this.qRead.unmap();
        if (ms > 0 && ms < 100) this.msPerStep = 0.7 * this.msPerStep + 0.3 * ms;
        this.qBusy = false;
      }, () => { this.qBusy = false; });
    }
  }

  /** Write the globe's weather fields (vec4 per cell) into `out`, blended with the climate's mean by `live`. */
  draw(out, live) {
    const dev = this.device, K = this.K, Ltop = this.Lu[this.Lu.length - 1], n = this.n;
    const u = new Uint32Array(this.dparams), f = new Float32Array(this.dparams);
    f[0] = live; f[1] = 0.0065; u[2] = WEATHER.NB; f[3] = WEATHER.TAU_RAIN;
    dev.queue.writeBuffer(this.Du, 0, this.dparams);
    if (this.drawOut !== out) {
      this.drawOut = out;
      const S = this.S;
      this.drawBinds = [0, 1].map(p => [
        [K.zonal, K.zonal.bind({ U: Ltop, bandOff: this.bandOff, bandCells: this.bandCells, geo: this.geo, x: this.X, zm: this.zm }), WEATHER.NB],
        [K.draw, K.draw.bind({ U: Ltop, D: this.Du, geo: this.geo, s: S[p], x: this.X, forc: this.Fo, mean: this.M, zm: this.zm, out }), wg(n)],
        [K.smoothp, K.smoothp.bind({ U: Ltop, topo: this.topo, src: out, dst: this.T4 }), wg(n)],
        [K.smoothp, K.smoothp.bind({ U: Ltop, topo: this.topo, src: this.T4, dst: out }), wg(n)],
      ]);
    }
    const enc = dev.createCommandEncoder(), pass = enc.beginComputePass();
    for (const [K2, bg, x] of this.drawBinds[this.cur]) { pass.setPipeline(K2.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(x); }
    pass.end();
    dev.queue.submit([enc.finish()]);
  }

  /** The lower layer's ψ, temperature and moisture, read back (null while a read is in flight). */
  async read() {
    if (this.reading || !this.started) return null;
    this.reading = true;
    const n = this.n, enc = this.device.createCommandEncoder(), t = this.t;
    enc.copyBufferToBuffer(this.S[this.cur], 0, this.readBuf, 0, 32 * n);
    enc.copyBufferToBuffer(this.X, 8 * this.off, this.readBuf, 32 * n, 8 * n);
    this.device.queue.submit([enc.finish()]);
    try {
      await this.readBuf.mapAsync(GPUMapMode.READ);
      const S = new Float32Array(this.readBuf.getMappedRange(0, 32 * n)), X = new Float32Array(this.readBuf.getMappedRange(32 * n, 8 * n));
      const psi2 = new Float32Array(n), theta = new Float32Array(n), qv = new Float32Array(n);
      for (let i = 0; i < n; i++) { psi2[i] = X[2 * i] - X[2 * i + 1]; theta[i] = S[8 * i + 2]; qv[i] = S[8 * i + 3]; }
      this.readBuf.unmap();
      return { psi2, theta, qv, t };
    } finally { this.reading = false; }
  }
}

/** The weather's forcing from the climate at year phase τ: vec4 per cell, and the mean temperature. */
export function weatherForcing(climate, tau, out) {
  const g = climate.grid, n = g.n, sst = climate.ocean ? climate.ocean.sst : null;
  let sum = 0, A = 0;
  for (let i = 0; i < n; i++) {
    const T = climate.tAt(i, tau), land = climate.landMask[i];
    out[4 * i] = T;
    out[4 * i + 1] = land ? 0 : T + (sst ? sst[i] : 0);
    out[4 * i + 2] = land;
    out[4 * i + 3] = climate.elevPos[i] * 1000;
    sum += T * g.area[i]; A += g.area[i];
  }
  return sum / A;
}

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
