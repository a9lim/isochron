// The year (docs/MODEL.md): a stepper for the state that lives between
// the season and the plate step, and the interannual anomaly it carries.
//
// The stepper (synthesis). A step of whole months on the engine's thread, live
// below ~100 yr/s of the dial. Each step is computed when the clock enters it,
// to its end, so the page can draw the state between the step's two ends by
// its own clock without lagging it. Steps are a month while a month takes at
// least ~1/30 s of the dial, then longer (up to ~3 yr at 100 yr/s): the
// anomaly's step is exact for any length (the veil's forcing too, `forced`),
// and the hooks below still see each month. Its parts:
//   the anomaly    T′ and the rain's anomaly (below);
//   the veil       the volcanoes' sulfate (src/engine/volcanoes.js);
//   the ground     an optional member (src/engine/ground.js: the soil, the
//                  snowpack and the ground's heat), called once a step with
//                  the step's months and its anomaly on the engine's grid (see
//                  `stepInputs` for the exact shape). The lakes are slower and
//                  are stepped by the planet each frame (src/engine/planet.js).
//   hooks          readers of each step's anomaly on the year's own grid
//                  (`hooks`, each `yearStep(year, months)`: the people's
//                  harvests, src/engine/peoplelink.js).
// Above the live range each part is replaced by its closure, and the change is
// soft over half a decade of the dial (`live`, 1 below ~56 yr/s, 0 above
// ~180): consumers weigh the live state by it. A jump of the clock past
// `JUMP` (a plate step at a slow dial, a stall) is the closure's too, whatever
// the dial; back from it, each cell takes the OU's exact transition over the
// gap (`resume`). The anomaly's closure is its
// variance alone, which is what the zones' widths read at every dial; the
// veil's is the eruption rate's mean forcing, which is in the climate's
// forcing at every dial (volcanoes.js), so neither switches anything.
//
// The anomaly (standard: Hasselmann's stochastic climate model, in North's
// diffusive form). C ∂T′/∂t = −B T′ + ∇·D∇T′ + F, with B the energy balance's
// OLR slope, C the mixed layer's heat capacity at sea (the air's over land, and
// sea ice's under ice), and F the weather's heat flux as noise, white at the
// month and correlated over ~1,500 km in space, plus the veil's forcing less
// its mean. Sea anomalies then last for years (C/B ≈ 3.8 yr) and land ones
// for weeks, and the spectrum is red, flat below the corner frequency B/C and
// falling as ω⁻² above it. Solved on a grid of 440 km cells (level 4: the
// noise's scale is 1,500 km, and the diffusion's implicit solve at 220 km cost
// ~3 ms a step): each step is the local part exactly (the OU process's own
// transition, so any step length gives the right statistics), then the
// diffusion implicitly (conservative: it moves heat and makes none).
// Its amplitude by latitude, Q, is fitted to the QG weather's monthly
// temperature variance over land (tools/anomaly-fit.mjs).
//
// The rain's anomaly (synthesis). A log-rain anomaly, per cell z = ρ T′/σ_T +
// √(1 − ρ²) η, with η its own noise (white at the month, correlated as F), and
// ρ −0.3 over land (a warm month is a dry one) and +0.3 at sea (warm water
// rains more): from memory. Its size is the cell's: monthly log-rain spreads
// by ~0.45 at 1,000 mm/yr, more where it's drier (∝ MAP^−0.3, synthesis).
import { buildGrid } from '../grid/icosphere.js';
import { makeTransfer, prolong, restrict } from '../grid/transfer.js';
import { CLIMATE } from './climate.js';
import { stream } from '../rng.js';
import { VOLC, bandLat } from './volcanoes.js';
import { shared } from './shared.js';

