# Isochron

An Earth-like planet on one globe, from plate tectonics down to weather, with every layer coupled to the others. *Isochron* is a working name. `docs/PLAN.md` is the plan of record: the thesis (one planet, one state, one dial), the nine layers, their couplings, the scene, the figures, the experiments and the phases. This file describes the code as it is.

The project is local only for now. It has no GitHub remote and isn't a submodule of the a9l.im repository yet (both wait on the name), and it isn't registered on the site. It lives at `projects/isochron` so the parent's dev server and shared layer serve it. The root `AGENTS.md` covers the shared layer, the design system ("Inside the scene") and the build.

## Status

Phase 1 (the tectonic globe) is in progress:

- **Built:** the grid, the clock and scheduler, plates with exact rigid motion, gaps and overlaps, slabs and arcs, collisions and merges, rifting, passive-margin subduction initiation, the torque balance, isostasy, solved sea level, the polarity record, and the WebGPU globe with stripes, ridge axes, hillshade, coastline and contours. The 2D overlay draws trenches with barbs, transforms and arc volcanoes; the page has the dial and a live caption.
- **Not built** (phase 1, from the plan): hotspots and large igneous provinces, rifting through a plume, Figs. 2 and 4, the engine in a worker, level 7.

## Running and checking

Serve from the parent root with `node docs/sim-overhaul/serve.mjs 8790` (the parent `.claude/launch.json` calls it "sims") and open `/isochron/`. `?seed=<string>` picks the planet. `window.__isochron` exposes `{ grid, tec, polarity, camera, scheduler, setPlaying }`.

```bash
node --test tests/                       # grid, clock, plates (28 checks)
node tools/plates-survey.mjs '{}' 600 b  # 300 Myr headless: plates, land, seafloor age, speeds, events
for f in main.js colors.js src/*.js src/*/*.js; do node --check "$f"; done
```

WGSL compiles only in the browser, so check the console after shader edits. Derivatives (`fwidth`) must stay in uniform control flow, which is why the fragment shader computes both sea and land and then selects.

## Layout

```
index.html            colophon, the globe's two canvases, the figure bar (caption, dial)
main.js               boot (grid, genesis with a 40 Myr spin-up, polarity), drawn fields, pointer and keys, the loop
colors.js             ink roles: ocean = prussian, land = umber; the accent is the red
styles.css            the stage, the figure bar, the dial
docs/PLAN.md          the plan of record
src/grid/icosphere.js the geodesic grid, point location, least-squares gradient, Laplacian
src/clock.js          the dial's range and formatting, the Scheduler (live, summarized, banked)
src/rng.js, noise.js  seeded streams; seeded 3D gradient noise for genesis
src/engine/crust.js   isostasy, seafloor subsidence (GDH1's shape), sea level by volume
src/engine/plates.js  Tectonics: plates, the step, the torque balance, merges, rifts, initiation; PARAMS
src/engine/genesis.js the first planet: continents, plates grown around them, ages, slabs, spin-up
src/engine/polarity.js the reversal record and its running integral for the shader
src/render/camera.js  the orbit camera
src/render/globe.js   the WebGPU globe and its shader
src/render/overlay.js the limb, boundary symbols, arc marks
tests/                grid, clock and plates tests (not staged)
tools/plates-survey.mjs  long headless runs for tuning PARAMS
```

## How the plates work

- **Plate frames.** Each plate keeps its crust in its own frame, on a full copy of the grid (mask, thickness, felsic fraction, formation time, suture time). World cell i reads plate k at Qₖ⁻¹xᵢ. Motion is exact (a full turn restores every cell), and nothing is resampled while a plate stays whole. Merges are the one resampling: one plate's cells are re-expressed in the other's frame.
- **The step.** Each world cell tests the plates that held it or a neighbour last step:
  - none covers it: new oceanic crust for the plate that left;
  - one covers it: that plate;
  - several cover it: the most buoyant stays on top. The others are consumed only if the plates are closing at that cell (`CLOSING`). An overlap where plates slide past each other is grid rounding, and the loser stays hidden. Without that rule, transforms churn crust and leave false slabs that pull along the boundary.
- **Consumption.** Ocean that goes down leaves slab memory at the cell, inherited along a migrating trench and decaying over `SLAB_TAU`, and builds arc crust on the overriding plate. Continent against continent stacks crust, marks a suture, adds collision resistance, and tallies the pair toward a merge.
- **Forces.**
  - Slab pull acts along each plate's edge only: each edge cell pulls with the longest slab of its plate within one cell. Counting the whole memory band made pull grow with speed and run away.
  - Ridge push is the gradient of subsidence within a plate's own ocean.
  - Drag is −c ∫ (1 + KEEL·φ)(I − r rᵀ) dA · ω, regularized by plate area.
  - ω relaxes toward the solved value over `V_RELAX` and is capped at `V_MAX`.
- **Starting subduction.** Old seafloor founders: at a plate's edge, any cell past `FOUNDER_AGE`; at its own continent's margin, the attached ocean breaks away as a new plate (`maybeInitiate`, at most every `INITIATE_GAP` and below `MAX_LIVE_PLATES`).
- **Plate count.** Too few plates, or one too large, splits the largest along the candidate plane that crosses the most sutures. A plate below `MICROPLATE` joins its largest neighbour.

## Open work

- **Tuning.** The default seed holds about 30% land and seafloor about 110 Myr old over 500 Myr. Other seeds still drift: seed `b` drowns its land as young seafloor raises the sea, and seed `c` lets seafloor age without limit. `PARAMS` needs a survey across seeds against Earth-like targets (mean seafloor age ~60 Myr, fastest plates ~10 cm/yr, land ~29%, a supercontinent cycle).
- **Speed.** A step is ~5 ms at level 6. The engine should move to a worker before level 7.
- **Drawing.** Coastlines still show the hexagons at close zoom: the drawn relief is eased once, and level 7 would halve the step. In the dark theme the land takes more ink (`palette().tint`) so it stays lighter than the sea.
