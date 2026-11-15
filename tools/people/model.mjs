// People, from the first hominins to the takeoff: the headless prototype of Roadmap 2.0
// (docs/PLAN.md, with v1's design and the log of runs). It reads a planet's fields
// (./planet.mjs): held fixed on the cached opening, or re-read from a live Planet that it writes
// back to (./couple.mjs). Marks as in the plan: standard, synthesis, speculation.
//
// One loop (Kremer's, standard; Kremer 1993, from memory): minds make ideas, ideas raise what the
// land carries, and what it carries makes minds. v1 splits the factors where a split brings its own
// dynamics and lands on a layer the planet has, each switched on by era:
//
//   culture   z, in e-folds of productivity, per lineage and cell. Ideas come from the minds a cell
//             can learn from, M (the collective brain: Henrich 2004, from memory), at A M^ψ a year,
//             and are lost at λ z (imperfect copying; Tasmania's loss over ~10 kyr sets λ). A is
//             Kremer's constant (von Foerster's C = 1/(θA)). Social reach g is a lineage's trait,
//             rising as a clock (speculation): it lengthens contact and raises foraging's yield
//             (e^{K_G g}). With ψ = 1 and a capacity ∝ e^{θz}, the loop's population runs as
//             1/(t* − t), von Foerster's hyperbola (standard algebra). Below a threshold the loop
//             has a low fixed point (a saddle-node's: A M₀ θ e > λ is where it vanishes, synthesis),
//             so a branch "tips" when the minds within its reach pass ~λ/(Aθe), about a million.
//   minds     M: people pass ideas over a contact length ℓ, which the trait and culture lengthen
//             (ℓ = L_C0 e^{(g + z)/Z_L}), within the connected body they live in (inhabited land,
//             and with boats narrow seas): M = N_C (1 − e^{−πℓ²ρ/N_C}), the local minds' density ρ
//             over a disc of radius ℓ, saturating at the body's total N_C (synthesis). Minds are
//             people × research intensity (rising with income) and the other lineages' at η; AI's
//             research minds join them through the task CES below.
//   people    a density per lineage, Lotka–Volterra competition in one niche, r N_k (1 − N_all/K_k),
//             solved exactly (the cell's total logistic to the harmonic mean of the capacities, the
//             shares by replicator dynamics; standard); spread down the gradient of crowding N/K
//             rather than density (toward the ideal free distribution: Fretwell and Lucas, from
//             memory), which on even capacity is Fisher–KPP (standard: a front at ~2√(rD), less
//             Bramson's delay), with slope, the sea's width and the capacity's zero as barriers. Growth fades with the income industry brings (the demographic transition:
//             Galor and Weil, from memory; synthesis here).
//   food      K = area × cold limit(z) × [(1 − f) b P_F(z) e^{K_G g} + f a s P_A(z) Y_soil CO₂]:
//             foraging's base density b from the accessible NPP, water and the coast, its
//             productivity P_F capped at CAP_F (the wild food, a flow); farming's a from the crops'
//             Miami NPP and the arable share, its P_A capped by the organic economy (Wrigley, from
//             memory) until industry's energy lifts it; f the farmed share, s the package's
//             suitability, Y_soil = 1 − e^{−h/H_YIELD} the soil's yield, CO₂'s fertilization.
//   soil      a renewable stock: the regolith h, made by Heimsath's production and stripped by the
//             rivers and by tillage, E_TILL f (slope/S_REF) e^{−(z − Z_FARM)/Z_CONS} (10–100× the
//             geological rate on slopes, Montgomery 2007, from memory; conservation with culture,
//             synthesis), stepped exactly (`regolithStep`): held here on the cached planet, the
//             planet's own regolith when live.
//   farming   an origin hazard where people are settled near foraging's ceiling, know enough
//             (z ≥ Z_FARM) and have domesticates (the zones' seasonally dry climates: after Blumler
//             via Diamond, from memory); packages spread by contact, slowed by the climate's
//             distance from where they began.
//   industry  starts where z passes Z_IND near coal (the fossil map seeded on the opening's lowland
//             basins and shelves, a9, 2026-11-15), then spreads by contact. One world economy
//             (`industrialStep`): Y = A(z) K^α L^{1−α} (standard forms; α ⅓, saving ¼), held to the
//             energy it gets (Leontief in energy, its intensity falling with z); fixed capital
//             (δ 5%/yr), energy capital for fossil carbon (its return falling as it's drawn down),
//             surface renewables (capped at F_SUN of absorbed sunlight) and fusion, and compute
//             (δ 25%/yr); investment to energy first, then between fixed capital and compute by
//             their marginal products; building needs materials, whose energy cost rises as ores'
//             grades fall (Goeller and Weinberg; Skinner's barrier; from memory).
//   AI        capital that does labour (synthesis on Aghion, Jones and Jones; Davidson; from memory):
//             compute × χ(z) labour-equivalents (rising e-fold per unit of z to X_MAX, speculation),
//             drawing power. A share β(z) of tasks can be automated; within them AI and people
//             substitute until AI fills them, and past that the tasks combine at elasticity σ
//             (`taskLabor`): σ < 1 with β < 1 bounds output (Baumol), β → 1 frees it. Production
//             and research alike.
//   heat      surface solar is heat-neutral to first order; fossil carbon and fusion add heat, and
//             together are capped at HEAT_MAX W/m² (the radiator's ceiling, an input until the
//             ending is chosen). Sulfate from coal cools, scrubbed as culture grows.
//   lineages  a lineage whose range stays broken into isolated pieces for T_SPLIT splits; gene flow
//             where lineages meet mixes their traits and ancestry, and two that keep sharing most of
//             the smaller's range for T_MERGE become one (soft species, synthesis). The first
//             hominins are placed in the best tree–grass mosaic on the landmass that can hold the
//             most of them (speculation).
//
// Units: years, km, people, z in e-folds; output in subsistence-years a year (sy/yr, a person's
// subsistence a year), capital in sy; energy in W; carbon in Pg C.
import { NZ } from '../../src/engine/climate.js';
import { miami } from '../../src/engine/vegetation.js';
import { regolithStep } from '../../src/engine/regolith.js';
import { stream } from '../../src/rng.js';

