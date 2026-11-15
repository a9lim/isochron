// Carbon that lives somewhere (docs/PLAN.md, phase 8): the exogenic pool of
// carbon.js split into the air, three boxes of sea and the seafloor's
// carbonate, after LOSCAR (Zeebe's box model) and Toggweiler and Sarmiento's
// three boxes. It replaces R and pCO₂ ∝ R²; outgassing, silicate weathering's
// map, organic burial and oxidation, and provinces' pulses stay inputs, with
// carbon.js's forms and constants.
//
// The boxes (standard; the sizes from memory):
// - the air, pCO₂ in ppm, 2.124 Pg C each;
// - a warm surface sea (85% of the sea's area, 100 m) and a cold one (15%,
//   250 m), each at the climate's mean SST over its share of the sea, so a
//   colder high-latitude sea holds more carbon;
// - the deep sea (the rest), at the cold box's temperature (deep water forms there).
// Each sea box carries dissolved inorganic carbon (DIC), alkalinity (ALK) and
// phosphate.
//
// Exchange:
// - Air and sea (standard): F = k·area·(pCO₂,air − pCO₂,sea), k = 0.06 mol
//   m⁻² yr⁻¹ µatm⁻¹ (LOSCAR's, from memory), so pCO₂ at the surface
//   equilibrates in ~1 yr and DIC follows ~10× slower (the buffer factor).
// - Surface and deep (standard form; a closure): an overturning of 20 Sv,
//   warm → cold → deep → warm, and 20 Sv of mixing between the cold box and
//   the deep, so the deep is ventilated in ~1 kyr. The overturning isn't
//   modelled or drawn; this is its box exchange.
// - The biological pump (standard; after the three-box models): each surface
//   box exports phosphate at bio·P/τ (τ 0.5 yr warm, 30 yr cold: the warm
//   sea strips its nutrients, ~0.02 µmol/kg left, and the cold one keeps a
//   preformed ~0.8), with C:P = 106 (Redfield) and CaCO₃:Corg 0.2 warm and
//   0.05 cold (synthesis: chosen so the opening's rain, ~0.4 Pg C/yr, can
//   feed the burial), all remineralized in the deep but the share of the
//   carbonate that reaches the floor. `bio` is the caller's productivity (1
//   at the opening), and `iron` scales the cold box's uptake alone (its
//   preformed phosphate is what iron limits: Martin's hypothesis; 1 at the
//   opening). Nitrate's share of alkalinity is left out.
//
// Chemistry (standard): the carbonate system from DIC and ALK, with borate and
// water, solved for [H⁺] by safeguarded Newton. Constants, each checked
// against PyCO2SYS's source (github.com/mvdh7/PyCO2SYS, 2026-11-14), and at
// 25 °C and S = 35 their published check values (from memory) agree:
// - K0, CO₂'s solubility: Weiss 1974 (ln K0 = −3.5617);
// - K1, K2, total scale: Lueker, Dickson and Keeling 2000 (pK 5.8472, 8.9660);
// - KB: Dickson 1990 (ln KB = −19.7964); total boron: Uppström 1974;
// - Kw: Millero 1995 (seawater scale, against the total scale of the rest:
//   water's alkalinity is a few µmol/kg, so the mismatch is negligible);
// - calcite's Ksp: Mucci 1983 (4.27 × 10⁻⁷ mol² kg⁻²), its pressure
//   correction Ingle 1975 via Millero (ΔV, Δκ), at 1 dbar per metre;
// - calcium: Riley and Tongudai 1967, ∝ S and otherwise fixed.
// pCO₂ is taken as fCO₂/K0 = [CO₂*]/K0 (the fugacity's ~0.3% left out), and
// the deep box's speciation uses surface-pressure K1, K2 (pressure enters
// through Ksp only). Salinity is fixed (35) unless the caller passes it.
//
// Sediments:
// - Shelves (standard form, after Opdyke and Wilkinson; synthesis): burial ∝
//   the caller's warm shallow shelf area × (Ω − 1)^1.7 of the warm box (the
//   exponent a reef-growth fit, from memory), into a platform pool on the
//   continents that carbonate weathering draws on.
// - The deep seafloor (after LOSCAR's sediment boxes; synthesis): the caller's
//   depth histogram, each bin with a bioturbated layer of CaCO₃ (1,000 mol/m²
//   when full, ~10 cm). A fixed share of the export rain reaches the floor,
//   evenly by area, and enters the layer; the layer dissolves at
//   K·(1 − Ω)^1.5 where the deep water is undersaturated at the bin's
//   pressure, and passes carbonate down to burial in proportion to its
//   fullness. In steady state a bin buries rain·b/(b + e): the compensation
//   depth is where dissolution meets the rain, and it moves until burial
//   balances the alkalinity weathering brings. A pulse shoals it, and the
//   layer itself dissolves: the seafloor's neutralization.
// - Buried carbonate rides the plates: the caller's subduction (the share of
//   seafloor consumed per year) takes it down, a share (40%, from memory:
//   Kelemen and Manning's estimates) returns as CO₂ at arcs and the rest
//   goes into the mantle. With ARC_IN_V the caller's outgassing already holds
//   the opening's arc return (carbon.js's V0 does), so only its change is added.
//
// Weathering (standard): silicate weathering takes 2 CO₂ from the air per Ca
// and brings 2 DIC and 2 ALK to the warm sea; carbonate buried later returns
// one of them, so per Ca one carbon leaves: carbon.js's W, in its own form
// (the climate's map wRel, the response since the climate last solved, and
// pCO₂^0.3). Carbonate weathering takes 1 CO₂ from the air and 1 C from the
// platform per Ca, 2 DIC and 2 ALK to the sea, ∝ pCO₂^0.4 (LOSCAR's exponent,
// from memory), 1.5× silicate weathering's Ca at the opening (GEOCARB's
// ratio, roughly, from memory). It cancels against burial in the long run.
// The balance is then F_sil(pCO₂) = V + oxidation − organic burial: carbon.js's,
// so `equilibrium(V)` is its formula.
//
// Calibration (synthesis): with the air held at the opening's pCO₂, the
// closed sea's alkalinity is found so the deep's carbonate ion is 70 µmol/kg
// (roughly the deep Pacific's, from memory; compensation regulates CO₃, not
// alkalinity, so a higher opening pCO₂ gets a richer sea, not a shallower
// CCD); at 280 ppm the sea's mean alkalinity is then ~2,370 µmol/kg. The
// shelves' constant is set so they bury half the carbonate (Earth's neritic
// share, roughly, from memory), and the share of rain reaching the floor so
// the deep buries the rest, whatever the hypsometry. Then the open system
// settles with the air still held, so the opening is a steady state.
//
// Time stepping. Every step is backward Euler in the seven unknowns (the air,
// and DIC and ALK in each sea box), by damped Newton with a finite-difference
// Jacobian (7 × 7), in substeps of at most 20 kyr. Backward Euler is
// L-stable: a step far longer than a process's time (air–sea ~1 yr, the deep
// ~1 kyr) lands that process on its quasi-steady state, so the same step is
// exact enough at 1 yr and stable at 1 Myr; the 20 kyr cap is for accuracy in
// the compensation (~5–10 kyr) and the thermostat (~100s of kyr), as
// carbon.js's. Phosphate is linear and solved first, exactly implicit. Each
// bin's layer is advanced by its exact exponential over the substep at the
// Newton's Ω, so the layer can empty within a step without overshooting.
// The buried pool's subduction (~100 Myr) is explicit, with the last
// substep's burial into it, so its steady state doesn't depend on the step.
// The state is advanced in flux form from the converged fluxes, so carbon and
// alkalinity are conserved to rounding. A substep whose Newton doesn't
// converge (a large pulse and a long step) halves itself. Cost: ~10 µs a call
// at a slow dial, ~0.7 ms for a 1 Myr call (50 substeps), ~3 ms to settle.
//
// Measured (tests/oceancarbon.test.mjs, Earth's sea and a normal seafloor about
// 4 km): saturation at 2.4 km, compensation at 3.9 km. A pulse of 1,000 Pg C
// leaves 17%, 6% and 3% in the air after 1, 10 and 100 kyr; 5,000 Pg C 37%,
// 7% and 3%. A compensated sea holds CO₃ fixed, so pCO₂ ∝ HCO₃² and each
// carbon added brings a carbonate with it from the floor: pCO₂ goes as the
// carbon's fourth power, against carbon.js's R², and under carbon.js's
// weathering the thermostat's e-folding is ~130 kyr, not ~300. A sea 1 K
// colder draws the air down 10 ppm (8.7 of it the cold box's).
//
// Units: inventories in mol inside; Pg C, Pg C/yr and ppm outside; µmol/kg
// for concentrations reported.

