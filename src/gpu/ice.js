// The ice sheets stepped on the GPU (the engine's worker has its own device).
// The physics is src/engine/ice.js's, which stays the headless reference
// (tests/gpu-ice.test.mjs checks the two agree): shallow ice with Glen's law
// plus Weertman sliding where the bed is thawed (the bed's temperature by
// Robin's column with the deformation's heat), explicit, the step set by the
// stability limit in the worst cell on the two diffusivities' sum; the
// degree-day mass balance from the climate's harmonics; basal melt; the marine
// fronts (sea level over open sea, floating ice still beside grounded ice, the
// fronts ablating by the water's depth and the sea's warmth, each cell's
// calving speed per metre uploaded with the climate); erosion under sliding
// ice, its debris carried with the ice and melted out as till. Each step is
// four dispatches (diffusivity and the bed with an atomic maximum, the step
// size by one thread, fluxes of ice and debris with the fronts, the update),
// so the step size never leaves the GPU. The bed relaxes
// once an advance toward the load's response: with a GpuFlexure attached
// (src/gpu/flexure.js, on this device) the plate's w, read where the flexure
// keeps it (X[off + i].y) with no readback and re-solved by a warm V-cycle in
// the same pass, after the steps (the load as they left it); without one, local isostasy. The bed the steps read moves
// with it on the device (uploaded without the ice's load, which is added
// there), so it never waits for the crust's re-solve. The state comes back every
// ~100 ms to `Ice`'s arrays (the bed's fields and the glacial integrals every
// ~400 ms), from which the crust takes its load and the sea its water.
import { kernel, storage, uniform } from './device.js';
import { ICE, stepCoef } from '../engine/ice.js';

const R_M = 6.371e6;
const SEC = 3.15576e7;

