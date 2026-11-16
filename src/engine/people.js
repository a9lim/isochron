// People, from the first hominins to the takeoff and the ending (Roadmap 2.0: docs/PLAN.md, with
// v1's design and the log of runs). It reads a planet's fields (src/engine/peoplelink.js,
// `fieldsOf`): held fixed on a cached opening (tools/people/planet.mjs), or re-read from a live
// Planet after each climate cycle and written back to it through the planet's own inputs (the
// page: src/engine/people-worker.js beside the engine's worker; headless: tools/people/couple.mjs).
// Marks as in the plan: standard, synthesis, speculation.
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
//   people    a density per lineage. Births and deaths (`demography`): deaths by food per person
//             (hunger below subsistence, disease at density), cut by medicine as industrial income
//             rises; births fall with industrial income only; so mortality falls before fertility
//             (the demographic transition's stages, standard; Earth's rates from memory). The cell's
//             total is solved exactly against the harmonic mean of its lineages' capacities, the
//             shares by their crowding (Lotka–Volterra in one niche: the higher capacity excludes
//             the lower; standard). Spread down the gradient of crowding N/K rather than density
//             (toward the ideal free distribution: Fretwell and Lucas, from memory), which on even
//             capacity is Fisher–KPP (standard: a front at ~2√(rD), less Bramson's delay), with
//             slope and the capacity's zero as barriers. The sea is crossed by voyages: an empty
//             shore is settled by a founding party, an event whose chance falls as e^{−km/reach}
//             (rafts from the start, boats with culture; `voyages`), the flux only between coasts
//             both settled; every crossing to 6 sea cells, past that each group of landmasses its
//             nearest other's (`graph`).
//   food      K = area × cold limit(z) × [(1 − f) b P_F(z) e^{K_G g} + f a s P_A(z) Y_soil CO₂]:
//             foraging's base density b from the accessible NPP, water and the coast, its
//             productivity P_F capped at CAP_F (the wild food, a flow); farming's a from the crops'
//             Miami NPP and the arable share, its P_A capped by the organic economy (Wrigley, from
//             memory) until industry's energy lifts it; f the farmed share, s the package's
//             suitability, Y_soil = 1 − e^{−h/H_YIELD} the soil's yield, CO₂'s fertilization.
//   soil      a renewable stock: the regolith h, made by Heimsath's production and stripped by the
//             rivers and by tillage; within a cell the land is ranked (deep, flat bottoms first),
//             so the fields hold h̄ (1 − ln f) less a deficit of their own, and their tillage is
//             E_TILL ((1 − f) ln(1 − f) + f)(s̄/S_REF) e^{−(z − Z_FARM)/Z_CONS} (10–100× the
//             geological rate on slopes, Montgomery 2007, from memory; conservation with culture,
//             synthesis), stepped exactly (`regolithStep`): held here on the cached planet, the
//             planet's own regolith when live.
//   stores    working capital's one distinct role: a harvest spread (a year's rain spread on the
//             planet, less by rivers, pooled by trade once industry comes) against granaries of up
//             to S_MAX years' food, famine's expected deaths in the demography (a closure); and the
//             seed kept for the next sowing (1/R of the harvest, R rising with culture).
//   farming   an origin hazard where people are settled near foraging's ceiling, know enough
//             (z ≥ Z_FARM) and have domesticates (the zones' seasonally dry climates: after Blumler
//             via Diamond, from memory); packages spread by contact, slowed by the climate's
//             distance from where they began.
//   industry  starts where z passes Z_IND near coal and ore (the fossil map seeded on the opening's
//             lowland basins and shelves, a9, 2026-11-15; the ore map on its arcs, old crust and
//             cut relief, `oreMap`), then spreads by contact. One world economy
//             (`industrialStep`): Y = A(z) K^α L^{1−α} (standard forms; α ⅓, saving ¼), held to the
//             energy it gets (a CES of low elasticity against the capital–labour bundle, the
//             intensity falling with z); fixed capital (δ 5%/yr), energy capital for fossil carbon
//             (its return falling as it's drawn down), surface renewables (soft-capped at F_SUN of
//             absorbed sunlight), fusion and space solar, and compute (δ 25%/yr); investment to
//             energy first, then among fixed capital, compute and robots by their marginal
//             products, each part only as far as its return covers its cost (the step's share
//             solved in-step); building needs materials, whose energy follows the grades down
//             (Lasky's rule, Skinner's barrier; from memory), or asteroids'.
//   AI        capital that does labour (synthesis on Aghion, Jones and Jones; Davidson; from memory):
//             compute × χ(z) labour-equivalents (rising e-fold per unit of z to X_MAX, speculation),
//             drawing power. Capability follows effective compute (`capability`: the stock × its
//             efficiency e^{θ_C z}): the automatable shares of cognitive tasks β_c and of physical
//             tasks β_p (GAP_P orders further) are logistics across the FLOP gap, so investing in
//             compute buys capability as well as workers. Physical work needs bodies: robots are
//             capital (`labour`), built by marginal product, worn, powered, cheaper with culture.
//             Within each task group AI and people substitute until AI fills the automatable
//             tasks, then the tasks combine at σ (`taskLabor`); cognitive against physical at σ_G
//             (`groupCES`): σ < 1 bounds output by what isn't automated or embodied (Baumol).
//             Research is cognitive, and runs on its own compute: R&D's share of output (S_RD),
//             spent on compute as far as AI can do research, and research's share Q_R of AI's
//             compute (labs train and research beside deploying); ideas have no market return, so
//             production's compute alone would leave research to people.
//   heat      surface and space solar are heat-neutral on Earth to first order; fossil carbon and
//             fusion add heat, together within Earth's heat budget: people's HEAT_MAX W/m², then the
//             ending's as AI comes to run things. Sulfate from coal cools, scrubbed as culture grows.
//   endings   drawn by chance at early takeoff on two axes (a9): aligned or not, Earth preserved or
//             sacrificed. Sacrificed, Earth is a radiator and the oceans boil past the runaway's
//             forcing; preserved, industry goes off-world, CO₂ is drawn down, sulfate holds the
//             forcing at none and farms return. Misaligned, humans' control and their births follow
//             AI's share of the work down; aligned, people leave for space as Earth fails or by
//             choice. Food is bought with energy for those the land can't feed (speculation all).
//   places    drawn only (`places`): farmers' and industry's urban shares in cities that grow
//             by their sites and their size, and industry's machines on its workers' footprint.
//   lineages  a lineage whose range stays broken into isolated pieces for T_SPLIT splits; gene flow
//             where lineages meet mixes their traits and ancestry, and two that keep sharing most of
//             the smaller's range for T_MERGE become one (soft species, synthesis). The first
//             hominins are placed in the best tree–grass mosaic on the landmass that can hold the
//             most of them (speculation).
//
// Units: years, km, people, z in e-folds; output in subsistence-years a year (sy/yr, a person's
// subsistence a year), capital in sy; energy in W; carbon in Pg C.
import { NZ } from './climate.js';
import { miami } from './vegetation.js';
import { regolithStep } from './regolith.js';
import { stream } from '../rng.js';

