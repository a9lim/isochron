// Mineral dust (docs/MODEL.md): lifted from bare, dry ground by the
// wind, carried in a column by the season's winds, settled and washed out.
// The module solves the balance at the climate's six points of the year and
// leaves the routing (ice albedo, ocean iron, loess) to the planet.
//
// Emission (standard form; the gusts are synthesis). The vertical flux is
// GOCART's (Ginoux and others 2001, after Gillette and Passi 1988): F = C S
// u²(u − u_t) above the threshold u_t, zero below, with u the 10 m wind, S the
// source strength (0–1: the bare fraction × dryness × loose sediment, which
// the caller supplies), and GOCART's C = 1 µg s² m⁻⁵ (checked against a copy of
// the paper's text, not the paper). Here C is a calibration: the template's
// winds blow steadier and harder over the deserts than 6-hourly 10 m winds
// (7.2 m/s, source-weighted, on the opening planet), and a source map of bare,
// dry ground is far broader than Ginoux's basins, so GOCART's C with the arid
// share gave ~600,000 Tg/yr. It is the one constant phase 9 calibrates, on
// its sources (src/engine/aeolian.js) at level 7, the page's: C = 6.5e-12 gives
// ~1,570 Tg/yr on the default seed's settled opening (the retuned climate's),
// inside models' range for Earth (~500–4,000+; their median ~1,100–1,600, from
// memory), with a lifetime of ~2.2 days. Marticorena and Bergametti's
// u*³(1 + R)(1 − R²) from White's saltation flux has the same cubic growth and
// threshold. The
// climate's surface wind is a seasonal mean, which a hard threshold would turn
// into all or nothing, so the flux is its expectation over the gusts: the wind
// is the template's mean vector plus an isotropic Gaussian gust of rms σ in
// each component (a Rice distribution of speed), E[F] = C S σ³ Φ(|V|/σ, u_t/σ)
// with Φ(m, t) = E[s²(s − t)⁺] tabulated once (synthesis: weather models
// lift dust from subgrid wind distributions in the same spirit, Cakmur and
// others 2004, from memory). A calm mean wind then still lifts a little dust,
// and σ → 0 recovers the hard threshold.
//
// Transport (standard form, discretized as the moisture is). Each size bin's
// column load L (kg/m²) is steady at each point of the year:
//   ∇·(uL) − ∇·(κ∇L) = s_b E − (v_b/H + w P) L,
// u the moisture's carrying wind, κ the moisture's eddy mixing, v_b the bin's
// dry deposition velocity over a dust layer of depth H, P the rain (mm/day)
// and w the fraction of the column one millimetre of rain washes out
// (synthesis: a scavenging ratio of ~500, from memory). Upwinded in flux form
// on the Voronoi cells, with each edge's normal wind taken along the chord
// between the two centres so the flux leaving one cell is exactly the flux
// entering the next: emitted = deposited to round-off once converged. Two
// bins by default (fine < 2.5 µm, coarse 2.5–20 µm, the shares and velocities
// from memory): the coarse bin falls out sooner (on the opening planet a 1.7-day
// lifetime, ~1,100 km travelled) than the fine (2.8 days, ~1,700 km: the
// template's drizzle washes it out faster than Earth's ~5–7), and their sum
// falls off downwind more slowly than any one exponential, as observed dust does.
//
// Optics (from memory, rough). Optical depth τ = Σ_b L_b · MEE_b (mass
// extinction ~0.8 m²/g fine, ~0.3 m²/g coarse at 550 nm). Forcing at the top of
// the atmosphere −K τ (1 − α/α_c), K ≈ 20 W m⁻² per unit τ: dust cools over
// dark ground and sea and warms over snow and ice brighter than α_c ≈ 0.45
// (speculation on the constants; the sign change is standard).
//
// Solved on level 6 at most (below, "between levels"), by Gauss–Seidel sweeps
// in four orders on the CPU (the reference) and by Jacobi passes on the GPU
// (src/gpu/dust.js), warm-started either way, from the same packed
// coefficients. Convergence is set by the eddy mixing, so the passes needed
// grow ~4× a level; a sweep in four orders is worth only a few Jacobi passes
// (the orders can't follow rotating flow), so the CPU path converges slowly
// warm and is for headless runs and tests.

