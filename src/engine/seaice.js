// Sea ice that moves (docs/PLAN.md, phase 7b): thickness and concentration on
// the climate's coarse grid (level 5, 220 km), stepped a month at a time by the
// year (src/engine/year.js) below ~100 yr/s, and its periodic year above.
//
// State (standard: Hibler's two-level model, one category). Per sea cell, the
// concentration A (the share of the cell under ice) and the mean thickness h
// (ice volume per area of cell), so the floes are h/A thick.
//
// Growth (standard: Stefan's law, in Anderson's form). The sea freezes at its
// base as the latent heat conducts up through the ice to the colder air:
// hᵢ² + 2hₑhᵢ grows by κ ∫(T_f − T_air) dt, the freezing degree days, so thick
// ice grows as √FDD and thin ice faster. hₑ stands for the snow on the ice and
// the air's boundary layer as an equivalent thickness of ice. κ and hₑ are
// Anderson's fit to air temperatures (from memory); pure Stefan with ice's
// conductivity would give κ 1.7× larger, the difference being the snow.
//
// Melt (standard forms; synthesis in assembly). On top by positive degree
// days (the ice sheets' factor, ice.js); below by the ocean's heat: 2 W/m²
// everywhere (Maykut and Untersteiner's Arctic value, from memory) plus what
// the gyres bring where they run warm, Γ T′₊, with Γ = C/τ, the mixed layer's
// heat capacity over the SST anomaly's relaxation time (ocean.js): the heat the
// anomaly would have given the air goes into the ice instead (synthesis). A
// month's days spread normally about its mean (σ = 5 K, as the ice sheets'),
// so a month at −1 °C both freezes and melts. Thinning opens water by Hibler's
// rule, dA = (A/2h) dh (the thin end of the floes' spread melts out first).
//
// Open water (standard bulk forms; constants synthesis). The sea's surface is
// the air's temperature plus the gyres' anomaly, as the climate reads it. Below
// freezing, open water loses K_ow (T_f − T_s), which freezes new ice and closes
// the leads by Hibler's rule, A → 1 − (1 − A) e^{−V/h₀} for V of ice the heat
// would make in open water; integrated exactly, the new ice is h₀ thick, and
// once the leads have closed the floes grow by Stefan's law. Above freezing the
// leads' heat melts the floes from their sides: lateral melt, A falling at the
// floes' own thickness.
//
// Drift (standard: Nansen's rule and the cavitating fluid). In free drift the
// ice moves at 2% of the surface wind, turned 25° to the right of it in the
// north and to the left in the south, plus the gyres' surface current (from
// memory). Ice resists being pressed together but not being pulled apart: in
// Flato and Hibler's cavitating fluid a pressure P, capped at P* h e^{−C(1−A)}
// (from memory), acts against the water's drag, u = u_free − ∇P/c with
// c = ρ_w C_w |u_rel| linearized. P solves P ≥ 0, ∇·u ≥ 0, P ∇·u = 0 on the
// cells, by projected SOR: where compact ice would converge the pressure rises
// until it stops (or reaches its cap, and the ice ridges: A stays at 1 and h
// grows), while divergence opens freely. Loose ice (A well below 1) has almost
// no strength and packs freely.
//
// Transport (standard). First-order upwind fluxes of h and A through the
// Voronoi edges, each edge's flux computed once, so the ice's volume is kept to
// rounding. Edges to land carry nothing (the coast is closed), so an offshore
// wind draws the ice off the coast and the open water left there freezes: a
// coastal polynya, a factory of new ice. Substeps keep each cell's outflow
// under 0.9 of what it holds. Only the ice's zone is stepped: the cells with
// ice or cold enough to freeze, their neighbours, and any cell ice drifts into.
//
// The closure (synthesis): above the year's live range, the periodic year under
// the climate's twelve months, by whole years from the last state (warm) until
// January repeats (`equilibrium`, judged by the rms change: pack ice held at its
// strength's cap switches, and a few cells move ~0.1 m a year however long it
// runs). On the default planet: 13 years cold (~0.5 s), 1 warm (~35 ms).
//
// Cost (measured, earthlike at level 6, M5 Max): ~2.9 ms a month on the CPU,
// the zone 45% of the coarse grid's cells and 6 substeps; per substep ~0.10 ms
// transport, ~0.15 ms pressure, ~0.05 ms thermodynamics; ~0.4 ms a month for
// the forcing and the zone.
//
// Forcing. `stepMonth` takes coarse-grid arrays; `climateMonth(m)` makes them
// from a climate (src/engine/climate.js): the air is the sea-level temperature
// of the energy balance's coarse harmonics at the month's phase (orbit.js's
// `monthPhase`), the winds are the template's six phases (at τ = (p + ½)/6)
// interpolated linearly to the month on the climate's grid and restricted to
// the coarse one, the currents and the SST anomaly are the ocean's (already
// coarse), and the sea is the ocean's mask.

