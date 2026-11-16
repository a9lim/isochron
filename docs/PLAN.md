# Isochron: plan

*Isochron* is a line joining rock of the same age, which fits the seafloor stripes and the dial (name chosen 2026-11-14).

This is a fifth sim for a9l.im: an Earth-like planet on one globe, from plate tectonics down to weather, with every layer coupled to the others. It was proposed on 2026-11-13, and a9 set its scope that day (see Decisions). This file is the plan of record: the thesis, the decisions and the design, and the Roadmap of what comes next (phases 6–10). `AGENTS.md` describes the code as built.

Claims carry one of three marks: **standard** (textbook geoscience), **synthesis** (a combination made for this sim) or **speculation** (a bet the build has to test). The model lineages named here come from memory. Before any of them reaches `about.md`, JSON-LD or an educational section, check it against Crossref or its live source (root `AGENTS.md`, "References and prose").

## Status

2026-11-14: phases 1–4 are built, phase 5 in part, and the tides and the Moon (`AGENTS.md` describes what's built; `docs/LOG.md` records the overnight run's decisions). The site registration and social card are done. The Roadmap (phases 6–10, ratified 2026-11-14) was built on 2026-11-14/15; where it stands is at its head. Still open from phases 1–5: tuning across seeds (`PARAMS`, the climate's arid share, the ice-age rhythm) and the Storm track, Spin, Tilt and Supercontinent experiments. No Japanese (a9, 2026-11-15). Figures are numbered by their order on the page (the globe is Fig. 1; the record, orbit, zonal means, hypsometry, polarity and model are Figs. 2–7), not by the list below.

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

From a9, 2026-11-14, choosing the roadmap from a brainstorm by Claude and Codex:

- The next sectors are ice, freshwater, dust and minimal life (Roadmap).
- Not much more geology. Readouts of the rock record (proxies, a geological map, stratigraphy) fight show, don't tell.
- Life stays minimal: enough to make the environment robust, no more.
- The rest of the engine on the GPU is a goal, as a session of its own.

From a9, 2026-11-15, taking up Claude's proposal for people (Roadmap 2.0):

- People (J2 in the ideas list, parked on 2026-11-14) are unparked and carried through to artificial superintelligence. This is the one exception to "life stays minimal".
- It is version 2.0, given its size.
- It lives as an experiment, started from the planet's opening, not as a hazard in every run.
- Fossil fuels are seeded at genesis from the opening's sedimentary settings.
- The ice fix (sheets that swing with the orbit, and sea level with them) would help but isn't a prerequisite, if the experiment's world can be set up to do without it.
- A headless prototype comes first, in `tools/`, iterated on and tested before anything goes into the sim.

From a9, 2026-11-15, on the ending:

- It is up to chance, on two orthogonal axes: AI aligned or not, Earth preserved or sacrificed.
  - 1a: misaligned, and it boils the oceans (after Yudkowsky and Soares, from memory).
  - 1b: misaligned, but it preserves the planet: datacenters and factories in space, plankton or other carbon capture, sulfate in the air. People are still gradually disempowered and slowly go extinct, with no birth-rate floor.
  - 2a: aligned, and people and AI reach for the stars together, sacrificing Earth to get there.
  - 2b: aligned, and Earth is preserved, for real this time.
- Food is bought with energy.


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
- **Pattern before hue.** The stripes are a pattern: polarity is light against dark. The tectonic symbols follow geologic-map convention and are patterns too: sawteeth on the overriding plate at a trench, half-arrows for the sense of slip on a transform, a red rule at a ridge, and a dotted rule where plates hardly move. Weather notation is kept for weather. A cold front's triangles are the same glyph as a trench's sawteeth, so the two must never share a view or an ink: tectonic symbols are in the text colour, and fronts will be in inks. Front symbols survive grayscale by construction. Ice is a light fill with a hard outline and contours of its surface, as glaciological maps draw it (a9, 2026-11-15: more conventional than hachures). Patterns are fixed to the globe and scale with the zoom.
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
| Eruption (phase 6) | sulfate, 0.1–30 Pinatubos | peak cooling, its e-folding | the anomaly model's response to a decaying forcing |
| Regolith (phase 7; not shipped: no rhythm emerged) | starting regolith depth | the ice's dominant period over time | 41 kyr on soft beds, ~100 kyr once stripped (Clark and Pollard's hypothesis) |
| Pulse (phase 8) | carbon pulse, 500–10,000 Pg C | share left in the air after 1, 10, 100 kyr | ocean uptake, carbonate compensation, weathering (Archer's long tail) |

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

## Roadmap

Ratified by a9 on 2026-11-14 (Decisions). Four sectors, **ice, freshwater, dust and minimal life**, then the rest of the engine on the GPU. The order follows the dependencies: every sector needs a year with a state (phase 6), and dust is the thread between the other three, so it comes last.

Where it stands (2026-11-15, after the roadmap run; `docs/LOG.md` → "The roadmap run" has every decision):

- **Built:**
  - phase 6 (the year, the anomaly, volcanoes, soil and groundwater, lakes);
  - phase 7 (sliding, carving, the regolith, flexure, ice streams), with its ice side extended by "ice that grows" (continental seasons, marine fronts);
  - phase 8 (vegetation, the sea's carbon, Pulse);
  - phase 9 (dust);
  - phase 10a (plates and surface on the GPU) and 10b (the landscape made cheap on the CPU; nothing on the GPU won there);
  - phase 10c (the climate cycle: the energy balance and the moisture's packing on the GPU, every stage sliced). Level 7 sustains 1 Myr/s, and a warm cycle is ~350 ms of the worker's CPU, against a target of ≲150. The page's speed after it (2026-11-15, measured visible: the hidden pane's numbers were a background page's): 60 fps with ~2.8 ms frames, 0.99 Myr/s at 1 Myr/s, ~5.0 at the top (node ~5.8), the clock running ~2.4 s after load. The rest of the cycle (the ground's periodic year, the dust's packing, the template), the step's latency (its GPU round trips) and the spin-up's ~1.9 s of an empty globe are 10's remainder (AGENTS.md, Speed).
- **Out:** phase 7b (moving sea ice: its drift didn't change the ice edge at 220 km).
- **Not shipped:** the Regolith and Green margin experiments; no rhythm and no bistability emerged.
- **Fixed on the way:**
  - the climate had been tuned on a transient: the energy balance's harmonics never converged, and the settled climate was ~12 °C. It's now converged and retuned to 13.4–13.9 °C, with D climates at 20–29%;
  - the tide's Coriolis made energy over cliffs, so the Moon ran away;
  - eight bugs found by an independent read (Codex);
  - coasts that were cliffs to the ice.
- **Open, for a9:**
  - **The ice sheets stay small** (~2 M km³ at 180 ppm), and the ice keeps no orbital time. The 60–70° lowlands get ~5 cm of snow a year against ~9 m of melt potential: the climate starves the high latitudes of moisture. That's the next lever (the template's storm-track moisture, or the weather's feedback, D2 in the brainstorm).
  - **Level 7's plate speed depends on the order cells are visited** (a slab inherited within a pass; 10a found it and kept it for parity).

How each phase is built:

- Each new layer lands with a CPU reference and an analytic oracle in `tests/` (Architecture). New per-cell state runs on the engine's GPU device from the start, as the ice, the moisture and the tide do, with a parity test in `tests/gpu-node.test.mjs`, so phase 10 has less to port.
- Each declares its closure for the dial (The dial, extended).
- Fig. 7 gets an arrow only for a coupling the code has.
- The scene gains quantities, not explanations. Most of this shows through things already drawn: the relief, the season, the rivers, the ice, the record. The few new marks are listed with each phase, and their final form is settled in the browser (Open decisions).

### Phase 6. The year

Today the climate is a periodic solution, so every year is the same year, and nothing can remember a wet decade. This phase gives the year a state.

- **The year's stepper** (synthesis). A monthly step on the engine's worker, live below ~100 yr/s, for the state that lives between the season and the plate step: the anomaly, the aerosol, soil water and snow, and lake water. Above that each is replaced by its closure. The climate cycle reads the stepper's slow means (the soil's wetness, the lakes' area) the way it now reads the zones.
- **Interannual variability** (standard: Hasselmann's stochastic climate model).
  - An anomaly T′ on the climate's coarse grid: C ∂T′/∂t = −B T′ + ∇·D∇T′ + F, with F red noise correlated over ~1,500 km. Its amplitude by latitude is calibrated against the QG weather's variance by a `tools/` run and kept as a fitted profile. Sea anomalies last for years, land ones for weeks.
  - A rain anomaly, correlated with T′ and with noise of its own.
  - The season drawn and the rivers by the month carry both. The soft Köppen widths become the planet's own interannual spread, as layer 9 intended, replacing the fixed 1.5 K and 0.25.
- **Volcanic winters** (standard effects; synthesis as a process).
  - Eruptions at active arcs as a seeded point process: the rate follows the arc's convergence, and the sizes follow a power law, each size class about ten times rarer than the one below. Hotspots erupt too, smaller.
  - Stratospheric sulfate spreads in latitude from the eruption and decays over ~1 yr. Its forcing enters F. Provinces add sulfate through their floods, so a flood cools in pulses before its CO₂ warms.
  - Drawn: the erupting volcano in red (the mantle at the surface), and the veil as a graphite stipple at slow dials.
- **The ground** (standard: Manabe's bucket; synthesis around it).
  - Soil water per land cell, with a capacity. Evaporation follows its wetness, it runs off when it overflows, and it drains as baseflow.
  - The snowpack, now worked out inside `monthlyRunoff`, becomes state. Snow insulates a ground heat store, so permafrost is where the ground's mean stays below 0 °C.
  - It replaces `monthlyRunoff`'s baseflow rule and the climate's fixed land wetness. Rivers then lag the rain by the soil's memory.
- **Lakes that breathe** (standard hydrology; synthesis).
  - The priority flood's depressions become lakes with water. Each closed basin holds a volume, gains its catchment's runoff and the rain on it, loses evaporation, and spills into the next basin when full (fill and spill).
  - A closed lake's area settles where its evaporation balances its inflow, so lakes grow in wet centuries and glacials (pluvial lakes) and shrink to salt flats in dry ones.
  - Lakes feed the moisture balance (a source of vapour) and the albedo, and a spill reorganizes drainage.
  - Drawn: lakes from their water rather than from the inflow rule in `surface.js`; salt flats as a pale crust pattern.
- **Experiment: Eruption** (Experiments). The planet erupts once at 1 yr/s.
- **Oracles.** The anomaly's spectrum against Hasselmann's red spectrum (its corner at B/C). Water conserved through soil, rivers and lakes (rain = evaporation + runoff + storage). A conical basin's closed lake at area Q/(E − P). The aerosol's cooling against the analytic convolution.
- **Cost** L. **Risk:** the zones' new widths shift the climate's tuned shares; retune on the default seed (`tools/climate-check.mjs`).

### Phase 7. Ice that carves

- **Sliding** (standard: a Weertman-type law). Where the bed thaws, the ice slides: u_b = C τ_b^p, fast on soft regolith and slow on bare rock. The basal temperature comes from the surface temperature, the geothermal flux and the ice's thickness, by conduction only. Sliding adds to the shallow-ice flux, so ice streams form where beds are soft and warm.
- **Glacial erosion** (standard rule: erosion ∝ sliding speed; the plan's layer 3).
  - Ice removes regolith first and then rock, taking thickness through the same isostatic factor rivers use. It deepens troughs under fast ice and planes shields.
  - Till goes to the ice's margins and outwash to the rivers' sediment.
  - When the ice retreats, the scoured basins fill as lake districts (phase 6's lakes), and the rivers inherit the new ground.
- **The regolith** (standard: Heimsath's soil production; speculation as a rhythm).
  - A weathered layer in each plate's frame. Weathering makes it, fastest when it's thin. Rivers and ice remove it. Till adds to it, and in phase 9 so does dust.
  - It sets the ice's bed (soft or hard), the soil's water capacity (phase 6), and weathering's supply limit (replacing the erosion rule in `CARBON.E_HALF`).
  - Thick regolith makes thin, fast ice; stripped beds make thick, slow ice. That's the regolith hypothesis for Earth's switch from 41-kyr to 100-kyr ice ages (Clark and Pollard).
- **Flexure** (standard: a thin elastic plate over a fluid mantle).
  - Loads bend the lithosphere over the flexural length α = (4D/Δρg)^¼ rather than only beneath themselves. The loads are the crust's excess, sediment, water and ice.
  - Rigidity follows the crust: oceanic by age (the 450 °C isotherm), continental by the crust's age, and broken across plate boundaries.
  - Solved as two coupled second-order problems by multigrid on the grid hierarchy, reusing the weather's vec2 machinery (`src/gpu/hierarchy.js`).
  - What appears: foreland basins beside ranges, which their own sediment fills; bulges beyond them; moats around hotspot islands; outer rises seaward of trenches (if the trench's bending load is included); and a forebulge round each ice sheet.
  - The ice's bed relaxes toward the flexural response, proper ELRA, replacing the local relaxation in `Ice.rebound`. The forebulge then collapses after a deglaciation.
- **Ice-dammed lakes** (standard). Routing reads the ice as ground, so ice sheets dam lakes at their margins. When the dam thins, the lake drains within a month in an outburst flood. Phase 6's lakes do this with no new machinery.
- **Drawn.** Ice streams as fine flow-parallel lines where sliding is fast, the convention of glaciological velocity maps (Open decisions). The rest shows in the relief.
- **Experiment: Regolith** (Experiments), at 10 kyr/s. It ships only if the rhythm emerges in the survey.
- **Oracles.** Vialov's profile with a sliding term (the plug-flow limit). The regolith's steady depth h* = h₀ ln(P₀/E). The line-load and point-load solutions on a uniform plate. Eroded and deposited mass conserved.
- **Cost** L–XL. **Risk:** sliding shortens the ice's explicit step, and the GPU ice (`src/gpu/ice.js`) needs the sliding term too.

### Phase 7b. Sea ice that moves: out

Decided after phase 7 (2026-11-14). The module was built (Stefan's growth, free drift with Nansen's rule, a cavitating-fluid pressure) and tested, but at 220 km with ~12 Sv gyres the drift doesn't make the ice edge less circular: the energy balance sets it. The edge was the reason for the phase, and dynamic ice kept more summer ice, a tuning cost with nothing to show for it. Not integrated; the module is in git history (aab9310).

### Phase 8. Minimal life

Enough life to make the environment robust, no more (a9).

- **Vegetation as state** (standard feedbacks; synthesis, after Brovkin's VECODE).
  - Per land cell, fractions of trees, grass and bare ground, each relaxing toward its climate's equilibrium over its own time: trees over centuries, grass over years. The equilibrium comes from growing degree days, rain and soil water.
  - Feedbacks: albedo (forest masks snow, so a boreal forest warms its own spring), transpiration (evaporation over land rises with cover and soil water, recycling rain into continents' interiors), and weathering (as the zones do now).
  - A land carbon store, in vegetation and soil, follows the cover and the temperature and trades with the air.
  - Drawn: the Relief view's vegetation colours come from the cover instead of the zones. After a deglaciation, bare ground lingers before the forest arrives, and the Climate view (the climate) and the Relief view (the plants) can disagree.
  - Possible bistability (speculation): a monsoon margin green or desert under the same orbit (Claussen's green Sahara). If it emerges, it becomes an experiment (Green margin: knob precession, measured the vegetated share, theory hysteresis).
- **Carbon that lives somewhere** (standard; boxes after LOSCAR).
  - The exogenic pool splits into the air, a surface ocean and a deep ocean, each with dissolved carbon and alkalinity. pCO₂ comes from carbonate chemistry at the sea's temperature, so cold oceans hold more.
  - Exchange runs between air and sea over decades and between surface and deep over ~1 kyr. That's a box exchange: the cut overturning isn't modelled or drawn.
  - Carbonate is buried in two places. On warm, shallow, clear shelves it depends on sea level, and platforms aggrade to keep pace with slow rises and drown under fast ones. On the deep seafloor it's buried above the compensation depth, which moves until burial balances weathering's alkalinity.
  - Deep-sea carbonate rides the plates, and a share of what's subducted returns at arcs.
  - Productivity, from the rivers' nutrients and the ocean's upwelling, sets where organic carbon is buried.
  - It replaces R and pCO₂ ∝ R² in `carbon.js`.
- **Drawn.** Productivity on the Climate view's sea (Open decisions); platforms in the relief.
- **Experiment: Pulse** (Experiments).
- **Oracles.** Carbonate chemistry against closed-form equilibria (its constants checked against their source). The pulse's three timescales. The thermostat's analytic balance, kept. Vegetation's relaxation, and water conserved through transpiration.
- **Cost** L. **Risk:** the thermostat is tuned for the opening at ~375–420 ppm; re-measure the opening's CO₂ drift.

### Phase 9. Dust

Dust comes last because it's the thread between the other three sectors. Built earlier, it would have to read its sources from stand-ins.

- **Sources.** Bare, dry ground (phase 8's bare fraction and phase 6's soil water), dry lake beds (phase 6's salt flats; Earth's largest dust source is one), and glacial outwash (phase 7). The template's wind lifts dust past a threshold speed, in proportion to a power of the wind (standard).
- **Transport.** Advection and diffusion along the season's winds, with settling, solved the way the moisture is (Jacobi passes on the GPU, as in `src/gpu/moisture.js`).
- **Sinks and effects.**
  - On ice and snow it lowers the albedo, so dirty margins melt faster.
  - On the sea it carries iron: more productivity, more organic burial, less CO₂ (Martin's hypothesis).
  - On land it adds to the regolith as loess (phase 7).
  - In the air, a small cooling.
  - Glacials are dusty (more bare ground, more outwash, more wind), so dust amplifies the ice ages.
- **Drawn.** The transported mass as ochre stipple crossing the sea and settling on ice, its density the dust load (Open decisions).
- **Survey: the ice ages.** With phases 6–9 the Ice ages experiment has its amplifiers: regolith, ocean carbon, dust and vegetation. Survey seeds and CO₂ for three things: the dominant period, the glacial–interglacial CO₂ swing (Earth's ~90 ppm), and dust (Earth's several-fold). Whether a 100-kyr rhythm emerges is the speculation the plan has carried since phase 3.
- **Fig. 7 redrawn** for the new nodes: the year, volcanoes, soil, lakes, regolith, vegetation, ocean carbon and dust.
- **Oracles.** Dust conserved (emitted = deposited). A one-dimensional plume decaying downwind over its length U/k.
- **Cost** M–L.

### Phase 10. The engine on the GPU

A session of its own, in three parts set by what phases 6–9 touch:

- **10a: plates, sea level, the surface's preparation** (`plates.js`, `crust.js`, `surface.js`). It's independent of phases 6–9, so it can run alongside them. The per-cell step (each cell's point location in the plate frames, the overlap and gap tests) is independent per cell, and the torque balance is a reduction. Merges, rifts and initiation can stay on the CPU. Measure first, then port the hot paths.
- **10b: the landscape** (`landscape.js`), after phase 7. The priority flood and the implicit stream-power solve are sequential; their GPU forms are iterative (Planchon and Darboux's filling, a scan over the receiver tree), so measure whether they win at level 7.
- **10c: the climate cycle** (the energy balance by complex multigrid, the template, the zones), after phase 9, which changes them.
- **Targets:** the dial's top (10 Myr/s) at level 7, a climate cycle under ~100 ms, and level 8 (28 km) measured for the surface. The CPU code stays as the headless reference.
- **Cost** XL across sessions.

### The dial, extended

| State | τ | Step | Live up to about | Closure when outrun |
|---|---|---|---|---|
| anomaly (6) | months–yr | 1 month | 100 yr/s | its variance alone: the zones' widths |
| aerosol (6) | 1 yr | 1 month | 100 yr/s | the mean forcing of the eruption rate |
| soil water, snow (6) | months | 1 month | 100 yr/s | its climatological year |
| lakes (6) | 10–10³ yr | 1 yr | 10⁴ yr/s | the equilibrium level |
| regolith (7) | 10⁴–10⁶ yr | landscape step | always | none: it accumulates |
| flexure (7) | ELRA's 3 kyr | when loads move | always | none |
| vegetation (8) | 10–10³ yr | 1 yr | 10⁵ yr/s | cover in balance with the climate |
| ocean carbon (8) | 10–10³ yr | 10 yr | always | none: an ODE |
| dust (9) | days | steady per phase | (diagnostic) | — |

At level 7 the monthly per-cell state is 164k cells × 1,200 months a second at 100 yr/s. On the GPU that's cheap. On the CPU its live limit would be nearer 10 yr/s.

### New couplings

| From | To | Through | Timescale |
|---|---|---|---|
| anomaly | season, rivers, zones | interannual T and P | yr |
| volcanoes | climate | sulfate aerosol | 1 yr |
| soil | climate, rivers | evaporation, runoff's timing | months |
| lakes | climate, rivers | evaporation, albedo, spill | 10–10³ yr |
| ice | lakes | dams, scoured basins | 10³ yr |
| ice | landscape | glacial erosion, till, outwash | 10⁴ yr |
| regolith | ice, soil, carbon | bed friction, water capacity, weathering's supply | 10⁴–10⁶ yr |
| loads | crust | flexure | 10³ yr–Myr |
| vegetation | climate | albedo (snow masking), transpiration | 10–10³ yr |
| vegetation | carbon, dust | land carbon, bare ground | 10–10³ yr |
| sea temperature | carbon | solubility | 10³ yr |
| sea level | carbon | shelf carbonate | 10⁴ yr |
| plates | carbon | carbonate subducted | Myr |
| rivers, upwelling | carbon | productivity, organic burial | 10³ yr |
| dust | ice, sea, regolith | albedo, iron, loess | yr–kyr |

### Considered, not taken

The 2026-11-14 brainstorm also covered the geology readouts (isotope proxies, a Geology view, following a rock, polar wander paths, seafloor fabric, rock types), the hand (a probe, sculpting, impacts, rain tracing), the rest of the year and the sea (ENSO, tropical cyclones, the weather's feedback to the climate, clouds, deep-water formation, tidal fronts, marine ice sheets, primitive equations), biodiversity, deep time (the long arc, true polar wander, an interior cutaway, water through the mantle), the sky (the Moon's rhythm, other planets, day and night), names and events, determinism and branching, and wild cards. The full list, with marks and costs, is `docs/IDEAS.md` at commit 8a7782d.

## Roadmap 2.0: people

Proposed by Claude and taken up by a9 on 2026-11-15 (Decisions). Hominins appear, spread and branch; one branch tips; farming, industry and compute follow, each writing into the layers 1.0 built. The planet needs few new sinks: NPP and the cover set what people eat, land use writes the cover, the land's carbon, the regolith, erosion, dust and the lakes, fossil carbon is the Pulse spread over centuries, industrial sulfate is the volcanoes' veil held up, acidification is the sea's Ω, and waste heat is one more forcing beside `F_VOLC`.

### One loop, run four times

The spine is Kremer's loop (standard, Kremer 1993, from memory): minds make ideas, ideas raise what the land carries, and what it carries makes minds. Each era changes what the minds are and what they draw on, and each transition should be a bifurcation of that loop rather than a scripted age. That is the difference from SimEarth (Maxis 1990, from memory), whose ages were stages ending in an Exodus.

| Era | Minds | Capacity from | The loop |
|---|---|---|---|
| Foragers | people | foraged NPP | closes only past a threshold in the connected population (the collective brain: Henrich 2004, from memory) |
| Farmers | people | cropland, 10–100× the people per km² | closed: Malthusian and hyperbolic |
| Industry | people | fossil energy | broken by the demographic transition (Galor and Weil, from memory): income stops becoming people, and growth turns exponential |
| Compute | compute | electricity | closed again with no demographic brake (Aghion, Jones and Jones; Davidson's compute-centric takeoff; from memory): hyperbolic, capped by the planet's energy and heat |

### The dial follows the doubling time

Under hyperbolic growth the doubling time is proportional to the time left, t* − t (standard). A dial that sets its rate so each doubling takes a few seconds falls log-linearly by itself. From the first hominins (~3 Myr before t*) to doubling times of hours is ~9.5 decades; the dial spans 10.5. At ~5 s a decade the arc plays in under a minute, from plate speed down to live weather, and the takeoff lands where the dial runs out (synthesis). The person can take the dial at any time; every layer's closure already handles every rate.

### Stages

**11. Foragers and the tree** (L; the riskiest).
- Density per lineage on the engine's grid; each lineage carries ancestry as fractions, so species are clusters, admixture is soft, and introgression can emerge (synthesis).
- Fisher–KPP spread (standard: a front at 2√(rD)) over a capacity from NPP, the cover's edible share, water and a cold limit that culture lowers; slope costs; sea crossings open with culture.
- A lineage splits when its range stays broken into isolated pieces (as `resolveFragments` does for plates); contact brings gene flow and competition.
- The first hominin is the one step with no mechanism: the experiment places it where tree–grass mosaics are (after Potts' variability selection, speculation).
- A branch tips when its connected population and learning capacity pass a threshold: culture ratchets up, capacity rises, the branch spreads.
- Without ice that swings, there are no glacial land bridges and no glacial pacing; the experiment's world may be chosen or set so that it doesn't need them (Decisions).

**12. Farming** (L).
- An origin hazard: settled density × domesticates (the zones' seasonally dry climates and grass cover, after Blumler via Diamond, from memory) × the climate's stability (the year's spread) × CO₂ (Sage 1995, from memory): Richerson, Boyd and Bettinger's "impossible in the Pleistocene, mandatory in the Holocene" as a model (standard hypothesis).
- Spread as a wave of advance (Ammerman and Cavalli-Sforza, ~1 km/yr, from memory), slowed by the climate's distance from a package's origin, so Diamond's axes either emerge or don't.
- The footprint: crops and pasture in the cover (albedo, evaporation, land carbon), erosion under fields 10–100× the geological rate (Montgomery 2007, from memory) into the regolith and the rivers, dust from bare fields, irrigation from lakes; the year's droughts become famines.

**13. Industry** (M–L).
- Fossil carbon in the plates' frames, as the regolith is: seeded at genesis from the opening's sedimentary settings (coal in wet, forested lowland basins, oil on shelves), topped up by the run's own organic burial (`CARBON.ORG`), reached where erosion exhumes it. Hubbert's curves come from mining a finite map.
- An organic economy's ceiling on income until fossil energy is tapped (Wrigley, from memory), so the revolution starts where the coal is.
- Downstream exists: CO₂ through the sea's carbon (the Pulse's theory as the oracle), sulfate as a standing veil, Ω on the shelves, the ice and the sea, dams as lakes.

**14. Compute and the takeoff** (M).
- A compute stock built by investment; AI labour is compute × algorithmic efficiency; ideas come from people and AI (semi-endogenous growth, Jones 1995, from memory).
- Energy from each cell's absorbed sunlight, the template's wind, discharge × relief, and fossil carbon.
- Waste heat as forcing: ~1% of absorbed sunlight is ~2.4 W/m², ~1.2 K on this energy balance before feedbacks (B = 2.09). The planet becomes a radiator, and the climate is where the takeoff shows (speculation as a scenario; the energy balance is standard).

**Across the stages:** the follow dial; a People view (dot density, a dot per N people, standard thematic cartography; fields as hatching; in the dark theme, dots lit by energy per person); a spindle diagram of the tree on log time (palaeontology's convention); People, Farms, Industry and Compute in Fig. 7. The red stays the mantle's.

### Experiments

Each a number against a theory, as in 1.0:
- **Dispersal**: the front's speed against 2√(rD).
- **Kremer's continents**: culture at a date against the landmass's connected population (his natural experiment, from memory: Old World, Americas, Australia, Tasmania, Flores).
- **Axes**: farming's spread east–west against north–south.
- **Long Anthropocene**: Ruddiman's hypothesis, farming on and off: the CO₂ it adds and whether the next glacial starts (wants the ice fix, and CH₄ for the other half).
- **Carbon budget**: cumulative emissions against peak CO₂, and the shares left in the air after 1, 10 and 100 kyr.
- **Takeoff**: knob, how far AI substitutes for people in research; number, the singularity date's interval, fitted as `tools/horizon-fit.mjs` fits the home page's.
- **Radiator**: warming per PW of use against 1/B with the feedbacks.

### Out

Agents, polities, war, named cultures, tech trees and ages (they turn fields into a game, and names and events were already considered and not taken). What a superintelligence wants is not modelled: alignment is a draw (Decisions, the ending), not a quantity that emerges, so the model says what each ending costs the planet and its people, not why it happens.

### Open for a9

- The endpoint is decided (Decisions, the ending: four by chance). Open: the draw's odds (even on each axis by default); how the People view reads (v2.0); and the planet's own runaway state (its climate holds to F_LIVE_MAX). (A kept Earth now keeps half its people: v2.0, Both ways.)

### The prototype

`tools/people/` and `tools/people-run.mjs`, headless, on a settled planet's fields read once and held fixed (the climate, the cover, the relief; nothing writes back yet). It answers one question first: on this planet's geography, does a tipping point and a hyperbola come out of the loop without being put in? The model is described in `tools/people/model.mjs`'s header and its constants in `PEOPLE`; the record of the first iterations follows.

### Prototype log

**v0 (2026-11-15).** Level 6, the opening's fields cached per seed (`tools/people/planet.mjs`, ~11 s a planet once). The loop in one equation: culture z (e-folds of productivity) per lineage and cell, dz/dt = A M − λ z, capacity ∝ e^{θz}; A is Kremer's constant (von Foerster's C = 1/(θA) ≈ 1.7×10¹¹ person-years: A = 6×10⁻¹²), λ Tasmania's loss (10⁻⁵/yr, ~10% in 10 kyr), M the minds within a contact length ℓ inside the connected body a cell's people live in. Foraging's productivity saturates at ×8 (the wild food), farming's at ×40 (the organic economy) until coal lifts it; the demographic transition fades growth with the income industry brings; compute buys minds per unit of output, rising e-fold per unit of z to a ceiling; energy is capped at 5% of absorbed sunlight.

Oracles (`tests/people.test.mjs`, 6 tests, ~2.5 s): a Fisher front within 7% of 2√(rD) less Bramson's delay and the sphere's curvature (from a settled disc: from one seeded cell the K/2 contour runs ahead of 2√(rD) for centuries); people kept by the spread to the leading edge's floor; competitive exclusion; culture at A M/λ; the saddle-node, holding at 0.9 of A θ e M₀ = λ at its lower root and running away at 1.1; with no loss, N = 100 N₀ at t*(1 − 1/100) within 2%.

Runs (`node tools/people-run.mjs {seed} 5e6`, 34–65 s each). Every seed runs the whole arc. Times before the fitted t* (people):

| | earthlike | b | c |
|---|---|---|---|
| tip | 62 kyr | 216 kyr | 151 kyr |
| farming origins | 2 (BS 14°, Cs 29°), 14–8 kyr | 3 (Cw, BS, Cw), 39–16 kyr | 3 (Cf, Cw, Cw), 24–10 kyr |
| industry, compute, ceiling | 831, 437, 309 yr | 588, 268, 125 yr | 743, 332, 173 yr |
| hyperbola's exponent, people / minds (R²; an exponential's) | 0.93 / 1.00 (0.97–0.98; 0.52–0.62) | 0.95 / 0.98 (0.94–0.97; 0.35–0.43) | 0.96 / 1.04 (0.96–0.97; 0.43–0.50) |
| lineages (splits, merges) | 10 (9, 3) | 3 (2, 2) | 3 (2, 1) |
| peak people; emitted; peak CO₂ | 0.53 B; 535 Pg C; 437 ppm | 0.70 B; 1,056; 572 | 0.54 B; 768; 479 |
| the follow dial (3 s a doubling) | 100 s | 105 s | 93 s |

What the runs say:
- **A tip and a hyperbola come out.** No date or curve is put in. The exponent near 1 is structural (ψ = 1 with a capacity ∝ e^{θz} gives exactly 1/(t* − t), the test's algebra), but the spatial loop keeps it through foraging, farming and contact growing, with R² well above an exponential's on every seed.
- **The threshold sits at a hominin world's size** (synthesis, the most interesting result and the most fragile). Kremer's constant and Tasmania's loss put the collective brain's threshold λ/(Aθe) at ~6×10⁵ minds within reach, which is the scale of a Pleistocene hominin population. Whether a world tips depends on its largest warm continent: with contact alone growing, seeds `b` and `c` (0.6–1.7 M hominins) sat at the threshold for 5 Myr and never tipped; with the trait also raising foraging's yield (e^{0.1 g}, speculation) all three tip.
- **The hominin era's length is a clock**, the trait's rate (S_BG): ~1.7–1.9 Myr here, tuned, not emergent. Which lineage tips, where, and when relative to the geography is the emergent part.
- **The arc compresses after the tip.** Industry to compute to the ceiling takes 300–800 years, and the demographic transition arrives at ~0.5 B people (Earth's ~1 B at industry, ~8 B now): population can't outgrow r = 2%/yr once productivity runs, so the transition comes as soon as industry lifts the organic ceiling.
- **The ending is an input.** The minds level off at X_MAX × the energy cap (3×10¹⁶), and the radiator's 5.6 K is F_SUN read back through B; "the dial runs out" lands at the same moment as the cap.
- **The follow dial plays an arc in ~100 s**, about 40 of them hominins, 15 farmers and 35 compute: twice the minute the plan guessed.

Fixed on the way (each found by a run, not by reading): the trait first multiplied the innovation rate, so after the tip culture exploded (minds doubling in a day within 1 kyr); a resolvent of contact per edge kept the minds within reach at band scale (~10³), so nothing tipped; Gompertz growth's per-capita rate is unbounded at low density (fronts set by the population's floor), so growth is logistic; the transition keyed on income y = K/N stopped growth on every empty frontier (land is income too), so it keys on industry's share; the first seed sat on an islet for 5 Myr (the mosaic score's coastal bonus); each lineage growing into the room the others left at the step's start overshot together (population swinging ×4), so competition is solved exactly; lineages that met stayed separate labels, so they merge; the energy cap's multiplicative feedback oscillated and hung the radiator's stop.

Next, in order:
1. **Write back.** Run on the `Planet` itself rather than its cached fields: land use into the cover and its carbon, emissions into `OceanCarbon` (the Pulse's chemistry, not v0's three-exponential fit), sulfate as a standing veil, waste heat as a forcing in the energy balance. This is the coupling the thesis is about, and the radiator stops being an input.
2. **The world set up** (Decisions): the orbit's swings in the habitat (rain and cold) as the pacing of hominin ranges, refugia and splits; with a static climate the tree only branches where deserts already cut the range.
3. **The compressed late arc:** population through the transition (mortality falling before fertility), industry's spread time, renewables and compute's spacing in z.
4. **The experiments' numbers from runs:** Kremer's continents (culture at a date against each landmass's connected population), Axes (farming's spread east–west against north–south), Dispersal (the front against 2√(rD) on the planet's lattice: forager fronts are 14 km wide against 120 km cells, and a 1D lattice's linear speed there is ~1.0 km/yr against the continuum's 0.57, so the oracle is the lattice's).
5. **Surveys across seeds** (`tools/people-survey.mjs`): how often a world tips, how many farming origins, the spread of t*, the follow dial's length.

**v1's design: the factors split, and the write-back** (a9, 2026-11-15: "let's try this model"). v0 was Kremer's two factors, land (NPP as capacity) × ideas, with labour the Malthusian residual, energy only as ceilings and no capital. v1 splits the factors where a split brings its own dynamics and lands on a layer the planet has, and switches each on by era, so the early eras stay as simple as v0's.

| Factor | Rival | Grows by | Lost by | On the planet | From |
|---|---|---|---|---|---|
| Flows: sunlight, rain, wind | — | (a rate per area) | — | NPP, absorbed sunlight, the template's wind | foragers |
| Soil, a renewable stock | yes | Heimsath's production (`regolithStep`) | erosion, 10–100× under tillage on slopes (Montgomery 2007, from memory), less as conservation comes with z | the regolith, and through it the soil's water capacity | farmers |
| Forest, a renewable stock | yes | the cover's own regrowth | clearing for fields | the cover's trees and their carbon | farmers |
| Fossil carbon, non-renewable | yes | — | burning; its energy return falls as it's drawn down | the seeded map, then `OceanCarbon` | industry |
| Ores, non-renewable | yes | — | extraction, whose energy per unit rises as grades fall (Goeller and Weinberg; Skinner's barrier past the crust's rich ores; from memory) | aggregate in v1 (the map from arcs, flood basalts and laterites is later) | industry |
| Ideas z (and AI's weights) | no | minds within reach | forgetting, λ | — | all |
| Fixed capital | yes | saving, s Y | δ ~ 5%/yr | — | industry |
| Energy capital (fossil, surface renewables, fusion) | yes | investment to meet demand | δ ~ 4%/yr | renewables capped at F_SUN of absorbed sunlight | industry |
| Compute | yes | investment where it earns most | δ ~ 25%/yr (chips last ~4 yr) | its power draw | compute |
| Labour, people and AI | yes | births; building compute | — | — | all |

- **Production** (standard forms): food stays the Malthusian capacity (v0's, now × the soil's yield factor 1 − e^{−h/0.3 m} and CO₂'s fertilization), lifted past the organic ceiling where industry's energy reaches it. Industrial output is Y = A(z) K^α L^{1−α} (α ⅓, saving ¼), held to the energy it can get (Leontief in energy, with an intensity falling with z: 200 W per subsistence-year a year at industry's start, ~80 at Earth's present, from memory).
- **AI is capital that does labour** (synthesis on Aghion, Jones and Jones; Davidson; from memory): compute's minds are the compute stock × χ(z), rising e-fold per unit of z to a physical ceiling (speculation), drawing power. They join people in production and in research through a CES of elasticity σ: below 1, the tasks AI can't do bottleneck growth (Baumol), above 1 labour becomes something you build, and the demographic brake is gone. σ is the Takeoff experiment's knob.
- **Investment** goes to energy first (to meet demand, to the source with the best return), then between fixed capital and compute by their marginal products. Building capital needs materials, so ore depletion raises its energy cost.
- **Heat** (standard energy balance): surface solar is heat-neutral to first order (it takes sunlight the ground would have absorbed); fossil carbon and fusion add heat. The radiator binds only on the energy from beyond the surface's sunlight, so in v1 its ceiling (HEAT_MAX, W/m²) is fusion's, kept at v0's 11.8 W/m² until the ending is chosen. An off-world supply of ores (asteroids) is a backstop on materials' energy cost, off by default: it belongs to the same decision.
- **Stores** (working capital's one distinct role, seed grain and granaries against the year's droughts) wait for the live year's anomaly: v1.1.
- **The write-back** (`tools/people/couple.mjs`), from the first farming origin on (the hominin era runs on the cached opening, held fixed). The coupler steps a `Planet` alongside the people and changes nothing in `src/`: emissions go to `carbon.pulse`; the farmed share scales the cover's tree equilibrium and clips its trees (the cover's own carbon, albedo and evaporation do the rest); farming's erosion is added to `land.erosion` around each fast step (the regolith's exact step strips it); waste heat and sulfate are added to `F_VOLC` around each climate cycle. After each cycle the people re-read the climate, the cover, the soil, the sea level and the ice.
- **Oracles:** the Solow steady state K/Y = s/δ; the CES's three limits (σ → 0 min, σ = 1 Cobb–Douglas, σ → ∞ the sum); fossil carbon kept (burned = emitted); soil at h₀ ln(P₀/E) under farming.

**v1, as built (2026-11-15).** The factors are split as above. In place of a plain CES, AI enters through a task CES (synthesis on Aghion, Jones and Jones): a share β(z) of tasks can be automated, AI and people substitute within them until AI fills them, and past that the tasks combine at σ (0.5 by default). A plain CES with σ < 1 makes every input with weight essential, so production would collapse the moment AI's tasks appeared before any compute existed. Ten oracles pass (`tests/people.test.mjs`, ~3 s). `LIVE=1` writes back to a live planet from the first farming origin; the planet's side costs ~10 s of fast steps and ~75 s of climate cycles a run.

Calibration anchors (a9, 2026-11-15): fossil carbon is still the cheaper delivered energy, and Earth is early in its takeoff. So Earth's present is read as β = 0.15 (the `present` event), and the renewables' crossover is set after the takeoff's start (Z_REN 11.5 against Z_AI 11).

| | earthlike | b | c | earthlike, live |
|---|---|---|---|---|
| tip → the end | 51 kyr | 221 kyr | 153 kyr | 55 kyr |
| farming origins | 5 | 4 | 4 | 5 |
| industry → early takeoff (Earth ~245 yr) | 174 yr | 186 yr | 231 yr | 189 yr |
| at early takeoff: people, energy, burned, CO₂ (Earth ~8 B, ~19 TW, ~500 Pg C, ~420 ppm) | 2.42 B, 2.7 TW, 39, 296 | 2.05 B, 2.3 TW, 34, 294 | 1.83 B, 2.2 TW, 38, 295 | 2.12 B, 2.5 TW, 38, 296 |
| early takeoff → AI's labour passes people's → the ceiling | 37 → 17 yr | 42 → 26 yr | 44 → 24 yr | 44 → 24 yr |
| fossil carbon burned of 5,000 Pg C; peak CO₂ | 4,778; 2,455 ppm | 3,953; 1,926 | 4,692; 2,404 | 4,056; 1,915 (the sea's chemistry) |
| the people's hyperbola: exponent, R² (an exponential's) | 1.01, 0.98 (0.52) | 0.93, 0.96 (0.39) | 0.96, 0.97 (0.43) | 0.97, 0.98 (0.53) |
| the follow dial | 175 s | 169 s | 165 s | 172 s |

The live planet at the end: 25.6 °C (12 K warmer than the opening), CO₂ 1,523 ppm, the land's carbon 3,028 Pg C (900 more, fertilized), trees on 43% of land, the regolith's mean 0.84 m (0.88 at the opening). The sea's 2.8 m fall is the planet's own ice growing over the 24 kyr from its opening, not the people's.

What v1 says:
- **The industrial era keeps Earth's clock.** Early takeoff comes 174–231 years after industry on every seed (Earth's ~245) with z grown about Earth's e^{2.7}. The scale doesn't: 1.8–2.4 B people against 8, and with them energy, emissions and CO₂ ~10× short. Energy and output per person are near Earth's, so the miss is the population: it grows ×2 after industry, where Earth's grew ×8.
- **A takeoff that starts while fossil carbon is cheapest burns it** (a9's anchors, the model's answer). 79–96% of the 5,000 Pg C burns, most of it within ~70 years around the takeoff, fossil carbon peaking at 1,500–2,000 TW (~100× Earth's now). Renewables pass it only after AI's labour has passed people's. Peak CO₂ is 1,900–2,450 ppm, and the live planet warms 12 K. That's the Carbon budget experiment's number, and its knob is the renewables' crossover against the takeoff.
- **Ruddiman's signal comes out of the cover** (live). Farming's clearing takes the trees from 45.7% to 39% of land, the land loses 213 Pg C and CO₂ rises 280 → 297 ppm, then the sea and regrowth draw it back to ~283. Ruddiman's case is ~20 ppm by the pre-industrial (from memory). Nothing was tuned for it: it is the Long Anthropocene experiment's number arriving early.
- **AI makes the loop steeper than a hyperbola.** The people's curve stays at exponent ~1. The minds' steepens to ~3 in the takeoff (R² 0.83), since compute both grows from output and multiplies per unit of capital. The takeoff holds most of the arc's doublings (~30, from ~10⁹ minds to 3×10¹⁸ in ~40 years), and on the follow dial it takes ~100 of ~170 s.
- **Soil holds at the grid's scale.** Farmed soil stays at 0.6–1 m: slopes between 120 km cells are gentle, so tillage's erosion seldom outruns production. Montgomery's depleted heartlands need the slope within a cell.
- **The ending is still the inputs.** The minds level at X_MAX × compute's share of the energy ceiling, and the 11.8 W/m² of heat is HEAT_MAX: the ending is still a9's to choose.

Fixed on the way (each found by a run):
- Energy was Leontief across the whole economy, so when potential output raced ahead compute got the same sliver as everything else. Compute now draws first, then materials, then output.
- The demographic transition faded growth from income 1, so it began before industry's food could be used. It starts at 8× subsistence, fading over 12.
- Renewables were set at parity with fossil carbon now; a9 corrected that.
- The radiator capped fusion only, so the takeoff burned fossil carbon at 11,900 TW. Fossil carbon and fusion now share the ceiling.
- Industry's food lift followed the economy's energy shortfall. It follows farming's own energy (E_AG a person fed).
- The organic ceiling was ×40. It is ×100.
- Culture raced to z ~ 34,000 at the step's floor. It is held at Z_SAT, past which nothing in the model changes.
- People diffused down density, so after the transition the rich world drained into the poor and died there. They now spread down crowding N/K, toward the ideal free distribution.
- Farming's explicit logistic sent the farmed share negative when the live climate moved a package's suitability below it, and the sea's solver failed on the cover's carbon. It is exact now.
- The spread weighed edges and crowding by different capacities, and conjured 10³⁵ people. One capacity, the lineage's best, serves both.
- The coupler let the regolith's last opening re-make take tillage as its balance. The regolith now settles before any tillage is added.

**v1.1, births and deaths (2026-11-15).** The logistic gave way to births and deaths (`demography`), synthesis on the demographic transition's standard stages, Earth's rates from memory:
- deaths go by food per person: hunger below subsistence, disease at density;
- medicine cuts deaths as industrial income rises;
- births fall with industrial income only, so a well-fed frontier keeps its births;
- before industry, births equal deaths at the food capacity, so the pre-industrial world is unchanged, and an empty frontier still grows at B_PRE − D_LO = 2%/yr (the Fisher oracle's r);
- mortality falls first (deaths × ~0.5 at 4–6 subsistence-years of industrial income) and fertility later (half its fall past ~15).

Both sides of the food capacity are logistics, solved exactly; an oracle checks the stages' order. On three seeds and live:
- people at 0, 50, 100, 150, 200 and 250 years after industry: 0.57–0.61, 0.68–0.72, 0.88–1.00, 1.5–2.5, 4.0–4.7 and 6.2–8.1 B (Earth's, from memory: 1.0, 1.3, 1.6, 2.5, 6.1 and 8.1 B at ~1800–2025);
- the peak 9.4–9.8 B;
- the people's hyperbola at exponent 0.98–1.03 (R² 0.97–0.99);
- early takeoff now 162–187 years after industry (more people, faster culture: a little ahead of Earth's ~245), with 3.3–3.4 B people and ~2.9 TW (0.85 kW a person, against Earth's 2.4: output a person is now the short one);
- fossil carbon burned 4,090–4,670 Pg C, peak CO₂ 2,000–2,300 ppm; the live planet ends at 26.0 °C and 1,765 ppm.

**v1.2 (2026-11-15).** a9's asks: soft forms instead of hard caps, output per person, food stores, then capability from effective compute and robotics.
- **Soft forms, chosen by what each cap stands for** (`softMin`, p the sharpness):
  - sums over uneven units are harmonic: surface renewables' sites (p = 1); research intensity, dispersal, contact length and the food lift (p = 4);
  - thresholds are logistic hazards: industry's ignition, the farming and industry spread gates;
  - energy against the capital–labour bundle is a CES (σ_E 0.3, energy's cost share 7%: `energyCES`; standard KLE);
  - the energy intensity's floor is an exponential approach; Skinner's step is a logistic in the grades;
  - the trait nears its ceiling as (1 − (g/G_MAX)⁴);
  - industry's farming is held at LIFT_MAX × the organic ceiling (an uncapped e^{z−3} had fed 10¹⁶ people);
  - the heat budget stays sharp (P_HEAT 4) and flagged: it is a choice, the ending's. The principled replacement is a cost (compute's cooling as the surface warms, or crops' heat stress), which would make the radiator a result: for a9.
- **Output per person** at early takeoff is now 22–27 subsistence-years (Earth's ~20–25), with output at 96–98% of what its factors could make (68% under Leontief energy). A_I0 0.7. Capital/output stays 1.5–2.2 against Earth's 3–4, because TFP grows ~4.5%/yr by then (the hyperbola's acceleration).
- **Food stores** (working capital's distinct role), a closure in `demography`:
  - a harvest spread E_RAIN × the year model's annual log-rain spread (`sigP` in the cache, v3), halved by rivers, halved for foragers;
  - pooled by trade, √(1 + τ(ℓ/1500 km)²) once industry comes;
  - granaries hold up to S_MAX = 0.5 years' food as culture grows;
  - famine's expected deaths are F_FAM y σ G(u/(yσ)) beyond the mean's;
  - seed grain is 1/R of the harvest (R from 4, rising with culture);
  - Richerson's stability enters farming's origin hazard (× e^{−σ/0.15}).

  The pre-industrial base dropped with the seed and the famines, so F0 went 1.5 → 2.5.
- **Births and deaths, refit:** the long-run floors (births 0.8%, deaths M_MIN 0.25 × D_LO plus aging AGE 0.6% × (1 − e^{−y_g/30})) keep growth near none after the transition without slowing the transition itself.
- **Capability from effective compute** (a9: "switch to effective compute"; `capability`):
  - effective compute is the compute stock × e^{θ_C (z − Z_AI)};
  - β_c is a logistic in its log₁₀ across the FLOP gap (20% at X20 8.7, ~98% four orders on; Davidson, from memory);
  - β_p, for physical tasks, is the same 1.5 orders further (Moravec, speculation).
- **Robotics** (a9's question; `labour`):
  - tasks split cognitive and physical (Φ 0.5), combined at σ_G 0.5;
  - physical AI work needs bodies: robots are capital (50 sy a body at Z_AI, cheaper e-fold per 2 of z, worn 10%/yr, 400 W);
  - investment goes among fixed capital, compute and robots by marginal products taken as differences in labour, so compute's includes the capability it buys;
  - 5% of investment past energy always buys ordinary computing.
- **Research compute** (found: with compute bought only for production, research stayed with people, since ideas have no market return):
  - R&D's share S_RD 3% of output × β_c;
  - plus research's share Q_R 0.4 of AI's compute (labs train and research beside deploying);
  - it runs AI's research minds and adds to the training runs.
- **First reading on effective compute** (earthlike, before Q_R): β_c crosses the FLOP gap in ~30 years from early takeoff (0.08 → 0.98) and β_p reaches 0.85; output grows ×280 in ~32 years (doubling every ~4 years by the end). Research minds stayed flat until research compute was tied to AI's (v1.3 has the run with it).
- **Run ends:**
  - both task groups' β ≥ 0.95 with minds and output flat for 20 years;
  - or a century past the dial;
  - or 3 kyr after industry with no takeoff.
- Oracles: 13 pass, including the soft forms, the partial expectation, the energy CES and the famine closure.

**v1.3 (2026-11-15): the takeoff's shape, and its aftermath.** a9: "why are takeoffs slow? i'd expect something more like hyperbolic."
- **The first dial was an artifact.** Materials' energy was charged on the last step's investment, ahead of output. A large step's building took the next step's energy, output fell to nothing, and the step after flipped back; the minds flipped with it, which read as doubling in under a day. Building's materials now come out of the step's own investment: output's energy per unit is e_Y + e_m M_K s, with s the step's investment share solved as the one fixed point (the share realized falls as the share charged rises: bisection). The dial's test takes the minds' growth over the last five steps.
- **The hyperbola**, with research compute tied to AI's (Q_R), alike on three seeds and live. AI's research minds pass people's ~35 years after early takeoff; from there ideas raise compute's efficiency and compute makes ideas (dz/dt ∝ K_q χ(z), χ ∝ e^z, finite-time). The minds' doubling time falls from 100–800 years 30–40 years before the dial to ~8 at 10, ~2.4 at 5, 0.8 at 2, 0.4 at 1 and 0.14 at 0.3 years before: within a factor ~2 of t* − t. The ideas reach the guard Z_SAT within days of the dial. Fit from the first tip: the minds' exponent 1.9–2.4, the people's 0.92–1.0.

  | seed | early takeoff (yr after industry; people; sy a person) | AI's labour passes people's | the dial (after early takeoff; energy) | the end |
  |---|---|---|---|---|
  | earthlike | 193; 3.5 B; 22 | +25 yr | +39 yr; 9,100 TW | +34 yr after the dial: 3.3 B, 8 × 10¹⁴ sy/yr, 10,800 TW, CO₂ 2,370 ppm |
  | b | 273; 3.3 B; 24 | +25 yr | +40 yr; 9,100 TW | +35 yr: 3.0 B, 9 × 10¹⁴, 10,800 TW, 2,370 ppm |
  | c | 343; 2.5 B; 26 | +31 yr | +50 yr; 9,200 TW | +119 yr (the century's cap): 1.9 B, 2–11 × 10¹⁴ (cycling, below), 10,600 TW, 1,780 ppm |
  | earthlike, live | 196; 3.3 B; 23 | +26 yr | +42 yr; 9,300 TW | +39 yr: 0.27 B, 6 × 10¹⁴, 10,800 TW, 2,430 ppm, the planet at 26.3 °C |

- **Machines run as far as they pay for their power.** Compute and robots had drawn power first; once bodies were cheap (cost e-fold per 2 of z), robots took the power output needed and output fell while they ran. Now research's compute is powered first (its budget pays), then production's compute (the brains, ~W_C/χ a worker-equivalent), then the robots at the running share that makes the most output (golden section within what the power allows). Idle machines earn nothing at the margin. Where energy binds, robots stand idle.
- **Materials: Lasky's rule, bounded at Skinner's barrier.** Materials' energy had risen as e^{X/X_SCALE} without bound, so once the rich ores were drawn the building took all the energy and the economy decayed to nothing. Now the grade falls arithmetically as the tonnage drawn rises geometrically (Lasky's rule, from memory) from X_SCALE to G_B = 0.3 of the first grade at the rich ores' end, energy ∝ 1/grade, then ×SKINNER in common rock (×33 in all; the lumped number speculation).
- **Investment where its return covers its cost.** A fixed 25% saving had built capital that couldn't be powered and energy capital at the sites' vanishing margins, each carrying its materials' energy. Each part of investment now passes a smooth switch in log(return/cost), W_INV 0.1: capital's return is its marginal product × the capital–labour bundle's share in the KLE CES (s_KL, falling to nothing where energy binds), energy's is λ_E (output a W at the margin) × its margin's W a sy; the cost is wear + R_MIN 3% (a real rate, from memory), × 1 + e_m M_K λ_E for the materials' energy. The rest is consumed. Before the takeoff the switches stay open (returns 2–30× their cost).
- **Replacement in the long run:** births' floor B_MIN = M_MIN D_LO + AGE (0.975%), so a rich population neither grows nor dies out (0.8% had a rich world shrinking e-fold every ~570 years, extinct within ~10 kyr of the dial). Earth's rich countries sit below replacement now; heritable fertility would bring it back over generations (speculation). An oracle checks it.
- **The aftermath:**
  - every source sits at its ceiling: the sun's 6,000 TW and the radiator's 11.8 W/m², ~10,800 TW;
  - all 5,000 Pg C of fossil carbon is burned within ~5 years of the dial. It shares the radiator's budget with fusion, it is the cheaper of the two, and nothing prices its carbon. CO₂ reaches ~2,400 ppm;
  - output is ~10¹⁵ sy/yr, ×10⁴ early takeoff's, energy-bound (at 0.0004–0.002% of what its factors could make);
  - robots stand idle and production's compute decays, since nothing pays to power them;
  - 2–3.3 B people remain.
- **Live: the people don't outlive the radiator.** The planet warms from 13.5 °C to 15.9 °C by the dial, then to 26.3 °C (CO₂ 2,430 ppm, 11.5 W/m² of heat). Land's food capacity on the hot planet falls ~60%, and the people are crowded down to it: from 2.7 to 0.5 billion within a year of the climate's jump, 0.27 B by the end (famine counts only the harvests' spread, so it reads 0). The model has no food bought with energy apart from the land's lift. At 10⁴ TW, controlled-environment or synthetic food at ~1–10 kW a person would feed them many times over (speculation). It is open, with the ending.
- **Open: the saturated world.** Past the guard, TFP is e²³ and any sliver of capital saturates the energy. Fixed capital and production's compute decay until capital's return revives and its switch reopens: on seed c within the century, output cycles ×5–7 on a ~40-year beat (energy and heat steady); past ~1 kyr the energy capital cycles too. This lies beyond the arc's end. A ceiling on TFP (output per joule is bounded), or ending the arc at the dial, would settle it.
- Oracles: 13 pass.

**v1.4 (2026-11-15): the timelines, and four endings by chance.** a9: "irl we're heading for ASI in ~2027-28; does this square with the timelines?"; and the ending up to chance on two axes, with food from energy (Decisions).
- **The timelines didn't square**, even counting from deep learning: the gap was the rate, not the start. At early takeoff effective compute grew ~1.5×/yr: the compute stock ~25%/yr, and AI's efficiency, tied to the general idea stock at θ_C = 2, ~15%/yr. Measured, frontier effective compute grows ~10×/yr: training compute ~4–5×/yr, algorithms ~3×/yr (Epoch, from memory). AI's efficiency is its own fast field, so θ_C = θ_AI = 25 (z grows ~0.08 a year there): effective compute now grows 0.8–1.0 orders a year at early takeoff on three seeds. Z_AI 10.35 keeps early takeoff near the output it had (at 11, early takeoff moved later and to 110 sy a person).
  - Early takeoff: 199–348 years after industry, 2.5–3.6 B people, 6–8 TW, ~85 Pg C burned, 42–46 sy a person. Earth's: ~245 years, 8 B, ~19 TW, ~500 Pg C, 20–25 sy (from memory). The model's industrial era is still too light and its people too few.
  - AI's labour passes people's 3–4 years after early takeoff, robots' ~0.5 years later, and the dial runs out 4.1–5.2 years after early takeoff. With early takeoff at ~2024–25, the dial is ~2029.
  - The minds double every ~20 years in the people's hyperbola, flatten through the demographic transition, then double every ~9 years 2 years before the dial, ~0.8 years at 1 and ~0.16 at 0.3. The AI hyperbola is the last two years.
- **Food bought with energy** (Z_SYN at the AI era): synthetic or indoor food and shelter at W_FOOD = 3 kW a person (~1 kW electrochemical-microbial to ~20 kW under LEDs; speculation). It is bought for the people the land can't feed, ×2, ahead of everything else. Room up to 20× the people is bought as far as it costs under 1% of their income at energy's price at the margin, so before AI none is bought and after the dial room is nearly free (20× the people at 3 kW is ~200 TW). It enters each cell's capacity beside the land's. The first tries killed the economy at ignition: a logistic's tail far below its era, sized to the room, claimed more energy than the newborn industry had.
- **The ending** is drawn at early takeoff from the seed (`people:ending`), even on each axis (P_ALIGN, P_PRESERVE; ENDING forces one). Its levers move with AI's share of the work it could do at full power (sA), handed over over T_SA = 2 years:
  - **Earth's heat budget** goes from people's HEAT_MAX (11.8 W/m²) to 1,000 W/m² sacrificed (Earth a radiator at ~385 K) or 0.1 W/m² preserved. Preserved, fossil carbon stays in the ground (×(1 − sA)) and farms return to forest as food comes from energy.
  - **Off-world industry** (Z_SPACE 12): space solar adds no heat on Earth and is capped softly at a tenth of the Sun's output (F_DYSON, speculation); asteroid materials bound materials' energy at E_SPACE.
  - **Preserved:** CO₂ is drawn back toward 280 ppm over T_CDR = 30 years by capture at 2.2 × 10¹⁹ J a Pg C (direct air capture, ~6 GJ a t CO₂, from memory). Sulfate holds the forcing at none meanwhile. Live, the capture is a negative pulse into the planet's own carbon.
  - **Misaligned:** humans' control follows sA down over T_DIS = 30 years (gradual disempowerment, Kulveit and others 2025, from memory), and their births follow it (b × control: no floor). Sacrificed (1a), people's goods and bought food follow control down too.
  - **Aligned:** people move between Earth and space as it opens, 0.1% a year each way by choice (back in proportion to Earth's habitability; a9, after v2.0: "offworlders migrate back to earth too"), and up to 50% a year leave as Earth's habitability fails. Each needs 10 kW off-world.
  - **The runaway:** past F_RUN = 40 W/m² of forcing (absorbed past ~282 W/m², Goldblatt and others 2013, from memory), the excess boils the oceans (3.7 × 10²⁷ J: 1.4 × 10²¹ kg from 15 °C, standard). Earth's land capacity × 1/(1 + (ΔT/12 K)⁴) (half the land past wet bulbs of 35 °C at ~12 K, Sherwood and Huber 2010, from memory) × the oceans left; ΔT is F/B on the cached planet, and live only the forcing past what the planet is given. Bought food lasts until the oceans are gone.
- **Two flip-flops** were found on the way and fixed. sA from the AI labour realized made a preserving AI's fossil cut take the power AI ran on: AI's share fell, the fossil came back, and so on step to step. It now counts the work AI could do, handed over gradually. Room bought only for the unfed left a rewilded Earth near capacity, where crowding at replacement births shrank the people ~0.1% a year.
- **The four endings** (earthlike, forced; seeds b and c drew 1a and 2a; years after the dial):

  | ending | Earth | the people | the end, +300 years |
  |---|---|---|---|
  | 1a misaligned, sacrificed | the runaway at +0.2, fossil carbon spent at +0.4, 1,000 W/m² by +20, the oceans gone at +237 | control below half at +22; the last die at +127 (b: +126) | none; 3.6 × 10²⁵ W off-world |
  | 1b misaligned, preserved | off-world energy past Earth's at +0.1; Earth's heat 0.1 W/m² by +20; CO₂ peaks at 346 ppm and is back at 282 by +100; sulfate at most −3.4 W/m² | control below half at +22, 4% by +100; 3.6 → 1.75 B at +100 | 0.24 B, falling ~1%/yr |
  | 2a aligned, sacrificed | as 1a | more off-world than on Earth at +1.5, Earth empty at +28 (c: +27) | 3.5 B off-world, Earth boiled dry |
  | 2b aligned, preserved | as 1b | 3.5 B, slowly off-world by choice | 2.4 B on Earth, 0.9 B off-world |

- **Live** (the planet given at most F_LIVE_MAX = 30 W/m²):
  - sacrificed: the planet warms from 13.5 °C to ~35 °C. CO₂ peaks at ~2,600 ppm and the sea draws it to ~1,430 by +300. Trees spread to 66% of a hot, wet land (land carbon 2,000 → 3,500 Pg). The oceans' boiling is the people's to count: the planet's climate has no runaway state.
  - preserved: CO₂ peaks at 351 ppm and is drawn back below 300 (120 Pg C taken back), to ~280 by +300; the planet holds at 13.3 °C; farms go down to 0.01% of land and trees come back to 40% of it. 2b keeps 3.1 B people (2.3 on Earth, 0.8 off-world); 1b falls to 0.22 B.
- **Open:**
  - the swarm's pace: a tenth of the Sun's output within ~5 years of the dial, since nothing bounds the build-out but output's growth (speculation; launch and mining rates would slow it);
  - the planet's own runaway (to show the oceans boil in the sim);
  - the odds;
  - goods a person past the dial (10¹⁵–10²⁵ sy) mean little;
  - early takeoff's industrial era is still light (6–8 TW and 85 Pg C against Earth's ~19 TW and ~500 Pg C).
- Oracles: 14 pass, with food and capture powered first, off-world energy heating nothing, and a preserved Earth within its heat budget.

**v2.0 (2026-11-15): into the sim.** a9: "then we can get to building it into the sim." The People experiment (`?exp=people`; `&ending=` forces one):
- **Threads.** The model moved to `src/engine/people.js` (the tools and tests import it there) and runs on its own worker (`src/engine/people-worker.js`), linked to the engine's by a `MessageChannel` the page hands both, so its steps never stall the planet's. It runs at level 6 whatever the engine's (its constants are fitted there; at level 7 a step would cost four times as much): after each climate cycle the engine restricts its fields to level 6 (`fieldsOf` with a transfer: area-weighted, the rivers' discharge and the lakes' share by the most within a cell) and prolongs the write-back. The write-back's engine side is `src/engine/peoplelink.js` (`PeopleLink`), which tools/people/couple.mjs now uses too, so page and headless write back alike: carbon pulsed before each fast step (no lower than 100 ppm), tillage added to the erosion field around it, land use on the cover's tree balance as each cycle sets it (a hook, `Life.onCover`, right after the cover's climate), the forcing as `CLIMATE.F_PEOPLE` (a term beside `F_VOLC` in both energy balances: the year resets `F_VOLC` each step), and the sea's boiled share (`Tectonics.boiled`; `seaWater()` feeds the CPU's and the GPU's sea level, re-solved each thousandth).
- **The clock.** The first hominins are placed on the climate's first cycle's fields (their rates re-read as it settles). The page's ticks owe the people years; they step at their own pace (`People.nextDt`, as headless), a shorter step only once the owed years have waited 50 ms, and the page holds its clock while they're owed more than a quarter second's worth. The dial event moved into the model (`People.record`: the minds doubling in under a day, steps at most a year for T_FINE = 300 years after).
- **The follow dial.** While it holds the dial, the rate is set so a doubling or halving of what changes fastest takes the knob's seconds (`People.pace`: the minds over the last 20 steps; from early takeoff also the energy and the people on Earth and off it, so the ending's slow parts set the pace once the minds stop racing), within the dial's range and what the people keep up with (a step's years over its cost on 80% of their thread), eased over 0.6 s apart from the dial's input (which snaps to 0.05). Taking the dial by hand ends it; the knob starts it again.
- **The People view** (the fifth, shown only in the experiment): a chart's base with the ice sheets; people as a graphite stipple by log density (22 px apart at 0.001 a km², 3 px at 1,000), darker where they use more energy, and in the dark theme lit toward ochre by it (the night's lights); farms as a sap hatch on the Climate view's tesserae, each farmed with the cell's share and furrowed its own way (parcels); the veil, with the people's sulfate in it (−25 W/m² per unit optical depth, standing at every dial). The caption: the era (hominins, foragers, farmers, industry, takeoff, after the dial), the people's year, how many on Earth and off it, lineages, farms' share of land, energy and CO₂, AI's share of the work, the ending, the oceans boiled, the doubling the dial follows. Fig. 7 has a People node (food in; farms, tillage, carbon, forcing and the boiled sea out).
- **The endings' marks.** A swarm round the Sun (`sky.js`: off-world energy's share of its output as collectors on seeded orbits, 900 at F_DYSON's tenth, the disc dimmed by the share); forests returning through the cover as farms go; the sea level falling as the oceans boil (the shelves, then the basins, drain). The planet's climate still holds to F_LIVE_MAX (30 W/m²): a runaway state of its own isn't built.
- **The step's cost.** Dispersal is now taken per cell, an edge's the geometric mean of its ends' (the law at their mean culture wherever it is exponential in it, below its cap), and a cell with one lineage takes its whole growth without the shares' logs: a step went from ~16 to ~5 ms with one lineage, and is ~14 with eight (node, level 6), the record unchanged to three figures; the oracles pass. Before any lineage tips a step may be 2,000 years (`DT_EARLY`): on earthlike (ending 1a forced) the first tip comes at 1.75 Myr against 1.77 in half the steps (3,260 against 6,190), and the rest within the seeds' usual spread (early takeoff 365 years after industry against 263, 4.1 B people against 3.0, 111 Pg C against 87); longer steps after the tip let several farming origins fire at once (8 packages against 3), so DT_MAX stays 500 there. On the page the forager era runs at ~100 kyr/s.
- **The air's datum.** The first run on the page to an ending (1a) drained the sea 6.7 km as the oceans boiled, and the planet froze (−24 °C, 369 m of sea in ice): the climate's lapse rate and the ice's mass balance measured heights from the falling sea, so the continents rose 7 km into the cold. The air doesn't drain with the sea, so both now measure from where the sea would stand unboiled (`Tectonics.airDatum`), and the coast stays where the sea stands: the planet then holds at ~34 °C as it boils. The next run's CO₂ fell from 1,232 to 98 ppm in ~800 years as the sea went, the sea's implicit steps failing: the seafloor left dry grew forest at 30 °C and drew the air down. The carbon cycle is built on a sea, so while it boils its boxes keep the inputs they had and the land's exchange and weathering's map stop where they were (`Carbon.boiling`); burned carbon still goes to the air. (Holding the air instead froze it at 291 ppm while 1a burned its 5,000 Pg C: its sea starts boiling 0.2 years after the dial.) A runaway's real end, the sea's carbon and the carbonates baked into a CO₂ atmosphere as Venus's, is out of the model's range.
- **On the page** (earthlike, level 7, headless Chrome on the M5 Max, the follow at 1 s a doubling; four runs): the first hominins ~4–18 s after load (the climate's first cycle), the forager era at ~100 kyr/s, the first tip at 2.4–2.9 Myr (on the cached level-6 opening 1.75–1.8: the live planet's fields, restricted from level 7 and still settling, differ; not looked into), and from the tip to the dial about a minute (industry to early takeoff ~180 years; 144 Pg C burned and CO₂ 240 → 285 ppm by then in one run, 3.2 B people, 18 TW). 1a: AI's share of the work 100% within months of the dial, CO₂ to 2,500 ppm, the sea down 3 km at half boiled (+~110 years) and 6.7 km at all (+~240), land 29% → 89%, the planet at 31–35 °C (held there by F_LIVE_MAX), the last people dead by then; weathering on the hot planet draws CO₂ back to ~250 ppm over a few kyr. 2b: the swarm takes 9% of the Sun's output within months of the dial, the veil held against the forcing, farms gone; people leave by choice at ~0.1%/yr with births at replacement, so past the prototype's +300 years Earth empties: 957 M on Earth and 1.59 B off-world at +900 years, 14 M and 2.85 B at ~+4 kyr.

- **Both ways** (a9, after v2.0: "offworlders migrate back to earth too"). The off-world come back at 0.1% a year by choice as well, in proportion to Earth's habitability (`R_RET`); the exchange is stepped exactly as two states (off-world relaxes to a/(a + b) of everyone over 1/(a + b)), the returning spread over Earth's cells as its people are. A kept Earth (2b) settles at half its people: headless (earthlike, 2b forced) 2.90 B on Earth and 0.88 off-world at +300 years, 1.92 and 1.51 at +900, 1.61 and 1.68 at +1,900, off-world ahead by 4–13% after (Earth's crowding, below; the exodus event fires at +1,700 on a hair's margin). 2a is as it was: Earth's failing habitability takes the return with it (Earth empty at +26, 4.02 B off-world). The total drifts down ~0.012% a year: Earth's births sit at replacement and its crowding, at the room bought (a twentieth of its capacity), costs 0.025% a year, while the off-world are neither born nor die.
- **A steady step past the fine stretch.** The headless runs stopped at +300 years. Run on, the step doubled to 500 years and the economy oscillated, energy collapsing and recovering a step apart and the people reaching tens of billions (the committed v2.0 as well: 63 B by +3,000). From early takeoff a step is now at most 10 years (`DT_ECON`; at 50 it still ran away): 2b to +6,000 years holds energy at 3.5–3.8 × 10¹³ TW. On the page the steps were already short (the follow dial's owed years), but a hand-set fast dial would have let them grow.

Next, in order:
1. **The planet's runaway** (its climate past 30 W/m², a dry planet's climate once the sea has boiled) and the people's side of it.
2. **A figure of the people** (people and minds on log time to t*, the events marked; the spindle diagram of the lineages) in the margin.
3. **The industrial era's weight** (energy and carbon at early takeoff against Earth's), and the people's numbers through it.
4. **Soil within a cell** and **the ore map**.
5. **The experiments' numbers** from runs (Carbon budget, Long Anthropocene, Kremer's continents, Axes, Dispersal), then surveys across seeds and their draws.

## Open decisions

- Globe only, or globe plus an Equal Earth map toggle.
- The roadmap's new marks, as built and waiting for a9's eye:
  - the volcanic veil is a graphite stipple in the Relief view at slow dials;
  - the Climate view's sea carries both dust (ochre dots, under) and export production (viridian strokes);
  - ice streams are prussian dashes along the flow;
  - salt flats are a pale crust pattern, with no old shorelines;
  - permafrost is a violet net of ice-wedge polygons (Relief), each polygon frozen with the ground's share, over snow and under lakes and ice.

## Risks

- **The weather–climate seam.** The EBM and the QG core can disagree. Calibrating the diffusivity on the default planet reduces it, the crossfade hides what's left, and the about panel says the climate is an emulator when the weather is outrun.
- **The Wilson cycle may not cycle.** Rifting and subduction initiation are rules. If supercontinents never form or never break, the rules need tuning against long runs (a tools/ survey, like Miasma's).
- **Show, don't tell** will be tested harder here than anywhere. Nine layers of physics invite explanatory UI; the about panel has to carry it.
- **Scope.** The whole is five sims' worth. Phases ship alone so the project is real at every stage.
- **Tuning drift.** Each roadmap phase moves the tuned planet: the zones' shares, a mean of 13–14 °C, CO₂ at ~375–420 ppm, the ice. Re-run `tools/climate-check.mjs` and `tools/planet-run.mjs` at the end of each phase, and retune before the next.
