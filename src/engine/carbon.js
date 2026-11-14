// The long carbon cycle (docs/PLAN.md, layer 6): dR/dt = outgassing − weathering.
//
// Outgassing scales with the plates' activity, crust made at ridges and
// consumed at trenches (against the rate this model's plates settle to),
// plus the pulses of large igneous provinces. Silicate weathering scales
// with runoff (as runoff^0.65), with temperature as e^{ΔT/Tₑ}, directly with
// CO₂ as pCO₂^0.3 (soil CO₂), and with the supply of fresh rock that erosion
// exposes (standard: the Walker–Hays–Kasting thermostat; the exponents and Tₑ
// from memory).
// Weathering is measured on the climate's own map of runoff, temperature and
// erosion each time the climate completes; between climate solves, the
// temperature's answer to a change in CO₂ is the climate sensitivity, so the
// loop closes within a step. The exogenic reservoir R (atmosphere and ocean)
// sets pCO₂ ∝ R² (the ocean's buffering). Its response time is a few hundred
// kyr, so at plate speed it is always near its balance.
//
// Units: Pg of carbon, years.

export const CARBON = {
  R0: 38000,          // Pg C in atmosphere and ocean at the reference pCO₂
  PCO2_0: 280,        // ppm
  BUFFER: 2,          // pCO₂ ∝ R^BUFFER
  V0: 0.1,            // Pg C/yr outgassed at the genesis plates' activity
  RIDGE: 0.4, ARC: 0.6,   // shares of outgassing
  TE: 13.7,           // K
  RUNOFF_EXP: 0.65,
  SENS: 3,            // K per doubling, for the response between climate solves
  E_HALF: 0.01,       // km/Myr of erosion at which weathering is half supply-limited
  CO2_EXP: 0.3,       // weathering ∝ pCO₂^CO2_EXP directly
  RIDGE_REF: 500, ARC_REF: 490,   // cells per Myr at level 6 that outgas V0 (this model's settled rates)
  OUTGAS: 1,          // the outgassing's multiplier (the Thermostat's knob)
  FIXED: 0,           // > 0 holds pCO₂ there (ppm): the carbon cycle switched off
  MIN_PCO2: 10, MAX_PCO2: 20000,
};

export class Carbon {
  constructor(tec, land, climate, plumes = null) {
    this.tec = tec; this.land = land; this.climate = climate; this.plumes = plumes;
    this.R = CARBON.R0;
    this.pco2 = CARBON.PCO2_0;
    // The reference activity, per cell of this grid; the spin-up's rates start the smoothing.
    const scale = tec.grid.n / 40962, span = Math.max(1, tec.t0 || tec.t || 40);
    this.ridge0 = CARBON.RIDGE_REF * scale; this.arc0 = CARBON.ARC_REF * scale;
    this.ridge = tec.counters.made / span; this.arc = tec.counters.consumed / span;
    this.lastMade = tec.counters.made; this.lastConsumed = tec.counters.consumed; this.lastT = tec.t;
    this.wF = 0; this.wF0 = 0; this.wCO2 = this.pco2;   // the climate's weathering factor, at genesis, and the pCO₂ it saw
    this.flux = { out: CARBON.V0, weather: CARBON.V0, lip: 0 };   // Pg C/yr
  }

  /** Weathering's map, from the climate's latest state. */
  measure() {
    const c = this.climate, g = c.grid, n = g.n, L = c.landMask, erosion = this.land ? this.land.erosion : null;
    const ice = c.ice ? c.ice.H : null;
    let f = 0;
    for (let i = 0; i < n; i++) {
      if (!L[i] || (ice && ice[i] > 10)) continue;
      const run = c.runoff[i] * 1000;                                  // mm/yr
      const T = c.Tf[0][i] - 6.5 * c.elevPos[i];
      const e = erosion ? erosion[i] : CARBON.E_HALF;
      const supply = 0.25 + 0.75 * e / (e + CARBON.E_HALF);
      f += g.area[i] * Math.pow(Math.max(0, run), CARBON.RUNOFF_EXP) * Math.exp((T - 15) / CARBON.TE) * supply;
    }
    this.wF = f;
    this.wCO2 = c.co2Seen || CARBON.PCO2_0;
    if (!(this.wF0 > 0)) this.wF0 = f;
  }

