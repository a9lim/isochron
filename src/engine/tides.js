// The ocean's tides and the Moon they drive away.
//
// The tide: linear shallow water on the rotating sphere, forced by the
// equilibrium tide of the Moon (and, scaled, the Sun), on a C grid over the
// Voronoi cells: the sea's height on cells, the velocity normal to each edge
// between two sea cells (a coast's edges are closed). Coriolis acts on each
// edge through the other edges of its two cells, with weights from Perot's
// reconstruction of the cells' velocities, made energy-neutral (below); stepped
// forward–backward, with Heun's step for the rotation (pure rotation then grows
// by (fΔt)⁴/8 a step, ~1e-8, far under any drag). It runs until periodic, then
// the semidiurnal harmonic is read off
// over a cycle: amplitude and phase on every sea cell, so co-tidal lines and
// amphidromic points come out of the basins' shapes and the planet's spin.
//   drag        bottom friction, linearized (C_D·U₀/H), strongest on shelves;
//               and conversion to internal tides over rough deep floor
//               (½κh²N/H, as Jayne and St. Laurent's), h the depth's step
//               between neighbouring cells
//   self-attraction and loading: the sea's height scaled by β ≈ 0.9; the body
//               tide by α = 1 + k₂ − h₂ ≈ 0.69 (standard values, from memory)
// Dissipation is the drag's work, cycle-averaged: what slows the spin.
//   Coriolis, energy-neutral: Perot's velocities averaged onto an edge give a
//               rotation that is nearly antisymmetric when the depth is uniform,
//               but the energy weighs each edge by its depth (Σ ρ H u² ℓ d), so
//               where one cell's edges span a deep sea and a shelf (a cliff of a
//               coast, a trench beside a margin) it made energy: ~f ΔH/H against
//               a deep drag ~1e-5/s, and in 6–25 Myr of moving coasts one such
//               cell grew without bound (606 m, 1,500 TW, the spin through zero).
//               The weights are antisymmetrized in that norm, M' = ½(M − D⁻¹MᵀD),
//               D = H ℓ d, so Coriolis does no work at all: TRiSK's linear form,
//               ½(1 + H′/H) (Thuburn and others 2009; Ringler and others 2010;
//               standard, from memory), on Perot's weights (synthesis).
//
// The Moon: each tide's torque is its dissipation over the rate it is dragged
// past the planet (P = T(Ω − n)); the planet's spin slows by T/C and the Moon's
// orbit takes the angular momentum (L = μ√(GMa)), so it recedes. The solar
// tide slows the spin too, against the year. The planet starts with Earth's
// Moon at its present distance and Earth's day; at Earth's dissipation (3.7 TW)
// this recedes the Moon 3.8 cm/yr and lengthens the day 2.1 ms a century, as
// lunar laser ranging and eclipse records give (from memory). The tide's
// forcing scales with (R/a)³ and its dissipation with its square, and the
// semidiurnal frequency 2(Ω − n) moves as the day lengthens, so the basins'
// resonances (which set the dissipation) shift: as the continents move, the
// Moon's recession speeds and slows.

export const TIDES = {
  G: 9.81,
  RHO: 1025,
  ALPHA: 0.69,        // 1 + k₂ − h₂: the body tide's share of the forcing
  BETA: 0.9,          // self-attraction and loading, as a scale on the sea's height
  CDU: 0.0025,        // m/s: bottom drag coefficient × the tide's typical speed (linearized)
  K_IT: 3e-8,         // 1/(m s): internal-tide drag ½κN, against the depth's step² between cells (shelves then take about half)
  H_MIN: 20,          // m: the shallowest sea the tide sees
  SOLAR: 0.46,        // the solar semidiurnal tide against the lunar (Earth's)
  DIURNAL: 1.25,      // dissipation of all lunar tides against the semidiurnal's (from memory)
  CYCLES: 32,         // tidal cycles a cold solve runs (warm: WARM), the last one read (a basin mode rings for days)
  WARM: 5,
};

export const EARTH = {
  R: 6.371e6, M: 5.972e24, C: 8.04e37,   // radius m, mass kg, polar moment of inertia kg m²
  m: 7.342e22,                            // the Moon's mass
  a0: 3.844e8,                            // the Moon's distance today, m
  Omega0: 7.2921e-5,                      // the spin today, rad/s (sidereal)
  GM: 6.674e-11,                          // G
  Msun: 1.989e30, AU: 1.496e11,
};

