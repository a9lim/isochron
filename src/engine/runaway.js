// The runaway greenhouse, on the planet's own books (docs/PLAN.md, Roadmap 2.0: the endings).
//
// Standard physics: a moist atmosphere's outgoing longwave saturates. As the surface warms, its
// column's water vapour grows opaque, and the OLR approaches the Simpson–Nakajima limit, ~282 W/m²
// (Goldblatt and others 2013, from memory), however warm the surface below. Past it no
// temperature balances the sunlight absorbed and the forcing, and the excess boils the sea.
//
// Synthesis, as built: the energy balance's OLR is A + BT; its global mean leaves that line at
// T_K and reaches the limit at T_P along a parabola (C¹ at both ends), and the departure enters
// the energy balance as a uniform forcing, `CLIMATE.F_OLR` (`correction`), so the global mean
// lands where the curve balances. (A uniform forcing shifts the annual mean uniformly, so the
// pattern stays the diffusive balance's; the moist tropics would saturate first, but the
// transport exports their heat, and the closure is the global mean's.) Below T_K it is zero:
// the opening is untouched.
//
// Past the limit, the excess N = H − L_RUN (H: the sunlight absorbed and the forcing, W/m²)
// boils the sea at N × the Earth's area over E_BOIL (`step`), and the surface follows the steam:
// at the saturation temperature of its pressure while the ocean's liquid (Clausius–Clapeyron
// from 100 °C at 1 bar; the ocean as vapour is P_OCEAN), from the critical point to T_POST as
// the rest goes supercritical (synthesis), and T_POST once it's all in the air (a dry steam
// planet radiating through the steam's windows). With N < 0 the steam rains back at the same
// rate, so the sea returns as the forcing falls (hydrogen's escape, ~10⁸ years, isn't counted).
// `Tectonics.boiled` is the share in the air: the sea level falls with it. The carbon cycle, built
// on a sea, keeps the inputs it had while the sea boils (src/engine/life.js, carbon.js); the boiled
// water's dissolved carbon degasses to the air (`OceanCarbon.boilTo`), and weathering stops as the
// ground dries past ~100 °C.
export const RUNAWAY = {
  T_K: 25,                // °C, the energy balance's sea-level mean: where its OLR leaves A + BT
  L_RUN: 282,             // W/m²: the limit (Goldblatt and others 2013, from memory)
  P_OCEAN: 270,           // bar: the ocean as vapour (1.4 × 10²¹ kg × g over the Earth's area, standard)
  E_BOIL: 3.7e27,         // J: the heat that boils it, from 15 °C (standard)
  P_CRIT: 220.6,          // bar: water's critical point (standard)
  T_POST: 1227,           // °C: the dry steam planet (~1,500 K, Goldblatt and others 2013, from memory)
  L_VAP: 40.7e3,          // J/mol: Clausius–Clapeyron from 100 °C at 1 bar (standard; within ~12 K of the steam tables to the critical point)
  SOLVE: 1e-3,            // the sea re-solved each thousandth boiled
};

const AREA = 5.1e14, YEAR = 3.156e7, R_GAS = 8.314;

/** The global mean OLR at the energy balance's mean T (°C): A + BT, then the parabola to the limit. */
export function olr(T, A, B) {
  const R = RUNAWAY, OK = A + B * R.T_K;
  if (T <= R.T_K) return A + B * T;
  const W = 2 * (R.L_RUN - OK) / B, x = Math.min(T - R.T_K, W);
  return OK + B * x - B * x * x / (2 * W);
}

/** The mean T at which olr balances H (W/m²); Infinity past the limit. */
export function olrInverse(H, A, B) {
  const R = RUNAWAY, OK = A + B * R.T_K;
  if (H <= OK) return (H - A) / B;
  if (H >= R.L_RUN) return Infinity;
  const W = 2 * (R.L_RUN - OK) / B;
  return R.T_K + W * (1 - Math.sqrt(1 - (H - OK) / (R.L_RUN - OK)));
}

/** Where the curve reaches the limit (°C). */
export function plateau(A, B) { const R = RUNAWAY; return R.T_K + 2 * (R.L_RUN - (A + B * R.T_K)) / B; }

/** The surface under a steam atmosphere holding share b of the ocean (°C). */
export function steamT(b) {
  const R = RUNAWAY, p = b * R.P_OCEAN;
  const cc = q => 1 / (1 / 373.15 - R_GAS * Math.log(q) / R.L_VAP) - 273.15;
  if (p <= 0) return -Infinity;
  if (p <= R.P_CRIT) return cc(p);
  const bc = R.P_CRIT / R.P_OCEAN, Tc = cc(R.P_CRIT);
  return Tc + (R.T_POST - Tc) * Math.min(1, (b - bc) / (1 - bc));
}

export class Runaway {
  constructor(tec) {
    this.tec = tec;
    this.b = tec.boiled || 0;        // the ocean's share in the air
    this.H = null;                   // the last energy balance's sunlight absorbed and forcing (W/m², global mean)
    this.N = 0;                      // H less the limit, while it binds
    this.target = null;              // the mean the last correction aimed at (°C, sea level)
    this.solved = this.b;
  }

  /** Is the steam in charge (the limit passed, or steam still in the air)? */
  get active() { return this.b > 0 || (this.H !== null && this.H >= RUNAWAY.L_RUN); }

  /**
   * The uniform correction to A + BT for the energy balance's next step, from its mean absorbed
   * sunlight Ā and the forcing F (W/m²): the mean lands where the curve balances, or on the steam.
   */
  correction(Abar, F, A, B) {
    const H = Abar + F;
    this.H = H; this.N = H - RUNAWAY.L_RUN;
    const T = this.active ? Math.max(plateau(A, B), steamT(this.b)) : olrInverse(H, A, B);
    this.target = T;
    return A + B * T - H;
  }

  /** dt years: the excess boils the sea (or the steam rains back); the sea level follows. */
  step(dt, carbon) {
    const tec = this.tec;
    if (this.H !== null && (this.N > 0 || this.b > 0)) {
      this.b = Math.min(1, Math.max(0, this.b + this.N * AREA * YEAR * dt / RUNAWAY.E_BOIL));
    }
    tec.boiled = this.b;
    if (carbon) {
      carbon.boiling = this.b > 0;
      // The boiled water's carbon to the air; weathering only where liquid water reaches the ground
      // (none on a surface past ~100 °C: the steam's rain evaporates before it lands; synthesis).
      carbon.sea.boilTo(1 - this.b);
      const T = this.active && this.target !== null ? this.target : -Infinity, u = Math.min(1, Math.max(0, (T - 60) / 40));
      carbon.sea.in.wet = 1 - u * u * (3 - 2 * u);
      carbon.pco2 = carbon.sea.pco2;
    }
    // The sea re-solved each thousandth boiled, and each plate step while there is steam (the
    // basins change under a constant volume).
    if (Math.abs(this.b - this.solved) > RUNAWAY.SOLVE || (this.b > 0 && tec.t !== this.solvedT)) {
      tec.updateElevation();
      this.solved = this.b; this.solvedT = tec.t;
    }
  }

  /** For the page's snapshots: the steam's pressure (bar), the surface it holds, the excess. */
  stats() { return { boiled: this.b, steam: this.b * RUNAWAY.P_OCEAN, N: this.H === null ? 0 : this.N, H: this.H ?? 0, target: this.target, active: this.active }; }
}
