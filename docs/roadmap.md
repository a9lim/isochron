# Open work

The people's three batches, then the planet's open work in rough order. Earth's own errors are listed in `earth.md`.

## People: three batches

Ratified by a9 on 2026-11-18, from a brainstorm by Claude and Codex (gaslamp thread `isochron-brainstorm-2026-11-18`). Batch 1 is the land and its flows: every human state per cell, and what moves between cells, in two landings (1a, local texture, built; 1b, flows). Batch 2 is institutions: who controls those flows. Batch 3 is the game, a third scenario. Each item that moves the people lands with `tools/people/earth-score.mjs` re-run and its oracle in `tests/people.test.mjs`; each landing ends scored and retuned. When the model's arc moves, the social card's run is re-exported (`AGENTS.md`).

The seam between the batches holds by four rules:

1. The people's state lives on their grid, per cell; the only world-level arrays are the industrial economy's core (output, capital, energy, compute) and the endings.
2. Every flow between cells goes through one transport cost, the route graph (1b): food, culture, crops, and later deliveries and goods. Polities add owners to flows that already exist.
3. The world economy reads per-cell inputs (workers from each cell's pyramid) and writes per-cell outputs (goods), so batch 2 splits it by summing over a polity's cells instead of the world's.
4. The endings' draw reads a state, so batch 2 swaps the race in without touching the endings' mechanics.

### Batch 1a: local texture

Built 2026-11-18 (`people.md`, "Food, years, ages and works" and the pause; the night side and its lights in `scene.md`; Fig. 9 the ages). Earth's score held within its draws' spread (~1.16 ± 0.06 over eight against ~1.12). Open from it:

- **Births by age**: births don't read the pyramid, so a baby bust echoes in deaths and workers but not in births a generation on.
- **The pause**: what a paused world does in space, and whether a pause can lapse. Batch 2 makes it something polities agree to.
- **Herders** take the unfarmed land where they'd feed more than foragers (a hard choice, softened only in the drawing); traction and manure are 1b's.
- **Cost**: the pyramids add ~5 ms to a step under `T_STABLE` with the land full; `places` ~13 ms every `DT_PLACES` years.

### Batch 1b: flows

- **Trade on the winds** (synthesis). The route graph: by sea, routes priced on the planet's own winds and gyres (the sail's cost by month); by land, on the relief and the rivers. Flows run by a gravity model between markets, carrying food, crops and culture, and later goods and energy, drawn as lines as heavy as their flux. They replace the trade closure (`L_CORR`): harvests pool along routes, not by a correlation length. Monsoon trade and the oceans' sailing loops should come out of the winds.
- **Cities that must be fed.** Cities become the model's, not only the drawing's: a city cell holds its own fields' food and what reaches it along the routes, with its foodshed drawn upstream. This lifts the demography's assumption that a cell's people are bounded by its own food, the change most likely to move Earth's score, so it gets a tuning pass of its own.
- **The hungry season** (standard). From each crop's harvest calendar (the twelve months' warmth and growing period), stores must bridge the gap between harvests, so lean months differ by place.
- **Herds as a stock**: herds per cell with their winter fodder, manure for the fields and traction for the plough (Eurasia's head start in domesticates, below).
- **Irrigation and salt**: canals from rivers onto dry floodplains, and salt rising over centuries through the ground's water until fields are lost (Mesopotamia's sequence, from memory), a drag on dry lands' cities.
- **Works as places' improvements**: terraces, canals, granaries and roads, each with its own effect (on yield, water, stores, a route's cost), built by labour and kept by upkeep. Left alone they decay slowly, so an abandoned valley keeps a reason to be resettled.

### Batch 2: institutions

Polities and war return (`people.md`, Out of scope). The batch starts with a design pass, recorded here before any code: a polity's state (which cells deliver to which centre, and its cohesion), how the world economy splits, and conflict as fluxes.

