// Vegetation as state (docs/MODEL.md): cover that lags its climate,
// and a land carbon store that trades with the air.
//
//   cover        per land cell, trees f_t and grass f_g, bare ground the rest
//                (after Brovkin's VECODE: synthesis). The equilibrium is
//                VECODE's: the tree fraction
//                  f̂ = f_max (1 − e^{c(G₀−G_min)}) Pᵃ / (Pᵃ + a_for (G₀−G_min)² e^{b(G₀−G_min)}),
//                the vegetated fraction v̂ = 1 − 1/(1 + a_des (P − P_min)² e^{b′(G₀−G_min)})
//                above P_min = P₀ e^{b₂(G₀−G_min)}, grass ĝ = v̂ − f̂, from
//                growing degree days above 0 °C (G₀) and the year's rain P
//                (the forms, f_max, G_min and P₀ checked against Goosse and
//                others' LOVECLIM 1.2 description, sec. 2.3 and Table 3; its
//                other constants aren't given there, so a, a_for, b, a_des,
//                b′ and b₂ are fitted here to limit climates, with VECODE's
//                one b split in two). Two additions (synthesis): a cold limit
//                1 − e^{−G₀/G_cold}, so polar deserts stay bare, and soil
//                water, when given, scales the rain the plants see.
//   dynamics     the vegetated share v relaxes toward v̂ over years, and the
//                trees' share of it, s, toward f̂/v̂ over centuries, so trees
//                f_t = v s take their room out of the grass f_g = v (1 − s)
//                (VECODE's competition, linearized) and die back with the
//                vegetated share when it dries. Each is exact,
//                x += (x̂ − x)(1 − e^{−dt/τ}), so a step costs the same from a
//                year to a Myr, and past τ the cover is its climate's (the
//                closure). Grass arrives in years after the ice goes; the
//                forest takes centuries to displace it.
//   carbon       trees' C_t, grass's C_g and soil's C_s per m² of cell. NPP
//                from Lieth's Miami model (standard; its constants checked
//                against Adams and others 2004, Table B.3) on each cover,
//                times 1 + β ln(CO₂/280) (β from VECODE's table); litter
//                C_t/τ_wood + C_g/τ_herb; soil respiration C_s/τ_s, τ_s by a
//                Q10 of 2 (standard). With the climate fixed between its
//                cycles, v s is four exponentials in time, so the chain is
//                solved exactly over any step (sums of exponentials): one
//                step of a kyr is a thousand steps of a year, and
//                NPP − respiration = ΔC holds to rounding.
//   feedbacks    albedo: VECODE's surface albedos (trees 0.13, grass 0.20,
//                bare 0.33, checked), carried into the climate's planetary
//                albedo at half their contrast (the ratio climate.js's zone
//                constants already use); under snow, trees mask it (snowy
//                forest ≤ 0.30, after Moody and others via Paiewonsky and
//                Elison Timm's SEDGES table; open snow 0.75): the boreal
//                forest's feedback (standard). Transpiration: a factor on land
//                evaporation by cover and soil water (Manabe's bucket below
//                75% of capacity, standard, from memory; trees' deeper
//                roots, synthesis). Weathering: bare ground weathers at a
//                quarter of forest's (GEOCARB's pre-plant factor, from
//                memory). Dust: the bare share. Colours for the Relief view,
//                by cover and warmth.
//   fire and     (synthesis) disturbance holds the trees below their climate's
//   browsing     share: f̂/v̂ × (1 − D), D = 1 − (1 − F)(1 − B). Fire F =
//                FIRE_MAX × fuel × dry season: it spreads where grass is
//                continuous (a logistic of the cell's grass about G_FUEL; the
//                percolation threshold Staver and others 2011 found was ~40%,
//                from memory, and G_FUEL sits above it, since the cover's own
//                equilibrium was fitted to biomes fire shaped) and burns where
//                the year has a warm dry season (a soft count of months under
//                P_DRY and above T_DRY, about D_FIRE months). Browsing B =
//                B_MAX × the herds' forage (grass about G_GRAZE) × rain below
//                P_BROWSE (they thin in wet forest): herbivores and fire hold
//                savannas open above ~650 mm (Sankaran and others 2005, Nature
//                438, 846). Both read the grass already there, so a grassy
//                cell burns and stays open and a closed forest doesn't:
//                savanna and forest can each hold under one climate.
//   bistability  (speculation) where rain follows cover (recycling), a dry
//                margin can hold green or desert under one forcing, as in
//                Claussen's green Sahara; the tests show a toy cell carrying
//                it, with hysteresis. Whether the planet does is open.
//
// Units: years, °C, mm of rain a year, degree-days, kg C per m² of cell;
// totals in Pg C, fluxes in Pg C/yr (positive to the air). The state lives
// in the mantle's frame, as the ice does: plates move a cell's width in Myr,
// and the cover re-makes itself in centuries.

