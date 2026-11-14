// The ice sheets stepped on the GPU (the engine's worker has its own device).
// The physics is src/engine/ice.js's, which stays the headless reference
// (tests/gpu-node.test.mjs checks the two agree): shallow ice with Glen's law,
// explicit, the step set by the stability limit in the worst cell; the
// degree-day mass balance from the climate's harmonics; calving afloat; the
// bed relaxing toward the load. Each step is four dispatches (diffusivity
// with an atomic maximum, the step size by one thread, fluxes, the update),
// so the step size never leaves the GPU. The state comes back every ~100 ms
// to `Ice`'s arrays, from which the crust takes its load and the sea its water.
import { kernel, storage, uniform } from './device.js';
import { ICE } from '../engine/ice.js';

const R_M = 6.371e6;

const HEAD = /* wgsl */`
struct Iu { n: u32, gamma: f32, amin: f32, maxStep: f32,
            rhoI: f32, rhoW: f32, rhoM: f32, tauBed: f32 };
struct Ctl { dmax: atomic<u32>, remaining: f32, done: f32, dt: f32 };
struct CtlR { dmax: u32, remaining: f32, done: f32, dt: f32 };
@group(0) @binding(0) var<uniform> U: Iu;
`;
// Per cell: six neighbours (a pentagon's sixth is itself), and per slot (ℓ/d, ∇ weights).
const DIFF = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> nb: array<u32>;
@group(0) @binding(2) var<storage, read> ew: array<vec4f>;
@group(0) @binding(3) var<storage, read> ba: array<vec2f>;   // the bed above sea level (m), the cell's area (m²)
@group(0) @binding(4) var<storage, read> H: array<f32>;
@group(0) @binding(5) var<storage, read_write> D: array<f32>;
@group(0) @binding(6) var<storage, read_write> vel: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> ctl: Ctl;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let h = H[i];
  if (!(h > 0.0)) { D[i] = 0.0; vel[i] = vec4f(0.0); return; }
  let si = ba[i].x + h;
  var g = vec3f(0.0);
  for (var k = 0u; k < 6u; k++) {
    let j = nb[6u * i + k];
    let e = ew[6u * i + k];
    g += (ba[j].x + max(H[j], 0.0) - si) * e.yzw;
  }
  g = g / ${R_M.toExponential(6)};
  let g2 = dot(g, g);
  let d = U.gamma * h * h * h * h * h * g2;
  D[i] = d;
  let gm = sqrt(g2);
  vel[i] = select(vec4f(0.0), vec4f(-g / gm, d * gm / h), gm > 0.0);
  atomicMax(&ctl.dmax, bitcast<u32>(d));
}`;
const DT = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read_write> ctl: Ctl;
@compute @workgroup_size(1)
fn main() {
  let dmax = bitcast<f32>(atomicLoad(&ctl.dmax));
  var dt = min(ctl.remaining, U.maxStep);
  if (dmax > 0.0) { dt = min(dt, 0.12 * U.amin / dmax); }
  dt = max(dt, 0.0);
  ctl.dt = dt;
  ctl.remaining = ctl.remaining - dt;
  ctl.done = ctl.done + dt;
  atomicStore(&ctl.dmax, 0u);
}`;
const FLUX = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> nb: array<u32>;
@group(0) @binding(2) var<storage, read> ew: array<vec4f>;
@group(0) @binding(3) var<storage, read> ba: array<vec2f>;   // the bed above sea level (m), the cell's area (m²)
@group(0) @binding(4) var<storage, read> H: array<f32>;
@group(0) @binding(5) var<storage, read> D: array<f32>;
@group(0) @binding(6) var<storage, read> M: array<f32>;
@group(0) @binding(7) var<storage, read> ctl: CtlR;
@group(0) @binding(8) var<storage, read_write> dH: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let si = ba[i].x + max(H[i], 0.0);
  var q = 0.0;
  for (var k = 0u; k < 6u; k++) {
    let j = nb[6u * i + k];
    let De = 0.5 * (D[i] + D[j]);
    if (De > 0.0) { q += De * ew[6u * i + k].x * (ba[j].x + max(H[j], 0.0) - si); }
  }
  dH[i] = ctl.dt * (q / ba[i].y + M[i]);
}`;
const APPLY = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> ba: array<vec2f>;   // the bed above sea level (m), the cell's area (m²)
@group(0) @binding(2) var<storage, read> dH: array<f32>;
@group(0) @binding(3) var<storage, read> ctl: CtlR;
@group(0) @binding(4) var<storage, read_write> H: array<f32>;
@group(0) @binding(5) var<storage, read_write> w: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  var h = H[i] + dH[i];
  let b = ba[i].x;
  // Ice afloat calves.
  if (h > 0.0 && b < 0.0 && h * U.rhoI < -b * U.rhoW) { h = 0.0; }
  h = select(0.0, h, h > 0.5);
  H[i] = h;
  // The bed sinks toward the load.
  w[i] = w[i] + (-U.rhoI / U.rhoM * h - w[i]) * ctl.dt / U.tauBed;
}`;
// Snow where the month is below freezing at the ice's surface, melt by positive degree days.
const MB = HEAD + /* wgsl */`
struct Mu { ph: array<vec4f, 12>, lapse: f32, sigma: f32, ddfSnow: f32, ddfIce: f32 };
@group(0) @binding(1) var<uniform> Q: Mu;
@group(0) @binding(2) var<storage, read> clim: array<vec4f>;
@group(0) @binding(3) var<storage, read> ba: array<vec2f>;   // the bed above sea level (m), the cell's area (m²)
@group(0) @binding(4) var<storage, read> H: array<f32>;
@group(0) @binding(5) var<storage, read_write> M: array<f32>;
fn phiN(x: f32) -> f32 { return exp(-0.5 * x * x) * 0.3989422804; }
fn PhiN(x: f32) -> f32 {
  let t = 1.0 / (1.0 + 0.2316419 * abs(x));
  let d = phiN(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return select(d, 1.0 - d, x >= 0.0);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let b = ba[i].x;
  let h = H[i];
  if (!(b > 0.0 || h * U.rhoI > -b * U.rhoW)) { M[i] = 0.0; return; }
  let sKm = max(0.0, b + h) / 1000.0;
  let T0 = clim[3u * i];
  let T1 = clim[3u * i + 1u];
  let P1 = clim[3u * i + 2u];
  var acc = 0.0;
  var pdd = 0.0;
  for (var m = 0u; m < 12u; m++) {
    let c = Q.ph[m];
    let T = T0.x + T0.y * c.x - T0.z * c.y + T0.w * c.z - T1.x * c.w - Q.lapse * sKm;
    let P = max(0.0, T1.y + T1.z * c.x - T1.w * c.y + P1.x * c.z - P1.y * c.w) * 30.44 / 1000.0;
    let snow = clamp((2.0 - T) / 4.0, 0.0, 1.0);
    acc += P * snow;
    pdd += 30.44 * (Q.sigma * phiN(T / Q.sigma) + T * PhiN(T / Q.sigma));
  }
  let snowMelt = min(acc, pdd * Q.ddfSnow);
  let left = pdd - snowMelt / Q.ddfSnow;
  M[i] = (acc - snowMelt - left * Q.ddfIce) * (1000.0 / U.rhoI);
}`;