import { CARBON } from './carbon.js';

const SV = 1e6 * 3.15576e7;          // m³/yr per Sv

export const OC = {
  PG: 1e15 / 12.011,                 // mol C per Pg
  PPM: 2.124,                        // Pg C per ppm of the air
  AREA: 3.61e14,                     // m², the sea's surface (Earth's)
  MASS: 1.37e21,                     // kg of seawater (Earth's)
  RHO: 1025,
  WARM: 0.85, COLD: 0.15,            // shares of the sea's surface
  H_WARM: 100, H_COLD: 250,          // m
  OVERTURN: 20, MIX_CD: 20, MIX_WD: 0,   // Sv
  KGAS: 0.06,                        // mol m⁻² yr⁻¹ µatm⁻¹
  PO4: 2.15e-6,                      // mol/kg, the sea's mean phosphate
  TAU_W: 0.5, TAU_C: 30,             // yr, nutrient uptake in each surface box
  RCP: 106,                          // C:P of export
  RAIN_W: 0.2, RAIN_C: 0.05,         // CaCO₃:Corg of export
  DEEP_CO3: 70e-6,                   // mol/kg, the deep's carbonate ion at the opening
  ALK_MEAN: 2350e-6,                 // mol/kg, the calibration's first guess
  CARBW: 1.5,                        // carbonate weathering's Ca against silicate's, at the opening
  CW_EXP: 0.4,
  SHELF_SHARE: 0.5,                  // the shelves' share of carbonate burial at the opening
  SHELF_EXP: 1.7,
  LAYER: 1000,                       // mol/m² of CaCO₃ in a full bioturbated layer
  K_ERODE: 0.4,                      // mol m⁻² yr⁻¹ at (1 − Ω) = 1, full layer
  ERODE_EXP: 1.5,
  ARC_RETURN: 0.4,                   // share of subducted carbonate returned at arcs
  ARC_IN_V: true,                    // the caller's outgassing holds the opening's arc return
  SUBDUCT: 1e-8,                     // per yr, the seafloor's consumption without a caller's
  PLATFORM: 6e7,                     // Pg C of carbonate on the continents
  SALINITY: 35,
  SUB: 2e4,                          // yr, the longest substep
};