import { shared } from './shared.js';
export const VEG = {
  F_MAX: 0.95, G_MIN: 800,          // VECODE: the most trees can cover; degree-days (above 0 °C) trees need
  G_TREE: 400,                      // degree-days past G_MIN over which trees reach F_MAX (c = −1/G_TREE)
  P_FOR: 250, X_FOR: 500,           // mm/yr at which trees cover half their room, at G₀ − G_MIN = X_FOR …
  A_FOR: 5.27, B_FOR: 1.26e-4,      // … rising as (x/X_FOR)^{2/a} e^{b x/a}: VECODE's form, fitted
  P0: 28, B2: 1.67e-4,              // VECODE's P₀ (mm/yr), and P_min's rise with warmth (fitted)
  A_DES: 1.93e-4, B_DES: -2.1e-4,   // v̂ = 1 − 1/(1 + A_DES (P − P_min)² e^{B_DES x}) (fitted)
  G_COLD: 150,                      // degree-days: the cold limit of any cover (synthesis)
  T_HOT: [38, 46],                  // °C, annual mean: the heat limit of any cover, full to none (synthesis: the hottest biomes' annual means are ~30 °C, and leaves fail past ~45–50 °C, from memory; on a runaway planet)
  TAU_TREE: 200, TAU_GRASS: 3,      // yr: cover's relaxation
  SIGMA: 4,                         // K: days' spread about a month's mean, for degree-days
  // Carbon
  BETA: 0.25, CO2_0: 280,           // VECODE: NPP × (1 + β ln(CO₂/CO₂₀))
  TAU_WOOD: 15, TAU_HERB: 1.5,      // yr: carbon's residence in trees and in grass
  TAU_SOIL: 30, T_SOIL: 10, Q10: 2, // yr at T_SOIL °C, and its Q10
  TAU_SOIL_MAX: 5000,
  // Feedbacks
  ALB_TREE: 0.13, ALB_GRASS: 0.20, ALB_BARE: 0.33,   // VECODE's surface albedos
  ALB_SNOW_TREE: 0.30, ALB_SNOW_OPEN: 0.75,          // snow under trees (masked) and in the open
  PLANETARY: 0.55,                  // share of a surface contrast the climate's planetary albedo sees (tuned on today's Earth: tools/earth/)
  E_BARE: 0.4, E_TREE: 1.2, S_CRIT: 0.75,            // evaporation by cover against grass's; the bucket's knee
  W_BARE: 0.25, W_GRASS: 0.5,       // weathering: bare against forest; grass's share of forest's gain
  // Fire and browsing (synthesis)
  FIRE_MAX: 0.65, G_FUEL: 0.5, W_FUEL: 0.04,   // fire's most, and the grass (share of the cell) about which it spreads
  P_DRY: 50, W_DRY: 15,             // mm a month under which a month is dry (soft)
  T_DRY: 5, W_TDRY: 2,              // °C above which a dry month burns (a frozen one doesn't)
  D_FIRE: 4, W_DFIRE: 0.75,         // warm dry months about which a year burns
  B_MAX: 0.2, G_GRAZE: 0.4, W_GRAZE: 0.1,  // browsing's most, and the grass about which the herds live
  FUEL_MEGA: 0.5,                   // fire's rise where the large herbivores are gone (their uneaten grass is fuel; synthesis)
  P_BROWSE: 1000, W_BROWSE: 200,    // mm/yr above which the herds thin
};

