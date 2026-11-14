// The weather (docs/PLAN.md, layer 8): two-layer quasi-geostrophic flow on
// the sphere (standard), on the climate's coarse grid (220 km cells).
//
//   q₁ = ∇²ψ₁ + F(ψ₂ − ψ₁) + f,   q₂ = ∇²ψ₂ + F(ψ₁ − ψ₂) + f + f₀ h_b/H
// Each layer's potential vorticity is carried by its own flow. Fluxes across
// each Voronoi edge are differences of ψ at its two corners, so the flow is
// exactly non-divergent and PV is conserved by the transport (partly upwinded
// for dissipation). Each step inverts once: the barotropic part by a Poisson
// solve, the baroclinic part by a Helmholtz solve, both by warm-started CG.
// Forcing: the baroclinic streamfunction relaxes toward the climate's own
// thermal wind at the season (Held and Suarez's idea in a two-layer model),
// Ekman friction drags the lower layer, and the tropics, where QG fails, are
// damped. Baroclinic instability then makes the cyclones by itself
// (Phillips' criterion: shear above β L_d²/2).
//
// Tracers ride the lower layer: surface temperature, relaxed to the climate's,
// which deformation sharpens into fronts; and moisture, which the warm sea
// evaporates and which rains out where the column cools past saturation.
//
// Units: SI inside; ψ in m²/s, q in 1/s, time in seconds.

const A_M = 6.371e6, OMEGA = 7.292e-5, G = 9.81;

export const WEATHER = {
  DT: 1200,             // s (Adams–Bashforth's advective limit with ~80 m/s jets aloft)
  LD: 8e5,              // m, the deformation radius
  TAU_RAD: 15 * 86400,  // relaxation of the shear toward the climate's
  TAU_EK: 4 * 86400,    // Ekman friction on the lower layer
  TAU_TROP: 1 * 86400,  // damping at the equator, fading by 15°
  SHEAR: 2.2e6,         // m²/s per K of the baroclinic ψ's equilibrium (the thermal wind)
  UPWIND: 0.2,          // share of upwinding in the PV transport
  NU4: 2e15,            // m⁴/s: hyperviscosity on PV, damping the grid's scale in ~3 h
  TOPO: 0.3,            // share of orography in the lower layer's PV
  TAU_THETA: 5 * 86400, // surface temperature's pull toward the climate's
  TAU_EVAP: 2 * 86400,
  TAU_RAIN: 0.3 * 86400,
  CG_IT: 30,
};

const W0 = 25, WA = 0.065;
const wsat = T => W0 * Math.exp(WA * (Math.max(-45, Math.min(45, T)) - 15));

export class Weather {
  constructor(climate, seed = 'weather') {
    this.climate = climate;
    const g = this.grid = climate.coarse, n = g.n;
    this.n = n;
    const f0 = 2 * OMEGA * Math.sin(Math.PI / 4);
    this.f0 = f0;
    this.F = 1 / (WEATHER.LD * WEATHER.LD);
    this.f = Float64Array.from({ length: n }, (_, i) => 2 * OMEGA * g.pos[3 * i + 2]);
    this.lat = Float64Array.from({ length: n }, (_, i) => Math.asin(g.pos[3 * i + 2]));
    this.w = Float64Array.from(g.ell, (l, t) => l / g.dist[t]);
    for (const k of ['q1', 'q2', 'psi1', 'psi2', 'bt', 'bc', 'rhs', 'theta', 'qv', 'rain', 'hb', 'Teq', 'sst', 'land', 'l1', 'l2',
      'tq1', 'tq2', 'tth', 'tqv', 'pq1', 'pq2', 'pth', 'pqv', 'zeta1', 'zeta2', 'p'])
      this[k] = new Float64Array(n);
    this.cpsi1 = new Float64Array(g.nf); this.cpsi2 = new Float64Array(g.nf);
    this.cg = {}; for (const k of ['r', 'z', 'p', 'q', 'm']) this.cg[k] = new Float64Array(n);
    this.vel2 = new Float64Array(3 * n);
    this.t = 0;            // seconds of weather
    this.started = false;
    this.first = true;
    this.rng = mulberry(hash(seed));
    this.stats = { maxWind: 0, lows: 0 };
  }

