// The ground (docs/MODEL.md): soil water, the snowpack and the
// ground's heat on each land cell, stepped by the month.
//
//   the bucket    soil water S up to a capacity S_max (mm); evaporation is
//                 the potential times β = min(1, S/0.75 S_max) (Manabe's
//                 bucket, standard). Its overflow is generalized to a cell
//                 whose points hold different capacities: a share w⁴ of the
//                 month's rain and melt runs off the part already full,
//                 w = S/S_max (the saturated share of HBV and the Arno
//                 scheme, standard, from memory; w^b → overflow as b → ∞).
//                 It drains as baseflow at 0.4 S_max w⁴ a month, the drainage
//                 falling steeply as the soil dries (the shape of Clapp and
//                 Hornberger's conductivity, from memory): drainage ∝ S ran
//                 deserts' soils out to their rivers (+350% runoff in arid
//                 climates against Budyko's). The exponents and the rate are
//                 fitted (synthesis): see potential evaporation below. When
//                 the capacity is cut (the regolith thins), the water past it
//                 runs off as the next month's quick flow, here and on the GPU.
//   groundwater   the soil's drainage recharges a linear store G (mm) that
//                empties over TAU_G months (the lower zone of HBV and its kin,
//                standard; τ synthesis), and its outflow is the baseflow the
//                rivers carry, so a river runs on through a dry season (with
//                the drainage straight to the rivers, rivers' months swung by a
//                median 750× on the opening planet, against Earth's large
//                rivers' 3–30×, from memory). Exact over a month for the
//                month's recharge; it doesn't feed back on the soil, so its
//                periodic state is solved after the soil's, in closed form.
//   the aquifer   (batch 4c; synthesis) beneath it, a slow linear store A (mm)
//                that F_AQ of the groundwater's outflow recharges and that
//                empties to the rivers (their baseflow, and so the lakes) over
//                TAU_A years: deep groundwater's ages run from centuries to tens
//                of millennia (from memory). Stepped exactly once a climate
//                cycle over the years since the last (`aquiferStep`, its water
//                kept: what came in is what it holds more, what flowed out and
//                what was drawn), at its balance until the climate has settled,
//                so the opening has no fossil water (the Sahara's). Its outflow
//                reaches the rivers evenly over the months. The people's wells
//                draw it (`draw`, mm/yr), never below empty: past that they
//                take its recharge as it comes. The live year's months pass its
//                share through (its centuries don't show within a year).
//   the month     backward Euler with the fluxes at the month's end, so any
//                 month is stable: S_max w + Lᵢ(w⁴ − 1) + E_p β(w) + D w⁴ = S₀.
//                 Split at w = 0.75 it is a w + c w⁴ = d on each side, convex,
//                 solved by Newton from the right (monotone). The new S is
//                 the old plus the fluxes, so water is kept exactly.
//   the snowpack  the days of a month spread normally about its mean (5 K,
//                 Reeh's scheme as in ice.js, standard): the share of days
//                 below freezing falls as snow, and the pack melts by
//                 positive degree days at 3 mm/°C/day. Snow cover (half at
//                 20 mm) shuts off the soil's evaporation; the pack doesn't
//                 sublimate. Past 1,000 mm the pack is the ice's: the excess
//                 runs off (perennial snow has no periodic state otherwise,
//                 and that loss was the whole of a −50% bias in cold climates).
//   potential evaporation  PET = 55/12 · max(0, T + 4) mm a month: the
//                 climate's Budyko PET (55 (T̄ + 4) mm a year, src/engine/
//                 climate.js) taken month by month. Over 810 synthetic
//                 climates the periodic year's runoff is
//                 0.3% below the climate's Budyko runoff in all (6% mean
//                 error); on the opening planet's land too, but 24% below in
//                 its permafrost, where Budyko's PET has its floor (30 mm a
//                 year below a mean of −3.5 °C) and the summer months here
//                 evaporate more.
//   ground heat   (synthesis) one store near the permafrost table, relaxing
//                 toward the air over τ = τ₀ (1 + d/d*). τ₀ = 2 months damps
//                 the ground's annual swing to ~0.7 of the air's, as at about a
//                 metre, and stands in for the latent heat of its water too
//                 (there's no zero curtain as such). Snow of depth d (SWE at
//                 300 kg/m³) is a resistance in series with the ground's own:
//                 d* = 0.1 m of snow insulates as much as a metre of soil
//                 (λ ≈ 0.13 for such snow by Sturm's fit, against ~1.5 W/m/K;
//                 from memory). Snow lies in winter, so it keeps the winter's
//                 cold out, and the ground's mean runs warmer than the air's
//                 (the nival offset: ~+1.4 K under a 0.3 m pack, +3.6 K under
//                 1.3 m, at a mean of −2 °C and a 15 K season). Without snow the
//                 ground's mean is the air's. Permafrost is where the ground's
//                 annual mean stays below 0 °C, and its share of a cell is a
//                 logistic of the cell's mean over PERMA_W = 1 K (synthesis):
//                 the spread of the ground's mean within a cell (slope, snow
//                 drifts, peat, water), σ ≈ 1.7 K by the zones' σ/1.7, so the
//                 share runs from 0.9 to 0.1 over 4.4 K of the cell's mean.
//                 Earth's zones by that share (continuous over 90%,
//                 discontinuous 50–90, sporadic 10–50, isolated under 10) hold
//                 ~47/19/17/17% of its permafrost region (Brown and others'
//                 map, from memory); 1 K gives the opening planet 43/18/19/20,
//                 0.5 K gave 63/13/12/13. Nothing reads the share but the
//                 drawing (the month's frozen ground is its own). The soil's
//                 surface lies between the air and the store, nearer the store
//                 under deep snow (the same resistances); frozen there (ramped
//                 over 1 K) it sheds half the month's rain and melt as quick
//                 flow, and frozen ground below doesn't drain at all.
//
import { shared } from './shared.js';