export const YEAR = {
  LEVEL: 4,              // the anomaly's grid (440 km)
  D: 0.03,               // its diffusivity, W m⁻² K⁻¹ on the unit sphere: a third of the seasonal harmonics' (whose 0.1
                         // tied land to the sea within ~1,000 km in a month, leaving continents' monthly spread 1.5× the
                         // sea's, against Earth's 3–5×, from memory)
  CORR: 1500,            // km: the noise's correlation falls to 1/e over this
  // The weather's heat flux as noise, W m⁻² yr^½, at 10° steps of latitude from the south
  // pole, fitted to the QG weather's monthly variance over land on the default planet
  // (tools/anomaly-fit.mjs, 2026-11-15: 1.0 K at 20–30°, 1.4 K at 30–40°, 2.0 K at 40–60°,
  // 1.6 K at 60–70°, 0.9 K poleward). The QG weather has no tropical convection and damps the
  // tropics (WEATHER.TAU_TROP: its 0.09 K at 0–10° and 0.34 K at 10–20° are the model's, not the
  // planet's), so the nodes within 20° are held at 20°'s and the tropics' spread follows from
  // their heat capacity (0.9–1.0 K on land; Earth's tropical land ~0.5–1 K, from memory).
  Q: [2.89, 2.89, 3.7, 6.6, 6.38, 6.23, 3.24, 2.99, 2.99, 2.99, 2.99, 2.99, 3.24, 6.23, 6.38, 6.6, 3.7, 2.89, 2.89],
  RHO_LAND: -0.3, RHO_SEA: 0.3,   // T′–rain correlation (from memory)
  RAIN_SIG: 0.45,        // monthly log-rain spread at 1,000 mm/yr (synthesis)
  ELASTIC: 2,            // runoff's elasticity to rain (from memory)
  LIVE_LO: 1.75, LIVE_HI: 2.25,   // log₁₀ yr/s: live below, its closure above
  STEP_S: 1 / 30,        // a step is at least this much of the dial's second (and a month)
  MAX_STEPS: 6,          // per advance; past it the next step jumps to the clock
  JUMP: 20,              // years: a gap past this is the closure's at any dial (a plate step at a slow dial, a
                         // stall), since the live state has forgotten it (the sea's memory is C/B ≈ 3.8 yr)
  // The closure's variance: the local OU's, with the heat capacity smoothed over the
  // diffusion's reach and the diffusion's damping of the noise's scale (fitted to the
  // live model's own variance).
  SMOOTH: 6, BLEND: 0.7, K2: 40,
};

// The calendar month (0 = January) at year phase τ (0 at the March equinox, as orbit.js counts).
const ENDS = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 366];
export const monthIndex = tau => { const day = ((tau * 365.2422 + 78.5) % 365.2422 + 365.2422) % 365.2422; let m = 0; while (m < 11 && day >= ENDS[m]) m++; return m; };
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const R_KM = 6371;

/** Real preconditioned conjugate gradients for (d + D L) x = b, L the graph Laplacian with edge weights w. */
function pcg(g, w, d, D, b, x, ws, maxIt = 80, tol = 1e-6) {
  const n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, { r, z, p, q, m } = ws;
  const apply = (u, out) => {
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) s += w[t] * (u[i] - u[nbr[t]]);
      out[i] = d[i] * u[i] + D * s;
    }
  };
  for (let i = 0; i < n; i++) { let s = 0; for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) s += w[t]; m[i] = 1 / (d[i] + D * s); }
  apply(x, q);
  let bn = 0, rz = 0;
  for (let i = 0; i < n; i++) { r[i] = b[i] - q[i]; bn += b[i] * b[i]; z[i] = m[i] * r[i]; p[i] = z[i]; rz += r[i] * z[i]; }
  bn = Math.sqrt(bn) || 1;
  let it = 0;
  for (; it < maxIt; it++) {
    apply(p, q);
    let pq = 0;
    for (let i = 0; i < n; i++) pq += p[i] * q[i];
    if (!(pq > 0)) break;
    const a = rz / pq;
    let rn = 0, nz = 0;
    for (let i = 0; i < n; i++) { x[i] += a * p[i]; r[i] -= a * q[i]; rn += r[i] * r[i]; }
    if (Math.sqrt(rn) / bn < tol) { it++; break; }
    for (let i = 0; i < n; i++) { z[i] = m[i] * r[i]; nz += r[i] * z[i]; }
    const beta = nz / rz;
    rz = nz;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  return it;
}