// ── Seawater's carbonate system ──

/** Calcite's solubility product (mol² kg⁻²) at TC °C, S, and Pbar bar above the surface. */
export function calciteKsp(TC, S, Pbar = 0) {
  const T = TC + 273.15, sq = Math.sqrt(S);
  const log = -171.9065 - 0.077993 * T + 2839.319 / T + 71.595 * Math.log10(T)
    + (-0.77712 + 0.0028426 * T + 178.34 / T) * sq - 0.07711 * S + 0.0041249 * sq * S;
  const dV = -48.76 + 0.5304 * TC, dK = (-11.76 + 0.3692 * TC) / 1000;
  return Math.pow(10, log) * Math.exp((-dV + 0.5 * dK * Pbar) * Pbar / (83.14462618 * T));
}

/** The equilibrium constants at TC °C and salinity S (mol/kg; K0 mol kg⁻¹ atm⁻¹). */
export function seawater(TC, S = OC.SALINITY) {
  const T = TC + 273.15, T100 = T / 100, lnT = Math.log(T), sq = Math.sqrt(S);
  const K0 = Math.exp(-60.2409 + 93.4517 / T100 + 23.3585 * Math.log(T100)
    + S * (0.023517 - 0.023656 * T100 + 0.0047036 * T100 * T100));
  const K1 = Math.pow(10, -(3633.86 / T - 61.2172 + 9.6777 * lnT - 0.011555 * S + 0.0001152 * S * S));
  const K2 = Math.pow(10, -(471.78 / T + 25.929 - 3.16967 * lnT - 0.01781 * S + 0.0001122 * S * S));
  const KB = Math.exp((-8966.9 - 2890.53 * sq - 77.942 * S + 1.728 * sq * S - 0.0996 * S * S) / T
    + 148.0248 + 137.1942 * sq + 1.62142 * S + (-24.4344 - 25.085 * sq - 0.2474 * S) * lnT + 0.053105 * sq * T);
  const Kw = Math.exp(148.9802 - 13847.26 / T - 23.6521 * lnT + (-5.977 + 118.67 / T + 1.0495 * lnT) * sq - 0.01615 * S);
  return { TC, S, K0, K1, K2, KB, Kw, BT: 0.0004157 * S / 35, Ca: 0.02128 / 40.087 * S / 1.80655, Ksp: calciteKsp(TC, S, 0) };
}

/** Speciation from DIC and ALK (mol/kg) under constants k; h0 a starting [H⁺]. pCO₂ in µatm. */
export function speciate(dic, alk, k, h0 = 1e-8) {
  const { K1, K2, KB, Kw, BT } = k;
  let h = h0 > 1e-13 && h0 < 1e-3 ? h0 : 1e-8, lo = 1e-13, hi = 1e-3;
  for (let it = 0; it < 80; it++) {
    const D = h * h + K1 * h + K1 * K2, kb = KB + h;
    const f = dic * K1 * (h + 2 * K2) / D + BT * KB / kb + Kw / h - h - alk;   // decreasing in h
    if (f > 0) lo = h; else hi = h;
    const df = dic * K1 * (D - (h + 2 * K2) * (2 * h + K1)) / (D * D) - BT * KB / (kb * kb) - Kw / (h * h) - 1;
    let hn = h - f / df;
    if (!(hn > lo && hn < hi)) hn = Math.sqrt(lo * hi);
    const done = Math.abs(hn - h) < 1e-14 * h;
    h = hn;
    if (done) break;
  }
  const D = h * h + K1 * h + K1 * K2;
  const co2 = dic * h * h / D;
  return { h, pH: -Math.log10(h), co2, hco3: dic * K1 * h / D, co3: dic * K1 * K2 / D, pco2: 1e6 * co2 / k.K0 };
}

/** DIC (mol/kg) in equilibrium with pco2 (µatm) at alkalinity alk. */
export function dicFor(pco2, alk, k) {
  let lo = 0.3 * alk, hi = 1.5 * alk, h = 1e-8;
  for (let it = 0; it < 80; it++) {
    const m = 0.5 * (lo + hi), s = speciate(m, alk, k, h);
    h = s.h;
    if (s.pco2 > pco2) hi = m; else lo = m;
  }
  return 0.5 * (lo + hi);
}

/** An Earth-like seafloor below the shelves: bins of 150 m from 0.2 to 7.7 km, normal about 4 km. */
export function defaultHyps() {
  const depth = [], area = [];
  for (let z = 275; z < 7700; z += 150) { depth.push(z); area.push(Math.exp(-0.5 * ((z - 4000) / 1200) ** 2)); }
  return { depth, area };
}

