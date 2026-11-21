# Design

## Principles

- **One planet, one state, one dial.** Every layer reads and writes the same fields (elevation is one array: the plates raise it, erosion lowers it, ice loads it, the climate reads it through the lapse rate). The couplings are the subject; each is a live flux, and Fig. 2 draws only couplings the code has.
- **The dial is scale separation** (standard: asynchronous coupling in Earth-system models). Layers slower than the dial hold still as boundary conditions; faster ones are replaced by their statistics, so turning the dial down from weather shows the climate as the distribution of weather. The base unit is the year, in float64. The dial runs from ~2.8 hours to 10 million years a second (`src/clock.js`).
- **Each layer declares** its timescale, stable step, substep budget and *closure* (what stands in when the dial outruns it). The scheduler runs it live (substeps while they fit the budget), summarized (the closure, at most once per slow step; drawing crossfades over half a decade of the dial, never switches) or banked (slow layers step when a step's worth has accrued). Every layer always advances simulated time, so the state is consistent at any dial.
- **The weather–climate seam.** The QG weather relaxes toward the climate's equilibrium (Held–Suarez style, standard); its long-run eddy heat flux is what the climate's diffusion stands for. When the dial outruns the weather the climate is an emulator, and the about panel says so.
- **Grid.** Icosahedral geodesic, 10·4^k + 2 cells (Voronoi hexagons and 12 pentagons); the levels nest, giving multigrid and the transfers between layers' grids (`src/grid/`). The engine runs at level 7 (55 km), or 6 on phones (`?level=` overrides); the energy balance and the gyres at level 5, the year's anomaly at 4, the tide at 6, the people at 6.
- **Planet parameters are inputs**, Earth's by default: radius, day (following the tide), the orbit as seeded cycles around Earth's (eccentricity near 405, 124 and 95 kyr, obliquity near 41 and 54 kyr, precession near 22 kyr), solar flux, water set for ~30% land then kept, mantle heat. A seeded planet is procedural; `?seed=earth` is today's Earth (`earth.md`).
- **Claims carry marks**: standard, synthesis, speculation, and "from memory" where a value wasn't checked. Citations and references are checked against Crossref or the live source before they reach `about.md`.
- **Rules, not emergence** (speculation): rifting and subduction initiation are rules, not mantle convection; whether they give a convincing supercontinent cycle is open.
- **Standing rules.** Little more geology: readouts of the rock record fight show-don't-tell. Life stays minimal except people. The about panel carries the explanation. After any change that moves the tuned planet, re-run `tools/earth/climate-score.mjs` and `tools/climate-check.mjs` and retune (`tools/earth/tune.mjs`).

## Architecture

Vanilla ES modules, no dependencies. `src/engine/` and `src/grid/` hold no DOM. A layer owns its arrays and exports its step and its summary; the CPU code is the headless reference for every GPU path. Testing: `AGENTS.md`. Threads and the GPU: `engine.md`.

## Scenarios

Two, each from the planet's opening, picked beside Fig. 1's caption (choosing one reloads, keeping the seed): **World**, the planet alone at 1 Myr/s in the Relief view; **People** (`?scenario=people`, `&ending=1a`…`3b` forces the ending), the planet held at its opening while it loads and its climate and ice come to their balance (World waits for the same opening), then the first people, run to an ending at the follow dial in the People view (`people.md`). There are no controls beyond the dial (and with people its Follow switch) and New planet. The seed is in the link (`?seed=`; a new one is drawn and written back by default). The caption is the year (with people, theirs), the date where the globe shows the season, and with people their number and the largest city.

## Views

Three groups by timescale (`GROUP`, `MAPS`, `setGroup`, `setMap` in `main.js`; keys 1–3 the groups, M the next map, F the follow dial):
- **Relief**: Surface (the plants' cover, relief, rivers, plate boundaries, ice), Zones (the soft Köppen mosaic), Air (the winds as streamlines, dust, the veil).
- **Weather**: Pressure, Temperature, Humidity (synoptic charts) and Tides. Usable at `WX_TOP` (~2.9 days a second) or slower; in it the dial stops there.
- **People** (once there are people): Settlement and Density. Where the dial resolves the day, every map shows its night side, lit where people and robots are (`scene.md`).

Drawing: `scene.md`.

## The margin

Tabs (`index.html`), figures numbered by their order and drawn only when visible (at most every 400 ms):
- **Model** (Fig. 2, open at load): each stepping layer a node with its live value, each coupling the code has an arrow as heavy as its flux; idle layers and empty arrows left out; a coupling both ways one curve in two lanes (`modelSnapshot` in `main.js`, `drawModel` and `PLANET` in `src/render/figures.js`). With people it becomes their economy (`src/render/economy.js`): land, people, minds and knowledge; then farms; then output, energy and the air; space, compute and robots as they arrive; alignment as an arrow from people to compute, AI's nodes red when misaligned. At most thirteen nodes.
- **Climate** (Fig. 3: zonal means, with the zones' key), **Crust** (Figs. 4–5: hypsometry, polarity), **Record** (Figs. 6–7: the record on a time axis following the dial, and the orbit with July sunlight at 65° N), and with people **People** (Fig. 8: people and minds against the time left to their hyperbola's singularity; Fig. 9: their ages, the world's pyramid against the pre-industrial one; Fig. 10, once anything is off-world: the system, `people.md`).
