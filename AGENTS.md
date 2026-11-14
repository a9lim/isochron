# Isochron

An Earth-like planet on one globe, from plate tectonics down to weather, with every layer coupled to the others. `docs/PLAN.md` is the plan of record: the thesis (one planet, one state, one dial), the nine layers, their couplings, the scene, the figures, the experiments and the phases. This file describes the code as it is.

It is a submodule of the a9l.im repository at `projects/isochron` (github.com/a9lim/isochron). It isn't registered on the site yet: the stager's and font subsetter's project lists, `content/projects/` and `_headers` don't name it, so no build stages it. The parent's dev server serves it. The root `AGENTS.md` covers the shared layer, the design system ("Inside the scene") and the build.

## Status

Phases 1 (the tectonic globe) and 2 (surface and climate) are built, apart from the items below.

- **Phase 1:** the grid, the clock and scheduler, plates with exact rigid motion, gaps and overlaps, slabs and arcs, collisions and merges, rifting, passive-margin subduction initiation, boundary relaxation, the torque balance, isostasy, solved sea level, the polarity record, and the WebGPU globe with stripes, ridge axes, hillshade, coastline and contours. Plate boundaries are traced into smooth, classified lines and drawn in tectonic-map symbols.
- **Phase 2:** the landscape (routing, stream power, sediment, crustal diffusion), the seasonal energy-balance model, the circulation template, moisture and rain, the soft Köppen zones, the Climate view, the margin's figures (zonal means, hypsometry, polarity) and the zones' key. The dial runs from 1 yr/s to 10 Myr/s; below a few years a second the globe shows the season.
- **Not built:** hotspots and large igneous provinces, rifting through a plume, the engine in a worker, level 7.

## Running and checking

Serve from the parent root with `node docs/sim-overhaul/serve.mjs 8790` (the parent `.claude/launch.json` calls it "sims") and open `/isochron/`. `?seed=<string>` picks the planet. `window.__isochron` exposes `{ grid, tec, polarity, camera, scheduler, setPlaying }`.

```bash
node --test tests/                       # grid, clock, plates, landscape, climate (34 checks)
node tools/survey.mjs '{}' 600 b         # 300 Myr of plates and landscape: continents, land, sea level, erosion, speeds
node tools/climate-check.mjs earthlike   # the climate on a seeded planet: means, zonal profile, zone shares, land seasons
node tools/plates-survey.mjs '{}' 600 b  # plates alone
for f in main.js colors.js src/*.js src/*/*.js; do node --check "$f"; done
```