  pco2Of(R) { return CARBON.PCO2_0 * Math.pow(R / CARBON.R0, CARBON.BUFFER); }

  /** Advance by dt years (any length; substepped). */
  step(dtYears) {
    const tec = this.tec;
    // Plate activity: smoothed rates of crust made and consumed.
    const dT = tec.t - this.lastT;
    if (dT > 0) {
      const made = (tec.counters.made - this.lastMade) / dT, cons = (tec.counters.consumed - this.lastConsumed) / dT;
      const k = 1 - Math.exp(-dT / 5);
      this.ridge += (made - this.ridge) * k; this.arc += (cons - this.arc) * k;
      this.lastMade = tec.counters.made; this.lastConsumed = tec.counters.consumed; this.lastT = tec.t;
    }
    if (CARBON.FIXED > 0) {
      this.pco2 = CARBON.FIXED; this.R = CARBON.R0 * Math.pow(this.pco2 / CARBON.PCO2_0, 1 / CARBON.BUFFER);
      return;
    }
    const lip = this.plumes ? this.plumes.co2Rate / 1e6 : 0;          // Pg C/yr
    const V = CARBON.V0 * CARBON.OUTGAS * (CARBON.RIDGE * this.ridge / this.ridge0 + CARBON.ARC * this.arc / this.arc0) + lip;
    const wRel = this.wF0 > 0 ? this.wF / this.wF0 : 1;
    // Substeps of at most 20 kyr (the reservoir's response is ~400 kyr), implicit in R.
    let left = dtYears;
    while (left > 0) {
      const h = Math.min(left, 2e4);
      // W(R) = V0 wRel e^{S log₂(p/p_seen)/Tₑ}: Newton on R' = R + h (V − W(R')).
      let R = this.R;
      for (let it = 0; it < 6; it++) {
        const p = this.pco2Of(R);
        const ex = Math.exp(CARBON.SENS * Math.log2(p / this.wCO2) / CARBON.TE) * Math.pow(p / CARBON.PCO2_0, CARBON.CO2_EXP);
        const W = CARBON.V0 * wRel * ex;
        const dW = W * CARBON.BUFFER * (CARBON.SENS / (Math.LN2 * CARBON.TE) + CARBON.CO2_EXP) / R;
        const F = R - this.R - h * (V - W);
        R -= F / (1 + h * dW);
      }
      this.R = Math.max(CARBON.R0 * Math.sqrt(CARBON.MIN_PCO2 / CARBON.PCO2_0), Math.min(CARBON.R0 * Math.sqrt(CARBON.MAX_PCO2 / CARBON.PCO2_0), R));
      left -= h;
    }
    this.pco2 = this.pco2Of(this.R);
    const W = CARBON.V0 * wRel * Math.exp(CARBON.SENS * Math.log2(this.pco2 / this.wCO2) / CARBON.TE) * Math.pow(this.pco2 / CARBON.PCO2_0, CARBON.CO2_EXP);
    this.flux = { out: V, weather: W, lip };
  }

  /**
   * The balance: pCO₂ at which weathering meets outgassing V with the
   * climate's map fixed. Solves ln(V/(V0 w)) = a ln(p/p_seen) + β ln(p/p₀),
   * a = S/(Tₑ ln 2).
   */
  equilibrium(V) {
    const wRel = this.wF0 > 0 ? this.wF / this.wF0 : 1;
    const a = CARBON.SENS / (CARBON.TE * Math.LN2), b = CARBON.CO2_EXP;
    const lnp = (Math.log(V / (CARBON.V0 * wRel)) + a * Math.log(this.wCO2) + b * Math.log(CARBON.PCO2_0)) / (a + b);
    return Math.exp(lnp);
  }
}
