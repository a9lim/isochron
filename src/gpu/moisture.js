// The climate's moisture balance on the GPU (src/engine/climate.js, `moisture`):
// each cell's column water W solves a W + A P(W) = b, upwinded transport and
// eddy mixing from its neighbours, evaporation toward saturation, and rain
// convex in W (Newton, four iterations, then the rain cap). The CPU sweeps it
// Gauss–Seidel in four orders; here every cell updates at once from its
// neighbours' last values (Jacobi), many times over, which converges to the
// same balance (tests/gpu-node.test.mjs). The page's climate runs on the
// engine's worker, so this uses the engine's device.
//
// `solveFrom` packs the coefficients here too, from the carrying wind and the
// temperature at the point of the year (the CPU's packing cost ~15 ms a point
// at level 7 and uploaded 16 floats a cell), and computes the rain from the
// balance, so only W and P come back.
import { kernel, storage, uniform } from './device.js';

// Per cell, 16 floats: the six neighbours' coefficients in b (c₀..c₅), the diagonal a,
// the constant part of b, k₀ and α of the convective rain, λ, W_s, the area A, A·P_max, r₀ (the
// column's humidity where convection sets in, raised by descent: Climate.descent) and convection's
// share by the surface's warmth.
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
  if (lam * w + c3.w * ws / 60.0 * exp(min(40.0, U.ca * (w / ws - c3.z))) > U.pmax) {
    w = max(w, (b - c3.y) / max(1e-9, a - c3.x * lam));
  }
  wout[i] = max(0.0, w);
}`;

// The coefficients (the CPU's packing in Climate.moisture): per cell, from the carrying wind, the
// temperature, β's factor and the descent (tb), the geography (s0: land, elevation km, the gyres' anomaly, area sr;
// s1: the slope's direction and size, the lakes' share; s2: trees' and grass's shares) and each edge
// (et: the tangent × the edge's length, the eddy mixing's κℓ/d; pads zero).
// a: (R_KM·86.4, R_KM², RAIN_BG, RAIN_ORO); b: (EVAP, land's evaporation, LAKE_ICE, LAPSE);
// c: (CONV_A, CONV_R0, RAIN_MAX, cover?); d: (E_BARE, E_TREE, W0, WA); e: (SUB_R0, SUB_BG, BG_R1, BG_R2);
// f: (CONV_T0, CONV_T1).
// tb: (T, β's factor, descent, the last solve's W: the background rain's humidity).
const PACK = /* wgsl */`
struct Pu { n: u32, p0: u32, p1: u32, p2: u32, a: vec4f, b: vec4f, c: vec4f, d: vec4f, e: vec4f, f: vec4f };
@group(0) @binding(0) var<uniform> U: Pu;
@group(0) @binding(1) var<storage, read> wind: array<f32>;
@group(0) @binding(2) var<storage, read> tb: array<vec4f>;
@group(0) @binding(3) var<storage, read> s0: array<vec4f>;
@group(0) @binding(4) var<storage, read> s1: array<vec4f>;
@group(0) @binding(5) var<storage, read> s2: array<vec2f>;
@group(0) @binding(6) var<storage, read> nb: array<u32>;
@group(0) @binding(7) var<storage, read> et: array<vec4f>;
@group(0) @binding(8) var<storage, read_write> co: array<vec4f>;
fn ramp(x: f32, a: f32, b: f32) -> f32 { let t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
fn wv(i: u32) -> vec3f { return vec3f(wind[3u * i], wind[3u * i + 1u], wind[3u * i + 2u]); }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let wi = wv(i);
  var a = 0.0;
  var dv = 0.0;
  var cin = array<f32, 6>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  for (var k = 0u; k < 6u; k++) {
    let e = et[6u * i + k];
    let f = 0.5 * dot(wi + wv(nb[6u * i + k]), e.xyz);
    dv += f;
    let uL = f * U.a.x;
    if (uL > 0.0) { a += uL; } else { cin[k] -= uL; }
    a += e.w; cin[k] += e.w;
  }
  let g = s0[i];
  let h = s1[i];
  let T = tb[i].x;
  let land = g.x > 0.5;
  let Ts = select(max(-1.8, T + g.z), T - U.b.w * g.y, land);
  let ws = U.d.z * exp(U.d.w * (clamp(Ts, -45.0, 45.0) - 15.0));
  let div = dv / g.w / 6.371e6;
  let sub = tb[i].z;
  let lam = U.a.z * (0.25 + 0.75 * exp(-max(0.0, div) / 3e-6 - U.e.y * sub)) * ramp(tb[i].w / ws, U.e.z, U.e.w) + U.a.w * max(0.0, dot(wi, h.xyz));
  let r0 = U.c.y + U.e.x * sub;
  var e = U.b.x * (length(wi) + 3.0) / 10.0;
  if (land) {
    let b = tb[i].y;
    var bc = b;
    if (U.c.w > 0.5) { let v = s2[i]; bc = (U.d.x * max(0.0, 1.0 - v.x - v.y) + v.y) * b + U.d.y * v.x * sqrt(b); }
    let el = e * U.b.y * bc * ramp(Ts, -5.0, 5.0);
    e = select(el, el + h.w * (e * (1.0 - (1.0 - U.b.z) * ramp(-Ts, 0.0, 4.5)) - el), h.w > 0.0);
  } else if (T < -1.8) { e *= 0.15; }
  let A = g.w * U.a.y;
  a += A * (lam + e);
  co[4u * i] = vec4f(cin[0], cin[1], cin[2], cin[3]);
  co[4u * i + 1u] = vec4f(cin[4], cin[5], a, A * e * ws);
  let cvf = ramp(Ts, U.f.x, U.f.y);
  co[4u * i + 2u] = vec4f(cvf * A * ws / 60.0 * exp(-U.c.x * r0), U.c.x / ws, lam, ws);
  co[4u * i + 3u] = vec4f(A, A * U.c.z, r0, cvf);
}`;

// The rain from the balance: P = min(P_max, λW + (W_s/60) e^{a(W/W_s − r₀)}) mm/day, r₀ each cell's.
const RAIN = /* wgsl */`
struct Mu { n: u32, ca: f32, cr: f32, pmax: f32 };
@group(0) @binding(0) var<uniform> U: Mu;
@group(0) @binding(1) var<storage, read> co: array<vec4f>;
@group(0) @binding(2) var<storage, read> win: array<f32>;
@group(0) @binding(3) var<storage, read_write> pout: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let c2 = co[4u * i + 2u];
  let c3 = co[4u * i + 3u];
  let w = win[i];
  pout[i] = min(U.pmax, c2.z * w + c3.w * c2.w / 60.0 * exp(min(40.0, U.ca * (w / c2.w - c3.z))));
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
    // Packing here (`solveFrom`): each edge's tangent × length and κℓ/d, the inputs, the rain.
    this.grid = grid;
    const et = new Float32Array(24 * n);
    for (let i = 0; i < n; i++) {
      const o = grid.nbrOff[i], d = grid.nbrOff[i + 1] - o;
      for (let k = 0; k < d; k++) {
        const t = o + k, q = 4 * (6 * i + k), l = grid.ell[t];
        et[q] = grid.tan[3 * t] * l; et[q + 1] = grid.tan[3 * t + 1] * l; et[q + 2] = grid.tan[3 * t + 2] * l; et[q + 3] = l / grid.dist[t];
      }
    }
    this.et = et;
    this.ET = storage(device, et.byteLength);
    this.WIND = storage(device, 12 * n); this.TB = storage(device, 16 * n);
    this.S0 = storage(device, 16 * n); this.S1 = storage(device, 16 * n); this.S2 = storage(device, 8 * n);
    this.P = storage(device, 4 * n);
    this.Pu = uniform(device, new Float32Array(28));
    this.KP = kernel(device, PACK, 'moisture-pack'); this.KR = kernel(device, RAIN, 'moisture-rain');
    this.pack = this.KP.bind({ U: this.Pu, wind: this.WIND, tb: this.TB, s0: this.S0, s1: this.S1, s2: this.S2, nb: this.nb, et: this.ET, co: this.co });
    this.rain = this.KR.bind({ U: this.U, co: this.co, win: this.A, pout: this.P });
    this.readWP = device.createBuffer({ size: 8 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.s0 = new Float32Array(4 * n); this.s1 = new Float32Array(4 * n); this.s2 = new Float32Array(2 * n); this.tb = new Float32Array(4 * n);
    this.kappa = NaN;
  }

  /**
   * The geography the coefficients read, for a cycle (`solveFrom` takes it from here): land,
   * elevation, the gyres' anomaly, area; the slope and the lakes; the plants' cover; and the
   * constants. c: the Climate; C: its parameters; V: the vegetation's.
   */
  setGeography(c, C, V) {
    const n = this.n, s0 = this.s0, s1 = this.s1, s2 = this.s2, g = this.grid, sst = c.ocean ? c.ocean.fine.sst : null, cv = c.cover, q = this.device.queue;
    for (let i = 0; i < n; i++) {
      s0[4 * i] = c.landMask[i]; s0[4 * i + 1] = c.elevPos[i]; s0[4 * i + 2] = sst ? sst[i] : 0; s0[4 * i + 3] = g.area[i];
      s1[4 * i] = c.upz[3 * i]; s1[4 * i + 1] = c.upz[3 * i + 1]; s1[4 * i + 2] = c.upz[3 * i + 2]; s1[4 * i + 3] = c.lakeWet[i];
      if (cv) { s2[2 * i] = cv.ft[i]; s2[2 * i + 1] = cv.fg[i]; }
    }
    q.writeBuffer(this.S0, 0, s0); q.writeBuffer(this.S1, 0, s1); if (cv) q.writeBuffer(this.S2, 0, s2);
    // κℓ/d in km²/day per edge (the eddy mixing), rewritten when κ moves.
    if (C.KAPPA_W !== this.kappa) {
      const et = Float32Array.from(this.et);
      for (let k = 3; k < et.length; k += 4) et[k] *= C.KAPPA_W;
      q.writeBuffer(this.ET, 0, et); this.kappa = C.KAPPA_W;
    }
    const u = new ArrayBuffer(112), ui = new Uint32Array(u), f = new Float32Array(u);
    ui[0] = n;
    f.set([6371 * 86.4, 6371 * 6371, C.RAIN_BG, C.RAIN_ORO, C.EVAP, cv ? C.LAND_EVAP_COVER : C.LAND_EVAP, C.LAKE_ICE, C.LAPSE,
      C.CONV_A, C.CONV_R0, C.RAIN_MAX, cv ? 1 : 0, V.E_BARE, V.E_TREE, 25, 0.065, C.SUB_R0, C.SUB_BG, C.BG_R1, C.BG_R2, C.CONV_T0, C.CONV_T1, 0, 0], 4);
    q.writeBuffer(this.Pu, 0, u);
  }

  /**
   * The balance at one point of the year from its inputs: the carrying wind (3n, m/s), the
   * sea-level temperature (n) and β's factor (n, land's evaporative efficiency with the live
   * ground's ratio), the descent (n, 0–1: Climate.descent) and the last solve's W (the background
   * rain's humidity); `iters` Jacobi passes from W (overwritten), the rain into P (mm/day).
   */
  async solveFrom(wind, T, beta, W, P, iters, ca, cr, pmax, sub = null, Wlast = null) {
    const dev = this.device, n = this.n, tb = this.tb;
    for (let i = 0; i < n; i++) { tb[4 * i] = T[i]; tb[4 * i + 1] = beta[i]; tb[4 * i + 2] = sub ? sub[i] : 0; tb[4 * i + 3] = Wlast ? Wlast[i] : 0; }
    const ub = new ArrayBuffer(16);
    new Uint32Array(ub)[0] = n; new Float32Array(ub).set([ca, cr, pmax], 1);
    dev.queue.writeBuffer(this.U, 0, ub);
    dev.queue.writeBuffer(this.WIND, 0, wind instanceof Float32Array ? wind : Float32Array.from(wind));
    dev.queue.writeBuffer(this.TB, 0, tb);
    dev.queue.writeBuffer(this.A, 0, W instanceof Float32Array ? W : Float32Array.from(W));
    const enc = dev.createCommandEncoder(), pass = enc.beginComputePass(), x = Math.ceil(n / 64);
    pass.setPipeline(this.KP.pipeline); pass.setBindGroup(0, this.pack); pass.dispatchWorkgroups(x);
    pass.setPipeline(this.K.pipeline);
    const even = iters + (iters & 1);
    for (let k = 0; k < even; k++) { pass.setBindGroup(0, k & 1 ? this.ba : this.ab); pass.dispatchWorkgroups(x); }
    pass.setPipeline(this.KR.pipeline); pass.setBindGroup(0, this.rain); pass.dispatchWorkgroups(x);
    pass.end();
    enc.copyBufferToBuffer(this.A, 0, this.readWP, 0, 4 * n);
    enc.copyBufferToBuffer(this.P, 0, this.readWP, 4 * n, 4 * n);
    dev.queue.submit([enc.finish()]);
    await this.readWP.mapAsync(GPUMapMode.READ);
    const r = new Float32Array(this.readWP.getMappedRange());
    W.set(r.subarray(0, n)); P.set(r.subarray(n, 2 * n));
    this.readWP.unmap();
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
