# Isochron: plan

*Isochron* is a line joining rock of the same age, which fits the seafloor stripes and the dial (name chosen 2026-11-14).

This is a fifth sim for a9l.im: an Earth-like planet on one globe, from plate tectonics down to weather, with every layer coupled to the others. It was proposed on 2026-11-13, and a9 set its scope that day (see Decisions). This file is the plan of record. Once the project has an `AGENTS.md` describing what is built, this file keeps only what isn't built yet, as Worldline's and Miasma's roadmaps do.

Claims carry one of three marks: **standard** (textbook geoscience), **synthesis** (a combination made for this sim) or **speculation** (a bet the build has to test). The model lineages named here come from memory. Before any of them reaches `about.md`, JSON-LD or an educational section, check it against Crossref or its live source (root `AGENTS.md`, "References and prose").

## Status

2026-11-13: phase 1 started. The grid, the scheduler, plates (motion, overlaps and gaps, slabs, arcs, collisions, merges, rifting, initiation, the torque balance), isostasy, solved sea level, the polarity record and the WebGPU globe are built; `AGENTS.md` describes them. Open in phase 1: tuning `PARAMS` across seeds (the default seed is stable; others drown their land or let seafloor age without limit), hotspots and large igneous provinces, Figs. 2 and 4, the worker, level 7.

## Decisions

From a9, 2026-11-13:

- One coherent model on one globe. The layers mesh into a single planet, and the harmony between them is the point.
- No insets. River meanders, groundwater, deep overturning circulation and the halocline are cut. Nothing happens off the globe.
- An Earth-like planet, not Earth. The planet is procedural and seeded, and needs no data.
- Glaciers are in, as continental ice sheets (Ice below).
- Climate zones on the map are in (Climate zones below).
- The project is meant to be very ambitious.

From a9, 2026-11-14:

- The name is Isochron.
- The red is where the mantle reaches the surface: ridge axes, arc volcanoes, hotspots. Warm fronts on the future weather chart take sienna.
- The page opens at plate speed, with the continents visibly moving.
- The carbon thermostat and orbital forcing are wanted (phase 3).
- The tectonic view should read more easily. Boundaries are now smooth traced lines in the conventions of a tectonic map (The scene).


## Thesis: one planet, one state, one dial

- **One planet.** Every layer lives on the same globe and reads and writes the same fields. Elevation is one array, which the plates raise, erosion lowers, ice loads, and the climate reads through its lapse rate.
- **One dial.** A logarithmic clock runs from about three hours a second to ten million years a second, ten and a half decades. At any setting, layers slower than the dial hold still and act as boundary conditions. Layers faster than it are replaced by their statistics (**standard**: this is how coupled Earth-system models treat scale separation, asynchronous coupling). Turn the dial down from weather and the storms blur into their mean, which is the climate. Climate *is* the distribution of weather, so turning the dial shows it rather than saying it. Further down, ice sheets breathe with the orbit, rivers cut mountains, and then the continents move.
- **Harmony.** The couplings are the subject. Plates make mountains. Mountains make rain shadows and catch snow. Snow becomes ice that pushes the crust down and the sea level down. Rain on fresh rock draws down CO₂, and the volcanoes at plate boundaries put it back. Each of these is a live flux in the model, and the model diagram (Figures) draws them with their current weights.

## The planet

Earth-like, procedural, seeded (`?seed=`). The same seed gives the same planet. Planet parameters are inputs, and the default is Earth's:

