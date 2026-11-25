# Isochron

An Earth-like planet on one globe, from plate tectonics down to weather and people, every layer coupled to the others. It is a submodule of the a9l.im repository at `projects/isochron` (github.com/a9lim/isochron), staged by the parent's build; the parent's `AGENTS.md` covers the shared layer, the design system ("Inside the scene") and the build.

## Running and checking

Serve from the parent root with `node tools/sims/serve.mjs 8790` and open `/isochron/`. `?seed=<string>` picks the planet (without one, today's Earth: `earth`; New planet writes six fresh letters into the link); `?scenario=people` the People scenario (`&ending=1a`…`3b` forces its ending); `?level=` the engine's level.

```bash
node --test 'tests/*.test.mjs'         # the suite (~10 s; the GPU tests skip without Dawn)
(cd tests && npm ci)                   # once, for the GPU tests: WebGPU in node (Dawn, the pinned `webgpu`)
node --test 'tests/gpu-*.test.mjs'     # the GPU tests alone (~5 s)
for f in main.js colors.js src/*.js src/*/*.js; do node --check "$f"; done
node tools/climate-check.mjs earthlike # a seeded planet's settled climate (or `earth`)
node tools/earth/climate-score.mjs     # today's Earth against observations (tools/earth/README.md)
node tools/people/earth-score.mjs      # the people on today's Earth against where people live now
node tools/people/states-survey.mjs '{}' 8   # its states and classes over eight draws (lifespans, the lead, cycles, stress, elites)
node tools/planet-run.mjs earthlike 600 1000 10 '{"CARBON":{"FIXED":220}}'   # the coupled planet headless
node tools/people-run.mjs earthlike 5e6 '{}'   # the people headless (LIVE=1: beside a live planet)
node tools/engine-cost.mjs 7 20 0.5 earthlike gpu   # the plate step's cost by part
```

The other tools in `tools/` (surveys, fits, `hypsometry`) document their arguments in their headers. `window.__isochron` exposes the page's mirrors (`P`, `tec`, `land`, `climate`, `ice`, `carbon`, `year`), the `engine` worker, `globe`, `scheduler`, `setMap` (by name), `setDial` (log₁₀ yr/s), `tick(now)` (one frame, for driving a hidden tab), `prof` and `engineProf`, `gpuScale` (the globe's resolution under the page's, which follows its GPU time) and `LEVEL`, `people` (`people.msg.bad`: where the people's first number that wasn't finite arose, `People.check`) and `follow` (the follow dial; `follow.scale` scales its seconds a doubling, `FOLLOW` in `src/clock.js`).

## Layout

```
earth/            today's Earth on the level-7 grid and its mantle's slabs, fetched only for its seed (made by tools/earth/)
boot.js           the page's first module (no imports): the seed, the engine's level, the engine's thread started at once
main.js           the page: clock and dial, the engine's snapshots, views, scenarios, captions, figures, input, the loop
src/clock.js      the dial's range and the Scheduler
src/grid/         the geodesic grid and its operators, transfers between levels, multigrid
src/engine/       the model, no DOM: one file per layer, planet.js steps them together; worker.js and people-worker.js are the threads, pool.js the engine's pool of threads for per-cell loops (kernels.js)
src/gpu/          device.js, hierarchy.js, and each layer's GPU path
src/render/       the globe and its shader, the overlay's lines and symbols, the chart, figures, the sky
tests/            node:test files; gpu-*.test.mjs run on Dawn (webgpu-node.mjs sets it up)
tools/            headless runs, surveys and fits; tools/earth/ (Earth's data and scoring), tools/people/ (cached openings, scoring)
docs/MODEL.md     each layer's equations, the design constraints, the calibration targets
docs/ROADMAP.md   what's next and what's open
about.md          the public about panel (the parent's build stages it)
```

## Conventions

- Mark claims as standard, synthesis or speculation, and "from memory" where a value wasn't checked against a source, so a reader can tell what to trust. Never take a reference, DOI or URL from memory into `about.md` (the parent's rule).
- Each source file's header holds its layer's forms; keep it current with the code, since it is the layer's documentation.
- Tests guard what running the sim wouldn't show: conservation, analytic oracles of a layer's physics, exact steps and determinism, CPU–GPU parity. Add one where a new mechanism's failure would be silent, one case per mechanism, small and seeded. Never snapshot tuned values; the Earth scores in `tools/` track those.
- New per-cell state lands with a CPU reference, because the headless tools and tests run without a GPU. Kernels bind at most eight storage buffers (the adapters' limit).
- A per-cell loop moves onto the engine's pool (`src/engine/pool.js`, on a cross-origin isolated page) as a layer's function over a range of cells, run with `yield* parallel(name, f, ...)` and registered by name in `kernels.js` for the pool's threads; the arrays it touches are allocated with `shared` (`shared.js`), and its arguments join `tests/pool.test.mjs`, which checks its cells don't depend on the chunking. Headless and without isolation the same chunks run in order on the engine's thread.
- WGSL compiles only in the browser and in Dawn. The GPU tests compile the engine's kernels and the weather's, not the globe's render shader, so check the page's console after shader edits. `fwidth` must stay in uniform control flow, which is why the globe's fragment shader computes sea and land and then selects.
- Tuning is on today's Earth: after a change that moves the climate, re-score and, if needed, re-tune with `tools/earth/tune.mjs` on a copy of `src/`, `earth/` and `tools/earth/` (it spawns the scorer fresh, reading the source as it stands). Seeded planets may shift; report it.
- The one red is where the mantle reaches the surface (ridges, arc volcanoes, hotspots, flood basalts, eruptions) and, with people, the people. The other inks: ocean prussian, land umber (`colors.js`).
- The Zones map's classes are drawn twice, by `zoneColor` in the globe's shader and `zonePattern` in `src/render/figures.js`, so the two must match.
- A hidden browser pane runs as a background page: drive it with `tick()` and time it visible.