const wg = n => Math.ceil(n / 64);
const MONTH_MID = [15.5, 45, 74.5, 105, 135.5, 166, 196.5, 227.5, 258, 288.5, 319, 349.5];

export class GpuIce {
  /** Steps `ice` (src/engine/ice.js) on `device`; its arrays are the state's copy on the CPU. */
  constructor(device, ice) {
    this.device = device; this.ice = ice;
    const g = ice.grid, n = this.n = g.n;
    const nb = new Uint32Array(6 * n), ew = new Float32Array(24 * n);
    for (let i = 0; i < n; i++) {
      const o = g.nbrOff[i], d = g.nbrOff[i + 1] - o;
      for (let k = 0; k < 6; k++) {
        nb[6 * i + k] = k < d ? g.nbr[o + k] : i;
        if (k < d) { const t = o + k, e = 24 * i + 4 * k; ew[e] = g.ell[t] / g.dist[t]; ew[e + 1] = g.gw[3 * t]; ew[e + 2] = g.gw[3 * t + 1]; ew[e + 3] = g.gw[3 * t + 2]; }
      }
    }
    const B = (size, data) => storage(device, size, data);
    this.nb = B(nb.byteLength, nb); this.ew = B(ew.byteLength, ew);
    this.ba = B(8 * n); this.H = B(4 * n, Float32Array.from(ice.H)); this.w = B(4 * n, Float32Array.from(ice.w));
    this.M = B(4 * n); this.D = B(4 * n); this.dH = B(4 * n); this.vel = B(16 * n);
    this.clim = B(48 * n);
    this.ctl = B(16);
    let amin = Infinity;
    for (let i = 0; i < n; i++) amin = Math.min(amin, ice.areaM[i]);
    const ub = new ArrayBuffer(32), uu = new Uint32Array(ub), uf = new Float32Array(ub);
    uu[0] = n; uf.set([ice.Gamma, amin, ICE.MAX_STEP, ICE.RHO_I, ICE.RHO_W, ICE.RHO_M, ICE.TAU_BED], 1);
    this.U = uniform(device, uu);
    const mq = new Float32Array(52);
    MONTH_MID.forEach((mid, m) => {
      const tau = ((mid - 78.5) / 365.2422 + 1) % 1, c = Math.cos(2 * Math.PI * tau), s = Math.sin(2 * Math.PI * tau);
      mq.set([c, s, c * c - s * s, 2 * s * c], 4 * m);
    });
    mq.set([ICE.LAPSE, ICE.SIGMA, ICE.DDF_SNOW, ICE.DDF_ICE], 48);
    this.Q = uniform(device, mq);
    const K = { diff: kernel(device, DIFF, 'ice-diff'), dt: kernel(device, DT, 'ice-dt'), flux: kernel(device, FLUX, 'ice-flux'), apply: kernel(device, APPLY, 'ice-apply'), mb: kernel(device, MB, 'ice-mb') };
    const U = this.U, x = wg(n);
    this.stepList = [
      [K.diff, K.diff.bind({ U, nb: this.nb, ew: this.ew, ba: this.ba, H: this.H, D: this.D, vel: this.vel, ctl: this.ctl }), x],
      [K.dt, K.dt.bind({ U, ctl: this.ctl }), 1],
      [K.flux, K.flux.bind({ U, nb: this.nb, ew: this.ew, ba: this.ba, H: this.H, D: this.D, M: this.M, ctl: this.ctl, dH: this.dH }), x],
      [K.apply, K.apply.bind({ U, ba: this.ba, dH: this.dH, ctl: this.ctl, H: this.H, w: this.w }), x],
    ];
    this.mbList = [[K.mb, K.mb.bind({ U, Q: this.Q, clim: this.clim, ba: this.ba, H: this.H, M: this.M }), x]];
    this.readBuf = device.createBuffer({ size: 28 * n + 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.reading = false; this.lastRead = -Infinity; this.lastBed = -Infinity;
    this.dt = ICE.MAX_STEP;          // the last step taken (from the last read), to plan how many to encode
    this.mbVersion = -1;
    this.bedArr = new Float32Array(2 * n); this.climArr = new Float32Array(12 * n);
  }

  run(list, times = 1) {
    const enc = this.device.createCommandEncoder(), pass = enc.beginComputePass();
    for (let r = 0; r < times; r++) for (const [K, bg, x] of list) { pass.setPipeline(K.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(x); }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** Advance by `years`, at most `maxSteps` steps (past them the ice holds: it lags the climate, not the clock). */
  advance(years, maxSteps = 48) {
    const ice = this.ice, tec = ice.tec, c = ice.climate, n = this.n, now = performance.now();
    // The bed, when the crust or the sea has moved (or every 100 ms: the load moves the crust).
    if (now - this.lastBed > 100) {
      this.lastBed = now;
      for (let i = 0; i < n; i++) { this.bedArr[2 * i] = (tec.elev[i] - tec.seaLevel) * 1000; this.bedArr[2 * i + 1] = ice.areaM[i]; }
      this.device.queue.writeBuffer(this.ba, 0, this.bedArr);
    }
    if (c.version !== this.mbVersion) {
      this.mbVersion = c.version;
      const a = this.climArr, T = c.Tf, P = c.Pf;
      for (let i = 0; i < n; i++) {
        const o = 12 * i;
        a[o] = T[0][i]; a[o + 1] = T[1][i]; a[o + 2] = T[2][i]; a[o + 3] = T[3][i];
        a[o + 4] = T[4][i]; a[o + 5] = P[0][i]; a[o + 6] = P[1][i]; a[o + 7] = P[2][i];
        a[o + 8] = P[3][i]; a[o + 9] = P[4][i];
      }
      this.device.queue.writeBuffer(this.clim, 0, a);
      this.run(this.mbList);
    }
    if (years > 0) {
      const steps = Math.max(1, Math.min(maxSteps, Math.ceil(years / Math.max(0.01, this.dt)) + 1));
      this.device.queue.writeBuffer(this.ctl, 0, new Float32Array([0, years, 0, 0]));
      this.run(this.stepList, steps);
    }
    if (!this.reading && now - this.lastRead > 100) this.read();
  }

  /** Copy the state back to `Ice`, and push its load and water to the crust and the sea. */
  async read() {
    this.reading = true; this.lastRead = performance.now();
    const n = this.n, enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.H, 0, this.readBuf, 0, 4 * n);
    enc.copyBufferToBuffer(this.w, 0, this.readBuf, 4 * n, 4 * n);
    enc.copyBufferToBuffer(this.vel, 0, this.readBuf, 8 * n, 16 * n);
    enc.copyBufferToBuffer(this.M, 0, this.readBuf, 24 * n, 4 * n);
    enc.copyBufferToBuffer(this.ctl, 0, this.readBuf, 28 * n, 16);
    this.device.queue.submit([enc.finish()]);
    try {
      await this.readBuf.mapAsync(GPUMapMode.READ);
      const a = new Float32Array(this.readBuf.getMappedRange());
      const ice = this.ice;
      ice.H.set(a.subarray(0, n)); ice.w.set(a.subarray(n, 2 * n)); ice.vel.set(a.subarray(2 * n, 6 * n)); ice.M.set(a.subarray(6 * n, 7 * n));
      const dt = a[7 * n + 3];
      if (dt > 0) this.dt = dt;
      this.readBuf.unmap();
      ice.publish();
    } finally { this.reading = false; }
  }
}