`window.__isochron` also exposes `land`, `climate`, `setView` and `years` (the planet's clock).

WGSL compiles only in the browser, so check the console after shader edits. Derivatives (`fwidth`) must stay in uniform control flow, which is why the fragment shader computes both sea and land and then selects.

## Layout

```
index.html            colophon, the globe's two canvases, the view picker, the figure bar (caption, dial), the margin's figures
main.js               boot (grid, genesis with a 40 Myr spin-up), drawn fields, the season, captions, figures, pointer and keys, the loop
colors.js             ink roles: ocean = prussian, land = umber; the accent is the red
styles.css            the stage, the view picker, the figure bar, the dial, the margin
docs/PLAN.md          the plan of record
src/grid/icosphere.js the geodesic grid, point location, least-squares gradient, Laplacian
src/grid/transfer.js  between nested levels: parents, prolongation, area-weighted restriction
src/clock.js          the dial's range and formatting, the Scheduler (live, summarized, banked)
src/rng.js, noise.js  seeded streams; seeded 3D gradient noise for genesis
src/engine/crust.js   isostasy, seafloor subsidence (GDH1's shape), sea level by volume
src/engine/plates.js  Tectonics: plates, the step, the torque balance, merges, rifts, initiation; PARAMS
src/engine/genesis.js the first planet: continents, plates grown around them, ages, slabs, spin-up
src/engine/polarity.js the reversal record and its running integral for the shader
src/engine/landscape.js routing (priority flood), implicit stream power, sediment, crustal diffusion; LAND
src/engine/orbit.js   daily insolation (Berger's formula), the Kepler calendar, months
src/engine/climate.js the seasonal EBM (harmonics, COCG), the circulation template, moisture by fast sweeping, soft Köppen; CLIMATE
src/render/camera.js  the orbit camera
src/render/globe.js   the WebGPU globe and its shader
src/render/lines.js   plate boundaries traced into polylines, smoothed, classified (ridge, trench, transform, inactive)
src/render/overlay.js the limb, rivers, and the boundary symbols at even screen spacing
src/render/rivers.js  drainage traced into smoothed polylines with discharge
src/render/figures.js the margin's figures and the zones' key, on 2D canvases
tests/                grid, clock, plates, landscape and climate tests (not staged)
tools/survey.mjs      long headless runs of plates and landscape
tools/climate-check.mjs  the climate of a seeded planet
tools/plates-survey.mjs  plates alone, for tuning PARAMS
```

## How the plates work

- **Plate frames.** Each plate keeps its crust in its own frame, on a full copy of the grid (mask, thickness, felsic fraction, formation time, suture time). World cell i reads plate k at Qₖ⁻¹xᵢ. Motion is exact (a full turn restores every cell), and nothing is resampled while a plate stays whole. Merges are the one resampling: one plate's cells are re-expressed in the other's frame.
- **The step.** Each world cell tests the plates that held it or a neighbour last step:
  - none covers it: new oceanic crust for the plate that left;
  - one covers it: that plate;
  - several cover it: the most buoyant stays on top. The others are consumed only if the plates are closing at that cell (`CLOSING`). An overlap where plates slide past each other is grid rounding, and the loser stays hidden. Without that rule, transforms churn crust and leave false slabs that pull along the boundary.
- **Consumption.** Ocean that goes down leaves slab memory at the cell, inherited along a migrating trench and decaying over `SLAB_TAU`, and builds arc crust on the overriding plate. Continent against continent stacks crust, marks a suture, adds collision resistance, and tallies the pair toward a merge.
- **Forces.**
  - Slab pull acts along each plate's edge only: each edge cell pulls with the longest slab of its plate within one cell. Counting the whole memory band made pull grow with speed and run away.
  - Ridge push is the gradient of subsidence within a plate's own ocean.
  - Drag is −c ∫ (1 + KEEL·φ)(I − r rᵀ) dA · ω, regularized by plate area.
  - ω relaxes toward the solved value over `V_RELAX` and is capped at `V_MAX`.
- **Starting subduction.** Old seafloor founders: at a plate's edge, any cell past `FOUNDER_AGE`; at its own continent's margin, the attached ocean breaks away as a new plate (`maybeInitiate`, at most every `INITIATE_GAP` and below `MAX_LIVE_PLATES`).
- **Plate count.** Too few plates, or one too large, splits the largest along the candidate plane that crosses the most sutures. A plate below `MICROPLATE` joins its largest neighbour.
- **Boundary relaxation.** A cell whose neighbours mostly belong to another plate passes its crust to that plate (`relaxBoundaries`, every step). Nearest-cell rounding otherwise roughens boundaries a cell at a time until they are fractal and dotted with one-cell islands. This is a numerical regularization (a curvature flow at one cell's scale): it moves crust and never makes or destroys any.
- **Genesis.** The largest continents each seed a plate at their centre, and ocean seeds fill the rest. Plates grow at their own pace, faster over continental crust, so boundaries meet at sea and continents start as passengers with passive margins.

## How the landscape works

`Landscape` (`src/engine/landscape.js`) steps after every plate step, on the same crust.
- **Routing.** Cells below sea level are outlets. A priority flood fills depressions (lakes) with a small rise so flats still drain, and each cell drains to its steepest neighbour on the filled surface. The flood's pop order is a topological order, so accumulation and the solver are single passes.
- **Erosion.** Stream power with n = 1, dz/dt = −K Qᵐ S, solved implicitly from the outlets upstream (Braun and Willett's scheme), so any step is stable. Q is drainage area weighted by the climate's runoff. Rock removed lowers the surface by only (1 − ρ_crust/ρ_mantle) of its thickness, because the crust rebounds, so erosion takes thickness (`f` in the code is that factor).
- **Sediment** goes downstream with the water. Lakes keep what fits; at the coast it builds a shelf to `SHELF` below sea level and then moves to the deepest neighbouring sea. Deposits mix felsic material into the crust, so a thick enough delta turns oceanic crust continental.
- **Diffusion.** Continental thickness diffuses between continental cells, faster under thick crust (hillslopes and small rivers below the grid's scale, and the collapse of orogens). It replaces phase 1's non-conservative relaxation of thick crust: erosion, sediment and diffusion move crust and never make or destroy it (tested).
- **Water.** Sediment fills basins and fast spreading makes young, shallow seafloor, and both raise the sea. Over `WATER_TAU` (150 Myr) the ocean's volume drifts toward the land fraction set at genesis, a stand-in for the water ridges degas and trenches subduct. Earth's freeboard has held for billions of years by a mechanism still debated. High stands from fast spreading still happen on shorter timescales (seed `c` drowns to 18% land and recovers).

## How the climate works

`Climate` (`src/engine/climate.js`) is a diagnostic of the geography, recomputed in cycles: the energy balance, then winds and rain at six points of the year, then the zones. `work(ms)` advances a cycle for a time budget (a generator yields between stages), so the page spends 5 ms a frame on it and the climate relaxes toward the current geography; a cycle takes ~190 ms warm, ~700 ms cold. `solve(n)` runs whole cycles headless.
- **Energy balance** (standard), on the level below the surface's (220 km cells), with `transfer.js` restricting forcing down and prolonging temperature up: C ∂T/∂t = S(1 − α) − (A + BT) + 5.35 ln(CO₂/CO₂₀) + ∇·D∇T, solved as the annual mean and two harmonics, each by complex-symmetric conjugate gradients (COCG), warm-started. T is the sea-level temperature; the surface is colder by 6.5 K/km. Albedo depends on the temperature through the year (snow below +1 °C on land, sea ice below −1.5 °C), so absorbed sunlight is re-sampled at 24 points of the year from the last solution: a fixed point, which keeps the ice–albedo feedback and its hysteresis. The seasonal harmonics use a smaller diffusivity (`D_SEASON`) than the mean (`D`): with one diffusivity, continents smaller than ~5,000 km get the ocean's seasons, a known weakness of diffusive EBMs.
- **Circulation** (synthesis): a template. The ITCZ is the warmest latitude in each 10° sector of longitude (penalized away from the equator), the Hadley edge scales as √ΔT/Ω (Held and Hou), and surface pressure is a sum of the ITCZ's trough, the subtropical highs, the subpolar lows and the polar highs, plus −0.75 hPa per kelvin of each place's departure from its latitude's mean (smoothed): thermal lows over hot land, highs over cold land. The wind solves r u + f k×u = −∇p/ρ.
- **Moisture** (synthesis): column water W, steady, ∇·(uW) − ∇·(κ∇W) = E − P, upwinded, solved by Gauss–Seidel in four sweep orders (longitude and latitude, both ways), each cell's nonlinear balance by Newton. The carrying wind takes the geostrophic part and 40% of the frictional drift (the drift is shallower than the moist layer). Evaporation pulls W toward saturation (Clausius–Clapeyron), weaker over land, by wetness. Rain is (W_s/60) e^{15.6(r − 0.603)} mm/day at column humidity r (the shape of Bretherton and others' fit; constants from memory, unchecked), plus lifting up slopes, plus a light background suppressed where the air sinks. Rain shadows come from air that has already rained out.
- **Zones** (synthesis): monthly temperature and rain from the harmonics; Köppen's thresholds (Peel and others' version, from memory) as logistics (1.5 K, and 0.25 in log rain), giving a probability over 14 classes. Runoff (rain less evaporation, Budyko's curve) goes back to the landscape.
- **Feedbacks:** zones set land albedo (deserts brighter, forests darker); runoff sets erosion.

## Drawing the climate

- **Relief view.** Snow and sea ice are the paper (sea ice with a sparse stipple), lakes are water where their inflow beats ~1 m/yr of evaporation, and rivers above 1,500 m³/s and three cells long are drawn in the sea's ink, their weight the discharge.
- **Climate view.** Land is a mosaic of tesserae fixed to the globe (a jittered 3D lattice, snapped to octaves of zoom). Each takes one class with probability ∝ p², so ecotones interleave and the logistic tails don't speckle. Each class is its group's ink in its second letter's screen-space pattern (`zoneColor` in the shader and `zonePattern` in `figures.js` must match). A, C and D also step in value, so the groups part in grayscale. The sea is a plain wash, and the tectonic symbols are hidden.
- **The season.** Below ~4 yr/s the globe shows snow and ice at the planet's clock (`years`; the plates still step in banked half-Myr); above ~40 yr/s, the share of the year under them; between, a blend. The caption names the month below 300 yr/s.

## Drawing the boundaries

`traceBoundaries` (`src/render/lines.js`) walks the Voronoi edges between plates into polylines that run between triple junctions; each polyline separates one pair of plates. It smooths each line on the sphere (three Laplacian passes, then two rounds of Chaikin corner-cutting, junctions fixed). Every point is classified from the two plates' rotations there: the relative velocity across the line against the velocity along it, averaged along the line, so a boundary reads in long runs. Each point also keeps which side stays on top and whether the sinking side is ocean. The overlay places symbols at even spacing on screen, following geologic-map convention:
- trenches: a rule with sawteeth on the overriding plate, and red arc marks on that side where ocean sinks;
- ridges: a red rule, with the globe tinting crust younger than 1 Myr;
- transforms: a lighter rule with paired half-arrows for the sense of slip;
- inactive boundaries: a dotted rule.

Lines are retraced after each plate step (~6 ms) and reprojected each frame.

## Open work

- **Tuning.** With the landscape and the water buffer, land holds 24–29% on the default seed and seed `b` over 300 Myr; seed `c` has a high stand to 18%. `PARAMS` still need a survey against Earth-like targets: seed `c` keeps one plate at `V_MAX` for long stretches, and mean ocean depth is 5.3 km (Earth's is 3.7) because isostasy here ignores the water's load and the lithosphere's roots. The climate is tuned on the default seed (`tools/climate-check.mjs`): mean 13–14 °C, ~1,000 mm/yr of rain, zone shares near Earth's but short of D (continental) climates.
- **Speed.** A step is ~5 ms at level 6. The engine should move to a worker before level 7.
- **Drawing.** Coastlines still show the hexagons at close zoom: the drawn relief is eased once, and level 7 would halve the step. In the dark theme the land takes more ink (`palette().tint`) so it stays lighter than the sea.
