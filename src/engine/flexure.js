// Flexure of the lithosphere (docs/surface.md): a thin elastic plate
// over a fluid mantle (standard).
//
//   ∇²(D ∇²w) + Δρ g w = q
//
// w is the deflection, positive down (m); q the load, positive down (Pa); D
// the flexural rigidity E Tₑ³ / 12(1 − ν²) (N m), one per cell; Δρ the mantle's
// density less the infill's (kg/m³). The loads bend the plate over the
// flexural length α = (4D/Δρg)^¼ instead of only beneath themselves. Where
// D → 0 the plate is Airy's local isostasy, w = q/Δρg.
//
//   variable D   (synthesis) the full plate equation adds −(1 − ν) ◇⁴(D, w) =
//                −(1 − ν)(D_xx w_yy − 2 D_xy w_xy + D_yy w_xx), which vanishes
//                where D is uniform. It's dropped, as is common: exact for a
//                uniform plate, an approximation where D changes within a
//                flexural length.
//   the sphere   (standard) the operator is the surface Laplacian's: a plate
//                on the sphere. A thin spherical shell adds membrane terms,
//                which matter only at wavelengths near the planet's radius;
//                for α ≪ R the planar solutions hold to O((α/R)²).
//
// The mixed form. With m = −D∇²w (a bending moment per length, N), the plate is
// two coupled second-order problems, m/D + ∇²w = 0 and −∇²m + Δρ g w = q.
// Integrated over each Voronoi cell, with K the integrated negative Laplacian
// ((Kf)_i = Σ (ℓ/d)(f_i − f_j), symmetric and positive semi-definite) and A the
// cells' areas,
//
//   [ −A/D   K   ] [m]   [ 0  ]
//   [  K    ΔρgA ] [w] = [ Aq ]
//
// a symmetric saddle point; eliminating m leaves K (D/A) K + ΔρgA, symmetric
// positive definite, the discrete plate's energy ½ Σ (D/A)(Kw)² + ½ Σ ΔρgAw²
// less the load's work. Solved by multigrid V-cycles on the nested grids:
// collective damped Jacobi (each cell's 2×2 block, B = [[−A/D, Σℓ/d],
// [Σℓ/d, ΔρgA]], inverted exactly; its determinant −ΔρgA²/D − (Σℓ/d)² never
// vanishes), the residual restricted by full weighting and the correction
// prolonged by averaging (src/grid/transfer.js, transposed; the weather's
// pattern, src/gpu/weather.js), and level 1 solved exactly. Coarse levels are
// rediscretized with the area-mean of 1/D (the harmonic mean, which is lumped
// Galerkin for the −A/D term, so a broken plate stays broken on coarse levels)
// and of Δρ. Unknowns are scaled to metres: μ = m/√(Δρ_ref g D_ref).
// `solveCG` is an independent reference: conjugate gradients on the SPD form,
// Jacobi-preconditioned.
//
// Rigidity follows the crust (FLEXURE's Tₑ helpers):
//   ocean        (standard form; Watts' isotherm, from memory) Tₑ is the depth
//                of the 450 °C isotherm in a half-space cooling plate,
//                2 erf⁻¹(450/T_m) √(κ t) ≈ 3.4 km √(age/Myr), capped at 40 km
//                where a plate model's isotherms level off (synthesis)
//   continents   (synthesis) stiffening with the crust's age toward a craton's
//                ~90 km over ~500 Myr from a young margin's 20; softened where
//                the crust is overthickened (a hot, weak lower crust decouples
//                the layers), thinned (stretched), or recently sutured (a
//                young orogen)
//   boundaries   (synthesis) broken: one cell on the weaker side of each plate
//                boundary gets Tₑ ≤ 1 km, a hinge carrying shear but no moment,
//                so a load at a break deflects twice as far and its outer rise
//                moves in (α·3π/4 instead of απ)
//
// Units: q in Pa, Tₑ in km, w in m (positive down), Δρ in kg/m³, ages in Myr.
import { buildGrid } from '../grid/icosphere.js';
import { makeTransfer, restrict } from '../grid/transfer.js';
import { RHO_MANTLE, RHO_OCEANIC, RHO_CONTINENTAL, subsidence } from './crust.js';
import { ICE } from './ice.js';