/** The global response of independent boxes (heat capacities C, area shares a) to −F₀ e^{−t/τ}: peak, its time, e-folding after it. */
export function boxResponse(C0, a0, B, F0, tau, tMax = 30) {
  // Boxes of one heat capacity (to three figures) respond alike: sum their areas.
  const bins = new Map();
  for (let i = 0; i < C0.length; i++) { const k = +C0[i].toPrecision(3); bins.set(k, (bins.get(k) || 0) + a0[i]); }
  const C = [...bins.keys()], a = [...bins.values()];
  const at = t => {
    let s = 0;
    for (let i = 0; i < C.length; i++) {
      const tc = C[i] / B, k = 1 / tc - 1 / tau;
      // C dT/dt = −B T − F₀ e^{−t/τ}:  T = −(F₀/C) (e^{−t/τ} − e^{−t/tc}) / (1/tc − 1/τ)
      s += a[i] * (Math.abs(k) < 1e-9 ? -(F0 / C[i]) * t * Math.exp(-t / tau) : -(F0 / C[i]) * (Math.exp(-t / tau) - Math.exp(-t / tc)) / k);
    }
    return s;
  };
  let tp = 0, vp = 0;
  for (let t = 0; t <= tMax; t += 0.01) { const v = at(t); if (v < vp) { vp = v; tp = t; } }
  let te = null;
  for (let t = tp; t <= tMax * 3; t += 0.01) if (at(t) > vp / Math.E) { te = t - tp; break; }
  return { peak: vp, tPeak: tp, efold: te, at };
}

/** A year's log-rain spread at fine cell i with mean rain `map` (mm/yr), from `spreadFine`'s fields (Year.annualRainSpread, and the climate's zones on the engine's pool). */
export function rainSpread(sp, i, map) {
  const s = Year.rainSigma(map), l = sp.land[i], rho = YEAR.RHO_LAND * l + YEAR.RHO_SEA * (1 - l);
  return s * Math.sqrt(rho * rho * sp.mem[i] + (1 - rho * rho) / 12);
}

