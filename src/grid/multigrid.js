// Weighted graph Laplacians on the geodesic grid, solved by conjugate gradients preconditioned
// with a multigrid V-cycle (standard: Galerkin coarsening on nested grids, damped Jacobi
// smoothing; e.g. Trottenberg, Oosterlee and Schüller's Multigrid, from memory). The operator
// is A x_i = d_i x_i − Σ_t w_t x_j over i's neighbours j = nbr[t], symmetric (w the same both
// ways), with d_i = Σ_t w_t for a plain Laplacian; a cell with d_i = 0 is out of the domain
// (a sea's Laplacian with the land left out) and stays at 0. Each coarser level's operator is
// Pᵀ A P, P the grid's own prolongation (a coarse cell is the fine cell at its place, a
// midpoint the mean of its two parents: src/grid/transfer.js), so the coarse problem is the
// fine one's on the coarse functions, whatever the domain; on the nested grids its couplings
// stay within each coarse cell's ring. The coarsest level is solved densely, shifted by a
// millionth of its diagonal (the Laplacian's constants are its null space).
//
// Used where the climate's coarse-grid Poisson solves ran hundreds of Jacobi-preconditioned
// iterations each cycle: the air's stream function (src/engine/airheat.js) and the sea's
// overturning potentials (src/engine/seaheat.js).
import { buildGrid } from './icosphere.js';
import { parents } from './transfer.js';

/** Tunable; tools and tests may change them. */
export const MG = {
  LO: 2,          // the coarsest level (162 cells), solved densely
  SWEEPS: 2,      // damped-Jacobi sweeps before and after each coarse correction
  OMEGA: 0.8,     // Jacobi's damping
  SHIFT: 1e-6,    // the coarsest solve's shift, of its diagonal
};

export class LaplaceMG {
  /** On `grid` (a geodesic level), down to level `lo`. */
  constructor(grid, { lo = MG.LO } = {}) {
    this.levels = [];
    for (let g = grid; ; g = buildGrid(g.level - 1)) {
      const n = g.n, m = g.nbrOff[n];
      this.levels.push({ g, n, d: new Float64Array(n), w: new Float64Array(m), inv: new Float64Array(n),
        x: new Float64Array(n), b: new Float64Array(n), r: new Float64Array(n), y: new Float64Array(n), par: null });
      if (g.level <= lo || g.level === 0) break;
    }
    for (let k = 0; k + 1 < this.levels.length; k++) this.levels[k].par = parents(this.levels[k].g, this.levels[k + 1].n);
  }

  /**
   * The fine operator: per-edge weights w (the grid's CSR, symmetric) and the diagonal d (omitted:
   * each row's sum of w, a Laplacian). Builds the coarser levels' operators and the coarsest's inverse.
   */
  setOperator(w, d = null) {
    const L = this.levels, f = L[0], g = f.g;
    f.w.set(w);
    if (d) f.d.set(d);
    else for (let i = 0; i < f.n; i++) { let s = 0; for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) s += w[t]; f.d[i] = s; }
    for (let k = 0; k + 1 < L.length; k++) galerkin(L[k], L[k + 1]);
    for (const lv of L) for (let i = 0; i < lv.n; i++) lv.inv[i] = lv.d[i] > 0 ? 1 / lv.d[i] : 0;
    this.coarseInv = denseInverse(L[L.length - 1]);
  }

  /** A x on the fine level, into out. */
  apply(x, out) { return applyOp(this.levels[0], x, out); }

  /** z ≈ A⁻¹ r: one V-cycle from zero. */
  precondition(r, z) {
    const L = this.levels;
    L[0].b.set(r); L[0].x.fill(0);
    for (let k = 0; k + 1 < L.length; k++) {
      const lv = L[k];
      for (let s = 0; s < MG.SWEEPS; s++) jacobi(lv);
      const r1 = residual(lv), c = L[k + 1], par = lv.par, nc = c.n;
      for (let i = 0; i < nc; i++) c.b[i] = r1[i];
      for (let m = nc; m < lv.n; m++) { const v = 0.5 * r1[m]; c.b[par[2 * (m - nc)]] += v; c.b[par[2 * (m - nc) + 1]] += v; }
      for (let i = 0; i < nc; i++) if (!(c.d[i] > 0)) c.b[i] = 0;
      c.x.fill(0);
    }
    const top = L[L.length - 1], N = top.n, inv = this.coarseInv;
    for (let i = 0; i < N; i++) { let s = 0; const o = i * N; for (let j = 0; j < N; j++) s += inv[o + j] * top.b[j]; top.x[i] = s; }
    for (let k = L.length - 2; k >= 0; k--) {
      const lv = L[k], c = L[k + 1], par = lv.par, nc = c.n, x = lv.x, xc = c.x;
      for (let i = 0; i < nc; i++) x[i] += xc[i];
      for (let m = nc; m < lv.n; m++) x[m] += 0.5 * (xc[par[2 * (m - nc)]] + xc[par[2 * (m - nc) + 1]]);
      for (let i = 0; i < lv.n; i++) if (!(lv.d[i] > 0)) x[i] = 0;
      for (let s = 0; s < MG.SWEEPS; s++) jacobi(lv);
    }
    z.set(L[0].x);
    return z;
  }
}

