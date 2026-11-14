# Isochron

An Earth-like planet on one globe, from plate tectonics down to weather, with every layer coupled to the others. `docs/PLAN.md` is the plan of record: the thesis (one planet, one state, one dial), the nine layers, their couplings, the scene, the figures, the experiments and the phases. This file describes the code as it is.

It is a submodule of the a9l.im repository at `projects/isochron` (github.com/a9lim/isochron). It isn't registered on the site yet: the stager's and font subsetter's project lists, `content/projects/` and `_headers` don't name it, so no build stages it. The parent's dev server serves it. The root `AGENTS.md` covers the shared layer, the design system ("Inside the scene") and the build.

## Status

Phase 1 (the tectonic globe) is in progress:

- **Built:** the grid, the clock and scheduler, plates with exact rigid motion, gaps and overlaps, slabs and arcs, collisions and merges, rifting, passive-margin subduction initiation, boundary relaxation, the torque balance, isostasy, solved sea level, the polarity record, and the WebGPU globe with stripes, ridge axes, hillshade, coastline and contours. Plate boundaries are traced into smooth, classified lines and drawn in tectonic-map symbols. The page has the dial and a live caption, and opens at 1 Myr/s.
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
src/render/lines.js   plate boundaries traced into polylines, smoothed, classified (ridge, trench, transform, inactive)
src/render/overlay.js the limb and the boundary symbols at even screen spacing
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
- **Boundary relaxation.** A cell whose neighbours mostly belong to another plate passes its crust to that plate (`relaxBoundaries`, every step). Nearest-cell rounding otherwise roughens boundaries a cell at a time until they are fractal and dotted with one-cell islands. This is a numerical regularization (a curvature flow at one cell's scale): it moves crust and never makes or destroys any.
- **Genesis.** The largest continents each seed a plate at their centre, and ocean seeds fill the rest. Plates grow at their own pace, faster over continental crust, so boundaries meet at sea and continents start as passengers with passive margins.

## Drawing the boundaries

`traceBoundaries` (`src/render/lines.js`) walks the Voronoi edges between plates into polylines that run between triple junctions; each polyline separates one pair of plates. It smooths each line on the sphere (three Laplacian passes, then two rounds of Chaikin corner-cutting, junctions fixed). Every point is classified from the two plates' rotations there: the relative velocity across the line against the velocity along it, averaged along the line, so a boundary reads in long runs. Each point also keeps which side stays on top and whether the sinking side is ocean. The overlay places symbols at even spacing on screen, following geologic-map convention:
- trenches: a rule with sawteeth on the overriding plate, and red arc marks on that side where ocean sinks;
- ridges: a red rule, with the globe tinting crust younger than 1 Myr;
- transforms: a lighter rule with paired half-arrows for the sense of slip;
- inactive boundaries: a dotted rule.

Lines are retraced after each plate step (~6 ms) and reprojected each frame.

## Open work

- **Tuning.** The default seed holds 29–31% land over 400 Myr, with seafloor 90–130 Myr old on average. Seed `c` drowns its land: its seafloor gets young (~35 Myr), and the sea rises over continents whose relief is still the flat isostatic surface. The landscape layer will add relief, but `PARAMS` also needs a survey across seeds against Earth-like targets (mean seafloor age ~60 Myr, fastest plates ~10 cm/yr, land ~29%, a supercontinent cycle). Water is set for 29% land after a 40 Myr spin-up, before the seafloor's ages have settled.
- **Speed.** A step is ~5 ms at level 6. The engine should move to a worker before level 7.
- **Drawing.** Coastlines still show the hexagons at close zoom: the drawn relief is eased once, and level 7 would halve the step. In the dark theme the land takes more ink (`palette().tint`) so it stays lighter than the sea.
