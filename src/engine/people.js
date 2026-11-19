// People, from the first hominins to the takeoff and the ending (docs/people.md). It reads a planet's fields (src/engine/peoplelink.js,
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
//             and are lost at λ z (imperfect copying; Tasmania's loss over ~10 kyr sets λ), less
//             where a cell's works keep them (`works`: monuments, writing, schools). A is
//             Kremer's constant (von Foerster's C = 1/(θA)). Social reach g is a lineage's trait,
//             rising as a clock (speculation): it lengthens contact and raises foraging's yield
//             (e^{K_G g}). With ψ = 1 and a capacity ∝ e^{θz}, the loop's population runs as
//             1/(t* − t), von Foerster's hyperbola (standard algebra). Below a threshold the loop
//             has a low fixed point (a saddle-node's: A M₀ θ e > λ is where it vanishes, synthesis),
//             so a branch "tips" when the minds within its reach pass ~λ/(Aθe), about a million.
//   minds     M: people pass ideas over a contact length ℓ, which the trait and culture lengthen
//             (ℓ = L_C0 e^{(g + z)/Z_L}), within the connected body they live in (land peopled at
//             MIND_REL of the inhabited world's mean density, and with boats narrow seas): M = N_C
//             (1 − e^{−πℓ²ρ/N_C}), the local minds' density ρ over a disc of radius ℓ, saturating at
//             the body's total N_C (synthesis). The threshold rises with the world: a forager world is
//             one body, a farming world's sparse margins (the Arctic, the deserts) part it, so the
//             Americas and Australia keep Kremer's lag. Minds are people × research intensity (rising
//             with income) and the other lineages' at η; AI's research minds join them through the
//             task CES below. Culture is also copied from neighbours who know more, of any lineage, as
//             often as people meet (each side's density against RHO_COPY).
//   people    a density per lineage. Births and deaths (`demography`): deaths by food per person
//             (hunger below subsistence, disease at density), cut by medicine as industrial income
//             rises; births fall with industrial income only; so mortality falls before fertility
//             (the demographic transition's stages, standard; Earth's rates from memory). Each
//             cell's pyramid of five-year cohorts rides its total (src/engine/cohorts.js): its old
//             people's deaths are the cell's aging, its working ages the economy's workers. The cell's
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
//   food      K = area × cold limit(z) × [(1 − f) max(b_L meat P_F(z) e^{K_G g}, herd) + b_S F P_F e^{K_G g}
//             + Y(f) s P_A(z) CO₂ / sick]: foraging's base density on land b_L from the accessible
//             NPP and water, its productivity P_F capped at CAP_F (the wild food, a flow), its large
//             game (`meat`, a stock hunted down where people arrive, src/engine/people.js `stocks`);
//             the sea's b_S from the coast's export production, its fish F a stock that industry's
//             fleets draw down; herders on the land the plough can't use, held by the leaner of
//             their summer and winter pastures within a season's move (`rates`); farming's fields Y(f) take a
//             river's floodplain first (watered, renewed by its floods, cropped as often as the
//             growing season's degree-days allow) and then the uplands (rain-fed, cropped only as
//             far as the rain hasn't leached the soil: the rest lies fallow, until industry's
//             fertilizer; and as deep as the regolith, `soilYield`); P_A capped by the organic
//             economy (Wrigley, from memory) until industry's energy lifts it; f the farmed share,
//             at most the arable land (a growing period long enough, flat enough, unfrozen; the cold
//             grasslands' sod turned only by industry's ploughs); s the package's suitability, bred
//             toward the place; the warm, wet tropics' diseases among farmers until medicine; CO₂'s
//             fertilization (`rates`, `capAt`).
//   soil      a renewable stock: the regolith h, made by Heimsath's production and stripped by the
//             rivers and by tillage; within a cell the land is ranked (deep, flat bottoms first),
//             so the fields hold h̄ (1 − ln f) less a deficit of their own, and their tillage is
//             E_TILL ((1 − f) ln(1 − f) + f)(s̄/S_REF) e^{−(z − Z_FARM)/Z_CONS} (10–100× the
//             geological rate on slopes, Montgomery 2007, from memory; conservation with culture,
//             synthesis), stepped exactly (`regolithStep`): held here on the cached planet, the
//             planet's own regolith when live.
//   stores    working capital's one distinct role: a harvest spread (a year's rain and warmth
//             spread on the planet, `harvestSigma`: less by rivers, pooled by trade once industry
//             comes) against granaries of up to S_MAX years' food, famine's expected deaths in the
//             demography; where the dial resolves the year, the planet's own years in place of
//             the spread (`addYears`: a drought or a volcanic winter is a famine where it fell);
//             and the seed kept for the next sowing (1/R of the harvest, R rising with culture).
//   farming   an origin hazard where people are settled near foraging's ceiling, know enough
//             (z ≥ Z_FARM) and have domesticates (the zones' seasonally dry climates: after Blumler
//             via Diamond, from memory), as far as no crops at hand suit the place; packages (each
//             its origin's climate) spread by contact and are taken up where they suit better,
//             farmers breeding them toward each place over T_ADAPT (`suit`, `suitHere`).
//   industry  starts where z passes Z_IND near coal and ore (the fossil map seeded on the opening's
//             lowland basins and shelves, a9, 2026-11-15; the ore map on its arcs, old crust and
//             cut relief, `oreMap`), then spreads by contact at up to IND_PACE times its own pace
//             (two centuries to reach the world). One world economy
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
//   endings   drawn by chance at early takeoff on two axes (a9): aligned, misaligned or paused, and
//             Earth preserved or sacrificed. Paused (3a, 3b; speculation): frontier capability is held
//             where the draw finds it by agreement, so the hyperbola breaks and the run goes on; 3a
//             leaves the climate to the economy, 3b phases fossil carbon out and draws CO₂ back by
//             people's own capture. Sacrificed, Earth is a radiator and the oceans boil past the runaway's
//             forcing; preserved, industry goes off-world, CO₂ is drawn down, sulfate holds the
//             forcing at none and farms return. Misaligned, humans' control and their births follow
//             AI's share of the work down; aligned, people leave for space as Earth fails or by
//             choice. Food is bought with energy for those the land can't feed (speculation all).
//   places    `places`: farmers' and industry's urban shares in cities that grow by their sites
//             and their size, and industry's machines on its workers' footprint; drawn, and the
//             cities' sizes weigh their dwellers' minds (urban scaling, the world's minds kept).
//   lineages  a lineage whose range stays broken into isolated pieces for T_SPLIT splits; gene flow
//             where lineages meet mixes their traits and ancestry, and two that keep sharing most of
//             the smaller's range for T_MERGE become one (soft species, synthesis). The first
//             hominins are placed at the heart of the broadest tree–grass mosaic on the landmass that can hold the
//             most of them, summed over R_ORIGIN (speculation).
//
// Units: years, km, people, z in e-folds; output in subsistence-years a year (sy/yr, a person's
// subsistence a year), capital in sy; energy in W; carbon in Pg C.
import { NZ } from './climate.js';
import { miami, VEG } from './vegetation.js';
import { regolithStep } from './regolith.js';
import { WORLDS } from './worlds.js';
import { OUR_SYSTEM, quarryName } from './solar.js';
export { WORLDS };
import { stream } from '../rng.js';
import { buildGrid } from '../grid/icosphere.js';
import { makeTransfer, prolong } from '../grid/transfer.js';
import { Year, YEAR } from './year.js';
import { COHORTS, stable, stableLookup, stepPyramid, stepTables, ageClock, settle, reference } from './cohorts.js';

