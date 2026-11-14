# Isochron

An Earth-like planet on one globe, from plate tectonics down to weather, with every layer coupled to the others. `docs/PLAN.md` is the plan of record: the thesis (one planet, one state, one dial), the nine layers, their couplings, the scene, the figures, the experiments and the phases. This file describes the code as it is.

It is a submodule of the a9l.im repository at `projects/isochron` (github.com/a9lim/isochron). It isn't registered on the site yet (the build requires a social card for a registered project; `docs/LOG.md` has the checklist), so no build stages it. The parent's dev server serves it. The root `AGENTS.md` covers the shared layer, the design system ("Inside the scene") and the build.

## Status

Phases 1 (the tectonic globe), 2 (surface and climate), 3 (ice and carbon) and 4 (ocean and weather) are built, and phase 5 (the harmony) in part, apart from the items below.

- **Phase 1:** the grid, the clock and scheduler, plates with exact rigid motion, gaps and overlaps, slabs and arcs, collisions and merges, rifting, passive-margin subduction initiation, boundary relaxation, the torque balance, isostasy, solved sea level, the polarity record, and the WebGPU globe with stripes, ridge axes, hillshade, coastline and contours. Plate boundaries are traced into smooth, classified lines and drawn in tectonic-map symbols.
- **Phase 2:** the landscape (routing, stream power, sediment, crustal diffusion), the seasonal energy-balance model, the circulation template, moisture and rain, the soft Köppen zones, the Climate view, the margin's figures (zonal means, hypsometry, polarity) and the zones' key. The dial runs from 1 yr/s to 10 Myr/s; below a few years a second the globe shows the season.
- **Phase 3:** the orbit's seeded cycles (averaged over what the dial passes in ~2 s), ice sheets (shallow ice, degree-day mass balance, the bed's load, the sea's loss), the carbon thermostat, hotspots and large igneous provinces (with rifting through a plume head), Figs. 2 (the record) and 3 (the orbit), and the Experiments tab: Earth-like, Snowball, Ice ages, High stand, Thermostat, each with one knob in the figure bar and its number in the caption.
- **Phase 4:** the wind-driven ocean (Stommel's gyres, surface currents, SST anomalies with upwelling) feeding evaporation and rain; the two-layer QG weather (on the GPU, at 55 km) with surface temperature and moisture tracers; the Weather view as a synoptic chart (isobars, rain stipple, fronts, dry lines, highs and lows), crossfading to the climate's mean chart when the dial outruns it. The dial reaches 2.8 h/s.
- **Phase 5:** Fig. 7, the model diagram, on its own margin tab: every layer a node with its live value, every coupling the code has an arrow weighted by its flux (the weather's feedback to the climate isn't built, so it has no arrow).
- **Optimization pass (2026-11-15):** the planet runs on a worker, the weather and the season's drawing on the GPU, the chart on its own worker (see "Threads and the GPU"). The globe draws a level-7 mesh (55 km) with the engine's fields refined onto it, and the weather runs on that mesh. WebGPU is required; there is no CPU fallback.
- **Not built:** the engine's grid at level 7 (crust, landscape, climate); the Storm track, Spin, Tilt and Supercontinent experiments; the social card and registration on the site (they go together: see `docs/LOG.md`, "Registering on the site"). No Japanese (a9, 2026-11-15: only Worldline has it).

## Running and checking

Serve from the parent root with `node docs/sim-overhaul/serve.mjs 8790` (the parent `.claude/launch.json` calls it "sims") and open `/isochron/`. `?seed=<string>` picks the planet. Open `/isochron/tests/gpu.html` for the GPU's tests (multigrid convergence, PV conservation, Phillips' criterion, the step's cost; `?l6` times level 6 too); results land in `window.__results`.

```bash
node --test tests/                       # grid, clock, plates, landscape, climate, ice, carbon, ocean (the weather's are in tests/gpu.html)
node tools/planet-run.mjs earthlike 600 1000 10 '{"CARBON":{"FIXED":220}}'   # the coupled planet: 600 kyr of ice ages
node tools/ice-check.mjs earthlike 80     # ice grown under the climate and orbit
node tools/survey.mjs '{}' 600 b         # 300 Myr of plates and landscape: continents, land, sea level, erosion, speeds
node tools/climate-check.mjs earthlike   # the climate on a seeded planet: means, zonal profile, zone shares, land seasons
node tools/plates-survey.mjs '{}' 600 b  # plates alone
for f in main.js colors.js src/*.js src/*/*.js; do node --check "$f"; done
```

`window.__isochron` exposes the page's mirrors of the engine (`P, tec, land, climate, ice, carbon, plumes`), the `engine` worker, `wx`, `globe`, `chart`, `camera`, `scheduler`, `setPlaying`, `setView`, `setExperiment`, `tick(now)` (one frame, for driving a hidden tab) and `prof` (each section's share of a frame, ms); `P.years` is the planet's clock. `?exp=snowball` (or `iceages`, `highstand`, `thermostat`) opens an experiment.

