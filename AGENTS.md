# Isochron

An Earth-like planet on one globe, from plate tectonics down to weather, with every layer coupled to the others. `docs/PLAN.md` is the plan of record: the thesis (one planet, one state, one dial), the nine layers, their couplings, the scene, the figures, the experiments and the phases. This file describes the code as it is.

It is a submodule of the a9l.im repository at `projects/isochron` (github.com/a9lim/isochron). It isn't registered on the site yet (the build requires a social card for a registered project; `docs/LOG.md` has the checklist), so no build stages it. The parent's dev server serves it. The root `AGENTS.md` covers the shared layer, the design system ("Inside the scene") and the build.

## Status

Phases 1 (the tectonic globe), 2 (surface and climate), 3 (ice and carbon) and 4 (ocean and weather) are built, and phase 5 (the harmony) in part, apart from the items below.

- **Phase 1:** the grid, the clock and scheduler, plates with exact rigid motion, gaps and overlaps, slabs and arcs, collisions and merges, rifting, passive-margin subduction initiation, boundary relaxation, the torque balance, isostasy, solved sea level, the polarity record, and the WebGPU globe with stripes, ridge axes, hillshade, coastline and contours. Plate boundaries are traced into smooth, classified lines and drawn in tectonic-map symbols.
- **Phase 2:** the landscape (routing, stream power, sediment, crustal diffusion), the seasonal energy-balance model, the circulation template, moisture and rain, the soft Köppen zones, the Climate view, the margin's figures (zonal means, hypsometry, polarity) and the zones' key. The dial runs from 1 yr/s to 10 Myr/s; below a few years a second the globe shows the season.
- **Phase 3:** the orbit's seeded cycles (averaged over what the dial passes in ~2 s), ice sheets (shallow ice, degree-day mass balance, the bed's load, the sea's loss), the carbon thermostat, hotspots and large igneous provinces (with rifting through a plume head), Figs. 2 (the record) and 3 (the orbit), and the Experiments tab: Earth-like, Snowball, Ice ages, High stand, Thermostat, each with one knob in the figure bar and its number in the caption.
- **Phase 4:** the wind-driven ocean (Stommel's gyres, surface currents, SST anomalies with upwelling) feeding evaporation and rain; the two-layer QG weather on the 220 km grid with surface temperature and moisture tracers; the Weather view as a synoptic chart (isobars, rain stipple, fronts, dry lines, highs and lows), crossfading to the climate's mean chart when the dial outruns it. The dial reaches 2.8 h/s.
- **Phase 5:** Fig. 7, the model diagram, on its own margin tab: every layer a node with its live value, every coupling the code has an arrow weighted by its flux (the weather's feedback to the climate isn't built, so it has no arrow).
- **Not built:** the engine in a worker, level 7; the Storm track, Spin, Tilt and Supercontinent experiments; Japanese; the social card and registration on the site (they go together: see `docs/LOG.md`, "Registering on the site").

## Running and checking

Serve from the parent root with `node docs/sim-overhaul/serve.mjs 8790` (the parent `.claude/launch.json` calls it "sims") and open `/isochron/`. `?seed=<string>` picks the planet. `window.__isochron` exposes `{ grid, tec, polarity, camera, scheduler, setPlaying }`.

```bash
node --test tests/                       # grid, clock, plates, landscape, climate, ice, carbon, ocean, weather (38 checks)
node tools/planet-run.mjs earthlike 600 1000 10 '{"CARBON":{"FIXED":220}}'   # the coupled planet: 600 kyr of ice ages
node tools/ice-check.mjs earthlike 80     # ice grown under the climate and orbit
node tools/survey.mjs '{}' 600 b         # 300 Myr of plates and landscape: continents, land, sea level, erosion, speeds
node tools/climate-check.mjs earthlike   # the climate on a seeded planet: means, zonal profile, zone shares, land seasons
node tools/plates-survey.mjs '{}' 600 b  # plates alone
for f in main.js colors.js src/*.js src/*/*.js; do node --check "$f"; done
```

`window.__isochron` exposes `{ P, grid, tec, land, climate, ice, carbon, plumes, polarity, camera, scheduler, setPlaying, setView, setExperiment }`; `P.years` is the planet's clock. `?exp=snowball` (or `iceages`, `highstand`, `thermostat`) opens an experiment.

WGSL compiles only in the browser, so check the console after shader edits. Derivatives (`fwidth`) must stay in uniform control flow, which is why the fragment shader computes both sea and land and then selects.

## Layout

```
index.html            colophon, the globe's two canvases, the view picker, the figure bar (caption, dial), the margin's figures
main.js               the page: drawn fields, the season, experiments and the knob, captions, figures, pointer and keys, the loop
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
src/engine/ice.js     ice sheets: shallow ice, degree days, the bed's load, calving; ICE
src/engine/carbon.js  the long carbon cycle: outgassing against weathering; CARBON
src/engine/plumes.js  hotspots, swells, large igneous provinces; PLUMES
src/engine/ocean.js   Stommel's gyres (BiCGSTAB), surface currents, the SST anomaly; OCEAN
src/engine/weather.js two-layer QG on the coarse grid, θ and moisture tracers; WEATHER
src/engine/planet.js  every layer on one grid and how they step together; the multi-resolution record
src/render/camera.js  the orbit camera
src/render/globe.js   the WebGPU globe and its shader
src/render/lines.js   plate boundaries traced into polylines, smoothed, classified (ridge, trench, transform, inactive)
src/render/overlay.js the limb, rivers, and the boundary symbols at even screen spacing
src/render/rivers.js  drainage traced into smoothed polylines with discharge
src/render/figures.js the margin's figures and the zones' key, on 2D canvases
src/render/chart.js   the synoptic chart: fronts (Hewson's TFP), dry lines, highs and lows, traced and drawn
tests/                grid, clock, plates, landscape and climate tests (not staged)
tools/survey.mjs      long headless runs of plates and landscape
tools/climate-check.mjs  the climate of a seeded planet
tools/ice-check.mjs   ice under a fixed climate and the orbit
tools/planet-run.mjs  the coupled planet, headless
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

## How ice and carbon work

`Planet` (`src/engine/planet.js`) steps the layers together: plates, plumes and the landscape per half-Myr plate step; carbon and ice every frame; the climate's cycles in the background, each completed one refreshing weathering's map (`carbon.measure`) and, through the climate's version, the ice's mass balance.
- **The orbit** (`OrbitCycles`): eccentricity near 405, 124 and 95 kyr, obliquity near 41 and 54 kyr, precession near 22 kyr, seeded around Earth's values (from memory). The climate sees each term scaled by sinc(W/P) for a window W of what the dial passes in ~2 s, so at plate speed it sees the mean orbit and at kyr/s the cycles whole. The insolation table is rebuilt when the orbit changes.
- **Ice** (`Ice`): thickness on the surface grid, in the mantle's frame. The flux is the shallow-ice approximation's, −Γ H⁵ |∇s|² ∇s, explicit with the step its stability allows (~25 yr at 110 km); `advance(years, ms)` steps within a real-time budget and drops the rest, so at plate speed the ice lags the climate rather than the clock (its closure). The mass balance is snow below freezing at the ice's surface (the lapse rate makes a high sheet keep itself cold) less melt by positive degree days. The bed relaxes toward −(ρᵢ/ρₘ) H over 3 kyr (`tec.load`), ice afloat calves, and the ice's water is taken from the sea (`tec.iceWater`); the sea is re-solved when that has moved ~10 cm. The climate counts grounded ice as land, its surface as the height, and its albedo as snow's.
- **Carbon** (`Carbon`): an exogenic reservoir R (atmosphere and ocean), pCO₂ ∝ R². Outgassing scales with crust made and consumed against the rates this model's plates settle to (`RIDGE_REF`, `ARC_REF`, ~500 cells/Myr at level 6), plus provinces' pulses. Weathering is the climate's map (runoff^0.65 × e^{(T − 15)/Tₑ} × fresh-rock supply, summed over ice-free land), times the response to CO₂ since the climate last solved (the sensitivity through Tₑ, and pCO₂^0.3 directly). Implicit in R, substeps of 20 kyr; `equilibrium(V)` is the analytic balance (tested).
- **Plumes** (`Plumes`): ten hotspots fixed in the mantle build crust on whatever passes (seamount chains) and lift swells (`tec.swell`). Plume heads arrive as a Poisson process (every ~30 Myr): a flood of basalt over a disc ~1,100 km across within 1 Myr, 8,000 Pg of carbon, a new hotspot, and, under a large continent, a rift through the plume (`tec.rift(k, point)`).

## How the ocean and the weather work

- **Gyres** (`Ocean`): the depth-integrated flow under the annual-mean wind stress, steady, Stommel's form on the unit sphere, ε∇²ψ + ∂ψ/∂λ = a² curl τ/(2Ωρ₀), coasts at ψ = 0 (islands too), ε set for a two-cell western boundary layer. BiCGSTAB with a Jacobi preconditioner, warm-started, 120 iterations a cycle and the gyres only every third climate cycle (the basins change slowly). Surface currents u = k × ∇ψ/H (H = 400 m). The SST anomaly T′ solves upwinded u·∇(T + T′) + λT′ = κ∇²T′ + upwelling, where upwelling cools coasts the Ekman drift leaves. Moisture uses the SST (T + T′) for the sea's saturation. Tested against Sverdrup's interior and the western boundary current in a box basin.
- **Weather** (`Weather`): two-layer QG on the climate's coarse grid (220 km), L_d = 800 km. PV is carried by fluxes that are differences of ψ at Voronoi corners (exactly non-divergent), 20% upwinded, with ∇⁴ hyperviscosity; Adams–Bashforth 2 at 20 minutes (30 minutes blew up with 80 m/s jets aloft). Inversion each step: barotropic Poisson and baroclinic Helmholtz by Jacobi-PCG, warm-started. Forcing: the baroclinic ψ relaxes over 15 days toward SHEAR · (f/f₀) · (T − T̄) from the climate's temperature at the season; Ekman friction on the lower layer; damping in the tropics. Tracers on the lower layer: θ relaxed to the climate's over 5 days, and moisture from the sea, raining past 90% of saturation. ~8 ms a step in the browser, so live up to ~1 day/s. Tested: storms grow above Phillips' criterion and die below.
- **The chart** (`chart.js`, `refreshWeather` in `main.js`): sea-level pressure is the climate's template at the season plus the storms (ρfψ₂ less its zonal mean), smoothed, drawn as isobars at whole hPa (every 4, heavier every 20); rain as stipple. Fronts are the zero of ∇TFP·n̂ on θ where |∇θ| and TFP are in their upper ranges, traced on triangles, chained, smoothed, typed by v·n̂ (cold, warm, stationary). Dry lines are the same on moisture over land where θ's gradient is weak. The weather runs only in its view, waits for a warm climate, spins up ~12 days, and crossfades to the climate's mean between ~3 and ~30 days a second.

## The experiments

Each starts from the planet's opening (choosing one reloads with `?exp=`), sets the dial and the view, and has one knob; the caption carries its measured number.
- **Earth-like**: the opening.
- **Snowball**: sunlight (82–106%), CO₂ held at its value when chosen; the ice line. At 88% the planet freezes to the equator, and turning the sun back up doesn't thaw it at once (the ice–albedo hysteresis).
- **Ice ages**: CO₂ held (150–450 ppm), 10 kyr/s; the ice's volume and its dominant period (periodogram of the record over 400 kyr).
- **High stand**: mantle heat (scales slab pull, ridge push and the speed cap); sea level and land.
- **Thermostat**: outgassing (0.25–4×); CO₂ against its analytic balance.

## Drawing the climate

- **Relief view.** Snow and sea ice are the paper (sea ice with a sparse stipple), ice sheets the paper with hachures along their flow (closer where faster), lakes are water where their inflow beats ~1 m/yr of evaporation, and rivers above 1,500 m³/s and three cells long are drawn in the sea's ink, their weight the discharge. Hotspots are red ringed points and an erupting province a red stippled disc.
- **Weather view.** Pale land, the paper for sea, isobars, rain stipple; cold fronts are prussian with triangles toward the warm air, warm fronts sienna with semicircles toward the cold, stationary fronts alternate, dry lines are ochre with open scallops toward the moist air, and H and L mark the highs and lows.
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