/** The lunar semidiurnal equilibrium tide's amplitude at distance a (m): ¾ (m/M)(R/a)³ R. */
export const lunarTide = a => 0.75 * (EARTH.m / EARTH.M) * (EARTH.R / a) ** 3 * EARTH.R;
/** The Moon's orbital rate at distance a (rad/s). */
export const meanMotion = a => Math.sqrt(EARTH.GM * (EARTH.M + EARTH.m) / a ** 3);

/**
 * The grid's edges for the C grid: each pair of neighbours once (i < j), and for
 * each cell its edges in neighbour order with the sign that turns the edge's
 * normal (i → j) outward from the cell.
 */
export function tideMesh(grid) {
  const { n, nbrOff, nbr, pos, ell, dist, tan, area } = grid;
  const m = nbrOff[n];
  const cellEdge = new Int32Array(m), cellSign = new Int8Array(m);
  const ea = [], eb = [], eT = [];
  for (let i = 0; i < n; i++) for (let t = nbrOff[i]; t < nbrOff[i + 1]; t++) {
    const j = nbr[t];
    if (i < j) { cellEdge[t] = ea.length; cellSign[t] = 1; ea.push(i); eb.push(j); eT.push(t); }
  }
  // The other side's slots.
  for (let i = 0; i < n; i++) for (let t = nbrOff[i]; t < nbrOff[i + 1]; t++) {
    const j = nbr[t];
    if (i > j) {
      for (let s = nbrOff[j]; s < nbrOff[j + 1]; s++) if (nbr[s] === i) { cellEdge[t] = cellEdge[s]; cellSign[t] = -1; break; }
    }
  }
  const ne = ea.length;
  const A = Int32Array.from(ea), B = Int32Array.from(eb);
  const len = new Float64Array(ne), d = new Float64Array(ne), nrm = new Float64Array(3 * ne), mid = new Float64Array(3 * ne), aE = new Float64Array(ne);
  for (let e = 0; e < ne; e++) {
    const t = eT[e], i = A[e], j = B[e];
    len[e] = ell[t]; d[e] = dist[t];
    const x = pos[3 * i] + pos[3 * j], y = pos[3 * i + 1] + pos[3 * j + 1], z = pos[3 * i + 2] + pos[3 * j + 2], r = Math.hypot(x, y, z);
    mid[3 * e] = x / r; mid[3 * e + 1] = y / r; mid[3 * e + 2] = z / r;
    // The normal at the edge: i → j, in the tangent plane at the midpoint.
    let nx = pos[3 * j] - pos[3 * i], ny = pos[3 * j + 1] - pos[3 * i + 1], nz = pos[3 * j + 2] - pos[3 * i + 2];
    const dd = nx * mid[3 * e] + ny * mid[3 * e + 1] + nz * mid[3 * e + 2];
    nx -= dd * mid[3 * e]; ny -= dd * mid[3 * e + 1]; nz -= dd * mid[3 * e + 2];
    const nr = Math.hypot(nx, ny, nz);
    nrm[3 * e] = nx / nr; nrm[3 * e + 1] = ny / nr; nrm[3 * e + 2] = nz / nr;
    aE[e] = len[e] * d[e] / 2;   // the edge's diamond (steradians); they sum to 4π
  }
  // Coriolis per unit Ω: −f (r̂ × v̄)·n̂ on edge e, v̄ the mean of its two cells' velocities
  // rebuilt by Perot (v_i = Σ_t (s u)_t w_t tan_t, w = ℓ (d/2) / A_i), is linear in the other
  // edges of those cells (at most ten; e's own term, ~0, is dropped). `ct` is each entry's
  // transpose: where e stands in the row of the edge it reads.
  const cOff = new Int32Array(ne + 1), cIdx = [], cM = [];
  for (let e = 0; e < ne; e++) {
    const rx = mid[3 * e], ry = mid[3 * e + 1], rz = mid[3 * e + 2], f = 2 * rz;
    for (const c of [A[e], B[e]]) for (let t = nbrOff[c]; t < nbrOff[c + 1]; t++) {
      const e2 = cellEdge[t];
      if (e2 === e) continue;
      const w = cellSign[t] * ell[t] * dist[t] / 2 / area[c], tx = tan[3 * t], ty = tan[3 * t + 1], tz = tan[3 * t + 2];
      const cx = ry * tz - rz * ty, cy = rz * tx - rx * tz, cz = rx * ty - ry * tx;
      cIdx.push(e2); cM.push(-f * 0.5 * w * (cx * nrm[3 * e] + cy * nrm[3 * e + 1] + cz * nrm[3 * e + 2]));
    }
    cOff[e + 1] = cIdx.length;
  }
  const ct = new Int32Array(cIdx.length);
  for (let e = 0; e < ne; e++) for (let k = cOff[e]; k < cOff[e + 1]; k++) {
    const e2 = cIdx[k];
    let q = cOff[e2];
    while (cIdx[q] !== e) q++;
    ct[k] = q;
  }
  return { grid, n, ne, A, B, len, d, nrm, mid, aE, cellEdge, cellSign, cOff, cIdx: Int32Array.from(cIdx), cM: Float64Array.from(cM), ct };
}

