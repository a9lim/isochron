// The mantle beneath the plates (docs/plates.md, The mantle): not convection, but a mantle that remembers
// (synthesis on standard ideas). On a coarse grid fixed in the mantle's frame (level 4, ~440 km cells):
//   the graveyard   the slabs' area per area of mantle, σ: fed where ocean sinks (the trenches' flux,
//                   plates.js `trenches`) and sinking away to the core over T_SINK, dσ/dt = flux − σ/T_SINK
//                   (slabs take ~150 Myr to cross the lower mantle at ~1.2 cm/yr; from memory)
//   the piles       two hot, dense piles at the core (Earth's large low-shear-velocity provinces under Africa
//                   and the Pacific), each a cap PILE_R across; the mantle rises over them. They drift slowly
//                   away from the slabs that crowd them (PILE_V). Plume heads rise from their edges
//                   (`plumeSite`; Torsvik and others' reconstructions put flood basalts there; from memory)
//   the flow        what sinks rises: sources over the piles carrying the graveyard's whole sink, a flow on
//                   the sphere from the one to the other, ∇²φ = K_FLOW (pile share × ∫σ − σ), u = ∇φ, solved
//                   every SOLVE Myr (conjugate gradients, warm). The plates feel it as basal traction: their
//                   drag is against the mantle's motion, not a mantle at rest (`traction`; continents' keels
//                   the more), so a plate with no slab of its own rides the flow toward the slabs (slab
//                   suction, Conrad and Lithgow-Bertelloni's; Africa's and India's push from beneath)
//   dynamic topography   the same field bends the surface: up over the piles, down over the graveyard
//                   (`dyn`, km, DYN at most, the area's mean nothing), as Africa stands high and the
//                   seas flood over old slabs
// Hotspots drift in the flow (`drift`: the plume's conduit leans in the mantle wind, DRIFT of it).
// Today's Earth's graveyard is Müller et al. 2019's trenches over the last 200 Myr (tools/earth/slabs.py),
// its piles where those slabs have been least (the slabs' history makes the degree-2 pattern; synthesis): under
// the South Pacific and southern Africa, where tomography finds Earth's (from memory).
import { buildGrid, gradient } from '../grid/icosphere.js';
import { makeTransfer, restrict, prolong } from '../grid/transfer.js';
import { stream } from '../rng.js';

/** Tunable; tools and tests may change them. */
export const MANTLE = {
  LEVEL: 4,
  T_SINK: 150,       // Myr: a slab's memory in the lower mantle
  K_FLOW: 0.003,     // 1/Myr: the flow's strength per unit of the graveyard's slab area per area (fitted on today's Earth's plates: tools/earth/plates-score.mjs, the opening's correlation 0.905 → 0.927, 20 Myr on 0.80 → 0.85)
  PILE_R: 0.5,       // rad (~29°): a pile's radius (Earth's are thousands of km across; from memory)
  PILE_V: 0.0005,    // rad/Myr (0.3 cm/yr): the most a pile drifts, pushed from the slabs
  DYN: 0.4,          // km: dynamic topography at most (Earth's residual topography ±~0.5 km at long wavelengths, less than flow models predict; from memory)
  SIGMA_REF: 1.5,    // the graveyard's slab area per area at which its pull on the surface is most of DYN
  DRIFT: 0.5,        // the share of the flow beneath it a hotspot drifts at
  SOLVE: 1,          // Myr of plate time between solves of the flow
};

export class Mantle {
  /** On a Tectonics; `piles` [{ p: unit vector, r }] and `sigma` (coarse, slab area per area) if known, else seeded piles and an empty graveyard. */
  constructor(tec, seed, { piles = null, sigma = null } = {}) {
    this.g = buildGrid(MANTLE.LEVEL);
    const nc = this.g.n;
    this.sigma = sigma ? Float64Array.from(sigma) : new Float64Array(nc);
    this.phi = new Float64Array(nc);
    this.u = new Float64Array(3 * nc);
    this.rate = new Float64Array(nc);
    this.since = Infinity;
    if (piles) this.piles = piles.map(q => ({ p: Float64Array.from(q.p), r: q.r ?? MANTLE.PILE_R }));
    else {
      // Two antipodal piles near the equator (as Earth's sit, where the spin keeps excess mass).
      const r = stream(seed, 'mantle'), lon = 2 * Math.PI * r.uniform(), lat = (r.uniform() - 0.5) * 0.5;
      const p = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
      this.piles = [{ p: Float64Array.from(p), r: MANTLE.PILE_R }, { p: Float64Array.from(p, v => -v), r: MANTLE.PILE_R }];
    }
    this.attach(tec);
  }