import { CLIMATE } from './climate.js';
import { buildGrid } from '../grid/icosphere.js';
import { parents } from '../grid/transfer.js';
import { shared, toShared } from './shared.js';
import { parallel } from './pool.js';

export const DUST = {
  C: 6.5e-12,         // kg s² m⁻⁵: GOCART's 1e-9 calibrated down, on phase 9's sources at level 7: the calibration (see the header)
  U_T: 6.5,         // m/s, threshold 10 m wind for dry loose ground (from memory: 5–8 in GOCART's sizes)
  GUST: 2.5,        // m/s, rms of each horizontal component about the template's mean (synthesis)
  H: 3000,          // m, the dust layer's depth
  SCAV: 0.14,       // per mm of rain: the share of the column it washes out
  KAPPA: CLIMATE.KAPPA_W,   // km²/day, the moisture's eddy mixing
  BINS: [
    { name: 'fine', share: 0.3, vd: 0.001, mee: 0.8 },     // < 2.5 µm: 0.1 cm/s (turbulent deposition dominates settling)
    { name: 'coarse', share: 0.7, vd: 0.01, mee: 0.3 },    // 2.5–20 µm: ~1 cm/s settling
  ],
  K_FORCE: 20,      // W/m² per unit optical depth, net at the top (from memory)
  ALB_CRIT: 0.45,   // surface albedo where dust's forcing changes sign
  LEVEL: 6,         // the solve's grid at most (110 km): see "between levels"
  SWEEPS: 16,       // Gauss–Seidel sweeps warm on the CPU (four times as many cold)
  GPU_PASSES: 240,  // Jacobi passes warm on the GPU (four times as many cold), at level 6
};

export const NP = 6;                 // points of the year, the climate's
const R_KM = 6371, R_M = 6.371e6, DAY = 86400, YEAR_DAYS = 365.25;

// ---------------------------------------------------------------- the gusts
// Φ(m, t) = E[s²(s − t)⁺], s = |m x̂ + g|, g ~ N(0, I₂): σ = 1 units. Tabulated as
// log Φ on m, t ∈ [0, 32] × [0, 24] at 0.25 from the Rice density's moments,
// integrated down from the tail.
const TS = 0.25, TM = 32, TT = 24, NMT = TM / TS + 1, NTT = TT / TS + 1;
let TABLE = null;
// Below the threshold log Φ falls off as the Rice density's log, −(t² + m²)/2 +
// log I₀(tm); the table holds log Φ plus that (less its value at t = m, so it's
// continuous), which is nearly polynomial between nodes.
const tail = (m, t) => t > m ? 0.5 * (t - m) * (t - m) - Math.log(i0e(t * m)) + Math.log(i0e(m * m)) : 0;

/** e^{−x} I₀(x), x ≥ 0 (Abramowitz and Stegun 9.8.1–2, |ε| < 2e-7). */
export function i0e(x) {
  if (x < 3.75) {
    const t = (x / 3.75) ** 2;
    return Math.exp(-x) * (1 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813))))));
  }
  const t = 3.75 / x;
  return (0.39894228 + t * (0.01328592 + t * (0.00225319 + t * (-0.00157565 + t * (0.00916281 + t * (-0.02057706
    + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377)))))))) / Math.sqrt(x);
}

/** The Rice density of the speed, mean speed m, unit rms gust per component. */
export function riceDensity(s, m) { return s * Math.exp(-0.5 * (s - m) * (s - m)) * i0e(s * m); }

function buildTable() {
  const T = new Float64Array(NMT * NTT), h = 0.01, per = Math.round(TS / h);
  for (let a = 0; a < NMT; a++) {
    const m = a * TS, K = Math.ceil((m + 12) / h);
    // Cumulative ∫_s^∞ s^k f ds for k = 2, 3 by the trapezoid, from the top down.
    let g2 = 0, g3 = 0, prev2 = 0, prev3 = 0;
    const G2 = new Float64Array(K + 1), G3 = new Float64Array(K + 1);
    for (let k = K; k >= 0; k--) {
      const s = k * h, f = riceDensity(s, m), f2 = s * s * f, f3 = f2 * s;
      if (k < K) { g2 += 0.5 * h * (f2 + prev2); g3 += 0.5 * h * (f3 + prev3); }
      G2[k] = g2; G3[k] = g3; prev2 = f2; prev3 = f3;
    }
    for (let b = 0; b < NTT; b++) {
      const k = b * per, t = b * TS;
      const F = k <= K ? G3[k] - t * G2[k] : 0;
      T[a * NTT + b] = Math.log(Math.max(1e-300, F)) + tail(m, t);
    }
  }
  return T;
}

