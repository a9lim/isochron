# The model

Each layer's governing form, its grid and step, and the targets the constants are calibrated against. Each source file's header holds its layer's forms in full, with its claims marked standard, synthesis or speculation; this file is the map across them.

## Constraints that steer new work

- **One planet, one state, one dial.** Every layer reads and writes the same fields (elevation is one array: the plates raise it, erosion lowers it, ice loads it, the climate reads it), and each coupling is a live flux, because the couplings are the subject. Fig. 2 draws only couplings the code has.
- **The dial is scale separation.** Each layer declares its timescale, stable step, substep budget and closure (what stands in when the dial outruns it). The scheduler (`src/clock.js`) runs it live, summarized or banked, and every layer always advances model time, so the state is consistent at any dial. Drawing crossfades over half a decade of the dial and never switches.
- **Grids nest.** The icosahedral grid has 10·4^k + 2 cells. The engine runs at level 7 (55 km; 6 on phones); the energy balance and the gyres at 5, the year's anomaly at 4, the mantle at 4, the tide at 6, the people at 6 and their routes on levels 5 and 4. The transfers are area-weighted and keep integrals.
- **The CPU is the reference.** Every GPU path has a CPU twin the headless tools and the tests run. The plates' CPU frames stay authoritative: the GPU mirrors them, and rifts, merges and initiation rewrite whole plates on the CPU.
- **Rules, not emergence**, for tectonics: rifting and subduction initiation are rules, not mantle convection.
- **Little more geology; life minimal except people.** The about panel carries the explanation, and the scene names and reads out values (the parent's "Inside the scene").
- **People write through the planet's own inputs** (carbon, tillage in the erosion field, land use on the cover, waste heat and sulfate as forcings, the boiled sea), not through new sinks.
- **Soft forms over hard caps** in the people's model: sums over uneven units harmonic, thresholds logistic hazards, floors exponential approaches. States decide nothing; everything they do is a flux.
- **The people's seam rules**, which batch 2b and the game rely on:
  1. People's state is per cell on their grid. The only world-level arrays are the industrial economy's core (output, capital, energy, compute), the endings and the polity table (capital, cohesion, identity, stores).
  2. Every flow between cells goes through one transport cost, the route graph.
  3. The world economy reads per-cell inputs and writes per-cell outputs, so it splits by polity by summing over a polity's cells.
  4. The endings' draw reads a state, so a race can replace it without touching the endings' mechanics.

## Threads

The page (`main.js`) keeps the clock and posts each frame's planned steps to the engine's worker (`src/engine/worker.js`), which owns the `Planet` and its own GPU device and runs the climate as an async loop of 10 ms slices. The page's device draws the globe and steps the weather; the chart's worker traces the synoptic chart; the people run at level 6 on their own worker (`src/engine/people-worker.js`), linked to the engine's by a `MessageChannel`. The clock holds while two plate steps are outstanding, so the dial's top is what the engine manages.

## Solid Earth

| Layer | Code | Form |
|---|---|---|
| Plates | `plates.js` `PARAMS` | Each plate's crust in its own frame on a full grid copy; world cell i reads plate k at Qₖ⁻¹xᵢ, so motion is exact. Torque balance: slab pull along edges (down-dip, only where plates close by `SLAB_CLOSING`), slab resistance `K_TRENCH`, ridge push from subsidence, drag −c∫(1 + KEEL φ)(I − rrᵀ) dA ω, the mantle's traction; ω relaxes over `V_RELAX`, capped at `V_MAX` (20 cm/yr). Substeps so no plate moves more than one cell a step. |
| Consumption | `plates.js` | Ocean sinks, leaving slab memory (decay `SLAB_TAU` 15 Myr) and arc crust; continent on continent stacks `COLLIDE_FRAC` 0.85 on the front cell and sutures. |
| Deformation | `plates.js` `deform` | Moves crust, makes none: rifted margins (`STRETCH` 0.3 of crust over `H_BREAK` 10 km into the gap), the wedge (`TAPER` 0.12 km/km), the plateau (`H_PLATEAU` 60 km). None of it is a load to the crust's flexure. |
| Trenches | `plates.js` `trenches` | w(x) = −w₀ e^{−x/α} cos(x/α), w₀ = 3 km √(age/100 Myr), α = 70 km (age/100)^{3/8}, each cell its mean over its width. |
| Mantle | `mantle.js` `MANTLE` | Graveyard dσ/dt = flux − σ/`T_SINK` (150 Myr), exact; ∇²φ = `K_FLOW` (pile share × ∫σ − σ), u = ∇φ; dynamic topography `DYN` (0.4 km) × (piles − tanh σ/σ_ref); hotspots drift at `DRIFT` 0.5 of u. Level 4. |
| Isostasy, sea | `crust.js` | Airy columns; seafloor on GDH1's subsidence; the sea fills to `FREEBOARD` (2.5 km) over a new ridge at the opening; the ocean is what the open sea reaches through channels (`SEA.STRAIT` 25 m), basins hold lakes; straits scour at 0.4 km/Myr e^{−d/25 m}. Water drifts toward the opening's land fraction over 150 Myr. |
| Genesis | `genesis.js` | Thresholded noise over 40% of the sphere, 80 Myr of spin-up; continents take Earth's elevation quantiles by distance from the ocean (`EARTH_CRUST`, from `tools/earth/crust-table.mjs`). |
| Plumes, polarity | `plumes.js`, `polarity.js` | Ten hotspots; plume heads Poisson (~30 Myr): a 1,100 km flood basalt, 8,000 Pg C, a rift under a large continent. Seeded reversals (Earth's GTS2012). |

## Surface

| Layer | Code | Form |
|---|---|---|
| Landscape | `landscape.js` `LAND` | Priority flood from the coast, steepest descent on the filled surface (plus ±25 m roughness per plate cell). Stream power n = 1: dz/dt = −K Qᵐ S, implicit (Braun and Willett), Q runoff-weighted; rebound (1 − ρ_c/ρ_m). Sediment to a shelf `SHELF` below sea level, then seaward. Diffusion of thickness between continental cells, `KAPPA` surface and `KAPPA_THICK` deep. |
| Regolith | `regolith.js` | Production P₀e^{−h/h₀} (h₀ 0.5 m, P₀ 0.1 mm/yr at 15 °C and 0.3 m/yr runoff, × runoff^0.25 e^{(T−15)/30}); steady h* = h₀ ln(P₀/E), stepped exactly. Sets the bed's softness, the soil's capacity (40–260 mm) and weathering's supply. |
| Crust's flexure | `crustflex.js`, `flexure.js` | Correction c → Δq/ρ_m g − w(Δq, Tₑ) over τ (∞ oceans, 50 Myr continents), capped at 2 km; Δq is the load's change since last seen. Thin plate D∇⁴w + Δρ g w = q by multigrid, broken at boundaries; Tₑ from ocean age (450 °C) and continents' age, thickness and suture. |
| Ice | `ice.js` `ICE` | Shallow ice −ΓH⁵|∇s|²∇s plus Weertman sliding u_b = C τ_b³ × thawed (C log-linear in the bed's softness); speed capped at 3 km/yr. Degree-day mass balance; calving u_f = `CALVE` d (TF₊ + TF_COLD)/(TF_REF + TF_COLD); the bed by Robin's column; erosion ė = 2×10⁻⁶ u_b, Σ eroded = Σ till + Δ debris. The bed by ELRA (3 kyr) toward the flexural response; the elevation takes the load at once, since a lagging bed lets sheets overgrow and collapse. |
| Ground | `soil.js`, `ground.js` | Manabe's bucket to the regolith's capacity: E = PET × min(1, S/0.75 S_max), overflow w⁴, drainage 0.4 S_max w⁴ a month; degree-day snow; ground heat insulated by snow (permafrost); baseflow over 4 months; PET = 55/12 (T + 4) mm a month. The closure is the periodic year; live, it steps with the year. |
| Lakes | `lakes.js` | Routed on the smooth surface (ice dams them) by each cell's channel `gz`; backward Euler on runoff and open-water P − E; at fast dials the balance A = Q/(E − P), solved down the depression hierarchy once a basin; salt flats where a closed lake dried over ~3 kyr. |

## Climate

| Layer | Code | Form |
|---|---|---|
| Energy balance | `climate.js` `CLIMATE` | C ∂T/∂t = S(1 − α) − (A + BT) + L_c + 5.35 ln(CO₂/CO₂₀) + F + ∇·D∇T on level 5, the mean and two harmonics by COCG or BiCGSTAB; A 234, B 2.09; D = 1.14 (1 − 0.85 sin²φ), D_SEASON 0.44; capacities 7.9 sea, 0.61 land, 1.2 ice W yr m⁻² K⁻¹; albedo resampled at 24 points of the year, Anderson-mixed to 0.02 K. Each fine cell's seasons: (B + K + ikωC) T̂ = F̂ + L + K T̂ₘ, K 8 W m⁻² K⁻¹. Lapse 5.4 K/km. |
| Clouds | `clouds.js` | High cloud 0.27 (1 − e^{−P/0.72 mm/day}); low cloud by column humidity and, over open sea at 45–60°, stratocumulus by EIS (7.1–15.3 K); shortwave by the adding formula; the high cloud's top at 220 K replaces A + BT over its share, the clear sky capped at 300 W/m². |
| Air's heat | `airheat.js` | The surface wind's rotational part as edge fluxes (∇²ψ = ζ, divergence-free), carrying 1 km of air at the surface's temperature; sums to nothing. |
| Sea's heat | `seaheat.js`, `ocean.js` | Steady θ: ρc_p(ΣF_in θ_in − F_out θ) = λA(θ − T); currents the gyres' (Stommel: ε∇²ψ + ∂ψ/∂λ = a² curl τ/2Ωρ₀) plus an overturning where a latitude circle is all sea (Drake Passage effect), `EKMAN` 0.6 of its Ekman transport plus `MIX` Sv. |
| Circulation | `climate.js` | A template: the ITCZ the warmest latitude per 10° sector; the Hadley edge √ΔT/Ω (30° at 28 K); subpolar lows at 2.05 × the edge; thermal pressure −1 hPa/K of departure; r u + f k×u = −∇p/ρ. |
| Moisture | `climate.js`, `gpu/moisture.js` | ∇·(uW) − ∇·(κ∇W) = E − P, steady at six points of the year; rain (W_s/60) e^{CONV_A(r − 0.743)} mm/day + orographic + background; descent raises r₀. |
| Zones | `climate.js` | Köppen's thresholds as logistics over 14 classes, widths the year's spread, so a class's probability is the share of years in it. |
| Year | `year.js` | Hasselmann: C ∂T′/∂t = −BT′ + ∇·D∇T′ + F on level 4, F noise correlated over 1,500 km plus the veil, exact OU steps; rain z = ρT′/σ + √(1 − ρ²)η (ρ −0.3 land, +0.3 sea); live below ~56 yr/s, the closure above ~180. |
| Volcanoes | `volcanoes.js` | Poisson, N(>M) ∝ M⁻¹ in Pinatubos; the veil 0.15 global optical depth per Pinatubo in 5° bands, decaying over 1 yr, −25 W/m² per unit. |
| Runaway | `runaway.js` | The OLR leaves A + BT at 25 °C along a C¹ parabola to 282 W/m²; past it the excess boils the sea, the mean held at the steam's surface (Clausius–Clapeyron, to 1,227 °C). |

## Life and carbon

| Layer | Code | Form |
|---|---|---|
| Carbon cycle | `carbon.js` | Outgassing by ridge opening and trench closing (plus provinces) against weathering runoff^0.65 e^{(T−15)/Tₑ} × supply (0.25 + 0.75 P/(P + E_half)) × cover × pCO₂^0.3; organic burial and oxidation a fifth of outgassing each; `equilibrium(V)` the analytic balance. |
| Sea's carbon | `oceancarbon.js` | LOSCAR-like: air, warm (85%) and cold (15%) surface boxes and the deep, each DIC, alkalinity, phosphate; constants Weiss, Lueker, Dickson, Mucci; 20 Sv overturning; shelf carbonate (Ω − 1)^1.7 and deep burial above the compensation depth; backward Euler in seven unknowns. |
| Cover | `vegetation.js` | VECODE: vegetated share over 3 yr and trees' share over 200, exact, toward the equilibrium from degree-days, rain and cold; NPP by Lieth's Miami model with CO₂ fertilization; pools in closed form; fire and browsing hold the trees × (1 − D). |
| Dust | `dust.js`, `aeolian.js` | GOCART emission C S u²(u − u_t) averaged over Rice-distributed gusts; two bins carried and mixed, settled (0.1, 1 cm/s over 3 km), washed out (14% of the column per mm); τ forcing −20τ(1 − α/0.45); darkens snow, iron raises the cold box's uptake (1 + K) r/(r + K), K = 1. |
| Lakes' algae | `lakes.js`, `life.js` | Vollenweider: TP = (load + P_DEP)/(q_out + V_SETTLE); production PP_MAX × TP/(TP + K_TP) × the open warm season. |

## Weather, tides and the sky

| Layer | Code | Form |
|---|---|---|
| Weather | `gpu/weather.js` `WEATHER` | Two-layer QG on level 7, L_d 800 km: PV carried by fluxes from ψ at Voronoi corners (non-divergent), ∇⁴ hyperviscosity, AB2 at 200 s; inversion by one multigrid V-cycle a step; the baroclinic ψ relaxed over 15 days toward the climate's shear; Ekman friction; PV's integral conserved. GPU only. |
| Tide | `tides.js`, `gpu/tides.js` | Linear shallow water on a C grid, forced by the semidiurnal equilibrium tide (body tide 0.69, SAL 0.9); TRiSK Coriolis antisymmetrized in the energy's norm, so it does no work (an unantisymmetrized one grew a deep cell beside a shelf without bound); bottom and internal-tide drag; run to periodic at level 6. |
| Moon | `tides.js` `Moon` | Torque from the solved dissipation (diurnal × 1.25, solar 0.46² of it), constant time lag between solves; spin by backward Euler, angular momentum exact, never past synchronous. |
| Sky | `render/sky.js` | Seeded stars, the Sun and Moon at true size × 5, sunspots on an 11-year cycle. |

## People

`people.js` (its header holds every form), `cohorts.js`, `routes.js`, `peoples.js`, `polities.js`, linked to the planet by `peoplelink.js`.

| Part | Form |
|---|---|
| The loop | Kremer's, run four times (foragers, farmers, industry, compute): minds M make ideas at A M^ψ a year, lost at λz; capacity ∝ e^{θz}. ψ = 1 gives 1/(t* − t), t* = 1/(θ A M₀); the low fixed point vanishes at A θ e M₀ = λ (the tip). Knowledge z in two domains, production and learning, ideas split ½ ∓ `TILT` (0.15) by who feeds themselves; production's ideas × sig((D_BASE − (z_P − z_L))/W_BASE). |
| Minds | M = N_C (1 − e^{−πℓ²ρ/N_C}) within a connected body, ℓ = ℓ_S(t) e^{z/Z_L}, ℓ_S logistic 1,000 → 3,000 km, e-fold per 35 kyr; a region's luck × e^{σξ − σ²/2}, σ 0.4. |
| Spread | Fisher–KPP with dispersal growing with knowledge and industry; sea edges to 6 cells, long crossings, ocean routes; voyages at S_SEA × crowding × e^{z/Z_V} × e^{−km/reach}. |
| Food | Foraging by NPP and the coast's export production; fields on floodplains (W_FP √Q wide) and uplands (Miami's rain limb × warmth × fertility 1/(1 + leaching/L_FERT)); farming's origins a hazard by domesticates, knowledge, settledness and steady harvests; crops by climate envelopes; herds logistic at 15%/yr less die-offs; game logistic at 3%/yr less the hunt; the store keeps (1 − e^{−ℓG})/(ℓG). |
| Demography | Births and deaths toward the food capacity, the transition with income; one-year cohorts with Siler/Gompertz deaths ride the total; `B_MIN` (0.01245) is the rich life table's replacement rate. |
| Routes, trade, cities | One route graph (sail by the planet's winds and gyres, steam, rail); markets on level 4, Dijkstra between them; trade a gravity kernel e^{−c/reach} every 10 years, pooling harvests by τ (15% → 90%); cities fed over catchments, dying `D_CITY` 1%/yr past the countryside before sanitation. |
| Works | A quarter of a city's labour: learning's works (forgetting λ/(1 + w/W_WORK)) and the land's terraces, canals, granaries and roads, each to its room; canals' salt s → a/(a + b), exact. |
| Peoples | A point a way of life a cell on a torus of side 8: drift E d² = 4σ²t (σ² 2×10⁻⁴); contact pull R_CONT g(d), g = 0.05 + 0.95/(1 + (d/0.5)²); conformist mixing; customs' attractors; a founder's kick. |
| States | Power = arms in the region × cohesion × e^{z/1.5} × e^{−cost/L} (Boulding); resistance B_LOC × arms × ruggedness × exit (Scott, Carneiro); allegiance → dπ^γ/(Σπ^γ + π₀^γ), γ 3, over 20 yr; cohesion dA/dt = 0.07 f A(1 − A) − 0.005(1 − f)A (Turchin); founding by cities over 20,000; identity pulled to the capital's, and by the media where learning spans the world. |
| Industry, AI | Industry where dense farmers (10/km²) have coal and ore; Solow capital K/Y = s/δ; energy CES; finite fossil carbon and ores (Lasky, Skinner); AI capital doing labour through a task CES; robots growing at most e-fold per 1.44 yr. |
| Endings | A draw on two axes (a third paused; aligned or not; Earth preserved or sacrificed): 1a, 1b, 2a, 2b, 3a, 3b. Off-world: the swarm takes the inner planet (2.8×10²³ kg for the whole Sun), habitats from the belt, probes at 0.5 c. |

## Calibration targets

The climate is tuned on today's Earth at level 6 with `tools/earth/tune.mjs`; the people's model on the `earth` seed with `tools/people/earth-score.mjs`.

| Target | Model | Observed | Tool |
|---|---|---|---|
| Land temperature rms (year, January, July) | 3.8, 5.6, 4.8 K | UDel | `climate-score.mjs` |
| Sea surface by latitude rms; sea ice | 1.1 K; 0.04 | OISST | `climate-score.mjs` |
| Land's rain; log-ratio rms | 859 mm/yr; 0.71 | 718 mm/yr (UDel) | `climate-score.mjs` |
| Köppen classes; groups agreeing | 46%; 73% of land | | `climate-score.mjs` |
| Reflected shortwave; clear sky | 99.0; 54.9 W/m² | 99.0; 53.3 (CERES EBAF) | `climate-score.mjs` |
| Outgoing longwave; clear sky | 241.3; 268.1 W/m² | 240.4; 268.3 | `climate-score.mjs` |
| Clouds' forcing, short and long | −44.2, +26.7 W/m² | −45.7, +27.9 | `climate-score.mjs` |
| Overturning; heat across 26° N | 11.3 Sv; 1.2 PW | | `climate-score.mjs` |
| Doubled CO₂, ice sheets held | 2.8 K | | `climate-score.mjs` |
| Plates' opening balance rms; correlation with Müller 2019 | 4.80 cm/yr; 0.927 | 4.40 cm/yr | `plates-score.mjs` |
| Hypsometry at the opening (land, mean, 90th, 99th percentile) | 27.1%, 0.67, 1.44, 4.15 km | 27.5%, 0.63, 1.37, 4.6 (ETOPO) | `tools/hypsometry.mjs` |
| Mean ocean depth | 3.84 km | 3.62 km | `tools/hypsometry.mjs` |
| Floor deeper than 6 km | 0.6% of the sphere | 0.5% | `tools/hypsometry.mjs` |
| Earth's opening: bed rms; grounded ice | under 80 m; 29.3 M km³ | ETOPO 2022 | `tests/earth.test.mjs` |
| Tidal dissipation | ~4.8 TW | ~3.7 TW | the page |
| Dust emission; lifetime | ~1,600 Tg/yr; ~2 days | | `tools/dust-check.mjs` |
| Lakes' production (Caspian, Great Lakes, Baikal) | ~100, ~100, ~70 g C m⁻² yr⁻¹ | 50–110, 50–250, 75–120 | `climate-score.mjs` |
| People's score at early takeoff, Σ share × \|ln(model/observed)\| | ~1.05 ± 0.07 over eight draws | regions' shares of ~2023 | `people/earth-score.mjs` |
| Early takeoff | ~235–290 yr after industry, ~7.4–8.2 B people | | `people/earth-score.mjs` |
| The first state | ~6 kyr after the first fields | ~6 kyr (Uruk, Egypt) | `people/earth-score.mjs` |
| The largest state's share at industry | ~13% | ~⅓ (the Qing) | `people/earth-score.mjs` |
| The lead's changes in the last 5 kyr before industry | ~16 | ~15–20 | `people/earth-score.mjs` |
| A great state's median life | ~600 yr | ~200–500 | `people/earth-score.mjs` |

The people's score is a guide, not a target: the model's Earth has its own climate, so where people live should be plausible for that climate rather than today's map. Seeded planets aren't tuned; after a change that moves the climate, report how they shift.