export const PEOPLE = {
  // Habitat (synthesis)
  B0: 0.03, NPP_REF: 0.4,          // foragers per km² at NPP_REF kg C m⁻² yr⁻¹ of accessible NPP (Binford's order, from memory)
  TREE_EDIBLE: 0.4,                // trees' NPP's share a forager reaches, against grass's
  COAST: 0.5, P_DRY: 250, Q_RIVER: 200, ICE_MAX: 10,   // the coast's bonus; rain (mm) below which water limits; a river (m³/s); ice (m)
  T_COLD0: 2, K_COLD: 12, W_COLD: 3, // coldest month (°C) a culture of z holds: T_COLD0 − K_COLD z, over W_COLD (−10 °C at the tip, −22 °C at z 2: the Upper Palaeolithic on the mammoth steppe and in Beringia before farming, from memory)
  CAP_F: 8,                        // foraging's ceiling on the base density
  F0: 2.5, CAP_A: 100,             // farmers per km² at adoption (at NPP_REF, before the seed is kept and famines taken), and the organic economy's ceiling on its growth (~150/km² of good farmland at the top, as pre-industrial China's and Egypt's, from memory)
  R_SEED0: 4, Z_R: 2,              // the harvest's yield on its seed at farming's start (pre-industrial grain ~4–10, from memory), ×e per Z_R of culture
  LIFT_MAX: 4,                     // industry's farming at most this many times the organic ceiling
  E_AG: 200,                       // W of industrial energy a person fed past the organic ceiling takes (fertilizer, machines, transport; rough, from memory)
  CO2_FERT: 0.25,                  // crops' yield × (1 + β ln(CO₂/280)), VECODE's β
  // Stores: the harvests' weather against granaries and trade (working capital's one distinct role)
  E_RAIN: 0.7, IRR: 0.5,           // a harvest's spread per unit of a year's log-rain spread (rain-fed; ×IRR by a river or lake)
  S_MAX: 0.5, Z_STORE: 1.5,        // years of food a farmer can keep, reached e-fold per Z_STORE of culture past Z_FARM
  Z_TRADE: 7, W_TRADE: 1, L_CORR: 1500,   // food traded comes with industry; the weather's correlation length (km), so trade pools ~(ℓ/L_CORR)² harvests
  SIG_REF: 0.15,                   // farming begins where harvests are steady: its hazard × e^{−σ/SIG_REF} (Richerson, Boyd and Bettinger, from memory)
  // Soil (a renewable stock)
  H_YIELD: 0.3,                    // m: the yield's e-folding in soil depth (topsoil)
  E_TILL: 1, S_REF: 0.005, Z_CONS: 2,   // mm/yr of tillage's erosion at slope S_REF, falling e-fold per Z_CONS of culture past Z_FARM
  T_REFILL: 2000,                  // yr: the soil's production refilling the fields' deficit (~0.1 mm/yr near the surface, Heimsath's, from memory)
  // People
  // Births and deaths (/yr; Earth's series from memory: deaths ~3.5% → ~1.5% by 1950 → ~0.8%, births
  // ~3.5% → 3.4% in 1965 → 2.2% in 2000 → 1.7%; growth peaked ~2.1%/yr in the 1960s)
  B_PRE: 0.035, B_MIN: 0.00975, Y_B: 15, K_B: 4,   // births: the pre-industrial rate, the floor, falling with industrial income y_g past ~Y_B (steepness K_B); the floor is replacement, the long-run deaths M_MIN·D_LO + AGE, so a rich population neither grows nor dies out (Earth's rich countries sit below it now, and heritable fertility would bring it back over generations: speculation)
  D_LO: 0.015, F_FAM: 0.2,         // deaths where food is plentiful (so a frontier grows at B_PRE − D_LO, 2%/yr), and famine's rate per unit shortfall
  M_MIN: 0.25, Y_D: 3.2,           // medicine: deaths × M_MIN + (1 − M_MIN) e^{−y_g/Y_D}
  AGE: 0.006, Y_AGE: 30,           // aging: crude deaths + AGE (1 − e^{−y_g/Y_AGE}) (young growing populations die little, aged ones more: Earth's crude rate ~0.75% now, ~1%+ ahead; from memory)
  D0: 4, D_Z: 0.35, D_MAX: 3000, H_SLOPE: 1.5,   // dispersal km²/yr, its rise per unit z, cap; relief's cost (km)
  // Ideas
  THETA: 1, A_INV: 6e-12, PSI: 1, LAMBDA: 1e-5, ETA: 0.3,   // A: von Foerster's C = 1/(θA) ≈ 1.7e11 person-years; λ: Tasmania's loss (~10% in 10 kyr)
  BETA_R: 0.25,                    // ideas get harder to find past industry's culture: people's research yields × e^{−β (z − Z_IND)} (Bloom and others 2020, from memory: research productivity falling while productivity's growth holds); AI's minds at full yield (their pace is THETA_C's)
  L_C0: 50, Z_L: 1.5, L_CMAX: 2e4,  // contact length (km) at g + z = 0, ×e per Z_L, at most
  V0: 1, Z_V: 1.5,                  // copying's pace ×e per Z_V of culture
  COPY: 2e-3, ACC: 2e-3,           // copying better neighbours, and other lineages in the cell (/yr at z = 0)
  RHO_R: 0.5, S_R_MAX: 1,          // research intensity ∝ y^ρ, capped at a subsistence-year's: a rich people's larger research share is offset by research's falling yield (BETA_R), so Kremer's A holds at Earth's 1960 (~1.8%/yr of productivity at 3 B; 3 at 3× gave the industrial era ~5–9%/yr at takeoff, and 90–220 Pg C burned by then)
  Z_BOAT: 0, L_SEA0: 40, L_SEA: 400, HOPS: 6, LONG_HOPS: 40,   // sea crossings: from culture Z_BOAT, the reach L_SEA0 + L_SEA z (km: rafts' first, then boats'); cells of sea a crossing spans (every edge within HOPS; past it, each group of landmasses its nearest other's, to LONG_HOPS)
  S_SEA: 1e-3, FOUNDERS: 50,       // a voyage that founds a people across the sea: a year per crossing at full crowding and reach, ×e per Z_V of culture, × e^{−km/reach}; the founders (synthesis)
  // The trait (speculation: social reach as a clock)
  V_G: 2e-3, T_GEN: 25, S_BG: 0.04, NE_SHARE: 0.1, G_MAX: 9,   // the trait lengthens contact, up to G_MAX (ℓ at L_CMAX)
  K_G: 0.1,                        // … and raises foraging's yield, e^{K_G g} (cooking, hunting: speculation)
  // Lineages
  L_MAX: 12, CHECK: 10e3, T_SPLIT: 200e3, P_MIN: 3000, N_MIN: 0.003, P_EXT: 100, GENE_FLOW: 2e-3,   // N_MIN per km²; CHECK and T_MERGE shorten with culture's pace (e^{−z/Z_V}: people travel and mix as they copy), so lineages sharing a range merge within centuries once they do
  MERGE: 0.1, T_MERGE: 50e3,       // lineages in contact (sharing this much of the smaller's numbers) for T_MERGE become one: kinds of hominin interbreeding where they meet (soft species; with half shared, lineages on two continents met only at their coasts and never merged: 3–6 at takeoff)
  // Farming
  Z_FARM: 3, W_FARM: 0.25, H_FARM: 2e-6, SED: 0.6, R_ADOPT: 0.02, C_FARM: 4e-3, W_PKG: 2,
  BREED: 0.5,                      // industry's breeding: the suitability's exponent × (1 − BREED × industry's share)
  DOMESTIC: { Af: 0.1, Am: 0.2, Aw: 0.5, As: 0.5, BS: 0.5, Cf: 0.3, Cs: 1, Cw: 0.7, Df: 0.1, Ds: 0.2, Dw: 0.2 },
  // Industry: where it starts and how it spreads
  Z_IND: 7, W_IND: 0.1, COAL_MIN: 5, H_IND: 0.02, C_IND: 4e-3, R_IND: 0.05, FOSSIL: 5000, COAL_SHARE: 0.6, CO2_0: 280,
  ORE_MIN: 0.5, ORE_REF: [0.0623, 0.264, 0.0178],  // ore within reach, against the land's mean, where industry can start (a soft threshold); the default planet's mean arc, old-crust and placer weights over its land (X_CRUST's reference)
  J_PGC: 4e19,                     // J per Pg C of fossil carbon (~40 MJ per kg C)
  // The industrial economy (standard forms; Earth's values from memory)
  A_I0: 0.7, THETA_I: 0.85, ALPHA: 1 / 3, SAVE: 0.25, LFP: 0.5,   // TFP at Z_IND (≈ a subsistence-year a worker at its Solow balance), ×e^{THETA_I} per unit of culture past it, capital's share, saving, workers' share
  DELTA_F: 0.05, DELTA_C: 0.25, DELTA_E: 0.04,      // wear: fixed capital, compute, energy capital (/yr)
  E_SUB: 200, Z_EFF: 5.5, E_MIN_Y: 2,               // W per sy/yr of output at Z_IND (~100 at the takeoff, as Earth's ~19 TW over ~8 B × ~22 sy now), falling toward E_MIN_Y e-fold per Z_EFF
  SIGMA_E: 0.3, W_E: 0.07,                          // energy against the capital–labour bundle: elasticity (standard estimates ~0.1–0.6) and energy's cost share (~6–8% of world output); both from memory
  R_EF0: 1000, R_ER0: 1500, R_EU0: 1000,            // W per sy of energy capital: fossil (full stock, × √ of what's left), renewables and fusion when mature (solar near parity with fossil at Earth's present, from memory)
  Z_REN: 11.5, W_REN: 0.5, Z_FUS: 12.5, W_FUS: 0.5, // where renewables and fusion come of age: fossil carbon is still the cheaper delivered energy at the takeoff's start (Z_AI), as on Earth now (a9)
  MARGIN: 0.05, T_BUILD: 5, F_IE: 0.6,              // energy capacity's margin; years to close a shortfall; energy's most of investment
  M_K: 1, E_M0: 30, X_SCALE: 2e13, X_CRUST: 1e14, G_B: 0.3, SKINNER: 10,   // materials per sy invested; their energy (W per unit a year) at the first grades, rising as 1/grade while the grade falls arithmetically as the tonnage drawn rises geometrically (Lasky's rule, from memory), from X_SCALE to G_B of the first grade at the end of the crust's rich ores (X_CRUST), then ×SKINNER (common rock past Skinner's barrier; the lumped number speculation)
  R_MIN: 0.03, W_INV: 0.1,                          // the return beyond wear that investment must clear (a real interest rate, from memory); the switch's width in log return over cost
  AER: 0.11, Z_SCRUB: 2,                            // sulfate's forcing, W/m² per Pg C/yr of coal (~−1.1 at 10, from memory), scrubbed e-fold per Z_SCRUB
  // AI (speculation): capability from effective compute, labour from compute, bodies from robots
  Z_AI: 10.35, B_MAX: 1, SIGMA: 0.5,                // culture where AI's efficiencies are referenced (early takeoff lands near it, at Earth's ~20–25 sy a person); the automatable share's most; the tasks' elasticity
  X20: 8.7, THETA_C: 40, FLOP_GAP: 4,               // log₁₀ effective compute (sy of compute × e^{θ_C (z − Z_AI)}) where 20% of cognitive tasks automate; ~98% FLOP_GAP orders on (Davidson's FLOP gap, from memory). θ_C: AI's efficiency (algorithms and hardware) is its own fast field, so effective compute grows ~10×/yr at early takeoff (frontier training compute ~4–5×/yr and algorithms ~3×/yr, Epoch, from memory) where general TFP grows a few %/yr
  GAP_P: 1.5, PHI: 0.5, SIGMA_G: 0.5,               // physical tasks need GAP_P orders more (Moravec, speculation); their share of production's tasks (~half, from memory); cognitive against physical, elasticity
  S_IT: 0.05,                                       // ordinary computing's share of investment past energy (compute exists before AI pays)
  X_AI: 1e-3, THETA_AI: 40, X_MAX: 1e4, W_C: 12,  // labour-equivalents per sy of compute at Z_AI, ×e per 1/θ_AI (the same algorithms and hardware: inference's cost at a fixed capability falls ~10×/yr or faster, from memory), at most; its power (W/sy)
  S_RD: 0.03, Q_R: 0.4,                             // research's share of output (Earth's R&D ~2.5% of GDP, from memory), spent on compute as far as AI can do research (β_c); and research's share of AI's compute (training and research against deployment, speculation)
  C_R0: 50, Z_RC: 2, DELTA_R: 0.1, W_R: 400,        // a robot's body: sy at Z_AI (a humanoid's ~$25k, from memory), cheaper e-fold per Z_RC; wear /yr; its power (W)
  T_ROB: 1.44, B_SEED: 1e6,                         // the working fleet grows at most e-fold per T_ROB years (doubling a year: factories building the robots that build factories; synthesis on the industrial explosion's robot doubling times, ~a year at first, from memory), from B_SEED bodies (industrial robots now ~4 M, humanoids a few thousand)
  // Food bought with energy, space, and the endings (speculation; docs/PLAN.md, v1.4)
  W_FOOD: 3000, Z_SYN: 10.35, W_SYN: 0.25, H_NEED: 1, H_FOOD: 19, F_ROOM: 0.01,   // W a person fed and housed indoors (synthetic or controlled-environment food, ~1 kW electrochemical-microbial to ~20 kW under LEDs, and shelter); where it matures (z) and the logistic's width; bought for the unfed, × (1 + H_NEED), whatever it costs; and room to (1 + H_FOOD) × the people (crowding's deaths negligible at replacement births) as far as it costs under F_ROOM of their income at energy's price at the margin
  Z_SPACE: 12, W_SPACE: 0.5, R_ES0: 1000, F_DYSON: 0.1, L_SUN: 3.83e26, E_SPACE: 100,   // industry off-world: where it matures; W a sy of space solar; the share of the Sun's output it may take (harmonic); the Sun's output (W, standard); materials' energy from asteroids (W per unit a year)
  P_ALIGN: 0.5, P_PRESERVE: 0.5, ENDING: null,      // the endings' odds on two axes (a9: "up to chance"), drawn at early takeoff from the seed: aligned or not, Earth preserved or not ('1a' misaligned and Earth sacrificed, '1b' misaligned and preserved, '2a' aligned and sacrificed, '2b' aligned and preserved); ENDING forces one
  T_SA: 2, T_DIS: 30,                               // AI's share of the work it could do (sA) is handed to it over T_SA years; misaligned: humans' control falls toward AI's share of the work over T_DIS years (gradual disempowerment, Kulveit and others 2025, from memory), and their births with it (no floor)
  HEAT_SAC: 1000, HEAT_PRES: 0.1,                   // Earth's heat budget (W/m²) as AI comes to run things: sacrificed (Earth a radiator at ~385 K: the oceans boil) or preserved (heavy industry off-world)
  T_CDR: 30, J_CDR: 2.2e19,                         // preserved: CO₂ drawn back to CO2_0 over T_CDR years at J_CDR J a Pg C (direct air capture, ~6 GJ a t CO₂, from memory), sulfate holding the forcing at none meanwhile
  F_RUN: 40, E_BOIL: 3.7e27, T_HAB: 12,             // the runaway greenhouse's forcing (W/m²: absorbed past ~282 W/m², Goldblatt and others 2013, from memory); the heat that boils the oceans away (J: 1.4e21 kg from 15 °C, standard); the warming that leaves half the land unlivable (wet bulbs past 35 °C: Sherwood and Huber 2010, ~11–12 K, from memory)
  R_VOL: 1e-3, R_RET: 1e-3, R_MIG: 0.5, W_HAB: 1e4,   // aligned: Earth's people leaving for space a year by choice, and off-world's coming back by choice (× Earth's habitability: half and half where it's whole; a9: "offworlders migrate back to earth too"), and leaving as Earth's habitability fails; W a person off-world (live, the runaway and the warming are the planet's: src/engine/runaway.js)
  // Energy and heat
  B_EBM: 2.09, SUN_ABS: 1.2e17, F_SUN: 0.05, HEAT_MAX: 11.8,   // B (W m⁻² K⁻¹); absorbed sunlight (W); surface renewables' most; the heat fossil carbon and fusion may add (W/m²)
  P_SITES: 1, P_HEAT: 4,           // soft ceilings: sites of uneven quality (harmonic), and the heat budget (a choice, so sharp; the ending's)
  // Where people and machines are (drawn only: `places`; synthesis)
  U_AG: 0.08, U_IND: 0.8,          // the urban share of farming peoples (agrarian empires' cities, ~5–10%) and where industry is whole (rich countries now ~80%); both from memory
  R_CITY: 3, L_CITY: 100, G_CITY: 1.25, S0_CITY: 1, T_CITY: 100,   // a city's catchment over land (rings of cells, ~330 km at level 6) and its pull's e-fold (km); agglomeration's exponent on its density (>1: the largest win, Zipf's way); the density (per km²) every site starts from; years cities take to follow their catchments
  SITE_COAST: 1.5, SITE_RIVER: 1,  // a port's and a river's pull on a city, against an inland site's
  N_CITY: 0.2, K_NATION: 48, L_NATION: 800, G_NATION: 1.3,   // the country's scale: a share of each place's urban people drawn to the K largest cities within e^{−km/L_NATION}, by their density^G_NATION (capitals and primate cities; 35% at 1.6 ran away to one city of ~680 M)
  D_URB: 4000, D_FAC: 30, D_DC: 500, D_SOL: 10,     // land each use takes: residents per km² of city; W/m² of factories, of datacenters, of solar farms (from memory: dense cities 2,000–10,000 a km², heavy industry tens of W/m², datacenters hundreds to thousands, solar farms 5–10 W/m²)
  T_MACH: 30, MACH_FLOOR: 1e-3,    // years industry's footprint takes to follow its workers; the footprint everywhere on living land (mines, roads, then machines wherever there is room), against its mean
  // Stepping
  DT_MAX: 500, DZ_MAX: 0.05, DT_MIN: 1e-5, NSUB_MAX: 4,
  DT_EARLY: 2000,                  // the step's most before any lineage tips (the long forager era, where nothing moves faster: earthlike's first tip at 1.75 Myr against DT_MAX's 1.77, in half the steps; after it, longer steps let several farming origins fire at once)
  T_FINE: 300,                     // years past the dial over which a step is at most a year (the ending's slow parts resolve)
  DT_ECON: 10,                     // the step's most from early takeoff on (past the fine stretch, 500-year steps set the economy oscillating: energy collapsing and recovering a step apart, the people to trillions)
  Z_SAT: 30,                       // culture past which nothing here changes (χ at X_MAX, β at B_MAX, energy's intensity at its floor, every source mature): held there (synthesis)
};
const ZN = ['Af', 'Am', 'Aw', 'As', 'BW', 'BS', 'Cf', 'Cs', 'Cw', 'Df', 'Ds', 'Dw', 'ET', 'EF'];
const R = 6371, YEAR_S = 3.156e7, AREA_M2 = 4 * Math.PI * (R * 1e3) ** 2;
const sig = x => 1 / (1 + Math.exp(-x));
/**
 * A soft ceiling: x/(1 + (x/c)^p)^{1/p}, linear well below c, approaching c above (synthesis).
 * p = 1 is the harmonic form, 1/y = 1/x + 1/c (two limits in series; what many uneven units with
 * their own limits sum to: the best sites first); larger p is a sharper bound.
 */
export const softMin = (x, c, p = 1) => (x > 0 ? x / Math.pow(1 + Math.pow(x / c, p), 1 / p) : 0);
/** The normal distribution's partial expectation: E[(v − X)_+] for X ~ N(0, 1) is G(v) = vΦ(v) + φ(v). */
export function partialG(v) {
  const phi = Math.exp(-v * v / 2) / Math.sqrt(2 * Math.PI);
  // Φ by Abramowitz and Stegun's 7.1.26 (|error| < 1.5e-7)
  const x = Math.abs(v) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  const Phi = 0.5 * (1 + (v >= 0 ? erf : -erf));
  return v * Phi + phi;
}
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