  /** Bind to a Tectonics (a new one after refine): its grid's transfer, and its fields for the flow and the topography. */
  attach(tec) {
    this.tec = tec;
    this.T = tec.grid.level > this.g.level ? makeTransfer(tec.grid, this.g) : null;
    const n = tec.grid.n;
    this.fine = new Float64Array(n); this.fine3 = new Float64Array(n);
    tec.mantleU = tec.mantleU && tec.mantleU.length === 3 * n ? tec.mantleU : new Float32Array(3 * n);
    tec.dyn = tec.dyn && tec.dyn.length === n ? tec.dyn : new Float32Array(n);
    tec.mantle = this;
    this.since = Infinity;
  }

  /** The trenches' flux (tec.trenchFlux, sr a Myr per cell) as a rate per area on the coarse grid. */
  gatherFlux() {
    const tec = this.tec, f = this.fine, A = tec.grid.area, tf = tec.trenchFlux;
    for (let i = 0; i < f.length; i++) f[i] = tf[i] / A[i];
    if (this.T) restrict(this.T, f, this.rate); else this.rate.set(f.subarray(0, this.g.n));
    return this.rate;
  }

  /** The graveyard at its steady state under today's flux (rate × T_SINK): a seeded planet's opening. */
  steady() {
    this.gatherFlux();
    for (let i = 0; i < this.g.n; i++) this.sigma[i] = this.rate[i] * MANTLE.T_SINK;
    this.solve();
  }

  /** dt Myr: the graveyard fed and sinking, the piles' drift, the flow solved every SOLVE Myr. With `patch`, the elevation moves by the topography's change. */
  step(dt, patch = false) {
    this.gatherFlux();
    const k = Math.exp(-dt / MANTLE.T_SINK), a = MANTLE.T_SINK * (1 - k), s = this.sigma, rate = this.rate;
    for (let i = 0; i < s.length; i++) s[i] = s[i] * k + rate[i] * a;
    this.since += dt;
    if (this.since >= MANTLE.SOLVE) { this.driftPiles(this.since); this.solve(patch); }
  }

  /** Each pile's cap weight at coarse cell i (cos² to its edge). */
  pileWeight(x, y, z) {
    let w = 0;
    for (const q of this.piles) {
      const d = Math.acos(Math.max(-1, Math.min(1, x * q.p[0] + y * q.p[1] + z * q.p[2])));
      if (d < q.r) { const c = Math.cos(0.5 * Math.PI * d / q.r); w += c * c; }
    }
    return w;
  }