WGSL compiles only in the browser, so check the console (and `tests/gpu.html`) after shader edits. Derivatives (`fwidth`) must stay in uniform control flow, which is why the fragment shader computes both sea and land and then selects.

## Layout

```
index.html            colophon, the globe's two canvases, the view picker, the figure bar (caption, dial), the margin's figures
main.js               the page: the clock and the dial, the engine's snapshots, line morphs, the weather's pacing, experiments, captions, figures, pointer and keys, the loop
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
src/engine/planet.js  every layer on one grid and how they step together
src/engine/record.js  the multi-resolution record
src/engine/worker.js  the engine's thread: steps the planet as the page's ticks ask; posts surface, climate and fast snapshots
src/engine/mirror.js  the page's view of the climate (its harmonics, zones and ocean)
src/gpu/device.js     the shared WebGPU device; kernels bound by name; buffer helpers
src/gpu/hierarchy.js  the nested grids packed for multigrid (six padded neighbours and corners per cell); the coarsest level's inverse
src/gpu/weather.js    two-layer QG on the GPU: multigrid inversion, PV and tracer transport, the globe's weather fields; WEATHER
src/gpu/season.js     snow and sea ice at the date, smoothed and eased, into the globe's climate buffer
src/gpu/refine.js     the engine's fields refined onto the drawn mesh (one step of Loop subdivision)
src/render/camera.js  the orbit camera
src/render/globe.js   the WebGPU globe and its shader, on the level-7 mesh
src/render/lines.js   plate boundaries traced into polylines, smoothed, classified (ridge, trench, transform, inactive)
src/render/overlay.js the limb, rivers, and the boundary symbols at even screen spacing
src/render/rivers.js  drainage traced into smoothed polylines with discharge
src/render/figures.js the margin's figures and the zones' key, on 2D canvases
src/render/surface.js the drawn surface from the engine's state: eased relief, normals, stripes, lakes (on the engine's worker)
src/render/chart.js   the synoptic chart: fronts (Hewson's TFP), dry lines, highs and lows, traced and drawn
src/render/chart-worker.js  the chart traced off the page's thread, from the weather as read back
src/render/key.js     the key to each view's symbols
tests/                grid, clock, plates, landscape, climate and earth-system tests; gpu.html, the weather's GPU tests (not staged)
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

`Climate` (`src/engine/climate.js`) is a diagnostic of the geography, recomputed in cycles: the energy balance, then winds and rain at six points of the year, then the zones. `work(ms)` advances a cycle for a time budget (a generator yields between stages), so the engine's worker spends the time between ticks on it and the climate relaxes toward the current geography; a cycle takes ~300 ms warm, ~700 ms cold. `solve(n)` runs whole cycles headless.
- **Energy balance** (standard), on the level below the surface's (220 km cells), with `transfer.js` restricting forcing down and prolonging temperature up: C ∂T/∂t = S(1 − α) − (A + BT) + 5.35 ln(CO₂/CO₂₀) + ∇·D∇T, solved as the annual mean and two harmonics, each by complex-symmetric conjugate gradients (COCG), warm-started. T is the sea-level temperature; the surface is colder by 6.5 K/km. Albedo depends on the temperature through the year (snow below +1 °C on land, sea ice below −1.5 °C), so absorbed sunlight is re-sampled at 24 points of the year from the last solution: a fixed point, which keeps the ice–albedo feedback and its hysteresis. The seasonal harmonics use a smaller diffusivity (`D_SEASON`) than the mean (`D`): with one diffusivity, continents smaller than ~5,000 km get the ocean's seasons, a known weakness of diffusive EBMs.
- **Circulation** (synthesis): a template. The ITCZ is the warmest latitude in each 10° sector of longitude (penalized away from the equator), the Hadley edge scales as √ΔT/Ω (Held and Hou), and surface pressure is a sum of the ITCZ's trough, the subtropical highs, the subpolar lows and the polar highs, plus −0.75 hPa per kelvin of each place's departure from its latitude's mean (smoothed): thermal lows over hot land, highs over cold land. The wind solves r u + f k×u = −∇p/ρ.
- **Moisture** (synthesis): column water W, steady, ∇·(uW) − ∇·(κ∇W) = E − P, upwinded, solved by Gauss–Seidel in four sweep orders (longitude and latitude, both ways), each cell's nonlinear balance by Newton. The carrying wind takes the geostrophic part and 40% of the frictional drift (the drift is shallower than the moist layer). Evaporation pulls W toward saturation (Clausius–Clapeyron), weaker over land, by wetness. Rain is (W_s/60) e^{15.6(r − 0.603)} mm/day at column humidity r (the shape of Bretherton and others' fit; constants from memory, unchecked), plus lifting up slopes, plus a light background suppressed where the air sinks. Rain shadows come from air that has already rained out.
- **Zones** (synthesis): monthly temperature and rain from the harmonics; Köppen's thresholds (Peel and others' version, from memory) as logistics (1.5 K, and 0.25 in log rain), giving a probability over 14 classes. Runoff (rain less evaporation, Budyko's curve) goes back to the landscape.
- **Feedbacks:** zones set land albedo (deserts brighter, forests darker); runoff sets erosion.
- **Routing roughness:** water routes over the surface plus ±25 m of roughness fixed to each plate's own cells (`LAND.ROUGH`), so flats drain in branching networks rather than straight parallel lines; erosion still uses the true surface, and a cell the roughness routes uphill doesn't cut.

## How ice and carbon work

`Planet` (`src/engine/planet.js`) steps the layers together: plates, plumes and the landscape per half-Myr plate step; carbon and ice every frame; the climate's cycles in the background, each completed one refreshing weathering's map (`carbon.measure`) and, through the climate's version, the ice's mass balance.
- **The orbit** (`OrbitCycles`): eccentricity near 405, 124 and 95 kyr, obliquity near 41 and 54 kyr, precession near 22 kyr, seeded around Earth's values (from memory). The climate sees each term scaled by sinc(W/P) for a window W of what the dial passes in ~2 s, so at plate speed it sees the mean orbit and at kyr/s the cycles whole. The insolation table is rebuilt when the orbit changes.
- **Ice** (`Ice`): thickness on the surface grid, in the mantle's frame. The flux is the shallow-ice approximation's, −Γ H⁵ |∇s|² ∇s, explicit with the step its stability allows (~25 yr at 110 km); `advance(years, ms)` steps within a real-time budget and drops the rest, so at plate speed the ice lags the climate rather than the clock (its closure). The mass balance is snow below freezing at the ice's surface (the lapse rate makes a high sheet keep itself cold) less melt by positive degree days. The bed relaxes toward −(ρᵢ/ρₘ) H over 3 kyr (`tec.load`), ice afloat calves, and the ice's water is taken from the sea (`tec.iceWater`); the sea is re-solved when that has moved ~10 cm. The climate counts grounded ice as land, its surface as the height, and its albedo as snow's.
- **Organic carbon:** burial scales with the sediment the rivers deliver to the sea, oxidation of old organic carbon with the rock they erode, each a fifth of the reference outgassing at the opening (`CARBON.ORG`).
- **Carbon** (`Carbon`): an exogenic reservoir R (atmosphere and ocean), pCO₂ ∝ R². Outgassing scales with crust made and consumed against the rates this model's plates settle to (`RIDGE_REF`, `ARC_REF`, ~500 cells/Myr at level 6), plus provinces' pulses. Weathering is the climate's map (runoff^0.65 × e^{(T − 15)/Tₑ} × fresh-rock supply, summed over ice-free land), times the response to CO₂ since the climate last solved (the sensitivity through Tₑ, and pCO₂^0.3 directly). Implicit in R, substeps of 20 kyr; `equilibrium(V)` is the analytic balance (tested).
- **Plumes** (`Plumes`): ten hotspots fixed in the mantle build crust on whatever passes (seamount chains) and lift swells (`tec.swell`). Plume heads arrive as a Poisson process (every ~30 Myr): a flood of basalt over a disc ~1,100 km across within 1 Myr, 8,000 Pg of carbon, a new hotspot, and, under a large continent, a rift through the plume (`tec.rift(k, point)`).

## How the ocean and the weather work

- **Gyres** (`Ocean`): the depth-integrated flow under the annual-mean wind stress, steady, Stommel's form on the unit sphere, ε∇²ψ + ∂ψ/∂λ = a² curl τ/(2Ωρ₀), coasts at ψ = 0 (islands too), ε set for a two-cell western boundary layer. BiCGSTAB with a Jacobi preconditioner, warm-started, 120 iterations a cycle and the gyres only every third climate cycle (the basins change slowly). Surface currents u = k × ∇ψ/H (H = 400 m). The SST anomaly T′ solves upwinded u·∇(T + T′) + λT′ = κ∇²T′ + upwelling, where upwelling cools coasts the Ekman drift leaves. Moisture uses the SST (T + T′) for the sea's saturation. Tested against Sverdrup's interior and the western boundary current in a box basin.
- **Weather** (`GpuWeather`, `src/gpu/weather.js`): two-layer QG on the GPU, on the drawn mesh (level 7, 55 km), L_d = 800 km; its forcing (the climate's temperature, the sea's, land and orography) and the climate's mean for the blend come from the engine's grid, refined onto the mesh (`refine.js`). PV is carried by fluxes that are differences of ψ at Voronoi corners (exactly non-divergent), 20% upwinded, with ∇⁴ hyperviscosity scaled with the cell's 3.2 power (with the fourth power, the finer grid's noise outgrew it). Adams–Bashforth 2 at 200 s (800 s at level 5, halving with the cell: the advective limit with the upper layer's ~115 m/s jets; 300 s blew up on day 1). The upper layer starts with half the climate's shear and the forcing builds the rest: starting with all of it, storms grew explosively and the transient's jets (~110 m/s on day 3) sat at the step's limit and sometimes passed it; now winds climb to ~50–65 m/s with no spike. The lower layer's state is q₂ less its orography, whose PV is carried alongside, so the ground can change under the weather. Inversion each step: the barotropic Poisson and baroclinic Helmholtz solves at once (a vec2) by two V-cycles of multigrid on levels 7 down to 2 (`src/gpu/hierarchy.js`: weighted Jacobi, two sweeps each way; restriction gathers a coarse cell's six midpoints; prolongation averages a midpoint's two parents; level 2 solved exactly by a precomputed inverse), warm-started. Each cycle cuts the error tenfold. The barotropic solve screens at 1/k₀ ≈ 32,000 km, which fixes ψ's constant (a ~2% touch on the largest waves). Forcing: the baroclinic ψ relaxes over 15 days toward SHEAR · (f/f₀) · (T − T̄) from the climate's temperature at the season; Ekman friction on the lower layer; damping in the tropics in flux form, so PV's integral is conserved (to 1e-8 over 10 days). Tracers on the lower layer: θ relaxed to the climate's over 5 days, and moisture from the sea, raining past 90% of saturation. 66 dispatches and ~0.55 ms of GPU a step on an M5 Max (timestamps), ~240 ms a model day; the page gives it 12 ms of each frame, so it runs live to ~3 days a second. A kernel writes the globe's weather fields (eddy pressure over the template, its zonal mean interpolated between 3° bands, rain, temperature, humidity, blended with the climate's mean) into the mesh's vertex buffer each frame. Tested on the device (`tests/gpu.html`): storms grow above Phillips' criterion and die below; PV is conserved; multigrid converges.
- **The chart** (`chart.js`, traced in `chart-worker.js` from the weather read back every ~120 ms and restricted to the engine's grid: tracing on the 55 km mesh cost ~650 ms a chart against ~100): sea-level pressure is the climate's template at the season plus the storms (ρfψ₂ less its zonal mean), smoothed, drawn as isobars at whole hPa (every 4, heavier every 20); rain as stipple. Counts on the grid's lines (smoothing passes, chain lengths, the rings of a high or low) scale with the level, so the chart reads alike at every resolution. Highs and lows are extremes of the pressure eased to 220 km over ~440 km, at least 1 hPa from their surroundings. Fronts are the zero of ∇TFP·n̂ on θ where |∇θ| and TFP are in their upper ranges and the low-level flow is cyclonic (fronts lie in troughs), traced on triangles, chained, smoothed, typed by v·n̂ against 0.45 of the chart's median |v·n̂| (low-level flow runs nearly along the isotherms here, so an absolute threshold called every front stationary), then held in runs (a majority over ±8 points, runs under 10 points absorbed) with their symbols on one side per run. The locator's zero must be a maximum of TFP along n̂ (a minimum drew a second front beside each). Fronts are then split into stretches of one type; a stretch lying mostly within ~290 km of a longer one of its type is the same front found twice and goes; a cold stretch within ~380 km of a warm one has caught it, and the matched parts merge along their midline into an occluded front (mulberry, triangles and semicircles alternating on one side). Troughs (umber, dashed), ridges (umber zigzag) and subtropical shear lines (prussian, dash-dot) are ridge lines of −p, p and cyclonic vorticity, found by the Hessian's eigenvector (aligned per triangle), long and not round; troughs a front already marks aren't drawn. The fields (θ, moisture, wind, vorticity) and thresholds are averaged over successive charts, and pieces whose ends meet and line up are bridged, so fronts move rather than flicker. Dry lines are the same on moisture over land where θ's gradient is weak. The weather runs only in its view, waits for a warm climate, spins up ~12 days, and crossfades to the climate's mean between ~3 and ~30 days a second.

## Threads and the GPU

- **The engine's worker** (`src/engine/worker.js`) owns the `Planet`. The page keeps the clock: each frame it plays, it posts a tick (the years, the plate steps its scheduler planned, the orbit's window); the worker runs them all (a slow step coalesces the frames behind it), then the climate in 10 ms slices while idle. It posts `surface` after steps or when the sea moves (the drawn fields from `surface.js`, the boundaries and rivers traced, the plates' rotations, the crust's statistics), `climate` after each cycle (harmonics, zones, ocean), and `fast` ~10 times a second (ice, carbon, plumes, the record's samples, the model figure's sums). The page's mirrors (`mirror.js`, and plain objects in `main.js`) have the engine's shapes, so drawing and figures read them unchanged. Experiments' parameters go over as a `params` message; `CARBON.FIXED: 'now'` holds CO₂ where it stands.
- **The GPU** (one device, `src/gpu/device.js`): the globe draws; the weather steps and writes the globe's weather buffer; the season writes its climate buffer. Kernels declare only the bindings their entry uses (`kernel()` binds by name under the 'auto' layout), at most eight storage buffers each.
- **The chart's worker** (`src/render/chart-worker.js`) gets ψ₂, θ and moisture read back from the GPU with the template's pressure and derives wind, vorticity and the eddy pressure before tracing; one read and one trace are in flight at a time.

## The experiments

Each starts from the planet's opening (choosing one reloads with `?exp=`), sets the dial and the view, and has one knob; the caption carries its measured number.
- **Earth-like**: the opening.
- **Snowball**: sunlight (82–106%), CO₂ held at its value when chosen; the ice line. At 88% the planet freezes to the equator, and turning the sun back up doesn't thaw it at once (the ice–albedo hysteresis).
- **Ice ages**: CO₂ held (150–450 ppm), 10 kyr/s; the ice's volume and its dominant period (periodogram of the record over 400 kyr).
- **High stand**: mantle heat (scales slab pull, ridge push and the speed cap); sea level and land.
- **Thermostat**: outgassing (0.25–4×); CO₂ against its analytic balance.

## Drawing the climate

- **Relief view.** Land takes the vegetation of its climate: the zones' mixture blended as natural colours (`biome` in the shader: forest, savanna and steppe, desert, boreal forest, tundra), with rock toward the summits; umber height alone until the climate has run. Snow and sea ice are a light fill with a hard edge (the contour of the snow-and-ice share at ½, antialiased by its derivative) and a hairline, ice sheets the same with a stronger outline and contours of the ice's surface every 500 m. Lakes are water where their inflow beats ~1 m/yr of evaporation, drawn from a smoothed, signed depth (dry land below zero) with a hard shore and its hairline, from two cells up (one cell would draw as a hexagon). Rivers above 1,500 m³/s and three cells long are drawn in the sea's ink, their weight the discharge: main stems run continuously (at each confluence the larger river runs on), smoothed three times, with each tributary's end moved onto its stem's smoothed course; they break at lakes. The deep sea's relief is eased twice more than the coast's, so isobaths are curves. The young-crust tint at ridge axes is gone: the smoothed ridge rule draws the axis, and the tint drew the grid's cells.
- **Motion between steps.** Plate steps are a tenth of a second's worth of the dial (50 kyr to 0.5 Myr; the landscape steps every 0.25 Myr). The globe's fields are kept for the last two steps (`setFields(…, fromStep)`), and the vertex shader blends them (`blend`) over the time from one step's arrival from the engine to the next's (the dial's time for the step, or the gap between arrivals if the engine is slower), so the surface moves continuously (each step moves the crust less than half a cell). Boundaries turn with the mean of their two plates' rotations, and rivers with their plate's, to the same displayed moment (`turned` in `overlay.js`), and each new line morphs from its predecessor's course (`matchLines` pairs them by plate pair or plate and nearest middle, rivers strictly: both ends near and lengths within 40%; each new point corresponds to its nearest point on the old line, so points move across a line and symbols placed along it don't slide; `morphed` blends by the step's φ, rivers by the landscape's). Rivers with no predecessor fade in and those with no successor fade out. Boundaries take six Laplacian passes, so a re-traced boundary barely shifts. On the weather chart every line drifts whole with its mean wind (turned about r × v̄, so it keeps its shape) and every centre with its own, for up to three model hours between charts (every 150 ms), and each new chart corrects it. Chart lines are relaxed (Laplacian, ends held) before corner-cutting.
- **Snow and ice** are drawn from the snow-and-ice share and the ice's thickness smoothed twice over neighbours (edges are curves; one-cell patches melt away), eased over ~0.8 s when the climate updates (`src/gpu/season.js`, each frame on the GPU); lakes under snow are frozen over.
- **Collision** (a convergent boundary where no ocean sinks) has open sawteeth, as a thrust belt, and no arc.
- **Symbols scale with the globe**: trench teeth, arcs, transform arrows, hotspots, rivers' weight, fronts and dry lines, by the globe's radius on screen against 380 px, within ×0.75–3.5. Hotspots are red ringed points and an erupting province a red stippled disc.
- **Patterns** (the zones' screens, rain stipple) are fixed to the globe and scale with the zoom: drawn in three planar projections of the sphere blended sharply by the normal (triplanar), at a frequency from the globe's radius in pixels, with the next octave's marks fading in between the last's (`octave`, `hatch`, `stipple`), and marks of constant width on screen.
- **The key** (`src/render/key.js`) at the globe's lower left draws each view's symbols as the scene does; `K` or the Key button toggles it (open on wide screens).
- **Weather view.** Three charts (`wxMode`): pressure (isobars, rain), temperature (a prussian-to-sienna wash, isotherms every 5 °C, 0 °C heavier) and humidity (ochre-to-verdigris wash for the column's relative humidity, a line every 20%, rain); the picker under the views appears in Weather. Pale land, the paper for sea; cold fronts are prussian with triangles toward the warm air, warm fronts sienna with semicircles toward the cold, stationary fronts alternate, dry lines are ochre with open scallops toward the moist air, and H and L mark the highs and lows.
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
- **Speed.** The page's thread spends ~1.5 ms a frame (overlay and line morphs); a plate step costs the engine ~20 ms in the browser, the landscape ~10, a climate cycle ~300. Next: the climate's solves on the GPU; the engine's grid at level 7 (a plate step would be ~80 ms).
- **Drawing.** The globe is a level-7 mesh (163,842 vertices) and every field from the engine is refined onto it by one step of Loop subdivision on the GPU (`refine.js`: a midpoint takes 3/8 of each end and 1/8 of the two vertices across; an old vertex keeps 10/16 of itself at valence six), so coasts, isobaths, lakes, ice edges and zones' borders are curves at close zoom. The weights are positive, so shares stay shares. In the dark theme the land takes more ink (`palette().tint`) so it stays lighter than the sea.