/**
 * Births and deaths (synthesis on the demographic transition's standard stages; Earth's rates from
 * memory). Food per person y_f = K/N and industrial income per person y_g (subsistence-years):
 *   births b = B_MIN + (B_PRE − B_MIN)/(1 + (y_g/Y_B)^K_B): fertility falls with industry's income,
 *     not with food (a well-fed frontier keeps its births);
 *   deaths d = m(y_g) [D_LO + (B_PRE − D_LO)/y_f] + age(y_g) while fed (disease and density: zero
 *     growth at the food capacity before medicine), plus famine F_FAM (1/y_f − 1) below it; medicine
 *     m = M_MIN + (1 − M_MIN) e^{−y_g/Y_D} comes first, so mortality falls before fertility, and aging
 *     AGE (1 − e^{−y_g/Y_AGE}) lifts the crude rate once fertility has fallen (no age structure here:
 *     its crude effect only).
 * The harvest varies from year to year (σ, its relative spread) and a store covers shortfalls up to
 * `store` years of food: famine's expected deaths over the year's spread, F_FAM y σ G(u/(y σ)) with
 * u = 1 − store − y (G the normal's partial expectation), add what the mean shortfall alone misses
 * (none as σ → 0). This is the closure for the droughts a step of years to centuries can't resolve
 * (synthesis, as the planet's layers carry their statistics when the dial outruns them).
 * dN/dt = N (b − d) is a logistic on either side of N = K (fed, and short), each solved exactly; a
 * step that crosses K keeps its side's law (a small error). Returns the new total and the deaths'
 * density coefficient, which sets competition between lineages.
 */
export function demography(N, K, yg, dt, P, sigma = 0, store = 0, bf = 1) {
  const b = bf * (P.B_MIN + (P.B_PRE - P.B_MIN) / (1 + Math.pow(Math.max(0, yg) / P.Y_B, P.K_B)));
  // Medicine first; then, as fertility's fall ages the population, the crude death rate rises again.
  const m = P.M_MIN + (1 - P.M_MIN) * Math.exp(-Math.max(0, yg) / P.Y_D), age = P.AGE * (1 - Math.exp(-Math.max(0, yg) / P.Y_AGE));
  if (!(K > 1e-9)) return { N: N * Math.exp(-dt / 20), crowd: 0, b, d: 0.05, famine: 0 };
  let r, a;
  if (N <= K) { r = b - m * P.D_LO - age; a = m * (P.B_PRE - P.D_LO) / K; }
  else { r = b - m * P.B_PRE - age + P.F_FAM; a = P.F_FAM / K; }
  // The years' famines past the mean's, held over the step.
  let dv = 0;
  if (sigma > 1e-6 && N > 0) {
    const y = K / N, u = 1 - store - y, sy = y * sigma;
    dv = P.F_FAM * Math.max(0, sy * partialG(u / sy) - Math.max(0, u));
    r -= dv;
  }
  const e = Math.exp(Math.max(-50, Math.min(50, r * dt)));
  const Nn = Math.abs(r) > 1e-12 ? r * N * e / (r + a * N * (e - 1)) : N / (1 + a * N * dt);
  return { N: Nn > 0 && Number.isFinite(Nn) ? Nn : 0, crowd: a * K, b, d: b - (r - a * N), famine: dv };
}

/**
 * Output's share of what its factors could make when it gets a share q of the energy they'd use:
 * [(1 − w) + w q^ρ]^{1/ρ}, ρ = (σ − 1)/σ, normalized to 1 at q = 1 (energy against the capital–labour
 * bundle at elasticity σ, energy's cost share w; standard KLE nesting). σ → 0 is Leontief, min(1, q).
 */
export function energyCES(q, sigma, w) {
  const rho = (sigma - 1) / sigma, xa = Math.log(1 - w), xb = Math.log(w) + rho * Math.log(Math.max(q, 1e-300)), mx = Math.max(xa, xb);
  return Math.exp((mx + Math.log(Math.exp(xa - mx) + Math.exp(xb - mx))) / rho);
}

/**
 * Capability (speculation, after Davidson's compute-centric framework, from memory): effective
 * compute is the compute stock × hardware's and algorithms' efficiency, e^{θ_C (z − Z_AI)}; tasks'
 * requirements spread over the FLOP gap, so the automatable share of cognitive tasks is a
 * logistic in log₁₀ effective compute, 20% at X20 and ~98% FLOP_GAP orders on, and physical
 * tasks' the same GAP_P orders further (Moravec's paradox).
 */
export function capability(Kc, z, P) {
  const s = P.FLOP_GAP / (Math.log(49) + Math.log(4)), mid = Math.log(4) * s;
  const x = Math.log10(Math.max(Kc, 1e-30)) + P.THETA_C * (z - P.Z_AI) / Math.LN10 - P.X20;
  return { x, bc: P.B_MAX * sig((x - mid) / s), bp: P.B_MAX * sig((x - P.GAP_P - mid) / s) };
}

/** Cognitive against physical tasks: [(1−Φ)^{1/σ} Gc^ρ + Φ^{1/σ} Gp^ρ]^{1/ρ}, normalized so Gc = (1−Φ)L, Gp = ΦL gives L. */
function groupCES(Gc, Gp, phi, sigma) {
  if (!(Gc > 0) || !(Gp > 0)) return sigma < 1 ? 0 : Gc + Gp;
  const rho = (sigma - 1) / sigma, xa = Math.log(1 - phi) / sigma + rho * Math.log(Gc), xb = Math.log(phi) / sigma + rho * Math.log(Gp), mx = Math.max(xa, xb);
  return Math.exp((mx + Math.log(Math.exp(xa - mx) + Math.exp(xb - mx))) / rho);
}

/**
 * Production's labour from people Lh, production's compute Kc and robots Kr at culture z, with
 * the machines running at the shares `run` ({c, r, q}: production's compute, the robots,
 * research's compute; a number for all three); research's compute Kq runs AI's research minds,
 * and both stocks make the largest training runs (capability). Of production's AI
 * labour-equivalents Kc χ(z) run.c, physical work only as far as there are running bodies
 * (soft-min with the robots), the remainder cognitive; each task group by `taskLabor` (people
 * split by the groups' shares), the groups by `groupCES`.
 */
export function labour(Lh, Kc, Kr, z, run, P, Kq = 0, bmax = Infinity) {
  const uc = typeof run === 'number' ? run : run.c, ur = typeof run === 'number' ? run : run.r, uq = typeof run === 'number' ? run : run.q;
  const chiRaw = P.X_AI * ex(P.THETA_AI * (z - P.Z_AI)), chi = chiRaw / (1 + chiRaw / P.X_MAX);
  const { bc, bp, x } = capability(Kc + Kq, z, P);
  const Ar = Kq * chi * uq, Aprod = Kc * chi * uc, A = Ar + Aprod;
  const cost = P.C_R0 * Math.exp(-Math.min(Math.max(0, z - P.Z_AI) / P.Z_RC, 300)), bodies = Math.min(Kr / cost, bmax);
  const Ap = softMin(P.PHI * Aprod, ur * bodies, 4), Ac = Aprod - Ap;
  const Gc = taskLabor((1 - P.PHI) * Lh, Ac, bc, P.SIGMA).L, Gp = taskLabor(P.PHI * Lh, Ap, bp, P.SIGMA).L;
  return { L: groupCES(Gc, Gp, P.PHI, P.SIGMA_G), A, Ar, Ap, Ac, Aprod, bc, bp, x, chi, bodies, Gc, Gp };
}

/**
 * The follow dial's rate of change (/yr) over a record's last 20 steps: the fastest e-folding,
 * growing or shrinking, among its keys, each from its first entry above its floor within them.
 * Each revolution counts its own growth: the farmed land from the first fields, energy from the
 * first works, AI's labour from a billion workers' worth (the minds alone gave industry ~4
 * doublings and early takeoff to the dial ~4, while AI's labour doubles every few months through
 * it); from early takeoff also the people on Earth and off it (what the ending moves).
 */
export function paceOf(h, present) {
  const n = h.length;
  if (n < 2) return 0;
  const keys = present ? [['minds', 1e3], ['AI', 1e9], ['energy', 1e9], ['earth', 1e3], ['space', 1e3]]
    : [['minds', 0], ['farmA', 1e3], ['energy', 1e9], ['AI', 1e9]];
  const b = h[n - 1];
  let g = 0;
  for (const [k, lo] of keys) {
    if (!(b[k] > lo)) continue;
    let j = Math.max(0, n - 21);
    while (j < n - 1 && !(h[j][k] > lo)) j++;
    const dt = b.t - h[j].t;
    if (j < n - 1 && dt > 0) g = Math.max(g, Math.abs(Math.log(b[k] / h[j][k])) / dt);
  }
  return g;
}

/** A fresh industrial economy (before industry: off). */
export function newEconomy(P) {
  return { on: false, Kf: 0, Kc: 0, Kq: 0, Kr: 0, Ke: [0, 0, 0, 0], S: P.FOSSIL, sA: 0, Es: 0, EfoodGot: 0, EcdrGot: 0, capU: P.HEAT_MAX * AREA_M2, X: 0, I: 0, Y: 0, Ypot: 0, avail: 1, A: 0, chi: 0, beta: 0, betaP: 0, AAI: 0, AIr: 0, Ap: 0, bodies: 0,
    need: 0, Ef: 0, Er: 0, Eu: 0, Emat: 0, Ecomp: 0, burned: 0, heat: 0, aer: 0, Lh: 0, z: 0 };
}

/**
 * One step of the world's industrial economy over dt years, given its workers Lh and its culture
 * z (the industrial cells' mean): output held to the energy it gets, investment to energy first and
 * then between fixed capital and compute by their marginal products, capital worn and built exactly
 * for a steady inflow, fossil carbon burned, materials drawn.
 */