export const PEOPLE = {
  // Habitat (synthesis)
  B0: 0.03, NPP_REF: 0.4,          // foragers per km² at NPP_REF kg C m⁻² yr⁻¹ of accessible NPP (Binford's order, from memory)
  TREE_EDIBLE: 0.4,                // trees' NPP's share a forager reaches, against grass's
  COAST: 0.5, P_DRY: 250, Q_RIVER: 200, ICE_MAX: 10,   // the coast's bonus; rain (mm) below which water limits; a river (m³/s); ice (m)
  T_COLD0: 2, K_COLD: 5, W_COLD: 3, // coldest month (°C) a culture of z holds: T_COLD0 − K_COLD z, over W_COLD
  CAP_F: 8,                        // foraging's ceiling on the base density
  F0: 1.5, CAP_A: 100,             // farmers per km² at adoption (at NPP_REF), and the organic economy's ceiling on its growth (~150/km² of good farmland at the top, as pre-industrial China's and Egypt's, from memory)
  E_AG: 200,                       // W of industrial energy a person fed past the organic ceiling takes (fertilizer, machines, transport; rough, from memory)
  CO2_FERT: 0.25,                  // crops' yield × (1 + β ln(CO₂/280)), VECODE's β
  // Soil (a renewable stock)
  H_YIELD: 0.3,                    // m: the yield's e-folding in soil depth (topsoil)
  E_TILL: 1, S_REF: 0.005, Z_CONS: 2,   // mm/yr of tillage's erosion at slope S_REF, falling e-fold per Z_CONS of culture past Z_FARM
  // People
  R0: 0.02,                        // logistic rate (/yr)
  D0: 4, D_Z: 0.35, D_MAX: 3000, H_SLOPE: 1.5,   // dispersal km²/yr, its rise per unit z, cap; relief's cost (km)
  Y0: 8, Y_DT: 12,                 // income (in subsistence) where the demographic transition starts, and over which growth fades (Earth's population still grew ~2%/yr at ~10× and ~1.3% at ~25×; Maddison's and the UN's series, from memory)
  // Ideas
  THETA: 1, A_INV: 6e-12, PSI: 1, LAMBDA: 1e-5, ETA: 0.3,   // A: von Foerster's C = 1/(θA) ≈ 1.7e11 person-years; λ: Tasmania's loss (~10% in 10 kyr)
  L_C0: 50, Z_L: 1.5, L_CMAX: 2e4,  // contact length (km) at g + z = 0, ×e per Z_L, at most
  V0: 1, Z_V: 1.5,                  // copying's pace ×e per Z_V of culture
  COPY: 2e-3, ACC: 2e-3,           // copying better neighbours, and other lineages in the cell (/yr at z = 0)
  RHO_R: 0.5, S_R_MAX: 3,          // research intensity ∝ y^ρ, capped
  Z_BOAT: 1.5, L_SEA: 300, HOPS: 6, // sea crossings: the reach (km per unit z past Z_BOAT); cells of sea a crossing spans at most
  // The trait (speculation: social reach as a clock)
  V_G: 2e-3, T_GEN: 25, S_BG: 0.04, NE_SHARE: 0.1, G_MAX: 9,   // the trait lengthens contact, up to G_MAX (ℓ at L_CMAX)
  K_G: 0.1,                        // … and raises foraging's yield, e^{K_G g} (cooking, hunting: speculation)
  // Lineages
  L_MAX: 12, CHECK: 10e3, T_SPLIT: 200e3, P_MIN: 3000, N_MIN: 0.003, P_EXT: 100, GENE_FLOW: 2e-3,   // N_MIN per km²
  MERGE: 0.5, T_MERGE: 50e3,       // lineages sharing this much of the smaller's range for T_MERGE become one
  // Farming
  Z_FARM: 3, W_FARM: 0.25, H_FARM: 2e-6, SED: 0.6, R_ADOPT: 0.02, C_FARM: 4e-3, W_PKG: 2,
  DOMESTIC: { Af: 0.1, Am: 0.2, Aw: 0.5, As: 0.5, BS: 0.5, Cf: 0.3, Cs: 1, Cw: 0.7, Df: 0.1, Ds: 0.2, Dw: 0.2 },
  // Industry: where it starts and how it spreads
  Z_IND: 7, COAL_MIN: 5, C_IND: 4e-3, R_IND: 0.05, FOSSIL: 5000, COAL_SHARE: 0.6, CO2_0: 280,
  J_PGC: 4e19,                     // J per Pg C of fossil carbon (~40 MJ per kg C)
  // The industrial economy (standard forms; Earth's values from memory)
  A_I0: 0.6, ALPHA: 1 / 3, SAVE: 0.25, LFP: 0.5,   // TFP at Z_IND (≈ a subsistence-year a worker at its Solow balance), capital's share, saving, workers' share
  DELTA_F: 0.05, DELTA_C: 0.25, DELTA_E: 0.04,      // wear: fixed capital, compute, energy capital (/yr)
  E_SUB: 200, Z_EFF: 2.7, E_MIN_Y: 2,               // W per sy/yr of output at Z_IND (~80 at Earth's present), falling e-fold per Z_EFF, at least
  R_EF0: 1000, R_ER0: 1500, R_EU0: 1000,            // W per sy of energy capital: fossil (full stock, × √ of what's left), renewables and fusion when mature (solar near parity with fossil at Earth's present, from memory)
  Z_REN: 11.5, W_REN: 0.5, Z_FUS: 12.5, W_FUS: 0.5, // where renewables and fusion come of age: fossil carbon is still the cheaper delivered energy at the takeoff's start (Z_AI), as on Earth now (a9)
  MARGIN: 0.05, T_BUILD: 5, F_IE: 0.6,              // energy capacity's margin; years to close a shortfall; energy's most of investment
  M_K: 1, E_M0: 30, X_SCALE: 2e13, X_CRUST: 1e14, SKINNER: 10,   // materials per sy invested; their energy (W per unit a year), rising e-fold per X_SCALE drawn, ×SKINNER past the crust's rich ores
  Z_SPACE: Infinity, E_SPACE: 100,                  // an off-world backstop on materials' energy (asteroids): off until the ending is chosen
  AER: 0.11, Z_SCRUB: 2,                            // sulfate's forcing, W/m² per Pg C/yr of coal (~−1.1 at 10, from memory), scrubbed e-fold per Z_SCRUB
  // AI (speculation)
  Z_AI: 11, W_AI: 0.7, B_MAX: 1, SIGMA: 0.5,        // where tasks automate (β = B_MAX σ((z − Z_AI)/W_AI)); the tasks' elasticity
  X_AI: 1e-3, THETA_AI: 1, X_MAX: 1e4, W_C: 12, S_AI_R: 0.5,   // labour-equivalents per sy of compute at Z_AI, ×e per 1/θ_AI, at most; its power (W/sy); its share in research
  // Energy and heat
  B_EBM: 2.09, SUN_ABS: 1.2e17, F_SUN: 0.05, HEAT_MAX: 11.8,   // B (W m⁻² K⁻¹); absorbed sunlight (W); surface renewables' most; the heat fossil carbon and fusion may add (W/m²)
  // Stepping
  DT_MAX: 500, DZ_MAX: 0.05, DT_MIN: 1e-5, NSUB_MAX: 4,
  Z_SAT: 30,                       // culture past which nothing here changes (χ at X_MAX, β at B_MAX, energy's intensity at its floor, every source mature): held there (synthesis)
};
const ZN = ['Af', 'Am', 'Aw', 'As', 'BW', 'BS', 'Cf', 'Cs', 'Cw', 'Df', 'Ds', 'Dw', 'ET', 'EF'];
const R = 6371, YEAR_S = 3.156e7, AREA_M2 = 4 * Math.PI * (R * 1e3) ** 2;
const sig = x => 1 / (1 + Math.exp(-x));
const ex = x => Math.exp(Math.min(x, 300));
const deg = r => r * 180 / Math.PI;

/**
 * Labour from people Lh and AI's labour-equivalents A when a share β of tasks can be automated
 * (synthesis on Aghion, Jones and Jones's task model): within the automatable tasks AI and people
 * substitute perfectly, so while A ≤ β/(1 − β) Lh the total is Lh + A; past that the people have
 * all moved to the other tasks, and the two kinds combine at elasticity σ,
 * [β^{1/σ} A^ρ + (1 − β)^{1/σ} Lh^ρ]^{1/ρ}, ρ = (σ − 1)/σ (continuous at the boundary). With
 * σ < 1 and β < 1 it is bounded by (1 − β)^{1/(σ−1)} Lh however much AI there is (Baumol).
 * Returns L and ∂L/∂A.
 */
export function taskLabor(Lh, A, beta, sigma) {
  if (!(A > 0) || !(beta > 0)) return { L: Lh, dLdA: beta > 0 ? 1 : 0 };
  if (beta >= 1) return { L: Lh + A, dLdA: 1 };
  if (A <= beta / (1 - beta) * Lh) return { L: Lh + A, dLdA: 1 };
  if (Math.abs(sigma - 1) < 1e-6) {
    const L = Math.pow(A / beta, beta) * Math.pow(Lh / (1 - beta), 1 - beta);
    return { L, dLdA: beta * L / A };
  }
  const rho = (sigma - 1) / sigma, wa = Math.pow(beta, 1 / sigma), wl = Math.pow(1 - beta, 1 / sigma);
  // In logs, so huge A neither overflows nor loses Lh.
  const la = Math.log(A), ll = Math.log(Math.max(Lh, 1e-300)), xa = Math.log(wa) + rho * la, xl = Math.log(wl) + rho * ll;
  const mx = Math.max(xa, xl), lu = mx + Math.log(Math.exp(xa - mx) + Math.exp(xl - mx)), lL = lu / rho;
  const L = Math.exp(Math.min(lL, 700));
  return { L, dLdA: Math.exp(Math.min(Math.log(wa) + (1 - rho) * lL + (rho - 1) * la, 700)) };
}

/** A fresh industrial economy (before industry: off). */
export function newEconomy(P) {
  return { on: false, Kf: 0, Kc: 0, Ke: [0, 0, 0], S: P.FOSSIL, X: 0, I: 0, Y: 0, Ypot: 0, avail: 1, A: 0, chi: 0, beta: 0, AAI: 0, AIr: 0,
    need: 0, Ef: 0, Er: 0, Eu: 0, Emat: 0, Ecomp: 0, burned: 0, heat: 0, aer: 0, Lh: 0, z: 0 };
}

/**
 * One step of the world's industrial economy over dt years, given its workers Lh and its culture
 * z (the industrial cells' mean): output held to the energy it gets, investment to energy first and
 * then between fixed capital and compute by their marginal products, capital worn and built exactly
 * for a steady inflow, fossil carbon burned, materials drawn.
 */