function erfc(x) {   // Abramowitz and Stegun 7.1.26 on |x|, |ε| < 1.5e-7
  const z = Math.abs(x), t = 1 / (1 + 0.3275911 * z);
  const r = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
  return x >= 0 ? r : 2 - r;
}

/** Φ outside the table: the speed ≈ N(m + 1/(2m), 1) (the gust across the mean adds 1/2m on average). */
function phiFar(m, t) {
  const d = m - t + 0.5 / Math.max(m, 1e-6);
  const P = 0.5 * erfc(-d / Math.SQRT2), q = Math.exp(-0.5 * d * d) / Math.sqrt(2 * Math.PI);
  const M1 = d * P + q, M2 = (1 + d * d) * P + d * q, M3 = (d * d * d + 3 * d) * P + (d * d + 2) * q;
  return Math.max(0, t * t * M1 + 2 * t * M2 + M3);   // E[(t + w)² w⁺], w = s − t
}

// Catmull–Rom weights for a fraction f between nodes 1 and 2 of four.
function cr(f, w) {
  const f2 = f * f, f3 = f2 * f;
  w[0] = 0.5 * (-f3 + 2 * f2 - f); w[1] = 0.5 * (3 * f3 - 5 * f2 + 2); w[2] = 0.5 * (-3 * f3 + 4 * f2 + f); w[3] = 0.5 * (f3 - f2);
}
const WX = new Float64Array(4), WY = new Float64Array(4);

/** E[s²(s − t)⁺] in σ = 1 units (bicubic in the table: within 1.3% wherever Φ > 1e-5, the worst where t ≈ m < 1). */
export function gustFactor(m, t) {
  if (m >= TM - TS || t >= TT - TS) return phiFar(m, t);
  if (!TABLE) TABLE = buildTable();
  const x = m / TS, y = t / TS;
  const a = Math.min(NMT - 2, Math.floor(x)), b = Math.min(NTT - 2, Math.floor(y));
  cr(x - a, WX); cr(y - b, WY);
  let v = 0;
  for (let p = 0; p < 4; p++) {
    const ap = Math.max(0, Math.min(NMT - 1, a - 1 + p)) * NTT;
    let r = 0;
    for (let q = 0; q < 4; q++) r += WY[q] * TABLE[ap + Math.max(0, Math.min(NTT - 1, b - 1 + q))];
    v += WX[p] * r;
  }
  return Math.exp(v - tail(m, t));
}

/** The wind's part of the emission, m³/s³: E[s²(s − u_t)⁺] for mean speed V and gust σ (σ = 0: the hard threshold). */
export function windFactor(V, ut, sigma) {
  if (!(sigma > 0)) return V > ut ? V * V * (V - ut) : 0;
  return sigma * sigma * sigma * gustFactor(V / sigma, ut / sigma);
}

/**
 * The moisture's carrying wind from the climate's surface wind (windPhase[p]): the
 * geostrophic part and CARRY of the frictional drift. The template's balance
 * r u + f k×u = G gives G back from u, and carry = u − (1 − CARRY) r G/(r² + f²).
 */
export function carryingWind(grid, wind, out = shared(Float32Array, 3 * grid.n), C = CLIMATE) {
  const r = C.FRICTION, cy = C.CARRY, pos = grid.pos;
  for (let i = 0; i < grid.n; i++) {
    const px = pos[3 * i], py = pos[3 * i + 1], pz = pos[3 * i + 2], f = 2 * C.OMEGA * pz;
    const ux = wind[3 * i], uy = wind[3 * i + 1], uz = wind[3 * i + 2];
    const gx = r * ux + f * (py * uz - pz * uy), gy = r * uy + f * (pz * ux - px * uz), gz = r * uz + f * (px * uy - py * ux);
    const k = (1 - cy) * r / (r * r + f * f);
    out[3 * i] = ux - k * gx; out[3 * i + 1] = uy - k * gy; out[3 * i + 2] = uz - k * gz;
  }
  return out;
}

