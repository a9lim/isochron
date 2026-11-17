// The long carbon cycle (docs/life.md): outgassing against weathering.
//
// Outgassing scales with the plates' activity, crust made at ridges and
// consumed at trenches (against their rate at the opening),
// plus the pulses of large igneous provinces. Silicate weathering scales
// with runoff (as runoff^0.65), with temperature as e^{ΔT/Tₑ}, directly with
// CO₂ as pCO₂^0.3 (soil CO₂), with the supply of fresh rock that erosion
// exposes, and with the plants' cover (bare rock weathers at a quarter of
// forest's: src/engine/vegetation.js) (standard: the Walker–Hays–Kasting
// thermostat; the exponents and Tₑ from memory).
// Organic carbon is the other half (standard; GEOCARB's organic subcycle):
// plankton and plant debris buried with sediment at the coasts take carbon
// out, and old organic carbon in rock oxidizes when erosion exposes it. Here
// burial scales with the sediment the rivers deliver to the sea and
// oxidation with the rock they erode, each a fifth of the reference
// outgassing at the opening (Earth's organic share of burial is about a
// fifth); mountains raised fast bury more than they expose, and the
// difference moves the CO₂.
// Weathering is measured on the climate's own map of runoff, temperature and
// erosion each time the climate completes; between climate solves, the
// temperature's answer to a change in CO₂ is the climate sensitivity, so the
// loop closes within a step.
// Where the carbon lives (phase 8): the air, three boxes of sea and the
// seafloor's carbonate (src/engine/oceancarbon.js, after LOSCAR), stepped
// with these fluxes as its inputs, so pCO₂ comes from carbonate chemistry
// rather than pCO₂ ∝ R². The land's store (src/engine/vegetation.js) trades
// with the air through `land`. The arcs' outgassing is split (synthesis): the
// mantle wedge's own carbon scales with consumption, as before, and the
// carbonate the plates carry down returns from the sea's ledger (its 40%,
// ~half the opening's outgassing), so the recycled part isn't counted twice.
// The Thermostat's knob scales the mantle's part.
//
// Units: Pg of carbon, years.

import { OceanCarbon, OC } from './oceancarbon.js';
import { weathering as coverWeathering } from './vegetation.js';
import { PulseTag } from './pulse.js';

export const CARBON = {
  PCO2_0: 280,        // ppm
  V0: 0.1,            // Pg C/yr outgassed at the genesis plates' activity
  RIDGE: 0.4, ARC: 0.6,   // shares of outgassing
  TE: 13.7,           // K
  RUNOFF_EXP: 0.65,
  SENS: 3,            // K per doubling, for the response between climate solves
  E_HALF: 0.01,       // km/Myr of erosion at which weathering is half supply-limited
  CO2_EXP: 0.3,       // weathering ∝ pCO₂^CO2_EXP directly
  RIDGE_REF: 500, ARC_REF: 490,   // cells per Myr at level 6 that outgas V0 when there's no spin-up to measure
  OUTGAS: 1,          // the mantle's outgassing's multiplier (the Thermostat's knob)
  FIXED: 0,           // > 0 holds pCO₂ there (ppm): the carbon cycle switched off
  ORG: 0.2,           // organic burial (and oxidation) as a share of V0, at the opening's sediment flux
};

