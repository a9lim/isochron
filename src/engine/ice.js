// Ice sheets (docs/PLAN.md, layer 5).
//
//   flow         the shallow-ice approximation with Glen's law (n = 3): flux
//                q = −Γ H⁵ |∇s|² ∇s, Γ = 2A(ρg)³/5 (standard), explicit in
//                time with a step the stability limit sets
//   mass balance snow where the month is below freezing at the ice's surface;
//                melt by positive degree days, the month's days spread normally
//                about its mean (Reeh's scheme, standard); snow melts before
//                ice. The surface's height cools it by the lapse rate, so a
//                high sheet keeps itself cold.
//   the bed      sinks toward (ρᵢ/ρₘ) H over a few kyr (ELRA, standard), so
//                rebound lags melting
//   the sea      ice afloat calves; grounded ice is water taken from the sea
//
// Thickness in metres, time in years. The ice is held in the mantle's frame:
// over its timescales the plates hardly move, and at plate speed it's
// re-made by the climate faster than the plates carry it.

export const ICE = {
  A: 1e-16,          // Pa⁻³ yr⁻¹, Glen's flow factor (cold ice)
  RHO_I: 917, RHO_W: 1028, RHO_M: 3300, G: 9.81,
  DDF_SNOW: 0.003,   // m of water per degree-day
  DDF_ICE: 0.008,
  SIGMA: 5,          // K, the spread of days about a month's mean
  TAU_BED: 3000,     // yr
  LAPSE: 6.5,        // K/km
  MAX_STEP: 100,     // yr
};

