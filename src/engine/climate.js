// The climate (docs/PLAN.md, layers 4 and 9): temperature through the year,
// the winds' template, moisture and rain, and the soft climate zones.
//
// Temperature. A seasonal energy-balance model (standard: Budyko, Sellers,
// North): C ∂T/∂t = S(1 − α) − (A + B T) + 5.35 ln(CO₂/CO₂₀) + ∇·(D ∇T), with
// the heat capacity of the ocean's mixed layer at sea and of the air over
// land. The year is solved as harmonics, T = T̄ + Σₖ Re(T̂ₖ e^{ikωt}), each
// one elliptic: (B + ikωC) T̂ₖ − ∇·D∇T̂ₖ = F̂ₖ, so the oceans' seasonal lag and
// the continents' wide seasons come straight out of it. Albedo (snow, sea
// ice, deserts) depends on the temperature through the year, so the absorbed
// sunlight is re-evaluated at 24 points of the year from the last solution
// and its harmonics re-solved: a fixed point, warm-started, which also keeps
// the ice-albedo feedback's hysteresis. T is the sea-level temperature; the
// surface is colder by the lapse rate. Solved on the level below the
// surface's (220 km cells): heat spreads over thousands of km.
//
// Circulation (synthesis). A template, not a solve: the ITCZ follows the
// warmest latitude in each sector of longitude, the Hadley cell's edge scales
// as Held and Hou's, ∝ √ΔT / Ω, and surface pressure has the ITCZ's trough,
// the subtropical highs, the subpolar lows and the polar highs, plus a low
// over land warmer than its latitude and a high over land colder than it
// (the monsoons). The surface wind balances the pressure gradient against
// Coriolis and friction, r u + f k×u = −∇p/ρ: geostrophic with a cross-isobar
// drift at mid-latitudes, down the gradient at the equator.
//
// Moisture (synthesis). Column water W is carried by those winds and eddy
// diffusion, ∇·(uW) − ∇·(κ∇W) = E − P, steady, at six points of the year.
// The sea evaporates toward saturation (Clausius–Clapeyron, ~6.5%/K); land
// recycles part of its rain, by its soil's wetness (the ground's evaporative
// efficiency at that point of the year), and a lake's share of a cell
// evaporates as the sea does (a fifth as much when frozen). It rains where the column passes 75% of
// saturation (convergence and cooling: the ITCZ, air rising over mountains),
// where air is lifted up a slope, and lightly elsewhere except where the air
// is sinking (the subtropical highs). Lee slopes get rain shadows because the
// air that crosses a range has already rained out. Solved by Gauss–Seidel
// sweeps in four directions of the globe (fast sweeping), warm-started.
//
// Zones (synthesis, soft-everywhere). Köppen's classes (Peel and others'
// thresholds, from memory) are thresholds on the monthly temperatures and
// precipitation. Each threshold here is a logistic whose width stands for the
// spread from year to year, so each cell holds a probability over the
// fourteen classes.
//
// The ground (src/engine/soil.js). Each cycle's months (surface temperature,
// rain, the potential evaporation of Budyko's scale month by month) drive the
// soil's bucket, snowpack and ground heat to their periodic year: the closure
// the year steps live from (src/engine/ground.js). Its runoff, by month and in
// the year, goes to the landscape and the rivers; its evaporative efficiency
// to the next cycle's moisture. Lakes (src/engine/lakes.js) add open water to
// the moisture balance and the albedo.

import { buildGrid, gradient } from '../grid/icosphere.js';
import { makeTransfer, prolong, restrict } from '../grid/transfer.js';
import { EARTH_ORBIT, S0, insolation, solarLongitude, monthPhase } from './orbit.js';
import { Soil, SOIL, potentialEvaporation } from './soil.js';

export const CLIMATE = {
  A: 203.3, B: 2.09,       // OLR = A + B·T (W/m², T in °C), North's fit to Earth (from memory)
  D: 0.45,                 // heat diffusion, W m⁻² K⁻¹ on the unit sphere (the annual mean)
  D_SEASON: 0.1,           // for the seasonal harmonics: transport smooths a season's land–sea contrast less
  C_OCEAN: 7.9,            // W yr m⁻² K⁻¹: a 60 m mixed layer
  C_LAND: 0.3,
  C_ICE: 1.2,
  LAPSE: 6.5,              // K/km
  ALB_OCEAN: 0.25, ALB_LAND: 0.27, ALB_POLAR: 0.12,   // + ALB_POLAR·sin²φ (sun angle, cloud)
  ALB_SNOW: 0.62, ALB_SEAICE: 0.56,
  ALB_DESERT: 0.07, ALB_FOREST: -0.03,
  CO2: 280, CO2_REF: 280,  // ppm
  S: S0,
  // Circulation and moisture
  OMEGA: 7.292e-5,         // rad/s, the planet's spin
  FRICTION: 4.5e-5,        // 1/s
  CARRY: 0.4,              // share of the down-gradient (frictional) drift the moisture-bearing layer takes
  KAPPA_W: 7e4,            // km²/day, eddy mixing of moisture
  CONV_A: 15.6,            // convective rain = (W_s/60 mm) e^{a (r − r₀)} mm/day at column humidity r
  CONV_R0: 0.603,          //   (the shape of Bretherton and others' tropical fit; constants from memory)
  RAIN_BG: 0.08,           // 1/day where the air isn't sinking
  RAIN_ORO: 2.5,           // 1/day per m/s of lift up a slope
  EVAP: 0.35,              // 1/day toward saturation at 7 m/s
  RAIN_MAX: 25,            // mm/day in a cell: past it the column stays supersaturated and carries on (precipitation efficiency)
  LAND_EVAP: 0.56,         // land's evaporation relative to the sea's, at the soil's full efficiency (β = 1): retuned
                           // from 0.6 when the soil's β replaced P/(P + 2.5 mm/day), so land's rain stayed within 0.6%
  LAKE_ICE: 0.15,          // a frozen lake's evaporation relative to open water's
  SWEEPS: 6,               // Gauss–Seidel sweeps of the moisture balance on the CPU, warm-started (four times as many cold)
  GPU_PASSES: 160,         // Jacobi passes of the moisture balance on the GPU, warm-started (four times as many cold)
  F_VOLC: 0,               // W/m²: the volcanoes' mean forcing against the opening's (src/engine/volcanoes.js)
  // The zones' widths: the year's own spread (src/engine/year.js) where there is one, with these
  // floors in quadrature (the classification's own uncertainty: a cell is 55–220 km of climates);
  // without one, the fixed widths (K, and in log rain).
  ZONE_FLOOR_T: 0.5, ZONE_FLOOR_P: 0.1, ZONE_T: 1.5, ZONE_P: 0.25,
};