export const FLEXURE = {
  E: 7e10, NU: 0.25,       // Pa and dimensionless: Young's modulus and Poisson's ratio (Turcotte and Schubert's; from memory)
  G: 9.81,
  RHO_M: 1000 * RHO_MANTLE,
  TE_REF: 30,              // km: the rigidity the unknowns are scaled by
  TE_MIN: 0.2,             // km: the floor (D ∝ Tₑ³; a zero would divide)
  // The ocean.
  T_ISO: 450, T_MANTLE: 1350, KAPPA: 1e-6, TE_OCEAN_MAX: 40,   // °C, °C, m²/s, km
  // Continents (synthesis).
  TE_YOUNG: 20, TE_CRATON: 90, TAU_STABLE: 500,  // km, km, Myr
  H_THICK: 45, H_SOFT: 15,                       // km: overthickened crust softens past H_THICK, by half at +H_SOFT
  H_THIN: 30,                                    // km: stretched crust softens below
  TAU_SUTURE: 100, SUTURE_SOFT: 0.6,             // Myr; the share lost at a fresh suture
  TE_CONT_MIN: 5,
  // Boundaries.
  TE_BREAK: 1,             // km
  // The solver.
  LO: 1,                   // the coarsest level (42 cells), solved exactly
  PRE: 2, POST: 2,         // smoothing sweeps (even: the GPU ping-pongs)
  JACOBI: 0.8,
};

const R_M = 6.371e6;
export const RHO_SED = 2400;   // kg/m³, compacted sediment (from memory)

// ── Rigidity and the elastic thickness ──

/** Flexural rigidity (N m) of an elastic thickness (km). */
export function rigidity(teKm) {
  const t = 1000 * teKm;
  return FLEXURE.E * t * t * t / (12 * (1 - FLEXURE.NU * FLEXURE.NU));
}

/** The flexural length α = (4D/Δρg)^¼ (m). The axisymmetric problems' l = (D/Δρg)^¼ is α/√2. */
export function flexuralLength(D, drho = FLEXURE.RHO_M) { return (4 * D / (drho * FLEXURE.G)) ** 0.25; }

/** The elastic thickness (km) whose plate has flexural length α (m). */
export function teForLength(alpha, drho = FLEXURE.RHO_M) {
  const D = drho * FLEXURE.G * alpha ** 4 / 4;
  return Math.cbrt(D * 12 * (1 - FLEXURE.NU * FLEXURE.NU) / FLEXURE.E) / 1000;
}

function erf(x) {
  // Taylor series: the arguments here are small (|x| < 1).
  let s = 0, term = x;
  for (let k = 0; k < 40; k++) {
    s += term / (2 * k + 1);
    term *= -x * x / (k + 1);
    if (Math.abs(term) < 1e-17) break;
  }
  return 2 / Math.sqrt(Math.PI) * s;
}

function erfinv(y) {
  let x = 0.5 * Math.sqrt(Math.PI) * y;
  for (let k = 0; k < 30; k++) {
    const d = (erf(x) - y) / (2 / Math.sqrt(Math.PI) * Math.exp(-x * x));
    x -= d;
    if (Math.abs(d) < 1e-15) break;
  }
  return x;
}

let oceanCoef = null, oceanKey = '';
/** km per √Myr: the isotherm's depth in a half-space, 2 erf⁻¹(T_iso/T_m) √κ. */
export function oceanCoefficient() {
  const F = FLEXURE, key = `${F.T_ISO}/${F.T_MANTLE}/${F.KAPPA}`;
  if (key !== oceanKey) { oceanKey = key; oceanCoef = 2 * erfinv(F.T_ISO / F.T_MANTLE) * Math.sqrt(F.KAPPA * 3.15576e13) / 1000; }
  return oceanCoef;
}

/** Oceanic Tₑ (km) at an age (Myr). */
export function teOceanic(age) {
  if (!(age > 0)) return 0;
  return Math.min(FLEXURE.TE_OCEAN_MAX, oceanCoefficient() * Math.sqrt(age));
}