function applyOp(lv, x, out) {
  const { n, d, w } = lv, off = lv.g.nbrOff, nbr = lv.g.nbr;
  for (let i = 0; i < n; i++) {
    let s = d[i] * x[i];
    for (let t = off[i], e = off[i + 1]; t < e; t++) s -= w[t] * x[nbr[t]];
    out[i] = s;
  }
  return out;
}

function residual(lv) {
  const { n, b, r } = lv;
  applyOp(lv, lv.x, r);
  for (let i = 0; i < n; i++) r[i] = b[i] - r[i];
  return r;
}

/** One damped-Jacobi sweep, x ← x + ω D⁻¹ (b − A x). */
function jacobi(lv) {
  const { n, d, w, inv, b, x, y } = lv, off = lv.g.nbrOff, nbr = lv.g.nbr, om = MG.OMEGA;
  for (let i = 0; i < n; i++) {
    let s = b[i] - d[i] * x[i];
    for (let t = off[i], e = off[i + 1]; t < e; t++) s += w[t] * x[nbr[t]];
    y[i] = x[i] + om * inv[i] * s;
  }
  lv.x = y; lv.y = x;
}

/**
 * The coarse operator Pᵀ A P: each fine coupling A_ij spread to the coarse cells i and j
 * prolong from, which on nested grids are the same cell or neighbours.
 */
function galerkin(f, c) {
  const g = f.g, cg = c.g, nc = c.n, par = f.par, off = g.nbrOff, nbr = g.nbr;
  c.d.fill(0); c.w.fill(0);
  const pa = new Int32Array(2), pw = new Float64Array(2), qa = new Int32Array(2), qw = new Float64Array(2);
  const src = (i, a, wt) => { if (i < nc) { a[0] = i; wt[0] = 1; return 1; } a[0] = par[2 * (i - nc)]; a[1] = par[2 * (i - nc) + 1]; wt[0] = wt[1] = 0.5; return 2; };
  // Adds v to the coarse entry (a, b): the diagonal, or a's edge to b (as −w, so w gets −v).
  const add = (a, b, v) => {
    if (a === b) { c.d[a] += v; return; }
    for (let t = cg.nbrOff[a]; t < cg.nbrOff[a + 1]; t++) if (cg.nbr[t] === b) { c.w[t] -= v; return; }
    throw new Error(`multigrid: coarse cells ${a} and ${b} aren't neighbours`);
  };
  for (let i = 0; i < f.n; i++) {
    if (!(f.d[i] > 0)) continue;
    const ni = src(i, pa, pw);
    for (let u = 0; u < ni; u++) add(pa[u], pa[u], pw[u] * f.d[i] * pw[u]);
    if (ni === 2) { add(pa[0], pa[1], pw[0] * f.d[i] * pw[1]); add(pa[1], pa[0], pw[1] * f.d[i] * pw[0]); }
    for (let t = off[i]; t < off[i + 1]; t++) {
      const v = -f.w[t];
      if (v === 0) continue;
      const nj = src(nbr[t], qa, qw);
      for (let u = 0; u < ni; u++) for (let s = 0; s < nj; s++) add(pa[u], qa[s], pw[u] * v * qw[s]);
    }
  }
}