const HEAD = /* wgsl */`
struct Iu { n: u32, gamma: f32, amin: f32, maxStep: f32,
            rhoI: f32, rhoW: f32, rhoM: f32, tauBed: f32,
            k: f32, beta: f32, thawW: f32, latent: f32,
            lapse: f32, kg: f32, el: f32, stepC: f32,
            g: f32, useFlex: u32, flexOff: u32, kappa: f32,
            uMax: f32, pad0: f32, pad1: f32, pad2: f32 };
struct Ctl { dmax: atomic<u32>, remaining: f32, done: f32, dt: f32, lim: f32, p0: f32, p1: f32, p2: f32 };
struct CtlR { dmax: u32, remaining: f32, done: f32, dt: f32, lim: f32, p0: f32, p1: f32, p2: f32 };
@group(0) @binding(0) var<uniform> U: Iu;
// The surface: grounded ice's bed plus ice, floating ice's freeboard, open sea's sea level. A cell's
// ba.w (the geothermal flux) is negative where the sea doesn't reach (a basin below sea level,
// src/engine/plates.js, solveSea): its ice floats none and its bed is its surface.
fn surf(v: vec4f, h: f32) -> f32 { return select(v.x + h, max(v.x + h, (1.0 - U.rhoI / U.rhoW) * h), v.w >= 0.0); }
`;
// Per cell: six neighbours (a pentagon's sixth is itself), and per slot (ℓ/d, ∇ weights).
// ba = (the bed above sea level (m), the cell's area (m²), the sliding coefficient, the geothermal flux (W/m²),
// negative where the sea doesn't reach);
// M = the net balance; Mx = (melt, the annual mean at sea level (°C), the net balance again for the bed's
// column (the diffusivity's kernel has no binding to spare), 0); D = (diffusivity, sliding speed, thawed share, basal melt).
const DIFF = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> nb: array<u32>;
@group(0) @binding(2) var<storage, read> ew: array<vec4f>;
@group(0) @binding(3) var<storage, read> ba: array<vec4f>;
@group(0) @binding(4) var<storage, read> H: array<f32>;
@group(0) @binding(5) var<storage, read> Mx: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> D: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> vel: array<vec4f>;
@group(0) @binding(8) var<storage, read_write> ctl: Ctl;
fn erf(x: f32) -> f32 {
  let a = abs(x);
  let t = 1.0 / (1.0 + 0.3275911 * a);
  return sign(x) * (1.0 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * exp(-a * a));
}
// Robin's effective depth (src/engine/ice.js, robinDepth).
fn robin(h: f32, a: f32) -> f32 {
  if (!(a > 1e-6)) { return h; }
  let l = sqrt(U.kappa * h / a);
  return l * 1.2533141 * erf(h / (1.4142136 * l));
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let h = H[i];
  let bi = ba[i];
  // Floating ice doesn't flow (no shelves; src/engine/ice.js).
  if (!(h > 0.0) || (bi.x < 0.0 && bi.w >= 0.0 && h * U.rhoI < -bi.x * U.rhoW)) { D[i] = vec4f(0.0); vel[i] = vec4f(0.0); return; }
  let si = surf(bi, h);
  let geo = abs(bi.w);
  var g = vec3f(0.0);
  for (var k = 0u; k < 6u; k++) {
    let j = nb[6u * i + k];
    let e = ew[6u * i + k];
    g += (surf(ba[j], max(H[j], 0.0)) - si) * e.yzw;
  }
  g = g / ${R_M.toExponential(6)};
  let g2 = dot(g, g);
  let gm = sqrt(g2);
  // The bed: its temperature (Robin's column, with the deformation's heat), the thawed share, sliding, basal melt.
  let rg = U.rhoI * U.g;
  let mx = Mx[i];
  let Ts = min(0.0, mx.y - U.lapse * max(0.0, si) / 1000.0);
  let R = robin(h, mx.z);
  let tau = rg * h * gm;
  let strain = tau * U.gamma * h * h * h * h * g2 * gm / ${SEC.toExponential(6)};
  let Tb = Ts + (geo + strain) * R / U.k;
  let Tpm = -U.beta * h;
  let thaw = 1.0 / (1.0 + exp(clamp((Tpm - Tb) / U.thawW, -60.0, 60.0)));
  let C = bi.z * thaw;
  let tp = ${ICE.P === 3 ? 'tau * tau' : `pow(tau, ${(ICE.P - 1).toFixed(3)})`};
  let ub = C * tp * tau;
  let heat = geo + strain + tau * ub / ${SEC.toExponential(6)} - U.k * max(0.0, Tpm - Ts) / R;
  let mb = thaw * max(0.0, heat) * ${SEC.toExponential(6)} / (U.rhoI * U.latent);
  var d = U.gamma * h * h * h * h * h * g2 + C * rg * h * h * tp;
  var ubc = ub;
  // The speed limit (src/engine/ice.js, U_MAX).
  let cap = U.uMax * h / max(gm, 1e-12);
  if (d > cap) { ubc = ub * cap / d; d = cap; }
  D[i] = vec4f(d, ubc, thaw, mb);
  vel[i] = select(vec4f(0.0), vec4f(-g / gm, d * gm / h), gm > 0.0);
  atomicMax(&ctl.dmax, bitcast<u32>(d));
}`;
const DT = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read_write> ctl: Ctl;
@compute @workgroup_size(1)
fn main() {
  let dmax = bitcast<f32>(atomicLoad(&ctl.dmax));
  var lim = U.maxStep;
  if (dmax > 0.0) { lim = min(lim, U.stepC * U.amin / dmax); }
  ctl.lim = lim;
  let dt = max(min(ctl.remaining, lim), 0.0);
  ctl.dt = dt;
  ctl.remaining = ctl.remaining - dt;
  ctl.done = ctl.done + dt;
  ctl.p0 = ctl.p0 + dt;          // the years stepped since the integrals were last read
  atomicStore(&ctl.dmax, 0u);
}`;
// Ice by the diffusivities, debris at the upwind cell's concentration, and the marine fronts
// (src/engine/ice.js, step): rates a year (the update takes the step), and in .w the front's loss
// (m of ice a year), negated less one where floating ice here may not stay (no flowing grounded
// ice beside it). cf: each cell's calving speed per metre of depth, read where it's open sea.
const FLUX = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> nb: array<u32>;
@group(0) @binding(2) var<storage, read> ew: array<vec4f>;
@group(0) @binding(3) var<storage, read> ba: array<vec4f>;
@group(0) @binding(4) var<storage, read> H: array<f32>;
@group(0) @binding(5) var<storage, read> D: array<vec4f>;
@group(0) @binding(6) var<storage, read> b: array<f32>;
@group(0) @binding(7) var<storage, read> cf: array<f32>;
@group(0) @binding(8) var<storage, read_write> dHb: array<vec4f>;   // (ice, debris, the bed for the update, the front)
fn frontRate(cfSea: f32, bIce: f32, hIce: f32, ellOverD: f32, aIce: f32) -> f32 {
  let d = max(0.0, -bIce);
  return cfSea * d * max(hIce, U.rhoW * d / U.rhoI) * ellOverD * sqrt(2.0 * aIce / 1.7320508);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let hi = max(H[i], 0.0);
  let bi = ba[i].x;
  let ai = ba[i].y;
  let wi = ba[i].w >= 0.0;
  let si = surf(ba[i], hi);
  let ci = select(0.0, b[i] / hi, hi > 0.0);
  let sea = !(hi > 0.0) && bi < 0.0 && wi;
  var q = 0.0;
  var qb = 0.0;
  var fr = 0.0;
  var keep = false;
  for (var k = 0u; k < 6u; k++) {
    let j = nb[6u * i + k];
    if (j == i) { continue; }
    let Dj = D[j].x;
    if (Dj > 0.0) { keep = true; }
    let hj = max(H[j], 0.0);
    let bj = ba[j].x;
    let De = 0.5 * (D[i].x + Dj);
    let c = ew[6u * i + k].x;
    let F = select(0.0, De * c * (surf(ba[j], hj) - si), De > 0.0);
    if (hi > 0.0 && !(hj > 0.0) && bj < 0.0 && ba[j].w >= 0.0) {
      q += F; qb += F * ci;
      fr += max(0.0, frontRate(cf[j], bi, hi, c, ai) + F);
    } else if (sea && hj > 0.0) {
      let O = max(0.0, F);
      q += O; qb += O * b[j] / hj;
      fr += min(O, frontRate(cf[i], bj, hj, c, ba[j].y));
    } else if (De > 0.0 && select(hi > 0.0, hj > 0.0, F > 0.0)) {
      // Ice flows only out of a cell that has it (src/engine/ice.js).
      q += F;
      qb += F * select(ci, b[j] / hj, F > 0.0);
    }
  }
  dHb[i] = vec4f(q / ai, qb / ai, select(max(bi, 0.0), bi, wi), select(-1.0 - fr / ai, fr / ai, keep));
}`;
// Mass balance and basal melt, the fronts, floating ice let go, meltwater, erosion and melt-out;
// acc = (eroded, till, melt, calved), m per cell.
const APPLY = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> Mx: array<vec4f>;
@group(0) @binding(2) var<storage, read> dHb: array<vec4f>;
@group(0) @binding(3) var<storage, read> ctl: CtlR;
@group(0) @binding(4) var<storage, read> M: array<f32>;
@group(0) @binding(5) var<storage, read> D: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> H: array<f32>;
@group(0) @binding(7) var<storage, read_write> b: array<f32>;
@group(0) @binding(8) var<storage, read_write> acc: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let dt = ctl.dt;
  let h0 = H[i];
  let hasIce = h0 > 0.0;
  let m = vec2f(M[i], Mx[i].x);
  let d = D[i];
  let mbas = select(0.0, d.w, hasIce);
  let dq = dHb[i];
  let dh = dt * dq.x;
  let keep = dq.w >= 0.0;
  let fl = dt * select(-1.0 - dq.w, dq.w, keep);
  let iceIn = h0 + max(0.0, dh);
  let abl = dt * (m.y + mbas);
  var h = h0 + dh + dt * (m.x - mbas) - fl;
  var a = acc[i];
  // The fronts' loss as realized: where the ice runs out, every loss in proportion.
  if (fl > 0.0) { a.w += select(fl * max(0.0, h + abl + fl) / (abl + fl), fl, h >= 0.0); }
  let bd = dq.z;
  // Floating ice away from flowing grounded ice calves.
  if (h > 0.0 && bd < 0.0 && h * U.rhoI < -bd * U.rhoW && !keep) { a.w += h; h = 0.0; }
  h = select(0.0, h, h > 0.5);
  H[i] = h;
  if (iceIn > 0.0) { a.z += min(abl, iceIn + dt * (m.x + m.y)); }
  let ub = select(0.0, d.y, hasIce);
  let ero = select(0.0, dt * U.kg * ${ICE.EL === 1 ? 'ub' : 'pow(ub, U.el)'}, ub > 0.0);
  let bb = max(0.0, b[i] + dt * dq.y + ero);
  let ablD = abl + fl;
  let dep = select(bb, bb * ablD / (h + ablD), h > 0.0);
  b[i] = bb - dep;
  a.x += ero;
  a.y += dep;
  acc[i] = a;
}`;
// Once an advance: the bed toward the plate's response (or local isostasy) over the years done, and the
// bed the steps read moved with it (the crust's elevation takes the load when the ice is read back,
// Ice.publish; the bed here can't wait for that).
const BED = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> H: array<f32>;
@group(0) @binding(2) var<storage, read> X: array<vec2f>;
@group(0) @binding(3) var<storage, read> ctl: CtlR;
@group(0) @binding(4) var<storage, read_write> w: array<f32>;
@group(0) @binding(5) var<storage, read_write> ba: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  let x = ctl.done / U.tauBed;
  let k = select(1.0 - exp(-x), x * (1.0 - 0.5 * x), x < 1e-3);
  var eq = -U.rhoI / U.rhoM * H[i];
  if (U.useFlex != 0u) { eq = -X[U.flexOff + i].y; }
  let w0 = w[i];
  let w1 = w0 + (eq - w0) * k;
  w[i] = w1;
  ba[i].x = ba[i].x + (w1 - w0);
}`;
// The bed as uploaded is the crust's without the ice's load; the load as it stands here is added.
const ADDW = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> w: array<f32>;
@group(0) @binding(2) var<storage, read_write> ba: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.n) { return; }
  ba[i].x = ba[i].x + w[i];
}`;
// Snow where the month is below freezing at the ice's surface, melt by positive degree days.
const MB = HEAD + /* wgsl */`
struct Mu { ph: array<vec4f, 12>, lapse: f32, sigma: f32, ddfSnow: f32, ddfIce: f32, dz: f32 };   // dz: the air's datum below the sea's surface (m), src/engine/plates.js
@group(0) @binding(1) var<uniform> Q: Mu;
@group(0) @binding(2) var<storage, read> clim: array<vec4f>;
@group(0) @binding(3) var<storage, read> ba: array<vec4f>;
@group(0) @binding(4) var<storage, read> H: array<f32>;
@group(0) @binding(5) var<storage, read_write> M: array<f32>;
@group(0) @binding(6) var<storage, read_write> Mx: array<vec4f>;
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
  let T0 = clim[3u * i];
  let T1 = clim[3u * i + 1u];
  let P1 = clim[3u * i + 2u];
  var tm = 0.0;
  for (var m = 0u; m < 12u; m++) { let c = Q.ph[m]; tm += T0.x + T0.y * c.x - T0.z * c.y + T0.w * c.z - T1.x * c.w; }
  tm = tm / 12.0;
  if (!(b > 0.0 || ba[i].w < 0.0 || h * U.rhoI > -b * U.rhoW)) { M[i] = 0.0; Mx[i] = vec4f(0.0, tm, 0.0, 0.0); return; }
  let sKm = max(0.0, b + h + Q.dz) / 1000.0;
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
  // Dust's darkening scales the factors (P1.zw: snow's, ice's; src/engine/aeolian.js).
  let ks = Q.ddfSnow * P1.z;
  let ki = Q.ddfIce * P1.w;
  let snowMelt = min(acc, pdd * ks);
  let left = pdd - snowMelt / ks;
  let net = (acc - snowMelt - left * ki) * (1000.0 / U.rhoI);
  M[i] = net;
  Mx[i] = vec4f((snowMelt + left * ki) * (1000.0 / U.rhoI), tm, net, 0.0);
}`;