  /** The flow and the topography from the graveyard and the piles; fields onto the fine grid. */
  solve(patch = false) {
    const g = this.g, nc = g.n, pos = g.pos, A = g.area, s = this.sigma;
    this.since = 0;
    // Sources: the piles' share of the graveyard's whole sink; sinks: the graveyard. ∫S dA = 0.
    const pw = new Float64Array(nc);
    let W = 0, Sig = 0;
    for (let i = 0; i < nc; i++) { pw[i] = this.pileWeight(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); W += pw[i] * A[i]; Sig += s[i] * A[i]; }
    const S = new Float64Array(nc);
    for (let i = 0; i < nc; i++) S[i] = MANTLE.K_FLOW * ((W > 0 ? pw[i] / W : 1 / (4 * Math.PI)) * Sig - s[i]);
    this.poisson(S);
    gradient(g, this.phi, this.u);
    // Dynamic topography: up over the piles, down over the graveyard (saturating), the mean nothing.
    const dynC = new Float64Array(nc), sm = smooth(g, s, 2);
    let m = 0;
    for (let i = 0; i < nc; i++) { dynC[i] = MANTLE.DYN * (Math.min(1, pw[i]) - Math.tanh(sm[i] / MANTLE.SIGMA_REF)); m += dynC[i] * A[i]; }
    m /= 4 * Math.PI;
    for (let i = 0; i < nc; i++) dynC[i] -= m;
    this.dynC = dynC;
    // Onto the fine grid.
    const tec = this.tec, n = tec.grid.n, U = tec.mantleU, dyn = tec.dyn, f = this.fine, c = new Float64Array(nc);
    for (let d = 0; d < 3; d++) {
      for (let i = 0; i < nc; i++) c[i] = this.u[3 * i + d];
      if (this.T) prolong(this.T, c, f); else f.set(c);
      for (let i = 0; i < n; i++) U[3 * i + d] = f[i];
    }
    // The flow tangent at each fine cell (prolongation averages two parents' tangent planes).
    const fp = tec.grid.pos;
    for (let i = 0; i < n; i++) { const x = fp[3 * i], y = fp[3 * i + 1], z = fp[3 * i + 2], dt = U[3 * i] * x + U[3 * i + 1] * y + U[3 * i + 2] * z; U[3 * i] -= dt * x; U[3 * i + 1] -= dt * y; U[3 * i + 2] -= dt * z; }
    if (this.T) prolong(this.T, dynC, f); else f.set(dynC);
    // The mean nothing on the fine grid too (prolongation moves it a little), so the sea's level isn't shifted.
    const fa = tec.grid.area;
    let fm = 0;
    for (let i = 0; i < n; i++) fm += f[i] * fa[i];
    fm /= 4 * Math.PI;
    const elev = tec.elev;
    for (let i = 0; i < n; i++) { const v = f[i] - fm; if (patch) elev[i] += v - dyn[i]; dyn[i] = v; }
  }

  /** ∇²φ = S on the coarse grid: conjugate gradients on the symmetric graph Laplacian, warm from the last φ. */
  poisson(S) {
    const g = this.g, nc = g.n, { nbrOff, nbr, ell, dist, area } = g, phi = this.phi;
    const Lx = (x, out) => { for (let i = 0; i < nc; i++) { let v = 0; for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) v += (ell[t] / dist[t]) * (x[i] - x[nbr[t]]); out[i] = v + 1e-9 * area[i] * x[i]; } return out; };
    const b = new Float64Array(nc), r = new Float64Array(nc), p = new Float64Array(nc), Ap = new Float64Array(nc);
    for (let i = 0; i < nc; i++) b[i] = -area[i] * S[i];   // −Σ w (φ_j − φ_i) = −A S
    Lx(phi, Ap);
    let rr = 0, bb = 0;
    for (let i = 0; i < nc; i++) { r[i] = b[i] - Ap[i]; p[i] = r[i]; rr += r[i] * r[i]; bb += b[i] * b[i]; }
    for (let it = 0; it < 400 && rr > 1e-20 * bb; it++) {
      Lx(p, Ap);
      let pAp = 0;
      for (let i = 0; i < nc; i++) pAp += p[i] * Ap[i];
      const al = rr / pAp;
      let rn = 0;
      for (let i = 0; i < nc; i++) { phi[i] += al * p[i]; r[i] -= al * Ap[i]; rn += r[i] * r[i]; }
      const be = rn / rr;
      for (let i = 0; i < nc; i++) p[i] = r[i] + be * p[i];
      rr = rn;
    }
  }

  /** The piles pushed from the slabs that crowd them: down the smoothed graveyard's gradient at each, to PILE_V. */
  driftPiles(dt) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const g = this.g, sm = smooth(g, this.sigma, 2), gr = gradient(g, sm, new Float64Array(3 * g.n));
    for (const q of this.piles) {
      const i = nearestCell(g, q.p), gx = gr[3 * i], gy = gr[3 * i + 1], gz = gr[3 * i + 2], m = Math.hypot(gx, gy, gz);
      if (!(m > 0)) continue;
      const v = MANTLE.PILE_V * Math.min(1, m * q.r / MANTLE.SIGMA_REF) * dt;
      for (let d = 0; d < 3; d++) q.p[d] -= v * gr[3 * i + d] / m;
      const r = Math.hypot(q.p[0], q.p[1], q.p[2]); q.p[0] /= r; q.p[1] /= r; q.p[2] /= r;
    }
  }

  /** The flow (rad/Myr, a tangent 3-vector) at a point: its coarse cell's. */
  flowAt(p) { const i = nearestCell(this.g, p); return [this.u[3 * i], this.u[3 * i + 1], this.u[3 * i + 2]]; }

  /** Where a plume head rises: on a pile's edge (a pile by its area, an azimuth at random), from `rng`. */
  plumeSite(rng) {
    const A = this.piles.map(q => q.r * q.r), tot = A.reduce((a, b) => a + b, 0);
    let u = rng.uniform() * tot, q = this.piles[0];
    for (let k = 0; k < this.piles.length; k++) { if (u < A[k]) { q = this.piles[k]; break; } u -= A[k]; }
    const c = q.p, t = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let e1 = [c[1] * t[2] - c[2] * t[1], c[2] * t[0] - c[0] * t[2], c[0] * t[1] - c[1] * t[0]];
    const m1 = Math.hypot(...e1); e1 = e1.map(v => v / m1);
    const e2 = [c[1] * e1[2] - c[2] * e1[1], c[2] * e1[0] - c[0] * e1[2], c[0] * e1[1] - c[1] * e1[0]];
    const az = 2 * Math.PI * rng.uniform(), d = q.r * (0.85 + 0.3 * rng.uniform()), sd = Math.sin(d), cd = Math.cos(d);
    return [0, 1, 2].map(k => cd * c[k] + sd * (Math.cos(az) * e1[k] + Math.sin(az) * e2[k]));
  }
}