const shelfRate = O => O > 1 ? Math.pow(O - 1, OC.SHELF_EXP) : 0;
const erodeRate = O => O < 1 ? OC.K_ERODE * Math.pow(1 - O, OC.ERODE_EXP) : 0;

function solveLinear(A, b, n) {           // A row-major n×n, overwritten; b overwritten with x
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (p !== c) {
      for (let j = 0; j < n; j++) { const t = A[c * n + j]; A[c * n + j] = A[p * n + j]; A[p * n + j] = t; }
      const t = b[c]; b[c] = b[p]; b[p] = t;
    }
    const d = A[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / d;
      if (f === 0) continue;
      for (let j = c; j < n; j++) A[r * n + j] -= f * A[c * n + j];
      b[r] -= f * b[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let j = r + 1; j < n; j++) s -= A[r * n + j] * b[j];
    b[r] = s / A[r * n + r];
  }
  return b;
}

// ── The model ──

export class OceanCarbon {
  /**
   * opts: pco2 (the opening's, ppm; default carbon.js's reference), area (m²) and
   * mass (kg) of the sea, and `inputs` (see `set`).
   */
  constructor(opts = {}) {
    this.area = opts.area ?? OC.AREA;
    this.mass = opts.mass ?? OC.MASS;
    this.Mw = OC.WARM * this.area * OC.H_WARM * OC.RHO;
    this.Mc = OC.COLD * this.area * OC.H_COLD * OC.RHO;
    this.Md = this.mass - this.Mw - this.Mc;
    this.ppmMol = OC.PPM * OC.PG;
    this.in = {
      outgas: CARBON.V0,       // Pg C/yr from below: carbon.js's V less the provinces
      lip: 0,                  // Pg C/yr, provinces' pulses
      orgBurial: 0, oxid: 0,   // Pg C/yr, carbon.js's organic()
      land: 0,                 // Pg C/yr from the land's store (vegetation, soil) to the air; negative takes up
      wRel: 1, wCO2: CARBON.PCO2_0,   // silicate weathering's map against the opening's, and the pCO₂ the climate saw
      carbW: 1,                // carbonate weathering against the opening's
      sstWarm: 21, sstCold: 1.5, tDeep: null,   // °C
      salinity: OC.SALINITY,
      shelf: 1,                // warm shallow shelf area (any unit; against its value at the opening)
      bio: 1,                  // productivity against the opening's
      iron: 1,                 // the cold box's uptake by the iron dust brings, against the opening's (src/engine/aeolian.js)
      subduct: OC.SUBDUCT,     // per yr, share of the seafloor consumed
      iceFree: 1,              // the cold box's open water, for gas exchange
      hyps: null,              // { depth: m, area: any unit }, the seafloor below the shelves
    };
    this.I = new Float64Array(7);     // mol: air C; DIC warm, cold, deep; ALK warm, cold, deep
    this.P = new Float64Array(3);     // mol of phosphate in each sea box
    this.hb = [1e-8, 1e-8, 1e-8];     // the last [H⁺] in each box, to start from
    this.platform = OC.PLATFORM * OC.PG;   // mol CaCO₃ on the continents
    this.S = 0;                       // mol CaCO₃ buried in the deep, riding the plates
    this.mantle = 0;                  // mol subducted past the arcs
    this.hold = 0;                    // > 0: the air held at this pCO₂
    this.closed = false;              // true: no weathering, burial or outgassing (a closed sea and air)
    this.sed = 0; this.kShelf = 0; this.shelf0 = 1; this.arc0 = 0;
    this.cum = { source: 0, sink: 0, held: 0, sil: 0, subducted: 0 };   // mol
    this.flux = { out: CARBON.V0, weather: CARBON.V0, lip: 0, burial: 0, oxid: 0 };
    this.set(opts.inputs || {});
    if (!this.zb) this.setHyps(defaultHyps());
    this.settle(opts.pco2 ?? CARBON.PCO2_0);
  }

  /** Update the inputs (any subset); they hold until changed. */
  set(inputs) {
    for (const key in inputs) {
      if (key === 'hyps') { if (inputs.hyps) this.setHyps(inputs.hyps); }
      else this.in[key] = inputs[key];
    }
  }

  /**
   * The seafloor's area by depth. With the same bins as before, each bin's
   * layer keeps its carbonate (a bin that shrinks buries the excess), so
   * nothing is made or lost.
   */
  setHyps({ depth, area }) {
    const n = depth.length;
    let tot = 0;
    for (let i = 0; i < n; i++) tot += Math.max(0, area[i]);
    const ab = new Float64Array(n);
    for (let i = 0; i < n; i++) ab[i] = this.area * Math.max(0, area[i]) / (tot || 1);
    const same = this.zb && this.zb.length === n && this.zb.every((z, i) => z === depth[i]);
    const c = new Float64Array(n);
    if (this.c && !same) this.S += this.c.reduce((t, ci, i) => t + ci * this.ab[i], 0) * OC.LAYER;   // other bins: the old layers are buried
    if (same) {
      for (let i = 0; i < n; i++) {
        const L = this.c[i] * this.ab[i];               // mol/LAYER in the bin's layer
        const fit = Math.min(L, ab[i]);
        c[i] = ab[i] > 0 ? fit / ab[i] : 0;
        this.S += (L - fit) * OC.LAYER;
      }
    }
    this.zb = Float64Array.from(depth); this.ab = ab; this.c = c;
    this.kspT = null;
  }

