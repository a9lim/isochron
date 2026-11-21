# Open work

The people's three batches, then the planet's open work in rough order. Earth's own errors are listed in `earth.md`.

## People: three batches

Ratified by a9 on 2026-11-18, from a brainstorm by Claude and Codex (gaslamp thread `isochron-brainstorm-2026-11-18`). Batch 1 is the land and its flows: every human state per cell, and what moves between cells, in three landings (1a, local texture; 1b, flows; 1c, peoples: all built). Batch 2 is institutions: who controls those flows, in two parts (2a pre-industrial, 2b industrial). Batch 3 is the game, a third scenario. Each item that moves the people lands with `tools/people/earth-score.mjs` re-run, and with a test where its failure would be silent (`AGENTS.md`); each landing ends scored and retuned. The social card is frozen as painted (a9, 2026-11-19: a painting of the project's idea, not a record of the model; `AGENTS.md`).

The seam between the batches holds by four rules:

1. The people's state lives on their grid, per cell; the only world-level arrays are the industrial economy's core (output, capital, energy, compute) and the endings.
2. Every flow between cells goes through one transport cost, the route graph (1b): food, culture, crops, and later deliveries and goods. Polities add owners to flows that already exist.
3. The world economy reads per-cell inputs (workers from each cell's pyramid) and writes per-cell outputs (goods), so batch 2 splits it by summing over a polity's cells instead of the world's.
4. The endings' draw reads a state, so batch 2 swaps the race in without touching the endings' mechanics.

### Batch 1: built

Batch 1 was built 2026-11-18 and 2026-11-19 (`people.md` holds each mechanism; git holds the landings' scores). What each landing left open:

- **1a, local texture** (the ages, the year's harvests, the pause, the night side): births don't read the pyramid, so a baby bust echoes in deaths and workers but not in births a generation on; what a paused world does in space, and whether a pause can lapse (batch 2 makes it something polities agree to); herders take the unfarmed land where they'd feed more than foragers (a hard choice, softened only in the drawing); the pyramids add ~5 ms to a step under `T_STABLE` with the land full, `places` ~13 ms every `DT_PLACES` years.
- **1b, trade on the winds** (`src/engine/routes.js`; the graph in twelve directions, since on six its paths drew triangles): the routes' kernel isn't reread as the winds shift between rebuilds (only as the land changes); the routes' paths don't follow the works (only their costs do); goods and energy on the routes wait for batch 2's regional economies.
- **1b, cities that must be fed** (the cities' reach floored at ~100 km by road, the country's ~500, so farming's cities reach history's sizes): cities lengthen the industrial era by a few decades; the largest cities reach ~70–150 million by takeoff against today's ~30–40, the agglomeration's exponent fitted when cities were drawn only; a pre-industrial city shows only zoomed in; a city's foodshed isn't drawn as its own, only its far food on the routes.
- **1b, the hungry season**: the lean month (`H.lean`) isn't drawn; granaries as works would set the store's room and losses by place, not by culture alone; foragers' and herders' own lean seasons.
- **1b, herds as a stock**: winter fodder as its own limit (hay with culture), the animals' own climates (the camel's desert, the yak's plateau, the water buffalo's paddies), the horse's reach for batch 2's frontiers, and the herd drawn.
- **1b, irrigation and salt**: the canals water ~0.7–1 million km² by industry on Earth, several times the pre-industrial world's (the model's Sahara, Australia and steppe hold rivers and dry warm seasons); southern Mesopotamia holds ~0.5% of the people (2.4% now), the climate's; industry's own irrigation is only in its lift of yields, so the canals run down after industry; drainage as a work and salt-tolerant crops.
- **1b, a region's luck** (ideas × a smooth random field, so the lead passes among dense regions instead of holding at the densest): it hastens history (`Y_B` retuned for ~8 billion at takeoff).
- **1b, works**: terraces and canals as patterns on the Settlement map's fields; the land's works stop with industry rather than turning into its capital; polities belong on the Culture map too, their borders where deliveries stop.
- **1c, the first people** (ratified by a9 2026-11-19, with the rest of 1c): Homo sapiens 150 kyr before the dial runs out, not the first hominins, with no heritable trait (one that could differ between modern peoples explains nothing the model needs, and invites the wrong reading). Open: industry begins in Australia in five draws of eight; the earthlike seed has its own long forager era.
- **1c, two domains of knowledge**: production and learning; the epistemic base by the bound alone (a9: more interesting and more parsimonious); where ideas go by `TILT` (a9, in place of farmers' time); the Knowledge map renamed from Culture (a9: culture proper is customs and polities); the Earth score a guide on the model's own climate (a9).
- **1c, peoples**: identity on Miasma's torus, one point a way of life a cell (a9: the first try's tears were messy and fragmented); **AI needs learning first** (a9: `ALG`, 0.8 learning's and 0.2 production's).

### Batch 2: institutions

Polities and war return (`people.md`, Out of scope). Designed by Claude and ratified by a9 on 2026-11-19, in two parts: **2a**, the pre-industrial states (landings 1 and 2), and **2b**, the industrial ones (landings 3 to 6). Each landing is scored on Earth. Polities aren't agents: they decide nothing, and everything they do is a flux. The state amends seam rule 1 by one table (polities: capital, cohesion, the capital's identity, stores, later the economy) beside each cell's allegiance to its three strongest, so polities keep the discrete ids that the economies, the race and batch 3 need.

**Batch 2a: the pre-industrial states.** Built 2026-11-19 on the branch `batch-2a` (`people.md`, "States"; `src/engine/polities.js`): polities, and what states do, with **decentralization** (a9; contested, so weak and two-sided, and switchable). Lessons from the building that hold for 2b:
- **Power** is a state's own arms near a place, not its whole power projected from the capital, which fed on its own size (one state at a twentieth of its cohesion held most of the world).
- **The stateless resistance** is the region's over the local routes only (across the markets' sea routes, a coast's region took in a whole sea's people and no coastal state stood).
- **Cohesion** is kept by place, as Turchin's model keeps it, so states rise and fall, and floored by the nation's as learning comes (Gellner).
- Tuned to Earth's history on the earth seed, its geography allowed for (a9): the resistance a quarter, the reach ×4, cohesion's floor near twice the resistance and its decay ×2.5, founding later with founders bringing their own cohesion, the media's pull the nation's (a9). The largest state holds ~11–19% of everyone against history's ~¼–⅓ (no dense India or China on this Earth).