export function industrialStep(E, { Lh, z }, dt, P) {
  const rr = P.R_ER0 * sig((z - P.Z_REN) / P.W_REN), ru = P.R_EU0 * sig((z - P.Z_FUS) / P.W_FUS);
  const rf = E.S > 0 ? P.R_EF0 * Math.sqrt(E.S / P.FOSSIL) : 0;
  const A = P.A_I0 * ex(P.THETA * (z - P.Z_IND));
  const chiRaw = P.X_AI * ex(P.THETA_AI * (z - P.Z_AI)), chi = chiRaw / (1 + chiRaw / P.X_MAX);
  const beta = P.B_MAX * sig((z - P.Z_AI) / P.W_AI);
  const AAI = E.Kc * chi;
  // Energy: compute's power, materials' for building, output's (its intensity falling with z).
  const eY = Math.max(P.E_MIN_Y, P.E_SUB * Math.exp(-(z - P.Z_IND) / P.Z_EFF));
  let em = P.E_M0 * ex(E.X / P.X_SCALE) * (E.X > P.X_CRUST ? P.SKINNER : 1);
  if (z > P.Z_SPACE) em = Math.min(em, P.E_SPACE);
  const Emat = em * P.M_K * E.I, Ecomp = P.W_C * E.Kc;
  // Capacities; dispatch renewables, then fusion, then fossil carbon, against what's wanted at
  // full power (compute and materials, and the output the factors could make).
  const capR = P.F_SUN * P.SUN_ABS, capU = P.HEAT_MAX * AREA_M2;   // fusion's ceiling is the radiator's, shared with fossil carbon below
  const cf = E.Ke[0] * rf, cr = Math.min(E.Ke[1] * rr, capR), cu = Math.min(E.Ke[2] * ru, capU);
  const T0 = taskLabor(Lh, (1 - P.S_AI_R) * AAI, beta, P.SIGMA);
  const Yfull = A * Math.pow(Math.max(E.Kf, 0), P.ALPHA) * Math.pow(T0.L, 1 - P.ALPHA);
  const need = eY * Yfull + Emat + Ecomp;
  // Fossil carbon and fusion share the radiator's ceiling (surface renewables don't add heat).
  const Er = Math.min(cr, need), Eu = Math.min(cu, need - Er), Ef = Math.min(cf, Math.max(0, need - Er - Eu), Math.max(0, capU - Eu));
  const sup = Er + Eu + Ef;
  // The energy, in order: compute first (it runs on power alone), then materials, then output.
  const Ec = Math.min(Ecomp, sup), Em = Math.min(Emat, sup - Ec), Eo = sup - Ec - Em;
  const aiOn = Ecomp > 0 ? Ec / Ecomp : 1, T = taskLabor(Lh, (1 - P.S_AI_R) * AAI * aiOn, beta, P.SIGMA);
  const Ypot = A * Math.pow(Math.max(E.Kf, 0), P.ALPHA) * Math.pow(T.L, 1 - P.ALPHA);
  const Y = Math.min(Ypot, Eo / eY), avail = Ypot > 0 ? Y / Ypot : 1;
  // Investment: energy first (wear, and the shortfall closed over T_BUILD, to the best returns
  // among sources with room), the rest by marginal products.
  const I = P.SAVE * Y;
  const heatRoom = cf + cu < 0.999 * capU, rets = [heatRoom ? rf : 0, cr < 0.999 * capR ? rr : 0, heatRoom ? ru : 0], w = rets.map(r => r ** 4), ws = w[0] + w[1] + w[2];
  const gap = Math.max(0, need * (1 + P.MARGIN) - (cf + cr + cu));
  let Ie = 0, Ies = [0, 0, 0];
  if (ws > 0) {
    const rbar = (w[0] * rets[0] + w[1] * rets[1] + w[2] * rets[2]) / ws;
    Ie = Math.min(P.F_IE * I, P.DELTA_E * (E.Ke[0] + E.Ke[1] + E.Ke[2]) + gap / (rbar * P.T_BUILD));
    Ies = w.map(v => Ie * v / ws);
  }
  const Ir = Math.max(0, I - Ie);
  const MPf = E.Kf > 0 ? P.ALPHA * Y / E.Kf : Infinity;
  const MPc = T.L > 0 ? (1 - P.ALPHA) * Y / T.L * T.dLdA * (1 - P.S_AI_R) * chi : 0;
  const wc = MPf === Infinity || !(MPc > 0) ? 0 : 1 / (1 + Math.pow(MPf / MPc, 4));
  const grow = (K, inflow, d) => K * Math.exp(-d * dt) + inflow * (1 - Math.exp(-d * dt)) / d;
  E.Kf = grow(E.Kf, Ir * (1 - wc), P.DELTA_F); E.Kc = grow(E.Kc, Ir * wc, P.DELTA_C);
  E.Ke = E.Ke.map((K, s) => grow(K, Ies[s], P.DELTA_E));
  const burned = Math.min(E.S, Ef * YEAR_S * dt / P.J_PGC);
  E.S -= burned; E.X += P.M_K * I * dt; E.I = I;
  E.sup = sup;
  Object.assign(E, { Y, Ypot, avail, A, chi, beta, AAI: AAI * aiOn, AIr: P.S_AI_R * AAI * aiOn, need, Ef, Er, Eu, Emat, Ecomp, burned, Lh, z, eY, em, wc });
  E.heat = (Ef + Eu) / AREA_M2;
  E.aer = dt > 0 ? -P.AER * (burned / dt) * Math.exp(-Math.max(0, z - P.Z_IND) / P.Z_SCRUB) : 0;
  return E;
}

/** The cached planet's own soil and air: the regolith stepped here, CO₂ by the Pulse's shares. */
class CachedEnv {
  constructor(p) { this.p = p; this.box = [0, 0, 0]; }
  co2() { const b = this.box; return this.p.P.CO2_0 + (b[0] + b[1] + b[2]) / 2.12; }
  // The Pulse experiment's shares as a response (synthesis): 0.807 at 150 yr, 0.14 at 5 kyr, 0.053 at 140 kyr.
  emit(PgC, dt) {
    const a = [0.807, 0.14, 0.053], tau = [150, 5000, 140000];
    for (let k = 0; k < 3; k++) this.box[k] = this.box[k] * Math.exp(-dt / tau[k]) + a[k] * PgC;
  }
  soil(dt, Ef) {
    const p = this.p, h = p.soil;
    for (let c = 0; c < p.nL; c++) if (p.H.alive[c]) h[c] = regolithStep(h[c], p.H.p0[c], (p.H.ero[c] + Ef[c]) * 1e-3, dt);
  }
}

export class People {
  constructor(planet, params = {}) {
    this.P = { ...PEOPLE, ...params };
    this.planet = planet;
    this.rng = stream(planet.seed, 'people');
    this.t = 0; this.events = []; this.history = []; this.lineages = []; this.nextId = 0;
    this.index(); this.rates(planet); this.graph(); this.fossilMap();
    const nL = this.nL;
    this.soil = new Float64Array(nL);
    for (let c = 0; c < nL; c++) this.soil[c] = planet.reg ? planet.reg[this.cells[c]] : 1;
    this.Ef = new Float64Array(nL);
    this.f = new Float32Array(nL); this.pkg = new Int16Array(nL).fill(-1); this.packages = [];
    this.ind = new Float32Array(nL);
    this.Ntot = new Float64Array(nL); this.Out = new Float64Array(nL); this.goods = new Float64Array(nL);
    this.econ = newEconomy(this.P);
    this.env = new CachedEnv(this);
    this.flags = {}; this.co2 = this.P.CO2_0; this.O = 0; this.people = 0; this.lastRate = 0; this.emitted = 0;
    this.forcing = { heat: 0, aer: 0 };
  }