- **Polities made of deliveries** (speculation). A polity is the set of places still delivering grain, labour or tax along the routes to a centre, which returns stores, upkeep or protection. Its territory is a field (each cell's share delivered to each centre), and its border is where deliveries stop, drawn as hairlines. Centres arise where surplus is concentrated and hemmed in (circumscription: Carneiro 1970, from memory). Polities grow along cheap links and split along dear ones when a harvest fails. Cohesion rises on frontiers, with other polities or with herders (the horse's reach), and decays in cores (after Turchin's metaethnic frontiers and Turchin et al. 2013's grid model of the Old World's states, from memory). Polities hold the stores and the works.
- **Conflict as fluxes** (speculation): war and conquest where cohesion and numbers press across a border (cells change hands; people and works are lost), rebellion where a centre takes more than it returns, insurgency where a core's cohesion has fallen. Each consumes people, output and works. There are no units: fronts are gradients.
- **Regional economies after industry.** The world economy splits into polities' economies, each its output, capital, energy and compute summed over its cells, trading goods and energy along the routes. Compute then has a place, and so does the takeoff.
- **Alignment from the race** (speculation, said so on the page). The alignment draw's odds come from the takeoff's state: how many polities race, how fast, and the share of compute spent on alignment. A pause becomes something polities agree to or don't.
- **Claims on the machines** (speculation): the distribution of claims on food, energy and the machines' output, carried through each ending to decide who can return and who is housed.

### Batch 3: the game

- **A third scenario** beside World and People, the only one with controls. The other two keep the dial alone.
- **The frame** (themed after Scott Alexander's "The Goddess of Everything Else", 2015, from memory; none of its text is used). The model is the drive to multiply and consume, and the player never opposes it, only bends it. The score is the effective number of kinds the drive hasn't flattened (a Hill number over lineages, crops, polities, cities, works, worlds and stars). A star the probes reach could seed the next run.
- **Standing rules.** The player composes rules from words that are objects in the world (after Baba Is You's rules as blocks). A rule pairs a trigger on a quantity with an action on a flow; it then runs unattended, and its consequences pile up where they fall. Revisions are scarce. Rules are ideas: each must spread by culture's copying and take root, held by a polity or its works, before it acts. Its forms open with the eras: prophecies, commandments, edicts, constitutions, manifestoes.
- **The race** as its last act: the takeoff's century played among batch 2's polities, each choosing pace against care, with the alignment hazard reading the race. A treaty costs its signers.
- **Needs**: saves (snapshots of the engine's and the people's workers), and, for revisions or rewinds, repeatability (the GPU plate step isn't repeatable, below).

### Pitched, not batched

From the same brainstorm, for later: languages as fast lineages and place names laid down in layers; crowd diseases and the meeting of long-parted worlds (Miasma's SEIR); ruins the planet buries, scours and subducts; a census at a point; one cohort's life at the slow dial; an ancestry traced back to the first hominins by the coalescent; a Histomap of polities; a tune carried across the sea; the Silurian epilogue (the planet run on after the ending, keeping what it keeps); a second rise on a planet whose coal is spent; letters from settled stars; worlds unlike this one (spin, tilt, no Moon, tidal locking); life's deep history; and other games: a promise between two basins (Codex's pick), landfall on a star's world, predicting a planet's farming, puzzles on seeds.

### Open in the model as it stands

- **People on Earth** (`people.md` "On Earth"): Asia's paddies (wet rice beyond the floodplains, terraced and canal-fed, the densest pre-industrial farming); Eurasia's head start in large domesticates (the plough, manure, traction; the Americas farm like Eurasia once Bering lets culture through); industry-era migration (the Americas and Australia filled by ships, not by diffusion); and, first, the climate's monsoon and tropical rain, which set most of what's left.
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
- **Not built**: the Storm track, Spin, Tilt and Supercontinent experiments; floodplain lakes and backflow; an Equal Earth view; a spindle diagram of the lineages; moving sea ice (built once and dropped: at 220 km its drift didn't move the ice edge).
- **Risks**: the weather–climate seam; the supercontinent cycle may not cycle; show-don't-tell under nine layers; tuning drift.