Open from it: Turchin's secular cycles (hunger lowering cohesion); overseas empires (2b: a state's power reaches only over its places' local routes); the largest city at takeoff ~170 million (capitals take a state's whole share); the Americas stateless longer than history's (their late, sparse farmers).

**Batch 2b: the industrial states.**

3. **Regional economies**: `industrialStep` per polity (6.5 µs a call: 500 polities ~3 ms a step, so the full split, a9), each its stocks, fossil carbon and ores from the cells it holds; goods by the gravity kernel with borders, energy and materials at a pooled price, capital at home (Feldstein–Horioka, standard). Compute and the takeoff then have a place.
4. **The race**: each polity's compute, research minds and algorithmic frontier (grown by research, bounded by its learning, leaking across borders at a rate closure lowers; chips' export controls on the production side). The endings' draw reads the leader's margin (years), the contenders within a year, the share spent on safety and coordination among the contenders (likeness on the torus, trade's ties): the odds of alignment rising with the margin and with safety (Armstrong, Bostrom and Shulman's race to the precipice, from memory), a pause's with coordination. The draw's mechanics stay (seam rule 4).
5. **Claims on the machines** (speculation, said so on the page): the aligned endings ask aligned to whom; claims by polity decide who returns and who is housed.
6. **The record**: docs and the about panel.

Left out (a9): industrial war's nuclear exchanges (soot into the climate's forcing): a catastrophe outside the AI endings, pitched for after the race.

### Batch 3: the game