import { prolong, restrict } from '../grid/transfer.js';
import { CLIMATE } from './climate.js';
import { OCEAN } from './ocean.js';
import { monthPhase } from './orbit.js';

const R_M = 6.371e6, DAY = 86400, MONTH = 365.2422 / 12;   // MONTH in days
const RHO_I = 917, RHO_W = 1026, LF = 3.34e5, RHO_FW = 1000;
const NP = 6;   // the climate's points of the year for the winds

export const SEAICE = {
  T_F: -1.8,                // °C: seawater freezes
  T_MELT: 0,                // °C: the ice's surface melts
  KAPPA: 6.7e-4,            // m² K⁻¹ day⁻¹: hᵢ² + 2hₑhᵢ = κ FDD (Anderson's 6.7 cm², from memory)
  H_E: 0.0255,              // m (Anderson's 5.1 cm = 2hₑ)
  SIGMA: 5,                 // K: the spread of days about a month's mean (as ice.js)
  DDF: 0.0087,              // m of ice per degree-day on top (ice.js's 8 mm of water)
  F_BASE: 2,                // W/m²: the ocean's heat from below, everywhere
  GAMMA: CLIMATE.C_OCEAN * 365.2422 / OCEAN.RELAX,   // W m⁻² K⁻¹ of warm anomaly (~16)
  K_OW: 20,                 // W m⁻² K⁻¹: open water's heat loss (turbulent and longwave)
  H0: 0.5,                  // m: Hibler's lead-closing thickness
  WIND: 0.02, TURN: 25,     // Nansen's rule: share of the wind, degrees to the right (north)
  C_W: 5.5e-3, U_MIN: 0.05, // the water's drag coefficient; the slowest relative speed it's linearized at (m/s)
  P_STAR: 2.75e4, C_STAR: 20,   // N/m², and the strength's fall with open water
  CFL: 0.9, SUB_MIN: 3, SUB_MAX: 60,   // upwind's Courant number (a cell's outflow over a substep, of what it holds)
  SWEEPS: 4, SWEEPS_MAX: 400, TOL: 1e-3, SOR: 1.5,     // projected SOR for the pressure, per substep (warm-started)
  H_MIN: 1e-4,              // m: less ice than this in a cell melts away (counted in `lost`)
  EXTENT: 0.15,             // the concentration that counts toward extent
};

