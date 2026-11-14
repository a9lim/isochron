// The ocean's tides and the Moon they drive away.
//
// The tide: linear shallow water on the rotating sphere, forced by the
// equilibrium tide of the Moon (and, scaled, the Sun), on a C grid over the
// Voronoi cells: the sea's height on cells, the velocity normal to each edge
// between two sea cells (a coast's edges are closed). Coriolis acts on each
// edge through the cells' velocity rebuilt from their edges' normals (Perot's
// reconstruction, as models on hexagonal grids do), stepped forward–backward
// with Heun's step for the rotation (pure rotation then neither grows nor
// decays). It runs until periodic, then the semidiurnal harmonic is read off
// over a cycle: amplitude and phase on every sea cell, so co-tidal lines and
// amphidromic points come out of the basins' shapes and the planet's spin.
//   drag        bottom friction, linearized (C_D·U₀/H), strongest on shelves;
//               and conversion to internal tides over rough deep floor
//               (½κh²N/H, as Jayne and St. Laurent's), h the depth's step
//               between neighbouring cells
//   self-attraction and loading: the sea's height scaled by β ≈ 0.9; the body
//               tide by α = 1 + k₂ − h₂ ≈ 0.69 (standard values, from memory)
// Dissipation is the drag's work, cycle-averaged: what slows the spin.
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
  // Perot's weights: v_i = Σ_t (s u)_t w_t tan_t, w = ℓ (d/2) / A_i.
  const pw = new Float64Array(m);
  for (let i = 0; i < n; i++) for (let t = nbrOff[i]; t < nbrOff[i + 1]; t++) pw[t] = ell[t] * dist[t] / 2 / area[i];
  return { grid, n, ne, A, B, len, d, nrm, mid, aE, cellEdge, cellSign, pw, tan };
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
    this.v = new Float64Array(3 * n); this.vs = new Float64Array(3 * n);
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
  }

  /** v on cells from u on edges (Perot). */
  rebuild(u, v) {
    const { grid, cellEdge, cellSign, pw, tan } = this.mesh, { nbrOff } = grid;
    for (let i = 0; i < this.n; i++) {
      let x = 0, y = 0, z = 0;
      for (let t = nbrOff[i]; t < nbrOff[i + 1]; t++) {
        const q = cellSign[t] * u[cellEdge[t]] * pw[t];
        x += q * tan[3 * t]; y += q * tan[3 * t + 1]; z += q * tan[3 * t + 2];
      }
      v[3 * i] = x; v[3 * i + 1] = y; v[3 * i + 2] = z;
    }
  }

  /** −f (r̂ × v̄)·n̂ on edge e, v̄ the mean of its cells' rebuilt velocities. */
  coriolis(e, v, Omega) {
    const { A, B, nrm, mid } = this.mesh, i = A[e], j = B[e];
    const vx = 0.5 * (v[3 * i] + v[3 * j]), vy = 0.5 * (v[3 * i + 1] + v[3 * j + 1]), vz = 0.5 * (v[3 * i + 2] + v[3 * j + 2]);
    const rx = mid[3 * e], ry = mid[3 * e + 1], rz = mid[3 * e + 2], f = 2 * Omega * rz;
    const cx = ry * vz - rz * vy, cy = rz * vx - rx * vz, cz = rx * vy - ry * vx;
    return -f * (cx * nrm[3 * e] + cy * nrm[3 * e + 1] + cz * nrm[3 * e + 2]);
  }

  /** Run to periodic at frequency omega (rad/s) under spin Omega; `cycles` periods, the last read. */
  solve(omega, Omega, cycles = TIDES.CYCLES) {
    const T = TIDES, { A, B, d, len, aE, ne, grid } = this.mesh, R = EARTH.R, n = this.n, H = this.H;
    const { nbrOff, area } = grid;
    // The step: ~0.4 of the fastest gravity wave's crossing of the shortest edge, a whole number to the period.
    let cmax = 0, dmin = Infinity;
    for (let e = 0; e < ne; e++) if (this.He[e] > 0) { cmax = Math.max(cmax, Math.sqrt(T.G * Math.max(H[A[e]], H[B[e]]))); dmin = Math.min(dmin, d[e] * R); }
    const period = 2 * Math.PI / omega, N = Math.ceil(period / (0.4 * dmin / Math.max(cmax, 1))), dt = period / N;
    const u = this.u, us = this.us, v = this.v, vs = this.vs, eta = this.eta;
    const C = new Float64Array(n), S = new Float64Array(n), u2 = new Float64Array(ne);
    const ga = T.G * T.ALPHA, gb = T.G * T.BETA;
    for (let k = 0; k < cycles * N; k++) {
      const t = k * dt, cw = Math.cos(omega * t), sw = Math.sin(omega * t);
      // Momentum: gravity (with the equilibrium tide), Coriolis by Heun, drag implicit.
      this.rebuild(u, v);
      for (let e = 0; e < ne; e++) {
        if (!(this.He[e] > 0)) { us[e] = 0; continue; }
        const i = A[e], j = B[e];
        const eqi = this.cosEq[i] * cw - this.sinEq[i] * sw, eqj = this.cosEq[j] * cw - this.sinEq[j] * sw;
        const grav = -(gb * (eta[j] - eta[i]) - ga * (eqj - eqi)) / (d[e] * R);
        us[e] = (u[e] + dt * (grav + this.coriolis(e, v, Omega))) / (1 + dt * this.r[e]);
      }
      this.rebuild(us, vs);
      for (let e = 0; e < ne; e++) {
        if (!(this.He[e] > 0)) continue;
        const i = A[e], j = B[e];
        const eqi = this.cosEq[i] * cw - this.sinEq[i] * sw, eqj = this.cosEq[j] * cw - this.sinEq[j] * sw;
        const grav = -(gb * (eta[j] - eta[i]) - ga * (eqj - eqi)) / (d[e] * R);
        u[e] = (u[e] + dt * (grav + 0.5 * (this.coriolis(e, v, Omega) + this.coriolis(e, vs, Omega)))) / (1 + dt * this.r[e]);
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

/**
 * The planet's spin and its Moon. `P` is the lunar semidiurnal tide's dissipation
 * for a unit equilibrium tide (from a solve); the actual scales with the square
 * of the tide's amplitude at the Moon's distance.
 */
export class Moon {
  constructor() {
    this.a = EARTH.a0;
    this.Omega = EARTH.Omega0;
    this.Punit = 0;          // W per m² of equilibrium amplitude, the last solve's
    this.omegaSolved = 0;    // the frequency it was solved at
  }
  /** W: the lunar tides' dissipation and the solar's, now (the lunar scale with the Moon's distance). */
  get PL() { const amp = lunarTide(this.a); return this.Punit * amp * amp * TIDES.DIURNAL; }
  get PS() { return this.Punit * (TIDES.SOLAR * lunarTide(EARTH.a0)) ** 2; }
  get P() { return this.PL + this.PS; }
  /** The semidiurnal lunar tide's frequency (rad/s). */
  get omega() { return 2 * (this.Omega - meanMotion(this.a)); }
  /** The sidereal day (hours) and the solar day. */
  get day() { return 2 * Math.PI / this.Omega / 3600; }
  get solarDay() { const nY = 2 * Math.PI / 3.15576e7; return 2 * Math.PI / (this.Omega - nY) / 3600; }

  /** Advance dt years: the lunar tides' torque recedes the Moon; both tides slow the spin. */
  step(dtYears) {
    if (!(this.Punit > 0) || !(dtYears > 0)) return;
    const E = EARTH, s = dtYears * 3.15576e7, PL = this.PL, PS = this.PS;
    const n = meanMotion(this.a), TL = PL / Math.max(1e-9, this.Omega - n), TS = PS / this.Omega;
    // Steps of at most ~1 kyr would be overkill: the rates change over Myr; one explicit step.
    this.Omega -= (TL + TS) / E.C * s;
    const mu = E.M * E.m / (E.M + E.m), GMt = E.GM * (E.M + E.m);
    this.a += 2 * TL * Math.sqrt(this.a / GMt) / mu * s;
  }
}