- **A third scenario** beside World and People, the only one with controls. The other two keep the dial alone.
- **The frame** (themed after Scott Alexander's "The Goddess of Everything Else", 2015, from memory; none of its text is used). The model is the drive to multiply and consume, and the player never opposes it, only bends it. The score is the effective number of kinds the drive hasn't flattened (a Hill number over peoples, crops, polities, cities, works, worlds and stars). A star the probes reach could seed the next run.
- **Standing rules.** The player composes rules from words that are objects in the world (after Baba Is You's rules as blocks). A rule pairs a trigger on a quantity with an action on a flow; it then runs unattended, and its consequences pile up where they fall. Revisions are scarce. Rules are ideas: each must spread by culture's copying and take root, held by a polity or its works, before it acts. Its forms open with the eras: prophecies, commandments, edicts, constitutions, manifestoes.
- **The race** as its last act: the takeoff's century played among batch 2's polities, each choosing pace against care, with the alignment hazard reading the race. A treaty costs its signers.
- **Needs**: saves (snapshots of the engine's and the people's workers), and, for revisions or rewinds, repeatability (the GPU plate step isn't repeatable, below).

### Pitched, not batched

From the same brainstorm, for later: place names laid down in layers (languages are 1c's peoples); crowd diseases and the meeting of long-parted worlds (Miasma's SEIR); ruins the planet buries, scours and subducts; a census at a point; one cohort's life at the slow dial; an ancestry traced back to the first people by the coalescent; a Histomap of polities; a tune carried across the sea; the Silurian epilogue (the planet run on after the ending, keeping what it keeps); a second rise on a planet whose coal is spent; letters from settled stars; worlds unlike this one (spin, tilt, no Moon, tidal locking); life's deep history; and other games: a promise between two basins (Codex's pick), landfall on a star's world, predicting a planet's farming, puzzles on seeds.

### Open in the model as it stands

- **People on Earth** (`people.md` "On Earth"): Asia's paddies (wet rice beyond the floodplains, terraced and canal-fed, the densest pre-industrial farming); Eurasia's head start in large domesticates, now from the overkill (1b's herds), leaks through the model's mild Chukotka and gives Africa as much as Eurasia; industry-era migration (the Americas and Australia filled by ships, not by diffusion); and, first, the climate's monsoon and tropical rain, which set most of what's left.
- **People, open**: the robot fleet's swings long after the dial (Ap between ~10¹⁷ and ~10²¹ in the same ending, a cycle of decades); capital's weight (K/Y ~2.3 against Earth's 3–4); a runaway's end (carbonates baked into a CO₂ atmosphere); the swarm's pace (mining's own ramp would slow it past the belt); surveys across seeds (how often a world tips, farming's origins, the follow dial's length).

## The planet

- **Eastern North America.** Its coast's sea (a cold Labrador Current inshore of the warm boundary current, so the Gulf of St Lawrence freezes) and Canada's winter (the template's pressure is the latitude's belts and the thermal departure; the continents' winter troughs and the high behind them aren't in it).
- **Clouds.** Deep convection's longwave (a convective cloud from the convective rain alone), the layer cloud reaching into deserts (by the column's humidity and its descent), eastern China's and Southeast Asia's shortwave.
- **The sea's fall on today's Earth** (~20 m in 2 Myr): the basins deepening as the opening's thick oceanic crust is replaced and its floor ages, and the ice moving off West Antarctica onto northern land; the Gulf drains with it (`earth.md`).
- **Eastern Africa's dryness** (the East African paradox): the Indian Ocean's water comes onshore on the template's easterlies all year; Earth's low-level flow runs along the coast (the Somali jet, the highlands' wall) with a dry column over the plateau. Until it's dry the first hominins can't start there: it's closed forest (`earth.md`).
- **The land's evaporation by its cover**: the air takes the ground's evaporation, which reads the bucket's β alone, so a forest evaporates as grass does (the moisture's own form gave trees √β, their deeper roots); the cover into the ground's year (its β, its interception) would let forests carry their rain through a dry season. The deep tropics are wet meanwhile.
- **Central Asia's water** (the Caspian fills to its spill with the Aral's water) and **India's monsoon** (the land's seasonal phase, the template's trough).
- **Ice that keeps orbital time.** The sheets barely answer the orbit: the lowlands at 55–70° where Earth's paced sheets grew are too warm in summer and too dry for ice to start. Levers not pulled: the moisture reaching high latitudes (the template carries little poleward), refreezing in the degree-day scheme (Reeh's, standard), the snow–albedo and tundra feedbacks. Run the ice-age survey on Earth (`tools/iceage-survey.mjs earth`) to tell geography from model. A free-CO₂ survey at ≤ 1 kyr/s would show the dust–iron swing.
- **Foreland basins.** A collision's stacking stands on local isostasy (`surface.md`, the crust's flexure): the grid stacks a column onto one cell a step, and held by the plate cell by cell it left orogens speckled ±2 km. A foreland basin is the downgoing plate bending under the orogen; the grid consumes that plate's crust at the front. One way: lay the stacking's load, smoothed along the front, on the incoming plate's cells ahead of it. The flexure's 2 km cap (`C_MAX`) dates from the stacking too, and can be retested on the loads it bears now (arcs, the plumes' basalt, the ice's till).
- **The mantle's flow** is a potential flow from the piles to the slabs, with no toroidal part (which lateral viscosity and the plates' own motion make), so North America runs 55° off Müller's direction and Africa 32°; the Himalayan front closes at ~1 cm/yr against Earth's ~4. True polar wander would follow from the same density (the graveyard and the piles set the spin axis): a round of its own, since the climate, weather, orbit, people and the globe's pole all take the spin axis as the grid's z.
- **The GPU's plate step isn't repeatable** run to run (a float reduction's order or a race in a pass feeding the elevation), so a seed's page run can't be replayed.
- **Deltas.** First the supply (three quarters of the eroded rock stops in closed depressions on land, and the load is spread over thousands of mouths), then delta plains (sediment building to sea level at a mouth before the shelf), then drawn deltas (distributaries by Galloway's triangle, standard).
- **Speed.** The plate step's latency (a 0.5 Myr step is ~4 GPU round trips, each waiting ~4 ms and followed by the CPU's sea solve, ~4 ms; pipelined with the landscape, ~35 ms a step), then the climate's per-cell physics on the GPU (the dust's lifting and packing, the clouds, the template's pressure: ~150 ms of a warm cycle's ~400 at level 7) and the ground's year (~70). Targets: the dial's top at 10 Myr/s at level 7 (~3.5 now), a climate cycle under ~100 ms.
- **Earth at past dates** (`?seed=earth-66`): snapshots baked like today's, each with its CO₂, sunlight, day and Moon. The PaleoDEMs (Scotese and Wright 2018, CC BY 4.0) are in PALEOMAP's frame, whose plate model has continental blocks only; the leaning is PALEOMAP throughout, ocean plates grown around the continents as genesis does.
- **Not built**: the Storm track, Spin, Tilt and Supercontinent experiments; floodplain lakes and backflow; an Equal Earth view; moving sea ice (built once and dropped: at 220 km its drift didn't move the ice edge).
- **Risks**: the weather–climate seam; the supercontinent cycle may not cycle; show-don't-tell under nine layers; tuning drift.