// -------------------------------------------------------------- between levels
// The solve runs on level 6 at most (DUST.LEVEL): the balance converges by Jacobi
// passes in a number that grows ~4× a level (the eddy mixing's), and plumes span
// thousands of km. The engine's grid and the solve's nest (src/grid/transfer.js):
// P copies a coarse cell's value to its own fine cell and gives a midpoint its two
// parents' mean. Inputs go down as Pᵀ(area × value), so emission and rain keep
// their integrals; loads come up by P; deposition is the fine load × the fine
// rain's removal. Since the solve's cell areas are Pᵀ(area), what the fine
// cells receive sums exactly to what the solve deposits, which is what the fine
// cells emitted.

function down(steps, x, k, out = null) {
  for (let s = 0; s < steps.length; s++) {
    const st = steps[s], y = out && s === steps.length - 1 ? out : new Float64Array(st.nc * k);
    downCells({ kidOff: st.kidOff, kids: st.kids, f: x, k, y }, 0, st.nc);
    x = y;
  }
  return x;
}

/** `down` by chunk of the coarse cells on the engine's pool (a generator), its levels between in shared arrays kept per step. */
function* downSteps(steps, x, k, out) {
  for (let s = 0; s < steps.length; s++) {
    const st = steps[s], key = 'y' + k, y = s === steps.length - 1 ? out : st[key] || (st[key] = shared(Float64Array, st.nc * k));
    yield* parallel('dustDown', downCells, { kidOff: st.kidOff, kids: st.kids, f: x, k, y }, st.nc);
    x = y;
  }
  return x;
}

/**
 * One level of `down` on coarse cells [a, b) (and the engine's pool's kernel): each its own value, then
 * half of each fine midpoint's beside it, its children in order (as the fine cells were once scattered,
 * so the sums are added in the same order).
 */
export function downCells(x, a, b) {
  const { kidOff, kids, f, k, y } = x;
  for (let q = a; q < b; q++) {
    const o = q * k;
    for (let r = 0; r < k; r++) y[o + r] = f[o + r];
    for (let t = kidOff[q], e = kidOff[q + 1]; t < e; t++) { const c = kids[t] * k; for (let r = 0; r < k; r++) y[o + r] += 0.5 * f[c + r]; }
  }
}

/** Each coarse cell's fine midpoints (CSR, ascending) from a level's parents. */
function children(nc, nf, par) {
  const kidOff = shared(Int32Array, nc + 1), kids = shared(Int32Array, 2 * (nf - nc));
  for (let i = nc; i < nf; i++) { kidOff[par[2 * (i - nc)] + 1]++; kidOff[par[2 * (i - nc) + 1] + 1]++; }
  for (let q = 0; q < nc; q++) kidOff[q + 1] += kidOff[q];
  const at = Int32Array.from(kidOff.subarray(0, nc));
  for (let i = nc; i < nf; i++) { kids[at[par[2 * (i - nc)]]++] = i; kids[at[par[2 * (i - nc) + 1]]++] = i; }
  return { kidOff, kids };
}

function up(steps, x, k, out = null) {
  for (let s = steps.length - 1; s >= 0; s--) {
    const { nc, nf, par } = steps[s], y = out && s === 0 ? out : new Float32Array(nf * k);
    y.set(x.subarray(0, nc * k));
    for (let i = nc; i < nf; i++) {
      const a = par[2 * (i - nc)] * k, b = par[2 * (i - nc) + 1] * k, o = i * k;
      for (let q = 0; q < k; q++) y[o + q] = 0.5 * (x[a + q] + x[b + q]);
    }
    x = y;
  }
  return x;
}

// ------------------------------------------------------------- the pool's kernels
// Each over cells [a, b) (src/engine/pool.js, by name in src/engine/kernels.js), as the loops they were.

/** A point of the year's emission and rain on the engine's cells [a, b), and their area-weighted inputs to `down`. */
export function emitCells(x, a, b) {
  const { wind, cw, rain, source, ut, gust, emission, C, Af, E, Rn, aw, ar, ae } = x;
  for (let i = a; i < b; i++) {
    const S = source ? source[i] : 0;
    let e = emission ? emission[i] : 0;
    if (S > 0) {
      const ux = wind[3 * i], uy = wind[3 * i + 1], uz = wind[3 * i + 2], V = Math.sqrt(ux * ux + uy * uy + uz * uz);
      e += C * S * windFactor(V, typeof ut === 'number' ? ut : ut[i], typeof gust === 'number' ? gust : gust[i]);
    }
    const P = Math.max(0, rain[i]);
    E[i] = e; Rn[i] = P;
    ae[i] = Af[i] * e; ar[i] = Af[i] * P;
    aw[3 * i] = Af[i] * cw[3 * i]; aw[3 * i + 1] = Af[i] * cw[3 * i + 1]; aw[3 * i + 2] = Af[i] * cw[3 * i + 2];
  }
}