  /** The forcing fields from the climate at year phase τ (coarse). */
  forcing(tau) {
    const c = this.climate, n = this.n, fineN = c.grid.n, T = c.T;
    const f6 = new Float64Array(fineN), c5 = new Float64Array(n);
    for (let i = 0; i < fineN; i++) f6[i] = c.tAt(i, tau);
    restrictTo(T, f6, this.Teq);
    let mean = 0, A = 0;
    for (let i = 0; i < n; i++) { mean += this.Teq[i] * this.grid.area[i]; A += this.grid.area[i]; }
    this.Tmean = mean / A;
    for (let i = 0; i < fineN; i++) f6[i] = c.landMask[i] ? 0 : c.tAt(i, tau) + (c.ocean ? c.ocean.sst[i] : 0);
    restrictTo(T, f6, this.sst);
    for (let i = 0; i < fineN; i++) f6[i] = c.landMask[i];
    restrictTo(T, f6, this.land);
    for (let i = 0; i < fineN; i++) f6[i] = c.elevPos[i] * 1000;
    restrictTo(T, f6, this.hb);
  }

  /** The baroclinic streamfunction's equilibrium: the climate's thermal wind. */
  bcEq(i) { return WEATHER.SHEAR * (this.f[i] / this.f0) * (this.Teq[i] - this.Tmean); }

  /** Start from the climate's shear and a little noise. */
  start(tau) {
    this.forcing(tau);
    const n = this.n;
    for (let i = 0; i < n; i++) {
      // The upper layer carries the thermal wind; the lower starts nearly at rest.
      const bc = this.bcEq(i) * (1 + 0.02 * (this.rng() - 0.5)) + 2e5 * (this.rng() - 0.5);
      this.psi1[i] = 2 * bc; this.psi2[i] = 1e5 * (this.rng() - 0.5);
      this.theta[i] = this.Teq[i];
      this.qv[i] = 0.6 * wsat(this.Teq[i]);
    }
    this.pvFromPsi();
    this.started = true;
    this.first = true;
  }

