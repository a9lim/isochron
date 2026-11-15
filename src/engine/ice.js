// Ice sheets (docs/PLAN.md, layer 5, and phase 7's ice that carves).
//
//   flow         the shallow-ice approximation with Glen's law (n = 3): flux
//                q = −Γ H⁵ |∇s|² ∇s, Γ = 2A(ρg)³/5 (standard), explicit in
//                time with a step the stability limit sets
//   the bed's    (standard: Robin's steady column, from memory) heat conducted
//   temperature  up from the bed against cold snow carried down into the ice,
//                the vertical speed falling linearly from the accumulation rate
//                a at the surface to nothing at the bed (no horizontal
//                advection): T_b = T_s + G R/k with R = l √(π/2) erf(H/(√2 l)),
//                l = √(κH/a) the thermal boundary layer. R → H as a → 0
//                (conduction alone), and where the ice ablates (a ≤ 0) it is H.
//                T_s is the annual mean at the ice's surface (no warmer than
//                0 °C), k ice's conductivity, and G the geothermal flux plus
//                the heat of the ice's own deformation, τ_b ū_d (the shallow-ice
//                column's dissipation, most of it in the lowest layers, so
//                taken at the bed: synthesis); the melting point falls 0.87 K
//                per km of ice (from memory). The
//                thawed share is a logistic of T_b − T_pm over 1 K (synthesis:
//                the spread of bed temperature within a cell), not a switch.
//   sliding      (standard: a Weertman-type law) u_b = C τ_b^p × thawed, with
//                τ_b = ρᵢ g H |∇s| the shallow-ice basal stress, p = 3. The
//                sliding flux u_b H is a diffusion like the deformation's,
//                D_s = C ρᵢg H² τ_b^{p−1} = C (ρᵢg)³ H⁴ |∇s|² × thawed, so with
//                p = n the two add and the step's limit (on the sum) holds as
//                tested for deformation alone. C is per cell from the bed's
//                softness (0 hard rock, 1 soft till), log-linear between
//                C_HARD and C_SOFT (synthesis: hard beds slide ~1–10 m/yr at
//                100 kPa, deforming till hundreds; from memory). The effective
//                pressure's role (faster near flotation) is left out.
//   speed limit  (synthesis) where the depth-mean speed would pass U_MAX the
//                flux holds there: the shallow-ice approximation fails at a
//                cliff onto the sea or a pit of ice between peaks, and a single
//                such cell sliding at hundreds of km/yr set the explicit step
//                for the whole ice (0.01 yr)
//   basal melt   (standard) where thawed, the heat the bed can't conduct away
//                melts ice: (G + τ_b u_b − k (T_pm − T_s)/R)/(ρᵢ L). Friction
//                heats the melt but not the thawed share, so the share doesn't
//                feed on itself.
//   erosion      (standard rule, Humphrey and Raymond's: ė = K_g u_b^l, l = 1;
//                K_g calibrated, 2e-6, to Hallet's ice-sheet rates against
//                this model's sliding) rock or regolith per year under
//                sliding ice. It's entrained as debris (m of rock per cell)
//                carried with the ice's fluxes (upwind) and melted out where
//                the ice ablates, in proportion to the ablated share; all of
//                it where the ice vanishes or calves (synthesis). What melts
//                out is till. The crust isn't touched here: `takeGlacial`
//                hands the integrals on (erosion, till, outwash).
//   outwash      meltwater (surface and basal melt) runs down the ice's
//                surface to the first ice-free cell, where it leaves the ice
//   mass balance snow where the month is below freezing at the ice's surface;
//                melt by positive degree days, the month's days spread normally
//                about its mean (Reeh's scheme, standard); snow melts before
//                ice. Dust darkens both and raises their factors
//                (src/engine/aeolian.js). The surface's height cools it by the lapse rate, so a
//                high sheet keeps itself cold.
//   the bed      (standard: ELRA, Le Meur and Huybrechts, from memory) relaxes
//                over 3 kyr toward the flexural response to the ice's load,
//                w_eq = flex(ρᵢ g H, Tₑ) (src/engine/flexure.js), so a
//                forebulge rises round a sheet and collapses after it; with no
//                flexure attached, toward local isostasy, −(ρᵢ/ρₘ) H
//   the sea      (standard) the surface over open sea is sea level and
//                floating ice's its freeboard, s = max(b + H, (1 − ρᵢ/ρw) H)
//                (before, an open sea cell's surface was its floor, so the
//                coast was a cliff the ice ran down at the speed limit, and
//                that flux was 95–98% of the ice's loss). Grounded ice is
//                water taken from the sea by its volume above flotation.
//   marine       (synthesis on standard forms) floating ice doesn't flow (no
//   fronts       shelves) and persists only beside flowing grounded ice: the
//                sub-grid front, a partly filled cell (after Albrecht and
//                others' scheme, from memory), which grounds once it fills.
//                Elsewhere floating ice calves. Each edge between ice and open
//                sea ablates u_f H_f ℓ a year (m³), H_f the ice's thickness
//                there (at least the cell's flotation thickness), taken first
//                from the ice crossing the edge and the rest from the ice
//                behind it, so the front advances where the flow outruns
//                u_f and retreats where it doesn't. u_f = CALVE d (TF₊ +
//                TF_COLD)/(TF_REF + TF_COLD): Pelto and Warren's water-depth
//                law for tidewater glaciers (u = 70 + 8.33 d m/yr in Alaska's
//                fjords, from memory), d the front's water depth, scaled by
//                the sea's thermal forcing TF₊ (the year's mean of its warmth
//                above freezing) against those fjords' (melt undercutting a
//                front drives its calving; frontal melt grows as TF^1.18,
//                Rignot and others, from memory), and in a freezing sea a
//                mechanical floor (TF_COLD). A warm sea pulls a marine margin
//                back, a cold one lets it ground across a shelf; deep water
//                holds it.
//
// Thickness in metres, time in years. The ice is held in the mantle's frame:
// over its timescales the plates hardly move, and at plate speed it's
// re-made by the climate faster than the plates carry it.
import { elasticThickness } from './flexure.js';