  get stats() { return this.diag || {}; }

  /** The constants for the current inputs. */
  context() {
    const s = this.in, S = s.salinity;
    const tDeep = s.tDeep ?? Math.max(-1.8, s.sstCold);
    const k = [seawater(s.sstWarm, S), seawater(s.sstCold, S), seawater(tDeep, S)];
    if (!this.kspT || this.kspT[0] !== tDeep || this.kspT[1] !== S) {
      this.ksp = new Float64Array(this.zb.length);
      for (let i = 0; i < this.zb.length; i++) this.ksp[i] = calciteKsp(tDeep, S, this.zb[i] / 10);
      this.kspT = [tDeep, S];
    }
    return {
      k, tDeep, T: OC.OVERTURN * SV * OC.RHO, Mcd: OC.MIX_CD * SV * OC.RHO, Mwd: OC.MIX_WD * SV * OC.RHO,
      areaW: OC.WARM * this.area, areaC: OC.COLD * this.area * s.iceFree,
    };
  }

  /** Phosphate over h, implicit (linear), and the exports it sets (mol/yr). */
  nutrients(h, x) {
    const { T, Mcd, Mwd } = x, Mw = this.Mw, Mc = this.Mc, Md = this.Md, b = this.in.bio;
    const uw = b / OC.TAU_W, uc = b * this.in.iron / OC.TAU_C;
    // dP/dt = L P, P in mol; concentrations P/M.
    const L = [
      -(T + Mwd) / Mw - uw, 0, (T + Mwd) / Md,
      T / Mw, -(T + Mcd) / Mc - uc, Mcd / Md,
      Mwd / Mw + uw, (T + Mcd) / Mc + uc, -(T + Mcd + Mwd) / Md,
    ];
    const A = new Float64Array(9);
    for (let i = 0; i < 9; i++) A[i] = (i % 4 === 0 ? 1 : 0) - h * L[i];
    solveLinear(A, this.P, 3);
    x.eCw = OC.RCP * uw * this.P[0]; x.eCc = OC.RCP * uc * this.P[1];
    x.eAw = OC.RAIN_W * x.eCw; x.eAc = OC.RAIN_C * x.eCc;
    x.rain = this.closed ? 0 : this.sed * (x.eAw + x.eAc) / this.area;   // mol m⁻² yr⁻¹ reaching the floor
  }

  /** Tendencies F (mol/yr) of the seven unknowns at u; rec, if given, gets the fluxes and the layers' ends. */
  rates(u, x, F, rec) {
    const s = this.in, k = x.k, Mw = this.Mw, Mc = this.Mc, Md = this.Md;
    const p = u[0] / this.ppmMol;
    const cw = speciate(u[1] / Mw, u[4] / Mw, k[0], this.hb[0]); this.hb[0] = cw.h;
    const cc = speciate(u[2] / Mc, u[5] / Mc, k[1], this.hb[1]); this.hb[1] = cc.h;
    const cd = speciate(u[3] / Md, u[6] / Md, k[2], this.hb[2]); this.hb[2] = cd.h;
    const gw = OC.KGAS * x.areaW * (p - cw.pco2), gc = OC.KGAS * x.areaC * (p - cc.pco2);
    let Fsil = 0, Fcw = 0, shelf = 0, deep = 0, perm = 0, src = 0, orgB = 0;
    if (!this.closed) {
      Fsil = OC.PG * CARBON.V0 * s.wRel * Math.exp(CARBON.SENS * Math.log2(p / s.wCO2) / CARBON.TE) * Math.pow(p / CARBON.PCO2_0, CARBON.CO2_EXP);
      Fcw = OC.PG * OC.CARBW * CARBON.V0 * s.carbW * Math.pow(p / this.p0, OC.CW_EXP);
      shelf = this.kShelf * (s.shelf / this.shelf0) * shelfRate(k[0].Ca * cw.co3 / k[0].Ksp);
      const b = x.rain, h = x.h, Cco3 = k[2].Ca * cd.co3, n = this.zb.length;
      for (let i = 0; i < n; i++) {
        const a = this.ab[i];
        if (!(a > 0)) continue;
        const e = erodeRate(Cco3 / this.ksp[i]), r = b + e, c0 = this.c[i];
        let cend = c0, cbar = c0;
        if (r > 0) {
          const kh = r * h / OC.LAYER, em = -Math.expm1(-kh), cinf = b / r;
          cend = c0 + (cinf - c0) * em;
          cbar = cinf + (c0 - cinf) * (kh > 1e-12 ? em / kh : 1);
        }
        deep += a * (OC.LAYER * (cend - c0) / h + b * cbar);
        perm += a * b * cbar;
        if (rec) rec.cEnd[i] = cend;
      }
      src = OC.PG * (s.outgas + s.lip + s.oxid + s.land) - (OC.ARC_IN_V ? this.arc0 : 0) + x.arc;
      orgB = OC.PG * s.orgBurial;
    }
    const { T, Mcd, Mwd } = x;
    const circ = (xw, xc, xd, out, o) => {
      out[o] += (T + Mwd) * (xd - xw);
      out[o + 1] += T * (xw - xc) + Mcd * (xd - xc);
      out[o + 2] += T * (xc - xd) + Mcd * (xc - xd) + Mwd * (xw - xd);
    };
    const wIn = 2 * (Fsil + Fcw);
    F[0] = src - gw - gc - 2 * Fsil - Fcw;
    F[1] = gw + wIn - x.eCw - x.eAw - shelf - orgB;
    F[2] = gc - x.eCc - x.eAc;
    F[3] = x.eCw + x.eCc + x.eAw + x.eAc - deep;
    F[4] = wIn - 2 * x.eAw - 2 * shelf;
    F[5] = -2 * x.eAc;
    F[6] = 2 * (x.eAw + x.eAc) - 2 * deep;
    circ(u[1] / Mw, u[2] / Mc, u[3] / Md, F, 1);
    circ(u[4] / Mw, u[5] / Mc, u[6] / Md, F, 4);
    if (rec) Object.assign(rec, { p, cw, cc, cd, gw, gc, Fsil, Fcw, shelf, deep, perm, src, orgB });
    return F;
  }

