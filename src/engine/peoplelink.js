// The people and the planet (docs/MODEL.md; the people are src/engine/people.js).
// The people read the planet's fields after each climate cycle and write back through the
// planet's own inputs, so nothing else in the engine knows of them:
//   emissions   fossil carbon burned (less what capture takes back) goes to `carbon.pulse` before
//               the next fast step: the sea's chemistry takes it from there (the Pulse's physics),
//               drawn down never below 100 ppm
//   game        large game's share left a cell (`mega`) scales the cover's browsing, and its fuel's
//               burning (src/engine/vegetation.js, `disturbance`)
//   land use    each farmed share scales the cover's tree balance (as the last climate cycle set it,
//               `Life.onCover`) and clips its trees at once; the cover's own carbon (wood to
//               litter to soil to the air), albedo and evaporation do the rest
//   soil        tillage's erosion (mm/yr) is added to the landscape's erosion field around each
//               fast step, so the regolith's exact step strips it; the people read the regolith back
//   wells       the wells' draw (mm/yr) on the aquifer beneath the groundwater, a sink in its exact
//               step each climate cycle (src/engine/soil.js); the people read its store back
//   the years   while the dial resolves the year, each whole year's anomaly (`HarvestYears`) for
//               the people's harvests: the year's log-rain unit and its mean T′, as moments a few
//               times a second (src/engine/people.js, `addYears`)
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
import { LIFE } from './life.js';
import { shared } from './shared.js';

// Coal's sulfate as a haze carried by the climate's winds (src/engine/dust.js's balance, one bin,
// solved on level 5): lifted where industry's workers are, washed out by rain and settled, so its
// burden gathers over industry and downwind and its forcing with it (synthesis on the standard
// picture; a lifetime of ~3–4 days against sulfate's ~4–5, from memory). Its global mean is the
// people's (`aerC`); only the pattern is carried.
export const SULF = { LEVEL: 5, H: 2000, VD: 0.002, SCAV: 0.07, MEE: 8 };

/** The fields the people read, and how many values a cell each. */
export const FIELDS = { elev: 1, ice: 1, T12: 12, P12: 12, ft: 1, fg: 1, npp: 1, zones: NZ, runoff: 1, discharge: 1, lake: 1, perma: 1, sigT: 1, sigTy: 1, sigP: 1, sea: 1, lakeEx: 1, reg: 1, p0: 1, ero: 1, arc: 1, phi: 1, age: 1, wind: 18, cur: 3, seaIce: 1, rh: 1, aq: 1, aqR: 1, dep: 1 };
/** A lake's shore: its cells wet past this share of their area, and their neighbours. */
export const LAKE_SHORE = 0.05;

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
 * year's mean T′'s spread (K: the month's × √ of its memory, src/engine/year.js), a year's spread of log rain, the regolith (m), its production at bare rock (m/yr) and the rivers'
 * erosion (mm/yr); and on land the coast's sea's export production (g C m⁻² yr⁻¹, the most of its
 * sea neighbours': src/engine/life.js) and a lakeshore's lake's (E_LAKE of its production, on the
 * sea's scale: the most of the cell's own lake and its neighbours', where they're LAKE_SHORE wet),
 * which feed the fishers; for the routes
 * (src/engine/routes.js), the surface wind at the year's six points (m/s, 3-vectors in each cell's
 * tangent plane: 18 a cell, the point-major triples), the sea's surface current (m/s, a 3-vector;
 * the gyres', prolonged from their grid) and the share of the year under sea ice; and the column's
 * humidity at the year's warmest point (0–1, for the people's heat).
 */