/** Continental Tₑ (km) from the crust's age (Myr), its thickness (km) and the time since it was sutured (Myr). (Synthesis.) */
export function teContinental(age, h, sinceSuture = Infinity) {
  const F = FLEXURE;
  let te = F.TE_YOUNG + (F.TE_CRATON - F.TE_YOUNG) * (1 - Math.exp(-Math.max(0, age) / F.TAU_STABLE));
  if (h > F.H_THICK) { const u = (h - F.H_THICK) / F.H_SOFT; te /= 1 + u * u; }
  if (h < F.H_THIN) te *= Math.max(0.3, h / F.H_THIN);
  if (sinceSuture < 10 * F.TAU_SUTURE) te *= 1 - F.SUTURE_SOFT * Math.exp(-Math.max(0, sinceSuture) / F.TAU_SUTURE);
  return Math.max(F.TE_CONT_MIN, te);
}

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Break the plate at its boundaries: each pair of neighbouring cells on two
 * plates has its weaker cell (ties to the lower plate id) set to at most
 * `te` km. Every path between plates then crosses a weak cell, so the plates
 * meet at hinges: w continuous, slope free, no moment carried.
 */
export function breakAtBoundaries(grid, owner, Te, te = FLEXURE.TE_BREAK) {
  const { n, nbrOff, nbr } = grid, weak = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = owner[i];
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
      const j = nbr[t], b = owner[j];
      if (b === a) continue;
      if (Te[i] < Te[j] || (Te[i] === Te[j] && a < b)) { weak[i] = 1; break; }
    }
  }
  for (let i = 0; i < n; i++) if (weak[i]) Te[i] = Math.min(Te[i], te);
  return weak;
}

/**
 * Tₑ (km) per cell from the plates' state (src/engine/plates.js: t, tf, phi, h,
 * sut, owner): oceanic and continental blended by the felsic fraction, then
 * broken at the boundaries.
 */
export function elasticThickness(tec, out = new Float32Array(tec.grid.n), { broken = true } = {}) {
  const n = tec.grid.n, t = tec.t, oc = oceanCoefficient(), omax = FLEXURE.TE_OCEAN_MAX;
  for (let i = 0; i < n; i++) {
    const age = t - tec.tf[i], f = smoothstep(0.35, 0.65, tec.phi[i]);
    const to = f < 1 ? (age > 0 ? Math.min(omax, oc * Math.sqrt(age)) : 0) : 0;   // teOceanic, its coefficient taken once
    const tc = f > 0 ? teContinental(age, tec.h[i], tec.sut ? t - tec.sut[i] : Infinity) : 0;
    out[i] = (1 - f) * to + f * tc;
  }
  if (broken) breakAtBoundaries(tec.grid, tec.owner, out);
  return out;
}

/**
 * The plates' Tₑ (km per cell, broken), computed once per plate time and shared: the crust's
 * flexure (src/engine/crustflex.js) and the ice's bed (src/engine/ice.js) refresh it on the same
 * schedule, and at the dial's top each would otherwise compute it every step (~5 ms at level 7).
 * The landscape writes the world's crust within the plate step, before either asks.
 */
export function sharedElasticThickness(tec) {
  const c = tec.teShared;
  if (c && c.t === tec.t && c.Te.length === tec.grid.n) return c.Te;
  const Te = elasticThickness(tec, c && c.Te.length === tec.grid.n ? c.Te : new Float32Array(tec.grid.n));
  tec.teShared = { t: tec.t, Te };
  return Te;
}

// ── Loads ──

/**
 * The load (Pa, positive down) whose Airy compensation, q/(ρ_m g), is the
 * root crust.js's elevation implies, plus what the columns carry:
 *   h, felsic   crust (km) and its felsic fraction: ρ_c h g with ρ_c as crust.js's
 *   subs        thermal subsidence (km), as crust.js's (1 − felsic)·subsidence(age) is applied; or `age` (Myr) to compute it
 *   sediment    m of sediment at RHO_SED, if kept apart from h (in this model sediment joins h)
 *   water       m of sea over each cell (crust.js leaves it out)
 *   ice         m of ice (ICE.RHO_I)
 * With `zeroMean` the area-weighted mean is removed: with one Δρ everywhere a
 * uniform load lowers the whole sphere alike and bends nothing.
 * Flexing the whole column moves the opening planet's continental margins by
 * kilometres: crust.js's columns are compensated as
 * they were made, so what bends the plate is a load's change since then.
 */