const MONTH_DAYS = 30.44;
const R_M = 6.371e6;
const phiN = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
// Φ by Abramowitz and Stegun 26.2.17.
function PhiN(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = phiN(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - d : d;
}

export class Ice {
  constructor(tec, climate) {
    this.tec = tec;
    this.climate = climate;
    const g = this.grid = tec.grid, n = g.n;
    this.H = new Float64Array(n);          // m
    this.w = new Float64Array(n);          // bed deflection, m (negative down)
    this.M = new Float64Array(n);          // mass balance, m of ice per year
    this.s = new Float64Array(n);          // surface above sea level, m
    this.D = new Float64Array(n);
    this.vel = new Float32Array(4 * n);    // flow direction (3) and speed (m/yr), for drawing
    this.gradS = new Float64Array(3 * n);
    this.areaM = Float64Array.from(g.area, a => a * R_M * R_M);
    this.coef = Float64Array.from(g.ell, (l, t) => l / g.dist[t]);     // ℓ/d, dimensionless
    this.Gamma = 2 * ICE.A * (ICE.RHO_I * ICE.G) ** 3 / 5;
    this.active = new Int32Array(n);
    this.nActive = 0;
    this.mbVersion = -1;
    this.stats = { volume: 0, area: 0, seaLevel: 0 };   // m³, m², sea-level equivalent (m)
  }

  /** Bed above sea level (m), with the load's depression. */
  bed(i) { return (this.tec.elev[i] - this.tec.seaLevel) * 1000; }

  /** Mass balance from the climate's monthly temperature and rain at each surface. */
  massBalance() {
    const c = this.climate, g = this.grid, n = g.n;
    const mph = c.monthPhases || (c.monthPhases = Array.from({ length: 12 }, (_, m) => monthPhaseLocal(m)));
    const L = ICE.LAPSE, sig = ICE.SIGMA;
    for (let i = 0; i < n; i++) {
      const b = this.bed(i), H = this.H[i];
      const grounded = b > 0 || H * ICE.RHO_I > -b * ICE.RHO_W;
      if (!grounded) { this.M[i] = 0; continue; }
      const sKm = Math.max(0, b + H) / 1000;
      let acc = 0, pdd = 0;
      for (let m = 0; m < 12; m++) {
        const T = c.tAt(i, mph[m]) - L * sKm;
        const P = c.pAt(i, mph[m]) * MONTH_DAYS / 1000;           // m of water
        const snow = T <= -2 ? 1 : T >= 2 ? 0 : (2 - T) / 4;
        acc += P * snow;
        pdd += MONTH_DAYS * (sig * phiN(T / sig) + T * PhiN(T / sig));
      }
      // Snow melts first, then ice; in metres of ice.
      const snowMelt = Math.min(acc, pdd * ICE.DDF_SNOW);
      const left = pdd - snowMelt / ICE.DDF_SNOW;
      const iceMelt = left * ICE.DDF_ICE;
      this.M[i] = (acc - snowMelt - iceMelt) * (1000 / ICE.RHO_I);
    }
    this.mbVersion = c.version;
  }

  /** Cells with ice or beside it, and where snow would gather. */
  collect() {
    const g = this.grid, n = g.n, H = this.H, M = this.M, nbrOff = g.nbrOff, nbr = g.nbr;
    let k = 0;
    for (let i = 0; i < n; i++) {
      let on = H[i] > 0 || M[i] > 0;
      if (!on) for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (H[nbr[t]] > 0) { on = true; break; }
      if (on) this.active[k++] = i;
    }
    this.nActive = k;
  }

  /** One explicit step of at most dtMax years; returns the step taken. */
  step(dtMax) {
    const g = this.grid, nbrOff = g.nbrOff, nbr = g.nbr, gw = g.gw, H = this.H, s = this.s, D = this.D, A = this.areaM, coef = this.coef;
    const act = this.active, na = this.nActive, Gm = this.Gamma;
    // Surface, its slope, and the diffusivity Γ H⁵ |∇s|².
    for (let k = 0; k < na; k++) { const i = act[k]; s[i] = Math.max(this.bed(i), this.bed(i) + H[i]); }
    let dmax = 0;
    for (let k = 0; k < na; k++) {
      const i = act[k];
      if (!(H[i] > 0)) { D[i] = 0; continue; }
      let gx = 0, gy = 0, gz = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        const sj = H[j] > 0 ? s[j] : Math.max(this.bed(j), this.bed(j));
        const d = sj - s[i];
        gx += d * gw[3 * t]; gy += d * gw[3 * t + 1]; gz += d * gw[3 * t + 2];
      }
      gx /= R_M; gy /= R_M; gz /= R_M;
      const g2 = gx * gx + gy * gy + gz * gz;
      const h = H[i];
      D[i] = Gm * h * h * h * h * h * g2;
      if (D[i] > dmax) dmax = D[i];
      this.gradS[3 * i] = gx; this.gradS[3 * i + 1] = gy; this.gradS[3 * i + 2] = gz;
    }
    // Stability: dt · Σ(D ℓ/d) / A ≤ ½ in the worst cell (Σ ℓ/d ≈ 3.5).
    const amin = A[0];
    const dt = Math.min(dtMax, ICE.MAX_STEP, dmax > 0 ? 0.12 * amin / dmax : ICE.MAX_STEP);
    const dH = this.scratch || (this.scratch = new Float64Array(g.n));
    for (let k = 0; k < na; k++) {
      const i = act[k];
      let q = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        const De = 0.5 * (D[i] + D[j]);
        if (!(De > 0)) continue;
        const sj = H[j] > 0 ? s[j] : this.bed(j);
        q += De * coef[t] * (sj - s[i]);
      }
      dH[i] = dt * (q / A[i] + this.M[i]);
    }
    for (let k = 0; k < na; k++) {
      const i = act[k];
      let h = H[i] + dH[i];
      const b = this.bed(i);
      // Ice afloat calves.
      if (h > 0 && b < 0 && h * ICE.RHO_I < -b * ICE.RHO_W) h = 0;
      H[i] = h > 0.5 ? h : 0;
    }
    // The bed sinks toward the load.
    const kb = dt / ICE.TAU_BED, eq = -ICE.RHO_I / ICE.RHO_M;
    for (let k = 0; k < na; k++) { const i = act[k]; this.w[i] += (eq * H[i] - this.w[i]) * kb; }
    return dt;
  }

  /** Relax the bed everywhere (outside the active set too) over dt years. */
  rebound(dt) {
    const k = 1 - Math.exp(-dt / ICE.TAU_BED), eq = -ICE.RHO_I / ICE.RHO_M, H = this.H, w = this.w;
    for (let i = 0; i < this.grid.n; i++) if (w[i] !== 0 || H[i] > 0) w[i] += (eq * H[i] - w[i]) * k;
  }

  /**
   * Advance by `years`, stepping until `ms` of real time is spent. Returns the
   * years actually simulated: past the budget, the ice is summarized, i.e. it
   * holds the state it reached (it lags the climate rather than the clock).
   */
  advance(years, ms = 4) {
    if (this.climate.version !== this.mbVersion) this.massBalance();
    this.collect();
    const t0 = performance.now();
    let done = 0, n = 0;
    while (done < years - 1e-9) {
      done += this.step(years - done);
      if (++n % 8 === 0) {
        if (performance.now() - t0 > ms) break;
        this.collect();
      }
    }
    this.rebound(done);
    this.sync();
    return done;
  }

  /** Flow for drawing, then the load and water to the crust and the sea. */
  sync() {
    const n = this.grid.n, H = this.H;
    for (let i = 0; i < n; i++) {
      const o = 4 * i;
      if (H[i] > 0 && this.D[i] > 0) {
        const gx = this.gradS[3 * i], gy = this.gradS[3 * i + 1], gz = this.gradS[3 * i + 2], gm = Math.hypot(gx, gy, gz) || 1;
        this.vel[o] = -gx / gm; this.vel[o + 1] = -gy / gm; this.vel[o + 2] = -gz / gm;
        this.vel[o + 3] = this.D[i] * gm / H[i];          // depth-mean speed, m/yr
      } else { this.vel[o] = this.vel[o + 1] = this.vel[o + 2] = this.vel[o + 3] = 0; }
    }
    this.publish();
  }

  /** Push the ice's load and volume to the crust and the sea (also after the GPU's steps, src/gpu/ice.js). */
  publish() {
    const tec = this.tec, n = this.grid.n, H = this.H;
    let vol = 0, area = 0;
    if (!tec.load) tec.load = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      tec.load[i] = this.w[i] / 1000;
      if (H[i] > 0) { vol += H[i] * this.areaM[i]; area += this.areaM[i]; }
    }
    // Water held as ice, in the sea level's units (km of depth × steradians).
    tec.iceWater = vol * ICE.RHO_I / ICE.RHO_W / 1000 / (R_M * R_M);
    this.stats.volume = vol; this.stats.area = area;
    this.stats.seaLevel = vol * ICE.RHO_I / ICE.RHO_W / 3.61e14;   // m, over today's ocean area
  }
}

// Year phase at the middle of month m (as orbit.js's monthPhase; kept local to avoid a cycle).
function monthPhaseLocal(m) {
  const mid = [15.5, 45, 74.5, 105, 135.5, 166, 196.5, 227.5, 258, 288.5, 319, 349.5][m];
  return ((mid - 78.5) / 365.2422 + 1) % 1;
}