const wg = n => Math.ceil(n / 64);
const MONTH_MID = [15.5, 45, 74.5, 105, 135.5, 166, 196.5, 227.5, 258, 288.5, 319, 349.5];
const FLEX_YEARS = 30;      // a warm V-cycle of the bed's flexure when this many years have passed (1% of the bed's τ)
const SLOW_EVERY = 4;       // the bed's fields and the integrals come back every this many reads

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
    this.ba = B(16 * n); this.H = B(4 * n, Float32Array.from(ice.H)); this.w = B(4 * n, Float32Array.from(ice.w));
    this.M = B(4 * n); this.Mx = B(16 * n); this.D = B(16 * n); this.dHb = B(16 * n); this.vel = B(16 * n);
    this.b = B(4 * n, Float32Array.from(ice.debris)); this.acc = B(16 * n);
    this.clim = B(48 * n);
    this.cf = B(4 * n, Float32Array.from(ice.cf));
    this.ctl = B(32);
    this.noFlex = B(16);
    let amin = Infinity;
    for (let i = 0; i < n; i++) amin = Math.min(amin, ice.areaM[i]);
    this.amin = amin;
    this.U = uniform(device, this.params());
    const mq = new Float32Array(56);
    MONTH_MID.forEach((mid, m) => {
      const tau = ((mid - 78.5) / 365.2422 + 1) % 1, c = Math.cos(2 * Math.PI * tau), s = Math.sin(2 * Math.PI * tau);
      mq.set([c, s, c * c - s * s, 2 * s * c], 4 * m);
    });
    mq.set([ICE.LAPSE, ICE.SIGMA, ICE.DDF_SNOW, ICE.DDF_ICE], 48);
    this.Q = uniform(device, mq);
    const K = this.K = { diff: kernel(device, DIFF, 'ice-diff'), dt: kernel(device, DT, 'ice-dt'), flux: kernel(device, FLUX, 'ice-flux'), apply: kernel(device, APPLY, 'ice-apply'), bed: kernel(device, BED, 'ice-bed'), addw: kernel(device, ADDW, 'ice-addw'), mb: kernel(device, MB, 'ice-mb') };
    const U = this.U, x = wg(n);
    this.stepList = [
      [K.diff, K.diff.bind({ U, nb: this.nb, ew: this.ew, ba: this.ba, H: this.H, Mx: this.Mx, D: this.D, vel: this.vel, ctl: this.ctl }), x],
      [K.dt, K.dt.bind({ U, ctl: this.ctl }), 1],
      [K.flux, K.flux.bind({ U, nb: this.nb, ew: this.ew, ba: this.ba, H: this.H, D: this.D, b: this.b, cf: this.cf, dHb: this.dHb }), x],
      [K.apply, K.apply.bind({ U, Mx: this.Mx, dHb: this.dHb, ctl: this.ctl, M: this.M, D: this.D, H: this.H, b: this.b, acc: this.acc }), x],
    ];
    this.bindBed(this.noFlex);
    this.addList = [[K.addw, K.addw.bind({ U, w: this.w, ba: this.ba }), x]];
    this.mbList = [[K.mb, K.mb.bind({ U, Q: this.Q, clim: this.clim, ba: this.ba, H: this.H, M: this.M, Mx: this.Mx }), x]];
    this.readBuf = device.createBuffer({ size: 80 * n + 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.reading = false; this.lastRead = -Infinity; this.lastBed = -Infinity; this.reads = 0; this.left = 0;
    this.dt = ICE.MAX_STEP;          // the step's limit at the last read, to plan how many to encode
    this.mbVersion = -1;
    this.flex = null; this.flexYears = Infinity; this.flexCycles = 0;
    this.bedArr = new Float32Array(4 * n); this.climArr = new Float32Array(12 * n);
  }

  /** The uniform block from ICE (call `setParams` after changing ICE's constants). */
  params() {
    const ub = new ArrayBuffer(96), uu = new Uint32Array(ub), uf = new Float32Array(ub);
    uu[0] = this.n;
    uf.set([this.ice.Gamma, this.amin, ICE.MAX_STEP, ICE.RHO_I, ICE.RHO_W, ICE.RHO_M, ICE.TAU_BED,
      ICE.K, ICE.BETA, ICE.THAW_W, ICE.LATENT, ICE.LAPSE, ICE.KG, ICE.EL, stepCoef(), ICE.G], 1);
    uu[17] = this.flex ? 1 : 0; uu[18] = this.flex ? this.flex.off : 0; uf[19] = ICE.KAPPA; uf[20] = ICE.U_MAX;
    return uu;
  }
  setParams() { this.device.queue.writeBuffer(this.U, 0, this.params()); }

  bindBed(X) { this.bedList = [[this.K.bed, this.K.bed.bind({ U: this.U, H: this.H, X, ctl: this.ctl, w: this.w, ba: this.ba }), wg(this.n)]]; }

  /**
   * Bend the bed by flexure: `flex` a GpuFlexure (src/gpu/flexure.js) on this
   * device and the ice's grid. It takes the ice's thickness as its load straight
   * from the device (q = ρᵢ g H), and the bed kernel reads its w there. Tₑ (km
   * per cell) fixed if given, else refreshed from the plates.
   */
  attachFlexure(flex, { Te = null } = {}) {
    this.flex = flex;
    flex.setRigidity(this.ice.useTe(Te));
    flex.useLoad(this.H, ICE.RHO_I * ICE.G);
    this.setParams();
    this.bindBed(flex.X);
    this.flexCycles = 8;                 // a cold start's worth, with the next advance
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
    if (ice.refreshPlates() && this.flex) { this.flex.setRigidity(ice.Te); this.flexCycles = Math.max(this.flexCycles, 3); }
    // The bed, when the crust or the sea has moved (or every 100 ms): the crust's without the ice's load
    // (as last read back), then the load as it stands on the device added.
    if (now - this.lastBed > 100) {
      this.lastBed = now;
      const a = this.bedArr;
      const sea = tec.sea, load = tec.load;
      for (let i = 0; i < n; i++) { const o = 4 * i; a[o] = (tec.elev[i] - (load ? load[i] : 0) - tec.seaLevel) * 1000; a[o + 1] = ice.areaM[i]; a[o + 2] = ice.Cb[i]; a[o + 3] = !sea || sea[i] ? ice.geo[i] : -Math.max(ice.geo[i], 1e-6); }
      this.device.queue.writeBuffer(this.ba, 0, a);
      this.run(this.addList);
      const dz = tec.airDatum ? (tec.seaLevel - tec.airDatum()) * 1000 : 0;
      if (dz !== this.dz) { this.dz = dz; this.device.queue.writeBuffer(this.Q, 52 * 4, new Float32Array([dz])); }
    }
    if (c.version !== this.mbVersion) {
      this.mbVersion = c.version;
      const a = this.climArr, T = c.Tf, P = c.Pf, dd = ice.dustDDF;
      for (let i = 0; i < n; i++) {
        const o = 12 * i;
        a[o] = T[0][i]; a[o + 1] = T[1][i]; a[o + 2] = T[2][i]; a[o + 3] = T[3][i];
        a[o + 4] = T[4][i]; a[o + 5] = P[0][i]; a[o + 6] = P[1][i]; a[o + 7] = P[2][i];
        a[o + 8] = P[3][i]; a[o + 9] = P[4][i]; a[o + 10] = dd ? dd[2 * i] : 1; a[o + 11] = dd ? dd[2 * i + 1] : 1;
      }
      this.device.queue.writeBuffer(this.clim, 0, a);
      ice.frontFactor();
      this.device.queue.writeBuffer(this.cf, 0, ice.cf);
      this.run(this.mbList);
    }
    if (years > 0) {
      // Steps past the years are empty (dt = 0); 5% spare, since the limit tightens as a sheet grows.
      const steps = Math.max(1, Math.min(maxSteps, Math.ceil(1.05 * years / Math.max(0.01, this.dt)) + 1));
      this.device.queue.writeBuffer(this.ctl, 4, new Float32Array([years, 0, 0]));   // remaining, done, dt (p0 runs on)
      const enc = this.device.createCommandEncoder(), pass = enc.beginComputePass();
      for (let r = 0; r < steps; r++) for (const [K, bg, x] of this.stepList) { pass.setPipeline(K.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(x); }
      // The plate's response to the load as the steps left it, warm-started, for the bed to relax toward (as
      // the CPU's rebound): solved before the steps, it answered the load an advance ago, which at a frame's
      // advance was nothing, but in the opening's 5 kyr chunks left the bed a chunk behind a growing sheet
      // (too high, the sheet overgrew, then fell back as the bed caught up, and the opening never settled).
      if (this.flex) {
        this.flexYears += years;
        if (this.flexYears >= FLEX_YEARS || this.flexCycles > 0) { this.flex.encode(pass, Math.max(1, this.flexCycles)); this.flexYears = 0; this.flexCycles = 0; }
      }
      for (const [K, bg, x] of this.bedList) { pass.setPipeline(K.pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(x); }
      pass.end();
      this.device.queue.submit([enc.finish()]);
    }
    if (!this.reading && now - this.lastRead > 100) this.read();
  }

  /**
   * Copy the state back to `Ice`, and push its load and water to the crust and
   * the sea. Every SLOW_EVERY reads (or with `all`) also the bed's fields and
   * the glacial integrals, which are cleared on the device as they're copied.
   */
  read(all = false) { return (this.inFlight = this.readOnce(all)); }
  /** The read in flight's promise is `inFlight`: wait on it, not on turns of the thread (that spun it ~9% busy through a seeded planet's opening). */
  async readOnce(all) {
    this.reading = true; this.lastRead = performance.now();
    const n = this.n, enc = this.device.createCommandEncoder();
    const slow = all || ++this.reads % SLOW_EVERY === 0;
    enc.copyBufferToBuffer(this.H, 0, this.readBuf, 0, 4 * n);
    enc.copyBufferToBuffer(this.w, 0, this.readBuf, 4 * n, 4 * n);
    enc.copyBufferToBuffer(this.vel, 0, this.readBuf, 8 * n, 16 * n);
    enc.copyBufferToBuffer(this.ctl, 0, this.readBuf, 24 * n, 32);
    if (slow) {
      enc.copyBufferToBuffer(this.M, 0, this.readBuf, 24 * n + 32, 4 * n);
      enc.copyBufferToBuffer(this.Mx, 0, this.readBuf, 28 * n + 32, 16 * n);
      enc.copyBufferToBuffer(this.D, 0, this.readBuf, 44 * n + 32, 16 * n);
      enc.copyBufferToBuffer(this.b, 0, this.readBuf, 60 * n + 32, 4 * n);
      enc.copyBufferToBuffer(this.acc, 0, this.readBuf, 64 * n + 32, 16 * n);
      enc.clearBuffer(this.acc);
    }
    this.device.queue.submit([enc.finish()]);
    if (slow) this.device.queue.writeBuffer(this.ctl, 20, new Float32Array([0]));   // the integrals' years restart with them
    try {
      await this.readBuf.mapAsync(GPUMapMode.READ, 0, slow ? 80 * n + 32 : 24 * n + 32);
      const ice = this.ice, buf = this.readBuf.getMappedRange(0, slow ? 80 * n + 32 : 24 * n + 32);
      const a = new Float32Array(buf, 0, 6 * n + 8);
      ice.H.set(a.subarray(0, n)); ice.w.set(a.subarray(n, 2 * n)); ice.vel.set(a.subarray(2 * n, 6 * n));
      const lim = a[6 * n + 4];
      if (lim > 0) this.dt = lim;
      this.left = a[6 * n + 1];      // the last advance's years not stepped (its steps, planned from the last limit, ran out)
      if (slow) {
        const m = new Float32Array(buf, 24 * n + 32, 14 * n);
        let calved = 0;
        for (let i = 0; i < n; i++) {
          const x = n + 4 * i, d = 5 * n + 4 * i, e = 10 * n + 4 * i;
          ice.M[i] = m[i]; ice.melt[i] = m[x]; ice.Ts0[i] = m[x + 1];
          ice.ub[i] = m[d + 1]; ice.thaw[i] = m[d + 2]; ice.mb[i] = m[d + 3];
          ice.debris[i] = m[9 * n + i];
          ice.eroded[i] += m[e]; ice.till[i] += m[e + 1]; ice.meltAcc[i] += m[e + 2];
          calved += m[e + 3] * ice.areaM[i];
        }
        // The calving rate over the years stepped since the last such read.
        const yrs = a[6 * n + 5];
        if (yrs > 0) ice.stats.calving = calved / yrs;
      }
      this.readBuf.unmap();
      if (slow) ice.route();
      ice.publish();
    } finally { this.reading = false; }
  }
}