export class Carbon {
  constructor(tec, land, climate, plumes = null) {
    this.tec = tec; this.land = land; this.climate = climate; this.plumes = plumes;
    this.pco2 = CARBON.PCO2_0;
    // The reference activity: the plates' at the opening (the spin-up's last 10 Myr),
    // so the opening is in balance and later changes in the plates move the CO₂.
    // Without a spin-up, this model's settled rates (per cell of this grid).
    const scale = tec.grid.n / 40962;
    this.ridge0 = tec.spinRate ? Math.max(1, tec.spinRate.made) : CARBON.RIDGE_REF * scale;
    this.arc0 = tec.spinRate ? Math.max(1, tec.spinRate.consumed) : CARBON.ARC_REF * scale;
    this.ridge = this.ridge0; this.arc = this.arc0;
    this.lastMade = tec.counters.opened; this.lastConsumed = tec.counters.closed; this.lastT = tec.t;
    this.wF = 0; this.wF0 = 0; this.wCO2 = this.pco2;   // the climate's weathering factor, at genesis, and the pCO₂ it saw
    this.sed0 = 0; this.ero0 = 0;    // the landscape's fluxes at the opening (km³/yr)
    this.landFlux = 0;               // Pg C/yr from the land's store to the air over the next step (src/engine/life.js)
    // Where the carbon lives: the air, the sea's boxes and its floor (src/engine/oceancarbon.js),
    // settled again on the planet's own sea once the climate is warm (`settle`).
    this.subduction = this.subduct();
    this.sea = new OceanCarbon({ pco2: this.pco2, inputs: { subduct: this.subduction } });
    this.flux = { ...this.sea.flux };   // Pg C/yr
  }

  /** The share of the seafloor consumed a year: the trenches' smoothed rate (cells/Myr) against the sea's cells. */
  subduct() {
    const m = this.tec.sea, n = this.tec.grid.n;
    let sea = 0;
    if (m) for (let i = 0; i < n; i++) if (m[i]) sea++;
    return this.arc / Math.max(1, sea || 0.7 * n) / 1e6;
  }

  /** The sea settled to a steady state at the current pCO₂ under its current inputs (the planet's opening). */
  settle() {
    this.subduction = this.subduct();
    this.sea.set({ subduct: this.subduction });
    this.sea.settle(this.pco2);
    this.settled = true;
    this.pco2 = this.sea.pco2;
    this.flux = { ...this.sea.flux };
  }

  /** Weathering's map, from the climate's latest state. */
  measure() {
    // A sea boiling away (the People scenario's runaway) keeps the map it had: drawn on the seafloor
    // left dry, weathering would draw the air down as no sea-built cycle could (src/engine/peoplelink.js).
    if (this.boiling && this.wF > 0) return;
    const c = this.climate, g = c.grid, n = g.n, L = c.landMask, erosion = this.land ? this.land.erosion : null;
    const ice = c.ice ? c.ice.H : null, cover = c.cover;
    // Fresh rock's supply: the regolith's production where there is one (src/engine/regolith.js: at
    // steady state it is the erosion, E_HALF's rate), else the erosion itself.
    const prod = this.land && this.land.regolith ? this.land.regolith.prod : null;
    let f = 0;
    for (let i = 0; i < n; i++) {
      if (!L[i] || (ice && ice[i] > 10)) continue;
      const run = c.runoff[i] * 1000;                                  // mm/yr
      const T = c.Tf[0][i] - 6.5 * c.elevPos[i];
      const e = prod ? prod[i] : erosion ? erosion[i] : CARBON.E_HALF;
      const supply = 0.25 + 0.75 * e / (e + CARBON.E_HALF);
      f += g.area[i] * Math.pow(Math.max(0, run), CARBON.RUNOFF_EXP) * Math.exp((T - 15) / CARBON.TE) * supply
        * (cover ? coverWeathering(cover.ft[i], cover.fg[i]) : 1);
    }
    this.wF = f;
    // The reference is taken once the climate has settled (its first cycles are a transient: from a
    // cold start the cover and the rain take ~10 cycles to agree, and at cycle 3 the map stood
    // ~2.5 K warmer and 15% wetter than where it settles) and the landscape has stepped. (Before
    // phase 7 the opening's erosion was zero until the first step, the supply a quarter, and the
    // reference 2.7× low: headless and at slow dials, CO₂ crashed at the first step. The
    // regolith's production and the landscape's preview fill it from the opening now; the wait
    // keeps the reference on a stepped landscape's map.)
    // Until then the map is the opening's, and so is the CO₂ it saw.
    const ready = !!c.stats.settled && !(this.land && !this.land.steps);
    if (this.wF0 > 0 || ready) this.wCO2 = c.co2Seen || CARBON.PCO2_0;
    if (!(this.wF0 > 0) && ready) this.wF0 = f;
  }