  lap(x, out) {
    const g = this.grid, n = this.n, nbrOff = g.nbrOff, nbr = g.nbr, w = this.w, A = g.area;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) s += w[t] * (x[nbr[t]] - x[i]);
      out[i] = s / (A[i] * A_M * A_M);
    }
    return out;
  }

  pvFromPsi() {
    const n = this.n, F = this.F, hbF = WEATHER.TOPO * this.f0 / 5000;
    this.lap(this.psi1, this.zeta1); this.lap(this.psi2, this.zeta2);
    for (let i = 0; i < n; i++) {
      this.q1[i] = this.zeta1[i] + F * (this.psi2[i] - this.psi1[i]) + this.f[i];
      this.q2[i] = this.zeta2[i] + F * (this.psi1[i] - this.psi2[i]) + this.f[i] + hbF * this.hb[i];
    }
  }

  /** CG on Σ w (x_i − x_j) + A k² x_i = A b (A in m²): (−∇² + k²) x = b. */
  solve(k2, b, x) {
    const g = this.grid, n = this.n, nbrOff = g.nbrOff, nbr = g.nbr, w = this.w, { r, z, p, q, m } = this.cg;
    const Aa = A_M * A_M;
    const apply = (u, out) => {
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) s += w[t] * (u[i] - u[nbr[t]]);
        out[i] = s + g.area[i] * Aa * k2 * u[i];
      }
    };
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) s += w[t];
      m[i] = 1 / (s + g.area[i] * Aa * k2);
    }
    apply(x, q);
    let bn = 0, rz = 0;
    for (let i = 0; i < n; i++) { r[i] = g.area[i] * Aa * b[i] - q[i]; bn += (g.area[i] * Aa * b[i]) ** 2; z[i] = m[i] * r[i]; p[i] = z[i]; rz += r[i] * z[i]; }
    bn = Math.sqrt(bn) || 1;
    for (let it = 0; it < WEATHER.CG_IT; it++) {
      apply(p, q);
      let pq = 0;
      for (let i = 0; i < n; i++) pq += p[i] * q[i];
      const a = rz / pq;
      let rn = 0, rz2 = 0;
      for (let i = 0; i < n; i++) { x[i] += a * p[i]; r[i] -= a * q[i]; rn += r[i] * r[i]; z[i] = m[i] * r[i]; rz2 += r[i] * z[i]; }
      if (Math.sqrt(rn) / bn < 1e-6) break;
      const beta = rz2 / rz; rz = rz2;
      for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
    }
  }

  /** PV → ψ: ∇²ψ_bt = Q_bt, (∇² − 2F) ψ_bc = Q_bc. */
  invert() {
    const n = this.n, F = this.F, hbF = WEATHER.TOPO * this.f0 / 5000, b = this.rhs, A = this.grid.area;
    let mean = 0, At = 0;
    for (let i = 0; i < n; i++) {
      b[i] = -(0.5 * (this.q1[i] + this.q2[i]) - this.f[i] - 0.5 * hbF * this.hb[i]);
      mean += b[i] * A[i]; At += A[i];
    }
    mean /= At;
    for (let i = 0; i < n; i++) b[i] -= mean;
    this.solve(1e-16, b, this.bt);
    // ψ_bt is defined up to a constant, and a drifting constant in ψ₂ would read as a
    // pole-to-pole pressure difference (p = ρfψ₂): hold its mean at zero.
    let bm = 0;
    for (let i = 0; i < n; i++) bm += this.bt[i] * A[i];
    bm /= At;
    for (let i = 0; i < n; i++) this.bt[i] -= bm;
    for (let i = 0; i < n; i++) b[i] = -(0.5 * (this.q1[i] - this.q2[i]) + 0.5 * hbF * this.hb[i]);
    this.solve(2 * F, b, this.bc);
    for (let i = 0; i < n; i++) { this.psi1[i] = this.bt[i] + this.bc[i]; this.psi2[i] = this.bt[i] - this.bc[i]; }
  }

  /** −∇·(ψ-flux · X) for X on cells, given ψ on the corners; partly upwinded. Adds into out. */
  transport(cpsi, X, out) {
    const g = this.grid, n = this.n, nbrOff = g.nbrOff, nbr = g.nbr, corner = g.corner, up = WEATHER.UPWIND;
    for (let i = 0; i < n; i++) {
      const o = nbrOff[i], d = nbrOff[i + 1] - o;
      let s = 0;
      for (let k = 0; k < d; k++) {
        const j = nbr[o + k];
        const Fl = -(cpsi[corner[o + k]] - cpsi[corner[o + (k + d - 1) % d]]);   // outward, m²/s (per m of depth)
        const xe = 0.5 * (X[i] + X[j]) + 0.5 * up * Math.sign(Fl) * (X[i] - X[j]);
        s += Fl * xe;
      }
      out[i] -= s / (g.area[i] * A_M * A_M);
    }
  }

  corners(psi, out) {
    const tris = this.grid.tris, nf = this.grid.nf;
    for (let f = 0; f < nf; f++) out[f] = (psi[tris[3 * f]] + psi[tris[3 * f + 1]] + psi[tris[3 * f + 2]]) / 3;
  }

  /** One step of WEATHER.DT seconds. */
  step() {
    const n = this.n, W = WEATHER, F = this.F, dt = W.DT;
    this.invert();
    this.corners(this.psi1, this.cpsi1); this.corners(this.psi2, this.cpsi2);
    this.lap(this.psi1, this.zeta1); this.lap(this.psi2, this.zeta2);
    const { tq1, tq2, tth, tqv } = this;
    tq1.fill(0); tq2.fill(0); tth.fill(0); tqv.fill(0);
    this.transport(this.cpsi1, this.q1, tq1);
    this.transport(this.cpsi2, this.q2, tq2);
    this.transport(this.cpsi2, this.theta, tth);
    this.transport(this.cpsi2, this.qv, tqv);
    // Hyperviscosity: −ν∇⁴q on both layers (and the tracers, lightly).
    for (const [x, t, k] of [[this.q1, tq1, 1], [this.q2, tq2, 1], [this.theta, tth, 0.5], [this.qv, tqv, 0.5]]) {
      this.lap(x, this.l1); this.lap(this.l1, this.l2);
      for (let i = 0; i < n; i++) t[i] -= k * W.NU4 * this.l2[i];
    }
    for (let i = 0; i < n; i++) {
      // Relax the shear toward the climate's; Ekman below; damp the tropics.
      const bc = 0.5 * (this.psi1[i] - this.psi2[i]);
      const relax = 2 * F * (bc - this.bcEq(i)) / W.TAU_RAD;
      const trop = Math.exp(-((this.lat[i] / 0.18) ** 2)) / W.TAU_TROP;
      tq1[i] += relax - trop * this.zeta1[i];
      tq2[i] += -relax - this.zeta2[i] / W.TAU_EK - trop * this.zeta2[i];
      // Surface temperature toward the climate's; moisture from the sea, rain past saturation.
      tth[i] += (this.Teq[i] - this.theta[i]) / W.TAU_THETA;
      const sea = 1 - this.land[i];
      const src = sea * Math.max(0, 0.85 * wsat(this.sst[i]) - this.qv[i]) / W.TAU_EVAP + (1 - sea) * 0.2 * Math.max(0, 0.6 * wsat(this.theta[i]) - this.qv[i]) / W.TAU_EVAP;
      const ws = wsat(this.theta[i]);
      const rain = Math.max(0, this.qv[i] - 0.9 * ws) / W.TAU_RAIN;
      tqv[i] += src - rain;
      this.rain[i] = rain * 86400;      // mm/day
    }
    // Adams–Bashforth 2 (Euler on the first step).
    const a = this.first ? 1 : 1.5, b = this.first ? 0 : -0.5;
    const upd = (x, t, pt) => { for (let i = 0; i < n; i++) { const v = a * t[i] + b * pt[i]; pt[i] = t[i]; x[i] += dt * v; } };
    upd(this.q1, tq1, this.pq1); upd(this.q2, tq2, this.pq2); upd(this.theta, tth, this.pth); upd(this.qv, tqv, this.pqv);
    for (let i = 0; i < n; i++) if (this.qv[i] < 0) this.qv[i] = 0;
    this.first = false;
    this.t += dt;
  }

  /** Sea-level pressure (hPa about 1013) from the lower layer: p = ρ f ψ₂ (geostrophic). */
  pressure() {
    for (let i = 0; i < this.n; i++) this.p[i] = 1.2 * this.f[i] * this.psi2[i] / 100;
    return this.p;
  }

  /** The storms alone: ρ f ψ₂ less its mean along each latitude (hPa), for the chart. */
  eddyPressure(out) {
    const n = this.n, nb = 60, zs = new Float64Array(nb), za = new Float64Array(nb), band = this.band || (this.band = Int16Array.from(this.lat, l => Math.min(nb - 1, Math.floor((l + Math.PI / 2) / Math.PI * nb))));
    const p = this.pressure();
    for (let i = 0; i < n; i++) { zs[band[i]] += p[i]; za[band[i]]++; }
    for (let i = 0; i < n; i++) out[i] = p[i] - zs[band[i]] / za[band[i]];
    return out;
  }

  /** Lower-layer wind (m/s, 3-vectors) at cells: u = k × ∇ψ₂ / a. */
  wind() {
    const g = this.grid, n = this.n, nbrOff = g.nbrOff, nbr = g.nbr, gw = g.gw, pos = g.pos, v = this.vel2;
    let mx = 0;
    for (let i = 0; i < n; i++) {
      let gx = 0, gy = 0, gz = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) { const d = this.psi2[nbr[t]] - this.psi2[i]; gx += d * gw[3 * t]; gy += d * gw[3 * t + 1]; gz += d * gw[3 * t + 2]; }
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      v[3 * i] = (y * gz - z * gy) / A_M; v[3 * i + 1] = (z * gx - x * gz) / A_M; v[3 * i + 2] = (x * gy - y * gx) / A_M;
      mx = Math.max(mx, Math.hypot(v[3 * i], v[3 * i + 1], v[3 * i + 2]));
    }
    this.stats.maxWind = mx;
    return v;
  }
}

function restrictTo(T, f, c) {
  const { nc, par, fine, wsum } = T, A = fine.area;
  for (let i = 0; i < nc; i++) c[i] = A[i] * f[i];
  for (let i = nc; i < fine.n; i++) { const v = 0.5 * A[i] * f[i]; c[par[2 * (i - nc)]] += v; c[par[2 * (i - nc) + 1]] += v; }
  for (let i = 0; i < nc; i++) c[i] /= wsum[i];
  return c;
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