export class Year {
  constructor(climate, volcanoes = null, seed = 'year', opts = {}) {
    this.climate = climate; this.volcanoes = volcanoes;
    const fine = this.fine = climate.grid;
    const level = Math.min(opts.level ?? YEAR.LEVEL, fine.level);
    const g = this.grid = level === fine.level ? fine : buildGrid(level);
    this.T = g === fine ? null : makeTransfer(fine, g);
    const n = this.n = g.n;
    this.rng = stream(seed, 'year');
    this.D = opts.D ?? YEAR.D;
    // Geometry.
    this.lat = Float64Array.from({ length: n }, (_, i) => Math.asin(Math.max(-1, Math.min(1, g.pos[3 * i + 2]))));
    this.w = Float64Array.from(g.ell, (l, t) => l / g.dist[t]);
    this.q = Float64Array.from(this.lat, la => {
      const x = (la * 180 / Math.PI + 90) / 10, k = Math.min(17, Math.floor(x)), f = x - k;
      return YEAR.Q[k] * (1 - f) + YEAR.Q[k + 1] * f;
    });
    this.noiseKernel();
    // State: the anomaly (K), the rain's (unit), a tagged eruption's own response (K).
    this.Ta = new Float64Array(n); this.Za = new Float64Array(n); this.tagT = new Float64Array(n);
    this.prev = { T: new Float64Array(n), aod: new Float64Array(VOLC.NB), tag: new Float64Array(VOLC.NB), t: 0 };
    this.C = new Float64Array(n).fill(CLIMATE.C_OCEAN); this.land = new Float64Array(n);
    this.capKey = -1;
    const ws = k => ({ r: new Float64Array(k), z: new Float64Array(k), p: new Float64Array(k), q: new Float64Array(k), m: new Float64Array(k) });
    this.ws = ws(n);
    this.scratch = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), xi: new Float64Array(n), eta: new Float64Array(n), F: new Float64Array(VOLC.NB), Ft: new Float64Array(VOLC.NB), sh: new Float64Array(VOLC.NB), sb: new Float64Array(VOLC.NB), fc: new Float64Array(n), ftag: new Float64Array(n), f6: new Float64Array(fine.n), f6b: new Float64Array(fine.n) };
    this.t0 = null;        // the current step's start (years), and its end
    this.t1 = null;
    this.gap = 0;          // years of the closure since the live state was last stepped
    this.live = 1;
    this.steps = 0; this.months = 0;
    this.soil = null;      // the ground, optional (see stepInputs)
    this.hooks = [];       // each step's readers on this grid: yearStep(year, months), after the anomaly's step
    this.stats = { meanT: 0, meanPrev: 0, F: 0, aod: 0, sigma: 0, cg: 0 };
    this.tagInfo = null;
  }

  /** Spatially correlated unit noise: a Gaussian kernel over level-3 nodes, normalized per cell. */
  noiseKernel() {
    const g = this.grid, n = g.n, src = buildGrid(3), sk = YEAR.CORR / 2 / R_KM, cut = Math.cos(3 * sk);
    const off = new Int32Array(n + 1), idx = [], wt = [];
    for (let i = 0; i < n; i++) {
      const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2];
      let s2 = 0;
      const start = idx.length;
      for (let k = 0; k < src.n; k++) {
        const d = x * src.pos[3 * k] + y * src.pos[3 * k + 1] + z * src.pos[3 * k + 2];
        if (d < cut) continue;
        const a = Math.acos(Math.min(1, d)), v = Math.exp(-0.5 * a * a / (sk * sk));
        idx.push(k); wt.push(v); s2 += v * v;
      }
      const nrm = 1 / Math.sqrt(s2);
      for (let k = start; k < idx.length; k++) wt[k] *= nrm;
      off[i + 1] = idx.length;
    }
    this.nk = { off, idx: Int32Array.from(idx), wt: Float64Array.from(wt), m: src.n, xi: new Float64Array(src.n) };
  }
  noise(out) {
    const { off, idx, wt, m, xi } = this.nk, rng = this.rng;
    for (let k = 0; k < m; k++) xi[k] = rng.normal();
    for (let i = 0; i < this.n; i++) { let s = 0; for (let t = off[i]; t < off[i + 1]; t++) s += wt[t] * xi[idx[t]]; out[i] = s; }
    return out;
  }

  /** Heat capacity per cell from the climate's land and sea ice (when its cycle has moved on). */
  capacity(force = false) {
    const c = this.climate, key = c.stats.cycles;
    if (!force && key === this.capKey) return;
    this.capKey = key;
    const C = CLIMATE, f6 = this.scratch.f6, f6b = this.scratch.f6b, n = this.n, lf = this.land, ice = this.scratch.a;
    for (let i = 0; i < this.fine.n; i++) { f6[i] = c.landMask[i]; f6b[i] = c.landMask[i] ? 0 : c.snowAnn[i]; }
    if (this.T) { restrict(this.T, f6, lf); restrict(this.T, f6b, ice); } else { lf.set(f6); ice.set(f6b); }
    for (let i = 0; i < n; i++) {
      const l = Math.min(1, Math.max(0, lf[i])), si = Math.min(1, ice[i] / Math.max(1e-6, 1 - l));
      this.C[i] = l * C.C_LAND + (1 - l) * (C.C_OCEAN + (C.C_ICE - C.C_OCEAN) * si);
    }
    this.closure();
    if (this.tagInfo) this.tagTheory();
    // Each engine cell's monthly log-rain spread, from its mean rain (the climate's, this cycle).
    if (!this.rsig || this.rsig.length !== this.fine.n) this.rsig = new Float32Array(this.fine.n);
    const P0 = c.Pf ? c.Pf[0] : null;
    for (let i = 0; i < this.fine.n; i++) this.rsig[i] = Year.rainSigma(P0 ? P0[i] * 365.25 : 1000);
  }

  /**
   * The closure: each cell's stationary spread of T′ (K), and the share of a month's
   * variance a year's mean keeps (its memory), from the local OU's with the heat
   * capacity smoothed over the diffusion's reach.
   */
  closure() {
    const g = this.grid, n = this.n, B = CLIMATE.B, Cs = this.scratch.b, tmp = this.scratch.c;
    Cs.set(this.C);
    for (let pass = 0; pass < YEAR.SMOOTH; pass++) {
      for (let i = 0; i < n; i++) {
        let s = 0, a = 0;
        for (let t = g.nbrOff[i], e = g.nbrOff[i + 1]; t < e; t++) { const j = g.nbr[t]; s += Cs[j] * g.area[j]; a += g.area[j]; }
        tmp[i] = 0.5 * Cs[i] + 0.5 * s / a;
      }
      Cs.set(tmp);
    }
    this.sigma = this.sigma || new Float64Array(n); this.mem = this.mem || new Float64Array(n);
    // The diffusion damps the noise's own scale as if B were B + D k², k² fitted (K2).
    const lam = B + this.D * YEAR.K2;
    let sl = 0, al = 0;
    for (let i = 0; i < n; i++) {
      const Ce = Math.pow(this.C[i], 1 - YEAR.BLEND) * Math.pow(Cs[i], YEAR.BLEND);
      this.sigma[i] = this.q[i] / Math.sqrt(2 * lam * Ce);
      const a = Math.exp(-lam / (12 * Ce));
      let s = 1;
      for (let k = 1; k < 12; k++) s += 2 * (1 - k / 12) * a ** k;
      this.mem[i] = s / 12;
      sl += this.sigma[i] * this.land[i] * g.area[i]; al += this.land[i] * g.area[i];
    }
    this.stats.sigma = al > 0 ? sl / al : 0;
  }

  /** The live state's weight at `rate` years a second. */
  static liveWeight(rate) { return 1 - smoothstep(YEAR.LIVE_LO, YEAR.LIVE_HI, Math.log10(Math.max(1e-9, rate))); }

  /** Forcing per cell (W/m²) from per-band values, linear in latitude between band centres. */
  bandsToCells(Fb, out, offset = 0) {
    const NB = VOLC.NB;
    for (let i = 0; i < this.n; i++) {
      const x = Math.max(0, Math.min(NB - 1, (this.lat[i] * 180 / Math.PI + 87.5) / 5)), k = Math.min(NB - 2, Math.floor(x)), f = x - k;
      out[i] = Fb[k] * (1 - f) + Fb[k + 1] * f - offset;
    }
    return out;
  }

  /** One step of dt years for the anomaly (and the tag's response), with the veil's forcing F (per cell, W/m²) held over it. */
  stepAnomaly(dt, F, Ftag = null) {
    const n = this.n, B = CLIMATE.B, T = this.Ta, xi = this.noise(this.scratch.xi), g = this.grid;
    const d = this.scratch.a, b = this.scratch.b;
    for (let i = 0; i < n; i++) {
      const C = this.C[i], a = Math.exp(-B * dt / C), s = this.q[i] / Math.sqrt(2 * B * C);
      T[i] = a * T[i] + (1 - a) * F[i] / B + s * Math.sqrt(1 - a * a) * xi[i];
      d[i] = C * g.area[i] / dt; b[i] = d[i] * T[i];
    }
    if (this.D > 0) this.stats.cg = pcg(g, this.w, d, this.D, b, T, this.ws);
    if (Ftag) {
      const X = this.tagT;
      for (let i = 0; i < n; i++) { const a = Math.exp(-B * dt / this.C[i]); X[i] = a * X[i] + (1 - a) * Ftag[i] / B; b[i] = d[i] * X[i]; }
      if (this.D > 0) pcg(g, this.w, d, this.D, b, X, this.ws);
    }
    // The rain's anomaly: correlated with T′ (by the closure's spread), and its own noise.
    const eta = this.noise(this.scratch.eta), Z = this.Za;
    for (let i = 0; i < n; i++) {
      const rho = YEAR.RHO_LAND * this.land[i] + YEAR.RHO_SEA * (1 - this.land[i]);
      Z[i] = rho * T[i] / Math.max(1e-6, this.sigma[i]) + Math.sqrt(1 - rho * rho) * eta[i];
    }
  }

  /**
   * Advance the clock to `years` at `rate` years a second. While live, the step that
   * contains the clock has been computed to its end (so the drawn state is between
   * `prev` and now, by the clock); the parts' hooks see each month as it is stepped.
   */
  advance(years, rate) {
    const w = this.live = Year.liveWeight(rate), V = this.volcanoes;
    this.capacity();
    if (this.t1 === null) { this.t0 = this.t1 = years; this.prev.t = years; }
    if (V) CLIMATE.F_VOLC = V.meanForcing() - V.F_ref;
    if (w <= 0 || years - this.t1 > YEAR.JUMP) {
      // Outrun, or the clock jumped past what the live state remembers: the closure over the gap.
      // The veil decays with the clock, the anomaly waits for its gap's transition (`resume`), the
      // parts take their closures.
      if (years > this.t1) {
        if (V) V.step(this.t1, years - this.t1, false);
        this.gap += years - this.t1;
        this.t0 = this.t1 = years; this.prev.T.set(this.Ta); this.prev.t = years;
      }
      if (this.soil && this.soil.closure) this.soil.closure({ years, live: 0 });
      if (w <= 0) return;
    }
    if (this.gap > 0) this.resume();
    let k = 0;
    while (years >= this.t1 && k++ < YEAR.MAX_STEPS) {
      // The next step: whole months, at least STEP_S of the dial; past the cap, to the clock.
      let months = Math.max(1, Math.round(12 * rate * YEAR.STEP_S));
      if (k === YEAR.MAX_STEPS || years - this.t1 > 2 * months / 12) months = Math.max(months, Math.ceil(12 * (years - this.t1)) + 1);
      this.step(months);
    }
    if (w < 1 && this.soil && this.soil.closure) this.soil.closure({ years, live: w });
  }

  /**
   * Back from the closure after `gap` years: each cell's exact OU transition over it (standard).
   * The anomaly decays by a = e^{−BΔ/C} and the noise fills the rest of the closure's spread,
   * σ √(1 − a²), the spread the live model keeps (the local OU's own would overstate it, as
   * the diffusion damps the noise's scale); the tag's response decays alike. The closure's veil
   * is the eruption rate's mean, so neither is forced over the gap.
   */
  resume() {
    const n = this.n, B = CLIMATE.B, xi = this.noise(this.scratch.xi), T = this.Ta, g = this.grid;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.exp(-B * this.gap / this.C[i]);
      T[i] = a * T[i] + this.sigma[i] * Math.sqrt(1 - a * a) * xi[i];
      this.tagT[i] *= a;
      s += T[i] * g.area[i];
    }
    const eta = this.noise(this.scratch.eta), Z = this.Za;
    for (let i = 0; i < n; i++) {
      const rho = YEAR.RHO_LAND * this.land[i] + YEAR.RHO_SEA * (1 - this.land[i]);
      Z[i] = rho * T[i] / Math.max(1e-6, this.sigma[i]) + Math.sqrt(1 - rho * rho) * eta[i];
    }
    this.prev.T.set(T);
    this.stats.meanPrev = this.stats.meanT = s / (4 * Math.PI);
    this.gap = 0;
  }

  /**
   * The veil's forcing as a step of dt years to its end feels it, added to `out` per cell (W/m²):
   * a source (optical depth per band, `a`) that has been decaying for `age` years by the step's
   * end, as the forcing that, held over the step, gives the same local response at its end. The
   * response to a forcing F e^{−t/τ} is F W(Δ), W = (e^{−Δ/τ} − e^{−Δ/tc}) / (C (1/tc − 1/τ)), tc =
   * C/B (the convolution of two exponentials, exact), and a held F̃ gives (1 − e^{−B dt/C}) F̃/B.
   * The source's shape is the mean of its own at the start and spread over its age.
   */
  forced(a, age, dt, out) {
    const V = this.volcanoes, sh = this.scratch.sh, sb = this.scratch.sb, fc = this.scratch.fc, B = CLIMATE.B, r1 = 1 / VOLC.TAU;
    sb.set(a); V.spread(sb, age, false);
    for (let b = 0; b < VOLC.NB; b++) sh[b] = 0.5 * (a[b] + sb[b]);
    this.bandsToCells(V.forcing(sb, sh), fc);
    for (let i = 0; i < this.n; i++) {
      const C = this.C[i], r2 = B / C, lo = Math.min(r1, r2), d = Math.abs(r2 - r1);
      const W = d * age < 1e-9 ? age * Math.exp(-age * lo) / C : Math.exp(-age * lo) * -Math.expm1(-age * d) / (C * d);
      out[i] += fc[i] * B * W / -Math.expm1(-B * dt / C);
    }
    return out;
  }

  /** One step of `months` months from t1: eruptions within it, the veil, the anomaly, the parts. */
  step(months) {
    const dt = months / 12, V = this.volcanoes, t0 = this.t1, t1 = t0 + dt, c = this.climate;
    this.prev.T.set(this.Ta); this.prev.t = t0;
    const F = this.scratch.c;
    let Ftag = null;
    if (V) {
      this.prev.aod.set(V.aod); this.prev.tag.set(V.tag);
      const ev = V.step(t0, dt, true);
      // The veil less the rate's mean, as the step feels it: the veil at the step's start, and
      // each eruption in it from its moment (`forced`: exact in time for any step).
      F.fill(-V.meanForcing());
      this.forced(this.prev.aod, dt, dt, F);
      for (const e of ev) this.forced(V.shares(e.p, e.M, this.scratch.F), t1 - e.t, dt, F);
      if (V.global(V.tag) > 1e-7 || this.tagActive) {
        Ftag = this.forced(this.prev.tag, dt, dt, this.scratch.ftag.fill(0));
        this.tagActive = true;
      }
    } else F.fill(0);
    this.stepAnomaly(dt, F, Ftag);
    this.t0 = t0; this.t1 = t1;
    this.steps++;
    // Global means.
    const g = this.grid;
    let s = 0, f = 0, st = 0;
    for (let i = 0; i < this.n; i++) { s += this.Ta[i] * g.area[i]; f += F[i] * g.area[i]; st += this.tagT[i] * g.area[i]; }
    this.stats.meanPrev = this.stats.meanT; this.stats.meanT = s / (4 * Math.PI); this.stats.F = f / (4 * Math.PI); this.stats.aod = V ? V.global() : 0;
    if (this.tagInfo) this.tagMeasure(st / (4 * Math.PI), t1);
    // The anomaly on the engine's grid over the step (the lakes read it), and the ground's step.
    this.fineAnomaly(months);
    if (this.soil) this.soil.step(this.stepInputs(t0, months));
    for (const h of this.hooks) h.yearStep(this, months);
    this.months += months;
  }

  // ── The tagged eruption (the Eruption experiment): its own veil and response, by superposition ──

  /** Erupt M Pinatubos at the most active tropical arc, tagged; returns the theory. */
  eruptTagged(M, years) {
    const V = this.volcanoes;
    if (!V) return null;
    // The last tag's veil and response join the rest (the model is linear, so nothing moves).
    V.tag.fill(0); this.tagT.fill(0); this.tagActive = false;
    const i = V.topArc(25), p = i >= 0 ? V.cellPos(i) : [1, 0, 0];
    V.inject(p, M, years, 'arc', true);
    this.tagInfo = { M, t: years, p, F0: VOLC.FORCE * V.global(V.tag), theory: null, peak: 0, tPeak: 0, efold: null, now: 0 };
    this.tagTheory();
    return this.tagInfo;
  }
  /** The theory: independent boxes with each cell's heat capacity (as it stands), under the global-mean forcing decaying at the veil's rate. */
  tagTheory() {
    const I = this.tagInfo, g = this.grid, a = Float64Array.from(g.area, v => v / (4 * Math.PI));
    const th = boxResponse(this.C, a, CLIMATE.B, I.F0, VOLC.TAU);
    I.theory = { peak: th.peak, tPeak: th.tPeak, efold: th.efold };
  }
  tagMeasure(v, t) {
    const I = this.tagInfo, age = t - I.t;
    I.now = v;
    if (v < I.peak) { I.peak = v; I.tPeak = age; I.efold = null; }
    else if (I.efold === null && I.peak < 0 && v > I.peak / Math.E) I.efold = age - I.tPeak;
  }

  // ── What the drawing and the parts read ──

  /** T′ on the engine's grid, between the step's two ends by the clock, weighted by `live`. */
  anomalyFine(years, out) {
    const f = this.t1 > this.prev.t ? Math.min(1, Math.max(0, (years - this.prev.t) / (this.t1 - this.prev.t))) : 1;
    const c = this.scratch.a;
    for (let i = 0; i < this.n; i++) c[i] = this.live * (this.prev.T[i] + f * (this.Ta[i] - this.prev.T[i]));
    return this.toFine(c, out);
  }
  toFine(c, out) {
    if (!this.T) { for (let i = 0; i < this.n; i++) out[i] = c[i]; return out; }
    const f6 = this.scratch.f6;
    prolong(this.T, c, f6);
    for (let i = 0; i < f6.length; i++) out[i] = f6[i];
    return out;
  }
  /** The global mean of T′ at the clock (between the step's ends), weighted by `live`. */
  meanAt(years) {
    if (!(this.live > 0) || this.t1 === null) return 0;
    const f = this.t1 > this.prev.t ? Math.min(1, Math.max(0, (years - this.prev.t) / (this.t1 - this.prev.t))) : 1;
    return this.live * (this.stats.meanPrev + f * (this.stats.meanT - this.stats.meanPrev));
  }
  /** The log-rain anomaly's unit field on the engine's grid. */
  rainUnitFine(out) { return this.toFine(this.Za, out); }

  /** Each fine cell's monthly log-rain spread (synthesis), from its mean rain (mm/yr). */
  static rainSigma(map) { return Math.min(1.2, Math.max(0.15, YEAR.RAIN_SIG * Math.pow(Math.max(20, map) / 1000, -0.3))); }

  /**
   * The zones' widths, per fine cell: the spread of a month's temperature (K) and of a
   * year's log rain, from the closure (at every dial: the zones are the climate's).
   */
  spreadFine() {
    this.capacity();
    const n = this.fine.n;
    if (!this.sp || this.sp.T.length !== n) this.sp = { T: shared(Float32Array, n), mem: shared(Float32Array, n), land: shared(Float32Array, n) };
    this.toFine(this.sigma, this.sp.T); this.toFine(this.mem, this.sp.mem); this.toFine(this.land, this.sp.land);
    return this.sp;
  }
  /** A year's log-rain spread at fine cell i with mean rain `map` (mm/yr): the T′-borne part keeps its memory, the rest averages out. */
  annualRainSpread(i, map) { return rainSpread(this.sp, i, map); }

  /**
   * The anomaly on the engine's grid over a step of `months` months, weighted by `live`:
   * T′ (K), and the rain's factor (mean-preserving: e^{s z − s²/2}, s the cell's spread, 0
   * at sea). The anomaly is held over the step, so the rain's own noise (white at the month)
   * is the mean of the step's months, its spread 1/√months of a month's; T′'s part keeps its
   * own memory (and the factor's mean-keeping term takes z's smaller variance). In
   * `this.anom`: { T, rf, months }.
   */
  fineAnomaly(months) {
    const n = this.fine.n, nc = this.n, w = this.live, c = this.climate;
    if (!this.anom) this.anom = { T: new Float32Array(n), rf: new Float32Array(n), z: new Float32Array(n), v: new Float32Array(n), zc: new Float64Array(nc), vc: new Float64Array(nc), months: 0 };
    // z's variance is ρ² + (1 − ρ²)/months (in v), which the factor's mean-keeping term takes.
    const F = this.anom, eta = this.scratch.eta, k = 1 / Math.max(1, months);
    for (let i = 0; i < nc; i++) {
      const rho = YEAR.RHO_LAND * this.land[i] + YEAR.RHO_SEA * (1 - this.land[i]);
      F.zc[i] = rho * this.Ta[i] / Math.max(1e-6, this.sigma[i]) + Math.sqrt((1 - rho * rho) * k) * eta[i];
      F.vc[i] = rho * rho + (1 - rho * rho) * k;
    }
    this.toFine(this.Ta, F.T); this.toFine(F.zc, F.z); this.toFine(F.vc, F.v);
    for (let i = 0; i < n; i++) {
      F.T[i] *= w;
      const s = this.rsig ? this.rsig[i] * w : 0;
      F.rf[i] = c.landMask[i] && s > 0 ? Math.exp(s * F.z[i] - 0.5 * s * s * F.v[i]) : 1;
    }
    F.months = months;
    return F;
  }

  /**
   * The ground's hook, once a step while live: `soil.step(input)` with
   *   { years (the step's start), m0 (its first calendar month, 0 = January), months, live (0–1),
   *     dT: K, rf: the rain's factor   (Float32Array per engine cell, from fineAnomaly, held over the step) }
   * The ground adds them to the climate's months (its closure's forcing).
   */
  stepInputs(t0, months) {
    const m0 = monthIndex(((t0 + 1 / 24) % 1 + 1) % 1);
    return { years: t0, m0, months, live: this.live, dT: this.anom.T, rf: this.anom.rf };
  }
}