  /** One implicit substep of h years; it halves itself where Newton doesn't converge. */
  substep(h, x, depth = 0) {
    const P0 = Float64Array.from(this.P), hb0 = this.hb.slice();
    this.nutrients(h, x);
    x.h = h;
    // Subduction (~100 Myr: explicit): the buried pool at the start, plus the last substep's burial into it.
    const s = this.closed ? 0 : Math.max(0, this.in.subduct), em = -Math.expm1(-s * h);
    const sub = s > 0 ? Math.min(this.S + h * (this.lastPerm || 0), this.S * em + (this.lastPerm || 0) * (h - em / s)) : 0;
    x.arc = OC.ARC_RETURN * sub / h;
    const u0 = Float64Array.from(this.I), F = new Float64Array(7);
    const u = this.solve(h, x, u0);
    let rec = null;
    if (u) {
      // Flux form from the converged fluxes: conservation to rounding.
      rec = { cEnd: new Float64Array(this.zb.length) };
      this.rates(u, x, F, rec);
      for (let i = 0; i < 7; i++) if (!(u0[i] + h * F[i] > 0) && !(i === 0 && this.hold > 0)) rec = null;
    }
    if (!rec && depth < 14) {
      this.P.set(P0); this.hb = hb0;
      this.substep(h / 2, x, depth + 1);
      this.substep(h / 2, x, depth + 1);
      return;
    }
    if (!rec) throw new Error(`OceanCarbon: no implicit step of ${h} yr`);
    for (let i = 0; i < 7; i++) this.I[i] = u0[i] + h * F[i];
    if (this.hold > 0) { const A = this.hold * this.ppmMol; this.cum.held += A - this.I[0]; this.I[0] = A; }
    if (!this.closed) {
      this.c = rec.cEnd;
      this.S += h * rec.perm - sub;
      this.lastPerm = rec.perm;
      this.mantle += (1 - OC.ARC_RETURN) * sub;
      this.platform += h * (rec.shelf - rec.Fcw);
      this.cum.source += h * (rec.src - x.arc);         // from below (the arcs' return is internal)
      this.cum.sink += h * rec.orgB + (1 - OC.ARC_RETURN) * sub;
      this.cum.sil += h * rec.Fsil;
      this.cum.subducted += sub;
    }
    rec.arc = x.arc;
    this.last = rec;
  }

  /** Backward Euler over h from u0 by damped Newton; the solution, or null where it doesn't converge. */
  solve(h, x, u0) {
    const u = Float64Array.from(u0), F = new Float64Array(7), Fj = new Float64Array(7);
    const G = new Float64Array(7), J = new Float64Array(49), d = new Float64Array(7), ut = new Float64Array(7);
    const hold = this.hold > 0 ? this.hold * this.ppmMol : 0;
    if (hold) u[0] = hold;
    const sc = new Float64Array(7);
    for (let i = 0; i < 7; i++) sc[i] = Math.max(Math.abs(u0[i]), 1e14);
    const resid = (v, out) => {
      this.rates(v, x, F);
      let m = 0;
      for (let i = 0; i < 7; i++) {
        out[i] = i === 0 && hold ? v[0] - hold : v[i] - u0[i] - h * F[i];
        m = Math.max(m, Math.abs(out[i]) / sc[i]);
      }
      return m;
    };
    let r = resid(u, G);
    for (let it = 0; it < 30 && r > 1e-11; it++) {
      const F0 = Float64Array.from(F);
      for (let j = 0; j < 7; j++) {
        const dj = 1e-7 * sc[j], keep = u[j];
        u[j] = keep + dj;
        this.rates(u, x, Fj);
        u[j] = keep;
        for (let i = 0; i < 7; i++) J[i * 7 + j] = (i === j ? 1 : 0) - h * (Fj[i] - F0[i]) / dj;
      }
      if (hold) for (let j = 0; j < 7; j++) J[j] = j === 0 ? 1 : 0;
      for (let i = 0; i < 7; i++) d[i] = -G[i];
      solveLinear(J, d, 7);
      let rt = Infinity;
      for (let lam = 1; lam > 1e-4; lam *= 0.5) {
        let ok = true;
        for (let i = 0; i < 7; i++) { ut[i] = u[i] + lam * d[i]; if (!(ut[i] > 0)) ok = false; }
        if (!ok) continue;
        rt = resid(ut, Fj);
        if (rt < r * (1 - 0.25 * lam) || rt < 1e-10) break;
        rt = Infinity;
      }
      if (rt === Infinity) return null;
      for (let i = 0; i < 7; i++) { u[i] = ut[i]; G[i] = Fj[i]; }
      r = rt;
    }
    return r < 1e-9 ? u : null;
  }