export function fieldsOf(P, f = null, T = null) {
  const g = T ? T.coarse : P.grid, n = g.n, N = P.grid.n, c = P.climate, tec = P.tec, s = tec.seaLevel;
  if (!f) { f = { seed: P.seed, grid: g, n }; for (const [name, w] of Object.entries(FIELDS)) f[name] = new Float32Array(w * n); }
  const map = new Float64Array(N);
  for (let i = 0; i < N; i++) { let t = 0; for (let m = 0; m < 12; m++) t += c.P12[12 * i + m]; map[i] = t; }
  const sp = P.year.spreadFine(), sigT = sp.T, ex = P.life.export, G = P.grid;
  const coastSea = i => { if (tec.sea[i] || !ex) return 0; let m = 0; for (let t = G.nbrOff[i]; t < G.nbrOff[i + 1]; t++) { const j = G.nbr[t]; if (tec.sea[j]) m = Math.max(m, ex[j] || 0); } return m; };
  const dustOut = P.aeolian && P.aeolian.dust ? P.aeolian.dust.out : null;
  const Qr = P.rivers().Q;   // the rivers' year's mean discharge (Planet.rivers), not the landscape's own (its erosion's, read between its steps)
  const pp = P.life.lakePP, lw = c.lakeWet, lakeAt = j => (!tec.sea[j] && lw[j] > LAKE_SHORE ? LIFE.E_LAKE * (pp[j] || 0) : 0);
  const shoreLake = i => { if (tec.sea[i] || !pp) return 0; let m = lakeAt(i); for (let t = G.nbrOff[i]; t < G.nbrOff[i + 1]; t++) m = Math.max(m, lakeAt(G.nbr[t])); return m; };
  const src = {
    elev: i => tec.sea[i] ? Math.min(-1e-3, tec.elev[i] - s) : Math.max(1e-3, tec.elev[i] - s), ice: i => P.ice.H[i], ft: i => P.life.veg.ft[i], fg: i => P.life.veg.fg[i], npp: i => P.life.veg.pi[i],
    runoff: i => c.runoff[i], discharge: i => Qr[i], lake: i => c.lakeWet[i], perma: i => c.soil.permafrost[i],
    sigT: i => sigT[i], sigTy: i => sigT[i] * Math.sqrt(sp.mem[i]), sigP: i => (map[i] > 1 ? P.year.annualRainSpread(i, map[i]) : 0),
    sea: coastSea, lakeEx: shoreLake, reg: i => P.regolith.h[i], p0: i => P.regolith.p0(i), ero: i => P.land.erosion[i] || 0,
    arc: i => tec.arc[i], phi: i => tec.phi[i], age: i => Math.max(0, tec.t - tec.tf[i]),   // the ores' geology: arc volcanism, the felsic fraction, the crust's age (Myr)
    rh: i => c.humidHot(i),   // the column's humidity at the year's warmest point (the people's wet bulb)
    aq: i => c.soil.A[i], aqR: i => c.soil.Ar[i],   // the aquifer's store (mm) and its recharge (mm/yr: src/engine/soil.js), the people's wells'
    dep: i => (dustOut && !tec.sea[i] ? dustOut.depAnn[i] : 0),   // dust's deposition (kg m⁻² yr⁻¹), the uplands' renewal beside fresh rock's
  };
  const np = c.windPhase.length, wind = new Float32Array(18 * N), cur = new Float32Array(3 * N), oc = P.ocean;
  for (let i = 0; i < N; i++) for (let p = 0; p < 6; p++) { const w = c.windPhase[Math.min(np - 1, Math.floor(p * np / 6))]; for (let k = 0; k < 3; k++) wind[18 * i + 3 * p + k] = w[3 * i + k]; }
  if (oc) {
    if (oc.coarse) {
      const nc = oc.grid.n, a = new Float64Array(nc), b = new Float64Array(N);
      for (let k = 0; k < 3; k++) { for (let i = 0; i < nc; i++) a[i] = oc.vel[3 * i + k]; prolong(c.T, a, b); for (let i = 0; i < N; i++) cur[3 * i + k] = tec.sea[i] ? b[i] : 0; }
    } else cur.set(oc.vel);
  }
  src.seaIce = i => (tec.sea[i] ? c.snowAnn[i] : 0);
  const wide = { T12: [c.T12, 12], P12: [c.P12, 12], zones: [c.zones, NZ], wind: [wind, 18], cur: [cur, 3] };
  if (!T) {
    for (const [k, get] of Object.entries(src)) { const a = f[k]; for (let i = 0; i < n; i++) a[i] = get(i); }
    for (const [k, [a]] of Object.entries(wide)) f[k].set(a);
  } else {
    const x = new Float64Array(N), y = new Float64Array(n);
    const most = new Set(['discharge', 'lake', 'sea', 'lakeEx']), { nc, par } = T;
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

/**
 * The planet's years for the people's harvests (synthesis; docs/MODEL.md). After each of the
 * year's steps (src/engine/year.js, `hooks`), on the year's own grid, its months of the log-rain
 * anomaly's unit z and of T′ go into a running year; each whole year adds its means to moments the
 * people take a few times a second: a cell each, [years, Σz, Σz², ΣT′, ΣT′², ΣzT′], the years
 * weighted by the year's `live` (the closure fills the rest). A step of a year or more is that
 * many years at once. Outrun, the running year is dropped.
 */
export class HarvestYears {
  constructor(Y) {
    this.Y = Y; const n = this.n = Y.n;
    this.z = new Float64Array(n); this.T = new Float64Array(n); this.months = 0;
    this.mom = new Float64Array(6 * n); this.w = 0;
    Y.hooks.push(this);
  }
  yearStep(Y, months) {
    const w = Y.live, n = this.n;
    if (!(w > 0) || !Y.anom) { this.months = 0; this.z.fill(0); this.T.fill(0); return; }
    const zc = Y.anom.zc, Ta = Y.Ta;
    for (let i = 0; i < n; i++) { this.z[i] += months * zc[i]; this.T[i] += months * Ta[i]; }
    this.months += months;
    if (this.months < 12) return;
    const k = 1 / this.months, yrs = w * this.months / 12, m = this.mom;
    for (let i = 0; i < n; i++) {
      const z = this.z[i] * k, T = this.T[i] * k, o = 6 * i;
      m[o] += yrs; m[o + 1] += yrs * z; m[o + 2] += yrs * z * z; m[o + 3] += yrs * T; m[o + 4] += yrs * T * T; m[o + 5] += yrs * z * T;
    }
    this.w += yrs; this.months = 0; this.z.fill(0); this.T.fill(0);
  }
  /** The moments since the last take (Float32Array, 6 a cell), or null when no year has passed. */
  take() {
    if (!(this.w > 0)) return null;
    const out = Float32Array.from(this.mom);
    this.mom.fill(0); this.w = 0;
    return out;
  }
  detach() { const h = this.Y.hooks, k = h.indexOf(this); if (k >= 0) h.splice(k, 1); }
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

  /**
   * The people's write-back on their grid: farmed share, tillage (mm/yr) and solar farms' share a cell,
   * carbon (Pg C) since the last, forcing (W/m²). What isn't a finite number stops here (a cell's at 0, a
   * total's last value), said once by name: past here a NaN poisons the planet's climate and carbon.
   */
  receive({ f, Ef, s, x, m, w, carbon = 0, F = 0, aerC = 0 }) {
    const put = (a, out, name) => {
      let bad = 0;
      for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { a[i] = 0; bad++; }
      if (bad) this.warn(name, `${bad} cells of the people's ${name} weren't finite; taken as 0`);
      if (!this.T) { out.set(a.subarray(0, out.length)); return; }
      prolong(this.T, a, this.tmp); out.set(this.tmp);
    };
    const num = (v, keep, name) => { if (Number.isFinite(v)) return v; this.warn(name, `the people's ${name} was ${v}; kept ${keep}`); return keep; };
    if (s) put(s, this.us, 'solar farms');
    if (f) { put(f, this.u, 'farmed share'); this.landUse(); }
    if (Ef) put(Ef, this.ef, 'tillage');
    if (w) { const soil = this.P.climate.soil; if (!soil.draw) soil.draw = new Float32Array(this.P.grid.n); put(w, soil.draw, 'wells\' draw'); }
    if (x) put(x, this.x, 'sulfate');
    if (m) { const veg = this.P.life.veg; if (!veg.mega) veg.mega = shared(Float32Array, this.P.grid.n).fill(1); put(m, veg.mega, 'large game'); }
    this.carbon += num(carbon, 0, 'carbon');
    this.F = num(F, this.F, 'forcing'); CLIMATE.F_PEOPLE = this.F;
    this.aerC = num(aerC, this.aerC, 'sulfate forcing'); this.applySulfate();
  }
  /** A warning once for each kind. */
  warn(kind, msg) { const w = this.warned || (this.warned = new Set()); if (w.has(kind)) return; w.add(kind); console.warn(`[isochron] ${msg}`); }

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
    const d = this.sulf, e = this.e || (this.e = shared(Float32Array, n)), k = A / s;
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
    veg.sEq.set(this.sEq0); veg.mega = null;
    this.P.life.onCover = null;
    CLIMATE.F_PEOPLE = 0;
    this.P.climate.peopleForcing = null;
  }
}