/** A point of the year's packed coefficients and source on the solve's cells [a, b) (its mean wind AW, rain AR, emission AE). */
export function coeffCells(x, a, b) {
  const { p, nbrOff, nbr, AW, AR, AE, ch, el, kd, co, src } = x;
  for (let i = a; i < b; i++) {
    const o = 8 * (i * NP + p), t0 = nbrOff[i];
    for (let k = 0; k < 6; k++) co[o + k] = 0;
    let base = 0;
    for (let t = t0, e = nbrOff[i + 1]; t < e; t++) {
      const j = nbr[t];
      const f = 0.5 * ((AW[3 * i] + AW[3 * j]) * ch[3 * t] + (AW[3 * i + 1] + AW[3 * j + 1]) * ch[3 * t + 1] + (AW[3 * i + 2] + AW[3 * j + 2]) * ch[3 * t + 2]) * el[t];
      if (f > 0) base += f; else co[o + t - t0] -= f;
      co[o + t - t0] += kd[t]; base += kd[t];
    }
    co[o + 6] = base; co[o + 7] = AR[i];
    src[i * NP + p] = AE[i];
  }
}

/**
 * The outputs on the engine's cells [a, b) from the loads L (on them), and those cells' sums for the stats:
 * [emission, dry, wet, burden, τ, forcing, ...deposition by bin, ...burden by bin].
 */
export function finishCells(x, a, b) {
  const { L, rain, emit, albedo, area, m2, nb, kdry, scav, mee, yr, K_FORCE, ALB_CRIT, o } = x;
  let em = 0, dry = 0, wet = 0, burden = 0, tauM = 0, forM = 0;
  const bins = new Float64Array(nb), loads = new Float64Array(nb);
  for (let i = a; i < b; i++) {
    let la = 0, ea = 0, da = 0, wa = 0, ta = 0;
    const ar = area[i] * m2;
    for (let q = 0; q < nb; q++) o.depBin[q][i] = 0;
    for (let p = 0; p < NP; p++) {
      let l = 0, d = 0;
      const P = rain[p][i];
      for (let q = 0; q < nb; q++) {
        const v = L[(i * NP + p) * nb + q], dr = v * kdry[q], we = v * scav[q] * P;
        l += v; d += dr + we; da += dr; wa += we; loads[q] += ar * v / NP;
        o.depBin[q][i] += (dr + we) * yr;
        ta += v * mee[q];
      }
      o.load[p][i] = l; o.dep[p][i] = d;
      la += l; ea += emit[p][i];
    }
    o.loadAnn[i] = la / NP; o.emitAnn[i] = ea * yr; o.dryAnn[i] = da * yr; o.wetAnn[i] = wa * yr; o.depAnn[i] = (da + wa) * yr;
    o.tau[i] = ta / NP;
    o.forcing[i] = -K_FORCE * o.tau[i] * (1 - (albedo ? albedo[i] : 0) / ALB_CRIT);
    em += ar * o.emitAnn[i]; dry += ar * o.dryAnn[i]; wet += ar * o.wetAnn[i]; burden += ar * o.loadAnn[i];
    tauM += area[i] * o.tau[i]; forM += area[i] * o.forcing[i];
    for (let q = 0; q < nb; q++) bins[q] += ar * o.depBin[q][i];
  }
  return [em, dry, wet, burden, tauM, forM, ...bins, ...loads];
}