/** Today's Earth's graveyard from the baked history (tools/earth/slabs.py: km² subducted per cell in 10 Myr bins), its piles where the slabs have been least. */
export function earthMantle(tec, slabs) {
  const g = buildGrid(MANTLE.LEVEL), nc = g.n, R2 = 6371 * 6371, sigma = new Float64Array(nc);
  for (let b = 0; b < slabs.bins; b++) {
    const age = (b + 0.5) * slabs.bin, w = Math.exp(-age / MANTLE.T_SINK);
    for (let i = 0; i < nc; i++) sigma[i] += w * slabs.area[b * nc + i] / (g.area[i] * R2);
  }
  // The piles: the quarter of the sphere the smoothed graveyard has least of, in two (k-means on direction),
  // each a cap at its part's centroid, as wide as its part (to 0.4–0.7 rad).
  const sm = smooth(g, sigma, 8), order = [...sm.keys()].sort((p, q) => sm[p] - sm[q]), sel = [];
  for (let A = 0, k = 0; k < nc && A < 0.25 * 4 * Math.PI; k++) { sel.push(order[k]); A += g.area[order[k]]; }
  const P = i => [g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  let c = [P(sel[0])];
  c.push(P(sel.reduce((f, i) => dot(P(i), c[0]) < dot(P(f), c[0]) ? i : f, sel[0])));
  let A = [0, 0];
  for (let it = 0; it < 12; it++) {
    const acc = [[0, 0, 0], [0, 0, 0]];
    A = [0, 0];
    for (const i of sel) { const p = P(i), k = dot(p, c[0]) >= dot(p, c[1]) ? 0 : 1; for (let m = 0; m < 3; m++) acc[k][m] += g.area[i] * p[m]; A[k] += g.area[i]; }
    c = acc.map(v => { const r = Math.hypot(...v); return v.map(x => x / r); });
  }
  const piles = c.map((p, k) => ({ p, r: Math.min(0.7, Math.max(0.4, Math.acos(1 - A[k] / (2 * Math.PI)))) }));
  return new Mantle(tec, 'earth', { sigma, piles });
}

/** Neighbour-averaging passes (area-weighted), each a cell wider. */
function smooth(g, f, passes) {
  let a = Float64Array.from(f), b = new Float64Array(g.n);
  const { nbrOff, nbr, area } = g;
  for (let k = 0; k < passes; k++) {
    for (let i = 0; i < g.n; i++) {
      let s = a[i] * area[i], w = area[i];
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) { const j = nbr[t]; s += a[j] * area[j]; w += area[j]; }
      b[i] = s / w;
    }
    [a, b] = [b, a];
  }
  return a;
}

function nearestCell(g, p) {
  let best = 0, bd = -2;
  for (let i = 0; i < g.n; i++) { const d = g.pos[3 * i] * p[0] + g.pos[3 * i + 1] * p[1] + g.pos[3 * i + 2] * p[2]; if (d > bd) { bd = d; best = i; } }
  return best;
}