const phiN = x => Math.exp(-0.5 * x * x) * 0.3989422804014327;
/** The standard normal's distribution (Zelen and Severo, |error| < 7.5e-8). */
function PhiN(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const p = phiN(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
/** E[(X − a)₊] for X ~ N(μ, σ²): the mean excess of a day over a. */
export function excess(mu, a, s) {
  if (!(s > 0)) return Math.max(0, mu - a);
  const d = (mu - a) / s;
  return s * phiN(d) + (mu - a) * PhiN(d);
}
// The same, tabulated in d = (μ − a)/σ: σ (φ(d) + d Φ(d)), linear between nodes (error < 2e-6 σ).
const XD = 6, XN = 2400, XTAB = Float64Array.from({ length: XN + 1 }, (_, k) => { const d = -XD + 2 * XD * k / XN; return phiN(d) + d * PhiN(d); });
function excessT(mu, a, s) {
  const d = (mu - a) / s;
  if (d <= -XD) return 0;
  if (d >= XD) return mu - a;
  const x = (d + XD) * (XN / (2 * XD)), k = x | 0, f = x - k;
  return s * (XTAB[k] + (XTAB[k + 1] - XTAB[k]) * f);
}

/**
 * The ice edge's spread in latitude: in each hemisphere, the sea cells at or
 * above `thr` with a sea neighbour below it, and the area-weighted standard
 * deviation of their latitude (degrees). `sd` is the hemispheres' mean (of
 * those with at least 6 edge cells).
 */
export function edgeSpread(grid, f, sea, thr = 0.5) {
  const { n, nbrOff, nbr, pos, area } = grid;
  const acc = [[0, 0, 0, 0], [0, 0, 0, 0]];   // per hemisphere: Σw, Σw lat, Σw lat², cells
  for (let i = 0; i < n; i++) {
    if (!sea[i] || !(f[i] >= thr)) continue;
    let edge = false;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) { const j = nbr[t]; if (sea[j] && f[j] < thr) { edge = true; break; } }
    if (!edge) continue;
    const lat = Math.asin(Math.max(-1, Math.min(1, pos[3 * i + 2]))) * 180 / Math.PI, h = lat >= 0 ? 0 : 1, w = area[i];
    acc[h][0] += w; acc[h][1] += w * Math.abs(lat); acc[h][2] += w * lat * lat; acc[h][3]++;
  }
  const out = {};
  let s = 0, k = 0;
  for (const [h, name] of [[0, 'north'], [1, 'south']]) {
    const [w, m1, m2, c] = acc[h];
    const mean = w > 0 ? m1 / w : NaN, sd = w > 0 ? Math.sqrt(Math.max(0, m2 / w - mean * mean)) : NaN;
    out[name] = { lat: mean, sd, cells: c };
    if (c >= 6) { s += sd; k++; }
  }
  out.sd = k ? s / k : NaN;
  return out;
}

export class SeaIce {
  /**
   * On `grid` (the climate's coarse grid). Options: `climate` (for
   * `climateMonth`, the year's hooks and `fine`), `sea` (a mask; all sea
   * otherwise), and `thermo`/`dynamics` (false switches either off: tests).
   */
  constructor(grid, opts = {}) {
    const g = this.grid = grid, n = this.n = g.n, pos = g.pos, nbrOff = g.nbrOff, nbr = g.nbr;
    this.climate = opts.climate || null;
    this.thermo = opts.thermo ?? true;
    this.dynamics = opts.dynamics ?? true;
    this.sea = opts.sea ? Uint8Array.from(opts.sea) : new Uint8Array(n).fill(1);
    this.h = new Float64Array(n);      // m: ice volume per area of cell
    this.A = new Float64Array(n);      // concentration
    this.P = new Float64Array(n);      // N/m: the cavitating pressure
    // Each month's means (January first), and its thermodynamic growth and export (m of ice per area of cell).
    this.Am = new Float32Array(12 * n); this.hm = new Float32Array(12 * n);
    this.grow = new Float32Array(12 * n); this.out = new Float32Array(12 * n);
    this.lost = 0;                     // m sr: ice dropped below H_MIN or stranded by a moving coast
    this.months = 0;
    this.stats = { substeps: 0, maxP: 0, years: 0, converged: true };
    // Geometry: latitude, the east–north basis, and the turning of the wind.
    this.lat = new Float64Array(n);
    this.east = new Float64Array(3 * n); this.north = new Float64Array(3 * n);
    this.turn = new Float64Array(2 * n);   // cos φ, sin φ: φ = −25° in the north, +25° in the south, eased across the equator
    for (let i = 0; i < n; i++) {
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], r = Math.hypot(x, y);
      this.lat[i] = Math.asin(Math.max(-1, Math.min(1, z)));
      let ex = 0, ey = 1;   // at a pole, any east
      if (r > 1e-9) { ex = -y / r; ey = x / r; }
      this.east[3 * i] = ex; this.east[3 * i + 1] = ey; this.east[3 * i + 2] = 0;
      this.north[3 * i] = y * 0 - z * ey; this.north[3 * i + 1] = z * ex - x * 0; this.north[3 * i + 2] = x * ey - y * ex;
      const phi = -SEAICE.TURN * Math.PI / 180 * Math.tanh(this.lat[i] * 180 / Math.PI / 5);
      this.turn[2 * i] = Math.cos(phi); this.turn[2 * i + 1] = Math.sin(phi);
    }
    // Edges, once each (i < j), with the great circle's direction at the midpoint, (p_j − p_i)/|p_j − p_i|:
    // tangent there and antisymmetric, so an edge's flux leaves one cell exactly as it enters the other.
    const m = nbrOff[n] / 2;
    this.ne = m;
    this.ei = new Int32Array(m); this.ej = new Int32Array(m);
    this.el = new Float64Array(m); this.ed = new Float64Array(m); this.edir = new Float64Array(3 * m);
    this.he = new Int32Array(nbrOff[n]);   // each half-edge's edge
    let e = 0;
    for (let i = 0; i < n; i++) for (let t = nbrOff[i], te = nbrOff[i + 1]; t < te; t++) {
      const j = nbr[t];
      if (j < i) continue;
      this.ei[e] = i; this.ej[e] = j; this.el[e] = g.ell[t]; this.ed[e] = g.dist[t];
      const dx = pos[3 * j] - pos[3 * i], dy = pos[3 * j + 1] - pos[3 * i + 1], dz = pos[3 * j + 2] - pos[3 * i + 2], d = Math.hypot(dx, dy, dz);
      this.edir[3 * e] = dx / d; this.edir[3 * e + 1] = dy / d; this.edir[3 * e + 2] = dz / d;
      this.he[t] = e;
      for (let s = nbrOff[j], se = nbrOff[j + 1]; s < se; s++) if (nbr[s] === i) { this.he[s] = e; break; }
      e++;
    }
    // The month's forcing, per cell and per edge.
    this.uf = new Float64Array(3 * n);     // free drift, m/s
    this.cd = new Float64Array(n);         // linearized drag, kg m⁻² s⁻¹
    this.fdd = new Float64Array(n); this.pdd = new Float64Array(n);     // K, per day
    this.qfr = new Float64Array(n); this.qml = new Float64Array(n);     // W/m²: open water's loss below freezing, and gain above
    this.fo = new Float64Array(n);         // W/m²: the ocean's heat under the ice
    this.unf = new Float64Array(m); this.un = new Float64Array(m); this.ke = new Float64Array(m);
    this.wet = new Uint8Array(m);
    this.df = new Float64Array(n); this.pmax = new Float64Array(n);
    this.active = new Int32Array(n); this.nact = 0;
    this.inZone = new Uint8Array(n); this.zc = new Int32Array(n); this.nz = 0; this.seed = new Int32Array(n); this.pend = new Int32Array(n);
    this.edgeIn = new Uint8Array(m); this.ze = new Int32Array(m); this.nze = 0;
    this.dh = new Float64Array(n); this.dA = new Float64Array(n); this.fr = new Float64Array(n);
    this.cache = null;                     // climateMonth's, per climate version
    this.eq = null;                        // the closure's months
  }

  /** From a climate: on its coarse grid, the sea from its ocean. */
  static fromClimate(climate, opts = {}) {
    const ice = new SeaIce(climate.coarse, { ...opts, climate });
    ice.setSea(ice.seaFromClimate());
    return ice;
  }

  /** A new sea mask: ice on cells that became land is lost; new sea starts open. */
  setSea(mask) {
    const a = this.grid.area;
    for (let i = 0; i < this.n; i++) {
      const s = mask[i] ? 1 : 0;
      if (!s && this.h[i] > 0) { this.lost += this.h[i] * a[i]; this.h[i] = 0; this.A[i] = 0; this.P[i] = 0; }
      this.sea[i] = s;
    }
  }

  seaFromClimate() {
    const c = this.climate;
    if (c.ocean && c.ocean.coarse && c.ocean.sea.length === this.n) return c.ocean.sea;
    return Uint8Array.from(c.landFracC, f => (f > 0.5 ? 0 : 1));
  }

  /** Ice volume, m sr (× R² for m³). */
  volume() {
    const a = this.grid.area;
    let v = 0;
    for (let i = 0; i < this.n; i++) v += this.h[i] * a[i];
    return v;
  }

  /**
   * The month's forcing. Every sea cell's free drift (cheap); the rest only in the
   * ice's zone: the cells with ice, or cold enough to freeze, and their neighbours,
   * grown as ice drifts into new cells (`addCell`). Outside it nothing happens.
   */
  prepare(Tair, wu, wv, cu, cv, sst) {
    const C = SEAICE, n = this.n, E = this.east, N = this.north, pos = this.grid.pos;
    this.Tair = Tair; this.sstA = sst;
    for (let i = 0; i < n; i++) {
      const o = 3 * i;
      if (!this.sea[i]) { this.uf[o] = this.uf[o + 1] = this.uf[o + 2] = 0; this.cd[i] = 1; continue; }
      // Nansen's rule: the wind turned by φ about the outward normal, scaled; the current added.
      const u = wu ? wu[i] : 0, v = wv ? wv[i] : 0;
      const wx = u * E[o] + v * N[o], wy = u * E[o + 1] + v * N[o + 1], wz = u * E[o + 2] + v * N[o + 2];
      const x = pos[o], y = pos[o + 1], z = pos[o + 2], c = this.turn[2 * i], s = this.turn[2 * i + 1];
      const rx = wx * c + (y * wz - z * wy) * s, ry = wy * c + (z * wx - x * wz) * s, rz = wz * c + (x * wy - y * wx) * s;
      const qu = cu ? cu[i] : 0, qv = cv ? cv[i] : 0;
      this.uf[o] = C.WIND * rx + qu * E[o] + qv * N[o];
      this.uf[o + 1] = C.WIND * ry + qu * E[o + 1] + qv * N[o + 1];
      this.uf[o + 2] = C.WIND * rz + qu * E[o + 2] + qv * N[o + 2];
      this.cd[i] = RHO_W * C.C_W * Math.max(C.U_MIN, C.WIND * Math.sqrt(wx * wx + wy * wy + wz * wz));
    }
    // The zone: last month's cleared, this month's seeded and grown by a ring.
    for (let q = 0; q < this.nz; q++) { const i = this.zc[q]; this.inZone[i] = 0; this.dh[i] = 0; this.dA[i] = 0; }   // outside the zone dh, dA stay 0
    for (let q = 0; q < this.nze; q++) this.edgeIn[this.ze[q]] = 0;
    this.nz = 0; this.nze = 0;
    const seed = this.seed, cold = -C.T_F + 4 * C.SIGMA;
    let ns = 0;
    for (let i = 0; i < n; i++) if (this.sea[i] && (this.h[i] > 0 || -(Tair[i] + (sst ? sst[i] : 0)) > -cold)) seed[ns++] = i;
    for (let q = 0; q < ns; q++) this.addCell(seed[q]);
    const nbrOff = this.grid.nbrOff, nbr = this.grid.nbr;
    for (let q = 0; q < ns; q++) { const i = seed[q]; for (let t = nbrOff[i], te = nbrOff[i + 1]; t < te; t++) this.addCell(nbr[t]); }
  }

  /** Into the zone: the cell's degree days and heat, its edges' drift and coupling, its divergence. */
  addCell(i) {
    if (this.inZone[i] || !this.sea[i]) return;
    const C = SEAICE, sig = C.SIGMA, Ta = this.Tair[i], an = this.sstA ? this.sstA[i] : 0, Ts = Ta + an;
    this.inZone[i] = 1; this.zc[this.nz++] = i;
    // Degree days (per day), the days spread about the month's mean.
    const ex = sig > 0 ? excessT : excess;
    this.fdd[i] = ex(-Ta, -C.T_F, sig);
    this.pdd[i] = ex(Ta, C.T_MELT, sig);
    this.qfr[i] = C.K_OW * ex(-Ts, -C.T_F, sig);
    this.qml[i] = C.K_OW * ex(Ts, C.T_F, sig);
    this.fo[i] = C.F_BASE + C.GAMMA * Math.max(0, an);
    // Its edges: the free drift normal to each (zero across a coast), and the pressure's coupling.
    const g = this.grid, nbrOff = g.nbrOff, uf = this.uf, d3 = this.edir;
    let df = 0;
    for (let t = nbrOff[i], te = nbrOff[i + 1]; t < te; t++) {
      const e = this.he[t], a = this.ei[e], b = this.ej[e];
      if (!this.edgeIn[e]) {
        this.edgeIn[e] = 1; this.ze[this.nze++] = e;
        if (!(this.sea[a] && this.sea[b])) { this.wet[e] = 0; this.unf[e] = 0; this.ke[e] = 0; this.un[e] = 0; }
        else {
          this.wet[e] = 1;
          this.unf[e] = 0.5 * ((uf[3 * a] + uf[3 * b]) * d3[3 * e] + (uf[3 * a + 1] + uf[3 * b + 1]) * d3[3 * e + 1] + (uf[3 * a + 2] + uf[3 * b + 2]) * d3[3 * e + 2]);
          this.un[e] = this.unf[e];
          this.ke[e] = this.el[e] / (0.5 * (this.cd[a] + this.cd[b]) * this.ed[e] * R_M * R_M);   // ∂(a_i D_i)/∂P_i per edge
        }
      }
      if (this.wet[e]) df += (a === i ? 1 : -1) * this.unf[e] * this.el[e] / R_M;
    }
    this.df[i] = df / g.area[i];   // the free drift's divergence, 1/s
  }

  /** Thermodynamics over `dt` days in the zone: growth and melt of the floes, then the open water's. */
  thermodynamics(dt) {
    const C = SEAICE, h = this.h, A = this.A, he = C.H_E, k = C.KAPPA, lat = DAY / (RHO_I * LF), dh = this.dh, zc = this.zc;
    for (let q = 0; q < this.nz; q++) {
      const i = zc[q];
      let hh = h[i], a = A[i];
      if (hh <= 0 && this.qfr[i] <= 0) continue;
      const h0 = hh;
      if (hh > 0 && a > 0) {
        // The floes: Stefan's law, exact over the step at a constant rate, then melt on top and below.
        let hi = hh / a;
        hi = -he + Math.sqrt(he * he + hi * hi + 2 * he * hi + k * this.fdd[i] * dt);
        hi -= (C.DDF * this.pdd[i] + this.fo[i] * lat) * dt;
        const hn = a * Math.max(0, hi);
        if (hn < hh) a = hn > 0 ? a * Math.sqrt(hn / hh) : 0;   // Hibler: thinning opens water
        hh = hn;
        // The leads' heat above freezing melts the floes from their sides.
        if (hh > 0 && this.qml[i] > 0) {
          const v = Math.min(hh, (1 - a) * this.qml[i] * lat * dt);
          a *= 1 - v / hh; hh -= v;
        }
      }
      // Open water below freezing: new ice, closing the leads. Integrated exactly, the open area
      // falls as e^{−V/h₀} while it freezes, so the new ice is h₀ thick: h₀ ΔA of volume.
      if (this.qfr[i] > 0) {
        const V = this.qfr[i] * lat * dt, an = 1 - (1 - a) * Math.exp(-V / C.H0);
        hh += C.H0 * (an - a);
        a = an;
      }
      if (hh < C.H_MIN) { this.lost += hh * this.grid.area[i]; hh = 0; a = 0; this.P[i] = 0; }
      h[i] = hh; A[i] = Math.min(1, a);
      dh[i] += hh - h0;
    }
  }

  /** The cavitating pressure by projected SOR on the zone's cells strong enough to bear one; then the edges' velocities. */
  pressure() {
    const C = SEAICE, P = this.P, pm = this.pmax, act = this.active, g = this.grid, a = g.area, zc = this.zc;
    let na = 0;
    for (let q = 0; q < this.nz; q++) {
      const i = zc[q];
      const x = C.C_STAR * (1 - this.A[i]);   // strength falls e-fold per 5% of open water: past ~60%, none
      pm[i] = this.h[i] > 0 && x < 12 ? C.P_STAR * this.h[i] * Math.exp(-x) : 0;
      if (pm[i] > 1) act[na++] = i; else P[i] = 0;
    }
    this.nact = na;
    const nbrOff = g.nbrOff, nbr = g.nbr, he = this.he, ke = this.ke, df = this.df, w = C.SOR;
    // Sweeps until the largest change is under TOL of the largest pressure (at least SWEEPS: warm-started, a
    // month's substeps rarely need more; a pack suddenly pressed needs ~N² for N cells of it).
    let mp = 0, s = 0;
    for (; s < C.SWEEPS_MAX && na; s++) {
      let dmax = 0;
      mp = 0;
      for (let q = 0; q < na; q++) {
        const i = act[q];
        let sk = 0, sp = 0;
        for (let t = nbrOff[i], te = nbrOff[i + 1]; t < te; t++) { const k = ke[he[t]]; sk += k; sp += k * P[nbr[t]]; }
        if (!(sk > 0)) { P[i] = 0; continue; }
        // a_i D_i = a_i Df_i + Σ k (P_i − P_j) = 0, projected onto [0, Pmax].
        const target = (sp - a[i] * df[i]) / sk, pn = Math.max(0, Math.min(pm[i], P[i] + w * (target - P[i])));
        const d = Math.abs(pn - P[i]);
        if (d > dmax) dmax = d;
        P[i] = pn;
        if (pn > mp) mp = pn;
      }
      if (s + 1 >= C.SWEEPS && !(dmax > C.TOL * mp)) { s++; break; }
    }
    this.stats.maxP = mp; this.stats.sweeps = s;
    const ei = this.ei, ej = this.ej, un = this.un, unf = this.unf, el = this.el, ze = this.ze;
    for (let q = 0; q < this.nze; q++) {
      const e = ze[q];
      if (!this.wet[e]) continue;
      const dp = P[ej[e]] - P[ei[e]];
      un[e] = dp === 0 ? unf[e] : unf[e] - dp * ke[e] * R_M / el[e];   // − ΔP / (c R d)
    }
  }

  /** Upwind transport of h and A over `dt` seconds through the zone's wet edges; A capped at 1 (ridging). */
  advect(dt) {
    const a = this.grid.area, h = this.h, A = this.A, un = this.un, el = this.el, ei = this.ei, ej = this.ej, ze = this.ze, nze = this.nze;
    const fr = this.fr, dh = this.dh, dA = this.dA, zc = this.zc;
    for (let q = 0; q < this.nz; q++) { const i = zc[q]; fr[i] = 0; dh[i] = 0; dA[i] = 0; }
    // Outflow limiter: a cell can't give more than it holds (substeps keep this rare).
    for (let q = 0; q < nze; q++) {
      const e = ze[q], u = un[e];
      if (u === 0) continue;
      const up = u > 0 ? ei[e] : ej[e];
      if (h[up] > 0) fr[up] += Math.abs(u) * dt * el[e] / R_M;
    }
    for (let q = 0; q < this.nz; q++) { const i = zc[q]; fr[i] = fr[i] > 0.95 * a[i] ? 0.95 * a[i] / fr[i] : 1; }
    let np = 0;
    const pend = this.pend;
    for (let q = 0; q < nze; q++) {
      const e = ze[q], u = un[e];
      if (u === 0) continue;
      const i = ei[e], j = ej[e], up = u > 0 ? i : j, dn = u > 0 ? j : i;
      if (h[up] <= 0) continue;
      if (!this.inZone[dn] && dh[dn] === 0 && dA[dn] === 0) pend[np++] = dn;   // ice drifts out of the zone: the cell joins it
      const s = u * dt * el[e] / R_M * fr[up];   // sr swept, signed i → j
      const fh = s * h[up], fa = s * A[up];
      dh[i] -= fh; dh[j] += fh; dA[i] -= fa; dA[j] += fa;
    }
    const Hm = SEAICE.H_MIN;
    for (let q = 0, nz = this.nz; q < nz + np; q++) {
      const i = q < nz ? zc[q] : pend[q - nz];
      if (dh[i] === 0 && dA[i] === 0) continue;
      const hn = h[i] + dh[i] / a[i], an = A[i] + dA[i] / a[i];
      if (hn < Hm || an <= 0) { this.lost += Math.max(0, hn) * a[i]; h[i] = 0; A[i] = 0; this.P[i] = 0; }
      else { h[i] = hn; A[i] = an < 1 ? an : 1; }
    }
    for (let q = 0; q < np; q++) this.addCell(pend[q]);   // into the zone (its dh, dA stay for the month's export)
    this.npend = np;
  }

  /**
   * One month m (0–11, January first) under the month's mean forcing, all
   * coarse-grid arrays: Tair (°C, the sea-level air), wind u, v (m/s, east and
   * north, the surface wind), current u, v (m/s, east and north) and the SST
   * anomaly (K). The vectors and the anomaly may be null (zero). Leaves the
   * month's means in Am, hm, its thermodynamic growth in grow and its export
   * in out (m of ice per area of cell; rows of n at m·n).
   */
  stepMonth(m, Tair, wu, wv, cu, cv, sst) {
    const C = SEAICE, n = this.n, a = this.grid.area, h = this.h, A = this.A;
    this.prepare(Tair, wu, wv, cu, cv, sst);
    // Substeps from the free drift's Courant number in the zone.
    let rmax = 0;
    if (this.dynamics) {
      const rate = this.fr;
      for (let q = 0; q < this.nz; q++) rate[this.zc[q]] = 0;
      for (let q = 0; q < this.nze; q++) {
        const e = this.ze[q], u = this.unf[e];
        if (u === 0) continue;
        const up = u > 0 ? this.ei[e] : this.ej[e];
        if (this.inZone[up]) rate[up] += Math.abs(u) * this.el[e] / R_M;
      }
      for (let q = 0; q < this.nz; q++) { const i = this.zc[q]; if (rate[i] / a[i] > rmax) rmax = rate[i] / a[i]; }
    }
    const T = MONTH * DAY, k = Math.min(C.SUB_MAX, Math.max(C.SUB_MIN, Math.ceil(rmax * T / C.CFL))), dt = T / k;
    this.stats.substeps = k;
    const o = m * n, Am = this.Am, hm = this.hm, grow = this.grow, out = this.out, zc = this.zc;
    Am.fill(0, o, o + n); hm.fill(0, o, o + n); grow.fill(0, o, o + n); out.fill(0, o, o + n);
    for (let s = 0; s < k; s++) {
      if (this.thermo) {
        for (let q = 0; q < this.nz; q++) this.dh[zc[q]] = 0;
        this.thermodynamics(dt / DAY);
        for (let q = 0; q < this.nz; q++) { const i = zc[q]; grow[o + i] += this.dh[i]; }
      }
      if (this.dynamics) {
        this.pressure();
        this.advect(dt);
        for (let q = 0; q < this.nz; q++) { const i = zc[q]; out[o + i] -= this.dh[i] / a[i]; }
      }
      for (let q = 0; q < this.nz; q++) { const i = zc[q]; Am[o + i] += A[i] / k; hm[o + i] += h[i] / k; }
    }
    this.months++;
  }

  // ── The closure ──

  /**
   * The periodic year under a 12-month forcing: `forcing(m)` (or forcing[m])
   * gives [Tair, wu, wv, cu, cv, sst] for month m, as `stepMonth` takes them.
   * Whole years from the current state (or from open water, `cold`) until
   * January's state repeats: the area-weighted rms change over the cells with
   * ice under `tol` (m of mean thickness) and `tolA` (concentration). Not a
   * maximum: pack ice held at its strength's cap is a switching system, and a
   * few of its cells move ~0.1 m from year to year however long it runs.
   * Returns the years taken; the last year's months stay in Am, hm.
   */
  equilibrium(forcing, { tol = 0.005, tolA = 0.002, maxYears = 60, cold = false } = {}) {
    if (cold) { this.h.fill(0); this.A.fill(0); this.P.fill(0); }
    const get = typeof forcing === 'function' ? forcing : mm => forcing[mm];
    const n = this.n, h = this.h, A = this.A, ar = this.grid.area, h0 = new Float64Array(n), A0 = new Float64Array(n);
    let y = 0, dh = Infinity, dA = Infinity, mx = 0;
    while (y < maxYears) {
      h0.set(h); A0.set(A);
      for (let m = 0; m < 12; m++) { const f = get(m); this.stepMonth(m, f[0], f[1], f[2], f[3], f[4], f[5]); }
      y++;
      let sh = 0, sa = 0, w = 0;
      mx = 0;
      for (let i = 0; i < n; i++) {
        if (h[i] <= 0 && h0[i] <= 0) continue;
        const d = h[i] - h0[i], e = A[i] - A0[i];
        sh += ar[i] * d * d; sa += ar[i] * e * e; w += ar[i];
        if (Math.abs(d) > mx) mx = Math.abs(d);
      }
      dh = w > 0 ? Math.sqrt(sh / w) : 0; dA = w > 0 ? Math.sqrt(sa / w) : 0;
      if (dh < tol && dA < tolA) break;
    }
    this.stats.years = y; this.stats.converged = dh < tol && dA < tolA; this.stats.residual = { rmsH: dh, rmsA: dA, maxH: mx };
    return y;
  }

  // ── The climate's months (see the header) ──

  /** [Tair, wu, wv, cu, cv, sst] for month m from the climate, cached per climate version; dT (coarse, K) adds to the air. */
  climateMonth(m, dT = null) {
    const c = this.climate, n = this.n;
    if (!this.cache || this.cache.version !== c.version) this.cache = this.buildMonths();
    const f = this.cache.months[m];
    if (!dT) return f;
    const T = this.cache.tmp || (this.cache.tmp = new Float32Array(n));
    for (let i = 0; i < n; i++) T[i] = f[0][i] + dT[i];
    return [T, f[1], f[2], f[3], f[4], f[5]];
  }

  buildMonths() {
    const c = this.climate, n = this.n, fn = c.grid.n, E = this.east, N = this.north, Tc = c.Tc;
    this.setSea(this.seaFromClimate());
    // The phases' winds on the coarse grid (each component restricted; the grids nest, so a coarse cell is its fine cell).
    const W = [], a = new Float64Array(fn), b = new Float64Array(n);
    for (let p = 0; p < NP; p++) {
      const w = new Float64Array(3 * n), src = c.windPhase[p];
      for (let k = 0; k < 3; k++) {
        for (let i = 0; i < fn; i++) a[i] = src[3 * i + k];
        if (c.T && fn !== n) restrict(c.T, a, b); else b.set(a.subarray(0, n));
        for (let i = 0; i < n; i++) w[3 * i + k] = b[i];
      }
      W.push(w);
    }
    const oc = c.ocean && c.ocean.coarse && c.ocean.sst.length === n ? c.ocean : null;
    const cu = new Float32Array(n), cv = new Float32Array(n), sst = new Float32Array(n);
    if (oc) for (let i = 0; i < n; i++) {
      const o = 3 * i, vx = oc.vel[o], vy = oc.vel[o + 1], vz = oc.vel[o + 2];
      cu[i] = vx * E[o] + vy * E[o + 1] + vz * E[o + 2]; cv[i] = vx * N[o] + vy * N[o + 1] + vz * N[o + 2];
      sst[i] = oc.sst[i];
    }
    const months = [];
    for (let m = 0; m < 12; m++) {
      const tau = monthPhase(m), cs = Math.cos(2 * Math.PI * tau), sn = Math.sin(2 * Math.PI * tau), c2 = cs * cs - sn * sn, s2 = 2 * sn * cs;
      const T = new Float32Array(n), wu = new Float32Array(n), wv = new Float32Array(n);
      for (let i = 0; i < n; i++) T[i] = Tc[0][i] + Tc[1][i] * cs - Tc[2][i] * sn + Tc[3][i] * c2 - Tc[4][i] * s2;
      const x = ((tau * NP - 0.5) % NP + NP) % NP, k = Math.floor(x), w = x - k, A = W[k], B = W[(k + 1) % NP];
      for (let i = 0; i < n; i++) {
        const o = 3 * i;
        const vx = A[o] * (1 - w) + B[o] * w, vy = A[o + 1] * (1 - w) + B[o + 1] * w, vz = A[o + 2] * (1 - w) + B[o + 2] * w;
        wu[i] = vx * E[o] + vy * E[o + 1] + vz * E[o + 2]; wv[i] = vx * N[o] + vy * N[o + 1] + vz * N[o + 2];
      }
      months.push([T, wu, wv, cu, cv, sst]);
    }
    return { version: c.version, months };
  }

  /** The year's hook (src/engine/year.js), each month while live: the climate's month, stepped. */
  month(inp) { const f = this.climateMonth(inp.month, inp.dTc || null); this.stepMonth(inp.month, f[0], f[1], f[2], f[3], f[4], f[5]); }

  /** The closure: the periodic year under the climate's months, re-solved (warm) when the climate has cycled. */
  closure() {
    const c = this.climate;
    if (this.eq && this.eq.version === c.version) return false;
    this.equilibrium(m => this.climateMonth(m));
    this.eq = { version: c.version, A: this.Am.slice(), h: this.hm.slice() };
    return true;
  }

  /** A coarse field (a month's row of Am, say) on the climate's grid. */
  fine(field, out = new Float32Array(this.climate.grid.n)) {
    const c = this.climate;
    if (c.grid.n === this.n) { out.set(field.subarray ? field.subarray(0, this.n) : field); return out; }
    const src = Float64Array.from(field.subarray ? field.subarray(0, this.n) : field), dst = new Float64Array(c.grid.n);
    prolong(c.T, src, dst);
    out.set(dst);
    return out;
  }

  /** Extent (10⁶ km², concentration ≥ EXTENT) and volume (10³ km³) by hemisphere, for month m's means. */
  measure(m) {
    const n = this.n, a = this.grid.area, o = m * n, R2 = R_M * R_M;
    const r = { north: { extent: 0, area: 0, volume: 0 }, south: { extent: 0, area: 0, volume: 0 } };
    for (let i = 0; i < n; i++) {
      if (!this.sea[i]) continue;
      const H = this.lat[i] >= 0 ? r.north : r.south, Ai = this.Am[o + i];
      if (Ai >= SEAICE.EXTENT) H.extent += a[i] * R2 / 1e12;
      H.area += Ai * a[i] * R2 / 1e12;
      H.volume += this.hm[o + i] * a[i] * R2 / 1e12;
    }
    return r;
  }

  /** The ice's freshwater export over the last year: Σ of each cell's net export, as Sv of fresh water, by hemisphere. */
  freshwater() {
    const n = this.n, a = this.grid.area, R2 = R_M * R_M, yr = 365.2422 * DAY;
    let N = 0, S = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let m = 0; m < 12; m++) s += this.out[m * n + i];
      if (s <= 0) continue;
      const v = s * a[i] * R2 * RHO_I / RHO_FW / yr / 1e6;
      if (this.lat[i] >= 0) N += v; else S += v;
    }
    return { north: N, south: S };
  }
}