// ------------------------------------------------------------------ the solve
export class Dust {
  /**
   * grid: the engine's grid (the climate's). opts override DUST (e.g. { BINS, H, GUST, KAPPA, LEVEL }).
   * The solve's grid is `solveGrid` (level min(grid.level, LEVEL)), with n cells; its state L,
   * Float32Array(n · NP · NB), cell-major ((i·NP + p)·NB + b), kg/m², is the warm start.
   * Inputs and outputs are on the engine's grid (nf cells).
   */
  constructor(grid, opts = {}) {
    const P = this.P = { ...DUST, ...opts };
    const nb = this.nb = P.BINS.length;
    if (nb < 1 || nb > 4) throw new Error('dust: 1–4 bins');
    this.grid = grid;
    const nf = this.nf = grid.n, level = Math.min(grid.level, P.LEVEL);
    const sg = this.solveGrid = level < grid.level ? buildGrid(level) : grid;
    this.steps = [];
    for (let l = grid.level, fg = grid; l > level; l--) {
      const cg = l - 1 === level ? sg : buildGrid(l - 1);
      const par = parents(fg, cg.n);
      this.steps.push({ nf: fg.n, nc: cg.n, par, ...children(cg.n, fg.n, par) });
      fg = cg;
    }
    const n = this.n = sg.n;
    const { nbrOff, nbr, ell, dist, pos } = sg, m = nbrOff[n];
    // Per edge: the chord's unit vector (exactly antisymmetric), its length factor, the mixing.
    this.chord = shared(Float32Array, 3 * m); this.elen = shared(Float64Array, m); this.kdiff = shared(Float64Array, m);
    for (let i = 0; i < n; i++) for (let t = nbrOff[i]; t < nbrOff[i + 1]; t++) {
      const j = nbr[t];
      const dx = pos[3 * j] - pos[3 * i], dy = pos[3 * j + 1] - pos[3 * i + 1], dz = pos[3 * j + 2] - pos[3 * i + 2], d = Math.hypot(dx, dy, dz);
      this.chord[3 * t] = dx / d; this.chord[3 * t + 1] = dy / d; this.chord[3 * t + 2] = dz / d;
      this.elen[t] = ell[t] * R_KM * DAY / 1000;      // × u (m/s) = km²/day
      this.kdiff[t] = P.KAPPA * ell[t] / dist[t];     // km²/day
    }
    // Six neighbours per cell, padded with the cell itself (coefficient 0), as the GPU reads them.
    this.nbr6 = new Uint32Array(6 * n);
    for (let i = 0; i < n; i++) {
      const o = nbrOff[i], d = nbrOff[i + 1] - o;
      if (d > 6) throw new Error('dust: a cell with more than six neighbours');
      for (let k = 0; k < 6; k++) this.nbr6[6 * i + k] = k < d ? nbr[o + k] : i;
    }
    this.areaF = toShared(Float64Array.from(grid.area, a => a * R_KM * R_KM));    // km², the engine's cells
    this.areaKm = Float32Array.from(down(this.steps, this.areaF, 1));   // km², the solve's cells: Pᵀ(area)
    // Packed coefficients per (cell, phase), 8 floats: six inflow coefficients, the
    // diagonal's transport part (outflow + mixing), the area × rain (km² mm/day).
    this.co = shared(Float32Array, 8 * NP * n);
    this.src = shared(Float32Array, NP * n);     // area × emission, km² kg m⁻² day⁻¹
    this.emit = Array.from({ length: NP }, () => shared(Float32Array, nf));   // kg m⁻² day⁻¹, the engine's cells
    this.rain = Array.from({ length: NP }, () => shared(Float32Array, nf));   // mm/day, the engine's cells
    this.L = shared(Float32Array, NP * n * nb);
    this.warm = false;
    // Per bin: dry removal (1/day), the share of emission, scavenging per mm.
    this.kdry = P.BINS.map(b => b.vd / P.H * DAY);
    this.share = P.BINS.map(b => b.share);
    this.scav = P.BINS.map(b => b.scav ?? P.SCAV);
    // Sweep orders for Gauss–Seidel, as the climate's moisture.
    const lon = new Float64Array(n), lat = new Float64Array(n);
    for (let i = 0; i < n; i++) { lon[i] = Math.atan2(pos[3 * i + 1], pos[3 * i]); lat[i] = Math.asin(Math.max(-1, Math.min(1, pos[3 * i + 2]))); }
    const idx = Array.from({ length: n }, (_, i) => i);
    const byLon = idx.slice().sort((a, b) => lon[a] - lon[b]), byLat = idx.slice().sort((a, b) => lat[a] - lat[b]);
    this.orders = [Int32Array.from(byLon), Int32Array.from(byLon.reverse()), Int32Array.from(byLat), Int32Array.from(byLat.reverse())];
    // (The arrays the pool's kernels touch are shared: `emitCells`, `coeffCells`, `finishCells`.)
    this.aw = shared(Float64Array, 3 * nf); this.ar = shared(Float64Array, nf); this.ae = shared(Float64Array, nf);
    this.dAW = shared(Float64Array, 3 * n); this.dAR = shared(Float64Array, n); this.dAE = shared(Float64Array, n);   // `down`'s, on the solve's cells
    this.Lf = shared(Float32Array, NP * nf * nb);   // the loads on the engine's cells (`up`'s)
    this.out = null;
    this.stats = null;
  }

