# People

The model is `src/engine/people.js` (`PEOPLE`; its header holds the forms), run on its own thread in the People scenario (`src/engine/people-worker.js`) and linked to the planet by `src/engine/peoplelink.js`. Headless: `tools/people-run.mjs` on a cached opening (`tools/people/`; `ENGINE=7` builds it the way the page's desktop engine sees it), `LIVE=1` beside a live planet (`tools/people/couple.mjs`); `tools/people/earth-score.mjs` scores today's Earth (below). Fig. 8's hyperbola: `src/engine/peoplefit.js`; Fig. 2's economy: `src/render/economy.js`. Tests: `tests/people.test.mjs`, `tests/economy.test.mjs`.

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
- **Minds' bodies** (synthesis): minds pool across land peopled at `MIND_REL` (0.3) of the inhabited world's mean density. A forager world is one body; once farming crowds the cores, the sparse margins part it, so a continent reached only through the Arctic or across a strait keeps Kremer's lag (the Americas, Australia). Culture is also copied from any neighbour who knows more, whatever their lineage, at a rate weighted by each side's density (`RHO_COPY`). Copying only one's own lineage had kept a lineage that held East Asia since before the tip ~1 unit of culture behind into the farming era.
- **Crossing the sea** (synthesis, `tools/people/settle.mjs`): sea edges are every crossing of up to `HOPS` (6) sea cells, plus each landmass group's `K_LONG` (4) nearest groups to `LONG_HOPS` (40), then whatever is still apart. Then come ocean routes (`graph`): each landmass (by land alone) to every other within `OCEAN_HOPS` (80) cells, with up to `M_ROUTE` (6) landings at least `D_ROUTE` (1,500 km) from each other and from the crossings already made. Without them, Earth's Americas were joined to Eurasia only at Bering, and nothing crossed the Atlantic. An empty shore is settled by a voyage (`voyages`): `FOUNDERS` (50) at a rate `S_SEA` × crowding × e^{z/Z_V} × e^{−km/reach}. The reach is `L_SEA0` + `L_SEA` (1 − e^{−z/Z_SEA}) + `L_OCEAN` sig((z − `Z_OCEAN`)/`W_OCEAN`): rafts and boats along coasts and between islands, a few hundred km by the Upper Palaeolithic (Sahul, Bering), then deep-sea navigation in a few centuries about `Z_OCEAN` (6.2). Farming and industry spread across a crossing by e^{−km/reach} too. Cold opens faster with culture (`K_COLD`).
- **Crops' land** (`rates`; synthesis):
  - **Floodplains:** each river has a floodplain `W_FP` √Q km wide along its course through the cell (hydraulic geometry's width ∝ √Q, standard). There the crops are watered and the floods renew the soil (`FP_RENEW` of what the uplands lack). Only the growing season's warmth limits them, and they are cropped as often as it allows (GDD/`GDD_CROP`, at most `CROPS_MAX`: wet rice's two and three a year).
  - **Uplands:** rain-fed (Miami's rain limb). A crop's warmth is 1 − e^{−(GDD − GDD0)/GDD_E}: none in a boreal summer, two thirds at the prairies'.
  - **Fertility** is 1/(1 + leaching/(`L_FERT` (1 + erosion/`E_FERT`))), with leaching the drainage × e^{(T − 15)/T_LEACH}. Old, leached tropical soils lose their nutrients; young and eroding ones keep them (Walker and Syers, Porder and Vitousek, from memory). The uplands are cropped only in that share and lie fallow the rest (swidden), until industry's fertilizer makes it up.
  - **The arable share** is the floodplain plus the uplands a plough can work, at most `ARABLE_MAX`:
    - unfrozen;
    - flat enough (`S_ARABLE`);
    - with a growing period of `LGP_DRY`–`LGP_WET` months (FAO's length of growing period: warm months whose rain meets half the potential evaporation, standard), so a monsoon's wet months count where the year's mean aridity wouldn't;
    - not the cold grasslands' sod (`SOD`), which only industry's steel ploughs turn.
  - **Disease:** the warm, wet tropics' diseases thin farmers (`PATH`, malaria with clearing and standing water) until medicine.
  - **Fields** keep to each cell's deep, flat bottoms (`fieldSoil`; on stony, thin ground they still bear `Y_STONY`). Tillage strips the uplands' soil, `SDR` of it leaving the cell. Fields go back to the wild over `T_WILD` where no one works them, and nothing grows past the cover's heat limit.
- **Farming's origins and crops** (synthesis):
  - **Origins:** the hazard is `H_FARM` × domesticates × knowledge (z about `Z_FARM`) × settledness × steady harvests, × (1 − s)², where s is the suitability of the crops farmed here or next door. One climate's crops don't pre-empt another's own (rice and millet beside wheat), so a world has ten to thirty origins.
  - **Packages:** each carries its origin's climate, and its suitability elsewhere is a Gaussian in the coldest month, the warmest, log water (a floodplain's river counts) and the summer's share of rain (`CLIM_S`, after BIOCLIM's envelopes). Industry's breeding widens it (`BREED`).
  - **Spread:** a better-suited crop farmed next door is taken up at a rate by contact, the neighbour's fields and the gain (`C_PKG`). Once a crop is taken up, farmers breed it toward the place: s^a, with a falling e-fold per `T_ADAPT` (2 kyr) to `A_ADAPT`.
  - **Farmed share:** it rises toward the arable land × s/(s + `S_HALF`) × (1 + `S_HALF`), clearing empty land next to farmers too: the Nile's valley had no foragers to take crops up.
- **Demic spread** (synthesis):
  - **Migrants judge land by what they'd farm.** A farming people's migrants (their best culture past `Z_FARM`) see unfarmed land as fields: `MIGR_F` of its arable land, crops suited `MIGR_S`. That sets only the spread's weights, after Ammerman and Cavalli-Sforza's wave of advance (from memory). With the cell's own fields alone, a continent of foragers had looked full to them, and farmers never came.
  - **Industry's mobility:** railways and steamships add `D_IND` (10⁴ km²/yr, a logistic about `Z_IND`) to the dispersal, and the spread takes up to `NSUB_IND` (48) substeps a step once industry runs. Capped at `NSUB_MAX` (4), the economy's 10-year steps held migration to a forager's few km a year, and the Americas stayed empty past the takeoff on the page's planet.
  - **Industry's crops:** past industry, crops travel at its pace. The uptake of a better crop, and the fields' spread from next door, × 1 + (min(culture's pace, `IND_PACE`) − 1) sig((z − `Z_IND`)/0.5); the clearing at most `CLEAR_PACE` (5) times faster. At the Neolithic's ~1 km/yr, the settlers' crops had reached a few hundred km inland by the takeoff.

## The industrial economy

- Industry starts where a dense farming people (`RHO_IND`, 10 a km²: labour and markets) has coal and ore within reach (`oreMap`). By the farmed share alone, it had begun on the Arctic's thin fields. Coal lies in the lowland basins (low and flat), not under today's forests: coal is the peat of swamps long gone. It spreads by contact at up to `IND_PACE` (60) times its own pace, reaching the world in two centuries, not one. Research intensity is capped at a subsistence-year's (`S_R_MAX`) and yields less past industry's culture (`BETA_R`); productivity ×e^{0.85} a unit of culture (`THETA_I`); energy intensity falls e-fold per `Z_EFF`; crops are bred beyond their climate (`BREED`).
- **Compute** draws `W_C` (12 W) a subsistence-year of hardware; ordinary computing takes `S_IT` (1.2%) of investment, so compute draws ~40–60 GW around early takeoff. AI's capability follows effective compute (~10×/yr at early takeoff, as measured); `THETA_C`, `THETA_AI`.
- **Robots lag AI**: the working fleet grows at most e-fold per `T_ROB` (1.44 yr) from `B_SEED` (10⁶ bodies) as far as paid for; investment in robots is its own smooth decision (a unit's product against its power, wear and `R_MIN`).
- **Building power takes physical work** (synthesis): the power built a year is at most `S_BUILD` of the physical work (people's and the robots') × `B_POW` (10 kW a worker-year), rising with culture to `B_UP`; space solar by the robots at `B_SPACE` (speculation).
- **Solar farms** compete with fields: their ceiling is the land they may stand on (`solarRoom`, `SOL_ROOM` 0.9 of reached living land and the land the people's cells don't hold) at `D_SOL` (10 W/m²) × the cell's sun; placed sunniest and open land first (`placeSolar`, fields valued over open land by `SOL_FARM`); steam dims them.
- **Space** fills as far as off-world power keeps people (`W_HAB`, 10 kW a person); space solar is soft-capped at a tenth of the Sun (`F_DYSON`, speculation). Food is bought with energy for those the land can't feed.
- **Coal's sulfate** (synthesis): its global mean is `aerC` (scrubbed with culture), lifted where industry's workers are and carried on the dust's balance (one bin, level 5; `PeopleLink.sulfateSteps`), so the forcing is local and downwind; a preserving AI's sprayed sulfate is global.
- At early takeoff on the cached openings: ~9–9.7 B people, ~30 TW, ~650–700 Pg C burned (CO₂ ~560 ppm), ~255–310 years after industry; the dial runs out ~4–5 years after early takeoff.

## On Earth

`tools/people/earth-score.mjs` runs the people on today's Earth from the first hominins to early takeoff, over several draws of their chances in parallel. It scores where the people are against where people live now: the regions' shares of ~2023 (rough, from memory), Σ share × |ln(model/observed)|.

- **Score:** ~1.12 on the cached level-6 opening and ~1.15 on the page's level-7 engine (`ENGINE=7`); the model before this was ~2.5, with 62% of the people in Africa and industry always beginning there.
- **Timeline:**
  - 10–30 origins of farming, the first ~15–25 kyr before industry.
  - Industry in a dense farming people's basins: Manchuria, the Caspian's shores, the Ganges, southern Siberia, sometimes Arabia or Australia.
  - Early takeoff ~280–310 years after industry, at ~9.3 billion people.
- **Continents:** Asia ~28–36% (now 58%), Africa ~27–29% (20%), the Americas ~14–23% (13%), Europe ~6% (9%), Oceania ~7% (1%).

What's left mostly follows the climate's errors (`earth.md`):

- India is ~60% of its rain and East Asia's monsoon is weak, so India holds ~3% of the people (24% now) and China ~7% (14%).
- The Sahel, East Africa, Mongolia and Australia are far too wet, so they farm as if fertile.

Two gaps belong to the people's model itself:

- **Asia's paddies:** wet-rice farming beyond the floodplains is missing.
- **Eurasia's head start in domesticates:** large animals for the plough, manure and traction are missing, so the Americas, reached through Bering on the cached map, farm like Eurasia. On the page's live planet the ice ages can close Beringia while culture is low, so South America stays a thin, lagging foragers' land until industry's migrants come.

## The endings

A chance draw on two axes, even odds (`P_ALIGN`, `P_PRESERVE`; `ENDING` forces): **1a** misaligned and Earth sacrificed (the oceans boil), **1b** misaligned and Earth preserved (people disempowered), **2a** aligned and Earth sacrificed for the stars, **2b** aligned and preserved. Levers follow AI's share of the work over `T_SA` (2 yr), control over `T_DIS` (30 yr). Preserving: CO₂ drawn to 280 ppm over `T_CDR`, sulfate holding the forcing at none, fossil carbon left, farms rewilded. Sacrificing: Earth's heat budget opened; past the runaway's limit the sea boils (`climate.md`). The land a boiled sea leaves takes solar farms and machines but no people (`People.X`).

## On the page

- **Threads.** The people run at level 6 on their own worker, linked to the engine's by a `MessageChannel`: after each climate cycle the engine sends their fields (`fieldsOf`, restricted), a few times a second the CO₂ and the regolith; ~10 times a second the people send back their farmed shares, tillage, carbon burned less captured, forcing and the sea's boiled share, which the engine applies around each fast step (`PeopleLink`: `CLIMATE.F_PEOPLE`, `Tectonics.boiled`, the cover's tree balance through `Life.onCover`).
- **The clock.** The page holds the planet at its opening while it loads and its climate settles, then places the first hominins; the people owe the years the page's ticks give them and step at their own pace (`People.nextDt`), and the page holds its clock while they're behind (more than a quarter second's years). Their worker steps as soon as a whole step is owed, or once the owed years have waited 50 ms; each lineage's spread runs over the cells its substeps can reach.
- **The follow dial**: the rate is set so a doubling of what changes fastest (the minds, farmed land, energy, AI's labour, people on and off Earth: `paceOf`) takes `follow.secs` (10 s), within what the people keep up with and at least 5 kyr/s before the first tip. Under hyperbolic growth the doubling time ∝ t* − t, so the dial falls log-linearly by itself. Taking the dial ends it; F starts it again.
- **Where people and machines are** (`places`, synthesis; drawn only): each cell's urban share (`U_AG` 8% farming, toward `U_IND` 80% with industry) lives in cities at a region's scale (`R_CITY`, by site, density^`G_CITY` and distance) and a country's (`N_CITY` of it to the `K_NATION` largest, density^`G_NATION`); cities follow their catchments over `T_CITY`. Factories, datacenters and robots sit on industry's footprint (following its workers over `T_MACH`), with a floor over the machines' land. Land use is exclusive, claimed in order: cities (`D_URB` 4,000 a km²), solar farms, factories (`D_FAC` 30 W/m²) and datacenters (`D_DC` 500 W/m²) together, then fields.
- **The People view** (`globe.js` modes 7 and 8; `folk`, two vec4s a vertex): **Settlement** shows the Relief view's land where people have ever lived and grey terra incognita elsewhere; **Density** shows people as an accent tint by log density and robots as a verdigris tint. On both, land uses on the Zones mosaic's tesserae at a rank fixed to the globe (`landRank`), one pattern per kind in two colours: blocks for residences (cities accent, datacenters verdigris), furrowed parcels for fields (farms sap, solar indigo), factories a heavy sienna hatch; lakes over the uses; the veil as in the Air map.
- **The endings' marks**: off-world energy's share of the Sun as collectors round its disc, dimming it; the Moon's city (`moonbase` in `main.js`): residences, datacenters and factories growing with the people, compute and power off-world; the sea level falling as the oceans boil, heights measured from the air's datum (`Tectonics.airDatum`).
- **Costs**: a step ~5 ms with one lineage, ~14 with eight (level 6); steps up to `DT_EARLY` (2,000 yr) before any lineage tips, `DT_MAX` (500) after, `DT_ECON` (10) from early takeoff.