export function loadOf(grid, { h, felsic, subs = null, age = null, sediment = null, water = null, ice = null }, out = new Float64Array(grid.n), { zeroMean = true } = {}) {
  const n = grid.n, g = FLEXURE.G, rm = FLEXURE.RHO_M;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let q = 0;
    if (h) {
      const f = felsic ? felsic[i] : 0, rho = 1000 * (RHO_OCEANIC + (RHO_CONTINENTAL - RHO_OCEANIC) * f);
      q += rho * 1000 * h[i] * g;
      const s = subs ? subs[i] : age ? (1 - f) * subsidence(age[i]) : 0;
      q += rm * g * 1000 * s;
    }
    if (sediment) q += RHO_SED * sediment[i] * g;
    if (water) q += ICE.RHO_W * water[i] * g;
    if (ice) q += ICE.RHO_I * ice[i] * g;
    out[i] = q;
    sum += q * grid.area[i];
  }
  if (zeroMean) { const m = sum / (4 * Math.PI); for (let i = 0; i < n; i++) out[i] -= m; }
  return out;
}
/** The Airy deflection q/(Δρ g) (m, positive down): the plate's limit as D → 0. */
export function airy(q, drho = FLEXURE.RHO_M, out = new Float64Array(q.length)) {
  for (let i = 0; i < q.length; i++) out[i] = q[i] / ((typeof drho === 'number' ? drho : drho[i]) * FLEXURE.G);
  return out;
}

/** The change to an Airy elevation (km) that flexure makes: (w_Airy − w)/1000. Its area-weighted mean is zero. */
export function correction(q, w, drho = FLEXURE.RHO_M, out = new Float64Array(q.length)) {
  for (let i = 0; i < q.length; i++) out[i] = (q[i] / ((typeof drho === 'number' ? drho : drho[i]) * FLEXURE.G) - w[i]) / 1000;
  return out;
}

// ── The levels ──

/** The scale: s2 = 2a²/α_ref², so that the rows' area terms are s2·A (A in sr). */
export function scaleOf() {
  const alpha = flexuralLength(rigidity(FLEXURE.TE_REF), FLEXURE.RHO_M);
  return { s2: 2 * R_M * R_M / (alpha * alpha), kref: FLEXURE.RHO_M * FLEXURE.G, Dref: rigidity(FLEXURE.TE_REF) };
}

/** Levels lo..grid.level: edge weights ℓ/d, their sums, the coefficients' arrays, and the transfers between neighbours. */
export function flexureLevels(grid, lo = FLEXURE.LO, have = []) {
  const levels = [];
  for (let L = lo; L <= grid.level; L++) {
    const g = L === grid.level ? grid : have.find(h => h.level === L) || buildGrid(L);
    const n = g.n, m = g.nbrOff[n], wt = new Float64Array(m), s = new Float64Array(n);
    for (let i = 0; i < n; i++) for (let t = g.nbrOff[i], e = g.nbrOff[i + 1]; t < e; t++) { wt[t] = g.ell[t] / g.dist[t]; s[i] += wt[t]; }
    levels.push({ L, g, n, wt, s, cinv: new Float64Array(n), kap: new Float64Array(n) });
  }
  for (let k = 1; k < levels.length; k++) levels[k].T = makeTransfer(levels[k].g, levels[k - 1].g);
  return levels;
}

/** Each level's 1/p = D_ref/D and κ = Δρ/ρ_m, the top's from Tₑ and restricted down by area-weighted means. */
export function setCoefficients(levels, Te, drho = FLEXURE.RHO_M) {
  const top = levels[levels.length - 1], n = top.n, Dref = rigidity(FLEXURE.TE_REF), rm = FLEXURE.RHO_M;
  for (let i = 0; i < n; i++) {
    top.cinv[i] = Dref / rigidity(Math.max(FLEXURE.TE_MIN, Te[i]));
    top.kap[i] = (typeof drho === 'number' ? drho : drho[i]) / rm;
  }
  for (let k = levels.length - 1; k >= 1; k--) {
    restrict(levels[k].T, levels[k].cinv, levels[k - 1].cinv);
    restrict(levels[k].T, levels[k].kap, levels[k - 1].kap);
  }
}