  // ---- The planet ------------------------------------------------------------------------
  // The land cells (fixed at the opening; one that drowns or freezes over is closed, not dropped).
  index() {
    const P = this.P, pl = this.planet, g = pl.grid, n = g.n;
    const loc = new Int32Array(n).fill(-1), cells = [];
    for (let i = 0; i < n; i++) if (pl.elev[i] > 0 && pl.ice[i] < P.ICE_MAX) { loc[i] = cells.length; cells.push(i); }
    const nL = cells.length;
    Object.assign(this, { loc, cells: Int32Array.from(cells), nL });
    this.H = {
      area: new Float64Array(nL), b: new Float64Array(nL), a: new Float64Array(nL), Tc: new Float64Array(nL),
      D: new Float64Array(nL), coast: new Uint8Array(nL), lat: new Float64Array(nL), lon: new Float64Array(nL),
      elev: new Float64Array(nL), zv: new Float32Array(14 * nL), deg: new Uint8Array(nL), mosaic: new Float64Array(nL),
      alive: new Uint8Array(nL), p0: new Float64Array(nL), ero: new Float64Array(nL), slope: new Float64Array(nL),
    };
    const H = this.H;
    for (let c = 0; c < nL; c++) {
      const i = cells[c];
      H.area[c] = g.area[i] * R * R;
      H.deg[c] = g.nbrOff[i + 1] - g.nbrOff[i];
      const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2];
      H.lat[c] = Math.asin(z); H.lon[c] = Math.atan2(y, x);
    }
  }

  /** The rates the planet sets, from its fields (once on the cached opening; after each climate cycle when live). */
  rates(f) {
    const P = this.P, g = f.grid, H = this.H, cells = this.cells, nL = this.nL;
    const dw = ZN.map(z => P.DOMESTIC[z] || 0);
    for (let c = 0; c < nL; c++) {
      const i = cells[c];
      H.alive[c] = f.elev[i] > 0 && f.ice[i] < P.ICE_MAX ? 1 : 0;
      let Ta = 0, Pa = 0, Tc = 99;
      for (let m = 0; m < 12; m++) { const T = f.T12[12 * i + m]; Ta += T / 12; Pa += f.P12[12 * i + m]; Tc = Math.min(Tc, T); }
      const ft = f.ft[i], fg = f.fg[i];
      const river = f.discharge[i] > P.Q_RIVER || f.lake[i] > 0.05;
      const water = river ? 1 : Math.min(1, Pa / P.P_DRY);
      let coast = 0, slope = 0;
      for (let o = g.nbrOff[i]; o < g.nbrOff[i + 1]; o++) {
        const j = g.nbr[o];
        if (!(f.elev[j] > 0)) coast = 1;
        else slope = Math.max(slope, Math.abs(f.elev[i] - f.elev[j]) / (g.dist[o] * R));
      }
      const acc = f.npp[i] * (fg + P.TREE_EDIBLE * ft);
      H.b[c] = H.alive[c] ? P.B0 * acc / P.NPP_REF * water * (1 + P.COAST * coast) : 0;
      const nppPot = 0.45e-3 * miami(Ta, Pa);
      const arable = (1 - f.perma[i]) * (f.elev[i] < 3 ? 1 : 0.3) * (river ? 1 : Math.min(1, Pa / 400));
      H.a[c] = H.alive[c] ? P.F0 * nppPot / P.NPP_REF * arable : 0;
      H.Tc[c] = Tc; H.coast[c] = coast; H.elev[c] = f.elev[i]; H.slope[c] = slope;
      let D = 0, zz = 0;
      for (let k = 0; k < 14; k++) { const p = f.zones[NZ * i + k]; D += dw[k] * p; zz += p * p; }
      H.D[c] = D;
      zz = Math.sqrt(zz) || 1;
      for (let k = 0; k < 14; k++) H.zv[14 * c + k] = f.zones[NZ * i + k] / zz;
      H.mosaic[c] = H.b[c] * 4 * ft * fg * sig((Tc - P.T_COLD0 - 10) / P.W_COLD);
      H.p0[c] = f.p0 ? f.p0[i] : 1e-4; H.ero[c] = f.ero ? f.ero[i] : 0;
    }
  }

  // Edges between land cells (with the relief's cost) and crossings of up to HOPS sea cells (with
  // their length), in one CSR.
  graph() {
    const P = this.P, pl = this.planet, g = pl.grid, { loc, cells, nL } = this;
    const lists = Array.from({ length: nL }, () => []);
    for (let c = 0; c < nL; c++) {
      const i = cells[c];
      for (let o = g.nbrOff[i]; o < g.nbrOff[i + 1]; o++) {
        const j = g.nbr[o], d = loc[j];
        if (d < 0) continue;
        lists[c].push([d, g.ell[o] / g.dist[o], Math.exp(-Math.abs(pl.elev[i] - pl.elev[j]) / P.H_SLOPE), g.dist[o] * R, 0]);
      }
    }
    // Crossings: a breadth-first walk through open sea from each coastal cell.
    const seen = new Int32Array(g.n).fill(-1), dkm = new Float64Array(g.n);
    let hopEdges = 0;
    for (let c = 0; c < nL; c++) {
      if (!this.H.coast[c]) continue;
      const i = cells[c], best = new Map();
      let front = [i]; seen[i] = c; dkm[i] = 0;
      for (let h = 1; h <= P.HOPS + 1 && front.length; h++) {
        const next = [];
        for (const u of front) for (let o = g.nbrOff[u]; o < g.nbrOff[u + 1]; o++) {
          const v = g.nbr[o];
          if (seen[v] === c) continue;
          if (pl.elev[v] > 0) {
            if (u === i) continue;   // a neighbour by land: already an edge
            const d = loc[v];
            if (d >= 0 && d !== c) { const L = dkm[u] + g.dist[o] * R; if (!best.has(d) || best.get(d)[1] > L) best.set(d, [h - 1, L]); }
            continue;
          }
          if (h > P.HOPS) continue;
          seen[v] = c; dkm[v] = dkm[u] + g.dist[o] * R; next.push(v);
        }
        front = next;
      }
      for (const [d, [hops, L]] of best) if (hops >= 1) { lists[c].push([d, 1, 1, L, hops]); hopEdges++; }
    }
    const off = new Int32Array(nL + 1);
    for (let c = 0; c < nL; c++) off[c + 1] = off[c] + lists[c].length;
    const m = off[nL], E = { off, nb: new Int32Array(m), cond: new Float64Array(m), slope: new Float64Array(m), km: new Float64Array(m), hop: new Uint8Array(m) };
    for (let c = 0; c < nL; c++) lists[c].forEach(([d, cd, s, km, hop], k) => { const o = off[c] + k; E.nb[o] = d; E.cond[o] = cd; E.slope[o] = s; E.km[o] = km; E.hop[o] = hop; });
    this.E = E; this.hopEdges = hopEdges;
    // The same edges once each, flat, for the spread.
    const fa = [], fb = [], fk = [], fh = [];
    for (let c = 0; c < nL; c++) for (let o = off[c]; o < off[c + 1]; o++) if (E.nb[o] > c) {
      fa.push(c); fb.push(E.nb[o]); fh.push(E.hop[o]); fk.push(E.hop[o] ? E.km[o] : E.cond[o] * E.slope[o]);
    }
    this.F = { a: Int32Array.from(fa), b: Int32Array.from(fb), k: Float64Array.from(fk), hop: Uint8Array.from(fh), m: fa.length };
    // Each cell's one ring by land (itself and its land neighbours): its area, for the minds' density.
    this.ringArea = new Float64Array(nL);
    for (let c = 0; c < nL; c++) { let A = this.H.area[c]; for (let o = off[c]; o < off[c + 1]; o++) if (!E.hop[o]) A += this.H.area[E.nb[o]]; this.ringArea[c] = A; }
    this.dx = 0; let k = 0;
    for (let o = 0; o < m; o++) if (!E.hop[o]) { this.dx += E.km[o]; k++; }
    this.dx /= k;
  }

  // The seeded fossil carbon (a9, 2026-11-15): coal in wet, forested lowlands, oil on the shelves,
  // each cell's share lognormal about its setting's weight (synthesis). Coal within reach of a land
  // cell is the resolvent of the coal over the land at τ 0.85 (a few cells). The economy draws on
  // the whole (one world market once industry spreads); the map says where industry can start.
  fossilMap() {
    const P = this.P, pl = this.planet, g = pl.grid, { nL, cells, E } = this, r = stream(pl.seed, 'people:fossil');
    const coal = this.coal = new Float64Array(nL);
    let cs = 0;
    for (let c = 0; c < nL; c++) {
      const i = cells[c], e = pl.elev[i];
      if (e < 0.6) coal[c] = pl.ft[i] * pl.npp[i] * (0.6 - e) * Math.exp(1.2 * r.normal());
      cs += coal[c];
    }
    for (let c = 0; c < nL; c++) coal[c] *= P.FOSSIL * P.COAL_SHARE / cs;
    const reach = this.coalReach = Float64Array.from(coal);
    for (let s = 0; s < 40; s++) for (let c = 0; c < nL; c++) {
      let acc = coal[c];
      for (let o = E.off[c]; o < E.off[c + 1]; o++) if (!E.hop[o]) acc += 0.85 / this.H.deg[c] * reach[E.nb[o]];
      reach[c] = acc;
    }
  }

  // ---- Lineages ---------------------------------------------------------------------------
  newLineage(parent, born, g) {
    const nL = this.nL, id = this.nextId++;
    const L = { id, parent: parent ? parent.id : -1, born, died: null, g, anc: new Map([[id, 1]]),
      N: new Float64Array(nL), Z: new Float64Array(nL), M: new Float64Array(nL), K: new Float64Array(nL),
      total: 0, zbar: 0, zmax: 0, peak: 0, multiSince: null, tipped: null, lat: 0, lon: 0 };
    this.lineages.push(L);
    return L;
  }
  // The first hominins: the best tree–grass mosaic on the landmass that can hold the most of them
  // (a radiation of apes lives on a continent, not an islet).
  seed() {
    const H = this.H, nL = this.nL, body = this.components(() => true, 0);
    const room = new Float64Array(body.count);
    for (let c = 0; c < nL; c++) room[body.id[c]] += H.area[c] * H.b[c] * this.coldOK(c, 0);
    let home = 0; for (let k = 1; k < body.count; k++) if (room[k] > room[home]) home = k;
    let best = -1;
    for (let c = 0; c < nL; c++) if (body.id[c] === home && (best < 0 || H.mosaic[c] > H.mosaic[best])) best = c;
    const L = this.newLineage(null, 0, 0);
    L.lat = H.lat[best]; L.lon = H.lon[best];
    const E = this.E, seedCells = [best];
    for (let o = E.off[best]; o < E.off[best + 1]; o++) if (!E.hop[o]) seedCells.push(E.nb[o]);
    for (const c of seedCells) L.N[c] = 0.5 * H.area[c] * H.b[c];
    this.event('origin', `the first hominins at ${deg(L.lat).toFixed(0)}°, ${deg(L.lon).toFixed(0)}° (b ${H.b[best].toFixed(3)}/km²)`);
    return L;
  }
  event(kind, text) { this.events.push({ t: this.t, kind, text }); if (this.onEvent) this.onEvent(this.t, kind, text); }

  // ---- The step ---------------------------------------------------------------------------
  coldOK(c, z) { const P = this.P; return sig((this.H.Tc[c] - (P.T_COLD0 - P.K_COLD * z)) / P.W_COLD); }
  soilYield(c) { return 1 - Math.exp(-this.soil[c] / this.P.H_YIELD); }
  capacity(L) {
    const P = this.P, H = this.H, nL = this.nL, f = this.f, ind = this.ind, eg = Math.exp(P.K_G * L.g);
    // K at each cell's own culture, and K2 at the lineage's best (what its migrants could make of a
    // cell: the spread's weights; crowding uses K).
    let zb = 0;
    for (let c = 0; c < nL; c++) if (L.N[c] > 0 && L.Z[c] > zb) zb = L.Z[c];
    if (!L.K2) L.K2 = new Float64Array(nL);
    this.capAt(L, L.Z, L.K, eg); this.capAt(L, null, L.K2, eg, zb);
  }
  capAt(L, Zs, K, eg, zConst = 0) {
    const P = this.P, H = this.H, nL = this.nL, f = this.f, ind = this.ind;
    // Industry lifts farming past the organic ceiling as far as farming's own energy is met (E_AG a person fed).
    const fert = Math.max(0.5, 1 + P.CO2_FERT * Math.log(this.co2 / P.CO2_0)), lift = this.econ.on ? Math.min(1, (this.econ.sup || 0) / Math.max(1, P.E_AG * this.people)) : 0;
    for (let c = 0; c < nL; c++) {
      if (!H.alive[c]) { K[c] = 0; continue; }
      const z = Zs ? Zs[c] : zConst, ez = ex(P.THETA * z);
      const PF = ez / (1 + (ez - 1) / P.CAP_F);
      let farm = 0;
      if (f[c] > 0) {
        const x = ex(P.THETA * (z - P.Z_FARM)), cap = x / (1 + (x - 1) / P.CAP_A);
        const PA = (1 - ind[c]) * cap + ind[c] * (cap + (x - cap) * lift);
        farm = f[c] * H.a[c] * this.suit(this.pkg[c], c) * PA * this.soilYield(c) * fert;
      }
      K[c] = H.area[c] * this.coldOK(c, z) * ((1 - f[c]) * H.b[c] * PF * eg + farm);
    }
  }
  suit(q, c) {
    if (q < 0) return 0;
    const o = this.packages[q].zv, zv = this.H.zv; let s = 0;
    for (let k = 0; k < 14; k++) s += o[k] * zv[14 * c + k];
    return Math.pow(Math.max(0, s), this.P.W_PKG);
  }
  reachL(gz) { const P = this.P; return Math.min(P.L_CMAX, P.L_C0 * Math.exp(Math.max(0, gz) / P.Z_L)); }
  speed(z) { const P = this.P; return P.V0 * Math.exp(Math.min(z, 60) / P.Z_V); }
  Dz(z) { const P = this.P; return Math.min(P.D_MAX, P.D0 * Math.exp(P.D_Z * z)); }
  seaReach(z) { const P = this.P; return z > P.Z_BOAT ? P.L_SEA * (z - P.Z_BOAT) : 0; }

  step(dtWanted) {
    const P = this.P, nL = this.nL, live = this.lineages.filter(L => L.died === null);
    const Ntot = this.Ntot, prof = this.prof || (this.prof = {});
    let tq = performance.now();
    const lap = k => { const t1 = performance.now(); prof[k] = (prof[k] || 0) + t1 - tq; tq = t1; };
    this.compCache = new Map();
    this.co2 = this.env.co2();
    // Capacity and the cells' totals.
    Ntot.fill(0);
    for (const L of live) { this.capacity(L); for (let c = 0; c < nL; c++) Ntot[c] += L.N[c]; }
    const dt = dtWanted;
    // People: Lotka–Volterra competition with α = 1 (one niche), dN_k/dt = r N_k (1 − N_all/K_k).
    // Exactly: the cell's total is logistic toward the harmonic mean of its lineages' capacities,
    // and each lineage's share moves as d ln(N_k/N_l)/dt = r N_all (1/K_l − 1/K_k), so the higher
    // capacity excludes the lower (standard). Growth fades past the transition by income (food and
    // goods over people) where industry lifted it (an empty frontier's high income is land, and
    // frontiers grow fast; Galor and Weil tie the transition to industry's demand for skill).
    const lw = this.lw || (this.lw = new Float64Array(64));
    for (let c = 0; c < nL; c++) {
      const Nt = Ntot[c];
      if (!(Nt > 1e-6)) { for (const L of live) L.N[c] = 0; continue; }
      let inv = 0;
      for (const L of live) if (L.N[c] > 0) inv += L.N[c] / Nt / Math.max(L.K[c], 1e-12);
      const Kh = 1 / inv, y = (Kh + this.goods[c]) / Nt;
      const r = P.R0 * (y > P.Y0 ? Math.exp(-this.ind[c] * (y - P.Y0) / P.Y_DT) : 1);
      let Nn;
      if (Kh > 1e-9) { const e = Math.exp(Math.min(50, r * dt)); Nn = Kh * Nt * e / (Kh + Nt * (e - 1)); }
      else Nn = Nt * Math.exp(-dt / 20);
      const Nbar = 0.5 * (Nt + Nn);
      let mx = -Infinity;
      live.forEach((L, k) => { lw[k] = L.N[c] > 0 ? Math.log(L.N[c]) - r * Nbar * dt / Math.max(L.K[c], 1e-12) : -Infinity; if (lw[k] > mx) mx = lw[k]; });
      let sw = 0;
      live.forEach((L, k) => { lw[k] = lw[k] === -Infinity ? 0 : Math.exp(lw[k] - mx); sw += lw[k]; });
      live.forEach((L, k) => { const v = Nn * lw[k] / sw; L.N[c] = v > 1e-6 ? v : 0; });
    }
    lap('growth');
    if (this.debug) this.check('growth', live);
    // Spread: Fisher–KPP, culture carried with the migrants (upwind).
    for (const L of live) this.diffuse(L, dt);
    if (this.debug) this.check('spread', live);
    lap('spread');
    Ntot.fill(0);
    for (const L of live) for (let c = 0; c < nL; c++) Ntot[c] += L.N[c];
    // Food, the industrial economy, goods; emissions and forcing.
    this.economy(live, dt);
    if (this.debug) this.check('economy', live);
    lap('economy');
    // Minds within reach, and culture.
    let rate = 0;
    for (const L of live) rate = Math.max(rate, this.culture(L, live, dt));
    this.lastRate = rate;
    if (this.debug) this.check('culture', live);
    lap('culture');
    // The trait, gene flow, farming and its soil, industry's spread, the books.
    this.trait(live, dt); lap('trait');
    this.farming(live, dt);
    this.soilStep(dt);
    lap('farming');
    this.industry(live, dt);
    this.t += dt;
    if (Math.floor(this.t / P.CHECK) !== Math.floor((this.t - dt) / P.CHECK)) this.books();
    this.record(live, dt); lap('books');
    return dt;
  }

  check(phase, live) {
    const bad = a => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return i; return -1; };
    for (const L of live) for (const k of ['N', 'Z', 'M', 'K']) { const i = bad(L[k]); if (i >= 0) throw new Error(`${phase}: lineage ${L.id} ${k}[${i}] = ${L[k][i]} (N ${L.N[i]}, Z ${L.Z[i]}, K ${L.K[i]}, M ${L.M[i]}, g ${L.g}) at t ${this.t}`); }
    for (const L of live) if (!Number.isFinite(L.g)) throw new Error(`${phase}: g of ${L.id}`);
    for (const k of ['Kf', 'Kc', 'Y', 'S']) if (!Number.isFinite(this.econ[k])) throw new Error(`${phase}: econ.${k} = ${this.econ[k]} at t ${this.t}`);
  }

  diffuse(L, dt) {
    const H = this.H, F = this.F, nL = this.nL, N = L.N, Z = L.Z;
    let zmax = 0;
    for (let c = 0; c < nL; c++) if (N[c] > 0 && Z[c] > zmax) zmax = Z[c];
    const Dm = this.Dz(zmax), reach = this.seaReach(zmax);
    const row = this.row || (this.row = new Float64Array(nL));
    row.fill(0);
    for (let e = 0; e < F.m; e++) {
      const k = F.hop[e] ? (reach > 0 ? Math.exp(-F.k[e] / reach) : 0) : F.k[e];
      row[F.a[e]] += k; row[F.b[e]] += k;
    }
    let worst = 0;
    for (let c = 0; c < nL; c++) worst = Math.max(worst, 2 * Dm * row[c] / H.area[c]);
    // At most NSUB_MAX substeps: past that, migration is held to what the step can carry stably
    // (people then track capacity faster than they could walk, which is the case it matters).
    const need = dt * worst / 0.4, nsub = Math.max(1, Math.min(this.P.NSUB_MAX, Math.ceil(need))), h = dt / nsub;
    const kScale = need > nsub ? nsub / need : 1;
    const dN = this.dN || (this.dN = new Float64Array(nL)), dZ = this.dZ || (this.dZ = new Float64Array(nL));
    // People spread down the gradient of crowding u = N/K, not of density (toward the ideal free
    // distribution: Fretwell and Lucas, from memory), across each edge at the harmonic mean of its
    // ends' capacity per km², so a cell that can hold no one takes no one, and a rich cell whose
    // births have fallen doesn't drain into poorer ones. With capacity even it is Fisher's diffusion.
    // K here is the capacity at the lineage's best culture (K2: migrants carry it), for crowding and
    // weights alike, so the explicit step's bound holds.
    const u = this.dens || (this.dens = new Float64Array(nL)), kd = this.kden || (this.kden = new Float64Array(nL)), K = L.K;
    for (let c = 0; c < nL; c++) kd[c] = L.K2[c] / H.area[c];
    for (let s = 0; s < nsub; s++) {
      dN.fill(0); dZ.fill(0);
      for (let c = 0; c < nL; c++) u[c] = L.K2[c] > 1e-12 ? N[c] / L.K2[c] : 0;
      for (let e = 0; e < F.m; e++) {
        const c = F.a[e], d = F.b[e], uc = u[c], ud = u[d];
        if (uc === ud) continue;
        const kc = kd[c], kk = kd[d], rho = kc > 0 && kk > 0 ? 2 * kc * kk / (kc + kk) : 0;
        if (!(rho > 0)) continue;
        const ze = 0.5 * (Z[c] + Z[d]);
        let k;
        if (F.hop[e]) { const r = this.seaReach(ze); if (!(r > 0)) continue; k = this.Dz(ze) * Math.exp(-F.k[e] / r); }
        else k = this.Dz(ze) * F.k[e];
        const flux = kScale * k * rho * (ud - uc) * h;    // people from d to c
        const zc = flux > 0 ? Z[d] : Z[c];
        dN[c] += flux; dN[d] -= flux; dZ[c] += flux * zc; dZ[d] -= flux * zc;
      }
      for (let c = 0; c < nL; c++) {
        if (dN[c] === 0) continue;
        let Nn = N[c] + dN[c];
        const zz = N[c] * Z[c] + dZ[c];
        if (Nn > 1e-6) Z[c] = Math.max(0, zz / Nn); else Nn = 0;
        N[c] = Nn;
      }
    }
  }

  // Food (each cell's capacity, shared by its lineages), then the industrial economy over its
  // workers, its goods shared out by industry's share of each cell's workers; emissions to the air
  // and the people's forcing (heat and sulfate) for the planet.
  economy(live, dt) {
    const P = this.P, nL = this.nL, Out = this.Out, Ntot = this.Ntot, ind = this.ind, zc = this.zcell();
    Out.fill(0);
    let food = 0, people = 0;
    for (const L of live) for (let c = 0; c < nL; c++) {
      if (!(L.N[c] > 0)) continue;
      const o = L.K[c] * L.N[c] / Math.max(Ntot[c], 1e-12);
      Out[c] += o; food += o; people += L.N[c];
    }
    const E = this.econ;
    this.goods.fill(0);
    if (E.on) {
      let Lh = 0, zs = 0;
      for (let c = 0; c < nL; c++) { const w = P.LFP * Ntot[c] * ind[c]; Lh += w; zs += w * zc[c]; }
      industrialStep(E, { Lh, z: Lh > 0 ? zs / Lh : 0 }, dt, P);
      if (Lh > 0) for (let c = 0; c < nL; c++) { const g = E.Y * P.LFP * Ntot[c] * ind[c] / Lh; this.goods[c] = g; Out[c] += g; }
      this.env.emit(E.burned, dt);
      this.emitted += E.burned;
      this.forcing.heat = E.heat; this.forcing.aer = E.aer;
    }
    this.O = food + (E.on ? E.Y : 0); this.food = food; this.people = people;
  }

  /** The culture each cell's people hold (the highest lineage's). */
  zcell() {
    const nL = this.nL, zc = this.zc || (this.zc = new Float64Array(nL));
    zc.fill(0);
    for (const L of this.lineages) if (L.died === null) for (let c = 0; c < nL; c++) if (L.N[c] > 0 && L.Z[c] > zc[c]) zc[c] = L.Z[c];
    return zc;
  }

  culture(L, live, dt) {
    const P = this.P, H = this.H, E = this.E, nL = this.nL, N = L.N, Z = L.Z, M = L.M, Ntot = this.Ntot, Out = this.Out;
    // People's minds in each cell: this lineage's × research intensity, the others' at η.
    const m = this.mbuf || (this.mbuf = new Float64Array(nL));
    m.fill(0);
    let zmax = 0;
    for (let c = 0; c < nL; c++) {
      if (!(Ntot[c] > 0)) continue;
      const y = Out[c] / Ntot[c], sR = Math.min(P.S_R_MAX, Math.pow(Math.max(y, 1e-3), P.RHO_R));
      m[c] = sR * (N[c] + P.ETA * (Ntot[c] - N[c]));
      if (N[c] > 0) zmax = Math.max(zmax, Z[c]);
    }
    // Minds within reach: the body's total, or a disc of radius ℓ of the local density; AI's
    // research minds (one network, by then) join through the tasks they can do.
    const reach = this.seaReach(zmax), ell = this.reachL(L.g + zmax);
    const key = reach.toPrecision(2);
    let comp = this.compCache.get(key);
    if (!comp) this.compCache.set(key, comp = this.components(c => Ntot[c] >= P.N_MIN * H.area[c], reach));
    const tot = new Float64Array(comp.count);
    for (let c = 0; c < nL; c++) if (comp.id[c] >= 0) tot[comp.id[c]] += m[c];
    const disc = Math.PI * ell * ell, ai = this.econ.on ? this.econ.AIr : 0, beta = this.econ.on ? this.econ.beta : 0;
    for (let c = 0; c < nL; c++) {
      let ring = m[c];
      for (let o = E.off[c]; o < E.off[c + 1]; o++) if (!E.hop[o]) ring += m[E.nb[o]];
      const loc = disc * ring / this.ringArea[c], body = comp.id[c] >= 0 ? tot[comp.id[c]] : m[c];
      const Mh = body > 0 ? body * (1 - Math.exp(-loc / body)) : 0;
      M[c] = ai > 0 && Mh > 0 ? taskLabor(Mh, ai, beta, P.SIGMA).L : Mh;
    }
    // Culture: ideas in, losses out, exact over the step; copying better neighbours and others.
    const lam = P.LAMBDA, eL = Math.exp(-lam * dt), fL = lam * dt > 1e-9 ? (1 - eL) / lam : dt, gain = P.A_INV;
    let rate = 0;
    const others = live.filter(o => o !== L);
    for (let c = 0; c < nL; c++) {
      if (!(N[c] > 0)) continue;
      const z0 = Z[c];
      let wsum = 0, up = 0;
      for (let o = E.off[c]; o < E.off[c + 1]; o++) {
        const d = E.nb[o];
        if (!(N[d] > 0) || Z[d] <= z0) { if (N[d] > 0) wsum += E.hop[o] ? 0 : E.slope[o]; continue; }
        const e = E.hop[o] ? (reach > 0 ? Math.exp(-E.km[o] / reach) : 0) : E.slope[o];
        up += e * (Z[d] - z0); wsum += e;
      }
      const copy = P.COPY * this.speed(z0) / P.V0;
      let accGap = 0;
      for (const o of others) if (o.N[c] > 0 && o.Z[c] > z0) accGap += (o.Z[c] - z0) * o.N[c] / Ntot[c];
      let z = z0 * eL + gain * Math.pow(M[c], P.PSI) * fL;
      if (wsum > 0) z += (1 - Math.exp(-copy * dt)) * up / wsum;
      z += (1 - Math.exp(-P.ACC * dt)) * accGap;
      Z[c] = z = Math.min(z, P.Z_SAT);
      rate = Math.max(rate, Math.abs(z - z0) / dt);
    }
    return rate;
  }

  // Connected bodies of cells that pass `ok`, by land and by crossings within `reach`.
  components(ok, reach) {
    const E = this.E, nL = this.nL, id = new Int32Array(nL).fill(-1);
    let count = 0;
    const stack = [];
    for (let c = 0; c < nL; c++) {
      if (id[c] >= 0 || !ok(c)) continue;
      id[c] = count; stack.push(c);
      while (stack.length) {
        const u = stack.pop();
        for (let o = E.off[u]; o < E.off[u + 1]; o++) {
          const d = E.nb[o];
          if (id[d] >= 0 || !ok(d)) continue;
          if (E.hop[o] && !(reach > 0 && Math.exp(-E.km[o] / reach) > 0.05)) continue;
          id[d] = count; stack.push(d);
        }
      }
      count++;
    }
    return { id, count };
  }

  trait(live, dt) {
    const P = this.P, nL = this.nL, Ntot = this.Ntot;
    for (const L of live) {
      let tot = 0;
      for (let c = 0; c < nL; c++) tot += L.N[c];
      const Ne = Math.max(10, P.NE_SHARE * tot), gens = dt / P.T_GEN;
      L.g = Math.min(P.G_MAX, L.g + P.V_G * P.S_BG * gens + Math.sqrt(P.V_G * gens / Ne) * this.rng.normal());
    }
    // Gene flow where lineages meet: traits and ancestry mix by the contact (soft species).
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      const A = live[a], B = live[b];
      let C = 0;
      for (let c = 0; c < nL; c++) if (A.N[c] > 0 && B.N[c] > 0) C += A.N[c] * B.N[c] / Ntot[c];
      if (C <= 0) continue;
      const ta = A.total || 1, tb = B.total || 1;
      const pa = Math.min(0.5, P.GENE_FLOW * C / ta * dt), pb = Math.min(0.5, P.GENE_FLOW * C / tb * dt);
      const ga = A.g, gb = B.g, aa = new Map(A.anc), ab = new Map(B.anc);
      A.g = (1 - pa) * ga + pa * gb; B.g = (1 - pb) * gb + pb * ga;
      const mix = (dst, src, p) => { for (const [k, v] of dst) dst.set(k, v * (1 - p)); for (const [k, v] of src) dst.set(k, (dst.get(k) || 0) + p * v); };
      mix(A.anc, ab, pa); mix(B.anc, aa, pb);
    }
  }

  farming(live, dt) {
    const P = this.P, H = this.H, E = this.E, nL = this.nL, f = this.f, pkg = this.pkg, Ntot = this.Ntot;
    const zc = this.zcell();
    // Origins: settled near foraging's ceiling, knowing enough, with domesticates.
    for (let c = 0; c < nL; c++) {
      if (f[c] > 0 || !(Ntot[c] > 0) || H.D[c] <= 0 || !H.alive[c]) continue;
      const Kf = H.area[c] * this.coldOK(c, zc[c]) * H.b[c] * P.CAP_F;
      const haz = P.H_FARM * H.D[c] * sig((zc[c] - P.Z_FARM) / P.W_FARM) * sig((Ntot[c] / Math.max(Kf, 1e-9) - P.SED) / 0.1);
      if (haz <= 0 || this.rng.uniform() > 1 - Math.exp(-haz * dt)) continue;
      let near = false;
      for (let o = E.off[c]; o < E.off[c + 1]; o++) if (f[E.nb[o]] > 0) near = true;
      if (near) continue;
      const q = this.packages.length, zv = Float32Array.from(H.zv.subarray(14 * c, 14 * c + 14));
      this.packages.push({ c, t: this.t, lat: H.lat[c], lon: H.lon[c], zv, zone: ZN[zv.indexOf(Math.max(...zv))] });
      pkg[c] = q; f[c] = 0.01 * this.suit(q, c) + 1e-4;
      this.event('farming', `farming begins (package ${q}) at ${deg(H.lat[c]).toFixed(0)}°, ${deg(H.lon[c]).toFixed(0)}° in ${this.packages[q].zone} (z ${zc[c].toFixed(2)})`);
    }
    // Spread and growth within cells.
    const f0 = Float32Array.from(f), p0 = Int16Array.from(pkg);
    for (let c = 0; c < nL; c++) {
      if (!(Ntot[c] > 0)) continue;
      if (p0[c] >= 0) {
        // Logistic toward the package's suitability here, exactly (the live planet's climate moves
        // the suitability, so the share can sit above it and fall back).
        const s = this.suit(p0[c], c), e = Math.exp(Math.min(50, P.R_ADOPT * dt));
        f[c] = s > 1e-9 ? s * f0[c] * e / (s + f0[c] * (e - 1)) : f0[c] / e;
      }
      if (zc[c] < P.Z_FARM - 0.5) continue;
      let bestQ = -1, bestIn = 0;
      for (let o = E.off[c]; o < E.off[c + 1]; o++) {
        const d = E.nb[o];
        if (p0[d] < 0 || f0[d] <= f0[c]) continue;
        const v = (E.hop[o] ? 0.3 : E.slope[o]) * (f0[d] - f0[c]) * this.suit(p0[d], c);
        if (v > bestIn) { bestIn = v; bestQ = p0[d]; }
      }
      if (bestQ >= 0) {
        if (p0[c] < 0 || this.suit(bestQ, c) > this.suit(p0[c], c)) pkg[c] = bestQ;
        f[c] = Math.max(f[c], Math.min(this.suit(pkg[c], c), f[c] + P.C_FARM * bestIn * dt));
      }
    }
  }

  // Tillage's erosion (mm/yr) on the farmed share, by the slope, falling as conservation comes with
  // culture; the soil stepped by the planet (cached: here; live: the planet's regolith).
  soilStep(dt) {
    const P = this.P, H = this.H, nL = this.nL, zc = this.zc, Ef = this.Ef;
    for (let c = 0; c < nL; c++) Ef[c] = this.f[c] > 0 ? P.E_TILL * this.f[c] * H.slope[c] / P.S_REF * Math.exp(-Math.max(0, zc[c] - P.Z_FARM) / P.Z_CONS) : 0;
    this.env.soil(dt, Ef);
  }

  industry(live, dt) {
    const P = this.P, E = this.E, nL = this.nL, ind = this.ind, zc = this.zc;
    if (!this.flags.industry) {
      for (let c = 0; c < nL; c++) if (zc[c] >= P.Z_IND && this.f[c] > 0.2 && this.coalReach[c] >= P.COAL_MIN) {
        ind[c] = 0.01; this.flags.industry = true;
        // The first works: fixed capital at its Solow balance for the cell's workers, and the
        // fossil capacity to run it.
        const ec = this.econ, Lh = P.LFP * this.Ntot[c] * ind[c], A = P.A_I0 * ex(P.THETA * (zc[c] - P.Z_IND));
        ec.on = true;
        ec.Kf = Math.pow(P.SAVE * A / P.DELTA_F, 1 / (1 - P.ALPHA)) * Lh;
        const Y = A * Math.pow(ec.Kf, P.ALPHA) * Math.pow(Lh, 1 - P.ALPHA);
        ec.Ke[0] = 1.2 * P.E_SUB * Y / P.R_EF0;
        this.event('industry', `industry begins at ${deg(this.H.lat[c]).toFixed(0)}°, ${deg(this.H.lon[c]).toFixed(0)}° (z ${zc[c].toFixed(2)}, coal within reach ${this.coalReach[c].toFixed(0)} Pg C)`);
        break;
      }
      return;
    }
    const i0 = Float32Array.from(ind);
    for (let c = 0; c < nL; c++) {
      if (!(this.Ntot[c] > 0)) continue;
      let v = i0[c] > 0 ? P.R_IND * i0[c] * (1 - i0[c]) : 0;
      if (zc[c] >= P.Z_IND - 1) for (let o = E.off[c]; o < E.off[c + 1]; o++) {
        const d = E.nb[o];
        if (i0[d] > i0[c]) v += P.C_IND * (E.hop[o] ? 0.5 : 1) * (i0[d] - i0[c]) * this.speed(zc[c]) / P.V0;
      }
      ind[c] = Math.min(1, i0[c] + v * dt);
    }
  }

  // Merges, extinctions, splits (every CHECK years).
  books() {
    const P = this.P, H = this.H, nL = this.nL;
    // Merges: two lineages living on in the same cells (neither excluding the other) for T_MERGE
    // become one, its traits and ancestry weighted by their numbers (soft species; as a stray
    // piece of a plate joins the plate it borders).
    this.mergeSince = this.mergeSince || new Map();
    const alive = this.lineages.filter(L => L.died === null);
    for (let a = 0; a < alive.length; a++) for (let b = a + 1; b < alive.length; b++) {
      const A = alive[a], B = alive[b];
      if (A.died !== null || B.died !== null) continue;
      let shared = 0;
      for (let c = 0; c < nL; c++) if (A.N[c] > 0 && B.N[c] > 0) shared += Math.min(A.N[c], B.N[c]);
      const key = `${A.id}:${B.id}`;
      if (shared < P.MERGE * Math.min(A.total, B.total)) { this.mergeSince.delete(key); continue; }
      if (!this.mergeSince.has(key)) { this.mergeSince.set(key, this.t); continue; }
      if (this.t - this.mergeSince.get(key) < P.T_MERGE) continue;
      const [big, small] = A.total >= B.total ? [A, B] : [B, A];
      const wb = big.total / (big.total + small.total), ws = 1 - wb;
      for (let c = 0; c < nL; c++) {
        const n = big.N[c] + small.N[c];
        if (n > 0) big.Z[c] = (big.N[c] * big.Z[c] + small.N[c] * small.Z[c]) / n;
        big.N[c] = n; small.N[c] = 0;
      }
      big.g = wb * big.g + ws * small.g;
      const anc = new Map();
      for (const [k, v] of big.anc) anc.set(k, wb * v);
      for (const [k, v] of small.anc) anc.set(k, (anc.get(k) || 0) + ws * v);
      big.anc = anc; big.total += small.total;
      small.died = this.t; small.into = big.id; small.total = 0;
      this.mergeSince.delete(key);
      this.event('merge', `lineage ${small.id} merges into ${big.id} (${(100 * ws).toFixed(0)}% of the whole)`);
    }
    for (const L of this.lineages.filter(L => L.died === null)) {
      if (L.total < P.P_EXT) { L.died = this.t; L.N.fill(0); this.event('extinct', `lineage ${L.id} dies out`); continue; }
      const comp = this.components(c => L.N[c] >= P.N_MIN * H.area[c], this.seaReach(L.zmax));
      const pops = new Float64Array(comp.count);
      for (let c = 0; c < nL; c++) if (comp.id[c] >= 0) pops[comp.id[c]] += L.N[c];
      const big = [...pops.keys()].filter(k => pops[k] >= P.P_MIN).sort((a, b) => pops[b] - pops[a]);
      if (big.length < 2) { L.multiSince = null; continue; }
      if (L.multiSince === null) { L.multiSince = this.t; continue; }
      if (this.t - L.multiSince < P.T_SPLIT) continue;
      for (const k of big.slice(1)) {
        if (this.lineages.filter(x => x.died === null).length >= P.L_MAX) break;
        const C = this.newLineage(L, this.t, L.g);
        let la = 0, lo = 0, w = 0;
        for (let c = 0; c < nL; c++) if (comp.id[c] === k) {
          C.N[c] = L.N[c]; C.Z[c] = L.Z[c]; L.N[c] = 0;
          la += H.lat[c] * C.N[c]; lo += H.lon[c] * C.N[c]; w += C.N[c];
        }
        C.lat = la / w; C.lon = lo / w;
        this.event('split', `lineage ${C.id} splits from ${L.id} at ${deg(C.lat).toFixed(0)}°, ${deg(C.lon).toFixed(0)}° (${pops[k].toFixed(0)} people; g ${L.g.toFixed(2)})`);
      }
      L.multiSince = null;
    }
  }

  record(live, dt) {
    const P = this.P, nL = this.nL, E = this.econ, H = this.H;
    let minds = 0, people = 0, farm = 0, indp = 0, zmax = 0, soilF = 0, farmA = 0;
    for (let c = 0; c < nL; c++) {
      const y = this.Ntot[c] > 0 ? this.Out[c] / this.Ntot[c] : 0;
      minds += Math.min(P.S_R_MAX, Math.pow(Math.max(y, 1e-3), P.RHO_R)) * this.Ntot[c];
      people += this.Ntot[c]; farm += this.Ntot[c] * this.f[c]; indp += this.Ntot[c] * this.ind[c];
      if (this.f[c] > 0) { const a = H.area[c] * this.f[c]; soilF += a * this.soil[c]; farmA += a; }
    }
    if (E.on) minds += E.AIr;
    for (const L of live) {
      let tot = 0, zs = 0, zm = 0;
      for (let c = 0; c < nL; c++) if (L.N[c] > 0) { tot += L.N[c]; zs += L.N[c] * L.Z[c]; zm = Math.max(zm, L.Z[c]); }
      L.total = tot; L.zbar = tot > 0 ? zs / tot : 0; L.zmax = zm; L.peak = Math.max(L.peak, tot);
      zmax = Math.max(zmax, zm);
      if (L.tipped === null && L.zbar > 1) {
        L.tipped = this.t;
        let best = 0; for (let c = 0; c < nL; c++) if (L.N[c] > 0 && L.Z[c] > L.Z[best]) best = c;
        this.event('tip', `lineage ${L.id} tips: mean culture past 1 (g ${L.g.toFixed(2)}, ${tot.toFixed(0)} people, frontier at ${deg(this.H.lat[best]).toFixed(0)}°, ${deg(this.H.lon[best]).toFixed(0)}°)`);
      }
    }
    const y = people > 0 ? this.O / people : 0, F = this.flags;
    const once = (k, cond, text) => { if (!F[k] && cond) { F[k] = true; this.event(k, typeof text === 'function' ? text() : text); } };
    once('transition', y > 2 && people > 1e8, () => `income passes twice subsistence: the demographic transition (${(people / 1e9).toFixed(2)} billion)`);
    if (E.on) {
      F.peakFos = Math.max(F.peakFos || 0, E.Ef);
      once('peak', F.peakFos > 1e11 && E.Ef < 0.9 * F.peakFos, () => `fossil carbon's peak passed (${(F.peakFos / 1e12).toFixed(1)} TW; ${this.emitted.toFixed(0)} Pg C burned, ${E.S.toFixed(0)} left)`);
      once('renewables', E.Er > E.Ef && E.Er > 1e11, () => `renewables pass fossil carbon (${(E.Er / 1e12).toFixed(1)} TW)`);
      once('present', E.beta >= 0.15, () => `early takeoff (β 0.15): ${(this.t - (this.events.find(e => e.kind === 'industry') || { t: this.t }).t).toFixed(0)} yr after industry, ${(people / 1e9).toFixed(2)} billion people, ${((E.Ef + E.Er + E.Eu) / 1e12).toFixed(1)} TW (fossil ${(100 * E.Ef / Math.max(1, E.Ef + E.Er + E.Eu)).toFixed(0)}%), ${this.emitted.toFixed(0)} Pg C burned, CO₂ ${this.co2.toFixed(0)} ppm (Earth's now: ~245 yr, 8, ~19 TW at ~80%, ~500 Pg C, ~420 ppm; from memory)`);
      once('compute', E.AAI > E.Lh && E.Lh > 0, () => `AI's labour passes people's (β ${E.beta.toFixed(2)}, ${(people / 1e9).toFixed(2)} billion people)`);
      once('fusion', E.Eu > E.Er && E.Eu > 1e11, () => `fusion passes renewables (${(E.Eu / 1e12).toFixed(0)} TW)`);
      once('sun', E.Er >= 0.99 * P.F_SUN * P.SUN_ABS, () => `surface renewables at their ceiling (${(P.F_SUN * P.SUN_ABS / 1e12).toFixed(0)} TW)`);
      once('cap', E.Eu >= 0.99 * P.HEAT_MAX * AREA_M2, () => `fusion at the radiator's ceiling (${P.HEAT_MAX} W/m², ${(P.HEAT_MAX / P.B_EBM).toFixed(1)} K before feedbacks)`);
      once('fossil', E.S <= 1e-6, () => `the fossil carbon is spent (${this.emitted.toFixed(0)} Pg C)`);
    }
    this.history.push({ t: this.t, dt, people, minds, O: this.O, food: this.food, zmax, farm: people > 0 ? farm / people : 0, ind: people > 0 ? indp / people : 0,
      Y: E.Y, Kf: E.Kf, Kc: E.Kc, AI: E.AAI, beta: E.beta, avail: E.avail, Ef: E.Ef, Er: E.Er, Eu: E.Eu, Emat: E.Emat, Ecomp: E.Ecomp,
      energy: E.Ef + E.Er + E.Eu, co2: this.co2, fossil: E.S, X: E.X, heat: this.forcing.heat, aer: this.forcing.aer,
      soil: farmA > 0 ? soilF / farmA : 0, lineages: live.length });
  }

  /** Run until `stop` says so; dt from the culture's pace and the minds' doubling. */
  run({ tMax = 5e6, stop = () => false, onStep = null } = {}) {
    const P = this.P;
    let dt = P.DT_MAX;
    while (this.t < tMax) {
      const h = this.history, n = h.length;
      let grow = 0;
      if (n >= 2 && h[n - 1].minds > 0 && h[n - 2].minds > 0) grow = Math.log(h[n - 1].minds / h[n - 2].minds) / h[n - 1].dt;
      dt = Math.min(P.DT_MAX, P.DZ_MAX / Math.max(this.lastRate, 1e-12), grow > 0 ? 0.05 / grow : Infinity, 2 * dt, this.dtCap || Infinity);
      dt = Math.max(dt, P.DT_MIN);
      this.step(dt);
      if (onStep) onStep(this);
      if (stop(this)) break;
    }
  }
}