export const ICE = {
  A: 1e-16,          // Pa⁻³ yr⁻¹, Glen's flow factor (cold ice)
  RHO_I: 917, RHO_W: 1028, RHO_M: 3300, G: 9.81,
  DDF_SNOW: 0.003,   // m of water per degree-day
  DDF_ICE: 0.008,
  SIGMA: 5,          // K, the spread of days about a month's mean
  TAU_BED: 3000,     // yr
  LAPSE: 6.5,        // K/km
  MAX_STEP: 100,     // yr
  STEP_C: 0.12,      // the explicit step's coefficient, dt ≤ STEP_C · A_min / D_max (tested for flux ∝ |∇s|³)
  // The bed's temperature.
  K: 2.1,            // W/m/K, ice's conductivity (from memory)
  KAPPA: 36,         // m²/yr, ice's thermal diffusivity (k/ρc, 1.14e-6 m²/s; from memory)
  GEO: 0.06,         // W/m², the geothermal flux where the plates don't say
  BETA: 8.7e-4,      // K/m, the melting point's fall with depth (from memory)
  THAW_W: 1,         // K, the thawed share's logistic scale (synthesis)
  LATENT: 3.34e5,    // J/kg
  // Sliding (Weertman-type).
  P: 3,
  U_MAX: 3000,       // m/yr: the depth-mean speed past which the shallow-ice flux is held (synthesis: a cell's mean;
                     //   the approximation fails at cliffs, and one such cell would set every cell's step)
  C_HARD: 1e-14,     // m yr⁻¹ Pa⁻³, bare rock (synthesis)
  C_SOFT: 1e-12,     //   soft till
  // Glacial erosion.
  KG: 2e-6, EL: 1,   // ė = K_g u_b^l (m/yr): Hallet's ice-sheet rates (0.01–0.1 mm/yr, from memory) at this model's sliding (Humphrey and Raymond's 1e-4 eroded the opening's ice at ~15 mm/yr)
  // The bed's flexure.
  FLEX_CHANGE: 0.01, // re-solve when the load has moved this share
  FLEX_CYCLES: 2,    // warm V-cycles a re-solve
  TE_EVERY: 0.5,     // Myr of plate time between refreshes of Tₑ and the geothermal flux
  // Marine fronts: u_f = CALVE d (TF₊ + TF_COLD)/(TF_REF + TF_COLD) m/yr at water depth d (m).
  CALVE: 8.33,       // yr⁻¹: Pelto and Warren's slope (from memory), at their fjords' thermal forcing
  TF_REF: 5,         // K: that forcing (Alaska's fjords, ~4–6 K above freezing; synthesis)
  TF_COLD: 0.5,      // K: a freezing sea's mechanical calving, a tenth of theirs (synthesis)
  T_FREEZE: -1.8,    // °C, sea water's freezing point
};

