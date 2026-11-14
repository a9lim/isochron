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
// recycles part of its rain. It rains where the column passes 75% of
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

import { buildGrid, gradient } from '../grid/icosphere.js';
import { makeTransfer, prolong, restrict } from '../grid/transfer.js';
import { EARTH_ORBIT, S0, insolation, solarLongitude, monthPhase } from './orbit.js';

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
  LAND_EVAP: 0.6,          // land's evaporation relative to the sea's, when wet
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
    this.coarse = buildGrid(fine.level - 1);
    this.T = makeTransfer(fine, this.coarse);
    const nc = this.coarse.n;
    this.orbit = { ...EARTH_ORBIT, ...(opts.orbit || {}) };
    this.year = 0;   // the planet's clock in years, for the season

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
    this.runoff = new Float32Array(n);
    this.upz = new Float64Array(3 * n);
    this.elevPos = new Float64Array(n);
    this.landMask = new Uint8Array(n);
    this.landFracC = new Float64Array(nc);
    this.wind = new Float32Array(3 * n);   // the last phase's surface wind (m/s), for drawing
    this.windPhase = Array.from({ length: NP }, () => new Float32Array(3 * n));
    this.pres = new Float32Array(n);
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
    this.ocean = null;   // src/engine/ocean.js, when there is one
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
    gradient(this.grid, this.elevPos, this.upz);
    for (let i = 0; i < 3 * n; i++) this.upz[i] /= R_KM;   // km per km
    const f6 = this.scratch.f6;
    for (let i = 0; i < n; i++) f6[i] = this.landMask[i];
    restrict(this.T, f6, this.landFracC);
  }

  /** Albedo of fine cell i at sea-level temperature T. */
  albedo(i, T) {
    const C = CLIMATE, s = Math.sin(this.lat[i]), polar = C.ALB_POLAR * s * s;
    if (this.ice && this.ice.H[i] > 10) return C.ALB_SNOW;
    if (this.landMask[i]) {
      const z = this.zones, o = NZ * i;
      const base = C.ALB_LAND + polar + C.ALB_DESERT * (z[o + 4] + 0.5 * z[o + 5]) + C.ALB_FOREST * (z[o] + z[o + 1] + 0.5 * (z[o + 6] + z[o + 9]));
      const snow = ramp(-(T - C.LAPSE * this.elevPos[i]), -1, 5);
      return base + (C.ALB_SNOW - base) * snow;
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
    for (let i = 0; i < n; i++) {
      const l = this.row[i], w = this.roww[i];
      let f0 = 0, a1 = 0, b1 = 0, a2 = 0, b2 = 0, cold = 0;
      for (let s = 0; s < NS; s++) {
        const q = Q[l * NS + s] * (1 - w) + Q[(l + 1) * NS + s] * w;
        const c = cs[s], sv = sn[s], c2 = c * c - sv * sv, s2 = 2 * sv * c;
        const T = this.Tf[0][i] + this.Tf[1][i] * c - this.Tf[2][i] * sv + this.Tf[3][i] * c2 - this.Tf[4][i] * s2;
        const a = this.albedo(i, T);
        const fa = q * (1 - a);
        f0 += fa; a1 += fa * c; b1 -= fa * sv; a2 += fa * c2; b2 -= fa * s2;
        cold += this.landMask[i] ? ramp(-(T - C.LAPSE * this.elevPos[i]), -1, 5) : ramp(-T, 1.5, 6);
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
    const forcing = 5.35 * Math.log(C.CO2 / C.CO2_REF);
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
      for (let pass = 0; pass < 6; pass++) {
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
    for (let i = 0; i < n; i++) {
      const land = this.landMask[i];
      const Ts = land ? T[i] - C.LAPSE * this.elevPos[i] : Math.max(-1.8, T[i] + (this.ocean ? this.ocean.sst[i] : 0));
      Ws[i] = wsat(Ts);
      const speed = Math.hypot(wind[3 * i], wind[3 * i + 1], wind[3 * i + 2]);
      const lift = wind[3 * i] * this.upz[3 * i] + wind[3 * i + 1] * this.upz[3 * i + 1] + wind[3 * i + 2] * this.upz[3 * i + 2];
      const sink = Math.max(0, div[i]) / 3e-6;
      lam[i] = C.RAIN_BG * (0.25 + 0.75 * Math.exp(-sink)) + C.RAIN_ORO * Math.max(0, lift);
      let e = C.EVAP * (speed + 3) / 10;
      if (land) {
        const wet = P[i] / (P[i] + 2.5);
        e *= C.LAND_EVAP * wet * ramp(Ts, -5, 5);
      } else if (T[i] < -1.8) e *= 0.15;   // sea ice
      ec[i] = e;
      A[i] = g.area[i] * areaKm;
    }
    // Sweeps. Each cell solves a W + A P(W) = b, P convex in W, by Newton from its last value.
    const sweeps = this.warm ? 6 : 24, ca = C.CONV_A, cr = C.CONV_R0, kap = C.KAPPA_W;
    for (let s = 0; s < sweeps; s++) {
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
    const z = this.zones, wT = 1.5, wP = 0.25;
    for (let i = 0; i < n; i++) {
      const o = NZ * i;
      for (let k = 0; k < NZ; k++) z[o + k] = 0;
      let mat = 0, map = 0, th = -99, tc = 99, pdry = 1e9;
      for (let m = 0; m < 12; m++) {
        tm[m] = this.surfaceT(i, mph[m]);
        pm[m] = this.pAt(i, mph[m]) * 30.44;
        mat += tm[m] / 12; map += pm[m];
        if (tm[m] > th) th = tm[m];
        if (tm[m] < tc) tc = tm[m];
        if (pm[m] < pdry) pdry = pm[m];
      }
      // Runoff (m/yr): rain less evaporation, Budyko's curve in Fu's form (ω = 2).
      const pet = Math.max(30, 55 * (mat + 4));
      const et = map * pet / Math.sqrt(map * map + pet * pet + 1e-9);
      this.runoff[i] = this.landMask[i] ? Math.max(0, map - et) / 1000 : 0;
      if (!this.landMask[i]) continue;
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
    if (this.land) this.land.runoff.set(this.runoff);
    this.zonalStats();
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
    if (this.ocean) yield* this.ocean.solve();
    for (let p = 0; p < NP; p++) yield* this.phase(p);
    this.finish();
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

  /** Headless: run whole cycles. */
  solve(cycles = 1) {
    for (let c = 0; c < cycles; c++) { const it = this.cycle(); while (!it.next().done); }
    this.it = null;
  }
}
