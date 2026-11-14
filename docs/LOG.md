# Overnight log

The working log for the overnight run that a9 asked for on 2026-11-14: "go through each phase as far as you can; it'd be amazing if I could wake up to a complete sim". `docs/PLAN.md` holds the plan, and this file holds the brief, the rules for the run, and what got done, so the run survives a context compaction. Read it first after a compaction.

## Brief

- **Scope.** Phases 2 to 5 of `docs/PLAN.md`, in order, as far as they go. Skip the social card: a9 will do it in a fresh session.
- **Authority.** a9 trusts Claude's judgment and taste and expects hard decisions to be made, not deferred. a9 will give feedback in the morning. Record every judgment call under "Decisions made overnight" below so a9 can review them in one place, and move any that become part of the design into `docs/PLAN.md`.
- **Order.** Each phase should ship on its own: finish and verify one before starting the next, so whatever state the morning finds is coherent.
  1. **Phase 2, surface and climate:**
     - landscape (stream power, flow routing, sediment);
     - the seasonal energy-balance model (harmonic solution, land and ocean heat capacities, albedo, CO₂ forcing);
     - the circulation template (ITCZ, Hadley edge, pressure belts, monsoons);
     - moisture and precipitation (orographic rain, rain shadows);
     - soft Köppen zones and the Climate view;
     - Fig. 3 (zonal means);
     - the dial extended to 10 yr/s.
  2. **Phase 3, ice and carbon:** ice sheets (shallow-ice approximation, positive degree days, the ice load), sea ice, orbital forcing, glacial isostasy, the carbon loop, large igneous provinces, Figs. 1 and 5, and the Snowball, Ice ages, High stand and Thermostat presets.
  3. **Phase 4, ocean and weather:** gyres and SST, the two-layer QG core, tracers, fronts and dry lines, the synoptic chart, the weather–climate hand-off, and the dial reaching hours.
  4. **Phase 5, the harmony:** Fig. 6 (the model diagram with live fluxes), the presets surveyed across seeds, the about panel, Japanese, and registration on the site. No social card.
- **Commits.** Commit each milestone in the submodule with a clear message, push it, then bump the parent's pointer. Stage the parent explicitly, since a9 may edit the parent concurrently. Never `git add -A` in the parent.
- **Do not deploy.** `./deploy.sh` ships the working tree, and a9 should see the sim before it goes public. Registration on the site (phase 5) may be committed, since nothing is public until a deploy, but say clearly in the morning summary that it is registered and undeployed.
- **References.** Model lineages named in `about.md` or JSON-LD must be checked against their live source first (root `AGENTS.md`). Overnight, keep references out of public text, or mark them to be checked.
- **Design.** Follow the root `AGENTS.md` design system and "Inside the scene":
  - Depict, don't decorate.
  - Pattern before hue.
  - Show, don't tell: the caption carries only names and values.
  - One red: the mantle at the surface.
  - Newsreader everywhere and the inks for data. No cards, shadows or glow.

## Working notes (gotchas so far)

- WGSL derivatives (`fwidth`) only work in uniform control flow. Compute them first, then use `select`/`mix`, never `if`.
- The browser pane throttles `requestAnimationFrame` when hidden, so a frozen clock in the pane may be the pane, not a bug. `window.__isochron` exposes the state for checks.
- `read_console_messages` keeps errors from earlier page loads. Compare the line numbers with the current files before chasing one.
- Plate motion is exact because each plate stores crust in its own frame. Don't resample the world grid per step: a step moves less than half a cell, so nearest-cell resampling would freeze motion.
- Overlaps where plates slide past each other are rounding. Consume crust only where plates close (`CLOSING`), or transforms churn crust and leave false slabs.
- Slab pull acts along the trench line only. Counting the slab-memory band behind a migrating trench makes pull grow with speed and run away.
- The level-6 plate step is ~6 ms and line tracing ~6 ms, all on the main thread. Climate and weather will need a worker, or GPU compute for the QG core. Measure before adding per-step O(n) work.
- Sea level is very sensitive to mean seafloor age, because the continents are flat isostatic plateaus. The landscape layer should give them relief.
- The dev server is the parent's `docs/sim-overhaul/serve.mjs` (launch config "sims", port 8790).

## Decisions made overnight