/**
 * The coarsest level's 2n×2n matrix (row-major, unknowns interleaved μ₀ w₀ μ₁ w₁ …),
 * from neighbour lists and weights given per cell: nb(i) → [[j, w], …].
 */
export function coarseMatrix(n, nb, area, cinv, kap, s2) {
  const N = 2 * n, M = new Float64Array(N * N);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const [j, w] of nb(i)) {
      if (w === 0 || j === i) continue;
      s += w;
      M[(2 * i) * N + 2 * j + 1] -= w;        // μ-row: K w
      M[(2 * i + 1) * N + 2 * j] -= w;        // w-row: K μ
    }
    const sa = s2 * area[i];
    M[(2 * i) * N + 2 * i] = -sa * cinv[i];
    M[(2 * i) * N + 2 * i + 1] += s;
    M[(2 * i + 1) * N + 2 * i] += s;
    M[(2 * i + 1) * N + 2 * i + 1] = sa * kap[i];
  }
  return M;
}

/** The inverse of a dense N×N matrix (Gauss–Jordan with partial pivoting, f64). */
export function invert(M, N) {
  M = Float64Array.from(M);
  const I = new Float64Array(N * N);
  for (let i = 0; i < N; i++) I[i * N + i] = 1;
  for (let p = 0; p < N; p++) {
    let piv = p;
    for (let r = p + 1; r < N; r++) if (Math.abs(M[r * N + p]) > Math.abs(M[piv * N + p])) piv = r;
    if (piv !== p) for (let k = 0; k < N; k++) {
      let t = M[p * N + k]; M[p * N + k] = M[piv * N + k]; M[piv * N + k] = t;
      t = I[p * N + k]; I[p * N + k] = I[piv * N + k]; I[piv * N + k] = t;
    }
    const d = 1 / M[p * N + p];
    for (let k = 0; k < N; k++) { M[p * N + k] *= d; I[p * N + k] *= d; }
    for (let r = 0; r < N; r++) {
      if (r === p) continue;
      const f = M[r * N + p];
      if (f === 0) continue;
      for (let k = 0; k < N; k++) { M[r * N + k] -= f * M[p * N + k]; I[r * N + k] -= f * I[p * N + k]; }
    }
  }
  return I;
}

// ── The solver ──

export class Flexure {
  /** On `grid` (the engine's); `have` lends grids already built for the coarser levels. */
  constructor(grid, { lo = FLEXURE.LO, have = [] } = {}) {
    this.grid = grid;
    this.n = grid.n;
    this.levels = flexureLevels(grid, lo, have);
    for (const lv of this.levels) {
      lv.x = new Float64Array(2 * lv.n); lv.b = new Float64Array(2 * lv.n);
      lv.y = new Float64Array(2 * lv.n); lv.r = new Float64Array(2 * lv.n);
    }
    Object.assign(this, scaleOf());
    this.w = new Float64Array(grid.n);
    this.ready = false;
    this.stats = { cycles: 0, residual: 0, history: [] };
  }