const MONTH_DAYS = 30.44;
const R_M = 6.371e6;
const SEC = 3.15576e7;
const phiN = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
// Φ by Abramowitz and Stegun 26.2.17.
function PhiN(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = phiN(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - d : d;
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The geothermal flux (W/m²) from the plates' crust:
 *   ocean       (standard: Stein and Stein's GDH1, from memory) 0.51/√age for
 *               ages under 55 Myr (held at 4 Myr's under a young ridge), then
 *               0.048 + 0.096 e^{−0.0278 age}
 *   continents  (synthesis, fitted by eye to Pollack and others' means by
 *               tectonothermal age, from memory) 0.050 + 0.025 e^{−age/300 Myr}
 * blended by the felsic fraction as the elastic thickness is.
 */
export function geothermal(tec, out = new Float32Array(tec.grid.n)) {
  const t = tec.t;
  for (let i = 0; i < tec.grid.n; i++) {
    const age = Math.max(0, t - tec.tf[i]), f = smoothstep(0.35, 0.65, tec.phi[i]);
    const go = age < 55 ? 0.51 / Math.sqrt(Math.max(4, age)) : 0.048 + 0.096 * Math.exp(-0.0278 * age);
    const gc = 0.050 + 0.025 * Math.exp(-age / 300);
    out[i] = (1 - f) * go + f * gc;
  }
  return out;
}

/** erf by Abramowitz and Stegun 7.1.26 (|error| < 1.5e-7; the GPU's too). */
export function erf(x) {
  const s = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-a * a));
}

/** Robin's effective depth R (m) for ice h thick under accumulation a (m of ice a year): T_b = T_s + G R/k. */
export function robinDepth(h, a) {
  if (!(a > 1e-6) || !(h > 0)) return h;
  const l = Math.sqrt(ICE.KAPPA * h / a);
  return l * 1.2533141373155 * erf(h / (1.4142135623731 * l));
}

/** The sliding coefficient (m yr⁻¹ Pa⁻ᵖ) for a bed's softness (0 hard rock, 1 soft till). */
export const slipOf = soft => ICE.C_HARD * Math.pow(ICE.C_SOFT / ICE.C_HARD, Math.min(1, Math.max(0, soft)));

/** The calving speed per metre of water depth (yr⁻¹) at a sea of thermal forcing TF₊ (K above freezing, the year's mean). */
export const calveOf = tf => ICE.CALVE * (Math.max(0, tf) + ICE.TF_COLD) / (ICE.TF_REF + ICE.TF_COLD);

/**
 * A front's ablation (m³/yr) at an edge between ice and open sea: u_f H_f ℓ with u_f = cf d, cf
 * the sea cell's calving speed per metre (calveOf), d the front's water depth, H_f the ice's
 * thickness there, at least the flotation thickness, and ℓ the edge's length from its ℓ/d and
 * the ice cell's spacing √(2A/√3) (exact on a regular hexagon; the GPU's flux kernel has no
 * binding to spare for the lengths). The front stands in the ice's cell, so d is that cell's
 * depth: ice on land at the coast has none (the ice crosses into the sea's cell, which then
 * holds the front at its own depth). bIce is the ice cell's bed (m above sea level), aIce its
 * area (m²). Also the GPU's (src/gpu/ice.js).
 */
export function frontRate(cfSea, bIce, hIce, ellOverD, aIce) {
  const d = Math.max(0, -bIce);
  if (!(d > 0)) return 0;
  return cfSea * d * Math.max(hIce, ICE.RHO_W * d / ICE.RHO_I) * ellOverD * Math.sqrt(2 * aIce / Math.sqrt(3));
}

export class Ice {
  constructor(tec, climate) {
    this.tec = tec;
    this.climate = climate;
    const g = this.grid = tec.grid, n = g.n;
    this.H = new Float64Array(n);          // m
    this.w = new Float64Array(n);          // bed deflection, m (negative down)
    this.M = new Float64Array(n);          // mass balance, m of ice per year
    this.melt = new Float64Array(n);       // of which melt (surface, by degree days), m of ice per year
    this.Ts0 = new Float32Array(n);        // the annual mean temperature at sea level (°C), from the climate's months
    this.s = new Float64Array(n);          // surface above sea level, m
    this.D = new Float64Array(n);          // diffusivity, deformation and sliding
    this.vel = new Float32Array(4 * n);    // flow direction (3) and depth-mean speed (m/yr), for drawing
    this.gradS = new Float64Array(3 * n);
    // The bed: inputs.
    this.soft = new Float32Array(n);                 // bed softness, 0 (hard rock) to 1 (soft till): the regolith's, later
    this.geo = new Float32Array(n).fill(ICE.GEO);    // geothermal flux, W/m² (from the plates when they're there)
    this.Cb = new Float64Array(n).fill(ICE.C_HARD);  // the sliding coefficient, from `soft` (setSoftness)
    // The bed: outputs.
    this.ub = new Float32Array(n);         // sliding speed, m/yr
    this.thaw = new Float32Array(n);       // the bed's thawed share
    this.Tb = new Float32Array(n);         // the bed's temperature by conduction, °C (uncapped: past T_pm it melts)
    this.mb = new Float32Array(n);         // basal melt, m of ice per year
    this.debris = new Float64Array(n);     // rock carried in the ice, m (per cell's area)
    // Integrals since the last `takeGlacial`.
    this.eroded = new Float64Array(n);     // m of rock taken from the bed
    this.till = new Float64Array(n);       // m of rock melted out of the ice
    this.meltAcc = new Float64Array(n);    // m of ice melted (routed to `outwash` on publish)
    this.outwash = new Float64Array(n);    // m³ of meltwater leaving the ice at each cell
    this.areaM = Float64Array.from(g.area, a => a * R_M * R_M);
    this.coef = Float64Array.from(g.ell, (l, t) => l / g.dist[t]);     // ℓ/d, dimensionless
    this.Gamma = 2 * ICE.A * (ICE.RHO_I * ICE.G) ** 3 / 5;
    this.active = new Int32Array(n);
    this.nActive = 0;
    this.mbVersion = -1;
    this.plateT = -Infinity;
    this.flex = null;                      // a Flexure (attachFlexure); without one the bed is local
    this.dustDDF = null;                   // the degree-day factors' scale by the dust on snow and ice, 2 a cell (src/engine/aeolian.js)
    // Marine fronts: each cell's calving speed per metre of water depth (yr⁻¹, from its sea's warmth; read
    // where it's open sea), and the step's frontal loss (m of ice) and whether floating ice may stay (beside
    // flowing grounded ice).
    this.cf = new Float32Array(n).fill(calveOf(0));
    this.tf = new Float32Array(n);         // the sea's thermal forcing, K above freezing (the year's mean)
    this.front = new Float64Array(n);
    this.keep = new Uint8Array(n);
    this.calvedAcc = 0;                    // m³ calved since the last advance (the CPU's; the GPU's comes back with its integrals)
    this.budget = { snow: 0, melt: 0, basal: 0 };   // m³ since the last advance, as the CPU's steps realized them
    // m³, m², m; the ice's area-mean sliding speed (m/yr), its shares thawed and streaming (sliding faster than it
    // deforms), and the rock it erodes (m³/yr); its budget (m³ of ice a year): snow, surface melt and basal melt
    // over the ice, and calving (the fronts' ablation and floating ice let go, over the last advance)
    this.stats = { volume: 0, area: 0, seaLevel: 0, sliding: 0, thawed: 0, streaming: 0, erosion: 0, snow: 0, melt: 0, basal: 0, calving: 0, marine: 0 };
  }

  /** Bed above sea level (m), with the load's depression. */
  bed(i) { return (this.tec.elev[i] - this.tec.seaLevel) * 1000; }

  /** The surface (m above sea level): grounded ice's, the bed plus the ice; floating ice's freeboard; open sea's, sea level. */
  surface(i) { const h = Math.max(0, this.H[i]); return Math.max(this.bed(i) + h, (1 - ICE.RHO_I / ICE.RHO_W) * h); }

  /** The sea's thermal forcing at each cell (the year's mean warmth above freezing, K) and its calving speed per metre (`tf`, `cf`). */
  frontFactor() {
    const c = this.climate, n = this.grid.n, sst = c.ocean && c.ocean.fine ? c.ocean.fine.sst : null;
    const mph = c.monthPhases || (c.monthPhases = Array.from({ length: 12 }, (_, m) => monthPhaseLocal(m)));
    for (let i = 0; i < n; i++) {
      const a = sst ? sst[i] : 0;
      let tf = 0;
      for (let m = 0; m < 12; m++) tf += Math.max(0, c.tAt(i, mph[m]) + a - ICE.T_FREEZE);
      this.tf[i] = tf / 12; this.cf[i] = calveOf(tf / 12);
    }
  }

  /** The bed's softness (0–1 per cell), which sets the sliding coefficient. */
  setSoftness(soft) {
    if (soft !== this.soft) this.soft.set(soft);
    for (let i = 0; i < this.grid.n; i++) this.Cb[i] = slipOf(this.soft[i]);
  }

  /**
   * Bend the bed by flexure: `flex` a Flexure (src/engine/flexure.js) on this
   * grid. Tₑ (km per cell) fixed if given, else refreshed from the plates.
   */
  attachFlexure(flex, { Te = null } = {}) {
    this.flex = flex;
    this.useTe(Te);
    this.wFlex = new Float64Array(this.grid.n);
    this.qFlex = new Float64Array(this.grid.n);
    this.Hsolved = null;
    flex.setRigidity(this.Te);
  }

  /** Tₑ (km per cell) for the bed's flexure: fixed if given, else the plates' (also for src/gpu/ice.js). */
  useTe(Te = null) {
    this.teWanted = true;
    this.teAuto = !Te;
    this.Te = Te ? Float32Array.from(Te) : new Float32Array(this.grid.n);
    if (!Te) {
      if (!this.tec.tf) throw new Error('ice: no plates to take Tₑ from (pass Te)');
      this.plateT = -Infinity; this.refreshPlates();
    }
    return this.Te;
  }

  /** The geothermal flux and (with a flexure) Tₑ from the plates, every TE_EVERY Myr; true if Tₑ changed. */
  refreshPlates() {
    const tec = this.tec;
    if (!tec.tf || !tec.phi || !(Math.abs(tec.t - this.plateT) >= ICE.TE_EVERY)) return false;
    this.plateT = tec.t;
    geothermal(tec, this.geo);
    if (this.teWanted && this.teAuto) { elasticThickness(tec, this.Te); return true; }
    return false;
  }

  /** Mass balance from the climate's monthly temperature and rain at each surface. */
  massBalance() {
    const c = this.climate, g = this.grid, n = g.n;
    const mph = c.monthPhases || (c.monthPhases = Array.from({ length: 12 }, (_, m) => monthPhaseLocal(m)));
    const L = ICE.LAPSE, sig = ICE.SIGMA;
    for (let i = 0; i < n; i++) {
      const b = this.bed(i), H = this.H[i];
      let tm = 0;
      for (let m = 0; m < 12; m++) tm += c.tAt(i, mph[m]);
      this.Ts0[i] = tm / 12;
      const grounded = b > 0 || H * ICE.RHO_I > -b * ICE.RHO_W;
      if (!grounded) { this.M[i] = 0; this.melt[i] = 0; continue; }
      const sKm = Math.max(0, b + H) / 1000;
      let acc = 0, pdd = 0;
      for (let m = 0; m < 12; m++) {
        const T = c.tAt(i, mph[m]) - L * sKm;
        const P = c.pAt(i, mph[m]) * MONTH_DAYS / 1000;           // m of water
        const snow = T <= -2 ? 1 : T >= 2 ? 0 : (2 - T) / 4;
        acc += P * snow;
        pdd += MONTH_DAYS * (sig * phiN(T / sig) + T * PhiN(T / sig));
      }
      // Snow melts first, then ice; in metres of ice. Dust darkens both, which raises their
      // degree-day factors (src/engine/aeolian.js).
      const dd = this.dustDDF, ks = ICE.DDF_SNOW * (dd ? dd[2 * i] : 1), ki = ICE.DDF_ICE * (dd ? dd[2 * i + 1] : 1);
      const snowMelt = Math.min(acc, pdd * ks);
      const left = pdd - snowMelt / ks;
      const iceMelt = left * ki;
      this.M[i] = (acc - snowMelt - iceMelt) * (1000 / ICE.RHO_I);
      this.melt[i] = (snowMelt + iceMelt) * (1000 / ICE.RHO_I);
    }
    this.frontFactor();
    this.mbVersion = c.version;
  }

  /** Cells with ice or beside it, and where snow would gather. */
  collect() {
    const g = this.grid, n = g.n, H = this.H, M = this.M, nbrOff = g.nbrOff, nbr = g.nbr;
    const inSet = this.inSet || (this.inSet = new Uint8Array(n));
    let k = 0;
    for (let i = 0; i < n; i++) {
      let on = H[i] > 0 || M[i] > 0;
      if (!on) for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) if (H[nbr[t]] > 0) { on = true; break; }
      inSet[i] = on ? 1 : 0;
      if (on) this.active[k++] = i;
      else this.D[i] = this.ub[i] = this.thaw[i] = this.mb[i] = 0;   // a cell that has left the set lends no stale diffusivity
    }
    this.nActive = k;
  }

  /** Cells that gained ice this step bring their neighbours into the set (between collects, ice that flowed to a cell outside it was lost). */
  widen(gained, m) {
    const g = this.grid, nbrOff = g.nbrOff, nbr = g.nbr, inSet = this.inSet, act = this.active;
    let k = this.nActive;
    for (let q = 0; q < m; q++) {
      const i = gained[q];
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) { const j = nbr[t]; if (!inSet[j]) { inSet[j] = 1; act[k++] = j; } }
    }
    this.nActive = k;
  }

  /**
   * The bed under ice of thickness h with surface slope gm at cell i: its
   * temperature, thawed share, sliding speed and basal melt; returns the
   * sliding's diffusivity.
   */
  basal(i, h, gm) {
    const rg = ICE.RHO_I * ICE.G, tau = rg * h * gm;
    const Ts = Math.min(0, this.Ts0[i] - ICE.LAPSE * Math.max(0, this.bed(i) + h) / 1000);
    const R = robinDepth(h, this.M[i]);
    // The deformation's heat: τ_b times the depth-mean deformation speed Γ H⁴ |∇s|³.
    const strain = tau * this.Gamma * h * h * h * h * gm * gm * gm / SEC;
    const Tb = Ts + (this.geo[i] + strain) * R / ICE.K, Tpm = -ICE.BETA * h;
    const thaw = 1 / (1 + Math.exp(Math.min(60, Math.max(-60, (Tpm - Tb) / ICE.THAW_W))));
    const C = this.Cb[i] * thaw;
    const tp = ICE.P === 3 ? tau * tau : Math.pow(tau, ICE.P - 1);
    const ub = C * tp * tau;
    const heat = this.geo[i] + strain + tau * ub / SEC - ICE.K * Math.max(0, Tpm - Ts) / R;
    this.Tb[i] = Tb; this.thaw[i] = thaw; this.ub[i] = ub;
    this.mb[i] = thaw * Math.max(0, heat) * SEC / (ICE.RHO_I * ICE.LATENT);
    return C * rg * h * h * tp;
  }

  /** One explicit step of at most dtMax years; returns the step taken. */
  step(dtMax) {
    const g = this.grid, nbrOff = g.nbrOff, nbr = g.nbr, gw = g.gw, H = this.H, s = this.s, D = this.D, A = this.areaM, coef = this.coef;
    const act = this.active, na = this.nActive, Gm = this.Gamma, b = this.debris, RI = ICE.RHO_I, RW = ICE.RHO_W;
    // Surface, its slope, and the diffusivity: deformation Γ H⁵ |∇s|², sliding as `basal`. Floating
    // ice doesn't flow (no shelves: the shallow-ice approximation has none to give).
    for (let k = 0; k < na; k++) { const i = act[k]; s[i] = this.surface(i); }
    let dmax = 0;
    for (let k = 0; k < na; k++) {
      const i = act[k], h = H[i], bd = this.bed(i);
      if (!(h > 0) || (bd < 0 && h * RI < -bd * RW)) { D[i] = 0; this.ub[i] = this.thaw[i] = this.mb[i] = 0; continue; }
      let gx = 0, gy = 0, gz = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const d = s[nbr[t]] - s[i];
        gx += d * gw[3 * t]; gy += d * gw[3 * t + 1]; gz += d * gw[3 * t + 2];
      }
      gx /= R_M; gy /= R_M; gz /= R_M;
      const g2 = gx * gx + gy * gy + gz * gz;
      const gm = Math.sqrt(g2);
      D[i] = Gm * h * h * h * h * h * g2 + this.basal(i, h, gm);
      // The speed limit: where the shallow-ice flux would pass U_MAX (a cliff, a pit full of ice
      // between peaks), it holds there, and the sliding with it.
      const cap = ICE.U_MAX * h / Math.max(gm, 1e-12);
      if (D[i] > cap) { this.ub[i] *= cap / D[i]; D[i] = cap; }
      if (D[i] > dmax) dmax = D[i];
      this.gradS[3 * i] = gx; this.gradS[3 * i + 1] = gy; this.gradS[3 * i + 2] = gz;
    }
    // Stability: dt · Σ(D ℓ/d) / A ≤ ½ in the worst cell (Σ ℓ/d ≈ 3.5), for the sum of the two
    // diffusivities (each's flux goes as |∇s|³, so the limit's form is the same).
    const amin = A[0];
    const dt = Math.min(dtMax, ICE.MAX_STEP, dmax > 0 ? stepCoef() * amin / dmax : ICE.MAX_STEP);
    const dH = this.scratch || (this.scratch = new Float64Array(g.n));
    const dB = this.scratchB || (this.scratchB = new Float64Array(g.n));
    const front = this.front, keep = this.keep, cf = this.cf;
    // Fluxes of ice, and of debris at the upwind cell's concentration. At an edge between ice and
    // open sea the front ablates `frontRate` a year: from the ice crossing the edge first (calved
    // where it crosses, its debris dropped there), the rest from the ice behind the edge.
    for (let k = 0; k < na; k++) {
      const i = act[k];
      const hi = Math.max(0, H[i]), bi = this.bed(i), ci = hi > 0 ? b[i] / hi : 0, si = s[i];
      const sea = !(hi > 0) && bi < 0;
      let q = 0, qb = 0, fr = 0, kp = 0;
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) {
        const j = nbr[t];
        if (D[j] > 0) kp = 1;
        const hj = Math.max(0, H[j]), bj = this.bed(j), De = 0.5 * (D[i] + D[j]);
        const F = De > 0 ? De * coef[t] * (s[j] - si) : 0;   // into i (m³/yr)
        if (hi > 0 && !(hj > 0) && bj < 0) {
          // i's front on open sea j: the outflow (F ≤ 0) leaves whole; what it doesn't supply, the ice behind gives.
          q += F; qb += F * ci;
          fr += Math.max(0, frontRate(cf[j], bi, hi, coef[t], A[i]) + F);
        } else if (sea && hj > 0) {
          // Open sea at j's front: what crosses arrives, less the front's ablation (calved as it crosses).
          const O = Math.max(0, F);
          q += O; qb += O * b[j] / hj;
          fr += Math.min(O, frontRate(cf[i], bj, hj, coef[t], A[j]));
        } else if (De > 0 && (F > 0 ? hj > 0 : hi > 0)) {
          // Ice flows only out of a cell that has it: ice below a bare cliff would otherwise draw on the
          // cliff (the diffusivity is the ice's), making ice from nothing (an ice-filled pit beside a bare
          // 2 km peak at 40° made ~160 km³ a year, melted as fast).
          q += F;
          qb += F * (F > 0 ? b[j] / hj : ci);
        }
      }
      dH[i] = dt * q / A[i]; dB[i] = dt * qb / A[i]; front[i] = dt * fr / A[i]; keep[i] = kp;
    }
    // The update: mass balance and basal melt, the fronts, floating ice let go, meltwater, erosion and melt-out.
    const KG = ICE.KG, EL = ICE.EL, bud = this.budget, gained = this.gained || (this.gained = new Int32Array(g.n));
    let calved = 0, ng = 0;
    for (let k = 0; k < na; k++) {
      const i = act[k];
      const h0 = H[i], hasIce = h0 > 0, mbas = hasIce ? this.mb[i] : 0, fl = front[i];
      const iceIn = h0 + Math.max(0, dH[i]);
      const abl = dt * (this.melt[i] + mbas);
      let h = h0 + dH[i] + dt * (this.M[i] - mbas) - fl;
      // The budget as realized, where there is ice (held, arriving, or snow that stays; not a bare
      // cell's seasonal snow): where it runs out, every loss in proportion.
      if (iceIn > 0 || this.M[i] > 0) {
        const lost = abl + fl, r = h >= 0 || !(lost > 0) ? 1 : Math.max(0, h + lost) / lost, a = A[i];
        bud.snow += dt * Math.max(0, this.M[i] + this.melt[i]) * a; bud.melt += r * dt * this.melt[i] * a; bud.basal += r * dt * mbas * a;
        calved += r * fl * a;
      }
      // Floating ice away from flowing grounded ice calves.
      const bd = this.bed(i);
      if (h > 0 && bd < 0 && h * RI < -bd * RW && !keep[i]) { calved += h * A[i]; h = 0; }
      // Less than half a metre goes: at sea, to the front; on land, as melt.
      if (h > 0 && h <= 0.5) { if (bd < 0) calved += h * A[i]; else bud.melt += h * A[i]; }
      h = h > 0.5 ? h : 0;
      H[i] = h;
      if (h > 0 && !hasIce) gained[ng++] = i;
      if (iceIn > 0) this.meltAcc[i] += Math.min(abl, iceIn + dt * (this.M[i] + this.melt[i]));
      const ub = hasIce ? this.ub[i] : 0;
      const ero = ub > 0 ? dt * KG * (EL === 1 ? ub : Math.pow(ub, EL)) : 0;
      const bb = Math.max(0, b[i] + dB[i] + ero);
      const ablD = abl + fl;
      const dep = h > 0 ? bb * ablD / (h + ablD) : bb;
      b[i] = bb - dep;
      this.eroded[i] += ero; this.till[i] += dep;
    }
    this.calvedAcc += calved;
    if (ng) this.widen(gained, ng);
    return dt;
  }

  /**
   * The flexural response to the ice's load (with a flexure): re-solved by a
   * few warm V-cycles when the load has moved FLEX_CHANGE of itself, and again
   * each advance until the solve has converged.
   */
  flexTarget() {
    const flex = this.flex, n = this.grid.n, H = this.H, A = this.areaM;
    let d = 0, m = 0;
    for (let i = 0; i < n; i++) { const a = A[i]; m += H[i] * a; if (this.Hsolved) d += Math.abs(H[i] - this.Hsolved[i]) * a; }
    const moved = !this.Hsolved || d > ICE.FLEX_CHANGE * Math.max(m, 1e9);
    if (!moved && !(this.flexRes > 1e-5)) return this.wFlex;
    if (!(m > 0)) {                        // no load: the plate is flat
      this.wFlex.fill(0); flex.reset(); this.flexRes = 0;
    } else {
      const q = this.qFlex, rg = ICE.RHO_I * ICE.G;
      for (let i = 0; i < n; i++) q[i] = rg * H[i];
      const w = this.Hsolved ? flex.solve(q, null, { cycles: ICE.FLEX_CYCLES }) : flex.solve(q, null, { tol: 1e-6 });
      this.wFlex.set(w);
      this.flexRes = flex.stats.residual;
    }
    (this.Hsolved ||= new Float64Array(n)).set(H);
    return this.wFlex;
  }

  /** Relax the bed everywhere over dt years toward the load's response (flexural, or local). */
  rebound(dt) {
    const k = 1 - Math.exp(-dt / ICE.TAU_BED), H = this.H, w = this.w, n = this.grid.n;
    if (this.flex) {
      const wf = this.flexTarget();
      for (let i = 0; i < n; i++) w[i] += (-wf[i] - w[i]) * k;
    } else {
      const eq = -ICE.RHO_I / ICE.RHO_M;
      for (let i = 0; i < n; i++) if (w[i] !== 0 || H[i] > 0) w[i] += (eq * H[i] - w[i]) * k;
    }
  }

  /**
   * Advance by `years`, stepping until `ms` of real time is spent. Returns the
   * years actually simulated: past the budget, the ice is summarized, i.e. it
   * holds the state it reached (it lags the climate rather than the clock).
   */
  advance(years, ms = 4) {
    if (this.climate.version !== this.mbVersion) this.massBalance();
    if (this.refreshPlates() && this.flex) { this.flex.setRigidity(this.Te); this.Hsolved = null; }
    this.collect();
    const t0 = performance.now();
    let done = 0, n = 0;
    while (done < years - 1e-9) {
      done += this.step(years - done);
      if (++n % 8 === 0) {
        if (performance.now() - t0 > ms) break;
        this.collect();
      }
    }
    this.rebound(done);
    this.sync();
    // The budget's rates over the advance as stepped (publish's are the instantaneous ones over the ice).
    const st = this.stats, b = this.budget;
    if (done > 0) { st.calving = this.calvedAcc / done; st.snow = b.snow / done; st.melt = b.melt / done; st.basal = b.basal / done; }
    this.calvedAcc = 0; b.snow = b.melt = b.basal = 0;
    return done;
  }

  /** Flow for drawing, then the load and water to the crust and the sea. */
  sync() {
    const n = this.grid.n, H = this.H;
    for (let i = 0; i < n; i++) {
      const o = 4 * i;
      if (H[i] > 0 && this.D[i] > 0) {
        const gx = this.gradS[3 * i], gy = this.gradS[3 * i + 1], gz = this.gradS[3 * i + 2], gm = Math.hypot(gx, gy, gz) || 1;
        this.vel[o] = -gx / gm; this.vel[o + 1] = -gy / gm; this.vel[o + 2] = -gz / gm;
        this.vel[o + 3] = this.D[i] * gm / H[i];          // depth-mean speed, m/yr
      } else { this.vel[o] = this.vel[o + 1] = this.vel[o + 2] = this.vel[o + 3] = 0; }
    }
    this.route();
    this.publish();
  }

  /**
   * Meltwater down the ice's surface (steepest descent) to the first ice-free
   * cell, or to a hollow in the ice: `meltAcc` (m of ice) becomes `outwash`
   * (m³ of water) where it leaves.
   */
  route() {
    const g = this.grid, n = g.n, H = this.H, acc = this.meltAcc, nbrOff = g.nbrOff, nbr = g.nbr;
    const cells = [];
    for (let i = 0; i < n; i++) if (acc[i] > 0) { if (H[i] > 0) cells.push(i); else { this.outwash[i] += acc[i] * this.areaM[i] * ICE.RHO_I / ICE.RHO_W; acc[i] = 0; } }
    if (!cells.length) return;
    // Every ice cell upstream of one with melt carries it; take the ice cells by surface, highest first.
    const ice = [];
    for (let i = 0; i < n; i++) if (H[i] > 0) ice.push(i);
    const sOf = i => this.surface(i);
    const s = new Float64Array(ice.length);
    ice.forEach((i, k) => { s[k] = sOf(i); });
    const order = Int32Array.from(ice.keys()).sort((a, b) => s[b] - s[a]);
    const water = this.routeScratch || (this.routeScratch = new Float64Array(n));
    for (const k of order) {
      const i = ice[k], v = acc[i] * this.areaM[i] + water[i];     // m³ of ice
      acc[i] = 0; water[i] = 0;
      if (!(v > 0)) continue;
      let best = -1, bs = s[k];
      for (let t = nbrOff[i], e = nbrOff[i + 1]; t < e; t++) { const j = nbr[t], sj = sOf(j); if (sj < bs) { bs = sj; best = j; } }
      if (best < 0) { this.outwash[i] += v * ICE.RHO_I / ICE.RHO_W; continue; }   // a hollow: it leaves here
      if (H[best] > 0) water[best] += v;
      else this.outwash[best] += v * ICE.RHO_I / ICE.RHO_W;
    }
  }

  /**
   * The glacial integrals since the last take, zeroed: `eroded` and `till` (m of
   * rock per cell), `outwash` (m³ of meltwater per cell), copied into `out`'s
   * arrays if given. `debris` (m of rock still in the ice) is the rest of the
   * budget: Σ eroded = Σ till + Δ Σ debris.
   */
  takeGlacial(out = {}) {
    const take = (k) => { const a = out[k] ? (out[k].set(this[k]), out[k]) : Float64Array.from(this[k]); this[k].fill(0); return a; };
    return { eroded: take('eroded'), till: take('till'), outwash: take('outwash') };
  }

  /** Push the ice's load and volume to the crust and the sea (also after the GPU's steps, src/gpu/ice.js). */
  publish() {
    const tec = this.tec, n = this.grid.n, H = this.H, RI = ICE.RHO_I, RW = ICE.RHO_W;
    let vol = 0, vaf = 0, area = 0, slide = 0, thawed = 0, stream = 0, ero = 0, snow = 0, melt = 0, basal = 0, marine = 0;
    if (!tec.load) tec.load = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      tec.load[i] = this.w[i] / 1000;
      if (H[i] > 0) {
        const a = this.areaM[i], d = Math.max(0, -this.bed(i));
        vol += H[i] * a; area += a;
        // The sea's loss is the volume above flotation: below it, the ice fills basin the sea would.
        vaf += Math.max(0, H[i] - RW * d / RI) * a;
        if (d > 0) marine += a;
        const ub = this.ub[i];
        slide += ub * a; thawed += this.thaw[i] * a; ero += ICE.KG * ub * a;
        if (ub > this.vel[4 * i + 3] - ub) stream += a;
        snow += Math.max(0, this.M[i] + this.melt[i]) * a; melt += this.melt[i] * a; basal += this.mb[i] * a;
      }
    }
    // Water held as ice, in the sea level's units (km of depth × steradians).
    tec.iceWater = vaf * RI / RW / 1000 / (R_M * R_M);
    const st = this.stats;
    st.volume = vol; st.area = area;
    st.seaLevel = vaf * RI / RW / 3.61e14;   // m, over today's ocean area
    st.sliding = area > 0 ? slide / area : 0; st.thawed = area > 0 ? thawed / area : 0; st.streaming = area > 0 ? stream / area : 0; st.erosion = ero;
    st.snow = snow; st.melt = melt; st.basal = basal; st.marine = area > 0 ? marine / area : 0;
  }
}

/** The step's coefficient: tested at 0.12 for flux ∝ |∇s|³ (n = p = 3); a steeper law takes a shorter step. */
export const stepCoef = () => ICE.STEP_C * 3 / Math.max(3, ICE.P);

// Year phase at the middle of month m (as orbit.js's monthPhase; kept local to avoid a cycle).
function monthPhaseLocal(m) {
  const mid = [15.5, 45, 74.5, 105, 135.5, 166, 196.5, 227.5, 258, 288.5, 319, 349.5][m];
  return ((mid - 78.5) / 365.2422 + 1) % 1;
}