| Parameter | Default | Used by |
|---|---|---|
| radius | 6,371 km | every layer (lengths, areas) |
| day | 24 h | Coriolis (circulation width, gyres, weather) |
| obliquity, eccentricity, precession | 23.4°, 0.017, seeded cycles | insolation, seasons, ice ages |
| stellar flux | 1,361 W m⁻², brightening ~7% per Gyr (**standard**, Gough's solar-evolution fit) | climate |
| water | set at genesis for ~30% land, then conserved | sea level |
| mantle heat | sets the plates' mean speed | plates, outgassing, sea level |

## Grid

- An icosahedral geodesic grid: an icosahedron bisected k times and projected to the sphere. Cells are its 10·4ᵏ + 2 vertices, and each cell's Voronoi region is a hexagon (12 are pentagons). Level 6 has 40,962 cells (~110 km spacing on Earth's radius), level 7 has 163,842 (~55 km), level 8 has 655,362 (~28 km).
- Levels nest: level k's vertices are a subset of level k+1's. That gives multigrid solvers and transfer between layers that run at different resolutions for free.
- Finite-volume operators on the Voronoi cells (**standard**): area Aᵢ, dual edge length ℓᵢⱼ, centre distance dᵢⱼ, Laplacian (1/Aᵢ) Σⱼ (ℓᵢⱼ/dᵢⱼ)(fⱼ − fᵢ), Green–Gauss gradient. Point location is a greedy walk from a guess, seeded by a coarse latitude–longitude table.
- Resolution by layer: crust, landscape and ice at level 6 to start and level 7 as the target; atmosphere and ocean at level 6. Miasma's hex expertise carries over, but its topology code does not: a sphere is a new surface.
- Later, if cell-shape distortion shows (areas vary by about 1.4× on a bisected grid), a centroidal Voronoi optimization of the same topology would fix it.

## State

Per cell, as structure-of-arrays typed arrays:

| Field | Owner | Read by |
|---|---|---|
| plate, crust thickness, felsic fraction, formation time, suture age | plates | everything |
| bedrock elevation (derived), sediment | isostasy, landscape | climate, ice, ocean, weather |
| ice thickness, ice-load depression | ice | climate (albedo, height), sea level |
| monthly temperature and precipitation (first two harmonics), interannual spread | climate | ice, landscape, zones, carbon |
| climate-zone mixture | zones | the Climate view, albedo |
| gyre streamfunction, sea-surface temperature, sea ice | ocean | climate, weather |
| PV ×2 layers, surface θ, moisture | weather | climate statistics, the Weather view |

Global scalars: time, sea level, water and ice volume, CO₂, mean surface temperature, the orbit (e, ε, ϖ), the polarity record and the stellar flux.

## The dial and the scheduler

The base unit is the year, as float64 (at 1 Gyr that keeps three-second precision, enough for weather). The dial is log₁₀ years per second, from −3.5 (2.8 h/s) to 7 (10 Myr/s).

Each layer declares a characteristic timescale, a stable step, a substep budget per frame and a *closure*: what stands in for it when the dial outruns it.