/**
 * The tide on the CPU (the reference; the page runs src/gpu/tides.js). `ocean(depthM)`
 * sets the sea (depth in metres, 0 on land); `solve(omega, forcing)` runs to periodic
 * and returns the semidiurnal harmonic (η ≈ C cos ωt + S sin ωt, metres), each cell's
 * dissipation (W/m²) and the total (W), for an equilibrium tide of unit amplitude.
 */
export class Tides {
  constructor(grid, mesh = tideMesh(grid)) {
    this.mesh = mesh;
    const { n, ne } = mesh;
    this.n = n; this.ne = ne;
    this.H = new Float64Array(n); this.He = new Float64Array(ne); this.r = new Float64Array(ne);
    this.eta = new Float64Array(n); this.u = new Float64Array(ne); this.us = new Float64Array(ne);
    this.corW = new Float64Array(mesh.cIdx.length);   // the Coriolis weights per unit Ω, energy-neutral for this sea
    this.cosEq = new Float64Array(n); this.sinEq = new Float64Array(n);
    const pos = grid.pos;
    // The semidiurnal equilibrium tide's shape: cos²φ e^{2iλ} (the Moon over the equator).
    for (let i = 0; i < n; i++) {
      const x = pos[3 * i], y = pos[3 * i + 1], c2 = x * x + y * y;
      const lam = Math.atan2(y, x);
      this.cosEq[i] = c2 * Math.cos(2 * lam); this.sinEq[i] = c2 * Math.sin(2 * lam);
    }
  }

  /** The sea: depth per cell in metres (≤ 0: land). */
  ocean(depth) {
    const { A, B, ne } = this.mesh, T = TIDES, H = this.H;
    for (let i = 0; i < this.n; i++) H[i] = depth[i] > 0 ? Math.max(T.H_MIN, depth[i]) : 0;
    for (let e = 0; e < ne; e++) {
      const a = H[A[e]], b = H[B[e]];
      if (!(a > 0 && b > 0)) { this.He[e] = 0; this.r[e] = 0; this.u[e] = 0; continue; }
      // Roughness: the depth's step between the cells, at most a quarter of the depth (a
      // continental slope's whole drop isn't a hill the tide drags over), over the mean depth.
      const h = Math.min(a, b), hm = 0.5 * (a + b), step = Math.min(Math.abs(a - b), 0.25 * hm);
      this.He[e] = h;
      this.r[e] = T.CDU / h + T.K_IT * step * step / hm;
    }
    for (let i = 0; i < this.n; i++) if (!(H[i] > 0)) this.eta[i] = 0;
    // Coriolis antisymmetrized in the energy's norm, D = H ℓ d: M' = ½(M − D⁻¹MᵀD), so that
    // Σ D u M'u = 0 for every u (see the head of the file). Closed edges read and get nothing.
    const { cOff, cIdx, cM, ct, len, d } = this.mesh, W = this.corW;
    for (let e = 0; e < ne; e++) {
      const De = this.He[e] * len[e] * d[e];
      for (let k = cOff[e]; k < cOff[e + 1]; k++) {
        const e2 = cIdx[k];
        W[k] = De > 0 && this.He[e2] > 0 ? 0.5 * (cM[k] - this.He[e2] * len[e2] * d[e2] / De * cM[ct[k]]) : 0;
      }
    }
  }