export const ZONES = ['Af', 'Am', 'Aw', 'As', 'BW', 'BS', 'Cf', 'Cs', 'Cw', 'Df', 'Ds', 'Dw', 'ET', 'EF'];
export const NZ = 16;          // padded to four vec4s per cell for the GPU
const NS = 24;                 // samples of the year for albedo
const NP = 6;                  // points of the year for the winds and rain
const NLAT = 181;
const R_KM = 6371, R_M = 6.371e6;
const W0 = 25, WA = 0.065;     // saturated column water (mm) = W0 e^{WA (T − 15)}

const sigmoid = x => 1 / (1 + Math.exp(-x));
const ramp = (x, a, b) => { const t = (x - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };
const wsat = T => W0 * Math.exp(WA * (Math.max(-45, Math.min(45, T)) - 15));

/** Preconditioned conjugate gradients for a complex symmetric system (COCG; real when im = 0). */
export function cocg(g, D, dr, di, br, bi, xr, xi, ws, maxIt, tol) {
  const n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, w = ws.w;
  const { rr, ri, zr, zi, pr, pi, qr, qi, mr, mi } = ws;
  const apply = (ur, ui, outr, outi) => {
    for (let i = 0; i < n; i++) {
      let sr = 0, si = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) { const j = nbr[t]; sr += w[t] * (ur[j] - ur[i]); si += w[t] * (ui[j] - ui[i]); }
      outr[i] = dr[i] * ur[i] - di[i] * ui[i] - D * sr;
      outi[i] = dr[i] * ui[i] + di[i] * ur[i] - D * si;
    }
  };
  // Jacobi preconditioner: 1 / (d + D Σw).
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) s += w[t];
    const ar = dr[i] + D * s, ai = di[i], m2 = ar * ar + ai * ai;
    mr[i] = ar / m2; mi[i] = -ai / m2;
  }
  apply(xr, xi, qr, qi);
  let bn = 0;
  for (let i = 0; i < n; i++) { rr[i] = br[i] - qr[i]; ri[i] = bi[i] - qi[i]; bn += br[i] * br[i] + bi[i] * bi[i]; }
  bn = Math.sqrt(bn) || 1;
  let rhoR = 0, rhoI = 0;
  for (let i = 0; i < n; i++) {
    zr[i] = mr[i] * rr[i] - mi[i] * ri[i]; zi[i] = mr[i] * ri[i] + mi[i] * rr[i];
    pr[i] = zr[i]; pi[i] = zi[i];
    rhoR += rr[i] * zr[i] - ri[i] * zi[i]; rhoI += rr[i] * zi[i] + ri[i] * zr[i];
  }
  let it = 0;
  for (; it < maxIt; it++) {
    apply(pr, pi, qr, qi);
    let sR = 0, sI = 0;
    for (let i = 0; i < n; i++) { sR += pr[i] * qr[i] - pi[i] * qi[i]; sI += pr[i] * qi[i] + pi[i] * qr[i]; }
    const s2 = sR * sR + sI * sI;
    if (!(s2 > 0)) break;
    const aR = (rhoR * sR + rhoI * sI) / s2, aI = (rhoI * sR - rhoR * sI) / s2;
    let rn = 0;
    for (let i = 0; i < n; i++) {
      xr[i] += aR * pr[i] - aI * pi[i]; xi[i] += aR * pi[i] + aI * pr[i];
      rr[i] -= aR * qr[i] - aI * qi[i]; ri[i] -= aR * qi[i] + aI * qr[i];
      rn += rr[i] * rr[i] + ri[i] * ri[i];
    }
    if (Math.sqrt(rn) / bn < tol) { it++; break; }
    let nR = 0, nI = 0;
    for (let i = 0; i < n; i++) {
      zr[i] = mr[i] * rr[i] - mi[i] * ri[i]; zi[i] = mr[i] * ri[i] + mi[i] * rr[i];
      nR += rr[i] * zr[i] - ri[i] * zi[i]; nI += rr[i] * zi[i] + ri[i] * zr[i];
    }
    const r2 = rhoR * rhoR + rhoI * rhoI;
    const bR = (nR * rhoR + nI * rhoI) / r2, bI = (nI * rhoR - nR * rhoI) / r2;
    for (let i = 0; i < n; i++) {
      const p0 = pr[i], p1 = pi[i];
      pr[i] = zr[i] + bR * p0 - bI * p1; pi[i] = zi[i] + bR * p1 + bI * p0;
    }
    rhoR = nR; rhoI = nI;
  }
  return it;
}

export class Climate {
  constructor(tec, land = null, opts = {}) {
    this.tec = tec;
    this.land = land;
    const fine = this.grid = tec.grid;
    const n = fine.n;
    // The energy balance (and the ocean's gyres, on the same grid) at 220 km whatever the
    // engine's level: the temperature is smooth at that scale, and at 110 km the cold
    // cycle's three solves cost ~2 s of a level-7 opening.
    this.coarse = buildGrid(Math.min(fine.level - 1, 5));
    this.T = makeTransfer(fine, this.coarse);
    const nc = this.coarse.n;
    this.orbit = { ...EARTH_ORBIT, ...(opts.orbit || {}) };

    // Geometry, fine.
    this.lat = new Float64Array(n); this.lon = new Float64Array(n);
    this.row = new Int16Array(n); this.roww = new Float32Array(n);
    this.sector = new Uint8Array(n); this.band = new Uint8Array(n);
    this.cor = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const z = fine.pos[3 * i + 2];
      const la = Math.asin(Math.max(-1, Math.min(1, z))), lo = Math.atan2(fine.pos[3 * i + 1], fine.pos[3 * i]);
      this.lat[i] = la; this.lon[i] = lo;
      const x = (la + Math.PI / 2) / Math.PI * (NLAT - 1);
      this.row[i] = Math.min(NLAT - 2, Math.floor(x)); this.roww[i] = x - this.row[i];
      this.sector[i] = Math.min(35, Math.floor((lo + Math.PI) / (2 * Math.PI) * 36));
      this.band[i] = Math.min(89, Math.floor((la + Math.PI / 2) / Math.PI * 90));
    }
    this.bandArea = new Float64Array(90);
    for (let i = 0; i < n; i++) this.bandArea[this.band[i]] += fine.area[i];
    // Edge weights for the coarse Laplacian.
    const cg = this.coarse;
    this.ws = { w: Float64Array.from(cg.ell, (l, t) => l / cg.dist[t]) };
    for (const k of ['rr', 'ri', 'zr', 'zi', 'pr', 'pi', 'qr', 'qi', 'mr', 'mi']) this.ws[k] = new Float64Array(nc);

