# The climate

`Climate` (`src/engine/climate.js`, constants `CLIMATE`) with the clouds (`clouds.js`), the air's and the sea's heat transport (`airheat.js`, `seaheat.js`), the gyres (`ocean.js`), the year (`year.js`), volcanoes (`volcanoes.js`) and the runaway (`runaway.js`). The constants marked "Earth" are tuned on today's Earth (`earth.md`).

## The cycle

A diagnostic of the geography, recomputed in cycles: the energy balance; winds, rain and clouds at six points of the year; the air's winds for the next balance; the gyres and the sea's heat transport; the rain's harmonics, the months and the zones; the dust; the ground's periodic year. `work(ms)` advances a cycle for a time budget (a generator yielding within ~10–15 ms at level 7); `solve(n)` runs whole cycles headless; `solveAsync` awaits the GPU's work. What follows a cycle (`Planet.afterClimateSteps`: the cover's climate, the sea's inputs, weathering's map) runs the same way. The climate has **settled** (`stats.settled`) once two cycles running moved the mean temperature less than `SETTLE_T` (0.02 K) and rain less than `SETTLE_P` (0.5%), at the latest `SETTLE_MAX` (16): ~8–15 cycles from cold. The opening's references wait for it.

## Energy balance (standard: Budyko, Sellers, North)

On level 5 (220 km) whatever the engine's level, through `transfer.js`:

C ∂T/∂t = S(1 − α) − (A + BT) + L_c + 5.35 ln(CO₂/CO₂₀) + F + ∇·D∇T

