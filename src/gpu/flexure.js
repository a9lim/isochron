// Flexure on the GPU: the thin elastic plate of src/engine/flexure.js (the
// reference, whose header has the physics), solved by the same multigrid on
// the nested grids packed by src/gpu/hierarchy.js, as the weather's inversion
// is (src/gpu/weather.js). The weather's pair is two decoupled Helmholtz
// problems; here the vec2 per cell is the plate's coupled pair (μ, w), the
// scaled moment and the deflection, so the smoother inverts each cell's 2×2
// block (collective damped Jacobi) and level 1's exact solve is one 84×84
// inverse. Restriction gathers a coarse cell's own residual and half of each
// midpoint's; prolongation copies and averages parents. Coefficients (1/p =
// D_ref/D, κ = Δρ/ρ_m) are set on the CPU from Tₑ and restricted by
// area-weighted means (harmonic in D), with the coarse inverse rebuilt from
// the f32 weights the GPU uses (~1 ms).
//
// The state stays on the GPU between solves (warm starts): `X` holds (μ, w)
// for every level, the top level's at `off`, so other kernels (the ice's
// bed, src/gpu/ice.js) can read w = X[off + i].y without a readback.
//
// Units: q in Pa, Tₑ in km, w in m (positive down).
import { kernel, storage, uniform } from './device.js';
import { hierarchy } from './hierarchy.js';
import { FLEXURE, flexureLevels, setCoefficients, scaleOf, coarseMatrix, invert } from '../engine/flexure.js';

const HEAD = /* wgsl */`
struct Lv { n: u32, off: u32, nc: u32, offc: u32, s2: f32, omega: f32, kref: f32, pad: f32 };
`;

// The operator on cell c: (−s2 A cinv μ + (K w), (K μ) + s2 A κ w); K w = Σ (ℓ/d)(w_c − w_j).
const SMOOTH = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read> geo: array<f32>;
@group(0) @binding(3) var<storage, read> cf: array<vec2f>;
@group(0) @binding(4) var<storage, read> xin: array<vec2f>;
@group(0) @binding(5) var<storage, read> b: array<vec2f>;
@group(0) @binding(6) var<storage, read_write> xout: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  let xi = xin[c];
  var kx = vec2f(0.0);
  var s = 0.0;
  for (var k = 0u; k < 6u; k++) {
    let w = geo[8u * c + k];
    kx += w * (xi - xin[U.off + topo[12u * c + k]]);
    s += w;
  }
  let sa = geo[8u * c + 6u] * U.s2;
  let co = cf[c];
  let a = sa * co.x;
  let d = sa * co.y;
  let r = b[c] - vec2f(-a * xi.x + kx.y, kx.x + d * xi.y);
  let det = -a * d - s * s;
  xout[c] = xi + U.omega * vec2f(d * r.x - s * r.y, -s * r.x - a * r.y) / det;
}`;

const RESTRICT = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> topo: array<u32>;
@group(0) @binding(2) var<storage, read> geo: array<f32>;
@group(0) @binding(3) var<storage, read> cf: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> x: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> b: array<vec2f>;
fn resid(i: u32) -> vec2f {
  let c = U.off + i;
  let xi = x[c];
  var kx = vec2f(0.0);
  for (var k = 0u; k < 6u; k++) { kx += geo[8u * c + k] * (xi - x[U.off + topo[12u * c + k]]); }
  let sa = geo[8u * c + 6u] * U.s2;
  let co = cf[c];
  return b[c] - vec2f(-sa * co.x * xi.x + kx.y, kx.x + sa * co.y * xi.y);
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

// The coarsest level: x = M⁻¹ b with the unknowns interleaved (μ₀ w₀ μ₁ w₁ …).
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
  let N = 2u * n;
  let r0 = 2u * i * N;
  let r1 = r0 + N;
  var s = vec2f(0.0);
  for (var j = 0u; j < n; j++) {
    let bj = b[U.off + j];
    s += vec2f(inv[r0 + 2u * j] * bj.x + inv[r0 + 2u * j + 1u] * bj.y, inv[r1 + 2u * j] * bj.x + inv[r1 + 2u * j + 1u] * bj.y);
  }
  x[U.off + i] = s;
}`;

