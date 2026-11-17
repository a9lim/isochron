# Plates, crust and the sea

`Tectonics` (`src/engine/plates.js`, constants `PARAMS`), isostasy and sea level (`src/engine/crust.js`), plumes (`src/engine/plumes.js`), the reversal record (`src/engine/polarity.js`). The plates' step also runs on the engine's GPU (`src/gpu/plates.js`; see `engine.md`).

## Frames and the step

- **Frames.** Each plate keeps its crust in its own frame on a full copy of the grid (mask, thickness, felsic fraction, formation and suture time). World cell i reads plate k at Qₖ⁻¹xᵢ, so motion is exact; nothing is resampled except at merges.
- **Frame extras** (`FRAME_EXTRA`): the regolith (`reg`), the crust flexure's correction and the column mass it last saw (`cf`, `mq`), the cell's lowest land below its mean (`gz`, Earth's from the bake, else 0; read by `channel`), and the sea's channel through it below its mean (`gs`, Earth's from the bake's reach, then the scour; read by `seaChannel`). They travel with the crust (`copyCell`); new crust takes `freshExtras`. The GPU step's edits name each relaxed cell's source, and the CPU carries the extras.
- **The step.** Each world cell tests the plates that held it or a neighbour: none → new ocean crust for the plate that left; one → that plate; several → the most buoyant on top, the others consumed only where the plates close (`CLOSING`), else hidden (transform rounding).
- **Consumption.** Sinking ocean leaves slab memory, inherited along a migrating trench and decaying over `SLAB_TAU` (15 Myr), and builds arc crust on the overriding plate. Continent against continent stacks crust, marks a suture, resists, and counts toward a merge.
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
- **Genesis** (`src/engine/genesis.js`): the largest continents seed plates at their centres, ocean seeds fill the rest, and plates grow faster over continental crust, so boundaries meet at sea and continents start with passive margins.

## Crust, isostasy and the sea

- **Isostasy** (`crust.js`): columns are Airy-compensated; seafloor subsides by GDH1's shape; the crust flexure's correction (`surface.md`) is added to the elevation.
- **The ocean** (`seaMask`, `solveSea`; synthesis): the cells below sea level that the open sea reaches. Cells join on their channel (`seaChannel`: the mean less `gs`, a strait narrower than a cell), and a cell of the ocean stays joined while its channel stands within `SEA.STRAIT` (25 m) above the sea; their wet area is the mean's, so a strait cell can stand dry and still join its seas. A body of at least `SEA.OCEAN_MIN` (2% of the sphere), the largest, or one at least `SEA.TRAPPED` (half) floored by oceanic crust is ocean; the rest are basins, land to every layer, holding lakes or lying dry.
- **The straits' scour** (`scour`, after each plate step; speculation): a cell of the ocean whose ring of neighbours holds the water in two or more separate runs is a strait, and its channel cuts down at `SCOUR` (0.4 km/Myr) × e^{−d/`SCOUR_D`}, d its depth below the sea (25 m e-fold; the full rate at or above it), so it holds open against slower uplift and closes under faster (the Messinian). Every channel fills back toward its cell's mean over `FILL` (30 Myr), to at most `CHANNEL_MAX` (0.6 km).
- **Sea level** holds the sea's water (less the ice's and the lakes': `seaWater`) over the ocean alone, by Newton with the basins excluded. Where the level covers a basin's sill the sea floods it (its lakes going back to the sea) and the level is solved again. A basin the sea leaves keeps its water (`cutWater`) for the lakes. The GPU step's level fills every basin; the CPU then solves the ocean's (~3 ms at level 7). Tested in `tests/sea.test.mjs`.
- **Water** (`WATER_TAU`, 150 Myr): the ocean's volume drifts toward the land fraction set at genesis, standing for degassing and subduction of water.
- **Outgassing's measure** (`tec.kinematics`): crust opened at ridges and closed at trenches from the plates' motion across each boundary.

## Plumes and the record

- **Hotspots** (`Plumes`): ten fixed in the mantle build seamount chains and swells (`tec.swell`). Plume heads arrive as a Poisson process (~30 Myr): a flood basalt ~1,100 km across within 1 Myr, 8,000 Pg of carbon, a new hotspot, and under a large continent a rift through the plume (`tec.rift`).
- **Polarity** (`polarity.js`): seeded reversals and their running integral for the stripes; Earth's are GTS2012's (`gpts.js`).

## Levels

PARAMS are tuned at level 6. Slab pull and resistance need no scaling with the cell (each trench cell pulls by its length); ridge push scales res^0.2. Level 7 runs within ~4% of level 6's speeds. Seeded planets (100 Myr after spin-up, level 6): rms 4.4–4.6 cm/yr, oceans 65–67 Myr old, land 27%, the sea swinging 300–400 m with the ocean's age; continental area shrinks 1–3 points per 100 Myr to collisions' stacking.
