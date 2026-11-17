// The people and the planet (Roadmap 2.0: docs/PLAN.md; the people are src/engine/people.js).
// The people read the planet's fields after each climate cycle and write back through the
// planet's own inputs, so nothing else in the engine knows of them:
//   emissions   fossil carbon burned (less what capture takes back) goes to `carbon.pulse` before
//               the next fast step: the sea's chemistry takes it from there (the Pulse's physics),
//               drawn down never below 100 ppm
//   land use    each farmed share scales the cover's tree balance (as the last climate cycle set it,
//               `Life.onCover`) and clips its trees at once; the cover's own carbon (wood to
//               litter to soil to the air), albedo and evaporation do the rest
//   soil        tillage's erosion (mm/yr) is added to the landscape's erosion field around each
//               fast step, so the regolith's exact step strips it; the people read the regolith back
//   forcing     waste heat and a preserving AI's sprayed sulfate (W/m²) as CLIMATE.F_PEOPLE in the
//               energy balance, whatever it is: past the limit the planet's own runaway boils the sea
//               (src/engine/runaway.js), and the people read back how much has boiled and how warm
//               the planet is (`air`); coal's sulfate, a short-lived haze in the lower air, where the
//               winds carry it from industry (`sulfate`), as `climate.peopleForcing` per cell, its
//               global mean the people's (a9: "make factory/coal sulfates localized like the dust,
//               and only make sprayed sulfates global")
// The people run on a grid no finer than level 6 (their constants are fitted there, and a finer
// grid would cost four times as much a step); on a finer engine the fields are restricted to it
// and the write-back prolonged from it (src/grid/transfer.js).
import { NZ, CLIMATE } from './climate.js';
import { restrict, prolong } from '../grid/transfer.js';
import { Dust, NP } from './dust.js';

// Coal's sulfate as a haze carried by the climate's winds (src/engine/dust.js's balance, one bin,
// solved on level 5): lifted where industry's workers are, washed out by rain and settled, so its
// burden gathers over industry and downwind and its forcing with it (synthesis on the standard
// picture; a lifetime of ~3–4 days against sulfate's ~4–5, from memory). Its global mean is the
// people's (`aerC`); only the pattern is carried.
export const SULF = { LEVEL: 5, H: 2000, VD: 0.002, SCAV: 0.07, MEE: 8 };

/** The fields the people read, and how many values a cell each. */
export const FIELDS = { elev: 1, ice: 1, T12: 12, P12: 12, ft: 1, fg: 1, npp: 1, zones: NZ, runoff: 1, discharge: 1, lake: 1, perma: 1, sigT: 1, sigP: 1, reg: 1, p0: 1, ero: 1, arc: 1, phi: 1, age: 1 };
/** The people's grid's level on an engine of `level`. */
export const peopleLevel = level => Math.min(6, level);

/**
 * The people's fields from a live Planet, into `f` (made if absent), on its grid or, with `T`
 * (src/grid/transfer.js, engine → the people's grid), a coarser one: area-weighted means, and
 * the rivers' discharge and the lakes' share by the most within a cell (a river crossing a
 * coarse cell waters it).
 *
 * Per cell, as Float32: the relief above sea level (km; the land the sea doesn't reach, a basin
 * below its level, reads as just above it, so land is where it's positive), the grounded ice (m), the twelve months'
 * surface temperature (°C) and rain (mm), the cover's trees and grass, the vegetation's NPP (kg C
 * per m² of vegetation a year), the zones' probabilities (NZ a cell), the ground's runoff (m/yr),
 * the rivers' discharge (m³/s), the lakes' share, permafrost's share, a month's T′ spread (K), a
 * year's spread of log rain, the regolith (m), its production at bare rock (m/yr) and the rivers'
 * erosion (mm/yr).
 */
