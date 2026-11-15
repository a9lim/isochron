// The ground on the GPU (src/engine/soil.js is the reference, and its header
// the physics): soil water, the snowpack and the ground's heat, one thread
// per cell stepping k months in a dispatch from the year's forcing (12 months
// of T, P and PET per cell) and an anomaly per cell for each month of the
// dispatch (a temperature offset, which moves PET by its slope, and a rain
// factor). Each month's totals and end state are recorded by calendar month,
// so the last twelve months stepped are always at hand; a second kernel sums
// them into the year's aggregates for reading back. Cells don't talk to each
// other, so a dispatch of many months costs one launch.
import { kernel, storage, uniform } from './device.js';
import { SOIL } from '../engine/soil.js';

const KMAX = 12;   // anomaly slots: month j of a dispatch reads slot j mod 12

// a: FC, KD, SIGMA, DDF; b: WMAX, COVER, TAU, RHO_SNOW·DSTAR (mm of SWE insulating as the ground's metre);
// c: FROZEN, PET_K, PET_T0, PERMA_W.
const HEAD = /* wgsl */`
struct Su { n: u32, m0: u32, k: u32, iters: u32, a: vec4f, b: vec4f, c: vec4f };
@group(0) @binding(0) var<uniform> U: Su;
`;

const STEP = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> forc: array<vec4f>;     // T, P, PET, - (12 per cell)
@group(0) @binding(2) var<storage, read> anom: array<vec2f>;     // dT, rain factor (slot j: j n + i)
@group(0) @binding(3) var<storage, read> cap: array<f32>;        // S_max, mm (≤ 0: sea)
@group(0) @binding(4) var<storage, read_write> state: array<vec4f>;   // S, SWE, Tg, -
@group(0) @binding(5) var<storage, read_write> recA: array<vec4f>;    // quick, base, E, S (12 per cell)
@group(0) @binding(6) var<storage, read_write> recB: array<vec2f>;    // SWE, Tg