α the planetary albedo (the clouds over the clear sky), L_c the high cloud's longwave, F the other forcings (`F_VOLC`, `F_PEOPLE`, `F_OLR`, dust and coal's sulfate per cell). T is the sea-level temperature; the surface is colder by `LAPSE` (5.4 K/km). Solved as the annual mean and two harmonics by COCG, or with the air's transport (lopsided) by BiCGSTAB, warm-started (`EBM_CG`).
- **Clear sky.** OLR = A + BT, A 234, B 2.09 (CERES's clear sky implies A ~238). Albedo: the sea `ALB_OCEAN` 0.09 + `ALB_POLAR` 0.13 sin²φ; land `ALB_LAND` 0.18 + `ALB_POLAR_LAND` 0.07 sin²φ under the cover's contrasts (`landAlbedo`); land's snow `ALB_SNOW` 0.44 below +1 °C (trees mask it); the ice sheets `ALB_ICE` 0.62; sea ice `ALB_SEAICE` 0.46 below −1.5 °C; lakes as open water or ice; dust darkens snow and ice.
- **Fixed point** (`energyBalance`). Albedo depends on the temperature, so absorbed sunlight is re-sampled at 24 points of the year from the last solution: a fixed point that keeps the ice–albedo feedback and its hysteresis. Each step is mixed by Anderson's method (standard; Walker and Ni) over the last three, in T's variance norm, until a step moves T less than `EBM_TOL` (0.02 K rms), at most `EBM_MAX` 2 warm and `EBM_MAX_COLD` 6 cold. The memory carries across cycles and restarts when it explains less than a fifth of the residual.
- **Diffusivity** (synthesis): D(1 + D_LAT sin²φ), `D` 1.14, `D_LAT` −0.85 (the polar air's stable layering carries less heat per kelvin); the seasons use `D_SEASON` 0.44, so continents smaller than ~5,000 km don't take the ocean's seasons (a known weakness of diffusive balances).
- **Continental seasons** (`continentalSeasons`, `fineTemperature`; synthesis on the linear seasonal balance): each cell answers its own absorbed sunlight and the transport L through its own heat capacity, exchanging with its coarse cell's mean at `SUB_K` (8 W m⁻² K⁻¹): (B + K + ikωC) T̂ = F̂ + L + K T̂ₘ, the coarse cell answering through the cells' admittances in parallel. A coast's land gets seasons about halfway between the sea's and inland's. No heat is made (tested). Heat capacities: `C_OCEAN` 7.9, `C_LAND` 0.61, `C_ICE` 1.2 W yr m⁻² K⁻¹.
- **On the GPU** (`src/gpu/ebm.js`): a step whole on the device — the forcing at 24 points through each cell's packed albedo coefficients (`packAlbedo`) and its clouds (the forcing kernel's eighth binding), the admittances, the restriction, the three solves by multigrid (damped Jacobi V-cycles on the nested grids, level 1 in one workgroup; 4 cycles warm, 12 cold), the fine temperature. Anderson's mixing stays on the CPU. It agrees with a tightly solved CPU step to ~1e-4 K (`tests/gpu-climate.test.mjs`).

## Clouds (`src/engine/clouds.js`, `CLOUDS`; standard pieces, synthesis as built)

Each point of the year diagnoses two layers per cell from the climate's own state; the next energy balance samples them through the year (linear between the points). Undrawn.
- **High cloud** (anvils, fronts' cirrus) where it rains: `HI_MAX` (1 − e^{−P/`HI_P`}), 0.27 and 0.72 mm/day.
- **Low cloud**: the humid column's layer cloud `LO_MAX` ramp(r, `LO_R1`, `LO_R2`) (0.48, 0.1, 0.83) at column humidity r, and over the open sea within `SC_LAT` (45–60°) stratocumulus `SC_MAX` ramp(EIS, `SC_E1`, `SC_E2`) (0.24, 7.1–15.3 K), overlapped at random. EIS (Wood and Bretherton 2006, from memory) = LTS − Γₘ(850 hPa)(z₇₀₀ − `LCL`), LTS = θ₇₀₀ − θ_s (Klein and Hartmann 1993), θ₇₀₀ a surface parcel's at 80% humidity lifted from a reference: within 20° the rain-weighted mean surface temperature (the weak temperature gradient), past 40° the zonal mean, blended between.
- **Shortwave**: the layers over the clear sky's albedo by the adding formula, α ← (1 − c) α + c (a + (1 − a)² α/(1 − aα)), low then high (`A_LO` 0.23, `A_HI` 0.31), each brightening at a low sun by `Z` (0.41) sin²φ of what it lets through. Over snow and ice a layer adds little: the cloud's masking of the ice's albedo comes out of the formula.
- **Longwave**: the high cloud's top at a fixed `T_TOP` (220 K: the fixed anvil temperature, Hartmann and Larson 2002, from memory) replaces the clear sky's A + BT by σT⁴ over its share, the clear sky capped at `L_MAX` (300 W/m²: a clear column's outgoing longwave saturates). So its warming grows with the surface's by c B a kelvin (the high clouds' feedback). Low clouds' tops are about the surface's temperature (fitted: nothing).
- Both enter as forcing sampled from the last state, inside the fixed point. The forms were fitted to CERES's cloud forcing from the sim's own predictors, then tuned with the rest. On Earth ~48% of the sky effectively clouded (low 35%, high 20%). Doubled CO₂ on today's Earth (ice sheets held) warms 2.8 K, the clouds' feedback ~+0.2 W/m² per K, larger in a warm climate. ~4 ms a point of the year at level 7. Tests: `tests/clouds.test.mjs`.

## The air's heat transport (`src/engine/airheat.js`, `AIRHEAT`; standard pieces, synthesis)

The climate's surface winds at the six points, as their mean and two harmonics, each by its rotational part alone: a stream function from its vorticity (∇²ψ = ζ, Jacobi-preconditioned CG on all five fields at once, warm-started across slices of 15 iterations), the flow across each edge ψ's difference at its Voronoi corners, so free of divergence. The divergent part (overturning cells) is left to the diffusion. The winds carry `H` (1 km) of air at the surface's temperature: the year's mean wind carries all three harmonics upwind and implicitly (an inflow weight beside the diffusion's, keeping an M-matrix: BiCGSTAB on the CPU, each multigrid level's edges on the GPU); the seasons' winds carry the cross terms, centred and lagged (`cross`). The transport sums to nothing; a westerly carries a source's heat east and the sea's seasons onto windward coasts (`tests/airheat.test.mjs`).

## The sea's heat transport (`src/engine/seaheat.js`, `SEAHEAT`; standard pieces, synthesis)

On the 220 km grid the water keeps its own temperature θ, carried by the currents and exchanging with the air at `LAMBDA` (×`ICE` under sea ice): steady, ρc_p(Σ F_in θ_in − F_out θ) = λA(θ − T). The currents are the gyres' (`GYRE` × Stommel's transport) and an overturning: a latitude circle all round over sea (`channels`) holds no zonal pressure gradient, so its westerlies' equatorward Ekman transport wells up there and sinks in the other hemisphere's deep subpolar seas (Toggweiler and Samuels' Drake Passage effect, standard; sinks by area and depth, `SINK0`–`SINK3`), `EKMAN` (0.6) of it plus `MIX` Sv. The upper limb is the potential flow through the connected sea, each edge conducting as its depth to `DEPTH`; the deep return carries the sinking's temperature, so the loop makes no heat. θ by Gauss–Seidel from the last T; its heat enters the annual mean linearized, the cell's own share on the diagonal. The sea's surface shows `SURF` (0.3) of the water's departure from the air (`Ocean.publish`). Without salt the model can't know the North Pacific is too fresh to sink. Tested in `tests/seaheat.test.mjs`.

## Circulation (synthesis): a template

- The ITCZ is the warmest latitude in each 10° sector of longitude (penalized by `ITCZ_PEN` (latitude/14°)², within `ITCZ_MAX`).
- The Hadley edge scales as √ΔT/Ω (Held and Hou), `HADLEY` (30°) at an equator-to-60° contrast of `HADLEY_DT` (28 K); the subpolar lows at `LOWS` (2.05) × the edge.
- Surface pressure: the ITCZ's trough, the subtropical highs (taken away over land by `HIGH_LAND` 0.75 of its share smoothed over ~1,500 km, so they stand over the oceans), the subpolar lows, the polar highs, and the thermal part −`THERMAL` (1.0 hPa/K, Earth's order) × each place's departure from its latitude's mean (smoothed), bounded softly at `THERMAL_MAX` (30 hPa, tanh).
- The wind solves r u + f k×u = −∇p/ρ (`FRICTION`, `OMEGA` following the spin).

## Moisture (synthesis)

Column water W, steady at each point, ∇·(uW) − ∇·(κ∇W) = E − P, upwinded, each cell's nonlinear balance by Newton: on the GPU by Jacobi passes with its coefficients packed there (`src/gpu/moisture.js`, `solveFrom`), headless by Gauss–Seidel in four sweep orders to `MOIST_TOL`. The carrying wind is the geostrophic part and `CARRY` (0.4) of the frictional drift. Evaporation pulls W toward saturation (W₀ e^{0.065(T−15)}, `EVAP`); over land at `LAND_EVAP_COVER` × the ground's β (bare ground and grass at β, trees at √β); lakes as the sea (×`LAKE_ICE` frozen).
- **Rain** = (W_s/60) e^{`CONV_A`(r − r₀)} mm/day (the shape of Bretherton and others' fit, constants from memory; r₀ `CONV_R0` 0.743) + lifting up slopes (`RAIN_ORO`) + a background (`RAIN_BG`) suppressed where the air diverges, capped at `RAIN_MAX`.
- **Gates**: descent (`descent`: the carrying wind's equatorward speed over `SUB_V`, after Sverdrup's balance as Rodwell and Hoskins read the subtropical highs) raises r₀ by `SUB_R0` and holds back the background; the background needs moist air (`BG_R1`–`BG_R2`); convection needs a warm surface (`CONV_T0`–`CONV_T1`, 17–28 °C).

## Zones (synthesis, soft)

Monthly temperature and rain from the harmonics; Köppen's thresholds (Peel and others', from memory) as logistics over 14 classes, each width the year's spread at the cell (`Year.spreadFine`, with floors `ZONE_FLOOR_T`, `ZONE_FLOOR_P`; `ZONE_T`, `ZONE_P` without a year), so a class's probability is the share of years in it.

## Gyres (`src/engine/ocean.js`, `OCEAN`)

On the coarse grid: Stommel's depth-integrated flow under the annual-mean stress, ε∇²ψ + ∂ψ/∂λ = a² curl τ/(2Ωρ₀), coasts and islands at ψ = 0, ε for a two-cell western boundary layer, by BiCGSTAB every third cycle. Surface currents u = k × ∇ψ/H (400 m). The SST anomaly T′ solves u·∇(T + T′) + λT′ = κ∇²T′ + upwelling (coasts the Ekman drift leaves). Moisture and sea ice read T + T′. Tested against Sverdrup's interior and a box basin's boundary current.

## The year (`src/engine/year.js`, `YEAR`)

- **The stepper** (synthesis): whole months while a month takes ≥ ~1/30 s of the dial, longer steps above, at most 30 a second; `live` fades from 1 to 0 over 56–180 yr/s; outrun, each cell takes the anomaly's exact transition over the gap (`resume`).
- **The anomaly** (Hasselmann; North's diffusive form): C ∂T′/∂t = −BT′ + ∇·D∇T′ + F on 440 km, F the weather's heat flux as noise correlated over 1,500 km plus the veil's forcing (exact in time, `forced`); each step each cell's exact OU transition then the diffusion. Its amplitude by latitude (`YEAR.Q`) is fitted to the QG weather (`tools/anomaly-fit.mjs`).
- **The rain's anomaly** (synthesis): z = ρT′/σ + √(1 − ρ²)η, ρ −0.3 on land, +0.3 at sea; a cell's monthly log rain spreads by 0.45 (MAP/1000)^−0.3, mean-preserving.
- **The closure**: each cell's stationary spread and the share a year's mean keeps; the zones read it at every dial.
- **The ground's hook**: `soil.step(...)` each step while live, `soil.closure` while `live` < 1 (`surface.md`).

## Volcanoes (`src/engine/volcanoes.js`, `VOLC`; standard effects, synthesis)

A seeded Poisson process, sizes N(>M) ∝ M⁻¹ in Pinatubos; arcs (rate by `carbon.arc`), hotspots, and erupting provinces. The veil is optical depth in 5° bands (0.15 global per Pinatubo, spreading in latitude, decaying over 1 yr), forcing −25 W/m² per unit (from memory). The rate's mean against the opening's is `F_VOLC`. An eruption's response is tagged and carried apart (`tools/eruption-run.mjs`: 1 Pinatubo cools ~0.4 K at its peak).

## The runaway (`src/engine/runaway.js`, `RUNAWAY`; standard physics, synthesis)

- **The limit.** A moist column's outgoing longwave saturates toward ~282 W/m² (`L_RUN`; Goldblatt and others 2013, from memory). The runaway reads the planet's outgoing longwave, A + BT less the clouds' global mean (`Climate.cloudLongwave`, ~28 W/m² today), which leaves the line at `T_K` (25 °C) along a parabola, C¹ at both ends, reaching the limit at the plateau. The departure is a uniform forcing `F_OLR` (`olrCorrection` before each step, `olrMeasure` after); zero below `T_K`.
- **Past it**, the excess N boils the sea (`E_BOIL` for all of it); the mean is held at the steam's surface (Clausius–Clapeyron from 100 °C at 1 bar, to `T_POST` 1,227 °C once all of it is in the air); N < 0 rains it back. `Tectonics.boiled` is the share in the air. The boiled water's carbon degasses (`OceanCarbon.boilTo`), weathering needs liquid water (`in.wet`), the cover fails past `VEG.T_HOT`.
- **Measured** (level 5, earthlike, headless): +20 W/m² settles at ~30 °C, +35 at ~39 °C, +45 passes the limit and boils the sea.