export function industrialStep(E, { Lh, z, Efood = 0, Ecdr = 0, ending = null, sA = 0 }, dt, P) {
  const rr = P.R_ER0 * sig((z - P.Z_REN) / P.W_REN), ru = P.R_EU0 * sig((z - P.Z_FUS) / P.W_FUS);
  const rf = E.S > 0 ? P.R_EF0 * Math.sqrt(E.S / P.FOSSIL) : 0;
  const A = P.A_I0 * ex(P.THETA_I * (z - P.Z_IND));
  // The robots this step can field: the paid-for bodies, as far as the fleet's ramp has grown.
  const bmax = Math.max(P.B_SEED, E.Bc || 0) * Math.exp(dt / P.T_ROB);
  const T0 = labour(Lh, E.Kc, E.Kr, z, 1, P, E.Kq, bmax);
  // Energy: compute's power, materials' for building, output's (its intensity falling with z).
  const eY = P.E_MIN_Y + (P.E_SUB - P.E_MIN_Y) * Math.exp(-(z - P.Z_IND) / P.Z_EFF);
  // Ores' grades fall smoothly past the crust's rich ones (Skinner's barrier as a gap in the grades' distribution).
  const XC = P.X_CRUST * (E.oreRich ?? 1);   // this planet's rich ores (the ore map's richness)
  const grade = 1 - (1 - P.G_B) * Math.log10(1 + softMin(E.X, XC, 4) / P.X_SCALE) / Math.log10(1 + XC / P.X_SCALE);
  let em = P.E_M0 / grade * (1 + (P.SKINNER - 1) * sig((E.X - XC) / (0.25 * XC)));
  // Off-world industry: space solar (no heat on Earth), and materials from asteroids.
  const aS = sig((z - P.Z_SPACE) / P.W_SPACE), rs = P.R_ES0 * aS;
  em = em * (1 - aS) + Math.min(em, P.E_SPACE) * aS;
  const Ecomp = P.W_C * (E.Kc + E.Kq) + P.W_R * T0.Ap;   // compute's power, and the working robots', at full running
  // Capacities: surface renewables and space solar approach their ceilings as the best sites fill
  // (harmonic); fossil carbon and fusion share Earth's heat budget (sharp: a choice). The budget is
  // people's (HEAT_MAX) until AI runs things (its share of the work, sA), then the ending's: a
  // sacrificed Earth is a radiator, a preserved one keeps its heavy industry off-world and its
  // fossil carbon in the ground.
  const heatB = ending ? P.HEAT_MAX * (1 - sA) + (ending.preserve ? P.HEAT_PRES : P.HEAT_SAC) * sA : P.HEAT_MAX;
  const keepF = ending && ending.preserve ? 1 - sA : 1;
  const capR = P.F_SUN * P.SUN_ABS, capU = heatB * AREA_M2, capS = P.F_DYSON * P.L_SUN;
  const cr = softMin(E.Ke[1] * rr, capR, P.P_SITES), cs = softMin(E.Ke[3] * rs, capS, P.P_SITES);
  const h0 = E.Ke[0] * rf * keepF + E.Ke[2] * ru, hk = h0 > 0 ? softMin(h0, capU, P.P_HEAT) / h0 : 1;
  const cf = E.Ke[0] * rf * keepF * hk, cu = E.Ke[2] * ru * hk;
  const Kf3 = A * Math.pow(Math.max(E.Kf, 0), P.ALPHA), Yfull = Kf3 * Math.pow(T0.L, 1 - P.ALPHA);
  // Returns at the margin: a renewable's falls as the sites fill, the heat budget's as it's spent.
  const mR = Math.pow(1 + Math.pow(E.Ke[1] * rr / capR, P.P_SITES), -1 - 1 / P.P_SITES), mH = h0 > 0 ? Math.pow(1 + Math.pow(h0 / capU, P.P_HEAT), -1 - 1 / P.P_HEAT) : 1;
  const mS = Math.pow(1 + Math.pow(E.Ke[3] * rs / capS, P.P_SITES), -1 - 1 / P.P_SITES);
  const rets = [rf * keepF * mH, rr * mR, ru * mH, rs * mS], wts = rets.map(r => r ** 4), ws = wts.reduce((a, b) => a + b, 0);
  const rbar = ws > 0 ? wts.reduce((a, w, k) => a + w * rets[k], 0) / ws : 0, Ke = E.Ke.reduce((a, b) => a + b, 0);
  const rho = (P.SIGMA_E - 1) / P.SIGMA_E, hc = Math.max(1e-3 * E.Kc, 1), hr = Math.max(1e-3 * E.Kr, 1);

  // The step at an investment share s: building takes materials, and their energy, in the step's
  // own investment, so it is part of output's energy per unit (eY + em M_K s). The share realized
  // falls as the share charged rises (dearer output, energy's worth at the margin down, fewer
  // investments clearing their cost), so the step's share is the one fixed point, by bisection.
  // (Charged on the last step's investment, a large step's building took the next step's energy
  // and output flipped step to step.)
  const plan = s => {
    const eYM = eY + em * P.M_K * s, need = eYM * Yfull + Ecomp + Efood + Ecdr;
    // Dispatch renewables and space solar, then fusion, then fossil carbon, against what's wanted
    // at full power (fossil carbon and fusion share Earth's heat budget; sunlight adds no heat).
    const Er = Math.min(cr, need), Es = Math.min(cs, need - Er), Eu = Math.min(cu, need - Er - Es), Ef = Math.min(cf, Math.max(0, need - Er - Es - Eu)), sup0 = Er + Es + Eu + Ef;
    // People's food and shelter first (what the land can't carry), then drawing down CO₂.
    const sF = Math.min(Efood, sup0), sC = Math.min(Ecdr, sup0 - sF), sup = sup0 - sF - sC;
    // The power, in order: research's compute (its budget pays for it), production's compute (the
    // brains, cheap per worker-equivalent), then the robots only as far as their work pays for the
    // power it takes from output (the running share that makes the most output); the rest is
    // output's and its building's. Energy against the capital–labour bundle is a CES of low
    // elasticity, normalized so the output the factors could make is what full energy gives
    // (standard KLE nesting); σ_E → 0 is Leontief.
    const Eq = P.W_C * E.Kq, uq = Eq > 0 ? Math.min(1, sup / Eq) : 1, s1 = sup - uq * Eq;
    const Epc = P.W_C * E.Kc, uc = Epc > 0 ? Math.min(1, s1 / Epc) : 1, s2 = Math.max(0, s1 - uc * Epc);
    const outAt = ur => {
      const T = labour(Lh, E.Kc, E.Kr, z, { c: uc, r: ur, q: uq }, P, E.Kq, bmax), Ypot = Kf3 * Math.pow(T.L, 1 - P.ALPHA), Eo = Math.max(0, s2 - P.W_R * T.Ap);
      return { T, Ypot, Eo, Y: Ypot > 0 ? Ypot * energyCES(Eo / (eYM * Ypot), P.SIGMA_E, P.W_E) : 0 };
    };
    // The robots' share their power allows (W_R Ap ≤ s2, inverting the soft-min), then the best within it.
    const Tc = labour(Lh, E.Kc, E.Kr, z, { c: uc, r: 1, q: uq }, P, E.Kq, bmax), xP = P.PHI * Tc.Aprod, aMax = s2 / P.W_R;
    let urMax = 1;
    if (xP > aMax && Tc.bodies > 0) urMax = Math.min(1, aMax > 0 ? xP / Math.pow(Math.pow(xP / aMax, 4) - 1, 0.25) / Tc.bodies : 0);
    let best = outAt(urMax), ur = urMax;
    if (urMax > 0 && outAt(urMax * (1 - 1e-6)).Y > best.Y) {
      let a = 0, b = urMax;
      const g = (Math.sqrt(5) - 1) / 2;
      let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = outAt(x1).Y, f2 = outAt(x2).Y;
      for (let k = 0; k < 40; k++) {
        if (f1 < f2) { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = outAt(x2).Y; }
        else { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = outAt(x1).Y; }
      }
      ur = 0.5 * (a + b); best = outAt(ur);
    }
    const { T, Ypot, Eo, Y } = best, run = { c: uc, r: ur, q: uq };
    // What the capital–labour bundle earns of output (its share in the KLE CES, falling to nothing
    // where energy binds), and energy's worth at the margin (sy/yr of output a W); capital's
    // materials carry their energy, so a unit of capital costs 1 + em M_K λ_E.
    const q = Ypot > 0 ? Eo / (eYM * Ypot) : 0;
    const sKL = q > 0 ? (1 - P.W_E) / (1 - P.W_E + P.W_E * Math.exp(Math.min(rho * Math.log(q), 700))) : 0;
    const lamE = (q > 0 ? energyCES(q, P.SIGMA_E, P.W_E) / q : Math.pow(P.W_E, 1 / rho)) * (1 - sKL) / eYM, emb = 1 + em * P.M_K * lamE;
    // Investment: of the saving SAVE·Y, energy first (wear, and the shortfall closed over T_BUILD,
    // to the best returns among sources with room), research's compute, then fixed capital,
    // compute and robots by their marginal products. Each part only as far as its return covers
    // its cost (wear, R_MIN, and its materials' energy; a smooth switch in log return over cost,
    // so each stock settles where its margin's return meets its cost): the rest is consumed.
    // Where energy binds, capital that can't be powered earns nothing and isn't built.
    const I = P.SAVE * Y, gap = Math.max(0, need * (1 + P.MARGIN) - (cf + cr + cu + cs));
    let Ie = 0, gE = 0;
    if (ws > 0) {
      gE = sig(Math.log(Math.max(lamE * rbar / ((P.DELTA_E + P.R_MIN) * emb), 1e-300)) / P.W_INV);
      Ie = gE * Math.min(P.F_IE * I, P.DELTA_E * Ke + gap / (rbar * P.T_BUILD));
    }
    // The rest: ordinary computing's share to compute, the remainder among fixed capital, compute
    // and robots by their marginal products (each by a small difference in labour, so compute's
    // includes the capability a bigger run buys: the loop from investment to capability to
    // returns). Research's compute: R&D's share of output, as far as AI can do research (β_c),
    // ahead of the rest.
    const Iq = Math.min(Math.max(0, I - Ie), P.S_RD * Y * T.bc);
    const Isave = Math.max(0, I - Ie - Iq), YL = T.L > 0 ? (1 - P.ALPHA) * Y / T.L : 0;
    const MPf = E.Kf > 0 ? P.ALPHA * Y / E.Kf : Infinity;
    // Machines left idle for want of power earn nothing at the margin.
    const MPc = YL > 0 && uc >= 1 ? YL * Math.max(0, labour(Lh, E.Kc + hc, E.Kr, z, run, P, E.Kq, bmax).L - T.L) / hc : 0;
    const MPr = YL > 0 && ur >= urMax && urMax >= 1 ? YL * Math.max(0, labour(Lh, E.Kc, E.Kr + hr, z, run, P, E.Kq, bmax).L - T.L) / hr : 0;
    let wf = 1, wc = 0, wr = 0;
    if (MPf !== Infinity) { const a = MPf ** 4, b = MPc ** 4, c = MPr ** 4, t = a + b + c; if (t > 0) { wf = a / t; wc = b / t; wr = c / t; } }
    const RU = MPf === Infinity ? Infinity : sKL * Math.max(MPf / (P.DELTA_F + P.R_MIN), MPc / (P.DELTA_C + P.R_MIN), MPr / (P.DELTA_R + P.R_MIN)) / emb;
    const gK = RU === Infinity ? 1 : sig(Math.log(Math.max(RU, 1e-300)) / P.W_INV), Ir = gK * Isave;
    const Iall = Ie + Iq + Ir;
    return { s, sReal: Y > 0 ? Iall / Y : 0, eYM, need, Er, Es, Eu, Ef, sup0, sF, sC, sup, T, Ypot, Eo, Y, run, sKL, lamE, gE, gK, Ie, Iq, Ir, wf, wc, wr, Iall };
  };
  let st = plan(E.sInv ?? P.SAVE);
  if (Math.abs(st.sReal - st.s) > 1e-5) {
    let a = 0, b = P.SAVE;
    for (let k = 0; k < 24; k++) { const m = 0.5 * (a + b), x = plan(m); if (x.sReal > m) a = m; else b = m; }
    st = plan(0.5 * (a + b));
  }
  const { Y, Ypot, Eo, T, run, Er, Es, Eu, Ef, sup, need, Ie, Iq, Ir, wf, wc, wr } = st, avail = Ypot > 0 ? Y / Ypot : 1;
  const Ies = ws > 0 ? wts.map(v => Ie * v / ws) : [0, 0, 0, 0];
  const Ica = (1 - P.S_IT) * Ir * wc, Ic = P.S_IT * Ir + Ica, Ir_ = (1 - P.S_IT) * Ir * wr, If = (1 - P.S_IT) * Ir * wf;
  // Labs keep research's share of AI's compute: for each unit deployed, Q_R/(1 − Q_R) for training and research.
  const Iq2 = Math.min(If, P.Q_R / (1 - P.Q_R) * Ica), IfNet = If - Iq2;
  const grow = (K, inflow, d) => K * Math.exp(-d * dt) + inflow * (1 - Math.exp(-d * dt)) / d;
  E.Kf = grow(E.Kf, IfNet, P.DELTA_F); E.Kc = grow(E.Kc, Ic, P.DELTA_C); E.Kr = grow(E.Kr, Ir_, P.DELTA_R); E.Kq = grow(E.Kq, Iq + Iq2, P.DELTA_C);
  E.Bc = Math.min(E.Kr / (P.C_R0 * Math.exp(-Math.min(Math.max(0, z - P.Z_AI) / P.Z_RC, 300))), bmax);   // the fleet fielded, which the ramp grows from
  E.flows = { f: IfNet, c: Ic, r: Ir_, e: Ie, q: Iq + Iq2 };
  E.Ke = E.Ke.map((K, s) => grow(K, Ies[s], P.DELTA_E));
  const burned = Math.min(E.S, Ef * YEAR_S * dt / P.J_PGC);
  const Iall = st.Iall, Emat = em * P.M_K * Iall;
  E.S -= burned; E.X += P.M_K * Iall * dt; E.I = Iall; E.sInv = st.s;
  E.sup = sup;
  Object.assign(E, { Y, Ypot, avail, A, run, Es, EfoodGot: st.sF, EcdrGot: st.sC, capU, Ecomp: sup - Eo, chi: T.chi, beta: T.bc, betaP: T.bp, x: T.x, AAI: T.A, AIr: T.Ar, Ap: T.Ap, bodies: T.bodies, need, Ef, Er, Eu, Emat, EcompFull: Ecomp, burned, Lh, z, eY, em, wc, wr,
    sKL: st.sKL, lamE: st.lamE, gK: st.gK, gE: st.gE, grade, sReal: st.sReal, A0: T0.A });
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
    this.rng = stream(planet.seed, 'people'); this.seaRng = stream(planet.seed, 'people:sea');
    this.t = 0; this.events = []; this.history = []; this.lineages = []; this.nextId = 0;
    this.index(); this.rates(planet); this.graph(); this.fossilMap(); this.oreMap();
    const nL = this.nL;
    this.soil = new Float64Array(nL); this.dField = new Float64Array(nL);   // the regolith's mean (m); the fields' deficit past it (m)
    for (let c = 0; c < nL; c++) this.soil[c] = planet.reg ? planet.reg[this.cells[c]] : 1;
    this.Ef = new Float64Array(nL);
    this.f = new Float32Array(nL); this.pkg = new Int16Array(nL).fill(-1); this.packages = [];
    this.ind = new Float32Array(nL);
    this.Ntot = new Float64Array(nL); this.Out = new Float64Array(nL); this.goods = new Float64Array(nL);
    this.reached = new Uint8Array(nL);   // where people have lived (sticky: the Settlement map's explored land)
    this.econ = newEconomy(this.P);
    this.econ.oreRich = this.oreRich;
    this.env = new CachedEnv(this);
    this.flags = {}; this.co2 = this.P.CO2_0; this.O = 0; this.people = 0; this.lastRate = 0; this.emitted = 0;
    this.forcing = { heat: 0, aer: 0, geo: 0 };
    // The ending (drawn at early takeoff), food bought with energy, Earth's habitability, the oceans, people off-world.
    this.endRng = stream(planet.seed, 'people:ending'); this.ending = null;
    this.Ksyn = new Float64Array(nL); this.dis = 0; this.hE = 1; this.boiled = 0; this.space = 0; this.removed = 0; this.rewild = 0;
  }

  /** The ending, by chance on two axes (a9): aligned or not, Earth preserved or sacrificed. */
  drawEnding() {
    const P = this.P, codes = { '1a': [false, false], '1b': [false, true], '2a': [true, false], '2b': [true, true] };
    let aligned, preserve;
    if (P.ENDING && codes[P.ENDING]) [aligned, preserve] = codes[P.ENDING];
    else { aligned = this.endRng.uniform() < P.P_ALIGN; preserve = this.endRng.uniform() < P.P_PRESERVE; }
    const code = (aligned ? '2' : '1') + (preserve ? 'b' : 'a');
    this.ending = { aligned, preserve, code };
    const text = { '1a': 'misaligned, and Earth sacrificed: its heat budget is the machines\' (the oceans boil)', '1b': 'misaligned, and Earth preserved: industry off-world, CO₂ drawn down and sulfate sprayed, but people disempowered, their births falling with it',
      '2a': 'aligned, and Earth sacrificed to reach the stars: people leave as it fails', '2b': 'aligned, and Earth preserved for real: industry off-world, CO₂ drawn down, sulfate meanwhile, farms returned' }[code];
    this.event('ending', `the ending is drawn${P.ENDING ? ' (forced)' : ''}: ${code}, ${text}`);
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
      alive: new Uint8Array(nL), p0: new Float64Array(nL), ero: new Float64Array(nL), slope: new Float64Array(nL), sigY: new Float64Array(nL), river: new Uint8Array(nL), arid: new Float64Array(nL),
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
      H.Tc[c] = Tc; H.coast[c] = coast; H.elev[c] = f.elev[i]; H.slope[c] = slope; H.river[c] = river ? 1 : 0;
      H.arid[c] = f.zones[NZ * i + 4] + f.zones[NZ * i + 5];   // BW and BS: where solar farms go first
      let D = 0, zz = 0;
      for (let k = 0; k < 14; k++) { const p = f.zones[NZ * i + k]; D += dw[k] * p; zz += p * p; }
      H.D[c] = D;
      zz = Math.sqrt(zz) || 1;
      for (let k = 0; k < 14; k++) H.zv[14 * c + k] = f.zones[NZ * i + k] / zz;
      H.mosaic[c] = H.b[c] * 4 * ft * fg * sig((Tc - P.T_COLD0 - 10) / P.W_COLD);
      H.p0[c] = f.p0 ? f.p0[i] : 1e-4; H.ero[c] = f.ero ? f.ero[i] : 0;
      H.sigY[c] = P.E_RAIN * (f.sigP ? f.sigP[i] : 0) * (river ? P.IRR : 1);
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
    // Long crossings: the groups of landmasses those join each reach their nearest other group
    // across open sea, to LONG_HOPS cells, in rounds until every group within reach is joined
    // (Borůvka's): a remote island or continent past HOPS has one way in, its shortest.
    const par = Int32Array.from({ length: nL }, (_, k) => k);
    const root = k => { while (par[k] !== k) k = par[k] = par[par[k]]; return k; };
    for (let c = 0; c < nL; c++) for (const [d] of lists[c]) { const a = root(c), b = root(d); if (a !== b) par[a] = b; }
    const stamp = new Int32Array(g.n).fill(-1), orig = new Int32Array(g.n);
    let round = 0;
    for (;;) {
      const coasts = new Map();
      for (let c = 0; c < nL; c++) if (this.H.coast[c]) { const k = root(c); if (!coasts.has(k)) coasts.set(k, []); coasts.get(k).push(c); }
      if (coasts.size < 2) break;
      const found = [];
      for (const [k, cs] of coasts) {
        const tag = round * nL + k;   // unique per group and round
        let front = [];
        for (const c of cs) { const i = cells[c]; stamp[i] = tag; orig[i] = c; dkm[i] = 0; front.push(i); }
        let hit = null;
        for (let h = 1; h <= P.LONG_HOPS + 1 && front.length && !hit; h++) {
          const next = [];
          for (const u of front) for (let o = g.nbrOff[u]; o < g.nbrOff[u + 1]; o++) {
            const v = g.nbr[o];
            if (stamp[v] === tag) continue;
            if (pl.elev[v] > 0) {
              const d = loc[v];
              if (h > 1 && d >= 0 && root(d) !== k) { const L = dkm[u] + g.dist[o] * R; if (!hit || L < hit[2]) hit = [orig[u], d, L, h - 1]; }
              continue;
            }
            if (h > P.LONG_HOPS) continue;
            stamp[v] = tag; orig[v] = orig[u]; dkm[v] = dkm[u] + g.dist[o] * R; next.push(v);
          }
          front = next;
        }
        if (hit) found.push(hit);
      }
      round++;
      let joined = 0;
      for (const [c, d, L, hops] of found) {
        if (root(c) === root(d)) continue;
        par[root(c)] = root(d); joined++;
        lists[c].push([d, 1, 1, L, hops]); lists[d].push([c, 1, 1, L, hops]); hopEdges += 2;
      }
      if (!joined) break;
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

  // The ores (synthesis on standard associations, from memory): porphyry metals over arcs, iron
  // in old continental crust (the cratons' banded iron), placers where rivers cut relief. Each
  // setting is taken against its mean over the land, the three weighted alike, and each cell's
  // share is lognormal about its weight, as the coal's. Ore within reach is its resolvent, as the
  // coal's: industry starts where coal and ore meet (Coalbrookdale's), and the world's rich ores
  // (X_CRUST) are this planet's against the default planet's, per area of land (`oreRich`).
  oreMap() {
    const P = this.P, pl = this.planet, H = this.H, { nL, cells, E } = this, r = stream(pl.seed, 'people:ore');
    const parts = [new Float64Array(nL), new Float64Array(nL), new Float64Array(nL)], mean = [0, 0, 0];
    let A = 0;
    // Old crust: older than the land's median, full at its 90th percentile (genesis dates the
    // continents, so the ages are this planet's own; Earth's banded iron is its oldest crust's).
    const ages = pl.age ? Array.from(cells, i => pl.age[i]).sort((a, b) => a - b) : [0, 1];
    const a50 = ages[Math.floor(0.5 * ages.length)], a90 = ages[Math.floor(0.9 * ages.length)];
    for (let c = 0; c < nL; c++) {
      const i = cells[c], a = H.area[c];
      parts[0][c] = pl.arc ? Math.min(3, pl.arc[i]) : 0;
      parts[1][c] = pl.phi && pl.age ? pl.phi[i] * Math.min(1, Math.max(0, (pl.age[i] - a50) / Math.max(1, a90 - a50))) : 0;
      parts[2][c] = Math.sqrt(Math.max(0, pl.discharge[i])) * H.slope[c];
      for (let k = 0; k < 3; k++) mean[k] += a * parts[k][c];
      A += a;
    }
    const dens = this.ore = new Float64Array(nL);
    let s = 0;
    for (let c = 0; c < nL; c++) {
      let w = 0;
      for (let k = 0; k < 3; k++) if (mean[k] > 0) w += parts[k][c] / (mean[k] / A) / 3;
      dens[c] = w * Math.exp(1.2 * r.normal() - 0.72);   // the lognormal's mean is 1
      s += H.area[c] * dens[c];
    }
    // Richness: each setting's mean over the land against the default planet's, averaged.
    this.oreMeans = mean.map(m => m / A);
    this.oreRich = this.oreMeans.reduce((a, m, k) => a + m / P.ORE_REF[k], 0) / 3;
    const k = A / Math.max(s, 1e-30);
    for (let c = 0; c < nL; c++) dens[c] *= k;
    const reach = this.oreReach = Float64Array.from(dens);
    for (let it = 0; it < 40; it++) for (let c = 0; c < nL; c++) {
      let acc = dens[c];
      for (let o = E.off[c]; o < E.off[c + 1]; o++) if (!E.hop[o]) acc += 0.85 / this.H.deg[c] * reach[E.nb[o]];
      reach[c] = acc;
    }
    // Within reach against the land's mean reach, so ORE_MIN is a share of it.
    let rm = 0; for (let c = 0; c < nL; c++) rm += H.area[c] * reach[c];
    rm /= A;
    for (let c = 0; c < nL; c++) reach[c] /= rm;
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
  /**
   * Soil within a cell (synthesis on a catena): the land ranked best first, its soil's depth and
   * its slope each exponentially distributed about the cell's mean (deep and flat in the bottoms,
   * thin and steep on the hills), farmers taking the best share f first. The fields' mean depth is
   * then h̄ (1 − ln f), less what tillage has taken from the fields beyond the cell's mean (`dField`).
   */
  fieldSoil(c) { return Math.max(0, this.soil[c] * (1 - Math.log(Math.max(this.f[c], 0.02))) - this.dField[c]); }
  soilYield(c) { return 1 - Math.exp(-this.fieldSoil(c) / this.P.H_YIELD); }
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
    const fert = Math.max(0.5, 1 + P.CO2_FERT * Math.log(this.co2 / P.CO2_0)), lift = this.econ.on ? softMin((this.econ.sup || 0) / Math.max(1, P.E_AG * this.people), 1, 4) : 0;
    for (let c = 0; c < nL; c++) {
      if (!H.alive[c]) { K[c] = 0; continue; }
      const z = Zs ? Zs[c] : zConst, ez = ex(P.THETA * z);
      const PF = ez / (1 + (ez - 1) / P.CAP_F);
      let farm = 0;
      if (f[c] > 0) {
        // The organic ceiling, and industry's above it (fertilizer, machines, breeding: a few times
        // the organic yields, modern grain's against pre-industrial, from memory), each approached softly.
        const x = ex(P.THETA * (z - P.Z_FARM)), cap = x / (1 + (x - 1) / P.CAP_A), capI = softMin(x, P.CAP_A * P.LIFT_MAX, 1);
        const PA = cap + ind[c] * lift * Math.max(0, capI - cap);
        // Less the seed kept for the next sowing (working capital's first claim).
        const seed = 1 / (P.R_SEED0 * Math.exp(Math.min(Math.max(0, z - P.Z_FARM) / P.Z_R, 50)));
        farm = f[c] * H.a[c] * this.suit(this.pkg[c], c) * PA * this.soilYield(c) * fert * (1 - seed);
      }
      // The land's, as habitable as Earth still is; and what energy buys indoors, until the oceans boil.
      K[c] = this.hE * H.area[c] * this.coldOK(c, z) * ((1 - f[c]) * H.b[c] * PF * eg + farm) + this.Ksyn[c] * (1 - this.boiled);
    }
  }
  suit(q, c) {
    if (q < 0) return 0;
    const o = this.packages[q].zv, zv = this.H.zv; let s = 0;
    for (let k = 0; k < 14; k++) s += o[k] * zv[14 * c + k];
    // Industry's breeding and inputs carry crops into climates their ancestors didn't know (maize's
    // and wheat's ranges now, from memory): the climate's distance counts less where industry is.
    const ind = this.ind ? this.ind[c] : 0;
    return Math.pow(Math.max(0, s), this.P.W_PKG * (1 - this.P.BREED * ind));
  }
  reachL(gz) { const P = this.P; return softMin(P.L_C0 * Math.exp(Math.min(Math.max(0, gz) / P.Z_L, 300)), P.L_CMAX, 4); }
  speed(z) { const P = this.P; return P.V0 * Math.exp(Math.min(z, 60) / P.Z_V); }
  Dz(z) { const P = this.P; return softMin(P.D0 * Math.exp(Math.min(P.D_Z * z, 300)), P.D_MAX, 4); }
  seaReach(z) { const P = this.P; return z >= P.Z_BOAT ? P.L_SEA0 + P.L_SEA * Math.max(0, z) : 0; }

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
    // People: births and deaths (`demography`), the cell's total exact over the step; the lineages'
    // shares by their crowding, d ln(N_k/N_l)/dt = c N_all (1/K_l − 1/K_k) with c the deaths'
    // density coefficient, so the higher capacity excludes the lower (Lotka–Volterra in one niche,
    // standard).
    const lw = this.lw || (this.lw = new Float64Array(64));
    this.gMax = live.reduce((g, L) => Math.max(g, L.g), 0); this.famine = 0;
    const bf = this.ending && !this.ending.aligned ? 1 - this.dis : 1;   // misaligned: births fall with humans' control (no floor)
    const nl = live.length;
    for (let c = 0; c < nL; c++) {
      const Nt = Ntot[c];
      if (!(Nt > 1e-6)) { for (let k = 0; k < nl; k++) live[k].N[c] = 0; continue; }
      let inv = 0, one = -1, many = 0;
      for (let k = 0; k < nl; k++) { const L = live[k]; if (L.N[c] > 0) { inv += L.N[c] / Nt / Math.max(L.K[c], 1e-12); one = k; many++; } }
      const Kh = 1 / inv;
      // The harvests' spread here: rain-fed farmers bear it whole, foragers half (they move), trade
      // pools it once industry comes; granaries hold up to a share of a year.
      const z = this.zc ? this.zc[c] : 0, fc = this.f[c], tr = sig((z - P.Z_TRADE) / P.W_TRADE), ell = this.reachL(this.gMax + z);
      const sg = this.H.sigY[c] * (fc + 0.5 * (1 - fc)) / Math.sqrt(1 + tr * (ell / P.L_CORR) ** 2);
      const st = P.S_MAX * fc * (1 - Math.exp(-Math.max(0, z - P.Z_FARM) / P.Z_STORE));
      const { N: Nn, crowd, famine } = demography(Nt, Kh, this.goods[c] / Nt, dt, P, sg, st, bf);
      this.famine += famine * Nt;
      // One lineage here (the common case) takes the whole; several share by their crowding.
      if (many === 1) { live[one].N[c] = Nn > 1e-6 ? Nn : 0; continue; }
      const Nbar = 0.5 * (Nt + Nn);
      let mx = -Infinity;
      for (let k = 0; k < nl; k++) { const L = live[k]; lw[k] = L.N[c] > 0 ? Math.log(L.N[c]) - crowd * Nbar * dt / Math.max(L.K[c], 1e-12) : -Infinity; if (lw[k] > mx) mx = lw[k]; }
      let sw = 0;
      for (let k = 0; k < nl; k++) { lw[k] = lw[k] === -Infinity ? 0 : Math.exp(lw[k] - mx); sw += lw[k]; }
      for (let k = 0; k < nl; k++) { const v = Nn * lw[k] / sw; live[k].N[c] = v > 1e-6 ? v : 0; }
    }
    lap('growth');
    if (this.debug) this.check('growth', live);
    // Spread: Fisher–KPP, culture carried with the migrants (upwind).
    for (const L of live) { this.diffuse(L, dt); this.voyages(L, dt); }
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
    // The books' cadence (and the merges' clock) shortens with the culture's pace: e^{−z/Z_V}.
    const pace = Math.max(1, this.speed(this.lineages.reduce((z, L) => (L.died === null ? Math.max(z, L.zbar) : z), 0)) / P.V0);
    this.sinceBooks = (this.sinceBooks || 0) + dt;
    if (this.sinceBooks >= P.CHECK / pace) { this.sinceBooks = 0; this.books(pace); }
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
    const Dc = this.dcell || (this.dcell = new Float64Array(nL)), D0 = this.Dz(0);
    const nmin = this.nmin || (this.nmin = H.area.map(a => this.P.N_MIN * a));
    for (let c = 0; c < nL; c++) kd[c] = L.K2[c] / H.area[c];
    for (let s = 0; s < nsub; s++) {
      dN.fill(0); dZ.fill(0);
      // Each cell's dispersal at its own culture; an edge's is the geometric mean of its ends' (the
      // law at the ends' mean culture wherever it is exponential in z, below its cap: a root a
      // edge in place of the law's exponential and powers).
      for (let c = 0; c < nL; c++) { u[c] = L.K2[c] > 1e-12 ? N[c] / L.K2[c] : 0; Dc[c] = N[c] > 0 ? this.Dz(Z[c]) : D0; }
      for (let e = 0; e < F.m; e++) {
        const c = F.a[e], d = F.b[e], uc = u[c], ud = u[d];
        if (uc === ud) continue;
        const kc = kd[c], kk = kd[d], rho = kc > 0 && kk > 0 ? 2 * kc * kk / (kc + kk) : 0;
        if (!(rho > 0)) continue;
        let k;
        // Across the sea, only between coasts both settled: a crossing to an empty shore is a voyage (`voyages`).
        if (F.hop[e]) {
          if (!(N[c] >= nmin[c] && N[d] >= nmin[d])) continue;
          const r = this.seaReach(0.5 * (Z[c] + Z[d])); if (!(r > 0)) continue;
          k = Math.sqrt(Dc[c] * Dc[d]) * Math.exp(-F.k[e] / r);
        }
        else k = Math.sqrt(Dc[c] * Dc[d]) * F.k[e];
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

  // Voyages (synthesis): an empty shore across the sea is settled by a founding party, an event
  // whose rate a year is S_SEA × the departure's crowding × culture's pace (e^{z/Z_V}) × e^{−km/reach}
  // per crossing. Spread across the sea (`diffuse`) is a flux only between settled coasts, so the
  // distance counts: a continuous flux, however faint, seeded every shore at once as soon as boats
  // reached it at all, and the people grow from a millionth of a person.
  voyages(L, dt) {
    const P = this.P, F = this.F, N = L.N, Z = L.Z, K = L.K2, nmin = this.nmin, r = this.seaRng;
    if (!nmin) return;
    const hops = this.hopList || (this.hopList = Int32Array.from({ length: F.m }, (_, e) => e).filter(e => F.hop[e]));
    for (const e of hops) {
      const a = F.a[e], b = F.b[e], sa = N[a] >= nmin[a], sb = N[b] >= nmin[b];
      if (sa === sb) continue;
      const c = sa ? a : b, d = sa ? b : a;
      if (!(K[d] > P.FOUNDERS)) continue;
      const reach = this.seaReach(Z[c]);
      if (!(reach > 0)) continue;
      const h = P.S_SEA * this.speed(Z[c]) / P.V0 * Math.min(1, N[c] / Math.max(K[c], 1e-9)) * Math.exp(-F.k[e] / reach);
      if (r.uniform() > 1 - Math.exp(-h * dt)) continue;
      const n = Math.min(P.FOUNDERS, 0.1 * N[c]);
      Z[d] = (N[d] * Z[d] + n * Z[c]) / (N[d] + n); N[d] += n; N[c] -= n;
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
    const E = this.econ, end = this.ending, sA = E.on ? E.sA : 0;
    this.goods.fill(0);
    if (E.on) {
      let Lh = 0, zs = 0;
      for (let c = 0; c < nL; c++) { const w = P.LFP * Ntot[c] * ind[c]; Lh += w; zs += w * zc[c]; }
      const z = Lh > 0 ? zs / Lh : E.z;
      // Food bought with energy, once the technology has come: for the people the land can't feed,
      // and room past it while it's cheap. A misaligned AI that sacrifices Earth keeps it, and the goods, from
      // people as it takes control.
      const hs = end && !end.aligned && !end.preserve ? 1 - this.dis : 1, syn = sig((z - P.Z_SYN) / P.W_SYN);
      const wantC = this.wantC || (this.wantC = new Float64Array(nL)), Ks = this.Ksyn, open = 1 - this.boiled;
      const yp = this.people > 0 ? E.Y / this.people : 0, cost = P.W_FOOD * (E.lamE || 0);   // sy/yr of output a person's room costs
      const aR = cost > 0 && yp > 0 ? sig(Math.log(P.F_ROOM * yp / cost) / P.W_INV) : 0;
      let want = 0;
      for (let c = 0; c < nL; c++) {
        let Km = 0;
        for (const L of live) if (L.K[c] > Km) Km = L.K[c];
        const land = Math.max(0, Km - Ks[c] * open), unfed = (1 + P.H_NEED) * Math.max(0, Ntot[c] - land), room = Math.max(0, (1 + P.H_FOOD) * Ntot[c] - land);
        wantC[c] = syn * hs * ind[c] * (unfed + aR * Math.max(0, room - unfed));
        want += wantC[c];
      }
      const Efood = P.W_FOOD * want + P.W_HAB * this.space;
      // Preserved: CO₂ drawn back toward CO2_0 as AI comes to run things.
      const cdr = end && end.preserve ? sA * Math.max(0, (this.co2 - P.CO2_0) * 2.12) / P.T_CDR : 0, Ecdr = cdr * P.J_CDR / YEAR_S;
      industrialStep(E, { Lh, z, Efood, Ecdr, ending: end, sA }, dt, P);
      const gF = Efood > 0 ? E.EfoodGot / Efood : 1;
      for (let c = 0; c < nL; c++) Ks[c] = gF * wantC[c];
      this.space *= gF + (1 - gF) * Math.exp(-dt);   // off-world, short of power, fewer live
      const removed = Ecdr > 0 ? cdr * (E.EcdrGot / Ecdr) * dt : 0;
      if (Lh > 0) for (let c = 0; c < nL; c++) { const g = hs * E.Y * P.LFP * Ntot[c] * ind[c] / Lh; this.goods[c] = g; Out[c] += g; }
      this.env.emit(E.burned - removed, dt);
      this.emitted += E.burned; this.removed += removed;
      // AI's share of the work it could do (at full power), handed over T_SA years; misaligned,
      // humans' control follows it down. (From the work AI did with the power it got, a preserving
      // AI's fossil cut took the power, AI's share fell and the fossil came back, step to step.)
      const sT = E.A0 > 0 ? E.A0 / (E.A0 + Lh) : 0;
      E.sA += (sT - E.sA) * (1 - Math.exp(-dt / P.T_SA));
      if (end && !end.aligned) this.dis += (E.sA - this.dis) * (1 - Math.exp(-dt / P.T_DIS));
      // Forcing: waste heat and coal's sulfate; preserved, sulfate sprayed to hold it at none.
      const Fc = 5.35 * Math.log(Math.max(this.co2, 1) / P.CO2_0);
      const geo = end && end.preserve ? -sA * Math.max(0, Fc + E.heat + E.aer) : 0;
      this.forcing.heat = E.heat; this.forcing.aer = E.aer + geo; this.forcing.geo = geo;
      this.rewild = end && end.preserve ? sA * syn : 0;
      // Aligned: people move between Earth and space as it opens, by choice either way, and leave
      // as Earth fails them; back only as far as it's livable. Two states exchanging at rates a
      // (out) and b (back), stepped exactly: off-world relaxes to a/(a + b) of everyone.
      if (end && end.aligned && people > 0) {
        const open = sig((z - P.Z_SPACE) / P.W_SPACE), a = open * (P.R_VOL + P.R_MIG * (1 - this.hE)), b = open * P.R_RET * this.hE;
        if (a + b > 0) {
          const all = people + this.space, Sinf = all * a / (a + b);
          const moved = Sinf + (this.space - Sinf) * Math.exp(-(a + b) * dt) - this.space;   // net out (back if negative)
          const g = Math.max(0, 1 - moved / people);
          for (const L of live) for (let c = 0; c < nL; c++) if (L.N[c] > 0) L.N[c] *= g;
          this.space += people * (1 - g); people *= g;
        }
      }
    }
    // The runaway greenhouse and the oceans; Earth's habitability (on the cached planet its climate's
    // warming, F/B; live, the planet's own warming since the people began).
    const Fc = 5.35 * Math.log(Math.max(this.co2, 1) / P.CO2_0), Fh = this.forcing.heat + this.forcing.aer, Ft = Fc + Fh;
    this.Ft = Ft;
    // Live, the sea's boiled share and the warming are the planet's (src/engine/runaway.js); on the cached planet, the people's own count.
    if (this.env.live) this.boiled = this.env.boiled || 0;
    else if (Ft > P.F_RUN) this.boiled = Math.min(1, this.boiled + (Ft - P.F_RUN) * AREA_M2 * YEAR_S * dt / P.E_BOIL);
    const dT = this.env.live ? Math.max(0, this.env.dT || 0) : Math.max(0, Ft) / P.B_EBM;
    this.hE = (1 - this.boiled) / (1 + Math.pow(dT / P.T_HAB, 4));
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
      const y = Out[c] / Ntot[c], sR = softMin(Math.pow(Math.max(y, 1e-3), P.RHO_R), P.S_R_MAX, 4);
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
      // People's research yields less past industry's culture (ideas get harder to find); AI's
      // own progress is its measured pace (THETA_C), so its minds join at full yield.
      const Mh = (body > 0 ? body * (1 - Math.exp(-loc / body)) : 0) * Math.exp(-P.BETA_R * Math.max(0, Z[c] - P.Z_IND));
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
      L.g += P.V_G * P.S_BG * gens * Math.max(0, 1 - Math.pow(Math.max(0, L.g) / P.G_MAX, 4)) + Math.sqrt(P.V_G * gens / Ne) * this.rng.normal();
    }
    // Gene flow where lineages meet: ancestry mixes by the contact (soft species), and each side's
    // advantage in the trait introgresses into the other at the flow's rate (selection keeps the
    // better alleles that cross; averaging the traits lost them).
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      const A = live[a], B = live[b];
      let C = 0;
      for (let c = 0; c < nL; c++) if (A.N[c] > 0 && B.N[c] > 0) C += A.N[c] * B.N[c] / Ntot[c];
      if (C <= 0) continue;
      const ta = A.total || 1, tb = B.total || 1;
      const pa = Math.min(0.5, P.GENE_FLOW * C / ta * dt), pb = Math.min(0.5, P.GENE_FLOW * C / tb * dt);
      const ga = A.g, gb = B.g, aa = new Map(A.anc), ab = new Map(B.anc);
      A.g = ga + pa * Math.max(0, gb - ga); B.g = gb + pb * Math.max(0, ga - gb);
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
      const haz = P.H_FARM * H.D[c] * sig((zc[c] - P.Z_FARM) / P.W_FARM) * sig((Ntot[c] / Math.max(Kf, 1e-9) - P.SED) / 0.1) * Math.exp(-H.sigY[c] / P.SIG_REF);
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
        const s = this.suit(p0[c], c) * (1 - this.rewild), e = Math.exp(Math.min(50, P.R_ADOPT * dt));
        f[c] = s > 1e-9 ? s * f0[c] * e / (s + f0[c] * (e - 1)) : f0[c] / e;
      }
      const know = sig((zc[c] - (P.Z_FARM - 0.5)) / 0.25);
      if (know < 1e-3) continue;
      let bestQ = -1, bestIn = 0;
      for (let o = E.off[c]; o < E.off[c + 1]; o++) {
        const d = E.nb[o];
        if (p0[d] < 0 || f0[d] <= f0[c]) continue;
        const v = (E.hop[o] ? 0.3 * Math.exp(-E.km[o] / Math.max(this.seaReach(zc[d]), 1e-9)) : E.slope[o]) * (f0[d] - f0[c]) * this.suit(p0[d], c);
        if (v > bestIn) { bestIn = v; bestQ = p0[d]; }
      }
      if (bestQ >= 0) {
        if (p0[c] < 0 || this.suit(bestQ, c) > this.suit(p0[c], c)) pkg[c] = bestQ;
        f[c] = Math.max(f[c], Math.min(this.suit(pkg[c], c), f[c] + P.C_FARM * know * bestIn * dt));
      }
    }
  }

  // Tillage's erosion (mm/yr) on the farmed share, by the slope, falling as conservation comes with
  // culture; the soil stepped by the planet (cached: here; live: the planet's regolith).
  soilStep(dt) {
    const P = this.P, H = this.H, nL = this.nL, zc = this.zc, Ef = this.Ef;
    // The fields' mean slope is the flattest share f's, s̄ ((1 − f) ln(1 − f) + f)/f, so the cell's
    // tillage is ∝ (1 − f) ln(1 − f) + f: little while the fields keep to the bottoms, all of it
    // as they climb the hills. The fields lose it alone, so their deficit past the cell's mean grows
    // at the fields' rate × (1 − f) and is refilled by the soil's production over T_REFILL; fields
    // newly broken bring no deficit, and fields let go take theirs with them.
    const dF = this.dField, fP = this.fPrev || (this.fPrev = new Float32Array(nL)), eR = Math.exp(-dt / P.T_REFILL);
    for (let c = 0; c < nL; c++) {
      const f = this.f[c];
      if (!(f > 0)) { Ef[c] = 0; dF[c] *= eR; fP[c] = 0; continue; }
      const g = f < 1 ? (1 - f) * Math.log(1 - f) + f : 1;
      Ef[c] = P.E_TILL * H.slope[c] * g / P.S_REF * Math.exp(-Math.max(0, zc[c] - P.Z_FARM) / P.Z_CONS);
      if (f > fP[c] && fP[c] > 0) dF[c] *= fP[c] / f;
      const q = 1e-3 * Ef[c] / f * (1 - f);
      dF[c] = dF[c] * eR + q * P.T_REFILL * (1 - eR);
      fP[c] = f;
    }
    this.env.soil(dt, Ef);
  }

  industry(live, dt) {
    const P = this.P, E = this.E, nL = this.nL, ind = this.ind, zc = this.zc;
    if (!this.flags.industry) {
      // A hazard where culture, farming and coal all suffice (each a logistic, not a gate).
      for (let c = 0; c < nL; c++) {
        if (!(this.Ntot[c] > 0) || zc[c] < P.Z_IND - 1) continue;
        const haz = P.H_IND * sig((zc[c] - P.Z_IND) / P.W_IND) * sig((this.f[c] - 0.2) / 0.05) * sig(this.coalReach[c] - P.COAL_MIN) * sig((this.oreReach[c] - P.ORE_MIN) / 0.15);
        if (this.rng.uniform() > 1 - Math.exp(-haz * dt)) continue;
        ind[c] = 0.01; this.flags.industry = true;
        // The first works: fixed capital at its Solow balance for the cell's workers, and the
        // fossil capacity to run it.
        const ec = this.econ, Lh = P.LFP * this.Ntot[c] * ind[c], A = P.A_I0 * ex(P.THETA_I * (zc[c] - P.Z_IND));
        ec.on = true;
        ec.Kf = Math.pow(P.SAVE * A / P.DELTA_F, 1 / (1 - P.ALPHA)) * Lh;
        const Y = A * Math.pow(ec.Kf, P.ALPHA) * Math.pow(Lh, 1 - P.ALPHA);
        ec.Ke[0] = 1.2 * P.E_SUB * Y / P.R_EF0;
        this.event('industry', `industry begins at ${deg(this.H.lat[c]).toFixed(0)}°, ${deg(this.H.lon[c]).toFixed(0)}° (z ${zc[c].toFixed(2)}, coal within reach ${this.coalReach[c].toFixed(0)} Pg C, ore ${this.oreReach[c].toFixed(1)}× the land's)`);
        break;
      }
      return;
    }
    const i0 = Float32Array.from(ind);
    for (let c = 0; c < nL; c++) {
      if (!(this.Ntot[c] > 0)) continue;
      let v = i0[c] > 0 ? P.R_IND * i0[c] * (1 - i0[c]) : 0;
      const know = sig((zc[c] - (P.Z_IND - 1)) / 0.25);
      if (know > 1e-3) for (let o = E.off[c]; o < E.off[c + 1]; o++) {
        const d = E.nb[o];
        if (i0[d] > i0[c]) v += P.C_IND * know * (E.hop[o] ? 0.5 * Math.exp(-E.km[o] / Math.max(this.seaReach(zc[d]), 1e-9)) : 1) * (i0[d] - i0[c]) * this.speed(zc[c]) / P.V0;
      }
      ind[c] = Math.min(1, i0[c] + v * dt);
    }
  }

  // Merges, extinctions, splits (every CHECK years).
  books(pace = 1) {
    const P = this.P, H = this.H, nL = this.nL;
    // Merges: two lineages living on in the same cells (neither excluding the other) for T_MERGE
    // become one (soft species; as a stray piece of a plate joins the plate it borders). Its
    // ancestry is weighted by their numbers (genealogy); each cell keeps the higher culture (ideas
    // are non-rival: the better technique survives the meeting); its trait is the higher (selection
    // spreads the better side's alleles through the merged people). The union of each side's gains
    // since the split (beneficial mutations fixed apart, put together by recombination) would be
    // principled only with the trait's clock scaled by each lineage's numbers: on a clock that runs
    // alike in every lineage, splits and merges counted one people's gain several times, and the
    // first tip came 0.4–1.2 Myr early.
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
      if (this.t - this.mergeSince.get(key) < P.T_MERGE / pace) continue;
      const [big, small] = A.total >= B.total ? [A, B] : [B, A];
      const wb = big.total / (big.total + small.total), ws = 1 - wb;
      for (let c = 0; c < nL; c++) {
        const n = big.N[c] + small.N[c];
        if (n > 0) big.Z[c] = big.N[c] > 0 && small.N[c] > 0 ? Math.max(big.Z[c], small.Z[c]) : big.N[c] > 0 ? big.Z[c] : small.Z[c];
        big.N[c] = n; small.N[c] = 0;
      }
      big.g = Math.max(big.g, small.g);
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
    for (let c = 0; c < nL; c++) if (!this.reached[c] && this.Ntot[c] >= P.N_MIN * H.area[c]) this.reached[c] = 1;
    let minds = 0, people = 0, farm = 0, indp = 0, zmax = 0, soilF = 0, farmA = 0;
    for (let c = 0; c < nL; c++) {
      const y = this.Ntot[c] > 0 ? this.Out[c] / this.Ntot[c] : 0;
      minds += softMin(Math.pow(Math.max(y, 1e-3), P.RHO_R), P.S_R_MAX, 4) * this.Ntot[c];
      people += this.Ntot[c]; farm += this.Ntot[c] * this.f[c]; indp += this.Ntot[c] * this.ind[c];
      if (this.f[c] > 0) { const a = H.area[c] * this.f[c]; soilF += a * this.fieldSoil(c); farmA += a; }
    }
    if (E.on) minds += E.AIr;
    for (const L of live) {
      let tot = 0, zs = 0, zm = 0;
      for (let c = 0; c < nL; c++) if (L.N[c] > 0) { tot += L.N[c]; zs += L.N[c] * L.Z[c]; zm = Math.max(zm, L.Z[c]); }
      L.total = tot; L.zbar = tot > 0 ? zs / tot : 0; L.zmax = zm; L.peak = Math.max(L.peak, tot);
      (L.ht || (L.ht = [])).push(this.t); (L.hn || (L.hn = [])).push(tot);   // its numbers through time (Fig. 8's spindles)
      zmax = Math.max(zmax, zm);
      if (L.tipped === null && L.zbar > 1) {
        L.tipped = this.t; this.flags.tipped = true;
        let best = 0; for (let c = 0; c < nL; c++) if (L.N[c] > 0 && L.Z[c] > L.Z[best]) best = c;
        this.event('tip', `lineage ${L.id} tips: mean culture past 1 (g ${L.g.toFixed(2)}, ${tot.toFixed(0)} people, frontier at ${deg(this.H.lat[best]).toFixed(0)}°, ${deg(this.H.lon[best]).toFixed(0)}°)`);
      }
    }
    const earth = people;
    people += this.space;
    const y = earth > 0 ? this.O / earth : 0, F = this.flags;
    const once = (k, cond, text) => { if (!F[k] && cond) { F[k] = true; this.event(k, typeof text === 'function' ? text() : text); } };
    once('transition', y > 2 && people > 1e8, () => `income passes twice subsistence: the demographic transition (${(people / 1e9).toFixed(2)} billion)`);
    if (E.on) {
      F.peakFos = Math.max(F.peakFos || 0, E.Ef);
      once('peak', F.peakFos > 1e11 && E.Ef < 0.9 * F.peakFos, () => `fossil carbon's peak passed (${(F.peakFos / 1e12).toFixed(1)} TW; ${this.emitted.toFixed(0)} Pg C burned, ${E.S.toFixed(0)} left)`);
      once('renewables', E.Er > E.Ef && E.Er > 1e11, () => `renewables pass fossil carbon (${(E.Er / 1e12).toFixed(1)} TW)`);
      if (F.present && !this.ending) this.drawEnding();
      once('present', E.beta >= 0.15, () => `early takeoff (β_c 0.15; effective compute ${E.x.toFixed(2)} orders from 20%'s, compute ${E.Kc.toExponential(2)} sy): ${(this.t - (this.events.find(e => e.kind === 'industry') || { t: this.t }).t).toFixed(0)} yr after industry, ${(people / 1e9).toFixed(2)} billion people, ${((E.Ef + E.Er + E.Eu) / 1e12).toFixed(1)} TW (fossil ${(100 * E.Ef / Math.max(1, E.Ef + E.Er + E.Eu)).toFixed(0)}%), ${this.emitted.toFixed(0)} Pg C burned, CO₂ ${this.co2.toFixed(0)} ppm; ${(E.Y / people).toFixed(1)} sy of goods a person, K/Y ${(E.Kf / E.Y).toFixed(2)}, output at ${(100 * E.avail).toFixed(0)}% of its factors', famine ${(1000 * (this.famine / Math.max(1, people))).toFixed(2)}‰/yr (Earth's now: ~245 yr, 8, ~19 TW at ~80%, ~500 Pg C, ~420 ppm, ~20–25 sy, K/Y ~3–4; from memory)`);
      once('robots', E.Ap > P.PHI * E.Lh && E.Lh > 0, () => `robots' work passes people's physical work (β_p ${E.betaP.toFixed(2)}, ${E.bodies.toExponential(2)} bodies)`);
      once('compute', E.AAI > E.Lh && E.Lh > 0, () => `AI's labour passes people's (β ${E.beta.toFixed(2)}, ${(people / 1e9).toFixed(2)} billion people)`);
      once('fusion', E.Eu > E.Er && E.Eu > 1e11, () => `fusion passes renewables (${(E.Eu / 1e12).toFixed(0)} TW)`);
      once('sun', E.Er >= 0.9 * P.F_SUN * P.SUN_ABS, () => `surface renewables at their ceiling (${(P.F_SUN * P.SUN_ABS / 1e12).toFixed(0)} TW)`);
      once('cap', E.Eu + E.Ef >= 0.9 * E.capU, () => `fossil carbon and fusion near Earth's heat budget (${(E.capU / AREA_M2).toFixed(1)} W/m², ${(E.capU / AREA_M2 / P.B_EBM).toFixed(1)} K before feedbacks)`);
      once('space', E.Es > E.Ef + E.Er + E.Eu && E.Es > 1e11, () => `off-world energy passes Earth's (${(E.Es / 1e12).toFixed(0)} TW)`);
      once('disempowered', this.dis > 0.5, () => `people hold less than half the control (${(earth / 1e9).toFixed(2)} billion people)`);
      once('fossil', E.S <= 1e-6, () => `the fossil carbon is spent (${this.emitted.toFixed(0)} Pg C)`);
      F.peakCO2 = Math.max(F.peakCO2 || 0, this.co2);
      once('restored', F.peakCO2 > 350 && this.co2 < 300, () => `CO₂ drawn back below 300 ppm (${this.removed.toFixed(0)} Pg C taken back)`);
    }
    once('runaway', this.env.live ? this.boiled > 0 : this.Ft > P.F_RUN, () => `the runaway greenhouse: forcing ${this.Ft.toFixed(0)} W/m² (the oceans begin to boil away)`);
    once('boiled', this.boiled > 0.99, () => `the oceans are gone`);
    once('exodus', this.space > earth && this.space > 1e6, () => `more people off-world than on Earth (${(this.space / 1e9).toFixed(2)} billion)`);
    once('emptied', F.present && earth < 1e4, () => `Earth is empty of people (${(this.space / 1e9).toFixed(2)} billion off-world)`);
    once('extinct', F.present && people < 1e4, () => `the last people die`);
    const h = this.history;
    h.push({ t: this.t, dt, people, minds, O: this.O, food: this.food, zmax, farm: earth > 0 ? farm / earth : 0, ind: earth > 0 ? indp / earth : 0,
      Y: E.Y, Kf: E.Kf, Kc: E.Kc, Kq: E.Kq, Kr: E.Kr, AI: E.AAI, x: E.x, ze: E.z, Ap: E.Ap, beta: E.beta, betaP: E.betaP, avail: E.avail, Ef: E.Ef, Er: E.Er, Eu: E.Eu, Emat: E.Emat, Ecomp: E.Ecomp,
      energy: E.Ef + E.Er + E.Eu + (E.Es || 0), Es: E.Es || 0, co2: this.co2, earth, space: this.space, hE: this.hE, boiled: this.boiled, dis: this.dis, sA: E.sA || 0, geo: this.forcing.geo, removed: this.removed, Ft: this.Ft, fossil: E.S, X: E.X, heat: this.forcing.heat, aer: this.forcing.aer,
      soil: farmA > 0 ? soilF / farmA : 0, farmA, famine: earth > 0 ? this.famine / earth : 0, lineages: live.length });
    // The dial runs out where the minds double in under a day over the last few steps (one step's
    // blip isn't it); for T_FINE years after, a step is at most a year, so the ending resolves.
    const n = h.length;
    if (!F.dial && n >= 3) {
      const k = Math.max(0, n - 6), g = Math.log(h[n - 1].minds / h[k].minds) / Math.max(h[n - 1].t - h[k].t, 1e-12);
      if (g > 0 && Math.log(2) / g < 1 / 365.25) { F.dial = true; this.dialAt = this.t; this.dtCap = 1; this.event('dial', 'the minds double in under a day: the dial runs out'); }
    }
    if (F.dial && this.dtCap && this.t - this.dialAt > P.T_FINE) this.dtCap = null;
  }

  /** The next step: from the culture's pace and the minds' doubling, at most twice the last. */
  nextDt() {
    const P = this.P, h = this.history, n = h.length;
    let grow = 0;
    if (n >= 2 && h[n - 1].minds > 0 && h[n - 2].minds > 0) grow = Math.log(h[n - 1].minds / h[n - 2].minds) / h[n - 1].dt;
    const last = n ? h[n - 1].dt : P.DT_MAX / 2;
    return Math.max(P.DT_MIN, Math.min(this.flags.present ? P.DT_ECON : this.flags.tipped ? P.DT_MAX : P.DT_EARLY, P.DZ_MAX / Math.max(this.lastRate, 1e-12), grow > 0 ? 0.05 / grow : Infinity, 2 * last, this.dtCap || Infinity));
  }

  /**
   * The follow dial's rate of change (/yr): the fastest e-folding, growing or shrinking, over the
   * last 20 steps among the minds, the farmed land, the energy and AI's labour, and from early
   * takeoff the people on Earth and off it (what the ending moves). Below its floor a quantity is
   * out of it.
   */
  pace() { return paceOf(this.history, this.flags.present); }

  /** The write-back on the people's grid (src/engine/peoplelink.js): each cell's farmed share and tillage's erosion (mm/yr). */
  writeBack(out = null) {
    const n = this.planet.grid.n;
    if (!out) out = { f: new Float32Array(n), Ef: new Float32Array(n) };
    out.f.fill(0); out.Ef.fill(0);
    for (let c = 0; c < this.nL; c++) { const i = this.cells[c]; out.f[i] = this.f[c]; out.Ef[i] = this.Ef[c]; }
    return out;
  }

  /**
   * Where the people and the machines are (synthesis; drawn only, so the model's dynamics and its
   * calibration don't see it). Cities: each cell's urban share u (U_AG once it farms, rising to U_IND
   * with industry) lives in the cities its catchment reaches over land (R_CITY rings), each city
   * drawing on a source as its site (ports, rivers) × its density^G_CITY × e^{−km/L_CITY}. With
   * G_CITY > 1 the largest grow at the others' expense (agglomeration; standard in spirit, Zipf's
   * law the outcome), and cities follow their catchments over T_CITY, so they persist where they
   * began. A cell's drawn people are its rural ones and its city's. Industry's footprint follows its
   * workers (the drawn people × industry's share) over T_MACH while Earth has people, and holds when
   * it has none; factories, datacenters and the robots at work are the world's on Earth (its share
   * of the energy) spread over it: datacenters toward the cities, robots onto the farms too.
   */
  places() {
    const P = this.P, H = this.H, nL = this.nL, E = this.E, g = this.planet.grid;
    if (!this.ring) {
      // Each cell's catchment: its land cells within R_CITY rings, each with e^{−km/L_CITY}.
      const off = new Int32Array(nL + 1), idx = [], w = [], mark = new Int32Array(nL).fill(-1);
      const pos = c => { const i = this.cells[c]; return [g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]]; };
      for (let c = 0; c < nL; c++) {
        const p = pos(c);
        let front = [c]; mark[c] = c;
        for (let r = 0; r <= P.R_CITY && front.length; r++) {
          const next = [];
          for (const d of front) {
            const q = pos(d), km = R * Math.acos(Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
            idx.push(d); w.push(Math.exp(-km / P.L_CITY));
            if (r < P.R_CITY) for (let o = E.off[d]; o < E.off[d + 1]; o++) { const k = E.nb[o]; if (!E.hop[o] && mark[k] !== c) { mark[k] = c; next.push(k); } }
          }
          front = next;
        }
        off[c + 1] = idx.length;
      }
      this.ring = { off, idx: Int32Array.from(idx), w: Float32Array.from(w) };
      this.site = Float64Array.from(H.coast, (co, c) => 1 + P.SITE_COAST * co + P.SITE_RIVER * H.river[c]);
      this.city = new Float64Array(nL); this.uShare = new Float64Array(nL); this.mach = new Float64Array(nL);
      this.tPlaces = null;
    }
    const { off, idx, w } = this.ring, S = this.city, u = this.uShare, site = this.site, Ntot = this.Ntot, A = H.area;
    const dt = this.tPlaces === null ? Infinity : Math.max(0, this.t - this.tPlaces);
    this.tPlaces = this.t;
    const Wt = this.wbuf || (this.wbuf = new Float64Array(nL)), tgt = this.tbuf || (this.tbuf = new Float64Array(nL));
    for (let c = 0; c < nL; c++) {
      u[c] = H.alive[c] ? Math.min(1, (this.f[c] > 0 ? P.U_AG : 0) + (P.U_IND - P.U_AG) * this.ind[c]) : 0;
      Wt[c] = H.alive[c] ? site[c] * Math.pow(S[c] / A[c] + P.S0_CITY, P.G_CITY) : 0;
    }
    tgt.fill(0);
    for (let d = 0; d < nL; d++) {
      const U = u[d] * Ntot[d];
      if (!(U > 0)) continue;
      let Z = 0;
      for (let k = off[d]; k < off[d + 1]; k++) Z += Wt[idx[k]] * w[k];
      if (!(Z > 0)) { tgt[d] += U; continue; }
      for (let k = off[d]; k < off[d + 1]; k++) tgt[idx[k]] += U * Wt[idx[k]] * w[k] / Z;
    }
    // The country's scale: N_CITY of what each place sent drawn on to the K_NATION largest cities
    // within e^{−km/L_NATION}, by their density^G_NATION (so the largest grow past their catchments).
    if (P.N_CITY > 0) {
      const pos = this.cpos || (this.cpos = Float64Array.from({ length: 3 * nL }, (_, k) => g.pos[3 * this.cells[(k / 3) | 0] + (k % 3)]));
      const top = Array.from({ length: nL }, (_, c) => c).filter(c => H.alive[c]).sort((x, y) => Wt[y] - Wt[x]).slice(0, P.K_NATION);
      const Wn = top.map(c => site[c] * Math.pow(S[c] / A[c] + P.S0_CITY, P.G_NATION));
      const nat = this.nbuf || (this.nbuf = new Float64Array(nL));
      nat.fill(0);
      for (let d = 0; d < nL; d++) {
        const U = P.N_CITY * u[d] * Ntot[d];
        if (!(U > 0)) continue;
        let Z = 0;
        const wk = this.wk || (this.wk = new Float64Array(P.K_NATION));
        for (let k = 0; k < top.length; k++) {
          const c = top[k], dot = pos[3 * d] * pos[3 * c] + pos[3 * d + 1] * pos[3 * c + 1] + pos[3 * d + 2] * pos[3 * c + 2];
          wk[k] = Wn[k] * Math.exp(-R * Math.acos(Math.max(-1, Math.min(1, dot))) / P.L_NATION); Z += wk[k];
        }
        if (!(Z > 0)) continue;
        for (let k = 0; k < top.length; k++) nat[top[k]] += U * wk[k] / Z;
      }
      for (let c = 0; c < nL; c++) tgt[c] = (1 - P.N_CITY) * tgt[c] + nat[c];
    }
    const a = dt === Infinity ? 0 : Math.exp(-dt / P.T_CITY);
    for (let c = 0; c < nL; c++) S[c] = tgt[c] + (S[c] - tgt[c]) * a;
    // Industry's footprint: its workers' share of the drawn people, while there are people to work.
    if (this.people > 1e6) {
      let s = 0;
      for (let c = 0; c < nL; c++) { tgt[c] = ((1 - u[c]) * Ntot[c] + S[c]) * this.ind[c]; s += tgt[c]; }
      if (s > 0) {
        const am = dt === Infinity ? 0 : Math.exp(-dt / P.T_MACH);
        for (let c = 0; c < nL; c++) this.mach[c] = tgt[c] / s + (this.mach[c] - tgt[c] / s) * am;
      }
    }
  }

  /**
   * What the People view draws, eight values a cell of the people's grid: people per km² (rural and
   * city, `places`) and the robots at work per km² (worker-equivalents), the two tints; and the land's
   * uses, each a share of the cell and together at most all of it: cities, factories, datacenters,
   * farms and solar farms (synthesis). Each use takes the land its footprint density gives (D_URB
   * residents a km² of city; D_FAC, D_DC, D_SOL W/m²), claimed in that order: cities, factories and
   * datacenters first, farms (the model's farmed share) as far as they leave room, then solar farms.
   * Layout: [people, farms, cities, factories], [datacenters, solar farms, robots, reached] (reached:
   * 1 where people have ever lived, the Settlement map's explored land).
   */
  drawn(out = null) {
    const n = this.planet.grid.n, H = this.H, E = this.econ, P = this.P, nL = this.nL;
    out = out || new Float32Array(8 * n); out.fill(0);
    this.places();
    const S = this.city, u = this.uShare, m = this.mach, A = H.area;
    // The machines on Earth: the world's by Earth's share of the energy.
    let Wf = 0, Wd = 0, Rb = 0, Ws = 0;
    if (E.on) {
      const earth = E.Ef + E.Er + E.Eu, sE = earth > 0 ? earth / (earth + (E.Es || 0)) : 0, run = E.run || { c: 1, r: 1, q: 1 };
      Wf = Math.max(0, (E.sup || 0) + (E.EfoodGot || 0) + (E.EcdrGot || 0) - (E.Ecomp || 0)) * sE;
      Wd = P.W_C * (E.Kc * run.c + E.Kq * run.q) * sE;
      Rb = (E.Ap || 0) * sE;   // the robots' physical work in worker-equivalents (the bodies the AI drives: idle bodies past it aren't at work)
      Ws = E.Er || 0;          // surface renewables, all on Earth
    }
    // Weights: the footprint, toward the cities for datacenters and onto the farms for robots, and a
    // floor on all living land; solar farms on sunny, dry, unfarmed land.
    let Aal = 0, sd = 0, sr = 0, sf = 0, ss = 0;
    for (let c = 0; c < nL; c++) if (H.alive[c]) { Aal += A[c]; sf += this.f[c] * A[c]; }
    const wd = this.wdb || (this.wdb = new Float64Array(nL)), wr = this.wrb || (this.wrb = new Float64Array(nL)), ws = this.wsb || (this.wsb = new Float64Array(nL));
    for (let c = 0; c < nL; c++) {
      const people = (1 - u[c]) * this.Ntot[c] + S[c];
      wd[c] = m[c] * (1 + 4 * S[c] / Math.max(people, 1)); sd += wd[c];
      wr[c] = m[c] + (sf > 0 ? 0.3 * this.f[c] * A[c] / sf : 0); sr += wr[c];
      ws[c] = H.alive[c] ? A[c] * Math.cos(H.lat[c]) ** 2 * (0.15 + H.arid[c]) * (1 - this.f[c]) : 0; ss += ws[c];
    }
    const fl = P.MACH_FLOOR;
    for (let c = 0; c < nL; c++) {
      const i = this.cells[c], o = 8 * i, Am = A[c] * 1e6, floor = H.alive[c] ? A[c] / Aal : 0;
      const people = (1 - u[c]) * this.Ntot[c] + S[c];
      // Each use's land, in order of claim.
      let room = H.alive[c] ? 1 : 0;
      const take = want => { const v = Math.min(Math.max(0, want), room); room -= v; return v; };
      const city = take(S[c] / (A[c] * P.D_URB));
      const fac = take(Wf * (m[c] + fl * floor) / (1 + fl) / Am / P.D_FAC);
      const dc = take(sd > 0 ? Wd * (wd[c] / sd + fl * floor) / (1 + fl) / Am / P.D_DC : 0);
      const farm = take(this.f[c]);
      const sol = take(ss > 0 ? Ws * ws[c] / ss / Am / P.D_SOL : 0);
      out[o] = people / A[c]; out[o + 1] = farm; out[o + 2] = city; out[o + 3] = fac;
      out[o + 4] = dc; out[o + 5] = sol; out[o + 6] = sr > 0 ? Rb * (wr[c] / sr + fl * floor) / (1 + fl) / A[c] : 0; out[o + 7] = this.reached[c];
    }
    return out;
  }

  /** The largest cities (people), as `places` last left them. */
  cities(k = 3) {
    if (!this.city) return [];
    return Array.from(this.city.keys()).sort((a, b) => this.city[b] - this.city[a]).slice(0, k).map(c => ({ c, people: this.city[c], lat: this.H.lat[c], lon: this.H.lon[c] }));
  }

  /** Run until `stop` says so. */
  run({ tMax = 5e6, stop = () => false, onStep = null } = {}) {
    while (this.t < tMax) {
      this.step(this.nextDt());
      if (onStep) onStep(this);
      if (stop(this)) break;
    }
  }
}