  /** Rigidity from Tₑ (km per cell) and Δρ (kg/m³: a number, or one per cell). */
  setRigidity(Te, drho = FLEXURE.RHO_M) {
    setCoefficients(this.levels, Te, drho);
    this.drho = drho;
    const c = this.levels[0], g = c.g;
    const nb = i => { const out = []; for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) out.push([g.nbr[t], c.wt[t]]); return out; };
    this.coarseInv = invert(coarseMatrix(c.n, nb, g.area, c.cinv, c.kap, this.s2), 2 * c.n);
    this.ready = true;
  }

  /** Forget the last solution (a cold start). */
  reset() { for (const lv of this.levels) lv.x.fill(0); }

  /**
   * w (m, positive down) under q (Pa), warm-started from the last solve. Tₑ (km)
   * resets the rigidity; omit it to keep the last. Cycles until the residual is
   * below `tol` of the load's, or `cycles` if given. Returns this.w (overwritten
   * by the next solve).
   */
  solve(q, Te = null, { tol = 1e-6, maxCycles = 40, cycles = 0, warm = true, drho = this.drho ?? FLEXURE.RHO_M } = {}) {
    if (Te) this.setRigidity(Te, drho);
    if (!this.ready) throw new Error('flexure: no rigidity (pass Te)');
    if (!warm) this.reset();
    const top = this.levels[this.levels.length - 1], A = top.g.area, b = top.b, s2 = this.s2, kref = this.kref;
    let bn = 0;
    for (let i = 0; i < top.n; i++) { b[2 * i] = 0; b[2 * i + 1] = s2 * A[i] * q[i] / kref; bn += b[2 * i + 1] ** 2; }
    bn = Math.sqrt(bn) || 1;
    const hist = this.stats.history = [];
    let res = this.residualNorm(top) / bn, k = 0;
    hist.push(res);
    const want = cycles || maxCycles;
    while (k < want && (cycles || res > tol)) {
      this.vcycle();
      k++;
      res = this.residualNorm(top) / bn;
      hist.push(res);
    }
    this.stats.cycles = k; this.stats.residual = res;
    const x = top.x, w = this.w;
    for (let i = 0; i < top.n; i++) w[i] = x[2 * i + 1];
    return w;
  }

  vcycle() {
    const L = this.levels, F = FLEXURE;
    for (let k = L.length - 1; k >= 1; k--) {
      for (let s = 0; s < F.PRE; s++) this.smooth(L[k]);
      this.restrictTo(L[k], L[k - 1]);
    }
    this.coarse(L[0]);
    for (let k = 1; k < L.length; k++) {
      this.prolongFrom(L[k - 1], L[k]);
      for (let s = 0; s < F.POST; s++) this.smooth(L[k]);
    }
  }

  /** One sweep of collective damped Jacobi. */
  smooth(lv) {
    const { n, g, wt, s, cinv, kap, x, b, y } = lv, A = g.area, off = g.nbrOff, nbr = g.nbr, s2 = this.s2, om = FLEXURE.JACOBI;
    for (let i = 0; i < n; i++) {
      const mi = x[2 * i], wi = x[2 * i + 1];
      let Km = 0, Kw = 0;
      for (let t = off[i], e = off[i + 1]; t < e; t++) { const j = nbr[t], c = wt[t]; Km += c * (mi - x[2 * j]); Kw += c * (wi - x[2 * j + 1]); }
      const sa = s2 * A[i], a = sa * cinv[i], d = sa * kap[i], si = s[i];
      const r1 = b[2 * i] + a * mi - Kw, r2 = b[2 * i + 1] - Km - d * wi;
      const det = -a * d - si * si;
      y[2 * i] = mi + om * (d * r1 - si * r2) / det;
      y[2 * i + 1] = wi + om * (-si * r1 - a * r2) / det;
    }
    lv.x = y; lv.y = x;
  }

  /** r = b − Lx on a level. */
  residual(lv, r = lv.r) {
    const { n, g, wt, cinv, kap, x, b } = lv, A = g.area, off = g.nbrOff, nbr = g.nbr, s2 = this.s2;
    for (let i = 0; i < n; i++) {
      const mi = x[2 * i], wi = x[2 * i + 1];
      let Km = 0, Kw = 0;
      for (let t = off[i], e = off[i + 1]; t < e; t++) { const j = nbr[t], c = wt[t]; Km += c * (mi - x[2 * j]); Kw += c * (wi - x[2 * j + 1]); }
      const sa = s2 * A[i];
      r[2 * i] = b[2 * i] + sa * cinv[i] * mi - Kw;
      r[2 * i + 1] = b[2 * i + 1] - Km - sa * kap[i] * wi;
    }
    return r;
  }

  residualNorm(lv) {
    const r = this.residual(lv);
    let s = 0;
    for (let i = 0; i < r.length; i++) s += r[i] * r[i];
    return Math.sqrt(s);
  }

  restrictTo(f, c) {
    const r = this.residual(f), { nc, par } = f.T, cb = c.b;
    for (let i = 0; i < 2 * nc; i++) cb[i] = r[i];
    for (let m = nc; m < f.n; m++) {
      const p0 = par[2 * (m - nc)], p1 = par[2 * (m - nc) + 1], rm = 0.5 * r[2 * m], rw = 0.5 * r[2 * m + 1];
      cb[2 * p0] += rm; cb[2 * p0 + 1] += rw; cb[2 * p1] += rm; cb[2 * p1 + 1] += rw;
    }
    c.x.fill(0);
  }

  prolongFrom(c, f) {
    const { nc, par } = f.T, xc = c.x, xf = f.x;
    for (let i = 0; i < 2 * nc; i++) xf[i] += xc[i];
    for (let m = nc; m < f.n; m++) {
      const p0 = par[2 * (m - nc)], p1 = par[2 * (m - nc) + 1];
      xf[2 * m] += 0.5 * (xc[2 * p0] + xc[2 * p1]);
      xf[2 * m + 1] += 0.5 * (xc[2 * p0 + 1] + xc[2 * p1 + 1]);
    }
  }

  coarse(lv) {
    const N = 2 * lv.n, inv = this.coarseInv, b = lv.b, x = lv.x;
    for (let r = 0; r < N; r++) {
      let s = 0;
      for (let c = 0; c < N; c++) s += inv[r * N + c] * b[c];
      x[r] = s;
    }
  }

  /**
   * The independent reference: conjugate gradients on the SPD form
   * (K (p/s2A) K + s2Aκ) w = s2A q/k_ref, Jacobi-preconditioned. Cold; slow.
   */
  solveCG(q, Te = null, { tol = 1e-10, maxIter = 50000, drho = this.drho ?? FLEXURE.RHO_M } = {}) {
    if (Te) this.setRigidity(Te, drho);
    const top = this.levels[this.levels.length - 1], { n, g, wt, s, cinv, kap } = top, A = g.area, off = g.nbrOff, nbr = g.nbr, s2 = this.s2;
    const lam = Float64Array.from(cinv, (c, i) => 1 / (c * s2 * A[i]));       // p/(s2 A)
    const dg = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let d = s[i] * s[i] * lam[i] + s2 * A[i] * kap[i];
      for (let t = off[i], e = off[i + 1]; t < e; t++) d += wt[t] * wt[t] * lam[nbr[t]];
      dg[i] = d;
    }
    const Kv = new Float64Array(n);
    const apply = (v, out) => {
      for (let i = 0; i < n; i++) { let a = 0; for (let t = off[i], e = off[i + 1]; t < e; t++) a += wt[t] * (v[i] - v[nbr[t]]); Kv[i] = a * lam[i]; }
      for (let i = 0; i < n; i++) { let a = 0; for (let t = off[i], e = off[i + 1]; t < e; t++) a += wt[t] * (Kv[i] - Kv[nbr[t]]); out[i] = a + s2 * A[i] * kap[i] * v[i]; }
    };
    const x = new Float64Array(n), r = Float64Array.from(q, (v, i) => s2 * A[i] * v / this.kref);
    const z = new Float64Array(n), p = new Float64Array(n), Ap = new Float64Array(n);
    let bn = 0;
    for (let i = 0; i < n; i++) bn += r[i] * r[i];
    bn = Math.sqrt(bn) || 1;
    for (let i = 0; i < n; i++) { z[i] = r[i] / dg[i]; p[i] = z[i]; }
    let rz = 0;
    for (let i = 0; i < n; i++) rz += r[i] * z[i];
    let it = 0, rn = 1;
    for (; it < maxIter; it++) {
      apply(p, Ap);
      let pAp = 0;
      for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
      const al = rz / pAp;
      let rr = 0;
      for (let i = 0; i < n; i++) { x[i] += al * p[i]; r[i] -= al * Ap[i]; rr += r[i] * r[i]; }
      rn = Math.sqrt(rr) / bn;
      if (rn < tol) { it++; break; }
      let rz2 = 0;
      for (let i = 0; i < n; i++) { z[i] = r[i] / dg[i]; rz2 += r[i] * z[i]; }
      const be = rz2 / rz;
      rz = rz2;
      for (let i = 0; i < n; i++) p[i] = z[i] + be * p[i];
    }
    this.cgStats = { iterations: it, residual: rn };
    return x;
  }
}
