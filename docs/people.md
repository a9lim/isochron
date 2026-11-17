# People

The model is `src/engine/people.js` (`PEOPLE`; its header holds the forms), run on its own thread in the People scenario (`src/engine/people-worker.js`) and linked to the planet by `src/engine/peoplelink.js`. Headless: `tools/people-run.mjs` on a cached opening (`tools/people/`), `LIVE=1` beside a live planet (`tools/people/couple.mjs`). Fig. 8's hyperbola: `src/engine/peoplefit.js`; Fig. 2's economy: `src/render/economy.js`. Tests: `tests/people.test.mjs`, `tests/economy.test.mjs`.

## Design

- **One loop, run four times** (Kremer's, standard, from memory): minds make ideas, ideas raise capacity, capacity makes minds. Each era changes what the minds are and what they draw on, and each transition is a bifurcation of the loop, not a scripted age.

  | Era | Minds | Capacity from | Loop |
  |---|---|---|---|
  | Foragers | people | foraged NPP | closes only past a threshold in the connected population |
  | Farmers | people | cropland | Malthusian, hyperbolic |
  | Industry | people | fossil energy | broken by the demographic transition |
  | Compute | compute | electricity | closed again, hyperbolic, capped by energy and heat |

- **Few new sinks**: the people write through the planet's own inputs: carbon pulses, tillage in the erosion field, land use on the cover, waste heat and sulfate as forcings, the boiled sea.
- **Factors** split where a split brings its own dynamics: soil (regolith), forest (cover), fossil carbon and ores (finite, their return falling with draw-down), ideas (non-rival, forgotten), fixed capital, energy capital, compute. **AI is capital that does labour** (synthesis): a task CES, so tasks AI can't do bottleneck. **Soft forms over hard caps**: sums over uneven units harmonic, thresholds logistic hazards, floors exponential approaches.
- **Out of scope**: agents, polities, war, named cultures, tech trees. What a superintelligence wants isn't modelled; the model says what each ending costs, not why it happens.

## Lineages, spread and farming

- **The first hominins** start at the heart of the broadest tree–grass mosaic (H.mosaic, b × 4·trees·grass, summed within `R_ORIGIN` 1,000 km) on the landmass that can hold the most of them (`seed`; speculation): an ape radiation lives across an ecotone, and the best single cell is a near tie among tropical coasts.
- **Lineages are kinds of hominin** (soft species: a heritable trait; splits after 200 kyr apart). Two in contact (sharing `MERGE` 10%) for `T_MERGE` merge, faster with culture's pace; a merge keeps each cell's higher culture and the higher trait, ancestry weighted by numbers; gene flow carries each side's advantage across while in contact.
- **Crossing the sea** (synthesis, `tools/people/settle.mjs`): sea edges are every crossing of up to `HOPS` (6) sea cells, plus each landmass group's `K_LONG` (4) nearest groups to `LONG_HOPS` (40), then whatever is still apart. An empty shore is settled by a voyage (`voyages`): `FOUNDERS` (50) at a rate `S_SEA` × crowding × e^{z/Z_V} × e^{−km/reach}, reach = `L_SEA0` + `L_SEA` z (rafts, then boats). Farming and industry spread across a crossing by e^{−km/reach} too. Cold opens faster with culture (`K_COLD`).
- **Fields** keep to each cell's deep, flat bottoms (`fieldSoil`), at most its arable share (`H.arable`: no permafrost, rain-fed above 400 mm/yr); they go back to the wild over `T_WILD` where no one works them; nothing grows past the cover's heat limit.

## The industrial economy

- Industry starts where coal and ore are both within reach (`oreMap`). Research intensity is capped at a subsistence-year's (`S_R_MAX`) and yields less past industry's culture (`BETA_R`); productivity ×e^{0.85} a unit of culture (`THETA_I`); energy intensity falls e-fold per `Z_EFF`; crops are bred beyond their climate (`BREED`).
- **Compute** draws `W_C` (12 W) a subsistence-year of hardware; ordinary computing takes `S_IT` (1.2%) of investment, so compute draws ~40–60 GW around early takeoff. AI's capability follows effective compute (~10×/yr at early takeoff, as measured); `THETA_C`, `THETA_AI`.
- **Robots lag AI**: the working fleet grows at most e-fold per `T_ROB` (1.44 yr) from `B_SEED` (10⁶ bodies) as far as paid for; investment in robots is its own smooth decision (a unit's product against its power, wear and `R_MIN`).
- **Building power takes physical work** (synthesis): the power built a year is at most `S_BUILD` of the physical work (people's and the robots') × `B_POW` (10 kW a worker-year), rising with culture to `B_UP`; space solar by the robots at `B_SPACE` (speculation).
- **Solar farms** compete with fields: their ceiling is the land they may stand on (`solarRoom`, `SOL_ROOM` 0.9 of reached living land and the land the people's cells don't hold) at `D_SOL` (10 W/m²) × the cell's sun; placed sunniest and open land first (`placeSolar`, fields valued over open land by `SOL_FARM`); steam dims them.
- **Space** fills as far as off-world power keeps people (`W_HAB`, 10 kW a person); space solar is soft-capped at a tenth of the Sun (`F_DYSON`, speculation). Food is bought with energy for those the land can't feed.
- **Coal's sulfate** (synthesis): its global mean is `aerC` (scrubbed with culture), lifted where industry's workers are and carried on the dust's balance (one bin, level 5; `PeopleLink.sulfateSteps`), so the forcing is local and downwind; a preserving AI's sprayed sulfate is global.
- At early takeoff on the cached openings: ~9–11 B people, 25–29 TW, ~400 Pg C burned, ~210–290 years after industry; the dial runs out ~4–5 years after early takeoff.

## The endings

A chance draw on two axes, even odds (`P_ALIGN`, `P_PRESERVE`; `ENDING` forces): **1a** misaligned and Earth sacrificed (the oceans boil), **1b** misaligned and Earth preserved (people disempowered), **2a** aligned and Earth sacrificed for the stars, **2b** aligned and preserved. Levers follow AI's share of the work over `T_SA` (2 yr), control over `T_DIS` (30 yr). Preserving: CO₂ drawn to 280 ppm over `T_CDR`, sulfate holding the forcing at none, fossil carbon left, farms rewilded. Sacrificing: Earth's heat budget opened; past the runaway's limit the sea boils (`climate.md`). The land a boiled sea leaves takes solar farms and machines but no people (`People.X`).

## On the page

- **Threads.** The people run at level 6 on their own worker, linked to the engine's by a `MessageChannel`: after each climate cycle the engine sends their fields (`fieldsOf`, restricted), a few times a second the CO₂ and the regolith; ~10 times a second the people send back their farmed shares, tillage, carbon burned less captured, forcing and the sea's boiled share, which the engine applies around each fast step (`PeopleLink`: `CLIMATE.F_PEOPLE`, `Tectonics.boiled`, the cover's tree balance through `Life.onCover`).
- **The clock.** The page holds the planet at its opening while it loads and its climate settles, then places the first hominins; the people owe the years the page's ticks give them and step at their own pace (`People.nextDt`), and the page holds its clock while they're behind.
- **The follow dial**: the rate is set so a doubling of what changes fastest (the minds, farmed land, energy, AI's labour, people on and off Earth: `paceOf`) takes `follow.secs` (10 s), within what the people keep up with and at least 5 kyr/s before the first tip. Under hyperbolic growth the doubling time ∝ t* − t, so the dial falls log-linearly by itself. Taking the dial ends it; F starts it again.
- **Where people and machines are** (`places`, synthesis; drawn only): each cell's urban share (`U_AG` 8% farming, toward `U_IND` 80% with industry) lives in cities at a region's scale (`R_CITY`, by site, density^`G_CITY` and distance) and a country's (`N_CITY` of it to the `K_NATION` largest, density^`G_NATION`); cities follow their catchments over `T_CITY`. Factories, datacenters and robots sit on industry's footprint (following its workers over `T_MACH`), with a floor over the machines' land. Land use is exclusive, claimed in order: cities (`D_URB` 4,000 a km²), solar farms, factories (`D_FAC` 30 W/m²) and datacenters (`D_DC` 500 W/m²) together, then fields.
- **The People view** (`globe.js` modes 7 and 8; `folk`, two vec4s a vertex): **Settlement** shows the Relief view's land where people have ever lived and grey terra incognita elsewhere; **Density** shows people as an accent tint by log density and robots as a verdigris tint. On both, land uses on the Zones mosaic's tesserae at a rank fixed to the globe (`landRank`), one pattern per kind in two colours: blocks for residences (cities accent, datacenters verdigris), furrowed parcels for fields (farms sap, solar indigo), factories a heavy sienna hatch; lakes over the uses; the veil as in the Air map.
- **The endings' marks**: off-world energy's share of the Sun as collectors round its disc, dimming it; the Moon's city (`moonbase` in `main.js`): residences, datacenters and factories growing with the people, compute and power off-world; the sea level falling as the oceans boil, heights measured from the air's datum (`Tectonics.airDatum`).
- **Costs**: a step ~5 ms with one lineage, ~14 with eight (level 6); steps up to `DT_EARLY` (2,000 yr) before any lineage tips, `DT_MAX` (500) after, `DT_ECON` (10) from early takeoff.
