# The model

Each layer's form, grid, step and constants, and the calibration targets. Each source file's header holds its layer in full; this is the map.

## Constraints that steer new work

- **One planet, one state, one dial.** Layers share fields (elevation is one array: plates raise it, erosion lowers it, ice loads it, the climate reads it); every coupling is a live flux. Fig. 2 draws only couplings the code has.
- **The dial is scale separation.** Each layer declares its timescale, stable step, substep budget and closure; the scheduler (`src/clock.js`) runs it live, summarized or banked, always advancing model time. Drawing crossfades over half a decade of the dial, never switches.
- **Grids nest.** Icosahedral, 10·4^k + 2 cells; transfers area-weighted, integrals kept. Levels: engine 7 (55 km; 6 on phones, tablets and four-core or 4 GB machines), energy balance and gyres 5, year's anomaly 4, mantle 4, tide 6, people 6, their routes 5 and 4.
- **The CPU is the reference.** Every GPU path has a CPU twin for the tools and tests. The plates' CPU frames are authoritative; rifts, merges and initiation rewrite whole plates on the CPU.
- **Rules, not emergence**, for tectonics: rifting and subduction initiation are rules, not convection.
- **Little more geology; life minimal except people.**
- **People write through the planet's own inputs** (carbon, tillage into erosion, land use into cover, waste heat and sulfate as forcings, the boiled sea), never new sinks.
- **Soft forms over hard caps** for people: harmonic sums, logistic hazards, exponential floors. States decide nothing; all they do is a flux.
- **The people's seam rules** (later batches and the game rely on them): (1) people's state is per cell; the only world-level arrays are the industrial core (output, capital, energy, compute), the endings and the polity table (capital, cohesion, identity, fiscal capacity, stores, office); (2) every flow between cells uses the route graph's one cost; (3) the world economy reads and writes per cell, so it splits by polity by summing cells; (4) the endings' draw reads a state, so a race can replace it.

## Threads

`main.js` keeps the clock and posts each frame's steps to the engine worker (`src/engine/worker.js`: the `Planet`, its own GPU device, the climate as an async loop of 10 ms slices). The page's device draws the globe and steps the weather; a chart worker traces the synoptic chart; the people run at level 6 on `src/engine/people-worker.js`, linked to the engine by a `MessageChannel`. The clock holds while two plate steps are outstanding.

## Solid Earth

| Layer | Code | Form |
|---|---|---|
| Plates | `plates.js` `PARAMS` | Each plate's crust in its own frame on a full grid copy; cell i reads plate k at Qₖ⁻¹xᵢ. Torques: slab pull (down-dip, where closing by `SLAB_CLOSING`), slab resistance `K_TRENCH`, ridge push, drag −c∫(1 + KEEL φ)(I − rrᵀ) dA ω, mantle traction; ω relaxes over `V_RELAX`, ≤ `V_MAX` 20 cm/yr; substeps ≤ one cell. |
| Consumption | `plates.js` | Ocean sinks to slab memory (`SLAB_TAU` 15 Myr) and arc crust; continents stack `COLLIDE_FRAC` 0.85 on the front cell and suture. |
| Deformation | `plates.js` `deform` | Moves crust, no flexural load: rifted margins `STRETCH` 0.3 over `H_BREAK` 10 km, wedge `TAPER` 0.12 km/km, plateau `H_PLATEAU` 60 km. |
| Trenches | `plates.js` `trenches` | w = −w₀ e^{−x/α} cos(x/α), w₀ = 3 km √(age/100 Myr), α = 70 km (age/100)^{3/8}, cell-averaged. |
| Mantle | `mantle.js` `MANTLE` | Level 4. dσ/dt = flux − σ/`T_SINK` (150 Myr), exact; ∇²φ = `K_FLOW` (pile share × ∫σ − σ), u = ∇φ; dynamic topography `DYN` 0.4 km × (piles − tanh σ/σ_ref); hotspots drift `DRIFT` 0.5 u. |
| Isostasy, sea | `crust.js` | Airy; GDH1 subsidence; at the opening the sea fills to `FREEBOARD` 2.5 km over a new ridge; ocean is sea joined through channels (`SEA.STRAIT` 25 m), else lakes; straits scour 0.4 km/Myr e^{−d/25 m}; water drifts to the opening's land fraction over 150 Myr. |
| Genesis | `genesis.js` | Thresholded noise over 40% of the sphere, 80 Myr spin-up; Earth's elevation quantiles by distance from the ocean (`EARTH_CRUST`, `tools/earth/crust-table.mjs`). |
| Plumes, polarity | `plumes.js`, `polarity.js` | Ten hotspots; plume heads Poisson ~30 Myr (1,100 km flood basalt, 8,000 Pg C, a rift under a large continent); seeded GTS2012 reversals. |

## Surface