  /** Advance by dt years (any length: substeps of at most OC.SUB, each implicit; at least one, however short). */
  step(dtYears, inputs) {
    if (inputs) this.set(inputs);
    if (CARBON.FIXED > 0) { this.hold = CARBON.FIXED; this.heldByCarbon = true; }
    else if (this.heldByCarbon) { this.hold = 0; this.heldByCarbon = false; }
    const x = this.context();
    if (dtYears > 0) {
      const n = Math.max(1, Math.ceil(dtYears / OC.SUB - 1e-9)), h = dtYears / n;
      for (let i = 0; i < n; i++) this.substep(h, x);
    }
    this.diagnose(x);
  }

  /** A pulse of carbon into the air (Pg C). */
  pulse(PgC) {
    this.I[0] += PgC * OC.PG;
    this.cum.source += PgC * OC.PG;
    this.pco2 = this.I[0] / this.ppmMol;
  }

  /** pCO₂, the fluxes (Pg C/yr) and the boxes, at the current state. */
  diagnose(x0 = this.context()) {
    // Instantaneous rates at the state (h → 1 yr for the layers), from the exports at the current phosphate.
    const x = { ...x0, h: 1, arc: OC.ARC_RETURN * this.S * Math.max(0, this.in.subduct) };
    this.nutrientsNoStep(x);
    const rec = { cEnd: new Float64Array(this.zb.length) };
    this.rates(this.I, x, new Float64Array(7), rec);
    const s = this.in, PG = OC.PG;
    this.pco2 = rec.p;
    const arcExtra = this.closed ? 0 : (x.arc - (OC.ARC_IN_V ? this.arc0 : 0)) / PG;
    this.flux = {
      out: s.outgas + s.lip + arcExtra, weather: rec.Fsil / PG, lip: s.lip, burial: s.orgBurial, oxid: s.oxid,
      carbW: rec.Fcw / PG, shelf: rec.shelf / PG, deep: rec.deep / PG, arc: x.arc / PG,
      land: s.land, export: (x.eCw + x.eCc) / PG, rain: (x.eAw + x.eAc) / PG, gas: (rec.gw + rec.gc) / PG,
    };
    const box = (c, M, i, T) => ({
      T, dic: 1e6 * this.I[1 + i] / M, alk: 1e6 * this.I[4 + i] / M, po4: 1e6 * this.P[i] / M,
      pH: c.pH, pco2: c.pco2, co3: 1e6 * c.co3, omega: x.k[i].Ca * c.co3 / x.k[i].Ksp,
    });
    this.diag = {
      boxes: [box(rec.cw, this.Mw, 0, s.sstWarm), box(rec.cc, this.Mc, 1, s.sstCold), box(rec.cd, this.Md, 2, x.tDeep)],
      ccd: this.depthWhere(rec.cd.co3, x, 'ccd'), saturation: this.depthWhere(rec.cd.co3, x, 'sat'),
      rainFloor: x.rain,
    };
    return this.diag;
  }
  nutrientsNoStep(x) {
    const b = this.in.bio;
    x.eCw = OC.RCP * b / OC.TAU_W * this.P[0]; x.eCc = OC.RCP * b * this.in.iron / OC.TAU_C * this.P[1];
    x.eAw = OC.RAIN_W * x.eCw; x.eAc = OC.RAIN_C * x.eCc;
    x.rain = this.closed ? 0 : this.sed * (x.eAw + x.eAc) / this.area;
  }

  /** The depth (m) of calcite's saturation (Ω = 1), or of compensation (dissolution meets the rain). */
  depthWhere(co3, x, which) {
    const Cco3 = x.k[2].Ca * co3, S = this.in.salinity;
    const target = which === 'sat' ? 1 : (x.rain > 0 ? 1 - Math.pow(x.rain / OC.K_ERODE, 1 / OC.ERODE_EXP) : -Infinity);
    const om = z => Cco3 / calciteKsp(x.tDeep, S, z / 10);
    if (om(0) < target) return 0;
    if (om(12000) > target) return 12000;
    let lo = 0, hi = 12000;
    for (let i = 0; i < 50; i++) { const m = 0.5 * (lo + hi); if (om(m) > target) lo = m; else hi = m; }
    return 0.5 * (lo + hi);
  }

  /** Total carbon (mol) in air, sea and sediments, and the alkalinity ledger's invariant. */
  inventory() {
    const I = this.I, layer = this.c.reduce((a, c, i) => a + c * this.ab[i], 0) * OC.LAYER;
    const C = I[0] + I[1] + I[2] + I[3] + this.platform + layer + this.S;
    const alk = I[4] + I[5] + I[6] + 2 * (this.platform + layer + this.S + this.cum.subducted) - 2 * this.cum.sil;
    return { C, alk, budget: this.cum.source - this.cum.sink + this.cum.held, layer };
  }

