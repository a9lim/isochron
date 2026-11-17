# Carbon, life and dust

Enough life to make the environment robust, no more. The cover and the sea's carbon are tested alone and wired in by `Life` (`src/engine/life.js`); the dust by `Aeolian` (`src/engine/aeolian.js`).

## The long carbon cycle (`src/engine/carbon.js`, `CARBON`)

Outgassing against weathering, stepped through the sea's carbon (`pCO₂` is the air's).
- **Outgassing** scales with crust opened at ridges and ocean closed at trenches (`tec.kinematics`) against the spin-up's last 10 Myr, plus provinces' pulses. The arcs' share of the carbonate the plates carry down comes back from the sea's ledger, so `mantle()` is the ridges' and the arcs' own carbon.
- **Weathering** is the climate's map: runoff^0.65 × e^{(T − 15)/Tₑ} × fresh-rock supply (0.25 + 0.75 P/(P + E_HALF), P the regolith's production) × the cover's factor, summed over ice-free land, times the response to CO₂ since the climate last solved (pCO₂^0.3 directly and through Tₑ). Its reference is taken once the climate has settled and the landscape has stepped.
- **Organic carbon**: burial with the sediment rivers deliver to the sea, oxidation with the rock they erode, each a fifth of the reference outgassing at the opening (`CARBON.ORG`).
- `equilibrium(V)` is the analytic balance (tested). Doubling outgassing gives ~650–680 ppm against it.

## The cover (`src/engine/vegetation.js`, `VEG`; VECODE's forms, synthesis)

Per land cell, trees, grass and bare ground: the vegetated share relaxing over 3 years and the trees' share of it over 200, each exactly, toward VECODE's equilibrium from degree-days above 0 °C, the year's rain and a cold limit. NPP by Lieth's Miami model with CO₂ fertilization; carbon in trees, grass and soil, respiration by a Q10, solved in closed form (NPP − respiration = ΔC). It lives in the mantle's frame; its climate is set after each cycle, and it steps from `Planet.fast`. At the opening it sits at its balance with each cycle until the climate settles, the air held at the opening's CO₂ (`Carbon.holdOpening`).
- **Feedbacks** (standard): land's albedo from VECODE's surface albedos at half their contrast about grass (bare +0.065, trees −0.035), trees masking snow; evaporation (bare 0.4 and grass at β, trees 1.2 at √β); weathering on bare rock at a quarter of forest's. Nothing grows past `T_HOT` (an annual mean of 38–46 °C).
- There is no bistable green margin: from full forest or bare ground the climate and cover converge to one state.

## The sea's carbon (`src/engine/oceancarbon.js`, `OC`; after LOSCAR and the three-box models)

The air; a warm surface box (85% of the sea), a cold one (15%) and the deep, each with DIC, alkalinity and phosphate; carbonate chemistry checked against PyCO2SYS; gas exchange, a 20 Sv overturning and mixing, the biological pump; carbonate buried on warm shallow shelves ((Ω − 1)^1.7) and on the deep floor above the compensation depth (a bioturbated layer per 150 m bin of the seafloor's hypsometry), riding the plates into the trenches, 40% back at arcs. Backward Euler in seven unknowns, stable at any step.
- **Inputs** (`Life.seaInputs`, each cycle): the cold box is the coldest 15% of the sea by annual surface temperature, its open water the share not under ice; warm shelves are sea under ~200 m with water above ~18 °C; productivity from the rivers' sediment and the coasts' upwelling; carbonate weathering with land's runoff.
- **The export, drawn** (synthesis): each surface box's export production spread over its water by what feeds it (upwelling, river mouths, the cold box evenly), g C m⁻² yr⁻¹ per sea cell.
- **A pulse** (`src/engine/pulse.js`, `tools/pulse-run.mjs`): the share left in the air against a twin of the sea, compared with the closed sea's partition (1 kyr), the compensated sea's (10 kyr) and weathering's decay (100 kyr); the tail e-folds over ~140 kyr.

## Dust (`src/engine/dust.js`, `DUST`; on the GPU `src/gpu/dust.js`)

Wired inside the climate's cycle: each point of the year packs its sources after its winds and rain (`aeolian.phase`); after the six the balance is solved (240 Jacobi passes warm on the GPU, Gauss–Seidel headless), then routed.
- **The balance** (standard forms, synthesis): GOCART's emission C S u²(u − u_t) as its expectation over gusts (a Rice distribution, tabulated), two bins (fine 30%, coarse 70%) carried by the moisture's wind and eddy mixing, settled (0.1 and 1 cm/s over 3 km) and washed out (14% of the column per mm of rain), steady at each point of the year; optical depth and a forcing −20 τ (1 − α/0.45) W/m².
- **Sources** (synthesis): the union of bare, dry ground (the cover's bare share × a taper on the soil's relative water from 0.35 to 0.55, its water also raising GOCART's threshold), dry lake beds (salt flats, ×3, speculation) and outwash plains (the ice's meltwater), × open ground (no snow, lake or ice) × loose grains (1 − e^{−h/5 cm} of regolith).
- **Gusts** (speculation): rms `GUST` (2.5 m/s) scaled by each hemisphere's equator-to-60° contrast against the opening's (Eady's growth rate, standard).
- **Calibration**: one constant, `C` = 6.5e-12 kg s² m⁻⁵: ~1,600 Tg/yr at the default seed's settled opening, a lifetime of ~2 days, mean τ ~0.01.
- **Effects**: dusty snow darkens by 0.02 (c/100 ppm)^0.7 (at most 0.2; the planetary albedo sees half) and melts faster (`ice.dustDDF`); iron (~3.5% of dust, ~2% soluble, from memory) raises the cold box's uptake as (1 + K) r/(r + K), K = 1 (Martin's hypothesis, the form synthesis); deflation is laid down as loess in the regolith or sediment at sea, the crust's mass kept (tested).
- Through the orbit, dust swings ×2–3 with precession through the cover's bare share, and with CO₂ free the iron moves CO₂ 30–70 ppm (`tools/iceage-survey.mjs`).