| Layer | Code | Form |
|---|---|---|
| Landscape | `landscape.js` `LAND` | Priority flood from the coast, steepest descent (±25 m roughness per plate cell); stream power n = 1, dz/dt = −K Qᵐ S, implicit (Braun and Willett), Q runoff-weighted; rebound (1 − ρ_c/ρ_m); sediment to a shelf `SHELF` deep, then seaward; thickness diffusion `KAPPA` (surface), `KAPPA_THICK` (deep). |
| Regolith | `regolith.js` | P = P₀e^{−h/h₀} runoff^0.25 e^{(T−15)/30}, h₀ 0.5 m, P₀ 0.1 mm/yr at 15 °C and 0.3 m/yr; h* = h₀ ln(P₀/E), exact. Sets bed softness, soil capacity 40–260 mm, weathering supply. |
| Crust's flexure | `crustflex.js`, `flexure.js` | c → Δq/ρ_m g − w(Δq, Tₑ) over τ (∞ ocean, 50 Myr continent), ≤ 2 km; D∇⁴w + Δρ g w = q by multigrid, broken at boundaries; Tₑ from ocean age (450 °C) and continents' age, thickness, suture. |
| Ice | `ice.js` `ICE` | −ΓH⁵\|∇s\|²∇s + Weertman u_b = C τ_b³ × thawed (C log-linear in bed softness), ≤ 3 km/yr; degree-day balance; calving `CALVE` d (TF₊ + TF_COLD)/(TF_REF + TF_COLD); the bed's temperature by Robin's column; ė = 2×10⁻⁶ u_b, Σ eroded = Σ till + Δ debris; bed by ELRA (3 kyr), elevation loaded at once (a lagging bed makes sheets overgrow and collapse). |
| Ground | `soil.js`, `ground.js` | Manabe bucket to the soil capacity: E = PET min(1, S/0.75 S_max), overflow w⁴, drainage 0.4 S_max w⁴ a month, PET = 55/12 (T + 4) mm a month; degree-day snow; snow-insulated ground heat (permafrost); baseflow over 4 months; closure the periodic year. Aquifer: recharge `F_AQ` 0.2 of groundwater outflow, emptying over `TAU_A` 1,000 yr into the rivers, exact per climate cycle; wells draw it. |
| Lakes | `lakes.js` | Routed on the smooth surface (ice dams) by channel `gz`; backward Euler on runoff and P − E; fast dials A = Q/(E − P) down the depression hierarchy; salt flats where a closed lake dried ~3 kyr. Drawn rivers on the rough routing, over sheets by `Landscape.iceRoute`. |

## Climate