  /**
   * The opening: a steady state at pco2 (ppm) under the current inputs.
   * The sea's mean alkalinity is set to ALK_MEAN with the sediments off,
   * the shelves and the floor's rain calibrated to bury what weathering
   * brings, then the open system settles with the air held.
   */
  settle(pco2) {
    this.p0 = pco2;
    const x = this.context(), M = [this.Mw, this.Mc, this.Md];
    this.hold = pco2; this.closed = true;
    this.c.fill(0); this.S = 0; this.arc0 = 0; this.lastPerm = 0;
    // The closed sea under the held air, its alkalinity found (by secant) so the deep's CO₃ is DEEP_CO3.
    const closedSea = a => {
      for (let i = 0; i < 3; i++) {
        this.I[4 + i] = a * M[i];
        this.I[1 + i] = dicFor(pco2, a, x.k[Math.min(i, 1)]) * M[i] * (i === 2 ? 1.08 : 1);
        this.P[i] = OC.PO4 * M[i];
      }
      this.I[0] = pco2 * this.ppmMol;
      for (let i = 0; i < 12; i++) this.substep(1e5, x);
      for (let i = 0; i < 5; i++) this.substep(1e4, x);
      return this.diagnose(x).boxes[2].co3 * 1e-6 - OC.DEEP_CO3;
    };
    let a0 = OC.ALK_MEAN, f0 = closedSea(a0), a1 = a0 - 2 * f0, f1 = closedSea(a1);
    for (let i = 0; i < 8 && Math.abs(f1) > 1e-9; i++) {
      const a2 = a1 - f1 * (a1 - a0) / (f1 - f0);
      a0 = a1; f0 = f1; a1 = a2; f1 = closedSea(a1);
    }
    // Calibrate the shelves and the floor's rain at that state.
    this.closed = false; this.sed = 0;
    const r = { cEnd: new Float64Array(this.zb.length) };
    x.h = 1; x.arc = 0; this.nutrientsNoStep(x);
    this.kShelf = 1; this.shelf0 = this.in.shelf || 1;
    this.rates(this.I, x, new Float64Array(7), r);
    const need = r.Fsil + r.Fcw, Ow = x.k[0].Ca * r.cw.co3 / x.k[0].Ksp;
    this.kShelf = OC.SHELF_SHARE * need / Math.max(1e-9, shelfRate(Ow));
    const deep0 = (1 - OC.SHELF_SHARE) * need, rain = x.eAw + x.eAc, Cco3 = x.k[2].Ca * r.cd.co3;
    const steady = sed => {
      const b = sed * rain / this.area;
      let f = 0;
      for (let i = 0; i < this.zb.length; i++) { const e = erodeRate(Cco3 / this.ksp[i]); f += this.ab[i] * (b + e > 0 ? b * b / (b + e) : 0); }
      return f;
    };
    let lo = 0, hi = 1;
    if (steady(1) < deep0) lo = 1;
    else for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (steady(m) < deep0) lo = m; else hi = m; }
    this.sed = 0.5 * (lo + hi);
    this.calibration = { sed: this.sed, kShelf: this.kShelf, omegaWarm: Ow, feasible: steady(1) >= deep0 };
    // The layers and the buried pool in steady state, then the open system settles.
    const b = this.sed * rain / this.area;
    for (let i = 0; i < this.zb.length; i++) { const e = erodeRate(Cco3 / this.ksp[i]); this.c[i] = b + e > 0 ? b / (b + e) : 0; }
    const sub = Math.max(0, this.in.subduct);
    const permOf = () => this.c.reduce((s, c, i) => s + this.ab[i] * b * c, 0);
    this.S = sub > 0 ? permOf() / sub : 0;
    this.arc0 = OC.ARC_RETURN * sub * this.S;
    this.lastPerm = permOf();
    for (let i = 0; i < 40; i++) this.substep(1e5, x);
    for (let i = 0; i < 20; i++) this.substep(1e4, x);
    this.lastPerm = this.last.perm;
    this.S = sub > 0 ? this.lastPerm / sub : 0;
    this.arc0 = OC.ARC_RETURN * sub * this.S;
    this.hold = 0;
    this.cum = { source: 0, sink: 0, held: 0, sil: 0, subducted: 0 };
    this.diagnose(x);
  }

  /**
   * The balance: pCO₂ at which silicate weathering meets outgassing V
   * (flux.out's convention: from below, with the provinces) with the
   * climate's map fixed. carbon.js's formula: ln(V'/(V0 w)) = a ln(p/p_seen)
   * + β ln(p/p₀), a = S/(Tₑ ln 2), V' = V + oxidation − organic burial.
   */
  equilibrium(V = this.flux.out) {
    const s = this.in;
    V = Math.max(1e-6, V + s.oxid - s.orgBurial);
    const a = CARBON.SENS / (CARBON.TE * Math.LN2), b = CARBON.CO2_EXP;
    const lnp = (Math.log(V / (CARBON.V0 * s.wRel)) + a * Math.log(s.wCO2) + b * Math.log(CARBON.PCO2_0)) / (a + b);
    return Math.exp(lnp);
  }
}
