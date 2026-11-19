# Isochron

An Earth-like planet on one globe, from plate tectonics down to weather and people, every layer coupled to the others. A submodule of the a9l.im repository at `projects/isochron` (github.com/a9lim/isochron), registered on the site (`content/projects/isochron.md`) and staged by the parent's build; the parent's `AGENTS.md` covers the shared layer, the design system ("Inside the scene") and the build. Its social card (`og-image.webp`) was painted by the parent's `tools/og/paint/isochron.py` from a seeded people run of 2026-11-16, and is **frozen** (a9, 2026-11-19): it stays as painted however the model changes (a painting of the project's idea, not a record of the model), so it's never re-exported or repainted.

## Docs

| File | What |
|---|---|
| `docs/design.md` | principles, the dial and closures, architecture, scenarios, views, the margin |
| `docs/plates.md` | plates, forces, crust and isostasy, the ocean and sea level, plumes |
| `docs/surface.md` | landscape, regolith, the crust's flexure, ice, the ground, lakes, rivers |
| `docs/climate.md` | the climate's cycle, energy balance, clouds, heat transports, template, moisture, zones, gyres, the year, volcanoes, the runaway |
| `docs/life.md` | the carbon cycle, the plants' cover, the sea's carbon, dust |
| `docs/weather.md` | the QG weather and its chart, tides and the Moon, the sky |
| `docs/people.md` | the people's model, its economy and endings, on the page |
| `docs/earth.md` | today's Earth: the opening, how it scores, its known errors |
| `docs/scene.md` | how each view draws, boundaries, motion |
| `docs/engine.md` | threads, the GPU, costs |
| `docs/roadmap.md` | open work |
| `tools/earth/README.md` | Earth's data sources, the bake, scoring and tuning |
| `about.md` | the public about panel (the parent's build stages it) |

## Running and checking

Serve from the parent root with `node docs/sim-overhaul/serve.mjs 8790` (the parent's `.claude/launch.json` calls it "sims") and open `/isochron/`. `?seed=<string>` picks the planet (without one the page draws six letters and writes them into the link); `?seed=earth` is today's Earth; `?scenario=people` the People scenario (`&ending=1a`, `1b`, `2a`, `2b`, `3a`, `3b` forces its ending); `?level=` the engine's level. `/isochron/tests/gpu.html` runs the weather's GPU tests in the browser (results in `window.__results`).

```bash
(cd tests && npm install)              # once: WebGPU in node (Dawn) for the GPU parity tests
node --test tests/                     # everything (~15 min; moon-long.test.mjs is most of it)
for f in main.js colors.js src/*.js src/*/*.js; do node --check "$f"; done
node tools/climate-check.mjs earthlike # a seeded planet's settled climate (or `earth`)
node tools/earth/climate-score.mjs     # today's Earth against observations (tools/earth/README.md)
node tools/planet-run.mjs earthlike 600 1000 10 '{"CARBON":{"FIXED":220}}'   # the coupled planet headless
node tools/survey.mjs '{}' 600 b       # 300 Myr of plates and landscape
node tools/people-run.mjs earthlike 5e6 '{}'   # the people headless (LIVE=1: beside a live planet)
node tools/engine-cost.mjs 7 20 0.5 earthlike gpu   # the plate step's cost by part
```

Other headless tools in `tools/`: `hypsometry` (each height's share of the sphere against ETOPO's), `ice-check`, `iceage-survey`, `regolith-survey`, `plates-survey`, `eruption-run`, `pulse-run`, `dust-check`, `anomaly-fit` (each documents its arguments in its header); `tools/people/` holds the people's cached openings and couplers.

`window.__isochron` exposes the page's mirrors (`P`, `tec`, `land`, `climate`, `ice`, `carbon`, `plumes`, `year`), the `engine` worker, `wx`, `globe`, `chart`, `camera`, `scheduler`, `setPlaying`, `setView`, `setMap` (by name: `relief`, `zones`, `air`, `pressure`, `temperature`, `humidity`, `tides`, `settlement`, `density`, `knowledge`, `culture`), `setDial` (log₁₀ yr/s), `tick(now)` (one frame, for driving a hidden tab), `prof` and `engineProf` (the page's and the worker's time by section), `lakes`, `air`, `lines`, `rivers`, `people` and `follow`. `P.years` is the planet's clock.

## Layout

```
earth/            today's Earth on the level-7 grid (earth.json, earth-7.bin) and its mantle's slabs (slabs.json, slabs-4.bin), fetched only for its seed
index.html        colophon, the globe's canvases, the view groups, the figure bar, the scenarios, the margin's tabs
main.js           the page: clock and dial, the engine's snapshots, line morphs, views, seed, scenarios, captions, figures, input, the loop
colors.js         ink roles (ocean prussian, land umber); styles.css
src/clock.js      the dial's range and formatting, the Scheduler; src/rng.js, src/noise.js: seeded streams and noise
src/grid/         icosphere.js (the geodesic grid, gradients, Laplacian), transfer.js (between nested levels)
src/engine/       the model, no DOM: one file per layer (plates, crust, genesis, earth, plumes, polarity, gpts, landscape,
                  regolith, crustflex, flexure, ice, climate, clouds, airheat, seaheat, ocean, orbit, year, volcanoes, soil,
                  ground, lakes, carbon, oceancarbon, vegetation, life, dust, aeolian, pulse, tides, runaway, people,
                  peoplelink, peoplefit, routes, peoples, cohorts, worlds, solar, mantle), planet.js (every layer stepped together), record.js, refine.js, mirror.js, and the
                  threads (worker.js, people-worker.js)
src/gpu/          device.js, hierarchy.js (nested grids for multigrid), and each layer's GPU path (ebm, moisture, dust,
                  ice, flexure, tides, soil, plates, surface, weather, season, refine)
src/render/       camera, globe (and its shader), surface, lines, along, overlay, rivers, streamlines, chart (+ chart-worker),
                  figures (with Fig. 9's ages), economy, system (Fig. 10), key, sky
tests/            node:test files, one per layer or coupling, GPU parity tests on Dawn (webgpu-node.mjs), gpu.html
tools/            headless runs, surveys and fits; tools/earth/ (Earth's data and scoring), tools/people/
docs/             the docs above
```

## Conventions

- Mark claims as standard, synthesis or speculation, and "from memory" where a value wasn't checked against a source. Never take a reference, DOI or URL from memory into `about.md` (the parent's rule).
- Keep the docs current-only: they describe the code as it is. Code headers point to their doc.
- New per-cell state lands with a CPU reference, a test against an analytic oracle and, on the GPU, a parity test. Kernels bind at most eight storage buffers.
- WGSL compiles only in the browser (and Dawn in node): check the console and `tests/gpu.html` after shader edits.
- Tuning is on today's Earth (`docs/earth.md`): after a change that moves the climate, re-score and, if needed, re-tune with `tools/earth/tune.mjs` on a copy of `src/`, `earth/` and `tools/earth/` (it spawns the scorer fresh, reading the source as it stands). Seeded planets may shift; report it.
- A hidden browser pane runs as a background page: drive it with `tick()` and time it visible.