Phase 2:
- **Erosion replaces the relaxation of thick crust.** Phase 1's `ERODE_TAU` relaxed crust over 40 km toward 35 km and destroyed the difference. The landscape now takes thickness by stream power and returns it as sediment, and continental thickness diffuses (faster under thick crust, for orogenic collapse). Crust is conserved (tested).
- **A slow water buffer.** Sediment filling basins and young seafloor raised the sea until land fell to 12–21%. The ocean's volume now relaxes toward the genesis land fraction over 150 Myr (`WATER_TAU`), a stand-in for water exchanged with the mantle. It's a closure for something unmodelled, marked speculation. Short high stands remain (seed `c` falls to 18% land and recovers).
- **Erodibility** K = 1.2 × 10⁻⁷ /yr (half the first try) keeps more relief; erosion runs at 3–6 km³/yr, Earth's natural order.
- **The EBM runs a level coarser** (220 km cells) than the surface, with transfer operators between levels: heat spreads over thousands of km, and it's 8× cheaper. Mean and two harmonics, solved by COCG.
- **Two diffusivities.** One D for the mean and a smaller one for the seasons (`D_SEASON` 0.1 against 0.45). With one D the continents had the ocean's seasons (45°N land ranged −4 to 11 °C); now −13 to 18 °C, near Earth's.
- **Rain rises exponentially with column humidity** (the shape of Bretherton and others' tropical fit, constants from memory, kept out of public text). A hard humidity threshold dumped all tropical moisture in one row of cells at 15 m/yr.
- **Moisture rides a less divergent wind**: the geostrophic part plus 40% of the frictional drift. With the full surface drift the trades dried to 30% humidity and evaporated 15 mm/day.
- **Climate constants tuned on the default seed** for mean 13–14 °C, ~1,000 mm/yr of rain, zone shares near Earth's: albedos 0.25 (sea) and 0.27 (land) + 0.12 sin²φ, evaporation 0.35/day, background rain 0.08/day.
- **Fourteen classes**: Af Am Aw As BW BS Cf Cs Cw Df Ds Dw ET EF (the plan's second letters; third letters and h/k left out). Logistic widths 1.5 K and 0.25 in log rain.
- **The mosaic draws p², not p.** The logistic tails gave every desert a few percent of green tesserae. Squaring keeps even ecotones even and drops the speckle. A, C and D also step in value (A darkest), so they part in grayscale: pattern before hue.
- **Figures are numbered by page order**: Fig. 1 the globe, 2 zonal means, 3 hypsometry, 4 polarity. The plan's list numbered them by topic. The margin has tabs, Climate and Crust.
- **The dial reaches 1 yr/s**, past the phase's 10 yr/s, because the seasonal solution is analytic: below ~4 yr/s the globe shows the season at the planet's clock, above ~40 yr/s the share of the year under snow and ice.
- **Snow and sea ice are the paper**, sea ice with a sparse stipple. Lakes show only where inflow beats ~1 m/yr of evaporation. Rivers are drawn above 1,500 m³/s and three cells long (wet coasts sprouted combs of one-cell streams).
- **Shallow water got a visible tint** (square-root depth curve, higher floor): the new shelves read as paper.
- **Reversals halved** (median rate 1.2/Myr, mean ~1.8): 1,203 reversals in 160 Myr made stripes finer than a pixel; Earth's record has ~300.

Phase 3:
- **The orbit is averaged over what the dial passes in ~2 s**, each periodic term scaled by sinc(W/P), so the climate sees the mean orbit at plate speed and whole cycles at kyr/s, crossfading without a switch. Earth-like periods and amplitudes, jittered by the seed.
- **Ice is explicit within a real-time budget** (3 ms a frame); past it the ice lags the climate rather than the clock. That is its closure; a semi-implicit solver is the upgrade if level 7 needs it. Ice lives in the mantle's frame.
- **Rain is capped at 25 mm/day per cell** (`RAIN_MAX`), with the rest carried on, and moisture diffusion lowered to 7×10⁴ km²/day. A mountain cell had drawn moisture from all sides and rained 38 m/yr, which grew an ice spike that collapsed the time step.
- **Outgassing is normalized to this model's settled plate activity** (~500 cells/Myr at level 6), not the spin-up's (~180), and **weathering takes pCO₂^0.3 directly** (soil CO₂). With the spin-up baseline, CO₂ ran to 1,100+ ppm in 10 Myr as the plates sped up; with only the temperature path, doubling outgassing multiplied CO₂ ~9×, now ~3×.
- **Plume heads rift continents through themselves** (`tec.rift(k, point)`), and leave a hotspot.
- **Experiments reload the planet** (`?exp=`): a snowball can't be undone by the knob, which is the experiment, so each starts from the opening. Snowball holds CO₂ at its value when chosen, so sunlight is the only cause.
- **Margin tabs**: Experiments, Record (Figs. 2, 3), Climate (Fig. 4, the key), Crust (Figs. 5, 6). The record's window is 40 s of the dial.
- **The ice-age rhythm didn't emerge** in a 600 kyr run at 220 ppm on the default seed: ice grows to 76 m of sea level and holds, with small orbital wobbles. The forcing is there (July on 55–72°N land swings 10 K between extreme orbits); this seed may lack land in the 50–70°N band. Open: survey seeds and CO₂ for marginal northern ice.

Phase 4:
- **Stommel's gyres, not Munk's**: the same western intensification with one boundary condition (Munk's ∇⁴ needs two). The layer is two cells wide (~220 km), numerically resolved; currents peak ~0.2 m/s at this width.
- **Outgassing's reference is the plates' activity at the end of the spin-up.** Right after genesis the plates make crust at ~40% of their settled rate; against the settled reference, CO₂ crashed to 57 ppm in 0.5 Myr and the planet froze. Now the opening is in balance and CO₂ drifts from ~260 to ~450 ppm as the plates speed up.
- **The weather runs on the 220 km grid, at 20-minute steps**, only while its view is shown, and only from a warm climate (from a cold one it drew noise). Its storms are drawn on the climate's own pressure belts (ρfψ₂ less its zonal mean, plus the template): the QG model's zonal flow drifts toward a 70 hPa polar high, a known weakness of two-layer models whose eddies don't carry enough westerly momentum down.
- **Isobars at whole hPa**, so a flat field doesn't sit on a contour; the drawn pressure is smoothed three passes.
- **Fronts by Hewson's TFP with percentile thresholds** (upper quarter of |∇θ| at mid-latitudes), chains of at least five segments.

Phase 5:
- **Not registered on the site.** The build throws unless a registered project's `index.html` names `/<slug>/og-image.webp?v=…` (`tools/build.mjs`, `og:image`), and a9 kept the social card for their own session; registering without it would break `npm test`. The checklist is below, for doing both together.
- **No Japanese yet.** Every caption, label and the about text would need a translation pass and an `i18n/strings.js`; that's a session of its own, and better done once the English settles after a9's review.
- **Fig. 7 is drawn from the code's actual couplings.** The weather's feedback to the climate (running means) isn't built, so the diagram has no arrow for it rather than imply one.
- **Five margin tabs** (Experiments, Record, Climate, Crust, Model); the margin is 372 px, as Miasma's.

## After a9's review (2026-11-15)

a9's notes: rivers look unnatural; ice caps stand out, their pattern is fixed to the screen and should be more conventional with harder edges; patterns don't scale with zoom; a legend; vegetation colour in the Relief view; biological carbon; the weather looks erratic; no Japanese (only Worldline has it).
- **Patterns are fixed to the globe**, triplanar and octave-blended, so they move and scale with it; marks stay a constant width on screen. The mosaic was already fixed to the globe.
- **Snow, sea ice and ice sheets are drawn as a map draws them**: a light fill with a hard, antialiased edge and a hairline. Ice sheets lost their flow hachures for contours of the ice's surface every 500 m (the flow crosses them downhill), which reads the same quantity conventionally.
- **The Relief view takes the climate's vegetation** as natural colours blended by the zones' mixture (not a mosaic), rock toward the summits.
- **A key per view**, at the globe's lower left, toggled by `K`.
- **Rivers route over ±25 m of roughness fixed to the crust**, so flats branch instead of draining in parallel straight lines, and are no longer drawn across lakes. It's sub-grid relief, the same idea as the coastline's easing; erosion still uses the true surface.
- **Fronts lie in troughs** (cyclonic low-level flow) and **hold their type in runs**: they had flipped cold and warm point to point.
- **Organic carbon**: burial with sediment and oxidation of old organic carbon in eroded rock, each a fifth of the reference outgassing at the opening; a new arrow in Fig. 7.
- **Conservation tolerance** in the landscape test is now 10⁻⁷: plates store thickness in float32.

Second round (2026-11-15): grid-like lakes and rivers, symbols that don't scale, flickering and broken fronts that flip, no occlusions, no temperature or humidity.
- **Lakes** are drawn from a smoothed, signed depth with a hard shore (one-cell lakes not drawn); **rivers** are continuous main stems with tributaries snapped onto them; the **deep sea** is eased twice more; the **young-crust tint** is gone (it drew the grid's cells, and the ridge rule already draws the axis).
- **Overlay symbols scale with the globe** (×0.75–3.5 by its radius on screen).
- **Fronts**: fields and thresholds averaged over successive charts, pieces bridged, typed against the chart's own typical cross-front wind (an absolute 2.5 m/s called 95% of fronts stationary), occlusions near deep lows.
- **Weather charts**: pressure, temperature and humidity, each with its key.

Third round (2026-11-15): continuity through time; troughs, ridges, shear lines and the like; fronts broken up and doubled; occlusions that form.
- **Continuous motion**: fields blended between the last two plate steps in the shader; boundaries and rivers turned with their plates to the displayed moment; adaptive plate steps (50 kyr–0.5 Myr, ~10 a second); weather lines and centres drifting with their wind between charts.
- **Fronts**: only maxima of TFP (the minima were the second, back-to-back front), duplicates of one type dropped, and occlusion when a cold stretch closes within ~380 km of a warm one (the near-a-low rule is gone).
- **Troughs, ridges and shear lines** drawn; a trowal needs the air's structure aloft and squall lines need convection, neither of which a two-layer QG model has, so they're left out rather than faked.

Fourth round (2026-11-15): the chart got messy between charts, and boundaries and rivers still snapped.
- **Lines drift whole** with their mean wind (moving each point by its own wind folded them), for at most three model hours, with charts every 150 ms; chart lines are relaxed before corner-cutting; any stretch lying right on a longer one goes, whatever its type.
- **Boundaries and rivers morph** from their predecessor's course between retraces: turning them with their plates kept their position continuous, but their shapes, re-traced from the grid each step, had snapped.

Fifth round (2026-11-15): rivers morphing strangely, faults wiggling and teeth sliding, hexagonal ice that jumps, and convergence without subduction.
- **Nearest-point morphs**: resampling by share of length made every point slide along a boundary that grew at a junction, and the symbols with it. Rivers pair strictly or fade.
- **Snow and ice smoothed and eased**; lakes freeze under snow.
- **Collision drawn with open sawteeth** (the model already stacks crust, sutures and welds there; only the symbol was subduction's).

## Next: resolution (a9, 2026-11-15, after a compaction)

a9 wants an optimization pass and then finer grids: the fronts fragment because the weather runs at 220 km. Measured costs to start from (M5 Max, Chrome; headless node is similar):
- **Weather** (level 5, 10,242 cells): ~8 ms a 20-minute step (two warm-started PCG inversions dominate, ~30 iterations each); live to ~1 day/s. At level 6 the cost is ~4× per step and the step must halve (CFL), so ~8× per model day: it needs multigrid on the nested levels (`src/grid/transfer.js` has the transfer operators) or a GPU compute port, and probably a worker.
- **Chart** (`chartLines`): ~16–22 ms each, every 150 ms.
- **Plates** ~6 ms a step, **boundary tracing** ~6 ms, **landscape** ~7 ms, **sea-level solve** ~5 ms (48 bisections over all cells: a sorted-hypsometry solve would be ~0.5 ms), **refreshSurface** ~5–10 ms; at ~10 plate steps a second.
- **Climate** cycle ~360 ms warm (the EBM on level 5 with COCG, six moisture phases by fast sweeping on level 6, the ocean every third cycle), spread at 5 ms a frame.
- Everything runs on the main thread. The plan's architecture (a module worker with shared buffers; the site is cross-origin isolated) is the lever for all of it.
- Candidates: the sea-level solve by sorted hypsometry; multigrid for the weather and the EBM; the weather (and maybe the chart) in a worker; the weather at level 6, or the chart's fields at level 6 by prolongation with sub-grid front placement; level 7 for crust and landscape last.

## The optimization pass (2026-11-15)

a9: "a comprehensive optimization pass … making heavy use of webgpu so that we can improve the spatial and temporal resolution"; WebGPU only, no CPU fallback (the old WGSL→JS transpiler in the parent's `lib/wgsl` is legacy and unsupported, so the GPU's tests run on the device, in `tests/gpu.html`).

Measured first, in the browser (a frame at the default dial, Relief): climate 16.5 ms (a 5 ms budget overshot by its slices), surface refresh 13.8, ice and carbon 8, plates 2.8, the season's snow 2.0, lines and overlay ~3: ~49 ms, ~20 fps, before the weather.

Decisions:
- **The weather on the GPU, at the surface's grid (110 km).** Multigrid V-cycles on levels 6→2 with an exact coarse solve beat CG on the GPU: no reductions, a fixed dispatch list (54 a step), a tenfold error cut per cycle. Both inversions share one vec2 pass. The CPU weather is gone (one path); its Phillips test moved to the device. Level 7 was timed (0.58 ms a step, ~170 ms of GPU a model day) and left for a level-7 render mesh, since the weather's fields go straight into the globe's vertex buffer.
- **A 400 s step.** At 110 km the spin-up's transient (lower-layer winds to ~90 m/s on day 3, settling to ~45 by day 10; the 220 km CPU model peaked at 74 and settled at 25) broke 600 s on day 4. Smoothing the thermal-wind target didn't help; the CFL did. A run that still goes non-finite restarts from the climate.
- **Orography as part of the state, not the PV.** The lower layer carries q₂ less f₀h/H and transports the orographic part alongside, so a changed ground doesn't jolt ψ (the CPU model subtracted ψ's mean each step instead).
- **Tropical damping in flux form** (−∇·(e∇ψ)/τ rather than −eζ/τ), so the barotropic PV's integral is conserved and the screened Poisson solve (1/k₀ ≈ 32,000 km) has no drifting constant.
- **The engine on a worker**, the page keeping the clock: ticks out, snapshots back (surface, climate, fast). Surfaces arrive a step late and are blended in over the time to the next, so motion stays continuous whichever thread is slower. SharedArrayBuffer wasn't used: the dev server isn't cross-origin isolated, and snapshots copy ~2 MB a step.
- **The season's snow and ice on the GPU** (per-cell evaluation of the harmonics at the date, two smoothing passes, the ease), and **the chart on a worker**, from a read-back of the weather; its grid counts scale with the level.
- **The carbon cycle's weathering reference** is now taken from the third climate cycle, not the first: the first is cold, so warm cycles read ~40% more weathering and drew CO₂ down at every opening (headless, a cycle every 400 kyr: to ~90 ppm and 8.7 °C by 1.8 Myr; in the browser to ~175 ppm). With the warm reference the opening holds 14.1–14.4 °C over 3 Myr while CO₂ settles toward ~420 ppm.

After: the page's thread ~1.5 ms a frame (overlay and line morphs); the weather live to ~10 days/s at 110 km.

## Level 7 (2026-11-15)

a9: "yes please! let's try it"; the GPU is shared, so timings run high; the budget should be generous.
- **The drawn mesh is level 7**; the engine stays at level 6. Each field the engine posts is refined onto the mesh on the GPU by one step of Loop subdivision (positive weights, so shares stay shares and nothing overshoots). Coasts, ice edges, lakes and isobaths are curves at close zoom.
- **The weather runs on the mesh (55 km)** at 200 s, with the forcing refined from level 6. 300 s blew up on day 1: the upper layer's equilibrium jets (~115 m/s) sit near the advective limit, whatever the transient.
- **A gentler start.** With the full shear at the start, storms grew explosively; the jets (~110 m/s on day 3) sat at the step's limit, and one run in the page blew up after day 6. Starting the upper layer at half the shear lets the forcing build it: winds climb to ~50–65 m/s with no spike.
- **Hyperviscosity ∝ cell^3.2**, not cell⁴ (models scale it so: finer cells' noise grows faster than a fixed damping time handles).
- **The zonal mean in the eddy pressure is interpolated** between its 3° bands: subtracting band means drew a step at every band's edge, which at 55 km showed as zig-zag isobars along latitude lines.
- **The chart is traced at level 6** from the weather restricted (full weighting): tracing at level 7 cost ~650 ms a chart against ~100. Highs and lows need only 1 hPa against their 440 km surroundings: the 55 km storms (restricted) are broad, and 3 hPa found none.
- Cost: ~0.55 ms of GPU a step by timestamps (wall ~1.5 ms while the GPU is shared), ~240 ms a model day; 12 ms of each frame keeps it live to ~3 days/s.

## The engine at level 7 (2026-11-15, night)

a9: "the sim in the test server seems to not be working (blank screen)… let's fix it, then let's port as much as possible to the GPU, and move the engine to lvl 7"; then a Fable subagent paints the card, and deploy.
- **The blank globe** was the loop dying on its first frame: a frame stamped before the clock started gave a negative frame time, the scheduler planned −1 steps, `Array(−1)` threw, and the next frame was never requested. Frame time is clamped at zero and the next frame is requested first.
- **The engine at level 7.** Per-cell parameters scale with the cell (arc crust per consumed cell × res; merge events ÷ res²; margin cells ÷ res; rivers' minimum length and boundaries' smoothing passes with the cells along a line; the template's anomaly smoothing with the coarse grid's cells). Costs (node): a plate step 43 ms, the landscape 40, the surface's preparation 28, a warm climate cycle 870 → ~700 after the ports below, boot 4 s.
- **Backpressure**: plate steps no shorter than the engine keeps up with, and the clock holds while two steps are outstanding.
- **Ice on the GPU** (25× dearer on the CPU at level 7: the explicit step shrinks with the cell's area). The step size comes from an atomic maximum on the GPU. Matches the CPU's Vialov cap within 2%.
- **Moisture on the GPU** by Jacobi passes. 160 passes converge (0.1% from 1,600); the CPU's 6 warm Gauss–Seidel sweeps stop ~4% of the rain short of that balance (60 sweeps match it to 0.1%).
- **The ocean on the coarse grid** (1.1 s a solve at level 7, ~0.1 s at level 6).
- **WebGPU in node** (`webgpu` on npm, Dawn's bindings, under `tests/`): GPU paths tested headless against the CPU references, which stay for the tools.
- **Outgassing from the plates' motion**, not gap cells: gap cells counted the grid's rounding (313/Myr at 0.5 Myr steps, 548 at 0.05; the kinematic measure 365 and 347).
- **Open, the top item:** the plates speed up for ~20 Myr after the spin-up at every level (×1.7 at level 6, ×2.5 at level 7), so at level 7 the sea rises ~210 m and CO₂ climbs to ~800 ppm within 12 Myr. Two biases used to hide it. A reference that followed the plates over 20 Myr only partly helped, so it's out. Needs a settled spin-up or `PARAMS` at level 7.

## Registering on the site

When the social card is made (a9's session):
1. Paint the card: `tools/og/paint/isochron.py` and `tools/og/isochron.html`, then `node generate.js isochron` writes `projects/isochron/og-image.webp`. Its red is the mantle at the surface (ridges, arcs, hotspots).
2. `projects/isochron/index.html`: the canonical link, `og:*` and `twitter:*` tags with `og-image.webp?v=1`, and JSON-LD blocks like Miasma's (`WebApplication`, breadcrumbs); drop `noindex`. Any `isBasedOn` or educational reference gets checked against its live source first.
3. `content/projects/isochron.md` and `isochron.ja.md` (title Isochron, href /isochron, an order among the sims, `external: false`, an emoji, `seoName: Isochron — Planet Simulator`, 2–4 tags from the existing vocabulary).
4. Add `'isochron'` to `PROJECTS` in `tools/stage-assets.mjs` and `tools/subset-fonts.mjs`.
5. `static/_headers`: a `/isochron/*` preload stanza and the `/isochron/*.js` and `*.css` edge-cache rules, as for the others (mind the 100-rule limit).
6. `npm test` in the parent; then deploy when a9 says.

Open from phase 2: mean ocean depth is 5.3 km (Earth 3.7) because isostasy ignores the water's load and lithospheric roots; D climates are short (14–18% of land against Earth's ~25%); a climate cycle costs ~190 ms warm, spread over frames.

## Progress

- 2026-11-14, before the run: phase 1 is built (see `AGENTS.md`). The repo is github.com/a9lim/isochron, a submodule of the parent (parent b073e84). It isn't registered on the site.
- Phase 2 built: landscape, climate engine, Relief and Climate views, the margin's figures, the season at slow dial. Verified in the browser (light, dark, phone); 34 tests pass.
- Phase 5 in part: Fig. 7 (the model diagram with live fluxes). Not registered (needs the card), no Japanese. 38 tests pass.
- Phase 4 built: ocean gyres and SST, the QG weather and the synoptic chart, the dial to 2.8 h/s. Verified in the browser (a chart with lows, highs, fronts and a dry line); 38 tests pass, including Sverdrup and Phillips.
- Phase 3 built: orbit cycles, ice sheets, carbon thermostat, hotspots and provinces, the record and orbit figures, the five experiments. Verified in the browser (Snowball freezes at 88% sunlight; Ice ages and the record run); 36 tests pass, including Vialov's ice cap and the thermostat's balance.