/** The coarsest level's operator, shifted by SHIFT of its diagonal, inverted (Gauss–Jordan): rows out of the domain give 0. */
function denseInverse(lv) {
  const N = lv.n, g = lv.g, A = new Float64Array(N * N), I = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    I[i * N + i] = 1;
    if (!(lv.d[i] > 0)) { A[i * N + i] = 1; continue; }
    A[i * N + i] = lv.d[i] * (1 + MG.SHIFT);
    for (let t = g.nbrOff[i]; t < g.nbrOff[i + 1]; t++) A[i * N + g.nbr[t]] -= lv.w[t];
  }
  for (let col = 0; col < N; col++) {
    let p = col, best = Math.abs(A[col * N + col]);
    for (let r = col + 1; r < N; r++) { const v = Math.abs(A[r * N + col]); if (v > best) { best = v; p = r; } }
    if (p !== col) for (let k = 0; k < N; k++) { let t = A[col * N + k]; A[col * N + k] = A[p * N + k]; A[p * N + k] = t; t = I[col * N + k]; I[col * N + k] = I[p * N + k]; I[p * N + k] = t; }
    const piv = A[col * N + col];
    for (let k = 0; k < N; k++) { A[col * N + k] /= piv; I[col * N + k] /= piv; }
    for (let r = 0; r < N; r++) {
      if (r === col) continue;
      const fr = A[r * N + col];
      if (fr === 0) continue;
      for (let k = 0; k < N; k++) { A[r * N + k] -= fr * A[col * N + k]; I[r * N + k] -= fr * I[col * N + k]; }
    }
  }
  for (let i = 0; i < N; i++) if (!(lv.d[i] > 0)) for (let k = 0; k < N; k++) I[i * N + k] = 0;
  return I;
}

/**
 * A x = b by conjugate gradients preconditioned with `mg`'s V-cycle, from x (warm), to a
 * residual of `tol` × |b| over the domain, at most `maxIt` iterations, yielding every `slice`
 * (the state is the generator's, so solves may interleave; `work`: three arrays of n kept
 * between calls). x is held at 0 outside the domain. Returns the iterations taken.
 */
export function* mgcg(mg, b, x, { tol = 1e-8, maxIt = 200, slice = 8, work = null } = {}) {
  const n = b.length;
  const [r, p, q] = work && work.length >= 3 && work[0].length === n ? work : Array.from({ length: 3 }, () => new Float64Array(n));
  // The preconditioned residual is used within an iteration only, so solves share it.
  const z = mg.zBuf || (mg.zBuf = new Float64Array(n));
  const d = mg.levels[0].d;
  for (let i = 0; i < n; i++) if (!(d[i] > 0)) x[i] = 0;
  mg.apply(x, q);
  let bn = 0;
  for (let i = 0; i < n; i++) { if (d[i] > 0) { r[i] = b[i] - q[i]; bn += b[i] * b[i]; } else r[i] = 0; }
  bn = Math.sqrt(bn);
  if (!(bn > 0)) return 0;
  const stop = tol * bn;
  let rr = 0;
  for (let i = 0; i < n; i++) rr += r[i] * r[i];
  if (Math.sqrt(rr) <= stop) return 0;
  mg.precondition(r, z);
  p.set(z);
  let rz = 0;
  for (let i = 0; i < n; i++) rz += r[i] * z[i];
  let it = 0;
  while (it < maxIt) {
    mg.apply(p, q);
    let pq = 0;
    for (let i = 0; i < n; i++) pq += p[i] * q[i];
    if (!(pq > 0)) break;
    const a = rz / pq;
    rr = 0;
    for (let i = 0; i < n; i++) { x[i] += a * p[i]; r[i] -= a * q[i]; rr += r[i] * r[i]; }
    it++;
    if (Math.sqrt(rr) <= stop) break;
    mg.precondition(r, z);
    let rz2 = 0;
    for (let i = 0; i < n; i++) rz2 += r[i] * z[i];
    const beta = rz2 / rz;
    rz = rz2;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
    if (it % slice === 0) yield;
  }
  return it;
}