  /** Coriolis on edge e from the edges' u, per unit Ω (multiply by Ω). */
  coriolis(e, u) {
    const { cOff, cIdx } = this.mesh, W = this.corW;
    let c = 0;
    for (let k = cOff[e]; k < cOff[e + 1]; k++) c += W[k] * u[cIdx[k]];
    return c;
  }

  /** Run to periodic at frequency omega (rad/s) under spin Omega; `cycles` periods, the last read. */
  solve(omega, Omega, cycles = TIDES.CYCLES) {
    const T = TIDES, { A, B, d, len, aE, ne, grid } = this.mesh, R = EARTH.R, n = this.n, H = this.H;
    const { nbrOff, area } = grid;
    // The step: ~0.4 of the fastest gravity wave's crossing of the shortest edge, a whole number to the period.
    let cmax = 0, dmin = Infinity;
    for (let e = 0; e < ne; e++) if (this.He[e] > 0) { cmax = Math.max(cmax, Math.sqrt(T.G * Math.max(H[A[e]], H[B[e]]))); dmin = Math.min(dmin, d[e] * R); }
    const period = 2 * Math.PI / omega, N = Math.ceil(period / (0.4 * dmin / Math.max(cmax, 1))), dt = period / N;
    const u = this.u, us = this.us, eta = this.eta, c0 = new Float64Array(ne);
    const C = new Float64Array(n), S = new Float64Array(n), u2 = new Float64Array(ne);
    const ga = T.G * T.ALPHA, gb = T.G * T.BETA;
    for (let k = 0; k < cycles * N; k++) {
      const t = k * dt, cw = Math.cos(omega * t), sw = Math.sin(omega * t);
      // Momentum: gravity (with the equilibrium tide), Coriolis by Heun, drag implicit.
      for (let e = 0; e < ne; e++) {
        if (!(this.He[e] > 0)) { us[e] = 0; continue; }
        const i = A[e], j = B[e];
        const eqi = this.cosEq[i] * cw - this.sinEq[i] * sw, eqj = this.cosEq[j] * cw - this.sinEq[j] * sw;
        const grav = -(gb * (eta[j] - eta[i]) - ga * (eqj - eqi)) / (d[e] * R);
        c0[e] = Omega * this.coriolis(e, u);
        us[e] = (u[e] + dt * (grav + c0[e])) / (1 + dt * this.r[e]);
      }
      for (let e = 0; e < ne; e++) {
        if (!(this.He[e] > 0)) continue;
        const i = A[e], j = B[e];
        const eqi = this.cosEq[i] * cw - this.sinEq[i] * sw, eqj = this.cosEq[j] * cw - this.sinEq[j] * sw;
        const grav = -(gb * (eta[j] - eta[i]) - ga * (eqj - eqi)) / (d[e] * R);
        u[e] = (u[e] + dt * (grav + 0.5 * (c0[e] + Omega * this.coriolis(e, us)))) / (1 + dt * this.r[e]);
      }
      // Continuity: the edges' transports.
      const read = k >= (cycles - 1) * N, t1 = t + dt, c1 = Math.cos(omega * t1), s1 = Math.sin(omega * t1);
      for (let i = 0; i < n; i++) {
        if (!(H[i] > 0)) continue;
        let div = 0;
        for (let q = nbrOff[i]; q < nbrOff[i + 1]; q++) { const e = this.mesh.cellEdge[q]; div += this.mesh.cellSign[q] * this.He[e] * u[e] * len[e]; }
        eta[i] -= dt * div / (area[i] * R);
        if (read) { C[i] += eta[i] * c1 * 2 / N; S[i] += eta[i] * s1 * 2 / N; }
      }
      if (read) for (let e = 0; e < ne; e++) u2[e] += u[e] * u[e] / N;
    }
    return this.harvest(C, S, u2);
  }

  /** Dissipation from the cycle-mean u²: 2ρ r H ⟨u²⟩ per edge's diamond (the edges carry one component each). */
  harvest(C, S, u2) {
    const { A, B, aE, ne } = this.mesh, R = EARTH.R, n = this.n, area = this.mesh.grid.area;
    const diss = new Float64Array(n);
    let P = 0;
    for (let e = 0; e < ne; e++) {
      if (!(this.He[e] > 0)) continue;
      const w = 2 * TIDES.RHO * this.r[e] * this.He[e] * u2[e] * aE[e] * R * R;   // W
      P += w;
      diss[A[e]] += 0.5 * w; diss[B[e]] += 0.5 * w;
    }
    for (let i = 0; i < n; i++) diss[i] /= area[i] * R * R;
    return { C: Float32Array.from(C), S: Float32Array.from(S), diss: Float32Array.from(diss), P };
  }
}