export function fieldsOf(P, f = null, T = null) {
  const g = T ? T.coarse : P.grid, n = g.n, N = P.grid.n, c = P.climate, tec = P.tec, s = tec.seaLevel;
  if (!f) { f = { seed: P.seed, grid: g, n }; for (const [name, w] of Object.entries(FIELDS)) f[name] = new Float32Array(w * n); }
  const map = new Float64Array(N);
  for (let i = 0; i < N; i++) { let t = 0; for (let m = 0; m < 12; m++) t += c.P12[12 * i + m]; map[i] = t; }
  const sigT = P.year.spreadFine().T;
  const src = {
    elev: i => tec.sea[i] ? Math.min(-1e-3, tec.elev[i] - s) : Math.max(1e-3, tec.elev[i] - s), ice: i => P.ice.H[i], ft: i => P.life.veg.ft[i], fg: i => P.life.veg.fg[i], npp: i => P.life.veg.pi[i],
    runoff: i => c.runoff[i], discharge: i => P.land.discharge[i], lake: i => c.lakeWet[i], perma: i => c.soil.permafrost[i],
    sigT: i => sigT[i], sigP: i => (map[i] > 1 ? P.year.annualRainSpread(i, map[i]) : 0),
    reg: i => P.regolith.h[i], p0: i => P.regolith.p0(i), ero: i => P.land.erosion[i] || 0,
    arc: i => tec.arc[i], phi: i => tec.phi[i], age: i => Math.max(0, tec.t - tec.tf[i]),   // the ores' geology: arc volcanism, the felsic fraction, the crust's age (Myr)
  };
  const wide = { T12: [c.T12, 12], P12: [c.P12, 12], zones: [c.zones, NZ] };
  if (!T) {
    for (const [k, get] of Object.entries(src)) { const a = f[k]; for (let i = 0; i < n; i++) a[i] = get(i); }
    for (const [k, [a]] of Object.entries(wide)) f[k].set(a);
  } else {
    const x = new Float64Array(N), y = new Float64Array(n);
    const most = new Set(['discharge', 'lake']), { nc, par } = T;
    for (const [k, get] of Object.entries(src)) {
      const a = f[k];
      for (let i = 0; i < N; i++) x[i] = get(i);
      if (most.has(k)) {
        for (let i = 0; i < nc; i++) a[i] = x[i];
        for (let i = nc; i < N; i++) { const p = par[2 * (i - nc)], q = par[2 * (i - nc) + 1]; if (x[i] > a[p]) a[p] = x[i]; if (x[i] > a[q]) a[q] = x[i]; }
      } else { restrict(T, x, y); a.set(y); }
    }
    for (const [k, [a, w]] of Object.entries(wide)) {
      const out = f[k];
      for (let m = 0; m < w; m++) {
        for (let i = 0; i < N; i++) x[i] = a[w * i + m];
        restrict(T, x, y);
        for (let i = 0; i < n; i++) out[w * i + m] = y[i];
      }
    }
  }
  f.co2 = P.carbon.pco2; f.meanT = c.stats.meanT; f.settled = c.stats.settled; f.version = c.version;
  return f;
}

/** The regolith on the people's grid (m), into `out`. */
export function soilOf(P, out, T = null) {
  if (!T) { out.set(P.regolith.h.subarray(0, out.length)); return out; }
  const x = Float64Array.from(P.regolith.h), y = new Float64Array(out.length);
  restrict(T, x, y); out.set(y);
  return out;
}

/**
 * The write-back's engine side: the people's farmed shares and tillage (on their grid, prolonged
 * to the engine's), their carbon banked for the next fast step, and their forcing.
 */
export class PeopleLink {
  constructor(P, T = null) {
    this.P = P; this.T = T;
    const n = P.grid.n;
    this.u = new Float32Array(n);                 // the farmed share of each engine cell
    this.us = new Float32Array(n);                // the share under solar farms
    this.ef = new Float32Array(n);                // tillage's erosion, mm/yr
    this.sEq0 = Float64Array.from(P.life.veg.sEq);
    this.carbon = 0; this.F = 0;
    this.stats = { pulsed: 0, farmed: 0, solar: 0 };
    // Coal's sulfate: where it's lifted (per unit area, the people's), its global-mean forcing, the
    // carried burden's pattern (mean 1 over the globe), and the forcing per cell the climate reads.
    this.x = new Float32Array(n); this.aerC = 0; this.pat = null; this.sulf = null;
    P.climate.peopleForcing = new Float32Array(n);
    this.tmp = T ? new Float64Array(n) : null;
    // The cover's tree balance as each climate cycle sets it, before people's land use scales it.
    P.life.onCover = () => { this.sEq0.set(P.life.veg.sEq); this.landUse(); };
  }

  /** The people's write-back on their grid: farmed share, tillage (mm/yr) and solar farms' share a cell, carbon (Pg C) since the last, forcing (W/m²). */
  receive({ f, Ef, s, x, carbon = 0, F = 0, aerC = 0 }) {
    const put = (a, out) => {
      if (!this.T) { out.set(a.subarray(0, out.length)); return; }
      prolong(this.T, a, this.tmp); out.set(this.tmp);
    };
    if (s) put(s, this.us);
    if (f) { put(f, this.u); this.landUse(); }
    if (Ef) put(Ef, this.ef);
    if (x) put(x, this.x);
    this.carbon += carbon;
    this.F = F; CLIMATE.F_PEOPLE = F;
    this.aerC = aerC; this.applySulfate();
  }