| Layer | τ | Step | Live up to about | Closure when outrun |
|---|---|---|---|---|
| weather | 1 day | 30 min | 3 days/s | climate statistics (the EBM's seasonal solution) |
| seasons | 1 yr | 1 month | 10 yr/s | the annual-cycle harmonic solution |
| ocean gyres | 10 yr | steady solve | (diagnostic) | re-solved when geography or winds change |
| ice | 10³ yr | 50–100 yr | 3×10⁴ yr/s | ice in balance with the orbit-averaged climate |
| orbit | 2–40 kyr | analytic | 10⁵ yr/s | orbit-averaged insolation |
| landscape | 10⁴ yr | 10³ yr | (live above 10³ yr/s) | none: it accumulates |
| carbon | 10⁵ yr | 10³ yr | always | none: it's an ODE |
| plates | 10⁶ yr | ≤ 1 Myr | always (visible above 10⁵ yr/s) | none |

- **Live.** The scheduler gives a layer n = Δt_frame / step substeps while n fits its budget.
- **Summarized.** Past the budget, the layer's closure runs at most once per slow step. The drawing crossfades between live and summarized over half a decade of the dial (soft, never a switch).
- **Accumulating.** Slow layers bank time and step when a full step has accrued.

Every layer always advances simulated time, so the state stays consistent at any dial.

The seam between weather and climate is the main technical risk. The weather core is forced toward the climate's equilibrium temperature (Held–Suarez-style relaxation, **standard** for idealized dynamical cores), and its long-run eddy heat flux is what the climate's diffusion parametrizes. The diffusivity is calibrated so the two agree on the default planet, by an offline test (**synthesis**). While the weather runs, the climate statistics are its own running means; while it is outrun, they are the EBM's. The zones map blends the two by how many simulated years the running means hold.

## Layers

### 1. Plates and crust

- **Rigid plates, exact motion.** Each plate is a rotation Qₖ (a quaternion) from a plate-fixed frame to the mantle frame, and angular velocity ωₖ, so surface velocity is ωₖ × r (**standard**, Euler poles). A plate stores its crust on its own copy of the grid in plate-fixed coordinates, as a mask plus fields. A world cell reads plate k at Qₖ⁻¹x. Motion is therefore exact and never stalls: resampling the moving field onto the fixed grid every step would freeze it, since a step moves less than half a cell. Memory is about 12 plates × 41k cells × 16 bytes ≈ 8 MB at level 6 (**synthesis**).
- **Each step**, for each world cell, test the plates that held it or a neighbour last step (a step moves less than a cell):
  - **Gap** (no plate covers it): new oceanic crust, age 0, 7 km thick, accreted to the plate that just vacated the cell. Ridges therefore grow symmetrically.
  - **Overlap**: the more buoyant crust stays on top. Continental beats oceanic, younger ocean beats older, and among equals the incumbent keeps the cell. The other plate's cell is consumed: its mask is cleared and the event is logged (slab pull, arcs, outgassing).
  - **Ocean under anything**: arc growth on the overriding side (thicker crust, more felsic: continents grow at arcs) and an active volcano there.
  - **Continent against continent**: collision. Crust thickens by the volume brought in, capped near 70 km with the excess spread to neighbours (orogenic collapse), and the cells record a suture. A collision zone past a set length merges the two plates: one plate's cells are re-expressed in the other's frame, once, and the merged ω conserves momentum under the drag tensors.
- **Driving forces.** ω comes from a torque balance, not a script. Slab pull at a plate's consumed edge scales with the √age of the slab, ridge push comes from the seafloor's age gradient, and basal drag is −c ∫(I − r rᵀ) dA · ω, with continental keels raising c. Solving one 3×3 system per plate gives Forsyth and Uyeda's result: plates with long slabs move fast and continental plates move slowly (**standard** result, **synthesis** as an implementation).
- **Rifting and the Wilson cycle.** A large continental plate stable for long enough insulates its mantle. A plume head arrives under it, far from its margins, and the plate splits along a path through the plume that prefers old sutures (Wilson's observation that oceans reopen near old sutures). These are rules, not emergence: real rifting needs mantle convection, and the literature still argues about it (**speculation**: whether the rules give a convincing supercontinent cycle).
- **Subduction initiation.** A passive margin whose seafloor passes about 180 Myr detaches from its continent and starts to sink. Earth's oldest seafloor is about that age, and that is the evidence (**standard** observation, the rule **synthesis**).
- **Hotspots.** Plumes are fixed in the mantle frame. They thicken whatever crust passes over them, leaving seamount chains on ocean and traps on land. A plume head's arrival is a large igneous province: a pulse of crust, a rift trigger and a CO₂ pulse.
- **The polarity record.** Reversals are a seeded Poisson process whose log-rate wanders, so superchrons happen. Oceanic crust remembers the polarity at its formation time, which draws the Vine–Matthews stripes (**standard**). Stripe width is spreading rate times chron length, and the drawing follows that exactly.

### 2. Isostasy and sea level

- **Elevation** = Airy isostasy on crustal thickness and density (density from felsic fraction), minus thermal subsidence of oceanic crust, 0.35 km × √(age / Myr) (half-space cooling, **standard**, Parsons–Sclater), flattening past ~80 Myr, minus the ice-load depression, plus sediment.
- **Sea level is solved, not set.** It is the level s at which Σ Aᵢ max(0, s − eᵢ) equals the ocean's water volume (the inventory minus what the ice holds). Young, shallow ridges from fast spreading raise it; ice sheets lower it. The Cretaceous high stands and the glacial low stands both fall out (**standard** mechanisms, exact here).

### 3. Landscape

- **Erosion.** The stream-power law, dz/dt = U − K Aᵐ Sⁿ, with uplift U from the crust layer. Routing is steepest descent over the hex neighbours, with depressions filled by priority flood into lakes. Braun and Willett's implicit O(n) solver runs in a worker at 160k cells (**standard**).
- **Hillslope diffusion** smooths what the rivers leave.
- **Sediment** is routed downstream and deposited where the river reaches the sea or a lake, building shelves and deltas. Lost mass feeds weathering.
- **Glacial erosion** scales with ice sliding speed, so ice planes high latitudes.
- At 55 km only the great rivers show. That's the right resolution: the planet's drainage, not a valley's.

### 4. Climate

- **Temperature.** A seasonal energy-balance model on the grid: absorbed sunlight against outgoing longwave A + B·T − 5.35 ln(CO₂/CO₂₀) W m⁻² (**standard**: the logarithmic CO₂ forcing), lateral diffusion, and heat capacities that differ between land and the ocean's mixed layer. The seasonal cycle is solved as harmonics, T(t) = T̄ + Re(T̂ e^{iωt}) with T̂ ∝ F̂ / (B + iωC) plus diffusion (**standard**, the linear seasonal EBM). Continentality and the oceans' seasonal lag come out directly.
- **Albedo** comes from ice, snow, sea ice, ocean and the climate-zone mixture. The ice-albedo feedback gives Budyko–Sellers bistability: a snowball and a warm planet under the same sunlight (**standard**).
- **Circulation** is a template, not a solve. The ITCZ follows the energy-flux equator through the year. The Hadley edge follows Held–Hou scaling with rotation rate. Surface pressure has subtropical highs and subpolar lows, plus a thermal low over hot land and a high over cold land, which makes monsoons. Winds are geostrophic plus frictional turning (**synthesis**: physically motivated rules; the about panel says so).
- **Moisture.** Water vapour moves along the seasonal mean winds by advection and diffusion. Evaporation is set by SST, it rains out when it nears saturation and on windward slopes, and lee sides get rain shadows. The steady state is solved per season (**synthesis**).

### 5. Ice

- **Ice sheets** use the shallow-ice approximation with Glen's law (n = 3): flux ∝ H⁵ |∇s|² ∇s (**standard**). The explicit step is about 100 yr at 55 km, so the layer needs a semi-implicit solve.
- **Mass balance**: snow where the monthly temperature is below freezing, melt by positive degree days (**standard**, Reeh's PDD), and a lapse rate on the ice surface, so a high ice sheet keeps itself cold (the height–mass-balance feedback).
- **The load** pushes the bed down toward (ρᵢ/ρₘ)·H with a relaxation time of a few kyr (ELRA, **standard** in ice-sheet models). Rebound lags melting, which helps make glacial cycles saw-toothed.
- **Sea ice** is thermodynamic, from the ocean temperature.
- **Orbital forcing**: the planet's own seeded e, ε and ϖ cycles (near 100 and 400 kyr, 41 kyr and 21 kyr) drive daily-mean insolation by Berger's formula (**standard**). Ice ages come out of the coupling or they don't (**speculation**: whether the 100 kyr rhythm emerges or needs the rebound lag tuned).

### 6. Carbon

- **The long loop.** dC/dt = outgassing − weathering. Outgassing scales with ridge production plus arc length times convergence, plus large-igneous-province pulses. Silicate weathering is ∝ runoff × e^{ΔT/Tₑ}, limited by fresh-rock supply (erosion rate) (**standard**: the Walker–Hays–Kasting thermostat). Its response time is a few hundred kyr.
- **What it closes.** The red marks (below) are the CO₂ source, and the mountains are the sink. Uplift drives weathering, which cools the planet (the uplift–weathering hypothesis, **standard** as a hypothesis). The brightening sun is balanced by falling CO₂ over Gyr.

### 7. Ocean

- **Gyres** come from Sverdrup balance with a Munk western boundary layer: one steady linear elliptic solve per basin from the curl of the annual-mean wind stress (**standard**). Western boundary currents appear in whatever basins the plates made. Geography changes rarely, so the solve reruns only when the basins or winds change.
- **SST** is the EBM's ocean temperature advected by the gyres, which gives warm western boundaries and cold eastern ones. Coastal and equatorial upwelling (Ekman, from the same winds) cools them further. The cold eastern currents make coastal deserts.

### 8. Weather

- **The core** is two-layer quasi-geostrophic flow on the sphere at level 6 (**standard**): potential vorticity in each layer is advected by its own flow, and each step inverts one Poisson and one Helmholtz problem for the streamfunctions (multigrid on the grid hierarchy, warm-started). It is relaxed toward the climate's equilibrium thickness, with Ekman friction below and hyperdiffusion. Topography enters the lower layer. Baroclinic instability makes cyclones by itself.
- **Tracers** (surface θ and moisture) are advected by the lower layer. Deformation strains them into fronts, which is how fronts form (**standard**, deformation frontogenesis). Moisture has evaporation sources and rains out by condensation and upslope lift.
- **Diagnosed on the chart**:
  - fronts, from the thermal-front parameter on θ;
  - dry lines, where moisture changes sharply and θ doesn't;
  - cyclones and anticyclones, at extrema of the lower-layer pressure (p ∝ fψ);
  - isobars, from the same pressure.
- **Dry lines need geography**: a warm sea on one side, a high desert and its lee slope on the other, and a day–night cycle in the surface θ forcing, so they form only where the planet allows (**speculation**: that a 110 km QG core keeps them sharp enough to find).
- **Cost.** In a JS worker, the warm-started inversion is a few ms per step, so live weather holds to a few days per second. A WebGPU compute port is the lever if more is wanted.
- **Feedback to climate.** The running monthly means of θ and precipitation are the climate statistics while the weather is live.

### 9. Climate zones

- **Soft Köppen.** Köppen's classes are thresholds on monthly temperature and precipitation. Each threshold becomes a logistic whose width is the interannual spread, so each cell holds a probability over classes rather than one label (**synthesis**, soft-everywhere).
- **Drawing.** A cell's classes are drawn in proportion as interleaved patterns, the way Miasma draws a coinfected host as the mixture of its strains: boundaries are ecotones, not lines. Main group is the ink, the second letter the pattern:

| Group | Ink | Pattern by second letter |
|---|---|---|
| A tropical | viridian | f solid, m cross-hatch, w/s hatch at two angles |
| B arid | ochre | W dense stipple, S sparse stipple |
| C temperate | sap | f solid, s and w hatch |
| D continental | verdigris | as C |
| E polar | indigo | T fine hatch; EF is the paper with ice hachures |

- **Feedback.** The mixture sets land albedo and the weathering factor (vegetation speeds weathering), so the zones are part of the model, not only a map of it.

## The couplings

| From | To | Through | Timescale |
|---|---|---|---|
| plates | everything | elevation, coastlines, basins | Myr |
| plates | carbon | outgassing at ridges, arcs, LIPs | Myr |
| plates | sea level | ridge volume (young crust is shallow) | 10 Myr |
| landscape | crust | erosion and sediment load (isostatic) | 10⁴–10⁶ yr |
| climate | landscape | runoff, temperature | — |
| climate | ice | snowfall, melt (PDD) | 10³ yr |
| ice | climate | albedo, surface height | 10³ yr |
| ice | sea level, crust | volume, load | 10³–10⁴ yr |
| orbit | climate | insolation by latitude and season | 10⁴–10⁵ yr |
| carbon | climate | longwave forcing | 10⁵–10⁶ yr |
| climate, landscape | carbon | weathering (runoff, T, fresh rock) | 10⁵ yr |
| climate | ocean | wind stress | yr |
| ocean | climate | SST, heat transport, sea ice | yr |
| climate | weather | equilibrium thickness, SST | days |
| weather | climate | running statistics | yr |
| zones | climate, carbon | albedo, weathering factor | — |

## The scene

- **Medium.** A physiographic globe in the manner of Heinrich Berann's paintings of the Tharp–Heezen ocean floor: shaded relief on land and sea, the ridges and trenches that made the case for seafloor spreading. The Weather view is a synoptic chart, the Climate view a soft Köppen map, all on the same globe.
- **The red** is where the mantle reaches the surface: ridge axes (crust younger than ~1 Myr), active arc volcanoes, hotspots and large igneous provinces. In the carbon loop that's the CO₂ source, so the red reads a quantity. Weather maps conventionally draw warm fronts red, and here they take sienna instead: the semicircle carries the meaning (pattern before hue).
- **Inks**: prussian for the ocean's depth tint; umber for land hillshade; graphite (textMuted) for isobars and contours. The zones are in their table above. On the chart, cold fronts are prussian triangles, warm fronts sienna semicircles, occlusions mulberry, stationary fronts alternate, and dry lines are ochre scallops. Precipitation is stipple, its density the rate.
- **Pattern before hue.** The stripes are a pattern: polarity is light against dark. The tectonic symbols follow geologic-map convention and are patterns too: sawteeth on the overriding plate at a trench, half-arrows for the sense of slip on a transform, a red rule at a ridge, and a dotted rule where plates hardly move. Weather notation is kept for weather. A cold front's triangles are the same glyph as a trench's sawteeth, so the two must never share a view or an ink: tectonic symbols are in the text colour, and fronts will be in inks. Front symbols survive grayscale by construction. Ice is the paper with flow hachures, whose direction is the ice flow and spacing its speed.
- **Depict, don't decorate.**
  - Stripes are chrons and isochrons are equal age.
  - Hachures are ice flow, stipple is rain, and line weight on rivers is discharge.
  - Antialiasing stripes thinner than a pixel is itself a readout. The shader box-filters polarity through its running integral, so where chrons are unresolved the floor goes to mid-tone rather than shimmering.
- **Camera.** An orthographic globe with an orbit camera (drag to turn, scroll and pinch to zoom). An equal-area map (Equal Earth) is a toggle for seeing the whole planet's zones at once.
- **Open on a living frame.** Each preset boots spun up and running. Under reduced motion it opens on a still, complete frame.
- **Show, don't tell.** The caption is the view's name and live values. The dial shows its rate ("1 Myr/s"). What a stripe or a barb means goes in the about panel.

## Figures

The margin figures come from the same state: none is a separate model.

1. **The record.** Global series over the run: mean temperature, CO₂, sea level, ice volume, land fraction and spreading rate, on a time axis that follows the dial. This is the planet's own δ¹⁸O-style stack.
2. **Hypsometry.** Area against elevation. Earth's is bimodal because it has two kinds of crust, and this planet's should be too.
3. **Zonal means.** Temperature and precipitation by latitude, with the circulation cells' edges and the ITCZ's seasonal range.
4. **Polarity.** The polarity time scale as a barcode, with the time cursor and any superchrons.
5. **The orbit.** e, ε and ϖ, and summer insolation at 65° (Milankovitch's curve).
6. **The model.** Every layer as a node and every coupling as an arrow weighted by its live flux (outgassing against weathering, snowfall against melt, uplift against erosion). This is the harmony made visible, after Miasma's Fig. 7.

## Experiments

Each preset is one knob, a measured number in the caption and, where theory gives one, a predicted number. Each is surveyed across seeds before it ships (Miasma's rule).

| Preset | Knob | Measured | Theory |
|---|---|---|---|
| Earth-like (opening) | — | land fraction, mean T, sea level | — |
| Snowball | stellar flux | ice-line latitude | Budyko–Sellers: the small-ice-cap instability and hysteresis |
| Ice ages | CO₂ baseline | dominant period of ice volume | 41 kyr obliquity against the 100 kyr rhythm |
| Supercontinent | — (a seed) | arid land fraction, interior seasonal range | continentality |
| High stand | mantle heat | sea level, flooded continent | ridge volume |
| Spin | day length | Hadley edge, number of jets | Held–Hou: φ_H ∝ 1/Ω |
| Tilt | obliquity | seasonal range at 45°, where the ice is | high obliquity freezes the tropics first |
| Storm track | equator-to-pole contrast | eddy energy, cyclones per month | Phillips' two-layer criterion |
| Thermostat | outgassing | equilibrium CO₂ and T | Walker–Hays–Kasting |

## Architecture

- **Code.** Vanilla ES modules with no dependencies or build step, like the other sims. `index.html`, `main.js`, `colors.js` and `styles.css` follow the shared shell (colophon, caption, about panel).
- **Engine.** `src/engine/` and `src/grid/` hold no DOM. Each layer is a module that owns its arrays, declares its band and closure for the scheduler, and exports `step(dt)` and `summarize()`. The engine runs in a module worker. The site is cross-origin isolated (COOP same-origin, COEP credentialless), so state can live in SharedArrayBuffers that the renderer reads without copying. Until then, it runs on the main thread under a frame budget.
- **Renderer.** WebGPU only: the globe is the subdivided icosahedron's triangles, with cell fields as vertex attributes and every mark procedural in the fragment shader. A 2D canvas above it draws line symbology (boundaries, fronts, isobars) and labels.
- **Tests.** Headless node tests under `tests/` (not staged). Every layer lands with an analytic oracle, the way Worldline's figures are oracles:

| Layer | Oracle |
|---|---|
| grid | counts 10·4ᵏ + 2, twelve pentagons, areas sum to 4π, neighbour symmetry, Euler characteristic 2 |
| clock | substep counts, band hand-offs, time conserved across modes |
| plates | crust area conserved under pure rotation, v = ω × r, stripes symmetric about a ridge, torque balance on a one-slab plate |
| isostasy | half-space depth curve, water volume conserved through sea-level solves |
| landscape | steady-state slope–area law S = (U/K)^{1/n} A^{−m/n} |
| climate | the analytic Budyko–Sellers ice line on an aquaplanet, seasonal amplitude and lag against 1/(B + iωC) |
| ice | Vialov's steady profile on a flat bed |
| carbon | the thermostat's equilibrium, analytic for the scalar ODE |
| ocean | Sverdrup transport, the Munk layer width (A/β)^{1/3} |
| weather | the Rossby–Haurwitz wave's phase speed (Williamson's test 6), Phillips' criterion |

## Phases

Each phase ships on its own.

1. **The tectonic globe.** The grid, globe renderer and dial, and plates with the full overlap and gap logic, torque balance, rifting, hotspots, isostasy, solved sea level, stripes and boundary symbols. The Relief view and Figs. 2 and 4. The dial runs 10⁴ to 10⁷ yr/s.
2. **Surface and climate.** Landscape (stream power, sediment), the seasonal EBM, the circulation template, moisture and precipitation, soft Köppen and the Climate view, Fig. 3. The dial reaches 10 yr/s.
3. **Ice and carbon.** Ice sheets, sea ice, orbital forcing, glacial isostasy, the carbon loop, large igneous provinces, Figs. 1 and 5. The Snowball, Ice ages, High stand and Thermostat presets.
4. **Ocean and weather.** Gyres and SST, the QG core, tracers, the synoptic chart and the weather–climate hand-off. The dial reaches hours. The Storm track and Spin presets.
5. **The harmony.** Fig. 6, surveyed presets, the about panel, Japanese, the social card (a painting program under `tools/og/paint/`), and registration on the site (`content/projects/`, the stager's and font subsetter's project lists, `_headers`).

## Open decisions

- Globe only, or globe plus an Equal Earth map toggle.
- Resolution for crust and land: level 7 (55 km) is the target, so measure it in phase 1.
- Vegetation beyond the zones' feedback (Daisyworld-style biology) is out of scope unless a9 wants it.

## Risks

- **The weather–climate seam.** The EBM and the QG core can disagree. Calibrating the diffusivity on the default planet reduces it, the crossfade hides what's left, and the about panel says the climate is an emulator when the weather is outrun.
- **The Wilson cycle may not cycle.** Rifting and subduction initiation are rules. If supercontinents never form or never break, the rules need tuning against long runs (a tools/ survey, like Miasma's).
- **Show, don't tell** will be tested harder here than anywhere. Nine layers of physics invite explanatory UI; the about panel has to carry it.
- **Scope.** The whole is five sims' worth. Phases ship alone so the project is real at every stage.