  /**
   * One point of the year's inputs, on the engine's grid:
   *   wind   Float32Array(3n), surface wind (m/s), for the emission (the climate's windPhase[p])
   *   carry  Float32Array(3n), carrying wind (m/s), for the transport (default: carryingWind(wind))
   *   rain   Float32Array(n), mm/day (the climate's Pph[p])
   *   source Float32Array(n), 0–1, the source strength S (bare × dry × loose; zero at sea, under snow and ice)
   *   ut     threshold wind (m/s), a number or Float32Array(n) (default U_T)
   *   gust   σ (m/s), a number or Float32Array(n) (default GUST)
   *   emission  Float32Array(n), kg m⁻² day⁻¹: a prescribed flux, added to wind × source (oracles, other sources)
   */
  phase(p, inputs) { const it = this.phaseSteps(p, inputs); while (!it.next().done); }
  /** `phase` in pieces (a generator: the climate's cycle yields between them). */
  *phaseSteps(p, { wind, carry = null, rain, source = null, ut = this.P.U_T, gust = this.P.GUST, emission = null }) {
    const g = this.grid, nf = this.nf;
    const cw = carry || carryingWind(g, wind);
    yield* parallel('dustEmit', emitCells, { wind, cw, rain, source, ut, gust, emission, C: this.P.C * DAY, Af: this.areaF, E: this.emit[p], Rn: this.rain[p], aw: this.aw, ar: this.ar, ae: this.ae }, nf);
    yield;
    // Down to the solve's grid: sums of area × value, and the area-weighted mean wind.
    const AE = yield* downSteps(this.steps, this.ae, 1, this.dAE), AR = yield* downSteps(this.steps, this.ar, 1, this.dAR), AW = yield* downSteps(this.steps, this.aw, 3, this.dAW);
    yield;
    const sg = this.solveGrid, n = this.n, A = this.areaKm;
    for (let i = 0; i < n; i++) { const r = 1 / A[i]; AW[3 * i] *= r; AW[3 * i + 1] *= r; AW[3 * i + 2] *= r; }
    yield* parallel('dustCoeffs', coeffCells, { p, nbrOff: sg.nbrOff, nbr: sg.nbr, AW, AR, AE, ch: this.chord, el: this.elen, kd: this.kdiff, co: this.co, src: this.src }, n);
  }

  /** The CPU's reference: Gauss–Seidel sweeps over all phases and bins; stops when the largest change is below tol of the largest load. */
  solve(sweeps = this.warm ? this.P.SWEEPS : 4 * this.P.SWEEPS, tol = 0) {
    const n = this.n, nb = this.nb, L = this.L, co = this.co, src = this.src, nbr6 = this.nbr6, A = this.areaKm;
    const kdry = this.kdry, share = this.share, scav = this.scav;
    let s = 0, change = Infinity;
    for (; s < sweeps; s++) {
      const ord = this.orders[s & 3];
      let dmax = 0, lmax = 1e-30;
      for (let k = 0; k < n; k++) {
        const i = ord[k], q = 6 * i;
        for (let p = 0; p < NP; p++) {
          const o = 8 * (i * NP + p), sv = src[i * NP + p];
          for (let b = 0; b < nb; b++) {
            let r = share[b] * sv;
            for (let c = 0; c < 6; c++) r += co[o + c] * L[(nbr6[q + c] * NP + p) * nb + b];
            const x = r / (co[o + 6] + A[i] * kdry[b] + co[o + 7] * scav[b]), at = (i * NP + p) * nb + b;
            const d = Math.abs(x - L[at]);
            if (d > dmax) dmax = d;
            if (x > lmax) lmax = x;
            L[at] = x;
          }
        }
      }
      change = dmax / lmax;
      if (change < tol) { s++; break; }
    }
    this.warm = true;
    return { sweeps: s, change };
  }

