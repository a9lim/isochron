# Today's Earth

`?seed=earth` opens on Earth's data instead of genesis's noise (`src/engine/earth.js`, `EARTH`; the data in `earth/`, made and scored by `tools/earth/`, whose README lists the sources, terms and commands; the credits are in `about.md`). `Planet` takes it as `opts.earth` (`openPlanet` loads it; the worker fetches it before building). Everything after the opening is the sim's own; it opens at half a year a second (`EARTH_DIAL`). The climate is tuned on it (the constants marked "Earth").

## The opening

- **The data** (`tools/earth/bake.py`), on the level-7 grid, each point in its nearest cell by area: the mean bedrock (ETOPO 2022), the mean grounded ice (the surface less the bed above flotation; shelves are sea), the lowest land (`gz`, where the cell's water runs), the share Seton et al. 2020 dates and its mean age, and each cell's plate. Coarser engines restrict it, so levels 6 and 5 work from the one file.
- **The crust** (synthesis): the datum puts a new ridge `RIDGE` (2.5 km) below sea level, so the sim's subsidence gives Earth's ages GDH1's depths; each cell's thickness is solved so the sim's isostasy stands it at its measured bed (within ~30–60 m rms; trenches held at `H_MIN`). φ is one less the oceanic share; floor the age grid leaves blank deeper than `DEEP0`–`DEEP1` is aged by its depth to at most `AGE_DEEP` (100 Myr).
- **The ice** (`earthIce`): the grounded ice (29.3 M km³), the bed bent to its flexural balance, the crust solved again so the bed stands where measured; the water holds the sea at the datum.
- **The plates**: Müller et al. 2019's rigid plates today, its deforming networks for the cells those leave out (each to the bordering rigid plate that moves most like it, so Sundaland rides Sunda), microplates joined to the neighbour they share most boundary with that isn't across a subduction zone (so arcs ride their overriding plates): 17 plates, each ω its motion over the last Myr in the absolute frame. Slabs hang where the motions close (`hangSlabs`). No spin-up.
- **The rest**: ten hotspots (Whittaker et al. 2015's compilation: Courtillot et al.'s seven primary plumes with Iceland, Galápagos and Yellowstone); the reversals (GTS2012 to 83.64 Ma, then the superchron, the seeded process beyond), so the stripes are Earth's anomalies; the orbit (`EARTH_CYCLES`, fitted to Berger and Loutre 1991, the present exact).
- **No hand-placed straits**: at level 7 Gibraltar keeps the Mediterranean open; the Black Sea, the Baltic and the Caspian are basins holding lakes; Panama is land.

## How it scores

Plates (`tools/earth/plates-score.mjs`, level 6): the opening's balance rms 4.7 cm/yr against Müller's 4.45, correlation 0.83, over 20 Myr 0.93 → 0.70; the Pacific 8.3–9.4 cm/yr.

Climate (`tools/earth/climate-score.mjs`, level 6, settled; against UDel, OISST, GPCP and CERES EBAF):
- Land 3.8 K rms in the year, 5.9 in January, 4.7 in July; the sea's surface by latitude 1.2 K, its ice by latitude 0.04; land's rain 580 mm/yr (observed 718), log-ratio rms 0.65; Köppen classes 48% of land, groups 71%.
- The top of the atmosphere: reflected 99.7 W/m² (CERES 99.0; clear sky 55.5, 53.3), OLR 240.5 (240.4; clear 268.9, 268.3), the clouds' forcing −44.2 and +28.4 (−45.7, +27.9); rms by cell 15.5 and 15.2 W/m², by 10° zone 3.6 and 7.3.
- The sea: the overturning 11.3 Sv (`EKMAN` and `LAMBDA` at Earth's measured scale), 1.2 PW north across 26° N; 60–70° N's sea ~2 °C (4.4 observed), the Nordic Seas ~2 against 6.3 °C, the Barents frozen (its water doesn't reach it).
- Doubled CO₂ warms it 2.8 K with the ice sheets held.
- Lakes: routed on each cell's lowest land, ~2.5 M km² at level 7 (the Black Sea to its spill, the Baltic, the Great Lakes, Baikal, Chad, Eyre); the Caspian too full (the Aral spills into it); Lake Victoria missing (no bathymetry under it).
- Tides on the page ~4.8 TW (Earth's ~3.7). People: the first hominins at 1° S, 40° E.

## Known errors

- **Eastern North America**: its year ~5 K warm, January ~7 K, its rain under half Earth's. Its coast's sea is warm and open in winter (the gyres' boundary current runs up the coast with no cold Labrador Current inshore: the Gulf of St Lawrence ~9 °C in January against 0.5), and Canada is 8 K warm in January under the template's zonal subpolar low, so its winter high doesn't form.
- **Clouds**: deep convection's longwave about half Earth's (the Congo 33 W/m² against 54); eastern China's shortwave short (38 against 70); deserts too cloudy; the Pacific's cold tongue 2.7 K warm and convecting; the polar clear sky's OLR high (the linear A + BT misses the winter inversions).
- **Rain**: the eastern US, eastern China and India's monsoon dry (India's land peaks late, held to the sea's seasons); eastern Africa wet; Tibet and Greenland ~5 K cold.
- **The plates' drift**: India speeds to ~12 cm/yr within 10 Myr (a trench hangs on the India–Capricorn boundary), and the sea falls ~150 m in 20 Myr as 7 km crust replaces the opening's ~11.5 km mean.