const R_M = 6.371e6, MONTH_DAYS = 30.44;
const phiN = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
// Φ by Abramowitz and Stegun 26.2.17 (as ice.js).
function PhiN(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = phiN(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - d : d;
}
const sigmoid = x => 1 / (1 + Math.exp(-x));

/** Growing degree-days above `base` from twelve monthly means (°C), the days spread normally by sigma. */
export function gdd(tm, base = 0, sigma = VEG.SIGMA) {
  let s = 0;
  for (let m = 0; m < 12; m++) {
    const mu = tm[m] - base;
    s += sigma > 0 ? sigma * phiN(mu / sigma) + mu * PhiN(mu / sigma) : Math.max(0, mu);
  }
  return MONTH_DAYS * s;
}

/** Lieth's Miami model: NPP in g of dry matter per m² a year, the lesser of temperature's and rain's limits. */
export function miami(T, P) {
  return Math.min(3000 / (1 + Math.exp(1.315 - 0.119 * T)), 3000 * (1 - Math.exp(-0.000664 * Math.max(0, P))));
}

/** NPP per m² of vegetation, kg C a year (dry matter 45% carbon), with CO₂ fertilization. */
export function npp(T, P, co2 = VEG.CO2_0) {
  return 0.45e-3 * miami(T, P) * Math.max(0, 1 + VEG.BETA * Math.log(co2 / VEG.CO2_0));
}

/**
 * Equilibrium cover at G₀ degree-days and P mm a year (soil, if given, the
 * growing season's share of capacity, scales the rain the plants see by
 * 0.5 + soil). Writes [f̂ trees, v̂ all vegetation] into out.
 */
export function equilibrium(G0, P, soil = -1, out = [0, 0]) {
  const V = VEG, x = G0 - V.G_MIN;
  if (soil >= 0) P *= 0.5 + Math.min(1, soil);
  const cold = 1 - Math.exp(-Math.max(0, G0) / V.G_COLD);
  const pmin = V.P0 * Math.exp(V.B2 * x);
  let v = 0;
  if (P > pmin) {
    const d = P - pmin;
    v = cold * (1 - 1 / (1 + V.A_DES * d * d * Math.exp(V.B_DES * x)));
  }
  let f = 0;
  if (x > 0 && P > 0) {
    const ph = V.P_FOR * Math.pow(x / V.X_FOR, 2 / V.A_FOR) * Math.exp(V.B_FOR * x / V.A_FOR);
    f = V.F_MAX * (1 - Math.exp(-x / V.G_TREE)) / (1 + Math.pow(ph / P, V.A_FOR));
  }
  out[0] = Math.min(f, v); out[1] = v;
  return out;
}

/** Warm dry months in a year of twelve monthly rains (mm) and means (°C), soft: each month under P_DRY and above T_DRY counts. */
export function dryMonths(p12, t12, o = 0) {
  const V = VEG;
  let d = 0;
  for (let m = 0; m < 12; m++) d += sigmoid((V.P_DRY - p12[o + m]) / V.W_DRY) * sigmoid((t12[o + m] - V.T_DRY) / V.W_TDRY);
  return d;
}

/**
 * Disturbance D (0–1): the share of their climate's room fire and browsing keep trees out of, in
 * a cell with grass share g (of the cell), dry months dry and P mm of rain a year, and the large
 * herbivores' share left (`mega`: people hunt them, src/engine/people.js): fewer browse, and the
 * grass they'd have eaten burns (after Gill and others 2009's pollen and dung-fungus records, from memory).
 */
export function disturbance(g, dry, P, mega = 1) {
  const V = VEG;
  const F = Math.min(0.95, V.FIRE_MAX * sigmoid((g - V.G_FUEL) / V.W_FUEL) * sigmoid((dry - V.D_FIRE) / V.W_DFIRE) * (1 + V.FUEL_MEGA * (1 - mega)));
  const B = V.B_MAX * mega * sigmoid((g - V.G_GRAZE) / V.W_GRAZE) * sigmoid((V.P_BROWSE - P) / V.W_BROWSE);
  return 1 - (1 - F) * (1 - B);
}

/**
 * Land's planetary albedo with cover (f_t, f_g) and a snow share, in the
 * climate's terms: base is its snow-free land albedo for grass (ALB_LAND plus
 * the polar term), snowAlb its snow (ALB_SNOW). Trees mask the snow.
 */
export function landAlbedo(ft, fg, snow, base = 0.27, snowAlb = 0.62) {
  const V = VEG, k = V.PLANETARY;
  const open = base + k * (V.ALB_TREE * ft + V.ALB_GRASS * fg + V.ALB_BARE * (1 - ft - fg) - V.ALB_GRASS);
  const snowy = snowAlb - k * (V.ALB_SNOW_OPEN - V.ALB_SNOW_TREE) * ft;
  return open + (snowy - open) * snow;
}

/** Land evaporation's factor by cover and soil water (share of capacity; 1 when unknown): 1 for grass on wet soil. */
export function transpiration(ft, fg, soil = 1) {
  const V = VEG, w = Math.min(1, Math.max(0, soil) / V.S_CRIT);
  return V.E_BARE * (1 - ft - fg) * Math.min(1, Math.max(0, soil)) + fg * w + V.E_TREE * ft * Math.sqrt(w);
}

/** Silicate weathering's factor by cover: 1 under full forest, W_BARE on bare rock. */
export function weathering(ft, fg) {
  return VEG.W_BARE + (1 - VEG.W_BARE) * (ft + VEG.W_GRASS * fg);
}

/** Dust's source: the bare share. */
export const dust = (ft, fg) => Math.max(0, 1 - ft - fg);

/** The Relief view's classes, eight weights a cell; ZONE_SLOT names each one's nearest class in globe.js's biome(). */
export const COLOURS = ['tropical forest', 'temperate forest', 'boreal forest', 'savanna', 'steppe', 'tundra', 'desert', 'rock'];
export const ZONE_SLOT = [0, 6, 9, 2, 5, 12, 4, -1];

/** Colour weights of cover (f_t, f_g) at annual mean T (°C) and G₀ degree-days, into out[o … o+7]. */
export function colourWeights(ft, fg, T, G0, out, o = 0) {
  const trop = sigmoid((T - 20) / 1.5), boreal = (1 - trop) * sigmoid((3 - T) / 2);
  const sav = sigmoid((T - 18) / 2), tundra = (1 - sav) * sigmoid((VEG.G_MIN - G0) / 150);
  const warm = sigmoid((T - 5) / 3), bare = Math.max(0, 1 - ft - fg);
  out[o] = ft * trop; out[o + 1] = ft * (1 - trop - boreal); out[o + 2] = ft * boreal;
  out[o + 3] = fg * sav; out[o + 4] = fg * (1 - sav - tundra); out[o + 5] = fg * tundra;
  out[o + 6] = bare * warm; out[o + 7] = bare * (1 - warm);
  return out;
}

// ∫₀ʰ e^{−kt} e^{−a(h−t)} dt = (e^{−kh} − e^{−ah})/(a − k), its limit h e^{−kh} where a ≈ k.
function phi(k, a, h, ek, ea) {
  const d = (a - k) * h;
  return Math.abs(d) < 1e-4 ? h * ek * (1 - d / 2 + d * d / 6) : (ek - ea) / (a - k);
}

export class Vegetation {
  /** n cells; area per cell on the unit sphere (sr), or equal areas. */
  constructor(n, area = null) {
    this.n = n;
    this.areaM = area ? Float64Array.from(area, a => a * R_M * R_M) : new Float64Array(n).fill(4 * Math.PI * R_M * R_M / n);
    // The state: v, the vegetated share, and s, the trees' share of it, so
    // trees f_t = v s and grass f_g = v (1 − s) stay in order. Each relaxes
    // exactly, so the cover's NPP is a sum of four exponentials in time and
    // the pools below are solved in closed form over any step.
    this.veg = new Float64Array(n);
    this.share = new Float64Array(n);
    this.ft = shared(Float32Array, n);       // trees, grass: shares of the cell (shared with the engine's pool)
    this.fg = shared(Float32Array, n);
    this.vEq = new Float64Array(n); this.sEq = new Float64Array(n);
    this.pi = new Float64Array(n);       // NPP per m² of vegetation, kg C/yr
    this.kS = new Float64Array(n).fill(1 / VEG.TAU_SOIL);   // soil respiration, 1/yr
    this.Ct = new Float64Array(n);       // carbon in trees, grass and soil, kg C/m² of cell
    this.Cg = new Float64Array(n);
    this.Cs = new Float64Array(n);
    this.temp = new Float32Array(n); this.gdd = new Float32Array(n);
    this.dist = new Float32Array(n);     // fire's and browsing's share of the trees' room kept open
    this.flux = { npp: 0, litter: 0, resp: 0, air: 0 };     // Pg C/yr over the last step
    this.climate = false;
  }

  /**
   * The climate the cover answers: per cell, land (1 where ice-free land),
   * gdd (degree-days above 0 °C), precip (mm/yr), temp (annual mean surface
   * °C), optional soil (growing season's share of capacity, 0–1); co2 (ppm).
   * Elsewhere the cover goes and its carbon respires to the air.
   */
  setClimate({ land, gdd, precip, temp, soil = null, dry = null, co2 = VEG.CO2_0 }) {
    const V = VEG, eq = [0, 0], lq = Math.log(V.Q10) / 10;
    for (let i = 0; i < this.n; i++) {
      const T = temp[i];
      this.temp[i] = T; this.gdd[i] = gdd[i];
      this.kS[i] = 1 / Math.min(V.TAU_SOIL_MAX, V.TAU_SOIL * Math.exp(lq * (V.T_SOIL - T)));
      if (!land[i]) { this.vEq[i] = 0; this.sEq[i] = 0; this.pi[i] = 0; this.dist[i] = 0; continue; }
      equilibrium(gdd[i], precip[i], soil ? soil[i] : -1, eq);
      const u = Math.min(1, Math.max(0, (T - V.T_HOT[0]) / (V.T_HOT[1] - V.T_HOT[0]))), hot = 1 - u * u * (3 - 2 * u);
      // Fire and browsing on the grass there now (a bare cell, new land, has none to burn).
      const D = dry ? disturbance(this.fg[i], dry[i], precip[i], this.mega ? this.mega[i] : 1) : 0;
      this.dist[i] = D;
      this.vEq[i] = hot * eq[1]; this.sEq[i] = eq[1] > 0 ? (1 - D) * eq[0] / eq[1] : 0;
      this.pi[i] = hot * npp(T, precip[i], co2);
    }
    this.climate = true;
  }

  /** Advance dt years, exactly: the cover, then carbon in trees, grass and soil. */
  step(dt) {
    if (!(dt > 0) || !this.climate) return this.flux;
    const V = VEG, n = this.n, h = dt;
    // Cover's modes: v(t) s(t) = Σ amplitudes × e^{−k t}, k ∈ {0, α, γ, α + γ}.
    const al = 1 / V.TAU_TREE, ga = 1 / V.TAU_GRASS, K = [0, al, ga, al + ga];
    const E = K.map(k => Math.exp(-k * h));
    const I = K.map((k, j) => (k > 0 ? (1 - E[j]) / k : h));            // ∫₀ʰ e^{−kt} dt
    // The pools' rates, kept clear of the cover's (the closed form divides by their gaps).
    const clear = a => (K.some(k => Math.abs(a - k) < 1e-6 * a) ? a * (1 + 1e-5) : a);
    const aW = clear(1 / V.TAU_WOOD), aH = clear(1 / V.TAU_HERB);
    const EW = Math.exp(-aW * h), EH = Math.exp(-aH * h);
    const pW = K.map((k, j) => phi(k, aW, h, E[j], EW)), pH = K.map((k, j) => phi(k, aH, h, E[j], EH));
    const dW = K.map(k => aW / (aW - k)), dH = K.map(k => aH / (aH - k));
    const FT = [0, 0, 0, 0], FG = [0, 0, 0, 0];
    let sN = 0, sL = 0, sR = 0;
    for (let i = 0; i < n; i++) {
      const v0 = this.veg[i], s0 = this.share[i], ve = this.vEq[i], se = this.sEq[i];
      const Dv = v0 - ve, Ds = s0 - se;
      const v1 = ve + Dv * E[2], s1 = se + Ds * E[1];
      this.veg[i] = v1; this.share[i] = s1;
      this.ft[i] = v1 * s1; this.fg[i] = v1 - v1 * s1;
      const Ct0 = this.Ct[i], Cg0 = this.Cg[i], Cs0 = this.Cs[i];
      if (v0 === 0 && ve === 0 && Ct0 === 0 && Cg0 === 0 && Cs0 === 0) continue;
      // NPP into trees and grass, per mode.
      const p = this.pi[i];
      FT[0] = p * ve * se; FT[1] = p * ve * Ds; FT[2] = p * Dv * se; FT[3] = p * Dv * Ds;
      FG[0] = p * ve - FT[0]; FG[1] = -FT[1]; FG[2] = p * Dv - FT[2]; FG[3] = -FT[3];
      // dC/dt = F(t) − a C: C(h) = C₀ e^{−ah} + Σ F_k φ(k, a); its litter a C(t) carries modes k and a.
      let Ct1 = Ct0 * EW, Cg1 = Cg0 * EH, mW = Ct0 * aW, mH = Cg0 * aH;
      const b = this.kS[i], Eb = Math.exp(-b * h);
      let Cs1 = Cs0 * Eb, N = 0;
      for (let j = 0; j < 4; j++) {
        Ct1 += FT[j] * pW[j]; Cg1 += FG[j] * pH[j];
        const lt = FT[j] * dW[j], lg = FG[j] * dH[j];          // litter's amplitude at mode k
        mW -= lt; mH -= lg;
        Cs1 += (lt + lg) * phi(K[j], b, h, E[j], Eb);
        N += (FT[j] + FG[j]) * I[j];
      }
      Cs1 += mW * phi(aW, b, h, EW, Eb) + mH * phi(aH, b, h, EH, Eb);
      this.Ct[i] = Ct1; this.Cg[i] = Cg1; this.Cs[i] = Cs1;
      const A = this.areaM[i], L = N - (Ct1 - Ct0) - (Cg1 - Cg0);
      sN += A * N; sL += A * L; sR += A * (L - (Cs1 - Cs0));
    }
    const k = 1e-12 / h;   // kg → Pg, per year
    this.flux = { npp: sN * k, litter: sL * k, resp: sR * k, air: (sR - sN) * k };
    return this.flux;
  }

  /** The closure: cover and carbon at the climate's equilibrium. */
  equilibrate() {
    const V = VEG;
    for (let i = 0; i < this.n; i++) {
      const v = this.vEq[i], s = this.sEq[i], p = this.pi[i];
      this.veg[i] = v; this.share[i] = s; this.ft[i] = v * s; this.fg[i] = v - v * s;
      this.Ct[i] = p * v * s * V.TAU_WOOD;
      this.Cg[i] = p * v * (1 - s) * V.TAU_HERB;
      this.Cs[i] = p * v / this.kS[i];
    }
    this.flux = { npp: 0, litter: 0, resp: 0, air: 0 };
  }

  /** Land carbon (Pg C) and cover's shares of the land given (a mask), or of every cell. */
  totals(land = null) {
    let cv = 0, cs = 0, at = 0, ag = 0, A = 0;
    for (let i = 0; i < this.n; i++) {
      const a = this.areaM[i];
      cv += a * (this.Ct[i] + this.Cg[i]); cs += a * this.Cs[i];
      if (land && !land[i]) continue;
      at += a * this.ft[i]; ag += a * this.fg[i]; A += a;
    }
    A = A || 1;
    return { veg: cv * 1e-12, soil: cs * 1e-12, trees: at / A, grass: ag / A, bare: 1 - (at + ag) / A };
  }

  /** The Relief view's eight weights a cell (COLOURS), into out (8n). */
  colours(out = new Float32Array(8 * this.n)) {
    for (let i = 0; i < this.n; i++) colourWeights(this.ft[i], this.fg[i], this.temp[i], this.gdd[i], out, 8 * i);
    return out;
  }
}