  /** The largest residual of the balance over all cells, phases and bins, relative to the largest removal (a check). */
  residual() {
    const n = this.n, nb = this.nb, L = this.L, co = this.co, src = this.src, nbr6 = this.nbr6, A = this.areaKm;
    let rmax = 0, smax = 1e-30;
    for (let i = 0; i < n; i++) for (let p = 0; p < NP; p++) {
      const o = 8 * (i * NP + p);
      for (let b = 0; b < nb; b++) {
        let r = this.share[b] * src[i * NP + p];
        for (let c = 0; c < 6; c++) r += co[o + c] * L[(nbr6[6 * i + c] * NP + p) * nb + b];
        const a = (co[o + 6] + A[i] * this.kdry[b] + co[o + 7] * this.scav[b]) * L[(i * NP + p) * nb + b];
        rmax = Math.max(rmax, Math.abs(a - r)); smax = Math.max(smax, a);
      }
    }
    return rmax / smax;
  }

  /**
   * The outputs on the engine's grid, from the loads. albedo (Float32Array(nf), optional) sets the forcing's sign.
   *   load[p], dep[p]       kg/m², kg m⁻² day⁻¹ at each point of the year (all bins)
   *   loadAnn               kg/m², the year's mean
   *   emitAnn, depAnn, dryAnn, wetAnn   kg m⁻² yr⁻¹
   *   depBin[b]             kg m⁻² yr⁻¹, each bin's deposition (the fine bin is most of what reaches far seas and ice)
   *   tau, forcing          optical depth at 550 nm, W/m² at the top (the year's means)
   * and stats: Tg/yr of emission and deposition (dry, wet; `bins` by bin), burden (Tg; `burdenBins`), lifetime
   * (days; `lifetimeBins`), mean τ and forcing.
   */
  finish(albedo = null) {
    const it = this.finishSteps(albedo);
    for (let r = it.next(); !r.done; r = it.next());
    return this.out;
  }

  /** `finishCells`' arguments: the loads brought up to the engine's cells, and the outputs (made the first time). */
  finishArgs(albedo = null) {
    const n = this.nf, nb = this.nb, Pp = this.P, sh = () => shared(Float32Array, n);
    const o = this.out || (this.out = {
      load: Array.from({ length: NP }, sh), dep: Array.from({ length: NP }, sh),
      loadAnn: sh(), emitAnn: sh(), depAnn: sh(), dryAnn: sh(), wetAnn: sh(),
      depBin: Pp.BINS.map(sh), tau: sh(), forcing: sh(),
    });
    return { L: up(this.steps, this.L, NP * nb, this.Lf), rain: this.rain, emit: this.emit, albedo, area: this.grid.area, m2: R_M * R_M, nb, kdry: this.kdry, scav: this.scav,
      mee: Pp.BINS.map(b => 1000 * b.mee), yr: YEAR_DAYS / NP, K_FORCE: Pp.K_FORCE, ALB_CRIT: Pp.ALB_CRIT, o };
  }

  /** `finish` on the engine's pool by chunk (a generator: the climate's cycle yields between its parts). */
  *finishSteps(albedo = null) {
    const n = this.nf, nb = this.nb;
    const x = this.finishArgs(albedo), o = this.out;
    yield;
    // The chunks' sums, added in their order (the stats, which nothing in the model reads, move in their last bits with the chunks).
    let emit = 0, dry = 0, wet = 0, burden = 0, tauM = 0, forM = 0;
    const bins = new Float64Array(nb), loads = new Float64Array(nb);
    for (const r of yield* parallel('dustFinish', finishCells, x, n)) {
      emit += r[0]; dry += r[1]; wet += r[2]; burden += r[3]; tauM += r[4]; forM += r[5];
      for (let q = 0; q < nb; q++) { bins[q] += r[6 + q]; loads[q] += r[6 + nb + q]; }
    }
    const Tg = 1e-9;
    this.stats = {
      emission: emit * Tg, deposition: (dry + wet) * Tg, dry: dry * Tg, wet: wet * Tg, burden: burden * Tg,
      lifetime: burden / Math.max(1e-30, (dry + wet) / YEAR_DAYS), tau: tauM / (4 * Math.PI), forcing: forM / (4 * Math.PI),
      bins: Array.from(bins, x => x * Tg), burdenBins: Array.from(loads, x => x * Tg),
      lifetimeBins: Array.from(loads, (x, b) => x / Math.max(1e-30, bins[b] / YEAR_DAYS)),
    };
    return o;
  }
}