    // State: harmonics of the sea-level temperature, coarse (warm start) and fine.
    this.Tc = [new Float64Array(nc).fill(14), new Float64Array(nc), new Float64Array(nc), new Float64Array(nc), new Float64Array(nc)];
    this.Fc = [0, 1, 2, 3, 4].map(() => new Float64Array(nc));
    this.Tf = [0, 1, 2, 3, 4].map(() => new Float32Array(n));
    this.Tf[0].fill(14);
    this.Pf = [0, 1, 2, 3, 4].map(() => new Float32Array(n));
    this.Pf[0].fill(2.5);
    this.W = Array.from({ length: NP }, () => new Float32Array(n).fill(20));
    this.Pph = Array.from({ length: NP }, () => new Float32Array(n).fill(2.5));
    this.zones = new Float32Array(NZ * n);
    this.snowAnn = new Float32Array(n);    // fraction of the year under snow (land) or sea ice
    this.runoff = new Float32Array(n);         // m/yr, the ground's (its periodic year)
    this.runoffM = new Float32Array(12 * n);   // runoff by month (m), January first: rivers' seasons
    // The ground: its periodic year under this climate's months (the closure; the year steps
    // it live, src/engine/ground.js). Sea and grounded ice hold no soil water.
    this.soil = new Soil(n, 0);
    this.T12 = new Float32Array(12 * n);       // surface °C by month (12 i + m)
    this.P12 = new Float32Array(12 * n);       // rain, mm in the month
    this.PET12 = new Float32Array(12 * n);     // potential evaporation, mm in the month
    this.peAnn = new Float32Array(n);          // m/yr: rain less potential evaporation (what open water gains)
    this.pAnn = new Float32Array(n);           // m/yr: rain (land)
    this.betaPh = Array.from({ length: NP }, () => new Float32Array(n).fill(0.5));   // the ground's evaporative efficiency at each point of the year
    this.soilWarm = false;
    this.lakes = null;   // src/engine/lakes.js, when there is one
    this.lakeWet = new Float32Array(n);        // the lakes' share of each cell, as this cycle saw it
    this.ground = null;  // the live ground (src/engine/ground.js): its slow mean, weighed by the year's live weight
    this.upz = new Float64Array(3 * n);
    this.elevPos = new Float64Array(n);
    this.landMask = new Uint8Array(n);
    this.landFracC = new Float64Array(nc);
    this.wind = new Float32Array(3 * n);   // the last phase's surface wind (m/s), for drawing
    this.windPhase = Array.from({ length: NP }, () => new Float32Array(3 * n));
    this.pres = new Float32Array(n);
    this.presPhase = Array.from({ length: NP }, () => new Float32Array(n));   // the template's pressure at each point of the year
    this.itcz = new Float32Array(NP * 36);
    this.zonal = null;
    this.stats = { meanT: 14, iceLat: 90, cycles: 0, hadley: 30 };
    this.scratch = {
      f6: new Float64Array(n), c5: new Float64Array(nc), c5b: new Float64Array(nc),
      F: [0, 1, 2, 3, 4].map(() => new Float64Array(n)),
      alb: new Float32Array(n),
    };
    // Sweep orders for the moisture solve.
    const idx = Array.from({ length: n }, (_, i) => i);
    const byLon = idx.slice().sort((a, b) => this.lon[a] - this.lon[b]);
    const byLat = idx.slice().sort((a, b) => this.lat[a] - this.lat[b]);
    this.orders = [Int32Array.from(byLon), Int32Array.from(byLon.reverse()), Int32Array.from(byLat), Int32Array.from(byLat.reverse())];
    this.ice = null;     // src/engine/ice.js, when there is one
    this.gpu = null;     // src/gpu/moisture.js, where there's a device (the page's engine)
    this.ocean = null;   // src/engine/ocean.js, when there is one
    this.year = null;    // src/engine/year.js, when there is one: the zones' widths
    this.warm = false;
    this.it = null;
    this.version = 0;
    this.qtab = null;
    this.qkey = '';
  }

  /** Insolation at NS phases of the year, by latitude row. */
  insolationRows() {
    const o = this.orbit, key = `${o.e},${o.obliquity},${o.perihelion},${CLIMATE.S}`;
    if (key === this.qkey) return this.qtab;
    const tab = new Float64Array(NLAT * NS);
    for (let s = 0; s < NS; s++) {
      const lam = solarLongitude((s + 0.5) / NS, o);
      for (let l = 0; l < NLAT; l++) tab[l * NS + s] = insolation(-Math.PI / 2 + Math.PI * l / (NLAT - 1), lam, o, CLIMATE.S);
    }
    this.qtab = tab; this.qkey = key;
    return tab;
  }

  /** Sea-level temperature at year phase τ, fine cell i. */
  tAt(i, tau) {
    const c = Math.cos(2 * Math.PI * tau), s = Math.sin(2 * Math.PI * tau);
    const c2 = c * c - s * s, s2 = 2 * s * c;
    const T = this.Tf;
    return T[0][i] + T[1][i] * c - T[2][i] * s + T[3][i] * c2 - T[4][i] * s2;
  }
  pAt(i, tau) {
    const c = Math.cos(2 * Math.PI * tau), s = Math.sin(2 * Math.PI * tau);
    const c2 = c * c - s * s, s2 = 2 * s * c;
    const P = this.Pf;
    return Math.max(0, P[0][i] + P[1][i] * c - P[2][i] * s + P[3][i] * c2 - P[4][i] * s2);
  }
  /** The template's sea-level pressure (hPa about the mean) at year phase τ, by the six points' harmonics. */
  presAt(i, tau) {
    const x = ((tau * NP - 0.5) % NP + NP) % NP, k = Math.floor(x), w = x - k;
    return this.presPhase[k][i] * (1 - w) + this.presPhase[(k + 1) % NP][i] * w;
  }
  /** Surface temperature: the sea-level value less the lapse rate over land. */
  surfaceT(i, tau) { return this.tAt(i, tau) - CLIMATE.LAPSE * this.elevPos[i]; }

  /** Snapshot of the geography the climate sees. */
  geography() {
    const tec = this.tec, n = this.grid.n, s = tec.seaLevel, H = this.ice ? this.ice.H : null;
    for (let i = 0; i < n; i++) {
      const e = tec.elev[i] - s, h = H ? H[i] / 1000 : 0;   // grounded ice counts as land, its surface as the height
      this.landMask[i] = e > 0 || h > 0 ? 1 : 0;
      this.elevPos[i] = Math.max(0, e + h);
    }
    // The soil's capacity: land, but not under grounded ice (the ice owns its water).
    const cap = this.soilCap || (this.soilCap = new Float32Array(n));
    for (let i = 0; i < n; i++) cap[i] = this.landMask[i] && !(H && H[i] > 1) ? SOIL.SMAX : 0;
    this.soil.setCapacity(cap);
    if (this.lakes) this.lakeWet.set(this.lakes.wet); else this.lakeWet.fill(0);
    gradient(this.grid, this.elevPos, this.upz);
    for (let i = 0; i < 3 * n; i++) this.upz[i] /= R_KM;   // km per km
    const f6 = this.scratch.f6;
    for (let i = 0; i < n; i++) f6[i] = this.landMask[i];
    restrict(this.T, f6, this.landFracC);
  }

  /** Albedo of fine cell i at sea-level temperature T (at sea, the surface's: the air's plus the gyres' anomaly). */
  albedo(i, T) {
    const C = CLIMATE, s = Math.sin(this.lat[i]), polar = C.ALB_POLAR * s * s;
    if (this.ice && this.ice.H[i] > 10) return C.ALB_SNOW;
    if (this.landMask[i]) {
      const z = this.zones, o = NZ * i;
      const base = C.ALB_LAND + polar + C.ALB_DESERT * (z[o + 4] + 0.5 * z[o + 5]) + C.ALB_FOREST * (z[o] + z[o + 1] + 0.5 * (z[o + 6] + z[o + 9]));
      const Ts = T - C.LAPSE * this.elevPos[i], a = base + (C.ALB_SNOW - base) * ramp(-Ts, -1, 5), lw = this.lakeWet[i];
      if (!(lw > 0)) return a;
      // A lake's share of the cell: open water, or its ice (fresh water freezes at 0 °C).
      const wa = C.ALB_OCEAN + polar;
      return a + lw * (wa + (C.ALB_SEAICE - wa) * ramp(-Ts, 0, 4.5) - a);
    }
    const base = C.ALB_OCEAN + polar;
    return base + (C.ALB_SEAICE - base) * ramp(-T, 1.5, 6);
  }

  /** The energy balance: absorbed sunlight from the last state, then the five harmonic solves. */
  *ebm() {
    const C = CLIMATE, g = this.grid, n = g.n, cg = this.coarse, nc = cg.n;
    const Q = this.insolationRows(), F = this.scratch.F;
    // Absorbed sunlight through the year, and its harmonics (fine).
    const cs = new Float64Array(NS), sn = new Float64Array(NS);
    for (let s = 0; s < NS; s++) { cs[s] = Math.cos(2 * Math.PI * (s + 0.5) / NS); sn[s] = Math.sin(2 * Math.PI * (s + 0.5) / NS); }
    // Sea ice reads the sea's own surface: the air's temperature plus the gyres' anomaly
    // (warm currents keep a sea open poleward of its latitude's ice edge, cold ones carry
    // ice toward the equator), so the edge isn't the energy balance's latitude circle.
    const sstA = this.ocean ? this.ocean.fine.sst : null;
    for (let i = 0; i < n; i++) {
      const l = this.row[i], w = this.roww[i], land = this.landMask[i], tp = !land && sstA ? sstA[i] : 0;
      let f0 = 0, a1 = 0, b1 = 0, a2 = 0, b2 = 0, cold = 0;
      for (let s = 0; s < NS; s++) {
        const q = Q[l * NS + s] * (1 - w) + Q[(l + 1) * NS + s] * w;
        const c = cs[s], sv = sn[s], c2 = c * c - sv * sv, s2 = 2 * sv * c;
        const T = this.Tf[0][i] + this.Tf[1][i] * c - this.Tf[2][i] * sv + this.Tf[3][i] * c2 - this.Tf[4][i] * s2 + tp;
        const a = this.albedo(i, T);
        const fa = q * (1 - a);
        f0 += fa; a1 += fa * c; b1 -= fa * sv; a2 += fa * c2; b2 -= fa * s2;
        cold += land ? ramp(-(T - C.LAPSE * this.elevPos[i]), -1, 5) : ramp(-T, 1.5, 6);
      }
      F[0][i] = f0 / NS; F[1][i] = 2 * a1 / NS; F[2][i] = 2 * b1 / NS; F[3][i] = 2 * a2 / NS; F[4][i] = 2 * b2 / NS;
      this.snowAnn[i] = cold / NS;
    }
    yield;
    for (let k = 0; k < 5; k++) restrict(this.T, F[k], this.Fc[k]);
    // Heat capacity (coarse): land, open sea, and sea under ice.
    const f6 = this.scratch.f6, iceC = this.scratch.c5b;
    for (let i = 0; i < n; i++) f6[i] = this.landMask[i] ? 0 : this.snowAnn[i];
    restrict(this.T, f6, iceC);
    const cap = this.scratch.c5;
    for (let I = 0; I < nc; I++) {
      const lf = this.landFracC[I], ice = Math.min(1, iceC[I] / Math.max(1e-6, 1 - lf));
      cap[I] = lf * C.C_LAND + (1 - lf) * (C.C_OCEAN + (C.C_ICE - C.C_OCEAN) * ice);
    }
    const A = cg.area, dr = new Float64Array(nc), di = new Float64Array(nc);
    const br = new Float64Array(nc), bi = new Float64Array(nc);
    const forcing = 5.35 * Math.log(C.CO2 / C.CO2_REF) + C.F_VOLC;
    const tol = this.warm ? 1e-5 : 1e-7, maxIt = this.warm ? 60 : 300;
    // Mean: B T̄ − ∇·D∇T̄ = F̄ − A + ΔF.
    for (let I = 0; I < nc; I++) { dr[I] = A[I] * C.B; di[I] = 0; br[I] = A[I] * (this.Fc[0][I] - C.A + forcing); bi[I] = 0; }
    const zero = this.scratch.c5b.fill(0);
    cocg(cg, C.D, dr, di, br, bi, this.Tc[0], zero, this.ws, maxIt, tol);
    yield;
    for (let k = 1; k <= 2; k++) {
      const om = 2 * Math.PI * k;
      for (let I = 0; I < nc; I++) {
        dr[I] = A[I] * C.B; di[I] = A[I] * om * cap[I];
        br[I] = A[I] * this.Fc[2 * k - 1][I]; bi[I] = A[I] * this.Fc[2 * k][I];
      }
      cocg(cg, C.D_SEASON, dr, di, br, bi, this.Tc[2 * k - 1], this.Tc[2 * k], this.ws, maxIt, tol);
      yield;
    }
    for (let k = 0; k < 5; k++) {
      prolong(this.T, this.Tc[k], f6);
      for (let i = 0; i < n; i++) this.Tf[k][i] = f6[i];
    }
    // Mean surface temperature, and the ice line: the latitude whose polar cap
    // has the area colder than −10 °C in the annual mean (Budyko's criterion), per hemisphere.
    let sum = 0, capN = 0, capS = 0;
    for (let i = 0; i < n; i++) {
      const Ts = this.Tf[0][i] - C.LAPSE * this.elevPos[i];
      sum += Ts * g.area[i];
      if (Ts < -10) { if (this.lat[i] >= 0) capN += g.area[i]; else capS += g.area[i]; }
    }
    this.stats.meanT = sum / (4 * Math.PI);
    const edge = a => Math.asin(Math.max(0, Math.min(1, 1 - a / (2 * Math.PI)))) * 180 / Math.PI;
    this.stats.iceLat = 0.5 * (edge(capN) + edge(capS));
  }

  /** Winds and rain at one point of the year. */
  *phase(p) {
    const C = CLIMATE, g = this.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, tan = g.tan, pos = g.pos;
    const tau = (p + 0.5) / NP;
    const T = this.scratch.f6;
    for (let i = 0; i < n; i++) T[i] = this.tAt(i, tau);
    // Zonal means and the ITCZ by sector.
    const zm = new Float64Array(90), za = new Float64Array(90);
    const sec = new Float64Array(36 * 30), secA = new Float64Array(36 * 30);   // ±30° in 2° bands
    for (let i = 0; i < n; i++) {
      const b = this.band[i], a = g.area[i];
      zm[b] += T[i] * a; za[b] += a;
      if (b >= 30 && b < 60) { const k = this.sector[i] * 30 + b - 30; sec[k] += T[i] * a; secA[k] += a; }
    }
    for (let b = 0; b < 90; b++) zm[b] = za[b] > 0 ? zm[b] / za[b] : 0;
    const itcz = new Float64Array(36);
    for (let s = 0; s < 36; s++) {
      let best = -1e9, bb = 15;
      for (let b = 0; b < 30; b++) {
        const k = s * 30 + b;
        if (!(secA[k] > 0)) continue;
        const la = -29 + 2 * b;
        const score = sec[k] / secA[k] - 0.6 * (la / 14) * (la / 14);
        if (score > best) { best = score; bb = b; }
      }
      itcz[s] = (-29 + 2 * bb) * Math.PI / 180;
    }
    // Smooth around the globe, and bound.
    for (let pass = 0; pass < 3; pass++) {
      const t = itcz.slice();
      for (let s = 0; s < 36; s++) itcz[s] = 0.25 * t[(s + 35) % 36] + 0.5 * t[s] + 0.25 * t[(s + 1) % 36];
    }
    for (let s = 0; s < 36; s++) { itcz[s] = Math.max(-0.35, Math.min(0.35, itcz[s])); this.itcz[p * 36 + s] = itcz[s]; }
    // Hadley edge: Held and Hou's scaling from the equator-to-pole contrast and the spin.
    const zAt = la => { const x = (la + Math.PI / 2) / Math.PI * 90 - 0.5, b = Math.max(0, Math.min(88, Math.floor(x))), w = Math.min(1, Math.max(0, x - b)); return zm[b] * (1 - w) + zm[b + 1] * w; };
    const dT = Math.max(5, zAt(0) - 0.5 * (zAt(1.05) + zAt(-1.05)));
    const phiH = Math.max(0.2, Math.min(1.0, (30 * Math.PI / 180) * Math.sqrt(dT / 38) * (7.292e-5 / C.OMEGA)));
    this.stats.hadley = phiH * 180 / Math.PI;
    yield;
    // The thermal part of pressure: land warmer or colder than its latitude, smoothed (coarse).
    const anom = this.scratch.F[0], c5 = this.scratch.c5, c5b = this.scratch.c5b;
    for (let i = 0; i < n; i++) anom[i] = T[i] - zAt(this.lat[i]);
    restrict(this.T, anom, c5);
    {
      const cg = this.coarse, w = this.ws.w;
      // Six passes on level 5's cells (the scale the template was tuned at), more on finer.
      const passes = Math.round(6 * this.coarse.n / 10242);
      for (let pass = 0; pass < passes; pass++) {
        for (let I = 0; I < cg.n; I++) {
          let s = 0, ws = 0;
          for (let t = cg.nbrOff[I], e = cg.nbrOff[I + 1]; t < e; t++) { s += w[t] * c5[cg.nbr[t]]; ws += w[t]; }
          c5b[I] = 0.4 * c5[I] + 0.6 * s / ws;
        }
        c5.set(c5b);
      }
    }
    prolong(this.T, c5, anom);
    // Pressure (hPa about the mean).
    const pres = this.pres, G = (x, w) => Math.exp(-0.5 * (x / w) * (x / w));
    for (let i = 0; i < n; i++) {
      const la = this.lat[i], pi = itcz[this.sector[i]];
      const N = phiH + 0.45 * pi, S = -phiH + 0.45 * pi;
      const NL = Math.min(1.2, 2.05 * phiH) + 0.3 * pi, SL = -Math.min(1.2, 2.05 * phiH) + 0.3 * pi;
      pres[i] = -7 * G(la - pi, 0.2) + 11 * (G(la - N, 0.17) + G(la - S, 0.17)) - 13 * (G(la - NL, 0.2) + G(la - SL, 0.2))
        + 8 * (G(la - Math.PI / 2, 0.28) + G(la + Math.PI / 2, 0.28)) - 0.75 * anom[i];
    }
    this.presPhase[p].set(pres);
    // Winds: r u + f k×u = −∇p/ρ.
    if (!this.gp) this.gp = new Float64Array(3 * n);
    gradient(g, pres, this.gp);
    const r = C.FRICTION, wind = this.windPhase[p];
    if (!this.carry) this.carry = new Float32Array(3 * n);
    const carry = this.carry, cy = C.CARRY;
    for (let i = 0; i < n; i++) {
      const gx = -this.gp[3 * i] * 100 / R_M / 1.2, gy = -this.gp[3 * i + 1] * 100 / R_M / 1.2, gz = -this.gp[3 * i + 2] * 100 / R_M / 1.2;
      const px = pos[3 * i], py = pos[3 * i + 1], pz = pos[3 * i + 2];
      const f = 2 * C.OMEGA * pz;
      // k × G
      const kx = py * gz - pz * gy, ky = pz * gx - px * gz, kz = px * gy - py * gx;
      const d = r * r + f * f;
      wind[3 * i] = (r * gx - f * kx) / d; wind[3 * i + 1] = (r * gy - f * ky) / d; wind[3 * i + 2] = (r * gz - f * kz) / d;
      carry[3 * i] = (cy * r * gx - f * kx) / d; carry[3 * i + 1] = (cy * r * gy - f * ky) / d; carry[3 * i + 2] = (cy * r * gz - f * kz) / d;
    }
    yield;
    yield* this.moisture(p, T, carry);
  }

  /** The steady moisture balance at phase p, by fast sweeping. */
  *moisture(p, T, wind) {
    const C = CLIMATE, g = this.grid, n = g.n, nbrOff = g.nbrOff, nbr = g.nbr, tan = g.tan, ell = g.ell, dist = g.dist;
    const m = nbrOff[n], pmax = C.RAIN_MAX;
    if (!this.edgeU) { this.edgeU = new Float32Array(m); this.coefA = new Float64Array(n); this.ws_ = new Float64Array(n); this.lam = new Float64Array(n); this.ecoef = new Float64Array(n); }
    const un = this.edgeU, A = this.coefA, Ws = this.ws_, lam = this.lam, ec = this.ecoef;
    const toKmDay = 86.4;
    // Edge-normal winds, and the divergence.
    const div = this.scratch.F[2];
    for (let i = 0; i < n; i++) {
      let dv = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        const u = 0.5 * ((wind[3 * i] + wind[3 * j]) * tan[3 * t] + (wind[3 * i + 1] + wind[3 * j + 1]) * tan[3 * t + 1] + (wind[3 * i + 2] + wind[3 * j + 2]) * tan[3 * t + 2]);
        un[t] = u;
        dv += u * ell[t];
      }
      div[i] = dv / g.area[i] / R_M;   // 1/s
    }
    const P = this.Pph[p], W = this.W[p];
    const areaKm = R_KM * R_KM;
    // The live ground's slow mean of β against the closure's (src/engine/ground.js), by the year's live weight.
    const beta = this.betaPh[p], G = this.ground, gw = G && G.betaSlow ? G.weight : 0, gratio = gw > 0 ? G.betaRatio : null;
    for (let i = 0; i < n; i++) {
      const land = this.landMask[i];
      const Ts = land ? T[i] - C.LAPSE * this.elevPos[i] : Math.max(-1.8, T[i] + (this.ocean ? this.ocean.fine.sst[i] : 0));
      Ws[i] = wsat(Ts);
      const speed = Math.hypot(wind[3 * i], wind[3 * i + 1], wind[3 * i + 2]);
      const lift = wind[3 * i] * this.upz[3 * i] + wind[3 * i + 1] * this.upz[3 * i + 1] + wind[3 * i + 2] * this.upz[3 * i + 2];
      const sink = Math.max(0, div[i]) / 3e-6;
      lam[i] = C.RAIN_BG * (0.25 + 0.75 * Math.exp(-sink)) + C.RAIN_ORO * Math.max(0, lift);
      let e = C.EVAP * (speed + 3) / 10;
      if (land) {
        // The soil's evaporative efficiency at this point of the year, and a lake's open water.
        const el = e * C.LAND_EVAP * beta[i] * (gw > 0 ? 1 - gw + gw * gratio[i] : 1) * ramp(Ts, -5, 5), lw = this.lakeWet[i];
        e = lw > 0 ? el + lw * (e * (1 - (1 - C.LAKE_ICE) * ramp(-Ts, 0, 4.5)) - el) : el;
      } else if (T[i] < -1.8) e *= 0.15;   // sea ice
      ec[i] = e;
      A[i] = g.area[i] * areaKm;
    }
    // Each cell solves a W + A P(W) = b, P convex in W, by Newton from its last value.
    const sweeps = this.warm ? C.SWEEPS : 4 * C.SWEEPS, ca = C.CONV_A, cr = C.CONV_R0, kap = C.KAPPA_W;
    if (this.gpu) {
      // On the GPU (src/gpu/moisture.js): every cell at once, many times (the page's engine).
      const co = this.gpuCo || (this.gpuCo = new Float32Array(16 * n)), cin = new Float64Array(6);
      for (let i = 0; i < n; i++) {
        let a = 0;
        cin.fill(0);
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
          const k = t - nbrOff[i], L = ell[t] * R_KM * toKmDay, u = un[t], kd = kap * ell[t] / dist[t];
          if (u > 0) a += u * L; else cin[k] -= u * L;
          a += kd; cin[k] += kd;
        }
        const Ai = A[i], ws = Ws[i], o = 16 * i;
        a += Ai * (lam[i] + ec[i]);
        co[o] = cin[0]; co[o + 1] = cin[1]; co[o + 2] = cin[2]; co[o + 3] = cin[3];
        co[o + 4] = cin[4]; co[o + 5] = cin[5]; co[o + 6] = a; co[o + 7] = Ai * ec[i] * ws;
        co[o + 8] = Ai * ws / 60 * Math.exp(-ca * cr); co[o + 9] = ca / ws; co[o + 10] = lam[i]; co[o + 11] = ws;
        co[o + 12] = Ai; co[o + 13] = Ai * pmax; co[o + 14] = 0; co[o + 15] = 0;
      }
      yield this.gpu.solve(co, W, this.warm ? C.GPU_PASSES : 4 * C.GPU_PASSES, ca, cr, pmax);
    } else for (let s = 0; s < sweeps; s++) {
      const ord = this.orders[s & 3];
      for (let k = 0; k < n; k++) {
        const i = ord[k];
        let a = 0, b = 0;
        for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
          const j = nbr[t], L = ell[t] * R_KM * toKmDay, u = un[t];
          const kd = kap * ell[t] / dist[t];
          if (u > 0) a += u * L; else b -= u * L * W[j];
          a += kd; b += kd * W[j];
        }
        const Ai = A[i], ws = Ws[i];
        a += Ai * (lam[i] + ec[i]);
        b += Ai * ec[i] * ws;
        const k0 = Ai * ws / 60 * Math.exp(-ca * cr), al = ca / ws;
        let w = Math.min(W[i], b / a);
        for (let it = 0; it < 4; it++) {
          const ex = k0 * Math.exp(Math.min(40, al * w));
          const step = (a * w + ex - b) / (a + al * ex);
          w -= step;
          if (Math.abs(step) < 1e-3) break;
        }
        // The cap: rain held at RAIN_MAX, the rest of the water carried on.
        if (lam[i] * w + ws / 60 * Math.exp(Math.min(40, ca * (w / ws - cr))) > pmax) {
          w = Math.max(w, (b - Ai * pmax) / Math.max(1e-9, a - Ai * lam[i]));
        }
        W[i] = Math.max(0, w);
      }
      if (s % 4 === 3) yield;
    }
    for (let i = 0; i < n; i++) {
      const w = W[i], ws = Ws[i];
      P[i] = Math.min(pmax, lam[i] * w + ws / 60 * Math.exp(Math.min(40, ca * (w / ws - cr))));
    }
  }

  /** Harmonics of rain, runoff, and the zones. */
  finish() {
    const C = CLIMATE, g = this.grid, n = g.n;
    const P = this.Pf;
    for (let i = 0; i < n; i++) {
      let p0 = 0, a1 = 0, b1 = 0, a2 = 0, b2 = 0;
      for (let p = 0; p < NP; p++) {
        const th = 2 * Math.PI * (p + 0.5) / NP, v = this.Pph[p][i];
        p0 += v; a1 += v * Math.cos(th); b1 -= v * Math.sin(th); a2 += v * Math.cos(2 * th); b2 -= v * Math.sin(2 * th);
      }
      P[0][i] = p0 / NP; P[1][i] = 2 * a1 / NP; P[2][i] = 2 * b1 / NP; P[3][i] = 2 * a2 / NP; P[4][i] = 2 * b2 / NP;
    }
    // Monthly values, the zones, and runoff.
    const tm = new Float64Array(12), pm = new Float64Array(12), mph = Array.from({ length: 12 }, (_, m) => monthPhase(m));
    // The thresholds' widths stand for the spread from year to year: the year's anomaly's
    // (its closure: a month's temperature, a year's log rain), as a logistic's scale
    // (σ / 1.7 matches a normal's spread), where the planet has a year.
    const z = this.zones, sp = this.year ? this.year.spreadFine() : null;
    let wT = C.ZONE_T, wP = C.ZONE_P;
    for (let i = 0; i < n; i++) {
      const o = NZ * i;
      for (let k = 0; k < NZ; k++) z[o + k] = 0;
      let mat = 0, map = 0, th = -99, tc = 99, pdry = 1e9;
      for (let m = 0; m < 12; m++) {
        tm[m] = this.surfaceT(i, mph[m]);
        pm[m] = this.pAt(i, mph[m]) * 30.44;
        this.T12[12 * i + m] = tm[m]; this.P12[12 * i + m] = pm[m];
        mat += tm[m] / 12; map += pm[m];
        if (tm[m] > th) th = tm[m];
        if (tm[m] < tc) tc = tm[m];
        if (pm[m] < pdry) pdry = pm[m];
      }
      if (!this.landMask[i]) continue;
      if (sp) { wT = Math.hypot(sp.T[i] / 1.7, C.ZONE_FLOOR_T); wP = Math.hypot(this.year.annualRainSpread(i, map) / 1.7, C.ZONE_FLOOR_P); }
      // Summer is April–September in the north, October–March in the south.
      const north = this.lat[i] >= 0;
      let ps = 0, pw = 0, psd = 1e9, pwd = 1e9, psw = 0, pww = 0;
      for (let m = 0; m < 12; m++) {
        const summer = (m >= 3 && m <= 8) === north;
        if (summer) { ps += pm[m]; psd = Math.min(psd, pm[m]); psw = Math.max(psw, pm[m]); }
        else { pw += pm[m]; pwd = Math.min(pwd, pm[m]); pww = Math.max(pww, pm[m]); }
      }
      const pth = 2 * mat + (ps >= 0.7 * map ? 28 : pw >= 0.7 * map ? 0 : 14);
      const pE = sigmoid((10 - th) / wT);
      const lmap = Math.log(Math.max(1, map));
      const pB = 10 * pth > 1 ? (1 - pE) * sigmoid((Math.log(10 * pth) - lmap) / wP) : 0;
      const rest = 1 - pE - pB;
      const sA = sigmoid((tc - 18) / wT), sC = sigmoid(tc / wT);
      const pA = rest * sA, pC = rest * (1 - sA) * sC, pD = rest * (1 - sA) * (1 - sC);
      // Second letters.
      const sS = sigmoid((40 - psd) / 8) * sigmoid((pww / 3 - psd) / 8);
      const sW = sigmoid((psw / 10 - pwd) / 6);
      const fS = sS, fW = (1 - sS) * sW, fF = (1 - sS) * (1 - sW);
      const af = sigmoid((pdry - 60) / 10), am = (1 - af) * sigmoid((pdry - (100 - map / 25)) / 10);
      const dryS = psd < pwd ? 1 : 0;
      z[o] = pA * af; z[o + 1] = pA * am;
      z[o + 2] = pA * (1 - af - am) * (1 - dryS); z[o + 3] = pA * (1 - af - am) * dryS;
      const bw = sigmoid((Math.log(5 * Math.max(0.2, pth)) - lmap) / wP);
      z[o + 4] = pB * bw; z[o + 5] = pB * (1 - bw);
      z[o + 6] = pC * fF; z[o + 7] = pC * fS; z[o + 8] = pC * fW;
      z[o + 9] = pD * fF; z[o + 10] = pD * fS; z[o + 11] = pD * fW;
      const ef = sigmoid(-th / wT);
      z[o + 12] = pE * (1 - ef); z[o + 13] = pE * ef;
    }
    this.zonalStats();
  }

  /**
   * The ground's periodic year under this cycle's months (sliced over the cells, warm from
   * the last), then its runoff for the landscape and the rivers, open water's balance for
   * the lakes, and its evaporative efficiency at each point of the year for the next cycle.
   */
  *groundYear() {
    const n = this.grid.n, s = this.soil, o = s.out, FC = SOIL.FC, CV = SOIL.COVER;
    potentialEvaporation(this.T12, this.PET12);
    const cold = !this.soilWarm, slice = Math.ceil(n / 8);
    let years = 0, cells = 0;
    for (let a = 0; a < n; a += slice) {
      const r = s.equilibrium(this.T12, this.P12, this.PET12, { cold, from: a, to: Math.min(n, a + slice) });
      years += r.meanYears * r.cells; cells += r.cells;
      yield;
    }
    this.soilWarm = true;
    this.stats.soilYears = cells ? years / cells : 0;
    const ph = this.monthPh || (this.monthPh = Array.from({ length: 12 }, (_, m) => Math.floor(((monthPhase(m) % 1) + 1) % 1 * NP) % NP));
    const cnt = new Float64Array(NP);
    for (let m = 0; m < 12; m++) cnt[ph[m]]++;
    for (let i = 0; i < n; i++) {
      const smax = s.Smax[i], b = 12 * i;
      let pa = 0, ea = 0;
      for (let m = 0; m < 12; m++) { pa += this.P12[b + m]; ea += this.PET12[b + m]; }
      const land = this.landMask[i];
      this.pAnn[i] = land ? pa / 1000 : 0; this.peAnn[i] = land ? (pa - ea) / 1000 : 0;
      if (!(smax > 0)) {
        this.runoff[i] = 0;
        for (let m = 0; m < 12; m++) this.runoffM[b + m] = 0;
        for (let p = 0; p < NP; p++) this.betaPh[p][i] = 0;
        continue;
      }
      this.runoff[i] = s.runoff[i] / 1000;
      for (let p = 0; p < NP; p++) this.betaPh[p][i] = 0;
      for (let m = 0; m < 12; m++) {
        const k = b + m, sw = o.SWE[k];
        this.runoffM[k] = (o.quick[k] + o.base[k]) / 1000;
        this.betaPh[ph[m]][i] += Math.min(1, o.S[k] / smax / FC) * (1 - sw / (sw + CV)) / cnt[ph[m]];
      }
    }
    if (this.land) this.land.runoff.set(this.runoff);
  }

  /** Zonal means for Fig. 3: by 2° band, annual T and its monthly range, rain; the ITCZ's range; Hadley edges. */
  zonalStats() {
    const g = this.grid, n = g.n, mph = Array.from({ length: 12 }, (_, m) => monthPhase(m));
    const T = new Float64Array(90), Tlo = new Float64Array(90), Thi = new Float64Array(90), P = new Float64Array(90), Pl = new Float64Array(90), La = new Float64Array(90);
    const Tm = new Float64Array(90 * 12);
    for (let i = 0; i < n; i++) {
      const b = this.band[i], a = g.area[i];
      for (let m = 0; m < 12; m++) Tm[b * 12 + m] += a * this.surfaceT(i, mph[m]);
      P[b] += a * this.Pf[0][i] * 365.25;
      if (this.landMask[i]) { Pl[b] += a * this.Pf[0][i] * 365.25; La[b] += a; }
    }
    for (let b = 0; b < 90; b++) {
      const A = this.bandArea[b] || 1;
      let s = 0, lo = 1e9, hi = -1e9;
      for (let m = 0; m < 12; m++) { const v = Tm[b * 12 + m] / A; s += v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      T[b] = s / 12; Tlo[b] = lo; Thi[b] = hi; P[b] /= A; Pl[b] = La[b] > 0 ? Pl[b] / La[b] : NaN;
    }
    let ilo = 1, ihi = -1;
    for (let p = 0; p < NP; p++) {
      let s = 0;
      for (let k = 0; k < 36; k++) s += this.itcz[p * 36 + k];
      s /= 36;
      ilo = Math.min(ilo, s); ihi = Math.max(ihi, s);
    }
    this.zonal = { T, Tlo, Thi, P, Pland: Pl, itczLo: ilo * 180 / Math.PI, itczHi: ihi * 180 / Math.PI, hadley: this.stats.hadley };
    let pm = 0, lsum = 0, land = 0;
    for (let i = 0; i < n; i++) { pm += this.Pf[0][i] * g.area[i]; if (this.landMask[i]) { lsum += this.Pf[0][i] * g.area[i]; land += g.area[i]; } }
    this.stats.meanP = pm / (4 * Math.PI) * 365.25;
    this.stats.landP = land > 0 ? lsum / land * 365.25 : 0;
  }

  /** One full cycle: geography, energy balance, six points of the year, then rain and zones. */
  *cycle() {
    this.co2Seen = CLIMATE.CO2;
    this.geography();
    yield;
    yield* this.ebm();
    if (!this.warm) { yield* this.ebm(); yield* this.ebm(); }
    for (let p = 0; p < NP; p++) yield* this.phase(p);
    // The gyres after the winds they're driven by (before them, the first cycle's saw none).
    if (this.ocean) yield* this.ocean.solve();
    this.finish();
    yield;
    yield* this.groundYear();
    this.warm = true;
    this.stats.cycles++;
    this.version++;
  }

  /** Work for at most `ms` milliseconds; returns true when a cycle completed. */
  work(ms) {
    const t0 = performance.now();
    let done = false;
    while (performance.now() - t0 < ms) {
      if (!this.it) this.it = this.cycle();
      const r = this.it.next();
      if (r.done) { this.it = null; done = true; if (this.idle) break; }
    }
    return done;
  }

  /** Run whole cycles, awaiting the GPU's work where the climate has it (`gpu`). */
  async solveAsync(cycles = 1) {
    for (let c = 0; c < cycles; c++) {
      const it = this.cycle();
      for (let r = it.next(); !r.done; r = it.next()) if (r.value && r.value.then) await r.value;
    }
  }

  /** Headless: run whole cycles. */
  solve(cycles = 1) {
    for (let c = 0; c < cycles; c++) { const it = this.cycle(); while (!it.next().done); }
    this.it = null;
  }
}