const YEAR_S = 3.15576e7, N_YEAR = 2 * Math.PI / YEAR_S;   // s; the Sun's mean motion, rad/s

/**
 * The planet's spin and its Moon. `Punit` is the lunar semidiurnal tide's dissipation
 * for a unit equilibrium tide, from a solve at the frequency `omegaSolved`; the actual
 * scales with the square of the tide's amplitude at the Moon's distance.
 *
 * Between solves the tide keeps a constant time lag (standard: Mignard's and Hut's
 * weak-friction tide): its torque is k(Ω − n), so the dissipation T(Ω − n) goes as
 * (Ω − n)², and k is set by the last solve, k = P/(Ω − n)² there. Holding the
 * dissipation instead made the torque P/(Ω − n) grow without bound toward the
 * synchronous spin, and an explicit step could carry the spin through it. Within a
 * re-solve's 0.3% the two differ by 0.6%.
 */
export class Moon {
  constructor() {
    this.a = EARTH.a0;
    this.Omega = EARTH.Omega0;
    this.Punit = 0;                      // W per m² of equilibrium amplitude, the last solve's
    this.omegaSolved = this.omega;       // the lunar semidiurnal frequency 2(Ω − n) it was solved at
    this.spinSolved = this.Omega;        // and the spin then (the solar tide's frequency is 2(Ω − n☉))
  }
  /** Take a solve: its dissipation per unit equilibrium tide, at the frequency and spin it ran with. */
  solved(Punit, omega, Omega) { this.Punit = Punit; this.omegaSolved = omega; this.spinSolved = Omega; }
  /** N m s: each tide's torque per unit (Ω − its body's mean motion), now. */
  get kL() { const amp = lunarTide(this.a); return this.Punit * amp * amp * TIDES.DIURNAL / (0.5 * this.omegaSolved) ** 2; }
  get kS() { return this.Punit * (TIDES.SOLAR * lunarTide(EARTH.a0)) ** 2 / (this.spinSolved - N_YEAR) ** 2; }
  /** W: the lunar tides' dissipation and the solar's, now. */
  get PL() { const x = this.Omega - meanMotion(this.a); return this.kL * x * x; }
  get PS() { const x = this.Omega - N_YEAR; return this.kS * x * x; }
  get P() { return this.PL + this.PS; }
  /** The semidiurnal lunar tide's frequency (rad/s). */
  get omega() { return 2 * (this.Omega - meanMotion(this.a)); }
  /** The sidereal day (hours) and the solar day. */
  get day() { return 2 * Math.PI / this.Omega / 3600; }
  get solarDay() { return 2 * Math.PI / (this.Omega - N_YEAR) / 3600; }

  /**
   * Advance dt years: the lunar tides' torque recedes the Moon; both tides slow the spin.
   * The spin by backward Euler, C(Ω′ − Ω) = −dt [k_L(Ω′ − n) + k_S(Ω′ − n☉)]: Ω′ is a
   * weighted mean of Ω, n and n☉, so no step carries it past the synchronous spins or
   * below zero, whatever the dissipation. The orbit takes the lunar torque's impulse at Ω′
   * whole (L = μ√(GMa) solved for a), so the step keeps the angular momentum exactly; n is
   * held at its start (the Moon moves ~30 km a step).
   */
  step(dtYears) {
    if (!(this.Punit > 0) || !(dtYears > 0)) return;
    const E = EARTH, s = dtYears * YEAR_S, n = meanMotion(this.a), kL = this.kL, kS = this.kS;
    const Om = (E.C * this.Omega + s * (kL * n + kS * N_YEAR)) / (E.C + s * (kL + kS));
    const TL = kL * (Om - n);
    this.Omega = Om;
    const mu = E.M * E.m / (E.M + E.m), GMt = E.GM * (E.M + E.m);
    const L = mu * Math.sqrt(GMt * this.a) + TL * s;
    this.a = (L / mu) ** 2 / GMt;
  }
}