/** Groundwater over a month: the store at its end, from its start and the month's recharge (both mm); the outflow is g0 + rch − end. */
export function groundwater(g0, rch) {
  const a = Math.exp(-1 / SOIL.TAU_G);
  return g0 * a + rch * SOIL.TAU_G * (1 - a);
}

/**
 * The aquifer over `yrs` years (exact): dA/dt = r − w − A/τ, r its recharge and w a draw (mm/yr), never
 * below empty (from then the draw takes the recharge as it comes). Into `o`: the store at the end (A),
 * the water that flowed out to the rivers (out) and was drawn (drawn), mm over the span, so
 * A0 + r yrs = A + out + drawn.
 */
export function aquifer(A0, r, w, yrs, tau = SOIL.TAU_A, o = {}) {
  const As = tau * (r - w);
  let t0 = yrs;
  if (As < 0) t0 = Math.min(yrs, tau * Math.log1p(A0 / -As));   // when it runs dry
  const A = Math.max(0, As + (A0 - As) * Math.exp(-t0 / tau));
  o.A = t0 < yrs ? 0 : A;
  o.drawn = w * t0 + Math.min(w, r) * (yrs - t0);
  o.out = A0 + r * yrs - o.A - o.drawn;
  return o;
}

// Water in mm, temperature in °C, time in months (12 equal months a year).
// Forcing and monthly outputs are laid out 12 per cell, January first
// (index 12 i + m), as the climate's runoffM. A cell with S_max ≤ 0 is sea.

export const SOIL = {
  SMAX: 150,          // mm, the default capacity (the regolith will set it)
  FC: 0.75,           // evaporation at the potential above this share of capacity (Manabe's)
  KD: 0.4,            // per month: drainage at saturation, as a share of capacity
  SIGMA: 5,           // K, the spread of days about a month's mean (as ice.js)
  DDF: 3,             // mm of melt per positive degree-day
  WMAX: 1000,         // mm SWE: past it the pack is the ice's, and runs off
  COVER: 20,          // mm SWE at which half the ground is under snow
  TAU: 2,             // months, the ground's time constant under bare ground
  DSTAR: 0.1,         // m of snow insulating as much as the ground's own metre
  RHO_SNOW: 300,      // kg/m³
  FROZEN: 0.5,        // share of rain and melt that runs off a frozen surface
  TAU_G: 4,           // months: groundwater's time constant (synthesis)
  F_AQ: 0.2, TAU_A: 1000,   // the aquifer: its share of groundwater's outflow, and its time constant in years (speculation)
  PET_K: 55 / 12,     // PET = PET_K · max(0, T + PET_T0), mm a month (the climate's Budyko PET by the month)
  PET_T0: 4,
  PERMA_W: 1.0,       // K, the width of permafrost's logistic in the ground's mean: the spread of the ground's mean within a cell (see above)
  NEWTON: 6,          // iterations a month at most (four reach 1e-8 of capacity from the bound; warm from the year before, two)
};