  /** Coal's sulfate's forcing per cell: its global mean on the carried pattern (uniform until one is solved). */
  applySulfate() {
    const f = this.P.climate.peopleForcing, p = this.pat, a = this.aerC;
    if (!f) return;
    if (p) for (let i = 0; i < f.length; i++) f[i] = a * p[i]; else f.fill(a);
  }

  /** Coal's sulfate carried on the last climate cycle's winds and rain: the burden's pattern (a generator, sliced). */
  *sulfateSteps() {
    const P = this.P, C = P.climate, g = P.grid, n = g.n, area = g.area, x = this.x;
    let s = 0, A = 0;
    for (let i = 0; i < n; i++) { s += x[i] * area[i]; A += area[i]; }
    if (!(this.aerC < -1e-4) || !(s > 0)) { this.pat = null; this.applySulfate(); return; }
    if (!this.sulf) this.sulf = new Dust(g, { LEVEL: SULF.LEVEL, H: SULF.H, SCAV: SULF.SCAV, BINS: [{ name: 'sulfate', share: 1, vd: SULF.VD, mee: SULF.MEE }] });
    const d = this.sulf, e = this.e || (this.e = new Float32Array(n)), k = A / s;
    for (let i = 0; i < n; i++) e[i] = x[i] * k;      // mean 1: only the pattern is carried
    for (let p = 0; p < NP; p++) yield* d.phaseSteps(p, { wind: C.windPhase[p], rain: C.Pph[p], emission: e });
    d.solve();
    yield;
    yield* d.finishSteps();
    const L = d.out.loadAnn;
    let m = 0;
    for (let i = 0; i < n; i++) m += L[i] * area[i];
    m /= A;
    if (!(m > 0)) { this.pat = null; this.applySulfate(); return; }
    const pat = this.pat || (this.pat = new Float32Array(n));
    for (let i = 0; i < n; i++) pat[i] = L[i] / m;
    this.applySulfate();
  }
  sulfate() { for (const _ of this.sulfateSteps()); return this.pat; }

  /** Before the planet's fast step: the banked carbon into the air (drawn down no lower than 100 ppm), tillage into the erosion field. */
  beforeFast() {
    const P = this.P;
    if (this.carbon !== 0) {
      const x = Math.max(this.carbon, -Math.max(0, P.carbon.pco2 - 100) * 2.12);
      P.carbon.pulse(x); this.stats.pulsed += x; this.carbon = 0;
    }
    const ero = P.land.erosion, ef = this.ef;
    for (let i = 0; i < ef.length; i++) if (ef[i] > 0) ero[i] += ef[i];
  }
  afterFast() {
    const ero = this.P.land.erosion, ef = this.ef;
    for (let i = 0; i < ef.length; i++) if (ef[i] > 0) ero[i] -= ef[i];
  }

  /** The farmed shares and solar farms on the cover: the tree balance scaled, the trees clipped to it. */
  landUse() {
    const veg = this.P.life.veg, u = this.u, us = this.us, s0 = this.sEq0, n = u.length;
    let a = 0, A = 0, so = 0;
    const area = this.P.grid.area;
    for (let i = 0; i < n; i++) {
      if (!(s0[i] > 0) && !(u[i] > 0) && !(us[i] > 0)) continue;
      const x = Math.min(1, Math.max(0, u[i] + us[i]));
      veg.sEq[i] = s0[i] * (1 - x);
      if (x > 0 && veg.share[i] > veg.sEq[i]) {
        veg.share[i] = veg.sEq[i];
        veg.ft[i] = veg.veg[i] * veg.share[i]; veg.fg[i] = veg.veg[i] - veg.ft[i];
      }
      if (veg.veg[i] > 0) { a += area[i] * Math.max(0, u[i]); so += area[i] * Math.max(0, us[i]); A += area[i]; }
    }
    this.stats.farmed = A > 0 ? a / A : 0; this.stats.solar = A > 0 ? so / A : 0;
  }

  /** Off: the cover's balance restored, no forcing, nothing banked. */
  detach() {
    const veg = this.P.life.veg;
    veg.sEq.set(this.sEq0);
    this.P.life.onCover = null;
    CLIMATE.F_PEOPLE = 0;
    this.P.climate.peopleForcing = null;
  }
}
