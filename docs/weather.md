# Weather, tides and the sky

## Weather (`GpuWeather`, `src/gpu/weather.js`, `WEATHER`)

Two-layer QG on the GPU on the drawn mesh (level 7, 55 km), its forcing refined from the engine's grid, L_d = 800 km.
- **Transport.** PV carried by fluxes that are differences of ψ at Voronoi corners (exactly non-divergent), 20% upwinded, with ∇⁴ hyperviscosity scaled with the cell's 3.2 power; Adams–Bashforth 2 at 200 s (halving with the cell). The lower layer carries q₂ less its orography, whose PV is carried alongside.
- **Inversion** each step: the barotropic Poisson and baroclinic Helmholtz solves at once by one V-cycle of multigrid on levels 7 to 2 (`src/gpu/hierarchy.js`; level 2 by a precomputed inverse), warm-started (a cycle leaves a tenth of the step's change). The barotropic solve screens at 1/k₀ ≈ 32,000 km.
- **Forcing.** The baroclinic ψ relaxes over 15 days toward SHEAR · (f/f₀) · (T − T̄) from the climate at the season; Ekman friction on the lower layer; tropical damping in flux form, so PV's integral is conserved. The upper layer starts at 0.7 of the climate's shear, and a 5-day spin-up runs at twice the share. Tracers on the lower layer: θ relaxed to the climate's over 5 days, moisture from the sea raining past 90% of saturation.
- **Spin.** Ω reaches the kernels through f₀ in their uniforms; `setSpin` sets it with L_d and the screening and starts the weather again.
- **Cost.** 35 dispatches, ~0.33 ms of GPU a step on an M5 Max; the page gives it 12 ms a frame, so it runs live to ~5 days a second. It writes the globe's weather fields each frame, blended between its last two steps.
- Tested in `tests/gpu.html`: storms grow above Phillips' criterion and die below; PV conserved; multigrid converges.

## The chart (`src/render/chart.js`, traced in `chart-worker.js`)

From the weather read back every ~120 ms and restricted to the engine's grid.
- Sea-level pressure is the template's at the season plus the storms (ρfψ₂ less its zonal mean), drawn as isobars every 4 hPa (heavier every 20); rain as stipple. Highs and lows are extremes of the pressure eased to 220 km, at least 1 hPa from their surroundings.
- **Fronts** are the zero of ∇TFP·n̂ on θ (a maximum of TFP along n̂) where |∇θ| and TFP are high and the flow cyclonic, typed by v·n̂ against 0.45 of the chart's median, held in runs; a cold stretch within ~380 km of a warm one merges with it into an occlusion. Troughs, ridges and subtropical shear lines are ridge lines of −p, p and cyclonic vorticity; dry lines the same on the column's relative humidity over land.
- Fields and thresholds are averaged over successive charts, ends that nearly meet are joined (`joinEnds`), and each chart is linked to the last (`linkCharts`) and drawn morphing from it (`chartFrame`), so fronts move rather than flicker. Counts on the grid's lines scale with the level.
- The weather runs only in its view and crossfades to the climate's mean between ~3 and ~30 days a second.

## Tides and the Moon (`src/engine/tides.js`, `TIDES`; GPU `src/gpu/tides.js`)

- **The tide**: linear shallow water on the rotating sphere on a C grid over the Voronoi cells, forced by the semidiurnal equilibrium tide of a Moon over the equator (¾(m/M)(R/a)³R), with the body tide (1 + k₂ − h₂ ≈ 0.69) and self-attraction and loading (β ≈ 0.9) (standard, from memory). Coriolis is TRiSK's linear form on Perot's weights antisymmetrized in the energy's norm, so it does no work (Thuburn and others 2009; synthesis on Perot's weights). Heun's step for the rotation, forward–backward for the waves, implicit drag: bottom friction and internal-tide drag (capped at a quarter of the depth). Run to periodic (32 cycles cold, 5 warm); dissipation is the drag's work. Always at level 6. Tested: the still global ocean's analytic response, mass kept, Coriolis doing no work over a sea of cliffs, the GPU against the CPU; `tests/moon-long.test.mjs` runs the worker 50 Myr (a few TW, the spin slowing steadily).
- **The Moon** (`Moon`): each plate step the lunar tides' torque (the semidiurnal's × 1.25 for the diurnal tides, the solar's (0.46)² of it) slows the spin and recedes the Moon. Between solves the tide keeps a constant time lag (Mignard's and Hut's weak friction: torque k(Ω − n), k from the last solve, scaled with (R/a)⁶). The spin steps by backward Euler, so no step passes the synchronous spins; angular momentum is kept exactly. The worker re-solves every ~2 Myr or when 2(Ω − n) has moved 0.3%. `CLIMATE.OMEGA` follows the spin (the template, the gyres' β, the weather).
- On a seeded opening: ~4 TW in the lunar semidiurnal tide (~58% on shelves), the Moon receding ~6 cm/yr. Its ocean is deeper than Earth's; the constants are Earth's, not fitted to Earth's total.
- **The Tides view** (`globe.js` mode 5): co-range tint, co-tidal lines every lunar hour (zeros of sin 6G from the harmonic's complex sixth power), dissipation as sienna stipple; below ~6 h/s the sea's height now (springs and neaps) with high water marked. The tide's phase is 2(θ − the Moon's right ascension).

## The sky (`src/render/sky.js`)

On the overlay outside the globe's disc: a seeded star field fixed in space, turning by the sidereal angle where the dial resolves the day (below ~11 h/s, `DAY_HI`); the Sun on the ecliptic at its longitude for the date (below ~0.25 yr/s), with spots on an 11-year cycle (Spörer's law, differential rotation; standard forms, from memory); the Moon at its longitude (below ~5 days/s), lit toward the Sun, its maria (`moonFace`: Earth's near side on today's Earth, seeded basins otherwise); both at true size ×5. In the People scenario, the swarm, the Moon's city, the L4 and L5 habitats and the settled stars (`people.md`). The Sun sets the globe's night side where the dial resolves the day (`scene.md`); the Moon doesn't light it.