| Layer | Code | Form |
|---|---|---|
| Energy balance | `climate.js` `CLIMATE` | Level 5, mean + two harmonics (COCG, BiCGSTAB): C ∂T/∂t = S(1 − α) − (A + BT) + L_c + 5.35 ln(CO₂/CO₂₀) + F + ∇·D∇h; A 235.6, B 2.09, land OLR at T − `OLR_Z` 0.65 Γz; D = 0.6 (1 − 0.615 sin²φ), `D_SEASON` 0.22; C 7.9 sea, 0.6 land, 1.2 ice W yr m⁻² K⁻¹, lakes `C_WATER` 0.1325 a metre to `LAKE_MIX` 20 m (≥ land; land's while frozen; `heatCapacity`); albedo at 24 points, Anderson-mixed to 0.02 K. Fine cells (B + K + ikωC) T̂ = F̂ + L + K T̂ₘ, K 8 W m⁻² K⁻¹; lapse 5.4 K/km. h = T + s(φ) `MSE` 0.88 K/mm · r W_s(T_s) + `MSE_Z` 0.7 (g/c_p − Γ) z; r column humidity (soft at 1, a cycle behind, relaxed by half); s 0.3 within 10° to 1 past 25°; per edge D(1 + μ), μ = s ∂q/∂T, plus a lagged rest exact at the fixed point. |
| Clouds | `clouds.js` | High 0.27 (1 − e^{−P/0.72 mm/day}), top 220 K replacing A + BT over its share; low by column humidity, stratocumulus by EIS 7.1–15.3 K over open sea 45–60°; adding-formula shortwave; clear sky ≤ 300 W/m². |
| Air's heat | `airheat.js` | Rotational surface wind (∇²ψ = ζ) as edge fluxes of 1 km of air; sums to zero. |
| Sea's heat | `seaheat.js`, `ocean.js` | ρc_p(ΣF_in θ_in − F_out θ) = λA(θ − T); Stommel gyres ε∇²ψ + ∂ψ/∂λ = a² curl τ/2Ωρ₀, plus overturning where a latitude circle is all sea, `EKMAN` 0.37 of Ekman transport + `MIX` Sv; stress ρ_a C_D √(\|u\|² + G²) u, G 6 m/s past 30° (a tenth within 10°). T′ to upwelling: coastal Ekman; equatorial `UPWELL_EQ` × west-to-east basin position × e^{−(φ/5.5°)²}. |
| Deep sea | `deepsea.js` | Two layers (standard: Held and others 2010; Geoffroy and others 2013): C_D dθ/dt = γ(T − θ), γ 1.03 W m⁻² K⁻¹, C_D 149 W yr m⁻² K⁻¹ a m² of sea (CMIP5's 0.73, 106 a m² of planet ÷ 0.71), less under sea ice; exact; the balance charged γ(1 − e^{−x})/x, x = γs/C_D over the last cycle's span s; live at the people's dials, else at balance. |
| Circulation | `climate.js` | ITCZ per 10° sector, 2° bands weighted e^{score/0.6 K}, score = T (sea T + T′) − 1.5 K per mm short of 0.82 saturation, interpolated by longitude. Hadley edge √ΔT/Ω (30° at 28 K); subpolar lows 2.05× edge; −0.6 hPa/K; r u + f k×u = −∇p/ρ. |
| Moisture | `climate.js`, `gpu/moisture.js` | ∇·(uW) − ∇·(κ∇W) = E − P at six points of the year; rain (W_s/60) e^{CONV_A(r − 0.743)} mm/day + orographic + background; descent raises r₀. |
| Zones | `climate.js` | Köppen thresholds as logistics over 14 classes, widths the year's spread. |
| Year | `year.js` | Level 4: C ∂T′/∂t = −BT′ + ∇·D∇T′ + F (Hasselmann), noise correlated over 1,500 km plus the veil, exact OU; rain z = ρT′/σ + √(1 − ρ²)η, ρ −0.3 land, +0.3 sea; live below ~56 yr/s, closure above ~180. |
| Volcanoes | `volcanoes.js` | Poisson, N(>M) ∝ M⁻¹ in Pinatubos; veil 0.15 optical depth per Pinatubo in 5° bands, 1 yr decay, −25 W/m² per unit. |
| Runaway | `runaway.js` | OLR leaves A + BT at 25 °C on a C¹ parabola to 282 W/m²; the excess boils the sea, the mean at the steam's surface (Clausius–Clapeyron, ≤ 1,227 °C). |

## Life and carbon

| Layer | Code | Form |
|---|---|---|
| Carbon cycle | `carbon.js` | Outgassing (ridge opening, trench closing, provinces) against weathering runoff^0.65 e^{(T−15)/Tₑ} (0.25 + 0.75 P/(P + E_half)) × cover × pCO₂^0.3; organic burial and oxidation each ⅕ of outgassing; `equilibrium(V)` analytic. |
| Sea's carbon | `oceancarbon.js` | LOSCAR-like: air, warm (85%) and cold (15%) boxes, deep; DIC, alkalinity, phosphate; Weiss, Lueker, Dickson, Mucci; overturning × 20/9.7; deep at the cold box's T less the deep sea's lag; shelf carbonate (Ω − 1)^1.7, deep burial above the CCD; backward Euler in seven unknowns. |
| Cover | `vegetation.js` | VECODE: vegetated share over 3 yr, trees over 200, exact; Miami NPP with CO₂ fertilization; pools closed-form; fire and browsing × (1 − D) on trees. |
| Dust | `dust.js`, `aeolian.js` | GOCART C S u²(u − u_t) over Rice gusts; two bins, settling 0.1 and 1 cm/s over 3 km, washout 14% a mm; forcing −20τ(1 − α/0.45); darkens snow; iron × (1 + K) r/(r + K), K = 1, on the cold box. |
| Lakes' algae | `lakes.js`, `life.js` | TP = (load + P_DEP)/(q_out + V_SETTLE) (Vollenweider); PP_MAX TP/(TP + K_TP) × the open warm season. |

## Weather, tides and the sky

| Layer | Code | Form |
|---|---|---|
| Weather | `gpu/weather.js` `WEATHER` | GPU only. Two-layer QG, level 7, L_d 800 km: PV fluxes from corner ψ, ∇⁴ hyperviscosity, AB2 at 200 s, one multigrid V-cycle a step; baroclinic ψ relaxed over 15 days to the climate's shear; Ekman friction; PV conserved. |
| Tide | `tides.js`, `gpu/tides.js` | Linear shallow water, C grid, semidiurnal forcing (body 0.69, SAL 0.9); TRiSK Coriolis antisymmetrized in the energy norm (else it grows without bound); bottom and internal drag; periodic at level 6. |
| Moon | `tides.js` `Moon` | Torque from the dissipation (diurnal × 1.25, solar 0.46²), constant lag; spin by backward Euler, angular momentum exact, stops at synchronous. |
| Sky | `render/sky.js` | Seeded stars; Sun and Moon 5× true size; 11-year sunspots. |

## People

`people.js` (its header holds every form), `cohorts.js`, `routes.js`, `peoples.js`, `polities.js`, `classes.js`, `pathogens.js`; `peoplelink.js` links them to the planet.

| Part | Form |
|---|---|
| The loop | Kremer's, four times (foragers, farmers, industry, compute): ideas A M^ψ a year, lost at λz; capacity ∝ e^{θz}; ψ = 1 gives 1/(t* − t), t* = 1/(θ A M₀); the tip at A θ e M₀ = λ. z in production and learning; ideas ½ ∓ `TILT` 0.15 by who feeds themselves; production's × sig((D_BASE − (z_P − z_L))/W_BASE). Harder ideas: × e^{−BETA_A (z_L − Z_BA)}, BETA_A 0.6, Z_BA 3.5, lifted past Z_UP 6; past industry × e^{−BETA_R (z_L − Z_IND)}, BETA_R 0.25. |
| Minds | M = N_C (1 − e^{−πℓ²ρ/N_C}) per connected body, ℓ = ℓ_S(t) e^{z/Z_L}, ℓ_S logistic 1,000 → 3,000 km, e-fold 35 kyr; luck × e^{σξ − σ²/2}, σ 0.4. |
| Spread, migration | Fisher–KPP, explicit (≤ 4 substeps, 48 with industry); sea edges to 6 cells; voyages S_SEA × crowding × e^{z/Z_V} × e^{−km/reach}. Migration down one potential, crowding N/(K + goods); × 1 − (1 − B_MIG 0.1) × schooling into schooled places across borders; × (1 + K_CHAIN likeness)/(1 + K_CHAIN), K_CHAIN 1; × age weight against the stable pyramid. War's toll: F_FLEE 0.3 flees, F_CAPT 0.2 taken captive. Exit 1 − u_b, the land neighbours' spare room (Domar, Carneiro). |
| Settlers | `settlers`: every DT_SET 10 yr, market pairs joined only over open ocean relax toward equal crowding: n*(1 − e^{−2r dt}), n* = Δu/(1/Y_i + 1/Y_j), r = R_SET 0.001 × ship share × e^{−cost/reach} × survival × chains × border cut; D_PASS a year die at sea; ≤ the largest pair's n*; landing on the KL_SET 8 roomiest places with ways, knowledge, immunity and state. |
| Industry's spread | × B_IND 0.02 + 0.98 s⁵ across borders (s the shared holders), × 1 − 0.9 (1 − likeness⁵) between peoples; whole past Z_ABS 8.3. |
| Archaic peoples | On the home world-island (crossings ≤ D_ARCH 300 km, cold to Z_ARCH 1), at balance when the first people arise; fixed Z_AK 0.5, reach F_ARCH 1.65 against F_SAP 1.8. Lotka–Volterra: the moderns' room K − N_a K_a/K; archaics logistic at R_ARCH 0.02, crowded by N K/K_a², ≤ C_ARCH 3; assimilated at R_ASSIM 2×10⁻³ ρ/(ρ + RHO_COPY) a year, conserved. Game wary 1 − e^{−ρ_a/RHO_WARY}, RHO_WARY 0.005 km⁻². |
| Food | Foraging by NPP; fishing by coastal export production, lakes, floodplains. Fields F0 1 km⁻² toward CAP_A 40× (organic ceiling), industry's LIFT_MAX 10× that. Floodplains W_FP √Q. Watered: canals (dry warm season), tanks ETA_TANK 0.05, wells F_WELL 0.5 of recharge (with industry the store over T_PUMP 100 yr, ≤ W_PUMP 10 mm/yr), × min(1, (warm − growing months)/LGP_WET), ≤ IRR_MAX. Paddies Y_PAD × the warm crop, soil 1/(1 + (1 − F_PAD) leaching/renewal), room flat uplands (S_PAD) ponded by SUR_PAD 600 mm of surplus above T_PAD 20 °C, × the package's `pad`; W_PADDY 100 person-yr km⁻². Uplands: Miami rain × warmth × 1/(1 + leaching/(L_FERT (B_FERT + erosion/E_FERT + dust/D_FERT))), D_FERT 0.02 kg m⁻² yr⁻¹. Farming hazard H_FARM 2×10⁻⁵; crops by climate envelope; herds 15%/yr and game 3%/yr logistic; store (1 − e^{−ℓG})/(ℓG). |
| Demography | Toward the food capacity; births half-fallen at Y_B 8 sy a person; medicine past Z_MOD 7.45 (exponent + U_MED 1.4, Preston), reaching beyond industry as the best production passes Z_MEDF 7.9 over 0.3 (16%, 65%, 91% reached at 1913, 1950, 1973); one-year Siler/Gompertz cohorts; `B_MIN` 0.01245, the replacement rate. |
| Pathogens | No kinds. Spillover H_SPILL N (herds + K_WILD × wild) × crowding; traits at birth (R0 lognormal; period, waning, virulence log-uniform; vector share; reservoir F_RES, range within R_ENV 2σ). R = R0 κ [(1 − x) + x vec], κ = (ρ/(ρ + RHO_PATH))^½ (1 + K_CITY u). ds/dt = b(1 − cov − s) + ω(1 − s) − λ Z(Rs) s (Kermack–McKendrick), backward Euler. Persistence σ(ln(I⋆/I_MIN)/W_P), I⋆ = N_conn (b + ω)(1 − 1/R) D over K_PATH 48 partners (12 parted Australia from Asia), × 1 − e^{−I}, I at the step's start (else endemic at birth). Endemic λ = L_END, else introductions. First-case deaths v(1 + K_COLL S^Q_COLL (1 − medicine)), S = ι (1 − e e^{b A_NURSE})⁺ × attack, A_NURSE 15 yr, fading over T_SICK 10 yr; a stranger's v(1 + K_ADULT), K_RE of that again; soft max (order 8) with the usual deaths (T_USUAL, ≤ F_DIS). Vaccination V_COV × medicine. |
| Routes, trade, cities | One graph (sail by winds and gyres, steam, rail), level-4 markets, Dijkstra. Coasting: open-ocean legs (past D_COAST 350 km, soft 50) × (1 + K_OPEN 30); the ocean ship once `People.nav` = σ((z − Z_OCEAN)/W_OCEAN) passes NU_MIN 10⁻⁴; mixed by navigation (`between`); V_COAST 1 m/s, V_SHIP (`years`). Land edges ÷ (1 + R_ROAD roads + K_CANAL canals); steam on built railways. Reread every T_ROUTES 1,000 yr (25 with industry) where 0.1% of edges moved 10%. Trade e^{−c/reach} every 10 yr, pooling τ 15% → 90%. Cities U_SPEND 0.5 of land elites' take (Cantillon), `D_CITY` 1%/yr deaths before sanitation. |
| Works | A quarter of city labour: learning (forgetting λ/(1 + w/W_WORK)), terraces, water control, paddies, granaries, roads; farmers' slack S_FARM 0.01 × min(1, N/K) (Boserup); canal salt s → a/(a + b). Industrial stocks per place: factories and railways DELTA_F, power DELTA_E, datacenters DELTA_C, robots DELTA_R; war breaks W_WORKS; railways W_RAIL 200 sy km⁻² × (1 − e^{−ρ/RHO_RAIL}), RHO_RAIL 20, from ≤ F_RAIL 0.3 of investment over T_RAIL 30 yr. Drain: the share `fo` built past local saving sends that share of capital income to its owners' capitals. |
| Peoples | A point per way of life per cell on a torus of side 8: drift E d² = 4σ²t, σ² 2×10⁻⁴; contact R_CONT g(d), g = 0.05 + 0.95/(1 + (d/0.5)²); conformism; customs' attractors; founder's kick. Elites' own point: carried by migrants, replaced by conquest at κ × share, drawn to commoners (1/T_DYN + K_CULL ψ) and rulers (κ × share / T_REN 50 yr). |
| States | Power = arms × cohesion × e^{z/1.5} × e^{−cost/L} (Boulding); resistance B_LOC × arms × ruggedness × exit (Scott); allegiance → dπ^γ/(Σπ^γ + π₀^γ), γ 3, over 20 yr; cohesion dA/dt = 0.07 f A(1 − A) − 0.005(1 − f)A (Turchin), the core's by likeness. Founding N_STATE 10⁵ (soft); successor seats N_SEC 2×10⁴, schooled × (1 + K_NATF schooling); secession where π₀ beats v and cohesion passes A_ORG (uti possidetis). Taking held places over T_WAR (1 + K_NORM × media), stateless land over T_WAR (slowing that too emptied ~5% of peopled land). Identity the capital's elite's (toward its people's by schooling), drawn over T_DYN 150 yr, pulling its people and, by media, nations. κ from KAP0 0.2 toward KAP0 + (1 − KAP0) σ((z − 5)/0.75) by war over T_KUP 100 yr, back over T_KDN 300 yr; take κ direct, F_TRIB 0.3 from vassals, K_RENT 0.5 of rent. Schooled resistance × e^{−K_SELF (1 − min likeness)} (Gellner). |
| The steppe | Riding past Z_RIDE 4.6; herders' states where (1 + horse) × herders × settled / N_CAMP² > 1, N_CAMP 10⁵; reach × (1 + horse × herders), by land only; F_RIDE 0.3 of arms massed; administers herders only. Tribute T_TRIB 0.2 ρ^γ/(1 + ρ^γ), raids W_RAID 0.01 × that on the stateless; tributary cities ≥ 20,000 fall at R_SEC ψ ρ^γ/(1 + ρ^γ). The horse M_HERD fades past Z_GUN 6.6 over 0.15. |
| Empires, balancing, captives | Projection F_PROJ 0.1 × e^{−cost/LP}, LP = L_PROJ_S ν + (L_PROJ − L_PROJ_S ν) i/(i + 0.05), sail L_PROJ_S 10⁴ by navigation ν, steam L_PROJ 20,000 by industry i, KJ_PROJ 4 a market; × 1/(1 + m T_TOUR), T_TOUR 5 yr, m the strangers' disease deaths, × 1 − F_QUIN 0.85 σ((z_L − 7.0)/0.2) (Curtin). Industrial arms × (1 + K_ARM y/ȳ), K_ARM 0.5 (Kennedy). Balancing (Waltz): G = κ × cohesion × arms × e^{z/1.5}; power × 1/(1 + K_BAL Σ G_r φ(G/G_r)/G), φ = x²/(1 + x²), K_BAL 1. Captives: F_CAPT 0.2 of toll and raids to the KD_CAPT 4 markets by demand (coercion × hold × (y − Y_COER)⁺ (K − N)⁺) × e^{−cost/reach}, D_PASS 2/yr at sea; coercion K_COER (1 − schooling)(1 − capitals' schooling)(1 − media). |
| Heat | Hottest-month wet bulb (Stull) + warming × A_LAND 1.5. Outdoor work × (1 − 0.5 σ((T_w − 31)/1.5)) (Dunne), industry's share F_OUT 0.3; unlivable past TW_MAX 34 over 0.6 K (Sherwood and Huber's 35) unless cooled (industry × (1 − e^{−y/10}), W_COOL 100 W a person at 1,000 cooling degree-days); deaths 2×10⁻⁵ a year a K over 20 °C, × e^{−y/10}. Earth's habitability (the off-world room) is the living land's mean. |
| Classes | Claim TH_W of food (farmers ½; cities their intake plus capital's share, ALPHA) × 1/(1 + exit/(X_EXIT (1 + K_COER h))) (Domar). Coordination: output × (ε/μ)^μ((1 − ε)/(1 − μ))^{1−μ}, μ 0.005 herders and fishers, 0.02 fields × (1 + 2 × canal-terrace share), cities 0.04 → 0.08 with industry; ε ≥ ¼μ. Elite minds R_ELITE 4. Office N_TAX of deliveries plus herders' tribute. Positions claim/(C_E ȳ); dε/dt = (δ − K_CULL ψ) ε − μ(ε − p), μ 1/T_DOWN above p, 1/T_UP below. ψ = (1 − e^{−MMP/M0})(1 − e^{−EMP/E0})(1 + K_SFD SFD), Y_COMF (Goldstone; Turchin and Nefedov); costs D_PSI ψ cohesion, W_IW ψ deaths, W_IWW ψ works, K_CULL ψ elites. |
| Industry, AI | Starts where farmers ≥ 10/km² have coal and ore past Z_UP 6 (over 0.25). TFP A_I0 e^{θ_I (z − Z_IND)}, A_I0 3.5, θ_I 0.33 (~1.5%/yr); K/Y = s/δ, δ 4%, S_CAP 0.6, S_WAGE 0.15 (0.3 before AI); energy CES; finite fossil carbon and ores (Lasky, Skinner); AI labour by task CES; robots ≤ e-fold per 1.44 yr. Output shared by A(z) φ^α ℓ^{1−α}; N_TAX 10% to capitals; fossil rent R_FOS 30% to holders; saving to land works, railways, then factories, φ ∝ A^{1/(1−α)} ℓ. |
| Endings | Two axes (a third paused; aligned or not; Earth kept or sacrificed): 1a–3b. Off-world: the swarm takes the inner planet (2.8×10²³ kg for the whole Sun), belt habitats, 0.5 c probes. |

## Calibration targets

Climate: today's Earth, level 6, tuned by `tools/earth/tune.mjs`, scored by `climate-score.mjs`. People: the `earth` seed, `tools/people/earth-score.mjs`. Other tools named; SS is `states-survey.mjs`; 16 means medians of sixteen draws on the rivers' discharge, R2 the people's round 2 (eight draws, before it). The people's score is a guide, not a target.

| Target | Model | Observed |
|---|---|---|
| Land temperature rms: year, January, July | 3.3, 5.2, 4.7 K | UDel |
| July: Sahara, Middle East, US West | 30.0, 27.2, 13.9 °C | 32.5, 30.0, 21.3 |
| SST by latitude rms; sea ice | 1.19 K; 0.037 | OISST |
| Cold tongue (3° S–3° N, 140–90° W); west Pacific (5° S–5° N, 140–170° E) | 27.1; 28.6 °C | 25.2; 29.6 (OISST) |
| Land rain; log-ratio rms | 845 mm/yr; 0.64 | 718 (UDel) |
| Rain: India, Sahel, eastern Africa, Southeast Asia | 829, 634, 1,379, 2,760 mm/yr | 1,063, 508, 917, 2,162 (UDel) |
| Köppen classes; groups agreeing | 51%; 74% of land | |
| Reflected SW, clear; OLR, clear; cloud forcing SW, LW | 99.2, 53.9; 241.1, 269.1; −45.3, +28.1 W/m² | 99.0, 53.3; 240.4, 268.3; −45.7, +27.9 (CERES EBAF) |
| Overturning; heat across 26° N | 8.5 Sv; 0.92 PW | |
| Cycles to settle (today's Earth, level 6) | 14 | |
| 2×CO₂, ice sheets held | 3.1 K | |
| CO₂ +1%/yr from 280 ppm (`tools/climate-ramp.mjs`): warming at doubling (yr 70) against the balance; uptake κ | 1.90 against 2.92 K (0.65); 0.51 W m⁻² K⁻¹ | Geoffroy's two layers at this λ: 0.67, 0.59; CMIP5's κ 0.83 ± 0.41 (Forster and others 2013) |
| Plates' opening rms; correlation with Müller 2019 (`plates-score.mjs`) | 4.86 cm/yr; 0.916 | 4.43 cm/yr |
| Hypsometry at the opening: land, mean, 90th, 99th (`tools/hypsometry.mjs`) | 27.1%, 0.67, 1.44, 4.15 km | 27.5%, 0.63, 1.37, 4.6 (ETOPO) |
| Mean ocean depth; floor below 6 km (`tools/hypsometry.mjs`) | 3.84 km; 0.6% | 3.62 km; 0.5% |
| Earth's opening: bed rms; grounded ice (`tests/earth.test.mjs`) | < 80 m; 29.3 M km³ | ETOPO 2022 |
| Tidal dissipation (the page) | ~4.8 TW | ~3.7 TW |
| Dust emission; lifetime (`tools/dust-check.mjs`) | ~1,600 Tg/yr; ~2 days | |
| Lake production: Caspian, Great Lakes, Baikal | ~100, ~100, ~70 g C m⁻² yr⁻¹ | 50–110, 50–250, 75–120 |
| People's score at early takeoff, Σ share × \|ln(model/observed)\|, 16 | ~1.26 ± 0.17: Asia ~23%, Africa ~28%, Americas ~25%, Europe ~3%, Oceania ~9%; India's ~2.5% the most of it | shares of ~2023 |
| Early takeoff; the dial (the singularity), 16 | takeoff ~256 yr after industry, ~5 yr before the dial; the dial ~26 yr after 6 billion (2025.1 by 1999's), 2021.2 with industry at 1760 (1982–2057), ~7.7 B. Sparks: Borneo and Southeast Asia 5, China and Manchuria 3, south-east Africa 3, Amazon 2, Australia, West Africa, Caspian 1 each | late 2027 by 6 billion, ~8.3 B (a9's); industry ~265 yr before takeoff |
| Years between 1, 1.5, 2, 3, 4, 5, 6 billion; industry to 1 billion | 54, 21, 24, 16, 13, 12; 112 | 86, 37, 33, 14, 13, 12 (UN, Census Bureau; from memory); ~44 |
| Agrarian, 16, kyr before takeoff: reach Europe (outnumbering archaics), Sahul, Americas; first fields; first state; people at 10,000 BCE, 1 CE, 1500 | 130, 41, 30; 15.8; 8.5; 22, 186, 533 M | ~45, 47–65, ≥21–23; ~11.4 (Fertile Crescent); ~5.45 (Uruk); 1–10, 170–255, 425–503 M (McEvedy and Jones to HYDE 3.3) |
| Largest state's share at industry; states at takeoff | ~9% (23 effective); ~13 effective, largest ~22% | ~⅓ (the Qing) |
| Industrial era, 16, industry at 1760: people (B), income a person (sy = $400 1990 GK$), richest/poorest region, under unlike rulers (likeness < 0.5) | 1870: 1.00, 1.9, 3.2×, 3%; 1913: 1.54, 3.9, 7.0×, 3%; 1950: 2.57, 7.2, 7.1×, 2%; 1973: 3.92, 10.1, 7.0×, 2%; 2000: 6.01, 17.6, 5.7×, 1% | 1.27, 2.19, 4.9× (US/Africa); 1.79, 3.81, 8.3×, ~31% in dependencies (Eloranta and Harrison); 2.52, 5.28, 10.7×; 3.92, 10.2, 11.8×; 6.07, 15.0, 19.2× (Maddison 2003) |
| Lead changes, last 5 kyr before industry (SS, R2) | ~18 | ~15–20 |
| Great state's median life, ≥ 2% of people at peak (SS, R2) | ~380 yr | ~200–500 |
| Secession (SS, R2): successors 1 kyr before industry; decolonization waves (count, median year): settler colonies, nations; effective states at takeoff | ~16; ~8, ~1958; ~19, ~1964; ~18 | ~1776–1825; ~1945–75; ~14 |
| Classes 1 kyr before industry (SS): elite share, two-class Gini (a floor) | herders 2.3%, 0.15; fishers 1.3%, 0.08; farmers 4.8%, 0.31; city 2.4%, 0.15 | wealth Gini: pastoralists ~0.42, farmers ~0.48 (Borgerhoff Mulder and others 2009; from memory) |
| At 1 CE, 1500, 1820, 1913, 1980 (SS): cities' share; world two-class Gini (a floor); top decile's income, world and industrial places (1913, 1980) | 7.8, 11.3, 12.4, 12.5, 20.9%; 0.31, 0.32, 0.29, 0.50, 0.46; 35, 38, 33, 43, 37%; 34, 35% | agrarian empires' cities ~5–10%; Gini ~0.5 in 1820, ~0.65 late 20th century (Bourguignon and Morrisson 2002); top decile ~35–50% (Piketty, WID); from memory |
| Capital at 1913, 1980 (SS): K/Y, saving rate, railways' built share | 3.26, 3.19; 27, 28%; 16, 34% | K/Y ~3–4 (from memory) |

## An alternate Earth on this climate (the people's targets)

Sketched 2026-11-25 from the settled climate and the people's material base. Synthesis; the history speculation; Earth's numbers from memory; history is a sanity range.

**Climate against Earth's** (`climate-score.mjs`). Sahara and Arabia deserts (~100 and ~215 mm; Earth's Sahara ~50), the Sahel near Earth's (~590 mm); the rest of Africa wetter (West ~2.8 m, East ~1.5×, southern ~2.5×, the Highveld temperate at ~1,540 mm against ~650); Australia's interior semi-arid savanna (~580 mm against ~250); the monsoon on the Deccan (~1,640 mm), the Ganges plain dry (~460 against ~1,000–1,600); the Yangtze 0.7× rain, Southeast Asia 1.3×; Tibet's winters ~12 K cold, Beringia's summers near freezing; land rain +18%.

**Material base** (crops at full use under the organic ceiling, rivers' discharge `Planet.rivers`, 2026-11-26): Africa ~28% (southern 7.5, East 6, Sahel 4.5, Congo 4.5, West 3, North 0.5), Americas ~36% (Amazon 12, southeastern South America 7.5, eastern North America 6), Asia ~25% (China 6, Southeast Asia 5, steppe 4, India 2.5, Arabia and Iran 2), Oceania ~7.5% (Australia 6), Europe ~4%; with every paddy built India ~2.7%, Asia ~23%, Americas ~37%. Herds: Australia (~14%), southeastern South America, Sahel, North America. Domesticates: dry-season lands (Nile, southern Africa, Fertile Crescent, China, Australia, India, Sahel). Coal: Siberia, Amazon, Australia, Canada, eastern North America, Sahel, North Africa, steppe. Fertility ignores soil age, so ancient shields farm like young land.

**Corridors.** Out of Africa by the Nile and the Red Sea's shores; the Himalaya and cold Tibet part India and China; Beringia (near-freezing) the only way to the Americas; Sunda and Wallacea to Australia; the Atlantic narrowest from West Africa to Brazil.

**History.** First people in East Africa; archaics hold Eurasia until outrun. Farming in the seasonally dry belts (Fertile Crescent, Nile, Sahel, Highveld, India, northern and southern China; later Mesoamerica, the Andes, eastern woodlands), Australia late if at all. Paddies densest in warm, ponding lowlands (coastal Southeast Asia, Bengal and the Deccan, the Niger's inland delta), little on the Yangtze; old leached shields (Congo, Amazon, southern Africa) hold fewer. First states on the Nile and in Mesopotamia, then the Indus, Ganges, China, Niger. Industry mostly in China, northern India or the Mediterranean and Near East, sometimes the Highveld or Sahel, rarely Australia. Ocean crossings late, first Old World to Brazil; the Americas lose half or more within a century and refill with settlers and captives; empires hold many under unlike rulers by 1913 until schooling breaks them.

| Target (medians) | Sketch | Model (16; R2 where marked) | History |
|---|---|---|---|
| Reach Sahul, Europe (outnumbering archaics), the Americas (kyr before takeoff) | 65–50; ~45; 20–12 | 41; 130; 30 | 47–65; ~45; ≥21–23 |
| Archaics gone (kyr) | 40–30 | 44 (99%; half by 176; R2, SS) | 40–30 |
| First fields; first state (kyr) | 12–10; ~5.5 | 15.8; 8.5 | ~11.4; ~5.45 |
| People at 10,000 BCE, 1 CE, 1500 | 3–15, 170–300, 425–600 M | 22, 186, 533 M | 1–10, 170–255, 425–503 M |
| Shares before industry: Asia (India, China), Africa, Americas, Europe, Oceania | 30–45% (3–8, 5–12), 20–30, 8–15 (~40–80 M before contact), 4–8, 1–4 | 27% (2.4, 7.6), 27, 25, 6.4, 5.9 | 1500: ~55% (~25, ~23), ~17, ~8, ~18, <1 |
| Industry's spark in Australia; in the Sahel or West Africa | rare; ≤ ~¼ of draws | 1 of 16; 1 | |
| Americas' fall within 150 yr of contact | 50–90% | 41% | 50–90% |
| First overseas empires | ~1500 | first million held overseas ~360 (eight draws); ~5% held from overseas at 1913 (R2) | ~1500 |
| Under unlike rulers at 1913 | ~20–35% | 3% | ~31% |
| People in 1870, 1913, 1950, 2000 (B) | ±20% of history's | 1.00, 1.54, 2.57, 6.01 | 1.27, 1.79, 2.52, 6.07 |
| Shares at early takeoff: Asia, Africa, Americas, Europe, Oceania | 30–45, 20–30, 12–20, 4–8, 1–4% | 23, 28, 25, 3, 9% | now: 58, 20, 13, 9, 1% |

Asia's targets are this base's plus an early start's premium, not Earth's shares; their low ends now sit above the base, and they were kept (no constant moved the shares beyond the draws' noise). Oceania's 1–4% assumes old soils the model doesn't carry, so its share follows its base (`docs/ROADMAP.md`).