  /** The mantle's outgassing now (Pg C/yr, without the provinces): ridges, and the arcs' own carbon. */
  mantle() {
    // The arcs' share less the carbonate the plates bring back (the sea's ledger returns that;
    // were it more than the arcs' share, the rest would come off the ridges').
    const ret = this.sea.arc0 / OC.PG / CARBON.V0, arcOwn = Math.max(0, CARBON.ARC - ret), ridgeOwn = Math.max(0, 1 - ret - arcOwn);
    return CARBON.OUTGAS * CARBON.V0 * (ridgeOwn * this.ridge / this.ridge0 + arcOwn * this.arc / this.arc0);
  }

  /** Advance by dt years (any length; the sea substeps itself). */
  step(dtYears) {
    const tec = this.tec;
    // Plate activity: smoothed rates of crust made and consumed.
    const dT = tec.t - this.lastT;
    if (dT > 0) {
      const made = (tec.counters.opened - this.lastMade) / dT, cons = (tec.counters.closed - this.lastConsumed) / dT;
      const k = 1 - Math.exp(-dT / 5);
      this.ridge += (made - this.ridge) * k; this.arc += (cons - this.arc) * k;
      this.lastMade = tec.counters.opened; this.lastConsumed = tec.counters.closed; this.lastT = tec.t;
      this.subduction = this.subduct();
    }
    // Until the sea settles on the planet (at the end of the opening's closure, src/engine/life.js)
    // the air is held at the opening's pCO₂, so the closure's climate and the references all see
    // the same CO₂ (`holdOpening`, which the planet's life sets).
    if (this.holdOpening && !this.settled) this.sea.hold = CARBON.PCO2_0;
    const lip = this.plumes ? this.plumes.co2Rate / 1e6 : 0;          // Pg C/yr
    const { burial, oxid } = this.organic();
    // The ledger adds the arcs' recycled carbonate less the opening's (OC.ARC_IN_V), so the
    // opening's goes in here: the arcs' total is then the mantle's own plus the ledger's.
    this.sea.step(dtYears, {
      outgas: this.mantle() + (OC.ARC_IN_V ? this.sea.arc0 / OC.PG : 0), lip, orgBurial: burial, oxid,
      wRel: this.wF0 > 0 ? this.wF / this.wF0 : 1, wCO2: this.wCO2, land: this.boiling ? 0 : this.landFlux, subduct: this.subduction,
    });
    this.landFlux = 0;
    if (this.tag) this.tag.step(this, dtYears);
    this.pco2 = this.sea.pco2;
    this.flux = this.sea.flux;
  }

  /** A pulse of carbon into the air (Pg C). */
  pulse(PgC) { this.sea.pulse(PgC); this.pco2 = this.sea.pco2; }

  /** The Pulse experiment's pulse: into the air, with a twin of the sea to measure it against (src/engine/pulse.js). */
  startPulse(PgC) { this.tag = new PulseTag(this, PgC); this.pco2 = this.sea.pco2; return this.tag; }

  /** Organic carbon: buried with the sediment reaching the sea, oxidized from the rock eroded. */
  organic() {
    const f = this.land ? this.land.flux : null;
    if (!f || !(f.eroded > 0)) return { burial: 0, oxid: 0 };
    if (!(this.sed0 > 0)) { this.sed0 = Math.max(1e-6, f.toSea); this.ero0 = f.eroded; }
    const k = CARBON.ORG * CARBON.V0;
    return { burial: k * f.toSea / this.sed0, oxid: k * f.eroded / this.ero0 };
  }

  /**
   * The balance: pCO₂ at which silicate weathering meets outgassing V (from below, with the
   * provinces and the arcs' recycled carbonate: flux.out's convention) with the climate's map
   * fixed. Solves ln(V'/(V0 w)) = a ln(p/p_seen) + β ln(p/p₀), a = S/(Tₑ ln 2),
   * V' = V + oxidation − organic burial.
   */
  equilibrium(V) {
    const o = this.organic();
    this.sea.set({ wRel: this.wF0 > 0 ? this.wF / this.wF0 : 1, wCO2: this.wCO2, oxid: o.oxid, orgBurial: o.burial });
    return this.sea.equilibrium(V);
  }
}