fn PhiN(x: f32) -> f32 {
  let t = 1.0 / (1.0 + 0.2316419 * abs(x));
  let d = 0.3989422804 * exp(-0.5 * x * x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return select(d, 1.0 - d, x >= 0.0);
}

// The root of a w + c w⁴ = d in [0, hi], by Newton from the right.
fn root4(a: f32, c: f32, d: f32, hi: f32) -> f32 {
  if (d <= 0.0) { return 0.0; }
  var w = min(hi, d / a);
  if (c > 0.0) { w = min(w, sqrt(sqrt(d / c))); }
  for (var k = 0u; k < U.iters; k++) {
    let w3 = w * w * w;
    w -= (a * w + c * w3 * w - d) / (a + 4.0 * c * w3);
  }
  return max(0.0, w);
}

struct Mo { quick: f32, base: f32, E: f32, S: f32, W: f32, G: f32 };
fn month(S0: f32, W0: f32, G0: f32, smax: f32, T: f32, p: f32, pet: f32) -> Mo {
  let FC = U.a.x;
  let sig = U.a.z;
  let x = T / sig;
  let below = PhiN(-x);
  let snow = p * below;
  let rain = p - snow;
  let pdd = 30.44 * (sig * 0.3989422804 * exp(-0.5 * x * x) + T * (1.0 - below));
  var W = W0 + snow;
  let melt = min(W, U.a.w * pdd);
  W -= melt;
  let ice = max(0.0, W - U.b.x);
  W -= ice;
  let L = rain + melt;
  let Wm = 0.5 * (W0 + W);
  let ins = 1.0 + Wm / U.b.w;
  let decay = exp(-1.0 / (U.b.z * ins));
  let G = T + (G0 - T) * decay;
  let Gm = 0.5 * (G0 + G);
  let Ts = Gm + (T - Gm) / ins;
  let fz = U.c.x * clamp(-Ts, 0.0, 1.0);
  let thaw = 1.0 - clamp(-Gm, 0.0, 1.0);
  let Li = L * (1.0 - fz);
  let ep = pet * (1.0 - Wm / (Wm + U.b.y));
  let kd = U.a.y * smax * thaw;
  let c = Li + kd;
  let d1 = S0 + Li - ep;
  var w: f32;
  if (smax * FC + c * FC * FC * FC * FC <= d1) { w = root4(smax, c, d1, 1.0); }
  else { w = root4(smax + ep / FC, c, S0 + Li, FC); }
  let w4 = w * w * w * w;
  var quick = ice + L * fz + Li * w4;
  var base = kd * w4;
  var E = ep * min(1.0, w / FC);
  var S = S0 + Li - Li * w4 - base - E;
  if (S < 0.0) {
    E += S; S = 0.0;
    if (E < 0.0) { base += E; E = 0.0; }
  } else if (S > smax) { quick += S - smax; S = smax; }
  return Mo(quick, base, E, S, W, G);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let smax = cap[i];
  if (!(smax > 0.0)) { return; }
  var st = state[i];
  for (var j = 0u; j < U.k; j++) {
    let m = (U.m0 + j) % 12u;
    let f = forc[12u * i + m];
    let an = anom[(j % ${KMAX}u) * U.n + i];
    let t = f.x + an.x;
    let pet = max(0.0, f.z + U.c.y * (max(0.0, t + U.c.z) - max(0.0, f.x + U.c.z)));
    let r = month(st.x, st.y, st.z, smax, t, f.y * an.y, pet);
    st = vec4f(r.S, r.W, r.G, 0.0);
    recA[12u * i + m] = vec4f(r.quick, r.base, r.E, r.S);
    recB[12u * i + m] = vec2f(r.W, r.G);
  }
  state[i] = st;
}`;

const YEAR = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> cap: array<f32>;
@group(0) @binding(2) var<storage, read> recA: array<vec4f>;
@group(0) @binding(3) var<storage, read> recB: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> agg: array<vec4f>;    // runoff, E (mm a year), mean S/S_max, mean Tg
@group(0) @binding(5) var<storage, read_write> agg2: array<vec2f>;   // mean β, permafrost
@group(0) @binding(6) var<storage, read_write> rm: array<f32>;       // runoff by month, mm (12 per cell)
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let smax = cap[i];
  if (!(smax > 0.0)) {
    agg[i] = vec4f(0.0); agg2[i] = vec2f(0.0);
    for (var m = 0u; m < 12u; m++) { rm[12u * i + m] = 0.0; }
    return;
  }
  var r = 0.0; var e = 0.0; var w = 0.0; var g = 0.0; var be = 0.0;
  for (var m = 0u; m < 12u; m++) {
    let a = recA[12u * i + m];
    let b = recB[12u * i + m];
    let q = a.x + a.y;
    rm[12u * i + m] = q;
    let wm = a.w / smax;
    r += q; e += a.z; w += wm; g += b.y;
    be += min(1.0, wm / U.a.x) * (1.0 - b.x / (b.x + U.b.y));
  }
  g = g / 12.0;
  agg[i] = vec4f(r, e, w / 12.0, g);
  agg2[i] = vec2f(be / 12.0, 1.0 / (1.0 + exp(min(40.0, g / U.c.w))));
}`;

const wg = n => Math.ceil(n / 64);

export class GpuSoil {
  /** `n` cells on `device`; `Smax` (mm) a number or an array, ≤ 0 where there's no land. */
  constructor(device, n, Smax = SOIL.SMAX) {
    this.device = device; this.n = n;
    const B = size => storage(device, size);
    this.forc = B(192 * n); this.anom = B(8 * KMAX * n); this.cap = B(4 * n); this.state = B(16 * n);
    this.recA = B(192 * n); this.recB = B(96 * n);
    this.agg = B(16 * n); this.agg2 = B(8 * n); this.rm = B(48 * n);
    this.ub = new ArrayBuffer(64);
    this.U = uniform(device, new Uint8Array(this.ub));
    this.params();
    const step = kernel(device, STEP, 'soil-step'), year = kernel(device, YEAR, 'soil-year');
    this.K = {
      step: [step.pipeline, step.bind({ U: this.U, forc: this.forc, anom: this.anom, cap: this.cap, state: this.state, recA: this.recA, recB: this.recB })],
      year: [year.pipeline, year.bind({ U: this.U, cap: this.cap, recA: this.recA, recB: this.recB, agg: this.agg, agg2: this.agg2, rm: this.rm })],
    };
    this.readBuf = device.createBuffer({ size: 88 * n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.reading = false;
    this.setAnomaly(null);
    this.setCapacity(Smax);
    const S = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) S[4 * i] = 0.5 * Math.max(0, this.capArr[i]);
    device.queue.writeBuffer(this.state, 0, S);
  }

  /** Re-read SOIL's constants (call after changing them). */
  params() {
    const C = SOIL, u = new Uint32Array(this.ub), f = new Float32Array(this.ub);
    u[0] = this.n; u[3] = C.NEWTON;
    f.set([C.FC, C.KD, C.SIGMA, C.DDF, C.WMAX, C.COVER, C.TAU, C.RHO_SNOW * C.DSTAR, C.FROZEN, C.PET_K, C.PET_T0, C.PERMA_W], 4);
    this.device.queue.writeBuffer(this.U, 0, this.ub);
  }

  setCapacity(Smax) {
    const a = this.capArr || (this.capArr = new Float32Array(this.n));
    if (typeof Smax === 'number') a.fill(Smax); else a.set(Smax);
    this.device.queue.writeBuffer(this.cap, 0, a);
  }

  /** The year's forcing: T (°C), P and PET (mm a month), 12 per cell (12 i + m). */
  setForcing(T, P, PET) {
    const n = this.n, f = this.forcArr || (this.forcArr = new Float32Array(48 * n));
    for (let k = 0; k < 12 * n; k++) { f[4 * k] = T[k]; f[4 * k + 1] = P[k]; f[4 * k + 2] = PET[k]; }
    this.device.queue.writeBuffer(this.forc, 0, f);
  }

  /**
   * Anomalies for the first k months (k ≤ 12) of each dispatch until set again: dT (K) and
   * rf (a factor on the rain), each k·n, month j of the dispatch at j n + i (a dispatch
   * past 12 months reuses slot j mod 12). null clears them (0 and 1).
   */
  setAnomaly(dT, rf = null, k = 1) {
    const n = this.n, a = new Float32Array(2 * KMAX * n);
    for (let j = 0; j < KMAX * n; j++) a[2 * j + 1] = 1;
    if (dT || rf) for (let j = 0; j < Math.min(k, KMAX) * n; j++) { if (dT) a[2 * j] = dT[j]; if (rf) a[2 * j + 1] = rf[j]; }
    this.device.queue.writeBuffer(this.anom, 0, a);
  }

  /** The state (mm, mm, °C), n each: from the CPU's periodic year, say (Soil.stateAt(m)). */
  setState(S, SWE, Tg) {
    const n = this.n, a = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) { a[4 * i] = S[i]; a[4 * i + 1] = SWE[i]; a[4 * i + 2] = Tg[i]; }
    this.device.queue.writeBuffer(this.state, 0, a);
  }

  /** Step k months from calendar month m0 (0 = January), in one dispatch. */
  step(m0, k = 1) {
    const u = new Uint32Array(this.ub);
    u[1] = ((m0 % 12) + 12) % 12; u[2] = k;
    this.device.queue.writeBuffer(this.U, 0, this.ub);
    const enc = this.device.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(this.K.step[0]); pass.setBindGroup(0, this.K.step[1]); pass.dispatchWorkgroups(wg(this.n));
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /**
   * The last twelve months' aggregates, read back: runoff and evaporation (mm a year), wet
   * (mean S/S_max), beta (mean evaporative efficiency), tg (the ground's mean, °C) and
   * permafrost (soft), n each; with `monthly`, runoffM (mm, 12 per cell); with `state`,
   * S, SWE and Tg. One read at a time.
   */
  async read({ monthly = false, state = false } = {}) {
    if (this.reading) throw new Error('GpuSoil: a read is in flight');
    this.reading = true;
    const n = this.n, dev = this.device, enc = dev.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(this.K.year[0]); pass.setBindGroup(0, this.K.year[1]); pass.dispatchWorkgroups(wg(n));
    pass.end();
    enc.copyBufferToBuffer(this.agg, 0, this.readBuf, 0, 16 * n);
    enc.copyBufferToBuffer(this.agg2, 0, this.readBuf, 16 * n, 8 * n);
    if (monthly) enc.copyBufferToBuffer(this.rm, 0, this.readBuf, 24 * n, 48 * n);
    if (state) enc.copyBufferToBuffer(this.state, 0, this.readBuf, 72 * n, 16 * n);
    dev.queue.submit([enc.finish()]);
    try {
      await this.readBuf.mapAsync(GPUMapMode.READ);
      const a = new Float32Array(this.readBuf.getMappedRange());
      const out = { runoff: new Float32Array(n), evap: new Float32Array(n), wet: new Float32Array(n), tg: new Float32Array(n), beta: new Float32Array(n), permafrost: new Float32Array(n) };
      for (let i = 0; i < n; i++) {
        out.runoff[i] = a[4 * i]; out.evap[i] = a[4 * i + 1]; out.wet[i] = a[4 * i + 2]; out.tg[i] = a[4 * i + 3];
        out.beta[i] = a[4 * n + 2 * i]; out.permafrost[i] = a[4 * n + 2 * i + 1];
      }
      if (monthly) out.runoffM = a.slice(6 * n, 18 * n);
      if (state) {
        out.S = new Float32Array(n); out.SWE = new Float32Array(n); out.Tg = new Float32Array(n);
        for (let i = 0; i < n; i++) { const o = 18 * n + 4 * i; out.S[i] = a[o]; out.SWE[i] = a[o + 1]; out.Tg[i] = a[o + 2]; }
      }
      this.readBuf.unmap();
      return out;
    } finally { this.reading = false; }
  }
}
