# Plates, crust and the sea

`Tectonics` (`src/engine/plates.js`, constants `PARAMS`), isostasy and sea level (`src/engine/crust.js`), plumes (`src/engine/plumes.js`), the reversal record (`src/engine/polarity.js`). The plates' step also runs on the engine's GPU (`src/gpu/plates.js`; see `engine.md`).

## Frames and the step

- **Frames.** Each plate keeps its crust in its own frame on a full copy of the grid (mask, thickness, felsic fraction, formation and suture time). World cell i reads plate k at Qₖ⁻¹xᵢ, so motion is exact; nothing is resampled except at merges.
- **Frame extras** (`FRAME_EXTRA`): the regolith (`reg`), the crust flexure's correction and the column mass it last saw (`cf`, `mq`), the cell's lowest land below its mean (`gz`, Earth's from the bake, else 0; read by `channel`), and the sea's channel through it below its mean (`gs`, Earth's from the bake's reach, then the scour; read by `seaChannel`). They travel with the crust (`copyCell`); new crust takes `freshExtras`. The GPU step's edits name each relaxed cell's source, and the CPU carries the extras.
- **The step.** Each world cell tests the plates that held it or a neighbour: none → new ocean crust for the plate that left; one → that plate; several → the most buoyant on top, the others consumed only where the plates close (`CLOSING`), else hidden (transform rounding).
- **Consumption.** Sinking ocean leaves slab memory, inherited along a migrating trench and decaying over `SLAB_TAU` (15 Myr), and builds arc crust on the overriding plate. Continent against continent stacks `COLLIDE_FRAC` (0.85) of the consumed crust on the top plate's front cell (to `H_STACK`, a bound), marks a suture, resists, and counts toward a merge; the rest sinks.

## The crust's deformation

Past the rigid step (`deform`, after relaxation and the sampling, on the CPU in both paths; synthesis), three rules that move crust and make none, felsic share mixing by volume. The GPU's frames hear of the cells they change at once (`dirty.cells`).
- **Rifted margins.** Where a gap opens beside its plate's continental crust thicker than `H_BREAK` (10 km) and the plates part across it (`opening`: their motion opens the boundary by more than `CLOSING` of its speed, so a transform's rounding isn't a rift), `STRETCH` (0.3) of that crust stretches into the new cell instead of new ocean: the margin thins and widens, a slope between shelf and ocean. Continents gain area as they rift, as stacking takes it.
- **The wedge.** From each cell stacked this step (its suture time the step's), crust thicker than its plate's neighbour by more than `TAPER` (0.12 km a km, ~1.6 km of relief per 100 km) passes to it until the step stands at the taper, and on from every cell that took some, a sandpile at rest: the upper plate thickens behind its front, so an orogen widens as it grows instead of standing as a wall a cell wide between two drowned margins.
- **The plateau.** Crust past `H_PLATEAU` (60 km: Tibet's in the sim's isostasy, `earth.js`) passes its excess to its plate's neighbours by their room below it: the plateau widens rather than rises.

With rifts' stretching and the collisions' share, seeded planets keep their continental crust at ~40–42% of the sphere over 200 Myr (it fell 3–4 points per 100 Myr before).
- **Order.** Cells are visited in index order: a slab inherits a neighbour's slab grown this step, a consumed frame cell is gone for later cells, a founder blocks its later neighbours. Level 7's fit depends on it; the GPU reproduces it.

## Forces

- **Slab pull** acts along each plate's edge: each edge cell pulls with the longest slab of its plate within one cell, down-dip across the trench toward the top plate (standard). A slab hangs only where plates close by `SLAB_CLOSING` (0.6) of their relative motion, only on ocean.
- **Slab resistance** (`K_TRENCH`, along the pull, as long as the slab; Forsyth and Uyeda's, the form synthesis): a slab-driven plate moves near `K_SLAB`/`K_TRENCH` (12.7 cm/yr at full age) whatever its size.
- **Ridge push** is the gradient of subsidence within a plate's own ocean (scaled res^0.2 with the cell).
- **Drag** −c ∫ (1 + KEEL·φ)(I − r rᵀ) dA · ω. ω relaxes toward the solved value over `V_RELAX`, capped at `V_MAX` (20 cm/yr).

## Plate count and shape

- **Initiation.** Old seafloor founders at a plate's edge past `FOUNDER_AGE`; at a continent's margin the attached ocean breaks away as a new plate (`maybeInitiate`, at most every `INITIATE_GAP`, below `MAX_LIVE_PLATES`).
- **Splits and joins.** Too few plates, or one over `MAX_PLATE_AREA` (a quarter of the sphere), splits the largest along the plane crossing most sutures; a plate below `MICROPLATE` joins its largest neighbour.
- **Relaxation** (`relaxBoundaries`, every step): a cell mostly surrounded by another plate passes its crust to it, a curvature flow at one cell's scale that keeps boundaries smooth; it moves crust and makes none.
- **One body** (`resolveFragments`, every `FRAGMENTS` 0.5 Myr): each plate keeps its largest piece; another piece of at least `MICROPLATE` becomes a plate, else joins the plate it borders most.
- **Substeps.** A step whose fastest plate would move more than `STEP_CELLS` (1) cell runs as substeps, since a cell finds its plates only among its neighbours' (`step`, `stepAsync`).
- **Genesis** (`src/engine/genesis.js`): continents are thresholded noise over 40% of the sphere, Earth's share; the largest seed plates at their centres, ocean seeds fill the rest, and plates grow faster over continental crust, so boundaries meet at sea and continents start with passive margins. 80 Myr of spin-up follow (`Planet`).
- **Continents as Earth's** (`continentalCrust`, synthesis): `EARTH_CRUST` holds today's Earth's continental crust as the sim stands it (`earth.js`'s fit, the ice's load off), by distance from the ocean: six bands' quantiles of elevation over a new ridge, and the distance at each twentieth of the crust's area (written by `tools/earth/crust-table.mjs`). Each continental cell's distance is mapped onto Earth's by area rank, and within each band the cells take Earth's quantiles in the order of a score, each its thickness the sim's isostasy stands there. At genesis the score is the seed's noise (fbm swells and basins, ridged belts for the highest); after the spin-up it is the relief the spin-up left (its orogens, rifted margins, basins), written through to the frames. So a seeded planet opens with Earth's margins, platforms and share of mountains, in its own order.
- **The sea at Earth's freeboard** (`FREEBOARD`, 2.5 km, `crust.js`): the water fills the sea to that height over a new ridge, at genesis and after the spin-up; the land fraction is what the continents then show (~27–28%), and the water's drift holds it.

## Crust, isostasy and the sea

- **Isostasy** (`crust.js`): columns are Airy-compensated; seafloor subsides by GDH1's shape; the crust flexure's correction (`surface.md`) is added to the elevation.
- **The ocean** (`seaMask`, `solveSea`; synthesis): the cells below sea level that the open sea reaches. Cells join on their channel (`seaChannel`: the mean less `gs`, a strait narrower than a cell), and a cell of the ocean stays joined while its channel stands within `SEA.STRAIT` (25 m) above the sea; their wet area is the mean's, so a strait cell can stand dry and still join its seas. A body of at least `SEA.OCEAN_MIN` (2% of the sphere), the largest, or one at least `SEA.TRAPPED` (half) floored by oceanic crust is ocean; the rest are basins, land to every layer, holding lakes or lying dry.
- **The straits' scour** (`scour`, after each plate step; speculation): a cell of the ocean whose ring of neighbours holds the water in two or more separate runs is a strait, and its channel cuts down at `SCOUR` (0.4 km/Myr) × e^{−d/`SCOUR_D`}, d its depth below the sea (25 m e-fold; the full rate at or above it), so it holds open against slower uplift and closes under faster (the Messinian). Every channel fills back toward its cell's mean over `FILL` (30 Myr), to at most `CHANNEL_MAX` (0.6 km).
- **Sea level** holds the sea's water (less the ice's and the lakes': `seaWater`) over the ocean alone, by Newton with the basins excluded. Where the level covers a basin's sill the sea floods it (its lakes going back to the sea) and the level is solved again. A basin the sea leaves keeps its water (`cutWater`) for the lakes. The GPU step's level fills every basin; the CPU then solves the ocean's (~3 ms at level 7). Tested in `tests/sea.test.mjs`.
- **Water** (`WATER_TAU`, 150 Myr): the ocean's volume drifts toward the opening's land fraction, standing for degassing and subduction of water.
- **Outgassing's measure** (`tec.kinematics`): crust opened at ridges and closed at trenches from the plates' motion across each boundary.

## Plumes and the record

- **Hotspots** (`Plumes`): ten fixed in the mantle build seamount chains and swells (`tec.swell`). Plume heads arrive as a Poisson process (~30 Myr): a flood basalt ~1,100 km across within 1 Myr, 8,000 Pg of carbon, a new hotspot, and under a large continent a rift through the plume (`tec.rift`).
- **Polarity** (`polarity.js`): seeded reversals and their running integral for the stripes; Earth's are GTS2012's (`gpts.js`).

## Levels

PARAMS are tuned at level 6. Slab pull and resistance need no scaling with the cell (each trench cell pulls by its length); ridge push scales res^0.2. Level 7 runs within ~4% of level 6's speeds. Seeded planets (100 Myr after spin-up, level 6): rms 4.1–4.7 cm/yr, oceans 55–62 Myr old, the sea swinging 300–400 m with the ocean's age.

## Hypsometry

`tools/hypsometry.mjs` measures each height's share of the sphere, against ETOPO's bed on the same grid (`etopo`), today's Earth opened and run (`earth`), or a seeded planet. Level 6, the opening (earthlike) against ETOPO: land 27.7% (27.5), its mean 0.67 km (0.63), median 0.41 (0.38), 90th percentile 1.45 (1.37), 99th 4.3 (4.6); the sea's mean depth 3.74 km (3.62). Over 200 Myr a seeded planet keeps the ocean at 3.5–3.6 km and the land's mean at ~0.7 km, its continents slowly sinking against the ridges (dry at Earth's freeboard 70% of their crust → 58%) and the water's drift lowering the sea to hold the land. Today's Earth run on flattens more (its land's mean 0.65 → 0.33 km in 200 Myr): India stops converging under the sim's balance (`earth.md`), so Tibet erodes away.