export const PEOPLE = {
  // Habitat (synthesis)
  B0: 0.03, NPP_REF: 0.4,          // foragers per km² at NPP_REF kg C m⁻² yr⁻¹ of accessible NPP (Binford's order, from memory)
  // The sea's people (synthesis): a coastal cell's sea feeds up to B_SEA a km², half that where its
  // coast's export production is PS_REF g C m⁻² yr⁻¹ (the coasts' median on today's Earth and the
  // seeded planets, ~12–14; upwelling coasts and river mouths ~30), so a desert coast on an upwelling
  // (Peru's, Namibia's) feeds people the land can't. B_SEA keeps the coasts' mean at the flat bonus
  // (half of b) it replaced: the sea's food is moved toward the productive coasts, not added.
  B_SEA: 0.019, PS_REF: 13,
  R_FISH: 0.3, H_FISH: 0.03, H_FISH_IND: 0.45,   // the fish's regrowth (/yr: Schaefer's r for the stocks people take, a few tenths, from memory); fishing's take before industry and at industry's height (past the regrowth: the twentieth century's collapses), easing with culture as tillage does (Z_CONS)
  // Herders (synthesis): pastoralists' densities (~1 a km² on good steppe, from memory) on the grass
  // within a season's move, held by the leaner of summer's pasture and winter's (grazed standing,
  // where the coldest month is milder than −T_SNOW or the winter too dry for deep snow).
  D_HERD: 0.8, CAP_H: 2, G_HERD: 0.3, T_SNOW: 8, W_SNOW: 3, P_SNOW: 60,
  Z_HERD: 3.25, W_HERD: 0.25,     // herding's knowledge (past farming's: animals are domesticated with the crops, then herded where crops can't go)
  // Megafauna (synthesis; the overkill's timing speculation): large game as a stock a cell, regrowing
  // slowly and hunted in proportion to the foragers there and their culture; animals that evolved
  // beside hominins are wary (NAIVE_CO of a naive fauna's take), so they hold where people began and
  // are hunted out where people arrived after the tip (the Americas', Sahul's). Below M_EXT they're gone.
  R_MEGA: 0.03, H_MEGA: 0.04, NAIVE_CO: 0.15, M_EXT: 0.02, MEAT: 0.3, MG_REF: 0.6,   // regrowth (/yr: slow breeders, from memory), the take at a forager density B0 with full culture, wariness, extinction, meat's share of foraging at the full stock and the stock it was calibrated at
  TREE_EDIBLE: 0.4,                // trees' NPP's share a forager reaches, against grass's
  COAST: 0.5, P_DRY: 250, Q_RIVER: 200, ICE_MAX: 10,   // the coast's bonus; rain (mm) below which water limits; a river (m³/s); ice (m)
  T_COLD0: 2, K_COLD: 12, W_COLD: 3, // coldest month (°C) a culture of z holds: T_COLD0 − K_COLD z, over W_COLD (−10 °C at the tip, −22 °C at z 2: the Upper Palaeolithic on the mammoth steppe and in Beringia before farming, from memory)
  CAP_F: 8,                        // foraging's ceiling on the base density
  F0: 1, CAP_A: 100,             // farmers per km² at adoption (at NPP_REF, before the seed is kept and famines taken), and the organic economy's ceiling on its growth (~150/km² of good farmland at the top, as pre-industrial China's and Egypt's, from memory)
  // Crops' land (synthesis): a river's floodplain is watered and renewed by its floods (the Nile's,
  // the Ganges'), the uplands rain-fed on soils the rain leaches and fresh rock renews.
  W_FP: 0.3, FP_MAX: 0.6, P_IRR: 1500,          // the floodplain's width, km per √(m³/s) of discharge (hydraulic geometry's width ∝ √Q, standard; the belt's multiple of the channel from memory: the Nile's ~15 km, the Yangtze's ~50), and its most of a cell; the water (mm a year) a floodplain's fields get, for their crops' climate
  L_FERT: 0.6, T_LEACH: 15, E_FERT: 0.05, FP_RENEW: 0.5,   // the uplands' fertility 1/(1 + leaching/(L_FERT (1 + erosion/E_FERT))): leaching is the drainage (m/yr) × e^{(T − 15)/T_LEACH} (weathering's Arrhenius, ~doubling per 10 K), renewal fresh rock's (mm/yr of erosion); old leached tropical soils lose their nutrients, young temperate and eroding ones keep them (Walker and Syers; Porder and Vitousek; from memory). Where it is low the land lies fallow most years (swidden: the cropped share is the fertility), until industry's fertilizer makes it up. The floods make up FP_RENEW of what the uplands lack (the Nile's silt; the Amazon's and the Congo's floodplains, where rivers drain old shields, less)
  PATH: 2, T_PATH: 20, W_PATH: 2.5, P_PATH: 1200,   // the warm, wet tropics' diseases (malaria, sleeping sickness: the pathogens' latitudinal gradient, standard; their weight synthesis): capacity ÷ (1 + PATH × warmth × wetness × what medicine leaves), warmth a logistic in the annual mean, wetness the rain over P_PATH
  LGP_DRY: 1.5, LGP_WET: 4, LGP_SOIL: 100, PET_K: 55 / 12,   // rain-fed fields none with a growing period of LGP_DRY months or less, all from LGP_WET (a rain-fed grain needs ~90–120 days, FAO's zones from memory); the soil water (mm) a month carries on; the ground's PET_K (T + 4) mm a month
  S_ARABLE: 0.0075, ARABLE_MAX: 0.85,   // the gradient between cells whose e-folding share is too steep to plough (~15% hillslopes at ~20× it; synthesis), and the most of a cell under fields (villages, woods, pasture, wetland)
  GDD0: 800, GDD_E: 1200, GDD_CROP: 2500, CROPS_MAX: 3,          // crops' warmth: 1 − e^{−(GDD − GDD0)/GDD_E} of Miami's 3,000 g m⁻² yr⁻¹, a crop's (none in a boreal summer's ~800, two thirds at the prairies' ~2,000, all of it in the tropics); watered fields crop GDD/GDD_CROP times a year, at most CROPS_MAX
  CLIM_S: [7, 10, 0.9, 0.6],       // a crop's climate (its package's origin) against a cell's, Gaussian in the coldest month (K), the warmest (K), log rain and the summer's share of the rain: how far each may differ (a crop's envelope, after BIOCLIM's; synthesis: frost bounds the tropics' crops and the winter's chill the temperate ones', while sowing dates take up the season's rain)
  S_HALF: 0.05, T_ADAPT: 2000, A_ADAPT: 0.3, MIGR_F: 0.5, MIGR_S: 0.5, CLEAR_PACE: 5,
  SOD: 0.8,                        // the share of a cold grassland's arable land its sod keeps from the hoe and the wooden plough (by the cover's grass and the winter's cold: sod × logistic in −T_coldest/5 K)                    // a package suited s takes s/(s + S_HALF) × (1 + S_HALF) of the arable land (farmers grow a poor crop on the best land only)
  R_SEED0: 4, Z_R: 2,              // the harvest's yield on its seed at farming's start (pre-industrial grain ~4–10, from memory), ×e per Z_R of culture
  LIFT_MAX: 4,                     // industry's farming at most this many times the organic ceiling
  E_AG: 200,                       // W of industrial energy a person fed past the organic ceiling takes (fertilizer, machines, transport; rough, from memory)
  CO2_FERT: 0.25,                  // crops' yield × (1 + β ln(CO₂/280)), VECODE's β
  // Stores: the harvests' weather against granaries and trade (working capital's one distinct role)
  E_RAIN: 0.7, IRR: 0.5,           // a harvest's spread per unit of a year's log-rain spread (rain-fed; ×IRR by a river or lake)
  S_MAX: 0.5, Z_STORE: 1.5,        // years of food a farmer can keep, reached e-fold per Z_STORE of culture past Z_FARM
  Z_TRADE: 7, W_TRADE: 1, L_CORR: 1500,   // food traded comes with industry; the weather's correlation length (km), so trade pools ~(ℓ/L_CORR)² harvests
  B_TMAX: 0.5,                     // a harvest's most sensitivity to a year's warmth (per K: a crop near its degree-days' floor, where a cold summer takes half of it a degree; synthesis)
  SIG_REF: 0.3,                    // farming begins where harvests are steady: its hazard × e^{−σ/SIG_REF} (Richerson, Boyd and Bettinger, from memory; at 0.15 the wet tropics' steady rain outweighed the dry lands' domesticates, and Earth's first fields were in the Congo)
  // Soil (a renewable stock)
  H_YIELD: 0.3, Y_STONY: 0.3,      // m: the yield's e-folding in soil depth (topsoil); what fields on thin and stony ground still bear (terraced and manured hillsides: the Mediterranean's, farmed since the Neolithic; synthesis)
  E_TILL: 1, S_REF: 0.005, Z_CONS: 2,   // mm/yr of tillage's erosion at slope S_REF, falling e-fold per Z_CONS of culture past Z_FARM
  SDR: 0.3,                        // the share of it that leaves the cell (the rest settles downslope and on its floodplains: sediment delivery ratios of ~0.1–0.3 at this scale, from memory); the fields lose it all
  T_REFILL: 2000,                  // yr: the soil's production refilling the fields' deficit (~0.1 mm/yr near the surface, Heimsath's, from memory)
  // People
  // Births and deaths (/yr; Earth's series from memory: deaths ~3.5% → ~1.5% by 1950 → ~0.8%, births
  // ~3.5% → 3.4% in 1965 → 2.2% in 2000 → 1.7%; growth peaked ~2.1%/yr in the 1960s)
  B_PRE: 0.035, B_MIN: 0.01245, Y_B: 4.5, K_B: 3,   // births: the pre-industrial rate, the floor, falling with industrial income y_g past ~Y_B (4.5: with the pyramids' aging, today's Earth at ~9 B at early takeoff, as before them; steepness K_B; Earth's crude births ~3.7% at ~4 sy a person in 1950, ~2.1% at ~11 in 2000, ~1.7% at ~20 now, from memory); the floor is replacement, the crude birth rate of the rich end's stationary life table (src/engine/cohorts.js, `replacement`: e₀ ~80, 22% over 65), so a rich population neither grows nor dies out (Earth's rich countries sit below it now, and heritable fertility would bring it back over generations: speculation)
  D_LO: 0.015, F_FAM: 0.2,         // deaths where food is plentiful (so a frontier grows at B_PRE − D_LO, 2%/yr), and famine's rate per unit shortfall
  M_MIN: 0.25, Y_D: 3.2, M_SEN: 0.5,   // … and medicine's reach into senescence: its hazard × m^{M_SEN} (src/engine/cohorts.js)           // medicine: deaths × M_MIN + (1 − M_MIN) e^{−y_g/Y_D}
  AGE: 0.0087, Y_AGE: 30,          // aging without a pyramid (the demography alone): crude deaths + AGE (1 − e^{−y_g/Y_AGE}), AGE = B_MIN − M_MIN D_LO so a rich population is at replacement as with one (young growing populations die little, aged ones more: Earth's crude rate ~0.75% now, ~1%+ ahead; from memory)
  D0: 4, D_Z: 0.35, D_MAX: 3000, H_SLOPE: 1.5,   // dispersal km²/yr, its rise per unit z, cap; relief's cost (km)
  D_IND: 1e4,                      // … and industry's (railways and steamships, a logistic about Z_IND: the American and Siberian frontiers moved ~30–50 km a year in the nineteenth century, from memory), on top, past D_MAX
  // Ideas
  THETA: 1, A_INV: 6e-12, PSI: 1, LAMBDA: 1e-5, ETA: 0.3,   // A: von Foerster's C = 1/(θA) ≈ 1.7e11 person-years; λ: Tasmania's loss (~10% in 10 kyr)
  // Works (speculation): what a surplus builds besides people (monuments, writing, schools), in
  // person-years a cell: S_WORK of its urban share's labour, decaying over T_WORK without upkeep.
  // Forgetting falls as λ/(1 + w/W_WORK), w the works a person, so a people with works keeps its
  // culture through a crash; the labour is the Malthusian choice, fewer children fed (capacity × 1 − S_WORK u).
  S_WORK: 0.25, T_WORK: 500, W_WORK: 10,
  BETA_R: 0.25,                    // ideas get harder to find past industry's culture: people's research yields × e^{−β (z − Z_IND)} (Bloom and others 2020, from memory: research productivity falling while productivity's growth holds); AI's minds at full yield (their pace is THETA_C's)
  L_C0: 50, Z_L: 1.5, L_CMAX: 2e4,  // contact length (km) at g + z = 0, ×e per Z_L, at most
  MIND_REL: 0.3,                   // the density (against the inhabited world's mean) a body's people keep up across
  V0: 1, Z_V: 1.5,                  // copying's pace ×e per Z_V of culture
  COPY: 2e-3, ACC: 2e-3, RHO_COPY: 0.02,   // copying better neighbours, and other lineages in the cell (/yr at z = 0); the density (per km²) at which half the contacts are made
  RHO_R: 0.5, S_R_MAX: 1,          // research intensity ∝ y^ρ, capped at a subsistence-year's: a rich people's larger research share is offset by research's falling yield (BETA_R), so Kremer's A holds at Earth's 1960 (~1.8%/yr of productivity at 3 B; 3 at 3× gave the industrial era ~5–9%/yr at takeoff, and 90–220 Pg C burned by then)
  Z_BOAT: 0, L_SEA0: 40, L_SEA: 600, Z_SEA: 1.5, HOPS: 6, LONG_HOPS: 40, K_LONG: 4,   // sea crossings: from culture Z_BOAT, the reach L_SEA0 + L_SEA (1 − e^{−z/Z_SEA}) (km: rafts', then boats' along coasts and between islands, a few hundred km by the Upper Palaeolithic: Sahul and Bering crossed); cells of sea a crossing spans (every edge within HOPS; past it, each group of landmasses its K_LONG nearest others, to LONG_HOPS, then rounds until all are joined)
  L_OCEAN: 4000, Z_OCEAN: 6.2, W_OCEAN: 0.2,   // … and the open ocean's, a logistic in culture (deep-sea navigation: the Polynesians', then Europe's ~1500; synthesis): coastal craft reach a few hundred km for tens of kyr, then ships cross oceans within centuries
  OCEAN_HOPS: 80, M_ROUTE: 6, D_ROUTE: 1500,   // ocean routes: each landmass to every other within OCEAN_HOPS cells of sea, at up to M_ROUTE landings at least D_ROUTE km apart (the Atlantic beside Bering: a crossing between landmasses that the short ones already join, but by the long way round)
  S_SEA: 1e-3, FOUNDERS: 50,       // a voyage that founds a people across the sea: a year per crossing at full crowding and reach, ×e per Z_V of culture, × e^{−km/reach}; the founders (synthesis)
  // The trait (speculation: social reach as a clock)
  V_G: 2e-3, T_GEN: 25, S_BG: 0.04, NE_SHARE: 0.1, G_MAX: 9,   // the trait lengthens contact, up to G_MAX (ℓ at L_CMAX)
  K_G: 0.1,                        // … and raises foraging's yield, e^{K_G g} (cooking, hunting: speculation)
  // Lineages
  L_MAX: 12, CHECK: 10e3, T_SPLIT: 200e3, P_MIN: 3000, N_MIN: 0.003, P_EXT: 100, GENE_FLOW: 2e-3,   // N_MIN per km²; CHECK and T_MERGE shorten with culture's pace (e^{−z/Z_V}: people travel and mix as they copy), so lineages sharing a range merge within centuries once they do
  R_ORIGIN: 1000,                  // km: the first hominins at the heart of the broadest tree–grass mosaic, summed this far (speculation)
  MERGE: 0.1, T_MERGE: 50e3,       // lineages in contact (sharing this much of the smaller's numbers) for T_MERGE become one: kinds of hominin interbreeding where they meet (soft species; with half shared, lineages on two continents met only at their coasts and never merged: 3–6 at takeoff)
  T_ISO: 300e3,                    // isolation grows with the time two lineages' lines have been apart, τ, as their incompatibilities snowball (∝ τ²: Orr 1995, from memory): their gene flow and their merging both × e^{−(τ/T_ISO)²}, so lineages long apart meet as near strangers, the abler replacing the other where they share land with a little admixture (Neanderthals and us, ~600 kyr apart, a few % of our genome; a9: "too big of a gap … go extinct rather than merge"; the scale speculation). (With e^{−τ/T}, culture's pace still merged lineages 500 kyr apart within years once industry brought them together.)
  // Farming
  Z_FARM: 3, W_FARM: 0.15, H_FARM: 6e-6, SED: 0.6, R_ADOPT: 0.02, C_FARM: 4e-3, C_PKG: 0.05,
  BREED: 1,                        // industry's breeding: a crop's climate envelope × (1 + BREED × industry's share)
  // Domesticates by zone: the seasonally dry climates' large-seeded annuals (after Blumler via
  // Diamond, from memory), next to none in the perhumid tropics; and a river's floodplain in a dry
  // land (an oasis: water, wild cereals and people gathered in one strip; after Childe, from memory),
  // D_OASIS × its floodplain share × the land's aridity. (With deserts at none, the Nile's and the
  // Tigris's floodplains could never begin it, and Earth's first fields were by Lake Victoria and on
  // the Congo's rim.)
  DOMESTIC: { Af: 0.01, Am: 0.02, Aw: 0.25, As: 0.5, BS: 0.6, Cf: 0.2, Cs: 1, Cw: 0.7, Df: 0.1, Ds: 0.2, Dw: 0.2 },
  D_OASIS: 5,
  // Industry: where it starts and how it spreads
  IND_PACE: 60,                    // industry's spread by contact keeps culture's pace only to this many times its own (the works, capital and skills a place builds: industrialization reached the world's regions over two centuries, not one; from memory)
  RHO_IND: 10,                     // people per km² past which a farming people has the labour and the markets for industry
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
  // Building power takes physical work (a9: "humans also seem able to tile the earth in factories and solar panels before
  // there's even 10 million robots"): power plants on Earth are built at most at S_BUILD of the physical work (people's and
  // robots', worker-years) × B_POW W of average power a worker-year at Z_AI (~10 kW: solar's jobs against its installs,
  // from memory), e-fold per Z_BP of culture, to B_UP times it (better tools, but hands: speculation); space solar by the
  // robots alone, B_SPACE W a robot-year (thin film from asteroids: speculation).
  S_BUILD: 0.1, B_POW: 1e4, Z_BP: 2, B_UP: 10, B_SPACE: 1e8,
  M_K: 1, E_M0: 30, X_SCALE: 2e13, X_CRUST: 1e14, G_B: 0.3, SKINNER: 10,   // materials per sy invested; their energy (W per unit a year) at the first grades, rising as 1/grade while the grade falls arithmetically as the tonnage drawn rises geometrically (Lasky's rule, from memory), from X_SCALE to G_B of the first grade at the end of the crust's rich ores (X_CRUST), then ×SKINNER (common rock past Skinner's barrier; the lumped number speculation)
  R_MIN: 0.03, W_INV: 0.1,                          // the return beyond wear that investment must clear (a real interest rate, from memory); the switch's width in log return over cost
  AER: 0.11, Z_SCRUB: 2,                            // sulfate's forcing, W/m² per Pg C/yr of coal (~−1.1 at 10, from memory), scrubbed e-fold per Z_SCRUB
  // AI (speculation): capability from effective compute, labour from compute, bodies from robots
  Z_AI: 10.35, B_MAX: 1, SIGMA: 0.5,                // culture where AI's efficiencies are referenced (early takeoff lands near it, at Earth's ~20–25 sy a person); the automatable share's most; the tasks' elasticity
  X20: 8.08, THETA_C: 40, FLOP_GAP: 4,              // log₁₀ effective compute (sy of compute × e^{θ_C (z − Z_AI)}) where 20% of cognitive tasks automate; ~98% FLOP_GAP orders on (Davidson's FLOP gap, from memory). θ_C: AI's efficiency (algorithms and hardware) is its own fast field, so effective compute grows ~10×/yr at early takeoff (frontier training compute ~4–5×/yr and algorithms ~3×/yr, Epoch, from memory) where general TFP grows a few %/yr. (8.7 with S_IT at 5%: lowered by S_IT's log ratio, so the timeline holds.)
  GAP_P: 1.5, PHI: 0.5, SIGMA_G: 0.5,               // physical tasks need GAP_P orders more (Moravec, speculation); their share of production's tasks (~half, from memory); cognitive against physical, elasticity
  // Ordinary computing's share of investment past energy (compute exists before AI pays): Earth's
  // datacenters take ~1% of its investment (~$300 B of ~$27 T a year) and draw ~50 GW (~415 TWh in
  // 2024; from memory). At 5% the stock at early takeoff was ~$8 T of hardware drawing 170 GW, all
  // of Earth's ICT with its networks and devices; at 1.2%, 50 GW, its research's share (the labs'
  // training) ~15 GW. X20, X_AI and X_MAX are scaled with it, so AI's capability and labour per
  // unit of investment, and the timeline, hold.
  S_IT: 0.012,
  X_AI: 4.17e-3, THETA_AI: 40, X_MAX: 4.17e4, W_C: 12,  // labour-equivalents per sy of compute at Z_AI, ×e per 1/θ_AI (the same algorithms and hardware: inference's cost at a fixed capability falls ~10×/yr or faster, from memory), at most; its power (W/sy: ~20 W per $1,000 of hardware at ~$600 a sy, an H100's ~1 kW with its overhead per ~$30 k)
  S_RD: 0.03, Q_R: 0.4,                             // research's share of output (Earth's R&D ~2.5% of GDP, from memory), spent on compute as far as AI can do research (β_c); and research's share of AI's compute (training and research against deployment, speculation)
  C_R0: 50, Z_RC: 2, DELTA_R: 0.1, W_R: 400,        // a robot's body: sy at Z_AI (a humanoid's ~$25k, from memory), cheaper e-fold per Z_RC; wear /yr; its power (W)
  T_ROB: 1.44, B_SEED: 1e6,                         // the working fleet grows at most e-fold per T_ROB years (doubling a year: factories building the robots that build factories; synthesis on the industrial explosion's robot doubling times, ~a year at first, from memory), from B_SEED bodies (industrial robots now ~4 M, humanoids a few thousand)
  // Food bought with energy, space, and the endings (speculation)
  W_FOOD: 3000, Z_SYN: 10.35, W_SYN: 0.25, H_NEED: 1, H_FOOD: 19, F_ROOM: 0.01,   // W a person fed and housed indoors (synthetic or controlled-environment food, ~1 kW electrochemical-microbial to ~20 kW under LEDs, and shelter); where it matures (z) and the logistic's width; bought for the unfed, × (1 + H_NEED), whatever it costs; and room to (1 + H_FOOD) × the people (crowding's deaths negligible at replacement births) as far as it costs under F_ROOM of their income at energy's price at the margin
  Z_SPACE: 12, W_SPACE: 0.5, R_ES0: 1000, L_SUN: 3.83e26, E_SPACE: 100,   // industry off-world: where it matures (launch is no bind: robots go where they're wanted); W a sy of space solar; the Sun's output (W, standard); materials' energy from asteroids (W per unit a year)
  // The swarm is as large as its material (a9: "let the material set it"): collectors at 1 AU of
  // SIGMA_SW kg/m² with their radiators (thin film ~10× lighter than today's panels; speculation),
  // S_AU W/m² there (standard), so the whole Sun takes ~2.8e23 kg. The minable mass: the inner planet
  // (Mercury), taken apart for the swarm (a9: "Mercury should go to the Dyson swarm first and foremost":
  // a Kardashev-2 civilization is short of energy before it's short of room; after Armstrong and
  // Sandberg 2013, from memory), and the belt, for habitats (both masses from memory; these are
  // today's, and the People's constructor takes the planet's own system's: src/engine/solar.js). The
  // Moon (the tides), the settled worlds and Venus (its well and its air) are kept.
  SIGMA_SW: 1, S_AU: 1361, M_BELT: 2.4e21, M_MERC: 3.3e23,
  // People off-world (aligned; speculation): a habitat's mass a person (the 1975 Stanford torus
  // study's ~10 Mt for 10,000, mostly shielding, from memory); people a km² on other worlds'
  // surfaces (under domes and underground, at a city's density). Heritable fertility (a9): where
  // room is slack the mean growth rate rises at the additive variance in it (Fisher's fundamental
  // theorem, standard; its size from fertility's heritability ~0.2–0.3 and its spread between
  // families, from memory) toward a frontier's (R_FRONT: Malthus's colonies doubling in 25 years,
  // standard).
  M_HAB: 1e6, D_SURF: 4000, V_FERT: 1.7e-4, R_FRONT: 0.028, Z_SETTLE: 0.4,   // …, and the spread (decades of log₁₀ robots off-world) over which each world opens
  // Earth, aligned and past scarcity (a9: "the population of Earth rising rapidly once again once
  // abundance is achieved"; speculation): its room an ecumenopolis of D_ECU people a km² of living
  // land (a dense city's: Paris ~20,000, from memory) × its habitability; drawn with W_DC_P W a
  // person of datacenters (its own people's computing; drawn only).
  D_ECU: 1e4, W_DC_P: 5e3,
  // Probes to the stars (speculation): sent once the swarm takes F_PROBE of the Sun, at V_PROBE of
  // light's speed (after Armstrong and Sandberg's 50–99%, from memory); stars a cubic light-year
  // near the Sun (~0.14 a cubic parsec, from memory).
  F_PROBE: 0.01, V_PROBE: 0.5, N_STAR: 0.004, HAB_OPENS: 7,   // …; and where habitats about the Sun open (as WORLDS' `opens`)
  FOUNDERS_STAR: 1e4,                               // aligned: the people a probe starts a star's settlement with (grown or carried; speculation)
  S_ABS: 238,                                       // the sunlight Earth absorbs (W/m²: (1 − 0.3) × 1361/4, standard), which a sacrificing swarm shades by its share
  P_PAUSE: 1 / 3, T_PHASE: 30, T_CDR_P: 300, HEAT_HELD: 0.5,   // … and the waste heat 3b's coordination allows (W/m², reached as fossil carbon is phased out)     // a pause's odds (the rest aligned or not at P_ALIGN); 3b's fossil phase-out (yr, e-fold) and people's capture (yr to draw the excess CO₂ down, against an aligned AI's T_CDR)
  P_ALIGN: 0.5, P_PRESERVE: 0.5, ENDING: null,      // the endings' odds on two axes (a9: "up to chance"), drawn at early takeoff from the seed: aligned or not, Earth preserved or not ('1a' misaligned and Earth sacrificed, '1b' misaligned and preserved, '2a' aligned and sacrificed, '2b' aligned and preserved); ENDING forces one
  T_SA: 2, T_DIS: 30,                               // AI's share of the work it could do (sA) is handed to it over T_SA years; misaligned: humans' control falls toward AI's share of the work over T_DIS years (gradual disempowerment, Kulveit and others 2025, from memory), and their births with it (no floor)
  HEAT_SAC: 1000, HEAT_PRES: 0.1,                   // Earth's heat budget (W/m²) as AI comes to run things: sacrificed (Earth a radiator at ~385 K: the oceans boil) or preserved (heavy industry off-world)
  T_CDR: 30, J_CDR: 2.2e19,                         // preserved: CO₂ drawn back to CO2_0 over T_CDR years at J_CDR J a Pg C (direct air capture, ~6 GJ a t CO₂, from memory), sulfate holding the forcing at none meanwhile
  F_RUN: 40, E_BOIL: 3.7e27, T_HAB: 12,             // the runaway greenhouse's forcing (W/m²: absorbed past ~282 W/m², Goldblatt and others 2013, from memory); the heat that boils the oceans away (J: 1.4e21 kg from 15 °C, standard); the warming that leaves half the land unlivable (wet bulbs past 35 °C: Sherwood and Huber 2010, ~11–12 K, from memory)
  R_VOL: 1e-3, R_RET: 1e-3, R_MIG: 0.5, W_HAB: 1e4,   // aligned: Earth's people leaving for space a year by choice, and off-world's coming back by choice (× Earth's habitability: half and half where it's whole; a9: "offworlders migrate back to earth too"), and leaving as Earth's habitability fails; W a person off-world (live, the runaway and the warming are the planet's: src/engine/runaway.js)
  // Energy and heat
  B_EBM: 2.09, HEAT_MAX: 11.8,     // B (W m⁻² K⁻¹); the heat fossil carbon and fusion may add (W/m²)
  P_SITES: 1, P_HEAT: 4,           // soft ceilings: sites of uneven quality (harmonic), and the heat budget (a choice, so sharp; the ending's)
  // Where people and machines are (drawn only: `places`; synthesis)
  U_AG: 0.08, U_IND: 0.8,          // the urban share of farming peoples (agrarian empires' cities, ~5–10%) and where industry is whole (rich countries now ~80%); both from memory
  BETA_CITY: 1.15, S_CITY_REF: 2e4, DT_PLACES: 25,   // cities' minds (synthesis on urban scaling, innovation ∝ N^β, β ~1.15–1.25: Bettencourt and others 2007, from memory): a city dweller's ideas × (its city's size/S_CITY_REF)^{β−1}, the world's minds kept (normalized over everyone), so the loop runs faster where cities are large; the cities placed again in the step every DT_PLACES years
  R_CITY: 3, L_CITY: 100, G_CITY: 1.25, S0_CITY: 1, T_CITY: 100,   // a city's catchment over land (rings of cells, ~330 km at level 6) and its pull's e-fold (km); agglomeration's exponent on its density (>1: the largest win, Zipf's way); the density (per km²) every site starts from; years cities take to follow their catchments
  SITE_COAST: 1.5, SITE_RIVER: 1,  // a port's and a river's pull on a city, against an inland site's
  N_CITY: 0.2, K_NATION: 48, L_NATION: 800, G_NATION: 1.3,   // the country's scale: a share of each place's urban people drawn to the K largest cities within e^{−km/L_NATION}, by their density^G_NATION (capitals and primate cities; 35% at 1.6 ran away to one city of ~680 M)
  D_URB: 4000, D_RUR: 500, D_FAC: 30, D_DC: 500, D_SOL: 10,     // land each use takes: residents per km² of city; W/m² of factories, of datacenters, of solar farms at a sunny, dry site (from memory: dense cities 2,000–10,000 a km², heavy industry tens of W/m², datacenters hundreds to thousands, solar farms 5–10 W/m²); D_RUR the most a km² that live as countryside (the densest farmland's ~1,000, from memory): past it they live in towns, drawn as city
  SOL_FARM: 0.2, SOL_ROOM: 0.9,    // solar farms' preference for farmland against open land of the same sun (fields are worth more standing); the most of a cell's land they may cover (roads, rock, water)
  P_STEAM: 270, P_DIM: 30,         // the boiled sea's steam (bar, all of it: src/engine/runaway.js) and the pressure that dims the sunlight at the ground e-fold (the globe's steam wash; synthesis: Venus's ground, under 92 bar, is lit at a few %, from memory)
  T_WILD: 30,                      // years abandoned fields take to go back to the wild (old fields reforest in decades, from memory)
  T_MACH: 30, MACH_FLOOR: 1e-3,    // years industry's footprint takes to follow its workers; the footprint everywhere on living land (mines, roads, then machines wherever there is room), against its mean
  // Night (drawn only: `lights`): the light people make, lumens a person over the night (synthesis)
  // Stepping
  DT_MAX: 500, DZ_MAX: 0.05, DT_MIN: 1e-5, NSUB_MAX: 4, NSUB_IND: 48,   // the spread's most substeps a step, before industry and after (its mobility needs them in the economy's 10-year steps)
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
/** A solar farm's yield where it stands, against a dry subtropical site's (D_SOL): the sun's height and the sky's clearness (synthesis). */
const sunAt = (lat, arid) => Math.min(1, Math.cos(lat) * (0.6 + 0.4 * arid) / 0.9);

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
 *     lifts the crude rate once fertility has fallen: m^{M_SEN} × `aging`, the cell's pyramid's senescence past
 *     the pre-industrial reference's (src/engine/cohorts.js), or without a pyramid its closure AGE
 *     (1 − e^{−y_g/Y_AGE}).
 * The harvest varies from year to year (σ, its relative spread) and a store covers shortfalls up to
 * `store` years of food: famine's expected deaths over the year's spread, F_FAM y σ G(u/(y σ)) with
 * u = 1 − store − y (G the normal's partial expectation), add what the mean shortfall alone misses
 * (none as σ → 0). This is the closure for the droughts a step of years to centuries can't resolve
 * (synthesis, as the planet's layers carry their statistics when the dial outruns them). Where the
 * planet's own years are known (`real`: the share phi of the step they cover, and the harvest's
 * anomaly over them, mean m and spread s), they stand in for that share: F_FAM y s G((u − y m)/(y s)).
 * dN/dt = N (b − d) is a logistic on either side of N = K (fed, and short), each solved exactly; a
 * step that crosses K keeps its side's law (a small error). Returns the new total and the deaths'
 * density coefficient, which sets competition between lineages.
 */
export function demography(N, K, yg, dt, P, sigma = 0, store = 0, bf = 1, real = null, aging = null) {
  const b = bf * (P.B_MIN + (P.B_PRE - P.B_MIN) / (1 + Math.pow(Math.max(0, yg) / P.Y_B, P.K_B)));
  // Medicine first; then, as fertility's fall ages the population, the crude death rate rises again.
  const m = P.M_MIN + (1 - P.M_MIN) * Math.exp(-Math.max(0, yg) / P.Y_D), ms = Math.pow(m, P.M_SEN), age = aging !== null ? ms * aging : P.AGE * (1 - Math.exp(-Math.max(0, yg) / P.Y_AGE));
  if (!(K > 1e-9)) return { N: N * Math.exp(-dt / 20), crowd: 0, b, d: 0.05, famine: 0, m: ms };
  let r, a;
  if (N <= K) { r = b - m * P.D_LO - age; a = m * (P.B_PRE - P.D_LO) / K; }
  else { r = b - m * P.B_PRE - age + P.F_FAM; a = P.F_FAM / K; }
  // The years' famines past the mean's, held over the step.
  let dv = 0;
  if ((sigma > 1e-6 || real) && N > 0) {
    const y = K / N, u = 1 - store - y, ph = real ? real.phi : 0;
    const ex = (m, s) => y * s > 1e-9 ? y * s * partialG((u - y * m) / (y * s)) : Math.max(0, u - y * m);
    dv = P.F_FAM * Math.max(0, (ph < 1 ? (1 - ph) * ex(0, sigma) : 0) + (ph > 0 ? ph * ex(real.m, real.s) : 0) - Math.max(0, u));
    r -= dv;
  }
  const e = Math.exp(Math.max(-50, Math.min(50, r * dt)));
  const Nn = Math.abs(r) > 1e-12 ? r * N * e / (r + a * N * (e - 1)) : N / (1 + a * N * dt);
  return { N: Nn > 0 && Number.isFinite(Nn) ? Nn : 0, crowd: a * K, b, d: b - (r - a * N), famine: dv, m: ms };   // m: senescence's medicine
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
  const x0 = Math.log10(Math.max(Kc, 1e-30)) + P.THETA_C * (z - P.Z_AI) / Math.LN10 - P.X20, x = P.X_CAP != null ? Math.min(x0, P.X_CAP) : x0;   // a pause holds the frontier (X_CAP)
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

/**
 * The robots at work on Earth (worker-equivalents; synthesis): the physical work its own economy
 * needs, the jobs its workers' physical tasks filled (Φ Lh), or its share sE of the energy where that
 * is more (a sacrificed Earth's industry), together as a soft maximum and at most all of them; the
 * rest go off-world as it opens (aS). (By the energy's share alone, a preserved Earth on 51 TW of
 * fusion beside a swarm's 10²⁵ W kept a million robots.) Where they're counted and drawn only.
 */
export function earthBots(Ap, Lh, sE, aS, P) {
  if (!(Ap > 0)) return 0;
  const need = Math.pow(Math.pow(P.PHI * Lh / Ap, 4) + Math.pow(sE, 4), 0.25);
  return Ap * (1 - aS * Math.max(0, 1 - need));
}

/**
 * Heritable fertility (speculation on Fisher's fundamental theorem, standard): the mean growth rate
 * past replacement rises at the additive variance in it, V_FERT, where room is slack (s, 0–1), and
 * the variance erodes as it nears a frontier's R_FRONT: dr/dt = V s (1 − r/R), stepped exactly.
 */
export function fertility(r, s, dt, P) {
  return P.R_FRONT - (P.R_FRONT - r) * Math.exp(-P.V_FERT * s * dt / P.R_FRONT);
}

/**
 * People moving between Earth (N) and off-world (S) over dt (aligned): out at a = open (R_VOL +
 * R_MIG (1 − hE)) a person a year as far as there's room off-world, back at b = open R_RET hE as far
 * as Earth has room (RE). Returns the net moved off-world (back if negative).
 */
export function migration(N, S, room, RE, open, hE, dt, P) {
  const a = open * (P.R_VOL + P.R_MIG * (1 - hE)), b = open * P.R_RET * hE;
  const out = Math.min(N * (1 - Math.exp(-a * dt)), Math.max(0, room - S));
  const back = N > 0 ? Math.min(S * (1 - Math.exp(-b * dt)), Math.max(0, RE - (N - out))) : 0;
  return out - back;
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
export function industrialStep(E, { Lh, z, Efood = 0, Ecdr = 0, ending = null, sA = 0, capR: capR0 = null, capS: capS0 = null, keepF: keep = 1, heatB: heat0 = null }, dt, P) {
  const rr = P.R_ER0 * sig((z - P.Z_REN) / P.W_REN), ru = P.R_EU0 * sig((z - P.Z_FUS) / P.W_FUS);
  const rf = E.S > 0 ? P.R_EF0 * Math.sqrt(E.S / P.FOSSIL) : 0;
  const A = P.A_I0 * ex(P.THETA_I * (z - P.Z_IND));
  // The robots this step can field: the paid-for bodies, as far as the fleet's ramp has grown.
  const bmax = Math.max(P.B_SEED, E.Bc || 0) * Math.exp(dt / P.T_ROB), bodyCost = P.C_R0 * Math.exp(-Math.min(Math.max(0, z - P.Z_AI) / P.Z_RC, 300));
  const T0 = labour(Lh, E.Kc, E.Kr, z, 1, P, E.Kq, bmax);
  // Energy: compute's power, materials' for building, output's (its intensity falling with z).
  const eY = P.E_MIN_Y + (P.E_SUB - P.E_MIN_Y) * Math.exp(-(z - P.Z_IND) / P.Z_EFF);
  // Ores' grades fall smoothly past the crust's rich ones (Skinner's barrier as a gap in the grades' distribution).
  const XC = P.X_CRUST * (E.oreRich ?? 1);   // this planet's rich ores (the ore map's richness)
  const grade = 1 - (1 - P.G_B) * Math.log10(1 + softMin(E.X, XC, 4) / P.X_SCALE) / Math.log10(1 + XC / P.X_SCALE);
  let em = P.E_M0 / grade * (1 + (P.SKINNER - 1) * sig((E.X - XC) / (0.25 * XC)));
  // Off-world industry: space solar (no heat on Earth), and materials from asteroids where they
  // cost less than the crust's ores (their share aA, a smooth switch; the crust draws down only by
  // the rest).
  const aS = sig((z - P.Z_SPACE) / P.W_SPACE), rs = P.R_ES0 * aS;
  const aA = aS * sig(Math.log(em / P.E_SPACE) / P.W_INV);
  em = em * (1 - aA) + P.E_SPACE * aA;
  const Ecomp = P.W_C * (E.Kc + E.Kq) + P.W_R * T0.Ap;   // compute's power, and the working robots', at full running
  // Capacities: surface renewables and space solar approach their ceilings as the best sites fill
  // (harmonic); fossil carbon and fusion share Earth's heat budget (sharp: a choice). The budget is
  // people's (HEAT_MAX) until AI runs things (its share of the work, sA), then the ending's: a
  // sacrificed Earth is a radiator, a preserved one keeps its heavy industry off-world and its
  // fossil carbon in the ground.
  const heatB = heat0 ?? (ending ? P.HEAT_MAX * (1 - sA) + (ending.preserve ? P.HEAT_PRES : P.HEAT_SAC) * sA : P.HEAT_MAX);   // `heatB`: a paused world's own
  const keepF = (ending && ending.preserve ? 1 - sA : 1) * keep;   // `keep`: a paused world's own phase-out
  // Surface solar's ceiling is the land it may stand on (People.solarRoom: D_SOL W/m² where the
  // sun is best, less as it weakens; by default all Earth's land, 1.49e14 m², standard); space
  // solar's what its material builds (People.swarmRoom; by default the whole Sun).
  const capR = capR0 ?? P.D_SOL * P.SOL_ROOM * 1.49e14, capU = heatB * AREA_M2, capS = capS0 ?? P.L_SUN;
  E.capR = capR;
  const cr = softMin(E.Ke[1] * rr, capR, P.P_SITES), cs = softMin(E.Ke[3] * rs, capS, P.P_SITES);
  E.cs = cs;
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
    // All the robots run unless fewer running makes measurably more (a part in 10⁶): where energy
    // binds, output barely moves with them, and the search's pick was rounding (past the dial,
    // the running share wandered 0.3–1 and the fleet's building with it).
    let best = outAt(urMax), ur = urMax;
    const better = (x, y) => x.Y > y.Y * (1 + 1e-6);
    if (urMax > 0 && better(outAt(urMax * (1 - 1e-3)), best)) {
      let a = 0, b = urMax;
      const g = (Math.sqrt(5) - 1) / 2;
      let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = outAt(x1).Y, f2 = outAt(x2).Y;
      for (let k = 0; k < 40; k++) {
        if (f1 < f2) { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = outAt(x2).Y; }
        else { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = outAt(x1).Y; }
      }
      const opt = outAt(0.5 * (a + b));
      if (better(opt, best)) { ur = 0.5 * (a + b); best = opt; }
    }
    const { T, Ypot, Eo, Y } = best, run = { c: uc, r: ur, q: uq };
    // Where the robots work: on Earth those its own economy needs (earthBots), the rest off-world
    // as it opens (where they're counted and drawn; launch is no bind, so space solar's building
    // draws on the whole fleet, as Earth's power does).
    const ApE = earthBots(T.Ap, Lh, sup0 > 0 ? (Er + Eu + Ef) / sup0 : 1, aS, P), ApS = T.Ap - ApE;
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
    let Ie = 0, gE = 0, Ies = [0, 0, 0, 0];
    if (ws > 0) {
      gE = sig(Math.log(Math.max(lamE * rbar / ((P.DELTA_E + P.R_MIN) * emb), 1e-300)) / P.W_INV);
      Ie = gE * Math.min(P.F_IE * I, P.DELTA_E * Ke + gap / (rbar * P.T_BUILD));
      // Each source by its return at the margin, then held to the power the physical work can
      // build a year (BUILD, above): on Earth people's and the robots', in space the robots'.
      Ies = wts.map(v => Ie * v / ws);
      const kB = P.B_POW * Math.exp(Math.min(Math.log(P.B_UP), (z - P.Z_AI) / P.Z_BP));
      const wE = Ies[0] * rf * keepF + Ies[1] * rr + Ies[2] * ru, bE = P.S_BUILD * kB * (P.PHI * Lh + T.Ap);
      if (wE > bE) { const f = bE / wE; Ies[0] *= f; Ies[1] *= f; Ies[2] *= f; }
      const wS = Ies[3] * rs, bS = P.S_BUILD * P.B_SPACE * T.Ap;
      if (wS > bS) Ies[3] *= bS / wS;
      Ie = Ies[0] + Ies[1] + Ies[2] + Ies[3];
    }
    // The rest: ordinary computing's share to compute, the remainder among fixed capital, compute
    // and robots by their marginal products (each by a small difference in labour, so compute's
    // includes the capability a bigger run buys: the loop from investment to capability to
    // returns). Research's compute: R&D's share of output, as far as AI can do research (β_c),
    // ahead of the rest.
    // Research's budget buys compute with its power: a unit's power a year at energy's worth beside
    // its wear (while energy is cheap, under 2% of it). (Without it, past the space solar's ceiling
    // research's compute settled at about a third of all the power, and output starved.)
    const Iq = Math.min(Math.max(0, I - Ie), P.S_RD * Y * T.bc / (1 + lamE * P.W_C / P.DELTA_C));
    const Isave = Math.max(0, I - Ie - Iq), YL = T.L > 0 ? (1 - P.ALPHA) * Y / T.L : 0;
    // At the margin, in output: the capital–labour bundle earns its share sKL of what a unit adds to
    // the bundle; machines left idle for want of power earn nothing; running, each pays its power at
    // energy's worth in output (compute W_C a unit, the robots W_R a worker-equivalent they do). (Paid
    // only once the fleet could all run, a robot's return jumped from nothing to the bottleneck's
    // worth as power came free, and a step's saving went to robots: below, at most what the ramp fields.)
    const MPf = E.Kf > 0 ? sKL * P.ALPHA * Y / E.Kf : Infinity;
    const MPc = YL > 0 && uc >= 1 ? Math.max(0, sKL * YL * Math.max(0, labour(Lh, E.Kc + hc, E.Kr, z, run, P, E.Kq, bmax).L - T.L) / hc - lamE * P.W_C) : 0;
    let wf = 1, wc = 0;
    if (MPf !== Infinity) { const a = MPf ** 4, b = MPc ** 4, t = a + b; if (t > 0) { wf = a / t; wc = b / t; } }
    const RU = MPf === Infinity ? Infinity : Math.max(MPf / (P.DELTA_F + P.R_MIN), MPc / (P.DELTA_C + P.R_MIN)) / emb;
    // Robots apart (a9: "robots turn on and off"). A body costs little (past the dial ~0.003 sy) and
    // its power much, so their margin net of power against the body's cost read ~1,000× the moment the
    // work's worth edged past the power's and nothing a hair below: past the dial, where the two sit
    // close, the fleet was bought to the ramp every few steps and wore down between. A unit's yearly
    // product against all it costs a year (its power at energy's worth, its wear and return) takes the
    // same smooth switch as the other stocks, of what the ramp can field; and the margin is taken as if
    // the ramp could field them (taken at the ramp, a fleet bought up to it read nothing until the ramp
    // had outgrown it).
    let Rr = 0;
    if (YL > 0 && ur >= urMax && urMax >= 1) {
      const Tu = labour(Lh, E.Kc, E.Kr, z, run, P, E.Kq), Tr = labour(Lh, E.Kc, E.Kr + hr, z, run, P, E.Kq);
      const gain = sKL * YL * Math.max(0, Tr.L - Tu.L) / hr, cost = lamE * P.W_R * Math.max(0, Tr.Ap - Tu.Ap) / hr;
      Rr = gain / (cost + (P.DELTA_R + P.R_MIN) * emb);
    }
    // Robots past what the fleet's ramp can field (a step's ramp ahead), or past what AI's physical
    // work can drive (a quarter over), aren't built. (With the ramp alone the fleet quadrupled in a
    // year's step past the minds that drive it, stood idle and wore down, a cycle every ~40 years.)
    const Krmax = Math.min(bmax * Math.exp(dt / P.T_ROB), Math.max(P.B_SEED, 1.25 * P.PHI * T.Aprod)) * bodyCost, ed = Math.exp(-P.DELTA_R * dt);
    const IrMax = Math.max(0, (Krmax - E.Kr * ed) * P.DELTA_R / (1 - ed));
    const Irob = Math.min(Isave, IrMax * sig(Math.log(Math.max(Rr, 1e-300)) / P.W_INV));
    const Ir = (RU === Infinity ? 1 : sig(Math.log(Math.max(RU, 1e-300)) / P.W_INV)) * (Isave - Irob);
    const gK = Isave > 0 ? (Ir + Irob) / Isave : 0;
    const Iall = Ie + Iq + Ir + Irob;
    return { s, sReal: Y > 0 ? Iall / Y : 0, eYM, need, Er, Es, Eu, Ef, sup0, sF, sC, sup, T, Ypot, Eo, Y, run, sKL, lamE, gE, gK, Ie, Ies, Iq, Ir, Irob, wf, wc, Iall, ApE, ApS };
  };
  let st = plan(E.sInv ?? P.SAVE);
  if (Math.abs(st.sReal - st.s) > 1e-5) {
    let a = 0, b = P.SAVE;
    for (let k = 0; k < 24; k++) { const m = 0.5 * (a + b), x = plan(m); if (x.sReal > m) a = m; else b = m; }
    st = plan(0.5 * (a + b));
  }
  const { Y, Ypot, Eo, T, run, Er, Es, Eu, Ef, sup, need, Ie, Ies, Iq, Ir, Irob, wf, wc, ApE, ApS } = st, avail = Ypot > 0 ? Y / Ypot : 1;
  const Ica = (1 - P.S_IT) * Ir * wc, Ic = P.S_IT * Ir + Ica, Ir_ = Irob, If = (1 - P.S_IT) * Ir * wf;
  // Labs keep research's share of AI's compute: for each unit deployed, Q_R/(1 − Q_R) for training and research.
  const Iq2 = Math.min(If, P.Q_R / (1 - P.Q_R) * Ica), IfNet = If - Iq2;
  const grow = (K, inflow, d) => K * Math.exp(-d * dt) + inflow * (1 - Math.exp(-d * dt)) / d;
  E.Kf = grow(E.Kf, IfNet, P.DELTA_F); E.Kc = grow(E.Kc, Ic, P.DELTA_C); E.Kr = grow(E.Kr, Ir_, P.DELTA_R); E.Kq = grow(E.Kq, Iq + Iq2, P.DELTA_C);
  E.Bc = Math.min(E.Kr / bodyCost, bmax);   // the fleet fielded, which the ramp grows from
  E.flows = { f: IfNet, c: Ic, r: Ir_, e: Ie, q: Iq + Iq2 };
  E.Ke = E.Ke.map((K, s) => grow(K, Ies[s], P.DELTA_E));
  const burned = Math.min(E.S, Ef * YEAR_S * dt / P.J_PGC);
  const Iall = st.Iall, Emat = em * P.M_K * Iall;
  E.S -= burned; E.X += P.M_K * Iall * (1 - aA) * dt; E.I = Iall; E.sInv = st.s;
  E.sup = sup;
  Object.assign(E, { Y, Ypot, avail, A, run, Es, EfoodGot: st.sF, EcdrGot: st.sC, capU, capS, aA, ApE, ApS, Ecomp: sup - Eo, chi: T.chi, beta: T.bc, betaP: T.bp, x: T.x, AAI: T.A, AIr: T.Ar, Ap: T.Ap, bodies: T.bodies, need, Ef, Er, Eu, Emat, EcompFull: Ecomp, burned, Lh, z, eY, em, wc, wr: Ir + Irob > 0 ? Irob / (Ir + Irob) : 0,
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
  /** On a planet's fields (people-worker.js), with PEOPLE overrides and its solar system (src/engine/solar.js: the worlds to settle, the swarm's quarry and the belt). */
  constructor(planet, params = {}, system = OUR_SYSTEM) {
    this.sys = system;
    this.worlds = system.worlds;
    this.P = { ...PEOPLE, M_MERC: system.quarry.mass, M_BELT: system.belt.mass, ...params };
    this.planet = planet;
    this.rng = stream(planet.seed, 'people'); this.seaRng = stream(planet.seed, 'people:sea');
    this.t = 0; this.events = []; this.history = []; this.lineages = []; this.nextId = 0;
    this.index(); this.rates(planet); this.graph(); this.fossilMap(); this.oreMap();
    const nL = this.nL;
    this.soil = new Float64Array(nL); this.dField = new Float64Array(nL);   // the regolith's mean (m); the fields' deficit past it (m)
    for (let c = 0; c < nL; c++) this.soil[c] = planet.reg ? planet.reg[this.cells[c]] : 1;
    this.Ef = new Float64Array(nL);
    this.f = new Float32Array(nL); this.pkg = new Int16Array(nL).fill(-1); this.packages = []; this.pkgT = new Float64Array(nL);   // the farmed share, its package, and when it was taken up
    this.ind = new Float32Array(nL);
    this.Ntot = new Float64Array(nL); this.Out = new Float64Array(nL); this.goods = new Float64Array(nL);
    this.reached = new Uint8Array(nL);   // where people have lived (sticky: the Settlement map's explored land)
    // The stocks people draw on (`stocks`): large game and the coast's fish (shares of their own
    // without people), and how wary each cell's game is of people (set when people first come).
    this.herdS = new Float64Array(nL); this.past = new Float64Array(nL); this.Kown = new Float64Array(nL);   // herders' hold on the unfarmed land, their pasture's share of the cell (drawn), and the capacity it was found at
    this.mega = new Float64Array(nL).fill(1); this.fish = new Float64Array(nL).fill(1); this.naive = new Float64Array(nL).fill(1); this.met = new Uint8Array(nL);
    // Each cell's pyramid (src/engine/cohorts.js), at the pre-industrial reference until people come;
    // the aging it adds to the crude death rate, and its workers' share.
    const KC = COHORTS.K, ref = stable(this.P.B_PRE, 0);
    this.pyr = new Float64Array(KC * nL); for (let c = 0; c < nL; c++) this.pyr.set(ref, KC * c);
    this.senRef = reference(this.P).sen; this.sen = new Float64Array(nL).fill(this.senRef); this.aging = new Float64Array(nL); this.lfp = new Float64Array(nL).fill(this.P.LFP);
    this.uw = new Float64Array(nL);   // cities' minds: each cell's weight (`places`)
    this.works = new Float64Array(nL);   // works a cell (person-years, `stocks`)
    this.pyrTmp = new Float64Array(KC + 1); this.Ng = new Float64Array(nL); this.pyrSum = new Float64Array(nL).fill(1); this.pyrOut = { sen: 0, work: 0 };
    this.econ = newEconomy(this.P);
    this.econ.oreRich = this.oreRich;
    this.env = new CachedEnv(this);
    this.flags = {}; this.co2 = this.P.CO2_0; this.O = 0; this.people = 0; this.lastRate = 0; this.emitted = 0;
    this.forcing = { heat: 0, aer: 0, geo: 0, shade: 0 };
    // The ending (drawn at early takeoff), food bought with energy, Earth's habitability, the oceans, people off-world.
    this.endRng = stream(planet.seed, 'people:ending'); this.ending = null;
    this.Ksyn = new Float64Array(nL); this.dis = 0; this.hE = 1; this.boiled = 0; this.space = 0; this.removed = 0; this.rewild = 0;
    // Off-world: the heritable growth rate past replacement, Earth's people when the ending is drawn
    // (a whole Earth's room), the room off-world, the mass mined (kg: the belt's, then Mercury's) and
    // its yearly flow, the habitats' people, and when the probes left.
    this.fert = 0; this.room = 0; this.mined = 0; this.mMerc = 0; this.mBelt = 0; this.src = null; this.flow = 0; this.hab = 0; this.probeT = null;
    this.offBots = 0;   // the most robots ever at work off-world: a world once opened stays open
    this.swPeak = 0;    // the swarm's largest yet (W): its mass is kept for it, so its swings don't take homes back
  }

  /** The ending, by chance on two axes (a9): aligned, misaligned or paused; Earth preserved or sacrificed. */
  drawEnding() {
    const P = this.P, codes = { '1a': [false, false], '1b': [false, true], '2a': [true, false], '2b': [true, true], '3a': [null, false], '3b': [null, true] };
    let aligned, preserve;
    if (P.ENDING && codes[P.ENDING]) [aligned, preserve] = codes[P.ENDING];
    else {
      const u = this.endRng.uniform(), v = this.endRng.uniform();
      aligned = u < P.P_PAUSE ? null : (u - P.P_PAUSE) / (1 - P.P_PAUSE) < P.P_ALIGN; preserve = v < P.P_PRESERVE;
    }
    const paused = aligned === null, code = (paused ? '3' : aligned ? '2' : '1') + (preserve ? 'b' : 'a');
    this.ending = { aligned: !!aligned, paused, preserve, code };
    this.endAt = this.t;
    // Paused: frontier capability held where it stands (log₁₀ effective compute, `capability`).
    if (paused) P.X_CAP = this.econ.x;
    const text = { '1a': 'misaligned, and Earth sacrificed: its heat budget is the machines\' (the oceans boil)', '1b': 'misaligned, and Earth preserved: industry off-world, CO₂ drawn down and sulfate sprayed, but people disempowered, their births falling with it',
      '2a': 'aligned, and Earth sacrificed to reach the stars: people leave as it fails', '2b': 'aligned, and Earth preserved for real: industry off-world, CO₂ drawn down, sulfate meanwhile, farms returned',
      '3a': 'paused: frontier AI held where it is by agreement, and the climate left to the economy', '3b': 'paused: frontier AI held where it is by agreement, and the climate held too: fossil carbon phased out, CO₂ drawn back by people\'s own capture' }[code];
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
      alive: new Uint8Array(nL), p0: new Float64Array(nL), ero: new Float64Array(nL), slope: new Float64Array(nL), sigY: new Float64Array(nL), sigP: new Float64Array(nL), sigT: new Float64Array(nL), sigTy: new Float64Array(nL), sR: new Float64Array(nL), irr: new Float64Array(nL), bF: new Float64Array(nL), bW: new Float64Array(nL), bL: new Float64Array(nL), bS: new Float64Array(nL), herd: new Float64Array(nL), fg: new Float64Array(nL), sumH: new Float64Array(nL), winH: new Float64Array(nL), river: new Uint8Array(nL), arid: new Float64Array(nL),
      hot: new Float64Array(nL), sun: new Float64Array(nL), arable: new Float64Array(nL),
      sfp: new Float64Array(nL), phi: new Float64Array(nL), sod: new Float64Array(nL), phiFP: new Float64Array(nL), path: new Float64Array(nL), afp: new Float64Array(nL), aup: new Float64Array(nL), clim: new Float32Array(4 * nL),
    };
    this.sol = new Float64Array(nL);   // the share of each cell under solar farms (People.placeSolar)
    this.X = { cells: new Int32Array(0), area: new Float64Array(0), sun: new Float64Array(0), sol: new Float64Array(0), mach: new Float64Array(0) };
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
      // Past the cover's heat limit (an annual mean of 38–46 °C) nothing grows, crops included:
      // Miami's NPP saturates with warmth rather than failing, so a 1,200 °C cell rated as farmland.
      const uh = Math.min(1, Math.max(0, (Ta - VEG.T_HOT[0]) / (VEG.T_HOT[1] - VEG.T_HOT[0])));
      H.hot[c] = uh * uh * (3 - 2 * uh);
      // Foraging on land, and the sea's (the coast's export production: `sea`, src/engine/peoplelink.js).
      H.bL[c] = H.alive[c] ? P.B0 * acc / P.NPP_REF * water * (1 - H.hot[c]) : 0;
      const ps = coast && f.sea ? Math.max(0, f.sea[i]) / P.PS_REF : 0;
      H.bS[c] = H.alive[c] ? P.B_SEA * ps / (1 + ps) * (1 - H.hot[c]) : 0;
      H.b[c] = H.bL[c] + H.bS[c];
      // Herders' pastures: summer's the grass's production, winter's what of it stands to be grazed.
      let Pw = 0; { const o = Array.from({ length: 12 }, (_, m) => m).sort((x, y) => f.T12[12 * i + x] - f.T12[12 * i + y]); for (let k = 0; k < 4; k++) Pw += f.P12[12 * i + o[k]]; }
      const graze = H.alive[c] ? fg * f.npp[i] * (1 - H.hot[c]) : 0, snowy = (1 - sig((Tc + P.T_SNOW) / P.W_SNOW)) * sig((Pw - P.P_SNOW) / 20);
      H.sumH[c] = graze; H.winH[c] = graze * (1 - snowy) * sig((fg - P.G_HERD) / 0.1); H.fg[c] = fg;
      // Crops (synthesis): on a river's floodplain watered (the climate's warmth alone limits them)
      // and renewed by its floods; on the uplands rain-fed, on soil the rain leaches.
      const sfp = Math.min(P.FP_MAX, P.W_FP * Math.sqrt(Math.max(0, f.discharge[i])) / Math.sqrt(H.area[c]));
      const leach = (f.runoff ? Math.max(0, f.runoff[i]) : 0.3) * Math.exp((Ta - 15) / P.T_LEACH), ero = f.ero ? Math.max(0, f.ero[i]) : 0;
      const phi = 1 / (1 + leach / (P.L_FERT * (1 + ero / P.E_FERT)));
      // The uplands a plough can work: not frozen, wet enough, not too steep (hillslopes steeper than
      // a plough's, their slopes spread exponentially about ~20× the cell's gradient between cells).
      // Wet enough is a growing season long enough (FAO's length of growing period, standard: months
      // warmer than 5 °C whose rain meets half the ground's potential evaporation, a month's soil
      // water carried into the next), ramping from LGP_DRY months to LGP_WET: a monsoon's few wet
      // months grow a crop that the year's mean aridity would deny.
      let lgp = 0, carry = 0;
      for (let k = 0; k < 24; k++) {
        const m = k % 12, T = f.T12[12 * i + m], pm = f.P12[12 * i + m], pe = P.PET_K * Math.max(0, T + 4);
        const ok = T > 5 && pm + carry >= 0.5 * pe;
        carry = Math.min(P.LGP_SOIL, Math.max(0, carry + pm - pe));
        if (k >= 12 && ok) lgp++;
      }
      const wet = Math.min(1, Math.max(0, (lgp - P.LGP_DRY) / (P.LGP_WET - P.LGP_DRY)));
      const cold = (1 - f.perma[i]) * (f.elev[i] < 3 ? 1 : 0.3), up = P.ARABLE_MAX * cold * wet * (1 - Math.exp(-P.S_ARABLE / Math.max(slope, 1e-6)));
      const ok = H.alive[c] ? 1 - H.hot[c] : 0;
      H.sfp[c] = sfp * cold; H.phi[c] = phi;
      H.phiFP[c] = 1 - (1 - phi) * (1 - P.FP_RENEW);
      H.path[c] = sig((Ta - P.T_PATH) / P.W_PATH) * Math.min(1, Pa / P.P_PATH);
      H.sod[c] = fg * sig(-Tc / 5);   // the cold grasslands' sod (the steppe's, the prairies', the pampas')
      // The crops' warmth by the growing season's degree-days over 5 °C (a grain crop needs ~1,000
      // to ripen, standard; the saturating form and its scale synthesis), their water by Miami's rain.
      let gdd = 0; for (let m = 0; m < 12; m++) gdd += 30.4 * Math.max(0, f.T12[12 * i + m] - 5);
      const warm = 3000 * (1 - Math.exp(-Math.max(0, gdd - P.GDD0) / P.GDD_E)), rain = 3000 * (1 - Math.exp(-0.000664 * Pa));
      // Watered fields crop as often as the season allows: one crop a GDD_CROP (wet rice's two and
      // three a year in the warm deltas, standard; synthesis as a count).
      const crops = Math.max(1, Math.min(P.CROPS_MAX, gdd / P.GDD_CROP));
      H.afp[c] = ok * P.F0 * 0.45e-3 * warm * crops / P.NPP_REF;            // per km² of field
      H.aup[c] = ok * P.F0 * 0.45e-3 * Math.min(warm, rain) / P.NPP_REF;    // per km² of field cropped
      const arable = Math.min(1, H.sfp[c] + (1 - H.sfp[c]) * up);
      H.arable[c] = H.alive[c] ? arable : 0;   // the most of a cell fields can take (none on permafrost: a9)
      H.a[c] = H.sfp[c] * H.afp[c] * H.phiFP[c] + Math.max(0, arable - H.sfp[c]) * phi * H.aup[c];   // the cell's crops, fully farmed (a summary)
      // A crop's climate here: the coldest month, the warmest, log water (the rain, and the river's
      // where it waters the floodplain: the Nile's crops knew no rain), the summer half's share of the rain.
      let Tw = -99; for (let m = 0; m < 12; m++) Tw = Math.max(Tw, f.T12[12 * i + m]);
      const ord = Array.from({ length: 12 }, (_, m) => m).sort((x, y) => f.T12[12 * i + y] - f.T12[12 * i + x]);
      let Ps = 0; for (let k = 0; k < 6; k++) Ps += f.P12[12 * i + ord[k]];
      H.clim[4 * c] = Tc; H.clim[4 * c + 1] = Tw; H.clim[4 * c + 2] = Math.log(Math.max(Pa + H.sfp[c] * P.P_IRR, 10)); H.clim[4 * c + 3] = Pa > 1 ? Ps / Pa : 0.5;
      H.Tc[c] = Tc; H.coast[c] = coast; H.elev[c] = f.elev[i]; H.slope[c] = slope; H.river[c] = river ? 1 : 0;
      H.arid[c] = f.zones[NZ * i + 4] + f.zones[NZ * i + 5];   // BW and BS: where solar farms go first
      H.sun[c] = sunAt(H.lat[c], H.arid[c]);
      let D = 0, zz = 0;
      for (let k = 0; k < 14; k++) { const p = f.zones[NZ * i + k]; D += dw[k] * p; zz += p * p; }
      H.D[c] = D + P.D_OASIS * H.sfp[c] * H.arid[c];
      zz = Math.sqrt(zz) || 1;
      for (let k = 0; k < 14; k++) H.zv[14 * c + k] = f.zones[NZ * i + k] / zz;
      H.mosaic[c] = H.bL[c] * (1 + P.COAST * coast) * 4 * ft * fg * sig((Tc - P.T_COLD0 - 10) / P.W_COLD);
      H.p0[c] = f.p0 ? f.p0[i] : 1e-4; H.ero[c] = f.ero ? f.ero[i] : 0;
      // The harvest's years (`harvestSigma`): a year's log-rain spread and its mean T′'s, the month's
      // log-rain spread (their covariance), and the yield's warmth sensitivity d ln Y/dT (synthesis):
      // the crops' through their degree-days (a uniform shift moves the GDD 30.4 days for each month
      // over 5 °C), on the uplands only where warmth limits them rather than rain; the foragers'
      // through Miami's temperature limb where it limits the NPP.
      H.sigP[c] = f.sigP ? f.sigP[i] : 0; H.sigT[c] = f.sigT ? f.sigT[i] : 0; H.sigTy[c] = f.sigTy ? f.sigTy[i] : 0;
      H.sR[c] = Year.rainSigma(Pa); H.irr[c] = river ? P.IRR : 1;
      let wm = 0; for (let m = 0; m < 12; m++) if (f.T12[12 * i + m] > 5) wm++;
      const dg = 30.4 * wm, dWarm = gdd > P.GDD0 ? 3000 * Math.exp(-(gdd - P.GDD0) / P.GDD_E) / P.GDD_E * dg : 0;
      const bUp = warm > 0 && warm < rain ? dWarm / warm : 0, nc = gdd / P.GDD_CROP;
      const bFp = (warm > 0 ? dWarm / warm : 0) + (nc > 1 && nc < P.CROPS_MAX ? dg / gdd : 0);
      const wFp = H.sfp[c] * H.afp[c] * H.phiFP[c], wUp = Math.max(0, arable - H.sfp[c]) * phi * H.aup[c];
      H.bF[c] = wFp + wUp > 0 ? Math.min(P.B_TMAX, (wFp * bFp + wUp * bUp) / (wFp + wUp)) : 0;
      const nT = 3000 / (1 + Math.exp(1.315 - 0.119 * Ta)), nP = 3000 * (1 - Math.exp(-0.000664 * Pa));
      H.bW[c] = nT < nP ? Math.min(P.B_TMAX, 0.119 * (1 - nT / 3000)) : 0;
      H.sigY[c] = this.harvestSigma(c, 1);
    }
    // Herders move within a season's reach (the cell and its neighbours): the best summer pasture and
    // the best winter one, held by the leaner (softly), on the cell's own grass.
    for (let c = 0; c < nL; c++) {
      const i = cells[c];
      let su = H.sumH[c], wi = H.winH[c];
      for (let o = g.nbrOff[i]; o < g.nbrOff[i + 1]; o++) { const k = this.loc[g.nbr[o]]; if (k >= 0) { su = Math.max(su, H.sumH[k]); wi = Math.max(wi, H.winH[k]); } }
      H.herd[c] = H.alive[c] ? P.D_HERD * softMin(su, wi, 2) / P.NPP_REF * sig((f.fg[i] - P.G_HERD) / 0.1) : 0;
    }
    // Land the people's cells don't hold (the opening's ice sheets gone, the seafloor a boiling sea
    // leaves): no one lives there, but the machines and solar farms may (People.placeSolar, drawn).
    const xs = [];
    for (let i = 0; i < g.n; i++) if (this.loc[i] < 0 && f.elev[i] > 0 && f.ice[i] < P.ICE_MAX) xs.push(i);
    if (xs.length !== this.X.cells.length || xs.some((i, k) => i !== this.X.cells[k])) {
      const old = new Map(Array.from(this.X.cells, (i, k) => [i, k]));
      const X = { cells: Int32Array.from(xs), area: new Float64Array(xs.length), sun: new Float64Array(xs.length), sol: new Float64Array(xs.length), mach: new Float64Array(xs.length) };
      xs.forEach((i, k) => {
        X.area[k] = g.area[i] * R * R;
        const o = old.get(i); if (o !== undefined) { X.sol[k] = this.X.sol[o]; X.mach[k] = this.X.mach[o]; }
      });
      this.X = X;
    }
    for (let k = 0; k < this.X.cells.length; k++) {
      const i = this.X.cells[k], z = g.pos[3 * i + 2];
      this.X.sun[k] = sunAt(Math.asin(z), f.zones[NZ * i + 4] + f.zones[NZ * i + 5]);
    }
  }

  /**
   * The stocks over a step (synthesis): works (built by the urban share's labour, S_WORK of it a
   * year, decaying over T_WORK); large game and the coast's fish, each logistic in its own
   * share with a take h, dM/dt = R M (1 − M) − h M, solved exactly. Game: h = H_MEGA × wariness ×
   * the foragers' density against B0 (at most 3) × their foraging's culture (P_F/CAP_F); gone below
   * M_EXT for good. Fish: H_FISH where people live on a coast (by their crowding), and industry's
   * fleets H_FISH_IND × its share, easing with culture as tillage does.
   */
  stocks(dt, live) {
    const P = this.P, H = this.H, nL = this.nL, Ntot = this.Ntot, z = this.zc;
    const tipped = this.lineages.some(L => L.tipped !== null);
    const logi = (M, R, h) => { const r = R - h; if (!(M > 0)) return 0; if (Math.abs(r) < 1e-12) return M / (1 + R * M * dt); const e = Math.exp(Math.max(-60, Math.min(60, r * dt))); return r * M * e / (r + R * M * (e - 1)); };
    for (let c = 0; c < nL; c++) {
      if (!H.alive[c]) continue;
      const N = Ntot[c];
      if (N > 0 && !this.met[c]) { this.naive[c] = tipped ? 1 : P.NAIVE_CO; this.met[c] = 1; }
      if (this.mega[c] > 0) {
        const zz = z ? z[c] : 0, ez = ex(P.THETA * zz), PF = ez / (1 + (ez - 1) / P.CAP_F);
        const rho = N / H.area[c] * (1 - this.f[c]), h = P.H_MEGA * this.naive[c] * Math.min(3, rho / P.B0) * PF / P.CAP_F;
        const m = logi(this.mega[c], P.R_MEGA, h);
        this.mega[c] = m < P.M_EXT ? 0 : m;
      }
      // Works: built by the urban share's labour, decaying over T_WORK (exact).
      const u = this.uShare ? this.uShare[c] : 0, build = P.S_WORK * u * N, ew = Math.exp(-dt / P.T_WORK);
      if (build > 0 || this.works[c] > 0) this.works[c] = this.works[c] * ew + build * P.T_WORK * (1 - ew);
      if (H.bS[c] > 0) {
        const zz = z ? z[c] : 0, cons = Math.exp(-Math.max(0, zz - P.Z_IND - 1) / P.Z_CONS);
        const h = (N > 0 ? P.H_FISH * Math.min(1, N / Math.max(1e-9, H.area[c] * H.b[c] * P.CAP_F)) : 0) + P.H_FISH_IND * this.ind[c] * cons;
        this.fish[c] = logi(this.fish[c], P.R_FISH, h);
      }
    }
  }

  /** The world's pyramid in five-year groups (0–4 … 95–99, 100 and over): each one's share of everyone on Earth. */
  pyramid() {
    const KC = COHORTS.K, G = Math.ceil(KC / 5), out = new Float32Array(G);
    let s = 0;
    for (let c = 0; c < this.nL; c++) { const N = this.Ntot[c]; if (!(N > 0)) continue; s += N; for (let k = 0; k < KC; k++) out[Math.floor(k / 5)] += N * this.pyr[KC * c + k]; }
    if (s > 0) for (let k = 0; k < G; k++) out[k] /= s;
    return out;
  }

  /**
   * The harvest's year-to-year anomaly at cell c with farmed share fc (synthesis): a = α R + β T̄′, R a
   * year's log-rain anomaly and T̄′ its mean temperature anomaly; α = E_RAIN (× IRR by a river or a
   * lake), β the yield's warmth sensitivity (`rates`); farmers bear it whole, foragers half (they
   * move), less the sea's share of their food. Into `out`: [α, β].
   */
  harvestCoef(c, fc, out = this.hc || (this.hc = [0, 0])) {
    const H = this.H, sea = H.b[c] > 0 ? H.bS[c] / H.b[c] : 0, fo = 0.5 * (1 - fc) * (1 - sea), g = fc + fo;   // the sea's food doesn't follow the land's rain or warmth
    out[0] = this.P.E_RAIN * H.irr[c] * g; out[1] = fc * H.bF[c] + fo * H.bW[c];
    return out;
  }
  /**
   * The closure's relative spread of the harvest: R and T̄′ correlated as the year makes them (over
   * land a warm year is a dry one: cov = ρ s σ_Ty²/σ_T, s the month's log-rain spread, src/engine/year.js).
   */
  harvestSigma(c, fc) {
    const H = this.H, [a, b] = this.harvestCoef(c, fc), sT = H.sigTy[c];
    const cov = H.sigT[c] > 0 ? YEAR.RHO_LAND * H.sR[c] * sT * sT / H.sigT[c] : 0;
    return Math.sqrt(Math.max(0, a * a * H.sigP[c] * H.sigP[c] + b * b * sT * sT + 2 * a * b * cov));
  }
  /**
   * The planet's realized years (src/engine/peoplelink.js, `HarvestYears`), sent a few times a
   * second while the dial resolves the year: on the year's own grid, the years and the sums of a
   * year's log-rain unit z, its square, T̄′, its square and their product, a cell each. Pooled here
   * (prolonged to the people's grid) until the steps take them, each step as many years as it lasts.
   */
  addYears(mom, level) {
    const g = this.planet.grid;
    if (!this.yrT || this.yrT.level !== level) {
      const coarse = buildGrid(level);
      this.yrT = { level, T: level < g.level ? makeTransfer(g, coarse) : null, nc: coarse.n, x: new Float64Array(coarse.n), y: new Float64Array(g.n) };
      this.yr = Array.from({ length: 5 }, () => new Float64Array(this.nL)); this.yrW = 0;
    }
    const { T, nc, x, y } = this.yrT;
    if (mom.length !== 6 * nc || !(mom[0] > 0)) return;
    this.yrW += mom[0];
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < nc; i++) x[i] = mom[6 * i + j + 1];
      if (T) prolong(T, x, y); else y.set(x);
      const a = this.yr[j];
      for (let c = 0; c < this.nL; c++) a[c] += y[this.cells[c]];
    }
  }
  /**
   * A step's share of the realized years at cell c: { phi (the share of the step they cover), m, s
   * (the harvest anomaly's mean and spread over them) }, pooled by trade as the closure is; null
   * when there are none. `take` is the step's years taken from the pool (set by `step`).
   */
  realYears(c, fc, pool, out) {
    const W = this.yrW;
    if (!(W > 1e-9) || !(this.yrTake > 0)) return null;
    const [a, b] = this.harvestCoef(c, fc), s = this.H.sR[c], yr = this.yr;
    const mZ = yr[0][c] / W, mT = yr[2][c] / W;
    const vZ = Math.max(0, yr[1][c] / W - mZ * mZ), vT = Math.max(0, yr[3][c] / W - mT * mT), cZT = yr[4][c] / W - mZ * mT;
    out.phi = this.yrPhi;
    out.m = (a * s * mZ + b * mT) / pool;
    out.s = Math.sqrt(Math.max(0, a * a * s * s * vZ + b * b * vT + 2 * a * b * s * cZT)) / pool;
    return out;
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
    // Long crossings: the groups of landmasses those join reach their nearest others across open
    // sea, to LONG_HOPS cells: each its K_LONG nearest, then in rounds until every group within
    // reach is joined (Borůvka's).
    const par = Int32Array.from({ length: nL }, (_, k) => k);
    const root = k => { while (par[k] !== k) k = par[k] = par[par[k]]; return k; };
    for (let c = 0; c < nL; c++) for (const [d] of lists[c]) { const a = root(c), b = root(d); if (a !== b) par[a] = b; }
    // First, each group's K_LONG nearest other groups across open sea, to LONG_HOPS: more than one
    // way in, so a landmass whose nearest neighbour is an islet nobody settles isn't cut off behind
    // it (a9: a 10 M km² continent never reached by takeoff; its one way in was from an islet).
    {
      const groups = new Map();
      for (let c = 0; c < nL; c++) if (this.H.coast[c]) { const k = root(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
      const mark = new Int32Array(g.n).fill(-1), from = new Int32Array(g.n), dk = new Float64Array(g.n), add = [];
      let tag = 0;
      for (const [k, cs] of groups) {
        tag++;
        let front = [];
        for (const c of cs) { const i = cells[c]; mark[i] = tag; from[i] = c; dk[i] = 0; front.push(i); }
        const near = new Map();
        for (let h = 1; h <= P.LONG_HOPS + 1 && front.length && near.size < P.K_LONG; h++) {
          const next = [];
          for (const u of front) for (let o = g.nbrOff[u]; o < g.nbrOff[u + 1]; o++) {
            const v = g.nbr[o];
            if (mark[v] === tag) continue;
            if (pl.elev[v] > 0) {
              const d = loc[v];
              if (h > 1 && d >= 0) {
                const kd = root(d), L = dk[u] + g.dist[o] * R, b = near.get(kd);
                if (kd !== k && (!b || L < b[2])) near.set(kd, [from[u], d, L, h - 1]);
              }
              continue;
            }
            if (h > P.LONG_HOPS) continue;
            mark[v] = tag; from[v] = from[u]; dk[v] = dk[u] + g.dist[o] * R; next.push(v);
          }
          front = next;
        }
        for (const x of [...near.values()].sort((a, b) => a[2] - b[2]).slice(0, P.K_LONG)) add.push(x);
      }
      const have = new Set();
      for (const [c, d, L, hops] of add) {
        const key = c < d ? `${c}:${d}` : `${d}:${c}`;
        if (have.has(key)) continue;
        have.add(key);
        lists[c].push([d, 1, 1, L, hops]); lists[d].push([c, 1, 1, L, hops]); hopEdges += 2;
      }
      for (const [c, d] of add) { const a = root(c), b = root(d); if (a !== b) par[a] = b; }
    }
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
    // Ocean routes (synthesis): each landmass (by land alone) to every other its sea reaches within
    // OCEAN_HOPS cells, past HOPS, at up to M_ROUTE landings each at least D_ROUTE km from the others
    // and from the crossings already made. The short crossings join Earth's Americas to Asia at
    // Bering, so without these the Atlantic was never crossed: no crop, people or industry reached
    // the Americas but by way of Siberia.
    {
      const lp = Int32Array.from({ length: nL }, (_, k) => k);
      const lr = k => { while (lp[k] !== k) k = lp[k] = lp[lp[k]]; return k; };
      for (let c = 0; c < nL; c++) for (const [d, , , , hops] of lists[c]) if (!hops) { const a = lr(c), b = lr(d); if (a !== b) lp[a] = b; }
      const xyz = c => { const i = cells[c]; return [g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]]; };
      const cosSep = Math.cos(P.D_ROUTE / R);
      // The landings made so far, by landmass pair.
      const landed = new Map();
      const note = (a, d) => { const k = `${lr(a)}:${lr(d)}`; if (!landed.has(k)) landed.set(k, []); landed.get(k).push(xyz(d)); };
      for (let c = 0; c < nL; c++) for (const [d, , , , hops] of lists[c]) if (hops) note(c, d);
      const comps = new Map();
      for (let c = 0; c < nL; c++) if (this.H.coast[c]) { const k = lr(c); if (!comps.has(k)) comps.set(k, []); comps.get(k).push(c); }
      const mark = new Int32Array(g.n).fill(-1), from = new Int32Array(g.n), dk = new Float64Array(g.n);
      let tag = 0;
      for (const [k, cs] of comps) {
        tag++;
        let front = [];
        for (const c of cs) { const i = cells[c]; mark[i] = tag; from[i] = c; dk[i] = 0; front.push(i); }
        const cand = new Map();   // landmass → [[from, to, km, hops]]
        for (let h = 1; h <= P.OCEAN_HOPS + 1 && front.length; h++) {
          const next = [];
          for (const u of front) for (let o = g.nbrOff[u]; o < g.nbrOff[u + 1]; o++) {
            const v = g.nbr[o];
            if (mark[v] === tag) continue;
            if (pl.elev[v] > 0) {
              const d = loc[v];
              if (h > P.HOPS + 1 && d >= 0 && lr(d) !== k) { mark[v] = tag; const kd = lr(d); if (!cand.has(kd)) cand.set(kd, []); cand.get(kd).push([from[u], d, dk[u] + g.dist[o] * R, h - 1]); }
              continue;
            }
            if (h > P.OCEAN_HOPS) continue;
            mark[v] = tag; from[v] = from[u]; dk[v] = dk[u] + g.dist[o] * R; next.push(v);
          }
          front = next;
        }
        for (const [kd, list] of cand) {
          if (kd < k && comps.has(kd)) continue;   // each pair once (from the lower id; both ways when one has no coast here)
          list.sort((a, b) => a[2] - b[2]);
          const have = (landed.get(`${k}:${kd}`) || []).concat(landed.get(`${kd}:${k}`) || []);
          let n = 0;
          for (const [c, d, L, hops] of list) {
            if (n >= P.M_ROUTE) break;
            const p = xyz(d);
            if (have.some(q => p[0] * q[0] + p[1] * q[1] + p[2] * q[2] > cosSep)) continue;
            have.push(p); n++;
            lists[c].push([d, 1, 1, L, hops]); lists[d].push([c, 1, 1, L, hops]); hopEdges += 2;
          }
        }
      }
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

  // The seeded fossil carbon (a9, 2026-11-15): coal in the lowland basins (low and flat), oil on the
  // shelves, each cell's share lognormal about its setting's weight (synthesis). Not by today's
  // forests: coal is the peat of swamps long gone (Earth's richest the Carboniferous's, under
  // today's temperate north), so today's rainforests had held the most of it. Coal within reach of a land
  // cell is the resolvent of the coal over the land at τ 0.85 (a few cells). The economy draws on
  // the whole (one world market once industry spreads); the map says where industry can start.
  fossilMap() {
    const P = this.P, pl = this.planet, g = pl.grid, { nL, cells, E } = this, r = stream(pl.seed, 'people:fossil');
    const coal = this.coal = new Float64Array(nL);
    let cs = 0;
    for (let c = 0; c < nL; c++) {
      const i = cells[c], e = pl.elev[i];
      if (e < 0.6) coal[c] = (0.6 - e) * Math.exp(-this.H.slope[c] / 0.005) * Math.exp(1.2 * r.normal());
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
  /** Years since two lineages' lines parted: when the later of them left their last common ancestor. */
  divergence(A, B) {
    const left = new Map();
    for (let L = A, t = this.t; L; t = L.born, L = L.parent >= 0 ? this.lineages[L.parent] : null) left.set(L.id, t);
    for (let L = B, t = this.t; L; t = L.born, L = L.parent >= 0 ? this.lineages[L.parent] : null) if (left.has(L.id)) return this.t - Math.min(left.get(L.id), t);
    return this.t;
  }

  newLineage(parent, born, g) {
    const nL = this.nL, id = this.nextId++;
    const L = { id, parent: parent ? parent.id : -1, born, died: null, g, anc: new Map([[id, 1]]),
      N: new Float64Array(nL), Z: new Float64Array(nL), M: new Float64Array(nL), K: new Float64Array(nL),
      total: 0, zbar: 0, zmax: 0, peak: 0, multiSince: null, tipped: null, lat: 0, lon: 0 };
    this.lineages.push(L);
    return L;
  }
  // The first hominins: the heart of the broadest tree–grass mosaic (the mosaic summed within
  // R_ORIGIN) on the landmass that can hold the most of them. A radiation of apes lives across an
  // ecotone on a continent, not in one cell or on an islet: the best single cell is a near tie among
  // tropical coasts the world over (on today's Earth within 2% from Southeast Asia to West Africa).
  seed() {
    const H = this.H, nL = this.nL, body = this.components(() => true, 0);
    const room = new Float64Array(body.count);
    for (let c = 0; c < nL; c++) room[body.id[c]] += H.area[c] * H.b[c] * this.coldOK(c, 0);
    let home = 0; for (let k = 1; k < body.count; k++) if (room[k] > room[home]) home = k;
    const cand = [];
    for (let c = 0; c < nL; c++) if (body.id[c] === home && H.mosaic[c] > 0) cand.push(c);
    const xyz = cand.map(c => [Math.cos(H.lat[c]) * Math.cos(H.lon[c]), Math.cos(H.lat[c]) * Math.sin(H.lon[c]), Math.sin(H.lat[c])]);
    const cosR = Math.cos(this.P.R_ORIGIN / R);
    let best = -1, bestS = -1;
    for (let a = 0; a < cand.length; a++) {
      const [x, y, z] = xyz[a];
      let sum = 0;
      for (let b = 0; b < cand.length; b++) { const q = xyz[b]; if (x * q[0] + y * q[1] + z * q[2] > cosR) sum += H.area[cand[b]] * H.mosaic[cand[b]]; }
      if (sum > bestS) { bestS = sum; best = cand[a]; }
    }
    if (best < 0) for (let c = 0; c < nL; c++) if (body.id[c] === home && (best < 0 || H.b[c] > H.b[best])) best = c;
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
  soilYield(c) { const P = this.P; return P.Y_STONY + (1 - P.Y_STONY) * (1 - Math.exp(-this.fieldSoil(c) / P.H_YIELD)); }
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
    this.lift = lift;
    for (let c = 0; c < nL; c++) {
      if (!H.alive[c]) { K[c] = 0; continue; }
      const z = Zs ? Zs[c] : zConst, ez = ex(P.THETA * z);
      const PF = ez / (1 + (ez - 1) / P.CAP_F);
      let farm = 0;
      // Migrants who farm (their best culture past farming's) see unfarmed land as the fields
      // they'd make of it: MIGR_F of its arable land, with crops suited MIGR_S (the spread's
      // weights only: a farming people's spread is demic, Ammerman and Cavalli-Sforza's wave of
      // advance, from memory; with the cell's own fields alone, a continent of foragers had looked
      // full to them, and farmers never came).
      const fc = !Zs && f[c] <= 0 && zConst >= P.Z_FARM ? P.MIGR_F * H.arable[c] : f[c];
      if (fc > 0) {
        // The organic ceiling, and industry's above it (fertilizer, machines, breeding: a few times
        // the organic yields, modern grain's against pre-industrial, from memory), each approached softly.
        const x = ex(P.THETA * (z - P.Z_FARM)), cap = x / (1 + (x - 1) / P.CAP_A), capI = softMin(x, P.CAP_A * P.LIFT_MAX, 1);
        const PA = cap + ind[c] * lift * Math.max(0, capI - cap);
        // Less the seed kept for the next sowing (working capital's first claim).
        const seed = 1 / (P.R_SEED0 * Math.exp(Math.min(Math.max(0, z - P.Z_FARM) / P.Z_R, 50)));
        farm = fc === f[c] ? this.fieldYield(c) * this.suitHere(c) * PA * fert * (1 - seed) : this.fieldYield(c, fc) * P.MIGR_S * PA * fert * (1 - seed);
      }
      // The land's, as habitable as Earth still is; and what energy buys indoors, until the oceans boil.
      // The tropics' diseases among settled farmers (malaria spread with clearing and standing water;
      // Livingstone 1958 on West Africa's yams, from memory), as far as medicine hasn't put them down.
      const yg = this.Ntot[c] > 0 ? this.goods[c] / this.Ntot[c] : 0, sick = 1 + P.PATH * H.path[c] * Math.exp(-Math.max(0, yg) / P.Y_D);
      // Foraging on land with its game, or herding where the herds yield more; the sea's, the fish's share left.
      const forage = H.bL[c] * (1 + P.MEAT * this.mega[c]) / (1 + P.MEAT * P.MG_REF) * PF * eg;
      let herd = 0;
      if (H.herd[c] > 0 && this.packages.length) {   // retired with the fields where a preserving ending rewilds the land
        const zh = z - P.Z_HERD, xh = ex(P.THETA * Math.max(0, zh));
        herd = sig(zh / P.W_HERD) * H.herd[c] * xh / (1 + (xh - 1) / P.CAP_H) * (1 - this.rewild);
      }
      // Works' labour (S_WORK of the urban share) feeds no one.
      const wk = this.uShare && !this.econ.on ? 1 - P.S_WORK * this.uShare[c] : 1;
      K[c] = this.hE * H.area[c] * this.coldOK(c, z) * wk * ((1 - fc) * Math.max(forage, herd) + H.bS[c] * this.fish[c] * PF * eg + farm / sick) + this.Ksyn[c] * (1 - this.boiled);
      // Herders' hold on the unfarmed land, as a share of the cell they'd graze at the food capacity
      // (drawn: the pasture, by how near the capacity the people are).
      if (Zs) { this.herdS[c] = herd > 0 ? (1 - fc) * sig(Math.log(herd / Math.max(forage, 1e-12)) / 0.3) * this.hE * this.coldOK(c, z) * wk : 0; this.Kown[c] = K[c]; }
    }
  }
  /**
   * The fields' yield per km² of the cell at NPP_REF's crops (synthesis): the fields take the
   * floodplain first (watered and renewed: cropped every year), then the uplands, where the leached
   * soil lies fallow but for its fertility's share, industry's fertilizer making up the rest.
   */
  fertility(c, p = this.H.phi[c]) { const x = this.ind ? this.ind[c] * (this.lift || 0) : 0; return p + (1 - p) * x; }
  fieldYield(c, f = this.f[c]) {
    const H = this.H, s = H.sfp[c];
    // The floodplain's soil is its alluvium; the uplands' the regolith (soilYield).
    return Math.min(f, s) * H.afp[c] * this.fertility(c, H.phiFP[c]) + Math.max(0, f - s) * H.aup[c] * this.fertility(c) * this.soilYield(c);
  }
  /** The share of the cell under crops this year (the rest of the farmed share fallow). */
  cropped(c) { const f = this.f[c], s = this.H.sfp[c]; return Math.min(f, s) * this.fertility(c, this.H.phiFP[c]) + Math.max(0, f - s) * this.fertility(c); }
  /**
   * A package's suitability here: its crops' climate (its origin's) against the cell's, a Gaussian
   * in the coldest month, the warmest, log rain and the summer's share of rain (CLIM_S), the
   * envelope widened by industry's breeding and inputs (maize's and wheat's ranges now, from memory).
   */
  suit(q, c) {
    if (q < 0) return 0;
    const o = this.packages[q].clim, x = this.H.clim, S = this.P.CLIM_S, w = 1 + this.P.BREED * (this.ind ? this.ind[c] : 0);
    let d2 = 0;
    for (let k = 0; k < 4; k++) { const d = (x[4 * c + k] - o[k]) / S[k]; d2 += d * d; }
    return Math.exp(-0.5 * d2 / (w * w));
  }
  /**
   * The suitability of the crops farmed here, as farmers have bred them to the place since they took
   * them up: s^{a}, a falling e-fold per T_ADAPT to at least A_ADAPT (wheat and barley bred to the
   * north's summers within a few thousand years, maize to the eastern woodlands' in a few more;
   * frost still bounds a tropical crop: from memory, synthesis as a form).
   */
  suitHere(c) {
    const q = this.pkg[c];
    if (q < 0) return 0;
    const s = this.suit(q, c), P = this.P;
    return s > 0 ? Math.pow(s, Math.max(P.A_ADAPT, Math.exp(-Math.max(0, this.t - this.pkgT[c]) / P.T_ADAPT))) : 0;
  }
  reachL(gz) { const P = this.P; return softMin(P.L_C0 * Math.exp(Math.min(Math.max(0, gz) / P.Z_L, 300)), P.L_CMAX, 4); }
  speed(z) { const P = this.P; return P.V0 * Math.exp(Math.min(z, 60) / P.Z_V); }
  Dz(z) { const P = this.P; return softMin(P.D0 * Math.exp(Math.min(P.D_Z * z, 300)), P.D_MAX, 4) + P.D_IND * sig((z - P.Z_IND) / 0.5); }
  seaReach(z) { const P = this.P; return z >= P.Z_BOAT ? P.L_SEA0 + P.L_SEA * (1 - Math.exp(-Math.max(0, z) / P.Z_SEA)) + P.L_OCEAN * sig((z - P.Z_OCEAN) / P.W_OCEAN) : 0; }

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
    const bf = this.ending && !this.ending.aligned && !this.ending.paused ? 1 - this.dis : 1;   // misaligned: births fall with humans' control (no floor)
    const nl = live.length;
    // The planet's realized years: this step takes as many as it lasts (the rest wait for the next).
    this.yrTake = this.yrW > 1e-9 ? Math.min(this.yrW, dt) : 0; this.yrPhi = this.yrTake / dt;
    const ry = this.ry || (this.ry = { phi: 0, m: 0, s: 0 });
    // The cohorts' clock: this step moves every pyramid on by `shift` whole years.
    const [shift, clk] = ageClock(this.ageClk || 0, dt); this.ageClk = clk;
    // A step past most of a lifetime leaves nothing of the pyramids but their rates' stable
    // populations, which the first shorter step sets from its own (the long steps come before
    // industry, where neither aging nor the workers' share is read).
    const pyT = this.pyT = stepTables(dt, shift, this.pyT), longStep = dt >= COHORTS.T_STABLE;
    if (longStep) this.pyrStale = true;
    for (let c = 0; c < nL; c++) {
      const Nt = Ntot[c];
      if (!(Nt > 1e-6)) { for (let k = 0; k < nl; k++) live[k].N[c] = 0; continue; }
      let inv = 0, one = -1, many = 0;
      for (let k = 0; k < nl; k++) { const L = live[k]; if (L.N[c] > 0) { inv += L.N[c] / Nt / Math.max(L.K[c], 1e-12); one = k; many++; } }
      const Kh = 1 / inv;
      // The harvests' spread here: rain-fed farmers bear it whole, foragers half (they move), trade
      // pools it once industry comes; granaries hold up to a share of a year.
      const z = this.zc ? this.zc[c] : 0, fc = this.f[c], tr = sig((z - P.Z_TRADE) / P.W_TRADE), ell = this.reachL(this.gMax + z);
      const pool = Math.sqrt(1 + tr * (ell / P.L_CORR) ** 2), sg = this.harvestSigma(c, fc) / pool;
      const st = P.S_MAX * fc * (1 - Math.exp(-Math.max(0, z - P.Z_FARM) / P.Z_STORE));
      const { N: Nn, crowd, famine, b: bc, d: dc, m: mc } = demography(Nt, Kh, this.goods[c] / Nt, dt, P, sg, st, bf, this.realYears(c, fc, pool, ry), this.aging[c]);
      this.famine += famine * Nt;
      // The pyramid over the step: births, the deaths past senescence (the total's, less the pyramid's
      // own senescence under medicine), the step's growth.
      if (this.pyrStale && !longStep) { stableLookup(bc, Nn > 0 ? Math.log(Nn / Nt) / dt : 0, this.pyr, COHORTS.K * c); this.pyrSum[c] = 1; }
      else if (!longStep) this.pyrSum[c] = stepPyramid(this.pyr, COHORTS.K * c, bc, dc - mc * this.sen[c], mc, Nn > 0 ? Math.log(Nn / Nt) / dt : 0, pyT, this.pyrTmp);
      // One lineage here (the common case) takes the whole; several share by their crowding.
      if (many === 1) { live[one].N[c] = Nn > 1e-6 ? Nn : 0; continue; }
      const Nbar = 0.5 * (Nt + Nn);
      let mx = -Infinity;
      for (let k = 0; k < nl; k++) { const L = live[k]; lw[k] = L.N[c] > 0 ? Math.log(L.N[c]) - crowd * Nbar * dt / Math.max(L.K[c], 1e-12) : -Infinity; if (lw[k] > mx) mx = lw[k]; }
      let sw = 0;
      for (let k = 0; k < nl; k++) { lw[k] = lw[k] === -Infinity ? 0 : Math.exp(lw[k] - mx); sw += lw[k]; }
      for (let k = 0; k < nl; k++) { const v = Nn * lw[k] / sw; live[k].N[c] = v > 1e-6 ? v : 0; }
    }
    if (this.yrTake > 0) { const k = 1 - this.yrTake / this.yrW; for (const a of this.yr) for (let c = 0; c < nL; c++) a[c] *= k; this.yrW -= this.yrTake; if (this.yrW < 1e-9) this.yrW = 0; }
    lap('growth');
    if (this.debug) this.check('growth', live);
    // Spread: Fisher–KPP, culture carried with the migrants (upwind).
    const Ng = this.Ng; Ng.fill(0);
    for (const L of live) for (let c = 0; c < nL; c++) Ng[c] += L.N[c];
    for (const L of live) { this.diffuse(L, dt); this.voyages(L, dt); }
    if (this.debug) this.check('spread', live);
    lap('spread');
    Ntot.fill(0);
    for (const L of live) for (let c = 0; c < nL; c++) Ntot[c] += L.N[c];
    // The pyramids: migrants by their schedule, then each cell's aging and workers' share.
    const KC = COHORTS.K, ps = this.pyrSum, po = this.pyrOut;
    if (!longStep) this.pyrStale = false;
    for (let c = 0; c < nL && !longStep; c++) {
      if (!(Ntot[c] > 0) && !(Ng[c] > 0)) continue;
      settle(this.pyr, KC * c, ps[c], Ng[c], Ntot[c] - Ng[c], po); ps[c] = 1;
      this.sen[c] = po.sen;
      this.aging[c] = Math.max(0, po.sen - this.senRef);   // aging lifts the crude rate (× medicine); a young frontier's few old are already in D_LO
      this.lfp[c] = P.LFP * po.work / COHORTS.W_REF;
    }
    this.stocks(dt, live);
    // Food, the industrial economy, goods; emissions and forcing.
    this.economy(live, dt);
    if (this.debug) this.check('economy', live);
    lap('economy');
    // Minds within reach, and culture; research's intensity by the cell's output a person, the
    // same for every lineage.
    const sR = this.sR || (this.sR = new Float64Array(nL));
    for (let c = 0; c < nL; c++) sR[c] = Ntot[c] > 0 ? softMin(Math.pow(Math.max(this.Out[c] / Ntot[c], 1e-3), P.RHO_R), P.S_R_MAX, 4) : 0;
    // Cities' minds: where farming has made cities, each cell's by the size of the city its urban
    // share lives in, normalized so the world's are kept (`places`, every DT_PLACES years).
    if (this.packages.length) {
      if (this.tPlaces == null || this.t - this.tPlaces >= P.DT_PLACES) this.places();
      const u = this.uShare, S = this.cityOf, e = P.BETA_CITY - 1;
      let wN = 0, nN = 0;
      for (let c = 0; c < nL; c++) {
        if (!(Ntot[c] > 0)) continue;
        const w = (1 - u[c]) + u[c] * Math.pow(Math.max(S[c], 1) / P.S_CITY_REF, e);
        this.uw[c] = w; wN += w * sR[c] * Ntot[c]; nN += sR[c] * Ntot[c];
      }
      const k = wN > 0 ? nN / wN : 1;
      for (let c = 0; c < nL; c++) if (Ntot[c] > 0) sR[c] *= this.uw[c] * k;
    }
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
    const need = dt * worst / 0.4, nsub = Math.max(1, Math.min(this.econ.on ? this.P.NSUB_IND : this.P.NSUB_MAX, Math.ceil(need))), h = dt / nsub;
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
    // Only what the step can reach moves: people cross one edge a substep, by land (across the sea
    // only between coasts both settled), so after s substeps they lie within s rings of where they
    // were. The edges with an end within nsub − 1 rings are all that carry anyone, in their order
    // (the same sums as over every edge); their cells are within nsub rings.
    const { cells: act, nc: na, edges: ae, ne } = this.reach(N, nsub);
    for (let q = 0; q < na; q++) { const c = act[q]; kd[c] = L.K2[c] / H.area[c]; }
    for (let s = 0; s < nsub; s++) {
      for (let q = 0; q < na; q++) { const c = act[q]; dN[c] = 0; dZ[c] = 0; }
      // Each cell's dispersal at its own culture; an edge's is the geometric mean of its ends' (the
      // law at the ends' mean culture wherever it is exponential in z, below its cap: a root a
      // edge in place of the law's exponential and powers).
      for (let q = 0; q < na; q++) { const c = act[q]; u[c] = L.K2[c] > 1e-12 ? N[c] / L.K2[c] : 0; Dc[c] = N[c] > 0 ? this.Dz(Z[c]) : D0; }
      for (let x = 0; x < ne; x++) {
        const e = ae[x], c = F.a[e], d = F.b[e], uc = u[c], ud = u[d];
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
      for (let q = 0; q < na; q++) {
        const c = act[q];
        if (dN[c] === 0) continue;
        let Nn = N[c] + dN[c];
        const zz = N[c] * Z[c] + dZ[c];
        if (Nn > 1e-6) Z[c] = Math.max(0, zz / Nn); else Nn = 0;
        N[c] = Nn;
      }
    }
  }

  /**
   * The cells within `rings` land edges of where N > 0 (ascending), and the flat edges (F) with an
   * end within rings − 1 (ascending): what a spread of `rings` substeps can touch.
   */
  reach(N, rings) {
    const nL = this.nL, E = this.E, F = this.F;
    const ring = this.ringOf || (this.ringOf = new Int8Array(nL));
    const cells = this.actCells || (this.actCells = new Int32Array(nL)), edges = this.actEdges || (this.actEdges = new Int32Array(F.m));
    ring.fill(-1);
    let nc = 0;
    for (let c = 0; c < nL; c++) if (N[c] > 0) { ring[c] = 0; cells[nc++] = c; }
    for (let r = 1, from = 0; r <= rings; r++) {
      const to = nc;
      for (let q = from; q < to; q++) {
        const c = cells[q];
        for (let o = E.off[c]; o < E.off[c + 1]; o++) { const d = E.nb[o]; if (!E.hop[o] && ring[d] < 0) { ring[d] = r; cells[nc++] = d; } }
      }
      from = to;
    }
    cells.subarray(0, nc).sort();
    let ne = 0;
    const inner = rings - 1;
    for (let e = 0; e < F.m; e++) { const ra = ring[F.a[e]], rb = ring[F.b[e]]; if ((ra >= 0 && ra <= inner) || (rb >= 0 && rb <= inner)) edges[ne++] = e; }
    return { cells, nc, edges, ne };
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
  /**
   * The land solar farms may cover (a9: "turning land into energy, so directly competing with
   * farms"): SOL_ROOM of each living cell people have reached (a preserving AI gives it back with
   * the fields, `rewild`), and the land the people's cells don't hold; the power it could give at
   * D_SOL W/m² by each cell's sun (W), surface solar's ceiling in the economy.
   */
  solarRoom() {
    const P = this.P, H = this.H, nL = this.nL, X = this.X, keep = P.SOL_ROOM * (1 - this.rewild);
    const room = this.solRoom || (this.solRoom = new Float64Array(nL));
    let cap = 0;
    for (let c = 0; c < nL; c++) { room[c] = H.alive[c] && this.reached[c] ? keep : 0; cap += room[c] * H.area[c] * 1e6 * P.D_SOL * H.sun[c]; }
    for (let k = 0; k < X.cells.length; k++) cap += keep * X.area[k] * 1e6 * P.D_SOL * X.sun[k];
    this.solKeep = keep;
    // A boiled sea's steam dims the ground (the panels that no longer pay come down: placeSolar
    // sizes the land by the clear sky's yield).
    return cap * Math.exp(-P.P_STEAM * this.boiled / P.P_DIM);
  }

  /**
   * Solar farms for the power Er, at the clear sky's yield (under a steam sky the panels that
   * would give nothing come down): the sunniest land first and open land before fields (a field is
   * worth more standing: SOL_FARM), each cell to its room, a common reach found by bisection; the
   * fields give way where the panels stand.
   */
  placeSolar(Er) {
    const P = this.P, H = this.H, nL = this.nL, X = this.X, room = this.solRoom, keep = this.solKeep, sol = this.sol, f = this.f;
    const W1 = P.D_SOL * 1e6;
    const fill = (lam, write) => {
      let W = 0;
      for (let c = 0; c < nL; c++) {
        const v = room[c] > 0 ? Math.min(room[c], lam * H.sun[c] ** 2 * (1 - (1 - P.SOL_FARM) * f[c])) : 0;
        if (write) sol[c] = v;
        W += v * H.area[c] * W1 * H.sun[c];
      }
      for (let k = 0; k < X.cells.length; k++) { const v = Math.min(keep, lam * X.sun[k] ** 2); if (write) X.sol[k] = v; W += v * X.area[k] * W1 * X.sun[k]; }
      return W;
    };
    if (!(Er > 0) || !room) { sol.fill(0); X.sol.fill(0); return; }
    let lo = 0, hi = 1;
    while (fill(hi, false) < Er && hi < 1e9) { lo = hi; hi *= 4; }
    for (let k = 0; k < 30; k++) { const m = 0.5 * (lo + hi); if (fill(m, false) < Er) lo = m; else hi = m; }
    fill(hi, true);
    for (let c = 0; c < nL; c++) if (f[c] > 1 - sol[c]) f[c] = 1 - sol[c];
  }

  /** Solar farms' share of the living land. */
  solarShare() {
    const H = this.H, X = this.X;
    let a = 0, A = 0;
    for (let c = 0; c < this.nL; c++) if (H.alive[c]) { a += this.sol[c] * H.area[c]; A += H.area[c]; }
    for (let k = 0; k < X.cells.length; k++) { a += X.sol[k] * X.area[k]; A += X.area[k]; }
    return A > 0 ? a / A : 0;
  }

  economy(live, dt) {
    const P = this.P, nL = this.nL, Out = this.Out, Ntot = this.Ntot, ind = this.ind, zc = this.zcell();
    Out.fill(0);
    let food = 0, people = 0;
    for (const L of live) for (let c = 0; c < nL; c++) {
      if (!(L.N[c] > 0)) continue;
      const o = L.K[c] * L.N[c] / Math.max(Ntot[c], 1e-12);
      Out[c] += o; food += o; people += L.N[c];
    }
    const E = this.econ, end0 = this.ending, pause = end0 && end0.paused ? end0 : null, end = pause ? null : end0, sA = E.on ? E.sA : 0;
    this.goods.fill(0);
    if (E.on) {
      let Lh = 0, zs = 0;
      for (let c = 0; c < nL; c++) { const w = this.lfp[c] * Ntot[c] * ind[c]; Lh += w; zs += w * zc[c]; }
      const z = Lh > 0 ? zs / Lh : E.z;
      // Food bought with energy, once the technology has come: for the people the land can't feed,
      // and room past it while it's cheap. A misaligned AI that sacrifices Earth keeps it, and the goods, from
      // people as it takes control.
      const hs = end && !end.aligned && !end.preserve ? 1 - this.dis : 1, syn = sig((z - P.Z_SYN) / P.W_SYN);
      const wantC = this.wantC || (this.wantC = new Float64Array(nL)), Ks = this.Ksyn, open = 1 - this.boiled;
      const yp = this.people > 0 ? E.Y / this.people : 0, cost = P.W_FOOD * (E.lamE || 0);   // sy/yr of output a person's room costs
      const aR = cost > 0 && yp > 0 ? sig(Math.log(P.F_ROOM * yp / cost) / P.W_INV) : 0;
      let want = 0, eat = 0;
      for (let c = 0; c < nL; c++) {
        let Km = 0;
        for (const L of live) if (L.K[c] > Km) Km = L.K[c];
        const land = Math.max(0, Km - Ks[c] * open), unfed = (1 + P.H_NEED) * Math.max(0, Ntot[c] - land), room = Math.max(0, (1 + P.H_FOOD) * Ntot[c] - land);
        wantC[c] = syn * hs * ind[c] * (unfed + aR * Math.max(0, room - unfed));
        want += wantC[c]; eat += syn * hs * ind[c] * Math.max(0, Ntot[c] - land);
      }
      const Efood = P.W_FOOD * want + P.W_HAB * this.space;
      // Preserved: CO₂ drawn back toward CO2_0 as AI comes to run things.
      // Paused and kept (3b): people's own capture, ramping in as fossil carbon is phased out.
      const since = pause ? this.t - this.endAt : 0, phase = pause && pause.preserve ? 1 - Math.exp(-since / P.T_PHASE) : 0;
      const cdr = end && end.preserve ? sA * Math.max(0, (this.co2 - P.CO2_0) * 2.12) / P.T_CDR : phase * Math.max(0, (this.co2 - P.CO2_0) * 2.12) / P.T_CDR_P, Ecdr = cdr * P.J_CDR / YEAR_S;
      industrialStep(E, { Lh, z, Efood, Ecdr, ending: end, sA, capR: this.solarRoom(), capS: this.swarmRoom(), keepF: 1 - phase, heatB: pause && pause.preserve ? P.HEAT_MAX * (1 - phase) + P.HEAT_HELD * phase : null }, dt, P);
      this.placeSolar(E.Er);
      this.offBots = Math.max(this.offBots, E.ApS || 0); this.swPeak = Math.max(this.swPeak, E.cs || 0);
      const gF = Efood > 0 ? E.EfoodGot / Efood : 1;
      this.EfoodE = P.W_FOOD * eat * gF;   // the power Earth's people eat by (their food factories: drawn)
      for (let c = 0; c < nL; c++) Ks[c] = gF * wantC[c];
      this.space *= gF + (1 - gF) * Math.exp(-dt);   // off-world, short of power, fewer live
      const removed = Ecdr > 0 ? cdr * (E.EcdrGot / Ecdr) * dt : 0;
      if (Lh > 0) for (let c = 0; c < nL; c++) { const g = hs * E.Y * this.lfp[c] * Ntot[c] * ind[c] / Lh; this.goods[c] = g; Out[c] += g; }
      this.env.emit(E.burned - removed, dt);
      this.emitted += E.burned; this.removed += removed;
      // AI's share of the work it could do (at full power), handed over T_SA years; misaligned,
      // humans' control follows it down. (From the work AI did with the power it got, a preserving
      // AI's fossil cut took the power, AI's share fell and the fossil came back, step to step.)
      const sT = E.A0 > 0 ? E.A0 / (E.A0 + Lh) : 0;
      E.sA += (sT - E.sA) * (1 - Math.exp(-dt / P.T_SA));
      if (end && !end.aligned) this.dis += (E.sA - this.dis) * (1 - Math.exp(-dt / P.T_DIS));   // (paused: `end` is null here)
      // Forcing: waste heat and coal's sulfate; preserved, sulfate sprayed to hold it at none, and
      // the swarm kept out of Earth's light; sacrificed, the swarm shades Earth by its share of the
      // Sun (a swarm inside Earth's orbit intercepts that share of every line from the Sun; speculation).
      const Fc = 5.35 * Math.log(Math.max(this.co2, 1) / P.CO2_0);
      const shade = end && !end.preserve ? -P.S_ABS * Math.min(1, (E.Es || 0) / P.L_SUN) : 0;
      const geo = end && end.preserve ? -sA * Math.max(0, Fc + E.heat + E.aer) : 0;
      this.forcing.heat = E.heat; this.forcing.aer = E.aer + geo; this.forcing.geo = geo; this.forcing.shade = shade;
      this.rewild = end && end.preserve ? sA * syn : 0;
      // Aligned: people off-world. Their room (`offRoom`) is what off-world power keeps and the worlds
      // and habitats opened so far. Where it is slack, heritable fertility raises their growth past
      // replacement (Fisher: dr̄/dt = V_A, eroding toward a frontier's R_FRONT), r̄ = R − (R − r̄)
      // e^{−V s dt/R} with s the slack, and they fill it as a logistic, stepped exactly. They move
      // between Earth and space as it opens, by choice either way, and leave as Earth fails them:
      // out at a a person a year, as far as there's room off-world; back at b, as far as Earth has
      // room (the people it had when the ending was drawn, × its habitability), so a whole Earth
      // keeps its numbers and the frontier is off-world. (Two states relaxing to a/(a + b) of
      // everyone sent half of a trillion off-world people back to Earth.) Earth's people grow too,
      // where they live, toward an ecumenopolis (`earthRoom`); the trait rises where there's room
      // anywhere. (Earth held at the numbers it had when the ending was drawn stood at ~10 B while
      // Mars held 6 × 10¹¹.)
      if (end && end.aligned) {
        const open = sig((z - P.Z_SPACE) / P.W_SPACE), room = this.offRoom(E, open), RE = this.earthRoom(open);
        const all = people + this.space, rooms = room + RE;
        this.fert = fertility(this.fert, rooms > 0 ? open * Math.max(0, 1 - all / rooms) : 0, dt, P);
        const e = Math.exp(Math.min(50, this.fert * dt));
        if (this.space > 0 && room > 0 && this.fert > 0) this.space = room * this.space * e / (room + this.space * (e - 1));
        if (people > 0 && RE > people && this.fert > 0) {
          const g = RE * e / (RE + people * (e - 1));
          for (const L of live) for (let c = 0; c < nL; c++) if (L.N[c] > 0) L.N[c] *= g;
          people *= g;
        }
        const moved = migration(people, this.space, room, RE, open, this.hE, dt, P);
        if (people > 0 && moved !== 0) {
          const g = Math.max(0, 1 - moved / people);
          for (const L of live) for (let c = 0; c < nL; c++) if (L.N[c] > 0) L.N[c] *= g;
          this.space += people * (1 - g); people *= g;
        }
      }
      this.massBooks(E, dt);
    }
    // The runaway greenhouse and the oceans; Earth's habitability (on the cached planet its climate's
    // warming, F/B; live, the planet's own warming since the people began).
    const Fc = 5.35 * Math.log(Math.max(this.co2, 1) / P.CO2_0), Fh = this.forcing.heat + this.forcing.aer + this.forcing.shade, Ft = Fc + Fh;
    this.Ft = Ft;
    // Live, the sea's boiled share and the warming are the planet's (src/engine/runaway.js); on the cached planet, the people's own count.
    if (this.env.live) this.boiled = this.env.boiled || 0;
    else if (Ft > P.F_RUN) this.boiled = Math.min(1, this.boiled + (Ft - P.F_RUN) * AREA_M2 * YEAR_S * dt / P.E_BOIL);
    const dT = this.env.live ? Math.max(0, this.env.dT || 0) : Math.max(0, Ft) / P.B_EBM;
    this.hE = (1 - this.boiled) / (1 + Math.pow(dT / P.T_HAB, 4));
    this.O = food + (E.on ? E.Y : 0); this.food = food; this.people = people;
  }

  /**
   * The worlds' room for people (WORLDS): each world's surface at D_SURF (or its built room) as it
   * opens, a logistic in log₁₀ of the most robots yet at work off-world (`opens`, over Z_SETTLE;
   * a world settled stays open while the fleet swings), and the habitats about the Sun's (`hab`) by
   * the same, from HAB_OPENS.
   */
  worldRooms(ApS = this.offBots) {
    const P = this.P, lg = Math.log10(Math.max(ApS, 1)), at = o => sig((lg - o) / P.Z_SETTLE);
    const rooms = this.worlds.map(w => (w.room ?? w.area * P.D_SURF) * at(w.opens));
    return { rooms, surf: rooms.reduce((a, b) => a + b, 0), hab: at(P.HAB_OPENS) };
  }

  /**
   * The room off-world (people): what off-world power keeps (W_HAB a person), softly against the
   * worlds' surfaces opened and the habitats built from the belt (each with the collector its power
   * needs, μ W_HAB). Mercury is the swarm's; the belt is the habitats' but for what the swarm needs
   * past Mercury (its largest yet, so its swings take no homes back). (With people first, an aligned
   * ending's habitats took all of Mercury back from the swarm, and AI's minds fell 10⁴-fold; with the
   * swarm's mass as it stood, its investment cycles killed a tenth of the people off-world each time.)
   */
  offRoom(E, open = 1) {
    const P = this.P, mu = P.SIGMA_SW / P.S_AU, w = this.worldRooms();
    const hab = w.hab * Math.max(0, P.M_BELT - Math.max(0, mu * Math.max(this.swPeak, E.cs || 0) - P.M_MERC)) / (P.M_HAB + mu * P.W_HAB);
    return (this.room = open * softMin((E.Es || 0) / P.W_HAB, w.surf + hab, 4));
  }

  /** Earth's room for people, aligned and past scarcity: an ecumenopolis of D_ECU a km² of its living land × its habitability, as abundance comes (`open`). */
  earthRoom(open = 1) {
    const H = this.H;
    let A = 0;
    for (let c = 0; c < this.nL; c++) if (H.alive[c]) A += H.area[c];
    return (this.roomE = open * this.hE * this.P.D_ECU * A);
  }

  /** Space solar's ceiling (W): the Sun's output, softly against what Mercury builds (~120% of it) and the belt the habitats leave. */
  swarmRoom() {
    const P = this.P, mu = P.SIGMA_SW / P.S_AU;
    return softMin(P.L_SUN, (P.M_MERC + Math.max(0, P.M_BELT - (P.M_HAB + mu * P.W_HAB) * this.hab)) / mu, 4);
  }

  /**
   * The mass off-world (kg): the swarm's collectors, from Mercury and past it the belt, and the
   * habitats' shells (with their power's collectors), from the belt. What's mined of each is the
   * most that has ever stood (a collector taken down is reused); its flow is Fig. 2's arrow from
   * space, named for the source drawn on most (`src`).
   */
  massBooks(E, dt) {
    const P = this.P, mu = P.SIGMA_SW / P.S_AU, S = this.space, sw = mu * (E.cs || 0);
    this.hab = S > 0 ? S - softMin(S, this.worldRooms().surf, 4) : 0;
    const m0 = this.mMerc, b0 = this.mBelt;
    this.mMerc = Math.max(m0, Math.min(P.M_MERC, sw));
    this.mBelt = Math.max(b0, Math.min(P.M_BELT, (P.M_HAB + mu * P.W_HAB) * this.hab + Math.max(0, sw - P.M_MERC)));
    const was = this.mined;
    this.mined = this.mMerc + this.mBelt;
    this.flow = dt > 0 ? (this.mined - was) / dt : 0;
    if (this.flow > 0) this.src = this.mMerc - m0 >= this.mBelt - b0 ? quarryName(this.sys) : 'asteroids';
  }

  /** Mined shares: the belt's and Mercury's. */
  minedShares() {
    const P = this.P;
    return { belt: P.M_BELT > 0 ? this.mBelt / P.M_BELT : 0, merc: P.M_MERC > 0 ? this.mMerc / P.M_MERC : 0 };
  }

  /**
   * People off-world by where they live (drawn only): the surfaces' share of them (soft-capped at
   * the worlds' room opened) split by each world's room, the rest in habitats about the Sun.
   */
  offworld() {
    const { rooms, surf } = this.worldRooms(), S = this.space, Ss = softMin(S, surf, 4), out = { habitats: S - Ss };
    this.worlds.forEach((w, k) => { out[w.k] = surf > 0 ? Ss * rooms[k] / surf : 0; });
    return out;
  }

  /**
   * The probes (speculation): sent at V_PROBE of light's speed once the swarm takes F_PROBE of the
   * Sun. `reach` (ly) is how far they've gone; `seen` how far a settled star could be for its light
   * to be back here, d/v + d/c = t (light-years and years, c = 1); `n` the stars within reach.
   * Aligned, `people` at other stars (drawn only: light-years apart, each system lives on its own):
   * each star's grow from FOUNDERS_STAR at the frontier's rate toward what the home system holds
   * (Earth's room and the room off it), a logistic from when the probes reach it, d/v after they
   * left; summed over shells out to the reach.
   */
  stars() {
    if (this.probeT === null) return null;
    const P = this.P, t = Math.max(0, this.t - this.probeT), reach = P.V_PROBE * t;
    const out = { reach, seen: t / (1 / P.V_PROBE + 1), n: P.N_STAR * 4 / 3 * Math.PI * reach ** 3, people: 0 };
    if (this.ending && this.ending.aligned && reach > 0) {
      const C = Math.max(this.room + (this.roomE || 0), P.FOUNDERS_STAR), n0 = P.FOUNDERS_STAR, K = 64;
      for (let k = 0; k < K; k++) {
        const d = reach * (k + 0.5) / K, e = Math.exp(Math.min(700, P.R_FRONT * (t - d / P.V_PROBE)));
        out.people += P.N_STAR * 4 * Math.PI * d * d * reach / K * C * n0 * e / (C + n0 * (e - 1));
      }
    }
    return out;
  }

  /** The culture each cell's people hold (the highest lineage's). */
  zcell() {
    const nL = this.nL, zc = this.zc || (this.zc = new Float64Array(nL));
    zc.fill(0);
    for (const L of this.lineages) if (L.died === null) for (let c = 0; c < nL; c++) if (L.N[c] > 0 && L.Z[c] > zc[c]) zc[c] = L.Z[c];
    return zc;
  }

  culture(L, live, dt) {
    const P = this.P, H = this.H, E = this.E, nL = this.nL, N = L.N, Z = L.Z, M = L.M, Ntot = this.Ntot;
    // People's minds in each cell: this lineage's × research intensity, the others' at η.
    const m = this.mbuf || (this.mbuf = new Float64Array(nL));
    const sR = this.sR;
    m.fill(0);
    let zmax = 0;
    for (let c = 0; c < nL; c++) {
      if (!(Ntot[c] > 0)) continue;
      m[c] = sR[c] * (N[c] + P.ETA * (Ntot[c] - N[c]));
      if (N[c] > 0) zmax = Math.max(zmax, Z[c]);
    }
    // Minds within reach: the body's total, or a disc of radius ℓ of the local density; AI's
    // research minds (one network, by then) join through the tasks they can do.
    const reach = this.seaReach(zmax), ell = this.reachL(L.g + zmax);
    // The body is the land its people keep in touch across: a share MIND_REL of the inhabited
    // world's mean density (synthesis): the sparse margins that carried the foragers' ideas (a
    // world of them before the tip) don't carry a farming world's, so the Arctic's foragers didn't
    // make the Americas one body with Eurasia, nor the Sahara Africa south of it.
    if (this.rhoStep !== this.t) {
      let n = 0, a = 0;
      for (let c = 0; c < nL; c++) if (Ntot[c] >= P.N_MIN * H.area[c]) { n += Ntot[c]; a += H.area[c]; }
      this.rhoStep = this.t; this.rhoMind = Math.max(P.N_MIN, P.MIND_REL * (a > 0 ? n / a : 0));
    }
    const key = reach.toPrecision(2);
    let comp = this.compCache.get(key);
    if (!comp) this.compCache.set(key, comp = this.components(c => Ntot[c] >= this.rhoMind * H.area[c], reach));
    const tot = new Float64Array(comp.count);
    for (let c = 0; c < nL; c++) if (comp.id[c] >= 0) tot[comp.id[c]] += m[c];
    const disc = Math.PI * ell * ell, ai = this.econ.on ? this.econ.AIr : 0, beta = this.econ.on ? this.econ.beta : 0;
    for (let c = 0; c < nL; c++) {
      if (!(N[c] > 0)) continue;   // read only where this lineage lives (below)
      let ring = m[c];
      for (let o = E.off[c]; o < E.off[c + 1]; o++) if (!E.hop[o]) ring += m[E.nb[o]];
      const loc = disc * ring / this.ringArea[c], body = comp.id[c] >= 0 ? tot[comp.id[c]] : m[c];
      // People's research yields less past industry's culture (ideas get harder to find); AI's
      // own progress is its measured pace (THETA_C), so its minds join at full yield.
      const Mh = (body > 0 ? body * (1 - Math.exp(-loc / body)) : 0) * Math.exp(-P.BETA_R * Math.max(0, Z[c] - P.Z_IND));
      M[c] = ai > 0 && Mh > 0 ? taskLabor(Mh, ai, beta, P.SIGMA).L : Mh;
    }
    // Culture: ideas in, losses out, exact over the step; copying better neighbours and others.
    const gain = P.A_INV, Wk = this.works;
    let rate = 0;
    const others = live.filter(o => o !== L), zc = this.zc;
    for (let c = 0; c < nL; c++) {
      if (!(N[c] > 0)) continue;
      const z0 = Z[c];
      // Forgetting, less where works keep what's known (a person's share of the cell's works).
      const lam = Wk[c] > 0 ? P.LAMBDA / (1 + Wk[c] / Math.max(Ntot[c], 1e-9) / P.W_WORK) : P.LAMBDA;
      const eL = Math.exp(-lam * dt), fL = lam * dt > 1e-9 ? (1 - eL) / lam : dt;
      // Copying the neighbours who know more, whoever they are (the best culture held there: ideas
      // cross between peoples where they meet; copying one's own kind alone kept a lineage that had
      // held East Asia since before the tip a thousand years behind into the farming era), as often
      // as people meet: each side's density against RHO_COPY (synthesis; the Arctic's foragers had
      // carried a farming Eurasia's ideas to the Americas as fast as a farming plain does).
      const dens = d => { const r = Ntot[d] / H.area[d]; return r / (r + P.RHO_COPY); };
      let wsum = 0, up = 0;
      for (let o = E.off[c]; o < E.off[c + 1]; o++) {
        const d = E.nb[o];
        if (!(Ntot[d] > 0)) continue;
        const zd = zc[d];
        if (zd <= z0) { wsum += E.hop[o] ? 0 : E.slope[o]; continue; }
        const e = E.hop[o] ? (reach > 0 ? Math.exp(-E.km[o] / reach) : 0) : E.slope[o];
        up += e * dens(d) * (zd - z0); wsum += e;
      }
      const copy = P.COPY * this.speed(z0) / P.V0 * dens(c);
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
    // better alleles that cross; averaging the traits lost them), less the longer they've been apart.
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      const A = live[a], B = live[b];
      let C = 0;
      for (let c = 0; c < nL; c++) if (A.N[c] > 0 && B.N[c] > 0) C += A.N[c] * B.N[c] / Ntot[c];
      if (C <= 0) continue;
      const ta = A.total || 1, tb = B.total || 1, iso = Math.exp(-((this.divergence(A, B) / P.T_ISO) ** 2));
      const pa = Math.min(0.5, P.GENE_FLOW * iso * C / ta * dt), pb = Math.min(0.5, P.GENE_FLOW * iso * C / tb * dt);
      const ga = A.g, gb = B.g, aa = new Map(A.anc), ab = new Map(B.anc);
      A.g = ga + pa * Math.max(0, gb - ga); B.g = gb + pb * Math.max(0, ga - gb);
      const mix = (dst, src, p) => { for (const [k, v] of dst) dst.set(k, v * (1 - p)); for (const [k, v] of src) dst.set(k, (dst.get(k) || 0) + p * v); };
      mix(A.anc, ab, pa); mix(B.anc, aa, pb);
    }
  }

  farming(live, dt) {
    const P = this.P, H = this.H, E = this.E, nL = this.nL, f = this.f, pkg = this.pkg, Ntot = this.Ntot;
    const zc = this.zcell();
    // The best-suited package farmed here or next door.
    const bestNear = c => {
      let s = pkg[c] >= 0 ? this.suitHere(c) : 0;
      for (let o = E.off[c]; o < E.off[c + 1]; o++) { const d = E.nb[o]; if (pkg[d] >= 0 && f[d] > 0 && pkg[d] !== pkg[c]) s = Math.max(s, this.suit(pkg[d], c)); }
      return s;
    };
    // Origins: settled near foraging's ceiling, knowing enough, with domesticates (the seasonally dry
    // climates' annuals: after Blumler via Diamond, from memory), and no crops at hand that suit the
    // place: a package farmed here or next door suited s leaves 1 − s of the hazard (synthesis; the
    // crops of one climate didn't pre-empt another's own: rice and millet beside wheat).
    for (let c = 0; c < nL; c++) {
      if (!(Ntot[c] > 0) || H.D[c] <= 0 || !H.alive[c]) continue;
      const Kf = H.area[c] * this.coldOK(c, zc[c]) * H.b[c] * P.CAP_F;
      let haz = P.H_FARM * H.D[c] * sig((zc[c] - P.Z_FARM) / P.W_FARM) * sig((Ntot[c] / Math.max(Kf, 1e-9) - P.SED) / 0.1) * Math.exp(-H.sigY[c] / P.SIG_REF);
      if (!(haz * dt > 1e-9)) continue;
      haz *= (1 - bestNear(c)) ** 2;
      if (haz <= 0 || this.rng.uniform() > 1 - Math.exp(-haz * dt)) continue;
      const q = this.packages.length, clim = Float32Array.from(H.clim.subarray(4 * c, 4 * c + 4));
      let zk = 0; for (let k = 1; k < 14; k++) if (H.zv[14 * c + k] > H.zv[14 * c + zk]) zk = k;
      this.packages.push({ c, t: this.t, lat: H.lat[c], lon: H.lon[c], clim, zone: ZN[zk] });
      pkg[c] = q; this.pkgT[c] = this.t; f[c] = Math.max(f[c], 0.01 * H.arable[c] + 1e-4);
      this.event('farming', `farming begins (package ${q}) at ${deg(H.lat[c]).toFixed(0)}°, ${deg(H.lon[c]).toFixed(0)}° in ${this.packages[q].zone} (z ${zc[c].toFixed(2)})`);
    }
    // Spread and growth within cells. Fields no one works go back to the wild over T_WILD (they
    // had stood as they were: the fields outlasted the sea after Earth emptied).
    const f0 = Float32Array.from(f), p0 = Int16Array.from(pkg), wild = Math.exp(-dt / P.T_WILD);
    const take = s => Math.min(1, s * (1 + P.S_HALF) / (s + P.S_HALF));
    for (let c = 0; c < nL; c++) {
      // Farmers clear land next to their own, an empty cell's too (the Nile's valley had no foragers to
      // take crops up); fields no one works and no one next door brings go back to the wild.
      let zk = zc[c];
      if (!(Ntot[c] > 0)) {
        zk = 0;
        for (let o = E.off[c]; o < E.off[c + 1]; o++) { const d = E.nb[o]; if (!E.hop[o] && f0[d] > 0 && Ntot[d] > 0) zk = Math.max(zk, zc[d]); }
        if (!(zk > 0)) { if (f[c] > 0) f[c] *= wild; continue; }
      }
      const know = sig((zk - (P.Z_FARM - 0.5)) / 0.25);
      // A better-suited crop farmed next door is taken up (the cell keeps its fields), at a rate by
      // the contact, the neighbour's fields and the gain (C_PKG).
      let s0 = p0[c] >= 0 ? this.suitHere(c) : 0, bestQ = -1, bestIn = 0, rate = 0;
      if (know > 1e-3) for (let o = E.off[c]; o < E.off[c + 1]; o++) {
        const d = E.nb[o];
        if (p0[d] < 0 || !(f0[d] > 0) || p0[d] === p0[c]) continue;
        const s = this.suit(p0[d], c);
        if (!(s > s0)) continue;
        const w = (E.hop[o] ? 0.3 * Math.exp(-E.km[o] / Math.max(this.seaReach(zc[d]), 1e-9)) : E.slope[o]) * f0[d] * (s - s0);
        rate += w; if (w > bestIn) { bestIn = w; bestQ = p0[d]; }
      }
      // Past industry, crops travel with its pace (the colonists' wheat and cattle reached the
      // pampas and the prairies within decades; synthesis): the uptake and the clearing × `pace`.
      const pace = 1 + (softMin(this.speed(zk) / P.V0, P.IND_PACE, 4) - 1) * sig((zk - P.Z_IND) / 0.5);
      if (bestQ >= 0 && this.rng.uniform() < 1 - Math.exp(-P.C_PKG * know * rate * pace * dt)) { pkg[c] = bestQ; this.pkgT[c] = this.t; s0 = this.suit(bestQ, c); }
      if (pkg[c] < 0) continue;
      // Logistic toward the arable land the crop is worth farming on, exactly (the live planet's
      // climate moves it, so the share can sit above it and fall back), none past the heat limit,
      // none under the solar farms, and no more than the cell's arable share: no fields on
      // permafrost, however far breeding has carried the crops (a9).
      // The cold grasslands' sod turned only under industry's steel ploughs (the prairies, the
      // pampas and the steppe were grazed, not farmed, until the nineteenth century; from memory).
      const sod = 1 - P.SOD * H.sod[c] * (1 - this.ind[c] * (this.lift || 0));
      const tgt = Math.min(H.arable[c] * sod * take(s0) * (1 - this.rewild) * (1 - H.hot[c]), 1 - this.sol[c]);
      // New fields: from the farmers here, and as their neighbours' crops are carried in.
      let seedIn = 0;
      if (f0[c] < tgt && know > 1e-3) for (let o = E.off[c]; o < E.off[c + 1]; o++) {
        const d = E.nb[o];
        if (pkg[d] !== pkg[c] || !(f0[d] > f0[c])) continue;
        seedIn += (E.hop[o] ? 0.3 * Math.exp(-E.km[o] / Math.max(this.seaReach(zc[d]), 1e-9)) : E.slope[o]) * (f0[d] - f0[c]);
      }
      const fs = Math.max(f0[c], Math.min(tgt, f0[c] + P.C_FARM * know * s0 * seedIn * pace * dt));
      const e = Math.exp(Math.min(50, P.R_ADOPT * Math.min(pace, P.CLEAR_PACE) * dt));
      f[c] = tgt > 1e-9 ? (fs > 0 ? tgt * fs * e / (tgt + fs * (e - 1)) : 0) : fs / e;
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
      Ef[c] = P.E_TILL * H.slope[c] * g / P.S_REF * Math.exp(-Math.max(0, zc[c] - P.Z_FARM) / P.Z_CONS) * this.cropped(c) / f;   // fallow isn't tilled
      if (f > fP[c] && fP[c] > 0) dF[c] *= fP[c] / f;
      const q = 1e-3 * Ef[c] / f * (1 - f);
      dF[c] = dF[c] * eR + q * P.T_REFILL * (1 - eR);
      fP[c] = f;
    }
    const Eo = this.Eout || (this.Eout = new Float64Array(nL));
    for (let c = 0; c < nL; c++) Eo[c] = P.SDR * Ef[c];
    this.env.soil(dt, Eo);
  }

  industry(live, dt) {
    const P = this.P, E = this.E, nL = this.nL, ind = this.ind, zc = this.zc;
    if (!this.flags.industry) {
      // A hazard where culture, a dense farming people (its labour and markets: RHO_IND a km²) and
      // coal and ore all suffice (each a logistic, not a gate; by the farmed share alone, it had
      // begun on the Arctic's thin fields).
      for (let c = 0; c < nL; c++) {
        if (!(this.Ntot[c] > 0) || zc[c] < P.Z_IND - 1) continue;
        const haz = P.H_IND * sig((zc[c] - P.Z_IND) / P.W_IND) * sig(this.f[c] > 0 ? (this.Ntot[c] / this.H.area[c] - P.RHO_IND) / (0.3 * P.RHO_IND) : -50) * sig(this.coalReach[c] - P.COAL_MIN) * sig((this.oreReach[c] - P.ORE_MIN) / 0.15);
        if (this.rng.uniform() > 1 - Math.exp(-haz * dt)) continue;
        ind[c] = 0.01; this.flags.industry = true;
        // The first works: fixed capital at its Solow balance for the cell's workers, and the
        // fossil capacity to run it.
        const ec = this.econ, Lh = this.lfp[c] * this.Ntot[c] * ind[c], A = P.A_I0 * ex(P.THETA_I * (zc[c] - P.Z_IND));
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
        if (i0[d] > i0[c]) v += P.C_IND * know * (E.hop[o] ? 0.5 * Math.exp(-E.km[o] / Math.max(this.seaReach(zc[d]), 1e-9)) : 1) * (i0[d] - i0[c]) * softMin(this.speed(zc[c]) / P.V0, P.IND_PACE, 4);
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
      if (this.t - this.mergeSince.get(key) < P.T_MERGE / pace * Math.exp((this.divergence(A, B) / P.T_ISO) ** 2)) continue;
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
      once('sun', E.capR > 0 && E.Er >= 0.5 * E.capR, () => `solar farms on half the land they may cover (${(E.Er / 1e12).toFixed(0)} TW, ${(100 * this.solarShare()).toFixed(0)}% of the land)`);
      once('cap', E.Eu + E.Ef >= 0.9 * E.capU, () => `fossil carbon and fusion near Earth's heat budget (${(E.capU / AREA_M2).toFixed(1)} W/m², ${(E.capU / AREA_M2 / P.B_EBM).toFixed(1)} K before feedbacks)`);
      once('space', E.Es > E.Ef + E.Er + E.Eu && E.Es > 1e11, () => `off-world energy passes Earth's (${(E.Es / 1e12).toFixed(0)} TW)`);
      // The swarm's material, and the probes it sends.
      const ms = this.minedShares(), share = (E.Es || 0) / P.L_SUN;
      once('belt', ms.belt > 0.9, () => `the belt is nine-tenths mined (the swarm ${(100 * share).toPrecision(2)}% of the Sun)`);
      const quarry = quarryName(this.sys);
      once('mercury', ms.merc > 0.01, () => `${quarry} is taken apart for the swarm (${(100 * share).toPrecision(2)}% of the Sun)`);
      once('mercuryGone', ms.merc > 0.99, () => `${quarry} is gone (the swarm ${(100 * share).toPrecision(2)}% of the Sun, ${this.space > 0 ? `${(this.space / 1e9).toPrecision(3)} billion people off-planet` : 'no people off-planet'})`);
      if (this.probeT === null && share >= P.F_PROBE) { this.probeT = this.t; this.event('stars', `probes leave for the stars at ${P.V_PROBE}c (the swarm ${(100 * share).toPrecision(2)}% of the Sun)`); }
      once('disempowered', this.dis > 0.5, () => `people hold less than half the control (${(earth / 1e9).toFixed(2)} billion people)`);
      once('fossil', E.S <= 1e-6, () => `the fossil carbon is spent (${this.emitted.toFixed(0)} Pg C)`);
      F.peakCO2 = Math.max(F.peakCO2 || 0, this.co2);
      once('restored', F.peakCO2 > 350 && this.co2 < 300, () => `CO₂ drawn back below 300 ppm (${this.removed.toFixed(0)} Pg C taken back)`);
    }
    once('runaway', this.env.live ? this.boiled > 0 : this.Ft > P.F_RUN, () => `the runaway greenhouse: forcing ${this.Ft.toFixed(0)} W/m² (the oceans begin to boil away)`);
    once('boiled', this.boiled > 0.99, () => `the oceans are gone`);
    once('exodus', this.space > earth && this.space > 1e6, () => `more people off-planet than on Earth (${(this.space / 1e9).toFixed(2)} billion)`);
    once('trillion', this.space > 1e12, () => `a trillion people off-planet (growth ${(100 * this.fert).toFixed(2)}%/yr past replacement)`);
    once('emptied', F.present && earth < 1e4, () => `Earth is empty of people (${(this.space / 1e9).toFixed(2)} billion off-planet)`);
    once('extinct', F.present && people < 1e4, () => `the last people die`);
    const h = this.history;
    h.push({ t: this.t, dt, people, minds, O: this.O, food: this.food, zmax, farm: earth > 0 ? farm / earth : 0, ind: earth > 0 ? indp / earth : 0,
      Y: E.Y, Kf: E.Kf, Kc: E.Kc, Kq: E.Kq, Kr: E.Kr, AI: E.AAI, x: E.x, ze: E.z, Ap: E.Ap, beta: E.beta, betaP: E.betaP, avail: E.avail, Ef: E.Ef, Er: E.Er, Eu: E.Eu, Emat: E.Emat, Ecomp: E.Ecomp,
      energy: E.Ef + E.Er + E.Eu + (E.Es || 0), Es: E.Es || 0, co2: this.co2, earth, space: this.space, fert: this.fert, room: this.room, hab: this.hab, mined: this.mined, flow: this.flow, ApE: E.ApE || 0, hE: this.hE, boiled: this.boiled, dis: this.dis, sA: E.sA || 0, geo: this.forcing.geo, removed: this.removed, Ft: this.Ft, fossil: E.S, X: E.X, heat: this.forcing.heat, aer: this.forcing.aer,
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
    const n = this.planet.grid.n, area = this.planet.grid.area;
    if (!out) out = { f: new Float32Array(n), Ef: new Float32Array(n), s: new Float32Array(n), x: new Float32Array(n), m: new Float32Array(n) };
    out.f.fill(0); out.Ef.fill(0); out.s.fill(0); out.x.fill(0); out.m.fill(1);
    for (let c = 0; c < this.nL; c++) out.m[this.cells[c]] = this.mega[c];   // large game's share left (the cover's browsing, src/engine/vegetation.js)
    let any = false;
    for (let c = 0; c < this.nL; c++) {
      const i = this.cells[c]; out.f[i] = this.cropped(c); out.Ef[i] = this.Ef[c]; out.s[i] = this.sol[c];
      // Where coal's sulfate is lifted, per unit area: industry's workers (src/engine/peoplelink.js carries it).
      const w = this.Ntot[c] * this.ind[c];
      if (w > 0) { out.x[i] = w / area[i]; any = true; }
    }
    if (!any && this.mach) for (let c = 0; c < this.nL; c++) out.x[this.cells[c]] = this.mach[c] / area[this.cells[c]];   // an empty Earth's machines: their footprint
    const X = this.X;
    for (let k = 0; k < X.cells.length; k++) out.s[X.cells[k]] = X.sol[k];
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
   * it has none; factories and datacenters are the world's on Earth (its share of the energy) spread
   * over it, datacenters toward the cities; Earth's robots (earthBots) over it too, onto the farms and
   * into the cities.
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
      this.city = new Float64Array(nL); this.uShare = new Float64Array(nL); this.mach = new Float64Array(nL); this.cityOf = new Float64Array(nL);
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
    const cof = this.cityOf;
    for (let d = 0; d < nL; d++) {
      const U = u[d] * Ntot[d];
      if (!(U > 0)) { cof[d] = 0; continue; }
      let Z = 0;
      for (let k = off[d]; k < off[d + 1]; k++) Z += Wt[idx[k]] * w[k];
      if (!(Z > 0)) { tgt[d] += U; cof[d] = S[d]; continue; }
      let sz = 0;   // the size of the city its urban people live in, as they're shared out
      for (let k = off[d]; k < off[d + 1]; k++) { const x = Wt[idx[k]] * w[k] / Z; tgt[idx[k]] += U * x; sz += x * S[idx[k]]; }
      cof[d] = sz;
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
   * residents a km² of city; D_FAC, D_DC, D_SOL W/m²), claimed in that order: cities, then factories
   * and datacenters (packing denser to fit where the room runs out), farms (the model's farmed share)
   * as far as they leave room, then solar farms.
   * Layout: [people, farms, cities, factories], [datacenters, solar farms, robots, reached] (reached:
   * 1 where people have ever lived, the Settlement map's explored land).
   */
  drawn(out = null) {
    const n = this.planet.grid.n, H = this.H, E = this.econ, P = this.P, nL = this.nL;
    out = out || new Float32Array(8 * n); out.fill(0);
    this.places();
    const S = this.city, u = this.uShare, m = this.mach, A = H.area;
    // The machines on Earth: the world's by Earth's share of the energy.
    let Wf = 0, Wd = 0, Rb = 0;
    if (E.on) {
      const earth = E.Ef + E.Er + E.Eu, sE = earth > 0 ? earth / (earth + (E.Es || 0)) : 0, run = E.run || { c: 1, r: 1, q: 1 };
      // Factories: Earth's share of output's and capture's power, and its people's food (what they
      // eat by power, wherever it's made); datacenters: its share of compute's, and past scarcity its
      // own people's computing (W_DC_P a person).
      Wf = Math.max(0, (E.sup || 0) + (E.EcdrGot || 0) - (E.Ecomp || 0)) * sE + (this.EfoodE || 0);
      Wd = P.W_C * (E.Kc * run.c + E.Kq * run.q) * sE + P.W_DC_P * this.people * sig(((E.z || 0) - P.Z_SPACE) / P.W_SPACE);
      Rb = E.ApE ?? (E.Ap || 0) * sE;   // Earth's robots at work in worker-equivalents (earthBots: the bodies the AI drives on Earth; idle bodies past it aren't at work)
    }
    // Weights: the footprint, toward the cities for datacenters and onto the farms and into the cities for robots, and a
    // floor on the machines' land: living land people have reached, and land the people's cells don't
    // hold (a9: factories had stood on a continent no one had reached). Solar farms are the model's
    // (People.placeSolar).
    const X = this.X, nX = X.cells.length;
    let Aal = 0, sd = 0, sr = 0, sf = 0, sc = 0;
    for (let c = 0; c < nL; c++) { if (H.alive[c] && this.reached[c]) { Aal += A[c]; sf += this.f[c] * A[c]; } sc += S[c]; }
    for (let k = 0; k < nX; k++) Aal += X.area[k];
    const wd = this.wdb || (this.wdb = new Float64Array(nL)), wr = this.wrb || (this.wrb = new Float64Array(nL));
    for (let c = 0; c < nL; c++) {
      const people = (1 - u[c]) * this.Ntot[c] + S[c];
      wd[c] = m[c] * (1 + 4 * S[c] / Math.max(people, 1)); sd += wd[c];
      wr[c] = m[c] + (sf > 0 ? 0.3 * this.f[c] * A[c] / sf : 0) + (sc > 0 ? 0.3 * S[c] / sc : 0); sr += wr[c];
    }
    // The floor: MACH_FLOOR of the machines spread evenly over their land, or as much as they'd need
    // of all of it at their densities (a spent Earth's heat budget, ~500 PW, is more than factories
    // at 30 W/m² could cover the planet with, the seafloor a boiled sea leaves included).
    const fl = Math.max(P.MACH_FLOOR, Math.min(1, (Wf / P.D_FAC + Wd / P.D_DC) / Math.max(1, Aal * 1e6)));
    // Factories and datacenters (W/m² of the cell): each at its footprint density while there is
    // room; past it they pack denser to fit, to a common density D* (factories, the sparser, first),
    // so a full cell splits by power. (In order, the factories' 30 W/m² took all the land past the
    // dial and left datacenters none; shared by what each wanted, ~0.1% of it.)
    const pack = (pf, pd, room) => {
      let fac = pf / P.D_FAC, dc = pd / P.D_DC;
      if (fac + dc > room) {
        const Ds = room > dc ? pf / (room - dc) : Infinity;   // factories packed to fit beside datacenters at theirs
        if (Ds <= P.D_DC) fac = room - dc;
        else { const t = pf + pd; fac = t > 0 ? room * pf / t : 0; dc = t > 0 ? room * pd / t : 0; }
      }
      return [fac, dc];
    };
    for (let k = 0; k < nX; k++) {   // land the people's cells don't hold: machines and solar farms
      const o = 8 * X.cells[k], Am = X.area[k] * 1e6, floor = Aal > 0 ? X.area[k] / Aal : 0;
      const sol = X.sol[k], [fac, dc] = pack(Wf * fl * floor / (1 + fl) / Am, Wd * fl * floor / (1 + fl) / Am, Math.max(0, 1 - sol));
      out[o + 3] = fac; out[o + 4] = dc; out[o + 5] = sol;
      out[o + 6] = sr > 0 ? Rb * fl * floor / (1 + fl) / X.area[k] : 0; out[o + 7] = fac + dc + sol > 1e-3 ? 1 : 0;
    }
    for (let c = 0; c < nL; c++) {
      const i = this.cells[c], o = 8 * i, Am = A[c] * 1e6, floor = H.alive[c] && this.reached[c] && Aal > 0 ? A[c] / Aal : 0;
      const people = (1 - u[c]) * this.Ntot[c] + S[c];
      // Each use's land, in order of claim.
      let room = H.alive[c] ? 1 : 0;
      const take = want => { const v = Math.min(Math.max(0, want), room); room -= v; return v; };
      // Solar farms are the model's land (the fields gave way to them there); cities, factories and
      // datacenters fit in what the panels leave, and the fields take the rest (factories crowding
      // out fields past the dial: a9, "a feature not a bug"). Where they want more than there is (an
      // ecumenopolis), datacenters, the densest, keep theirs and cities and factories share the
      // rest by what each wants. (In order, the factories' 30 W/m² had taken all the land past the
      // dial and left datacenters none.)
      const sol = take(this.sol[c]);
      const pf = Wf * (m[c] + fl * floor) / (1 + fl) / Am, pd = sd > 0 ? Wd * (wd[c] / sd + fl * floor) / (1 + fl) / Am : 0;
      const wc = (S[c] + Math.max(0, (1 - u[c]) * this.Ntot[c] - P.D_RUR * A[c])) / (A[c] * P.D_URB), dc = take(pd / P.D_DC), wf = pf / P.D_FAC, k = wc + wf > room ? room / (wc + wf) : 1;
      const city = take(wc * k), fac = take(wf * k);
      const farm = take(this.cropped(c));
      // Herders' pasture, past the fields: their hold as far as the herders are there (the people
      // against the capacity, so a frontier's few graze little and food from elsewhere none), on the grass.
      this.past[c] = this.Kown[c] > 0 ? take(this.herdS[c] * Math.min(1, this.Ntot[c] / this.Kown[c]) * Math.min(1, H.fg[c] / 0.5)) : 0;
      out[o] = people / A[c]; out[o + 1] = farm; out[o + 2] = city; out[o + 3] = fac;
      out[o + 4] = dc; out[o + 5] = sol; out[o + 6] = sr > 0 ? Rb * (wr[c] / sr + fl * floor) / (1 + fl) / A[c] : 0;
      out[o + 7] = this.reached[c] || fac + dc + sol > 1e-3 ? 1 : 0;   // where people or their machines have been
    }
    return out;
  }

  /**
   * The herders' pasture, drawn (synthesis): a share of each cell, four values a cell of the people's
   * grid (the rest room for more), from `drawn`'s claims (`past`).
   */
  pasture(out = null) {
    const n = this.planet.grid.n;
    out = out || new Float32Array(4 * n); out.fill(0);
    for (let c = 0; c < this.nL; c++) out[4 * this.cells[c]] = this.past[c];
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