// The load: b = (0, s2 A q / k_ref) on the top level.
const RHS = HEAD + /* wgsl */`
@group(0) @binding(0) var<uniform> U: Lv;
@group(0) @binding(1) var<storage, read> geo: array<f32>;
@group(0) @binding(2) var<storage, read> q: array<f32>;
@group(0) @binding(3) var<storage, read_write> b: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c = U.off + i;
  b[c] = vec2f(0.0, geo[8u * c + 6u] * U.s2 * (q[i] / U.kref));
}`;

const wg = n => Math.ceil(n / 64);

export class GpuFlexure {
  /** On `grid` (the engine's); `have` lends grids already built for the coarser levels. */
  constructor(device, grid, { lo = FLEXURE.LO, have = [] } = {}) {
    if (FLEXURE.PRE % 2 || FLEXURE.POST % 2) throw new Error('flexure: the GPU smooths in pairs (PRE and POST even)');
    this.device = device; this.grid = grid; this.n = grid.n;
    const H = this.H = hierarchy(grid, lo, have), N = H.N;
    this.levels = flexureLevels(grid, lo, H.levels.map(l => l.g));
    Object.assign(this, scaleOf());
    const top = H.levels[H.levels.length - 1];
    this.off = top.off;
    const B = (size, data) => storage(device, size, data);
    this.topo = B(H.topo.byteLength, H.topo);
    this.geo = B(H.geo.byteLength, H.geo);
    this.X = B(8 * N); this.Y = B(8 * N); this.Bv = B(8 * N);
    this.CF = B(8 * N);
    this.Q = B(4 * grid.n);
    const nc = H.levels[0].n;
    this.inv = B(4 * (2 * nc) ** 2);
    this.cf = new Float32Array(2 * N);
    this.Lu = H.levels.map((lv, k) => {
      const ab = new ArrayBuffer(32), u = new Uint32Array(ab), f = new Float32Array(ab);
      const c = k > 0 ? H.levels[k - 1] : null;
      u[0] = lv.n; u[1] = lv.off; u[2] = c ? c.n : 0; u[3] = c ? c.off : 0;
      f[4] = this.s2; f[5] = FLEXURE.JACOBI; f[6] = this.kref;
      return uniform(device, u);
    });
    const K = this.K = {
      smooth: kernel(device, SMOOTH, 'flex-smooth'), restrict: kernel(device, RESTRICT, 'flex-restrict'),
      prolong: kernel(device, PROLONG, 'flex-prolong'), coarse: kernel(device, COARSE, 'flex-coarse'), rhs: kernel(device, RHS, 'flex-rhs'),
    };
    const { topo, geo, X, Y, Bv, CF } = this, lv = H.levels, Lu = this.Lu;
    const smooths = (k, m) => {
      const out = [];
      for (let s = 0; s < m; s += 2) {
        out.push([K.smooth, K.smooth.bind({ U: Lu[k], topo, geo, cf: CF, xin: X, b: Bv, xout: Y }), wg(lv[k].n)]);
        out.push([K.smooth, K.smooth.bind({ U: Lu[k], topo, geo, cf: CF, xin: Y, b: Bv, xout: X }), wg(lv[k].n)]);
      }
      return out;
    };
    const cycle = [];
    for (let k = lv.length - 1; k >= 1; k--) {
      cycle.push(...smooths(k, FLEXURE.PRE));
      cycle.push([K.restrict, K.restrict.bind({ U: Lu[k], topo, geo, cf: CF, x: X, b: Bv }), wg(lv[k - 1].n)]);
    }
    cycle.push([K.coarse, K.coarse.bind({ U: Lu[0], inv: this.inv, x: X, b: Bv }), wg(lv[0].n)]);
    for (let k = 1; k < lv.length; k++) {
      cycle.push([K.prolong, K.prolong.bind({ U: Lu[k], topo, x: X }), wg(lv[k].n)]);
      cycle.push(...smooths(k, FLEXURE.POST));
    }
    this.cycle = cycle;
    this.rhs = [K.rhs, K.rhs.bind({ U: Lu[lv.length - 1], geo, q: this.Q, b: Bv }), wg(grid.n)];
    this.readBuf = device.createBuffer({ size: 8 * grid.n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.reading = false;
    this.ready = false;
  }

  /** Rigidity from Tₑ (km per cell) and Δρ (kg/m³: a number, or one per cell). */
  setRigidity(Te, drho = FLEXURE.RHO_M) {
    const H = this.H, L = this.levels;
    setCoefficients(L, Te, drho);
    const cf = this.cf;
    L.forEach((lv, k) => {
      const o = H.levels[k].off;
      for (let i = 0; i < lv.n; i++) { cf[2 * (o + i)] = lv.cinv[i]; cf[2 * (o + i) + 1] = lv.kap[i]; }
    });
    this.device.queue.writeBuffer(this.CF, 0, cf);
    // The coarsest level's inverse, from the f32 weights and coefficients the GPU uses.
    const c = H.levels[0], n = c.n, geo = H.geo, topo = H.topo;
    const nb = i => { const out = []; for (let k = 0; k < 6; k++) out.push([topo[12 * (c.off + i) + k], geo[8 * (c.off + i) + k]]); return out; };
    const area = Float64Array.from({ length: n }, (_, i) => geo[8 * (c.off + i) + 6]);
    const ci = Float64Array.from({ length: n }, (_, i) => cf[2 * (c.off + i)]), ka = Float64Array.from({ length: n }, (_, i) => cf[2 * (c.off + i) + 1]);
    this.device.queue.writeBuffer(this.inv, 0, Float32Array.from(invert(coarseMatrix(n, nb, area, ci, ka, Math.fround(this.s2)), 2 * n)));
    this.ready = true;
  }

  /** The load q (Pa per cell), uploaded; this switches back from `useLoad`. */
  setLoad(q) {
    if (this.external) { this.rhs = this.ownRhs; this.external = null; }
    this.device.queue.writeBuffer(this.Q, 0, q instanceof Float32Array ? q : Float32Array.from(q));
  }

  /**
   * Take the load from a buffer already on this device (f32 per top-level cell),
   * q = scale × buffer: the ice's thickness in m with scale ρᵢg, say, so the
   * ice's bed can relax toward the plate's response without a readback.
   */
  useLoad(buffer, scale = 1) {
    const ab = new ArrayBuffer(32), u = new Uint32Array(ab), f = new Float32Array(ab), top = this.H.levels[this.H.levels.length - 1];
    u[0] = top.n; u[1] = top.off; f[4] = this.s2; f[5] = FLEXURE.JACOBI; f[6] = this.kref / scale;
    this.ownRhs ||= this.rhs;
    this.external = buffer;
    this.rhs = [this.K.rhs, this.K.rhs.bind({ U: uniform(this.device, u), geo: this.geo, q: buffer, b: this.Bv }), wg(this.n)];
  }

  /** Forget the last solution (a cold start). */
  reset() { this.device.queue.writeBuffer(this.X, 0, new Float32Array(2 * this.H.N)); }

  /** Record the load's right-hand side and `cycles` V-cycles into a compute pass. */
  encode(pass, cycles) {
    const list = [this.rhs];
    for (let c = 0; c < cycles; c++) list.push(...this.cycle);
    for (const [k, bg, n] of list) { pass.setPipeline(k.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(n); }
  }

  /** Run `cycles` V-cycles, warm-started from the last state. */
  run(cycles = 4) {
    if (!this.ready) throw new Error('flexure: no rigidity (setRigidity first)');
    const enc = this.device.createCommandEncoder({ label: 'flexure' });
    const pass = enc.beginComputePass();
    this.encode(pass, cycles);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** The top level's (μ, w), interleaved (Float32Array 2n). */
  async readState() {
    this.reading = true;
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.X, 8 * this.off, this.readBuf, 0, 8 * this.n);
    this.device.queue.submit([enc.finish()]);
    await this.readBuf.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(this.readBuf.getMappedRange().slice(0));
    this.readBuf.unmap();
    this.reading = false;
    return out;
  }

  /** w (m, positive down) as last solved. */
  async read() {
    const s = await this.readState(), w = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) w[i] = s[2 * i + 1];
    return w;
  }

  /** w under q (Pa); Tₑ (km) resets the rigidity, omitted keeps it. Warm-started unless `warm` is false. */
  async solve(q, Te = null, { cycles = 6, warm = true, drho = FLEXURE.RHO_M } = {}) {
    if (Te) this.setRigidity(Te, drho);
    if (!warm) this.reset();
    if (q) this.setLoad(q);
    this.run(cycles);
    return this.read();
  }
}