const DAYS = 30.44;
const phiN = x => Math.exp(-0.5 * x * x) * 0.3989422804014327;
// Φ by Abramowitz and Stegun 26.2.17 (as ice.js).
function PhiN(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = phiN(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - d : d;
}

/** The rivers' baseflow in month k (12 i + m, mm): the groundwater's outflow `base` less the aquifer's recharge, and the aquifer's (A) outflow. */
export const riverBase = (base, A, k, C = SOIL) => (1 - C.F_AQ) * base[k] + A[(k / 12) | 0] / C.TAU_A / 12;

/** Potential evaporation (mm a month) from monthly temperatures (°C), element by element. */
export function potentialEvaporation(T, out = new Float32Array(T.length)) {
  for (let k = 0; k < T.length; k++) out[k] = SOIL.PET_K * Math.max(0, T[k] + SOIL.PET_T0);
  return out;
}

/**
 * The root of a w + c w⁴ = d in [0, hi] (a > 0, c ≥ 0), by Newton: from the least of hi, d/a
 * and (d/c)^¼, each of which bounds it from above, or from `guess` below that (the function is
 * convex and rising, so a start below the root lands above it in a step, and from above Newton
 * falls monotonically), until a step is under 1e-12 of w (quadratic: the next would be below
 * round-off) or `iters` steps.
 */
function root4(a, c, d, hi, iters, guess) {
  if (d <= 0) return 0;
  let w = Math.min(hi, d / a);
  if (c > 0) w = Math.min(w, Math.sqrt(Math.sqrt(d / c)));
  if (guess > 0 && guess < w) w = guess;
  for (let k = 0; k < iters; k++) {
    const w3 = w * w * w, dw = (a * w + c * w3 * w - d) / (a + 4 * c * w3);
    w -= dw;
    if (Math.abs(dw) <= 1e-12 * w) break;
  }
  return Math.max(0, w);
}

// One month of one cell. The results land in R: quick, base, E, S, SWE, Tg, the ground's
// decay factor over the month (Tg's sensitivity to its start), the pack's excess, and the
// bucket's root w (a guess for the same month a year on).
const R = new Float64Array(9);
function month(S0, W0, G0, smax, T, p, pet) {
  const C = SOIL;
  // The snowpack: snow on the month's freezing days, melt by its positive degree-days.
  const x = T / C.SIGMA, below = PhiN(-x);
  const snow = p * below;
  monthOf(S0, W0, G0, smax, T, pet, snow, p - snow, DAYS * (C.SIGMA * phiN(x) + T * (1 - below)), -1);
}
/** A month with its snow, rain and positive degree-days given (they read only the month's forcing). */
function monthOf(S0, W0, G0, smax, T, pet, snow, rain, pdd, guess) {
  const C = SOIL;
  // Water past the capacity (it was cut since: the regolith thinned) runs off this month.
  const over = Math.max(0, S0 - smax);
  S0 -= over;
  let W = W0 + snow;
  const melt = Math.min(W, C.DDF * pdd);
  W -= melt;
  const ice = Math.max(0, W - C.WMAX);
  W -= ice;
  const L = rain + melt;
  // The ground's heat: toward the air, slower under snow; the soil's surface lies between
  // the two, nearer the ground the deeper the snow (the same resistances in series).
  const Wm = 0.5 * (W0 + W), ins = 1 + Wm / C.RHO_SNOW / C.DSTAR;
  const decay = Math.exp(-1 / (C.TAU * ins));
  const G = T + (G0 - T) * decay, Gm = 0.5 * (G0 + G), Ts = Gm + (T - Gm) / ins;
  // The bucket. A frozen surface sheds part of the input, frozen ground below doesn't
  // drain (a perched table, so permafrost's soils stay wet), and snow cover stops evaporation.
  const fz = C.FROZEN * Math.min(1, Math.max(0, -Ts)), thaw = 1 - Math.min(1, Math.max(0, -Gm));
  const Li = L * (1 - fz), ep = pet * (1 - Wm / (Wm + C.COVER));
  const kd = C.KD * smax * thaw, c = Li + kd;
  // β = 1 above FC (a = S_max, d = S₀ + Lᵢ − E_p); below it β = w/FC (a = S_max + E_p/FC, d = S₀ + Lᵢ).
  const d1 = S0 + Li - ep, FC = C.FC, FC2 = FC * FC;
  let w;
  if (smax * FC + c * FC2 * FC2 <= d1) w = root4(smax, c, d1, 1, C.NEWTON, guess);
  else w = root4(smax + ep / FC, c, S0 + Li, FC, C.NEWTON, guess);
  const w4 = w * w * w * w;
  let quick = over + ice + L * fz + Li * w4, base = kd * w4, E = ep * Math.min(1, w / C.FC);
  // The store from the fluxes, so water is kept exactly; any residual of the solve goes to its bounds.
  let S = S0 + Li - Li * w4 - base - E;
  if (S < 0) { E += S; S = 0; if (E < 0) { base += E; E = 0; } }
  else if (S > smax) { quick += S - smax; S = smax; }
  R[0] = quick; R[1] = base; R[2] = E; R[3] = S; R[4] = W; R[5] = G; R[6] = decay; R[7] = ice; R[8] = w;
}

/** The ground's periodic year on cells [a, b) (Soil.equilibrium on the soil `x.soil`'s arrays): the engine's pool's kernel. */
export function soilYearCells(x, a, b) {
  const s = Object.assign(Object.create(Soil.prototype), x.soil);
  return s.equilibrium(x.T, x.P, x.PET, { cold: x.cold, from: a, to: b });
}

export class Soil {
  /** `n` cells; `Smax` (mm) a number or an array, ≤ 0 where there's no land. */
  constructor(n, Smax = SOIL.SMAX) {
    this.n = n;
    // Shared with the engine's pool, which steps the periodic year (src/engine/kernels.js, soilYear).
    this.Smax = shared(Float32Array, n);
    this.S = shared(Float64Array, n);          // soil water, mm
    this.SWE = shared(Float64Array, n);        // snowpack, mm of water
    this.Tg = shared(Float64Array, n);         // the ground's temperature, °C
    this.G = shared(Float64Array, n);          // groundwater, mm
    // The aquifer (`aquiferStep`): its store (mm), its recharge (mm/yr), the people's wells' draw (mm/yr; null without them).
    this.A = shared(Float64Array, n); this.Ar = new Float32Array(n); this.draw = null; this.aqOpen = true;
    const m12 = () => shared(Float32Array, 12 * n);
    // By month (12 i + m), the month's totals (mm: base is groundwater's outflow) and its end state.
    this.out = { quick: m12(), base: m12(), evap: m12(), S: m12(), SWE: m12(), Tg: m12(), G: m12() };
    // The last twelve months' aggregates.
    this.runoff = shared(Float32Array, n);     // mm a year, quick and base
    this.evap = shared(Float32Array, n);       // mm a year
    this.wet = shared(Float32Array, n);        // mean S/S_max: the climate's land wetness
    this.beta = shared(Float32Array, n);       // mean evaporative efficiency, β × the snow-free share
    this.tgMean = shared(Float32Array, n);     // the ground's annual mean, °C
    this.permafrost = shared(Float32Array, n); // soft: 1 where the ground's mean is well below 0 °C
    this.setCapacity(Smax);
    for (let i = 0; i < n; i++) this.S[i] = 0.5 * this.Smax[i];
  }

  /** Its arrays and n: what the engine's pool's threads rebuild it from (src/engine/kernels.js, soilYear). */
  arrays() {
    const { n, Smax, S, SWE, Tg, G, out, runoff, evap, wet, beta, tgMean, permafrost } = this;
    return { n, Smax, S, SWE, Tg, G, out, runoff, evap, wet, beta, tgMean, permafrost };
  }

  /** The capacity (mm). Water past a cut one stays until the next month, which runs it off (as on the GPU). */
  setCapacity(Smax) {
    if (typeof Smax === 'number') this.Smax.fill(Smax); else this.Smax.set(Smax);
  }

  /**
   * Step every land cell through calendar month m (0 = January). T (°C), P and PET (mm a
   * month) are 12 per cell. The anomaly (optional, per cell): dT (K) adds to T and moves PET
   * by its slope; rf scales the rain.
   */
  stepMonth(m, T, P, PET, dT = null, rf = null) {
    const n = this.n, o = this.out, k0 = SOIL.PET_K;
    for (let i = 0; i < n; i++) {
      const smax = this.Smax[i];
      if (!(smax > 0)) continue;
      const k = 12 * i + m;
      let t = T[k], p = P[k], pet = PET[k];
      if (dT) { const tt = t + dT[i]; pet = Math.max(0, pet + k0 * (Math.max(0, tt + SOIL.PET_T0) - Math.max(0, t + SOIL.PET_T0))); t = tt; }
      if (rf) p *= rf[i];
      month(this.S[i], this.SWE[i], this.Tg[i], smax, t, p, pet);
      const g0 = this.G[i], g1 = groundwater(g0, R[1]);
      o.quick[k] = R[0]; o.base[k] = g0 + R[1] - g1; o.evap[k] = R[2]; o.S[k] = R[3]; o.SWE[k] = R[4]; o.Tg[k] = R[5]; o.G[k] = g1;
      this.S[i] = R[3]; this.SWE[i] = R[4]; this.Tg[i] = R[5]; this.G[i] = g1;
    }
  }

  /**
   * The periodic year under a 12-month forcing (the closure at fast dials), from the
   * current state (warm) or a fresh one (`cold`). Each cell runs its own years until
   * January's state repeats within `tol` (mm; 0.01 K for the ground): the ground's
   * periodic state is solved exactly each year (it is linear in its start, given the
   * snow), perennial snow jumps to the cap, and the soil's by safeguarded secant steps.
   * Leaves the state at January 1 and the last year's months in `out`. Cells `from` to
   * `to` only, if given (a climate cycle can slice the work). Returns the years taken (a
   * warm start that has nothing to do takes one).
   */
  equilibrium(T, P, PET, { tol = 0.05, maxYears = 30, cold = false, from = 0, to = this.n } = {}) {
    const o = this.out, C = SOIL, snowM = new Float64Array(12), rainM = new Float64Array(12), pddM = new Float64Array(12), wM = new Float64Array(12);
    let years = 0, worst = 0, cells = 0, unconverged = 0;
    for (let i = from; i < to; i++) {
      const smax = this.Smax[i];
      if (!(smax > 0)) continue;
      const b = 12 * i;
      let S = this.S[i], W = this.SWE[i], G = this.Tg[i];
      if (cold) {
        let t = 0;
        for (let m = 0; m < 12; m++) t += T[b + m] / 12;
        S = 0.5 * smax; W = 0; G = t;
      }
      // The snow doesn't read the ground or the soil, nor the ground the soil: once the snow
      // and the ground repeat, S's year is a monotone map of [0, S_max] into itself, whose
      // fixed point is found by secant steps inside a bracket that each year tightens.
      // The months' snow, rain and degree-days, the same every year.
      for (let m = 0; m < 12; m++) {
        const t = T[b + m], p = P[b + m], x = t / C.SIGMA, below = PhiN(-x);
        snowM[m] = p * below; rainM[m] = p - snowM[m]; pddM[m] = DAYS * (C.SIGMA * phiN(x) + t * (1 - below)); wM[m] = -1;
      }
      let lo = 0, hi = smax, xPrev = NaN, gPrev = 0, y = 0, done = false;
      while (y < maxYears) {
        const S0 = S, W0 = W, G0 = G;
        let a = 1, wmin = Infinity, capped = false;
        for (let m = 0; m < 12; m++) {
          const k = b + m;
          monthOf(S, W, G, smax, T[k], PET[k], snowM[m], rainM[m], pddM[m], wM[m]);
          wM[m] = R[8];
          o.quick[k] = R[0]; o.base[k] = R[1]; o.evap[k] = R[2]; o.S[k] = R[3]; o.SWE[k] = R[4]; o.Tg[k] = R[5];
          S = R[3]; W = R[4]; G = R[5]; a *= R[6];
          if (W < wmin) wmin = W;
          if (R[7] > 0) capped = true;
        }
        y++;
        // The ground's periodic state given the year's snow, exactly (it is linear in its start).
        const Gp = a < 1 ? (G - a * G0) / (1 - a) : G, snowSet = Math.abs(W - W0) < tol;
        const g = S - S0, settled = snowSet && Math.abs(Gp - G0) < 0.01;
        if (settled && Math.abs(g) < tol) { done = true; break; }
        G = Gp;
        if (!snowSet && wmin > 0 && !capped) {
          // A pack that neither melts out nor reaches the cap changes alike every year (its
          // melt is the degree-days' whatever its depth): growing, its periodic state is at the
          // cap; shrinking, it is the year shifted down until its least month melts out.
          if (W > W0) W = Math.max(W, C.WMAX); else W -= wmin;
        }
        // The map is monotone, so its image bounds the fixed point on the same side. While the
        // snow or the ground still move, the map moves too: S carries on from where the year
        // left it, and the bracket starts afresh.
        if (settled) { if (g > 0) lo = Math.max(lo, S); else hi = Math.min(hi, S); }
        if (!settled || lo >= hi) { lo = 0; hi = smax; xPrev = NaN; continue; }
        let next = S;
        if (xPrev === xPrev && g !== gPrev) {
          next = S0 - g * (S0 - xPrev) / (g - gPrev);
          if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
        }
        xPrev = S0; gPrev = g; S = next;
      }
      this.S[i] = S; this.SWE[i] = W; this.Tg[i] = G;
      // Groundwater's periodic year under the year's recharge (the soil's drainage, in o.base so
      // far), in closed form: G₁₂ = a¹² G₀ + Σ, so G₀ = Σ / (1 − a¹²); then its outflow by month.
      const a = Math.exp(-1 / C.TAU_G), a12 = a ** 12;
      let g = 0;
      for (let m = 0; m < 12; m++) g = groundwater(g, o.base[b + m]);
      g /= 1 - a12;
      this.G[i] = g;
      for (let m = 0; m < 12; m++) { const k = b + m, g1 = groundwater(g, o.base[k]); o.base[k] = g + o.base[k] - g1; o.G[k] = g1; g = g1; }
      years += y; worst = Math.max(worst, y); cells++;
      if (!done) unconverged++;
    }
    this.aggregate(from, to);
    return { cells, meanYears: cells ? years / cells : 0, maxYears: worst, unconverged };
  }

  /**
   * The aquifer over `yrs` years since the last (Infinity: at its balance), after the periodic year:
   * F_AQ of the groundwater's outflow (`out.base`) recharges it, and the rest and the aquifer's own
   * outflow at its new store (A/TAU_A, evenly by the month) are the rivers' baseflow (`riverBase`; the
   * ground's own year is left as it is, so the live year takes over from it without a step).
   * Returns the water's account over the span (mm summed over cells, for the oracle): recharged, out, drawn, held.
   */
  aquiferStep(yrs) {
    const o = this.out, C = SOIL, n = this.n, st = { A: 0, out: 0, drawn: 0 }, acc = { r: 0, out: 0, drawn: 0, dA: 0 };
    for (let i = 0; i < n; i++) {
      if (!(this.Smax[i] > 0)) { this.A[i] = 0; this.Ar[i] = 0; continue; }
      const b = 12 * i;
      let g = 0;
      for (let m = 0; m < 12; m++) g += o.base[b + m];
      const r = C.F_AQ * g, w = this.draw ? Math.max(0, this.draw[i]) : 0, A0 = this.A[i];
      this.Ar[i] = r;
      if (yrs === Infinity) this.A[i] = Math.max(0, C.TAU_A * (r - w));
      else {
        aquifer(A0, r, w, yrs, C.TAU_A, st);
        this.A[i] = st.A;
        acc.r += r * yrs; acc.out += st.out; acc.drawn += st.drawn; acc.dA += st.A - A0;
      }
    }
    return acc;
  }

  /** Copy the state at the start of calendar month m from the periodic year in `out`. */
  stateAt(m) {
    const o = this.out, p = (m + 11) % 12;
    for (let i = 0; i < this.n; i++) {
      if (!(this.Smax[i] > 0)) continue;
      const k = 12 * i + p;
      this.S[i] = o.S[k]; this.SWE[i] = o.SWE[k]; this.Tg[i] = o.Tg[k]; this.G[i] = o.G[k];
    }
  }

  /** The aggregates over the twelve months in `out` (cells `from` to `to`). */
  aggregate(from = 0, to = this.n) {
    const o = this.out, C = SOIL;
    for (let i = from; i < to; i++) {
      const smax = this.Smax[i];
      if (!(smax > 0)) { this.runoff[i] = this.evap[i] = this.wet[i] = this.beta[i] = this.tgMean[i] = this.permafrost[i] = 0; continue; }
      let r = 0, e = 0, w = 0, be = 0, g = 0;
      for (let m = 0; m < 12; m++) {
        const k = 12 * i + m, wm = o.S[k] / smax, sw = o.SWE[k];
        r += o.quick[k] + o.base[k]; e += o.evap[k]; w += wm; g += o.Tg[k];
        be += Math.min(1, wm / C.FC) * (1 - sw / (sw + C.COVER));
      }
      this.runoff[i] = r; this.evap[i] = e; this.wet[i] = w / 12; this.beta[i] = be / 12; this.tgMean[i] = g / 12;
      this.permafrost[i] = 1 / (1 + Math.exp(g / 12 / C.PERMA_W));
    }
  }
}
