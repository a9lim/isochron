# Isochron

An Earth-like planet on one globe, from plate tectonics to weather and people, every layer coupled. A submodule of a9l.im at `projects/isochron` (github.com/a9lim/isochron); the parent's `AGENTS.md` covers the shared layer, the design rules and the build.

## Running and checking

From the parent root, `node tools/sims/serve.mjs 8790` and open `/isochron/`. URL options: `?seed=` names the planet (default `earth`, today's Earth), `?scenario=people` (`&ending=1a`…`3b` forces an ending), `?level=` the engine's grid.

```bash
node --test 'tests/*.test.mjs'         # the suite, ~10 s (GPU tests skip without Dawn: `cd tests && npm ci` once)
node --test 'tests/gpu-*.test.mjs'     # the GPU tests alone
for f in main.js colors.js src/*.js src/*/*.js; do node --check "$f"; done
node tools/climate-check.mjs earthlike # a seeded planet's settled climate (or `earth`)
node tools/earth/climate-score.mjs     # today's Earth against observations (tools/earth/README.md)
node tools/people/earth-score.mjs      # the people against where people live now
node tools/people/states-survey.mjs '{}' 8                                   # states and classes over eight draws
node tools/planet-run.mjs earthlike 600 1000 10 '{"CARBON":{"FIXED":220}}'   # the coupled planet headless
node tools/people-run.mjs earthlike 5e6 '{}'                                 # the people headless (LIVE=1: beside a live planet)
node tools/engine-cost.mjs 7 20 0.5 earthlike gpu                            # the plate step's cost by part
```

Other tools document their arguments in their headers. `window.__isochron` exposes the page's mirrors (`P`, `tec`, `land`, `climate`, `ice`, `carbon`, `year`), `engine`, `globe`, `camera`, `scheduler`, `setMap(name)`, `setDial(log₁₀ yr/s)`, `tick(now)` (one frame), `prof`, `engineProf`, `gpuScale`, `LEVEL`, `people` (`people.msg.bad`: the first non-finite number) and `follow` (`follow.scale`; `FOLLOW` in `src/clock.js`).

## Layout

```
earth/          today's Earth on the level-7 grid, and its mantle's slabs (made by tools/earth/)
boot.js         the page's first module: seed, level, the engine's thread started at once
main.js         the page: clock, snapshots, views, scenarios, captions, figures, input, the loop
src/grid/       the geodesic grid, its operators, transfers, multigrid
src/engine/     the model, no DOM, a file per layer; planet.js steps them; worker.js, people-worker.js;
                pool.js runs per-cell loops on threads (kernels.js registers them)
src/gpu/        device.js, hierarchy.js, each layer's GPU path
src/render/     the globe and its shader, the overlay, the key, the chart, figures, the sky
tests/          node:test; gpu-*.test.mjs run on Dawn
tools/          headless runs, surveys, fits; earth/ (Earth's data, scoring), people/ (cached openings)
docs/MODEL.md   equations, constraints, calibration targets
docs/ROADMAP.md what's open and next
about.md        the public about panel
```

## Conventions

- Mark claims as standard, synthesis or speculation, and "from memory" where unchecked. Never put a reference, DOI or URL from memory in `about.md`.
- Each source file's header documents its layer. Keep it current with the code.
- Tests guard what running the sim wouldn't show: conservation, analytic oracles, exact steps, determinism, CPU–GPU parity. One small seeded case per mechanism whose failure would be silent. Never snapshot tuned values; the scores in `tools/` track those.
- New per-cell state comes with a CPU reference (headless tools and tests run without a GPU). Kernels bind at most eight storage buffers.
- Per-cell loops on the pool: a function over a range of cells, run with `yield* parallel(name, f, …)` (`parallelSync` outside generators), registered in `kernels.js`, its arrays from `shared`, its arguments added to `tests/pool.test.mjs`. Keep it exact: sums stay sequential passes, scatters become gathers in scatter order. A posted shared array is shared, not copied. The people's worker has its own pool.
- WGSL compiles only in browsers and Dawn. The GPU tests compile the engine's and the weather's kernels, not the globe's shader, so check the page's console after shader edits. `fwidth` must stay in uniform control flow.
- Marks are drawn twice: in the globe's shader and in the key (`src/render/key.js`), the Zones classes also in `figures.js` (`zonePattern`). Change both.
- Tune on today's Earth: after a climate change, re-score, and re-tune with `tools/earth/tune.mjs` on a copy of `src/`, `earth/`, `tools/earth/`. Report how seeded planets shift. Bump `tools/people/planet.mjs` `VERSION` when the climate moves.
- Calibration has two stages, in order (a9): the climate as close to Earth's as it goes; then the people toward the history of an alternate Earth on that climate. The second starts by reading the settled climate and sketching how history would run on it (in `docs/MODEL.md`); the people's targets come from the sketch, and history's numbers are a sanity range.
- The one red is where the mantle reaches the surface (ridges, arcs, hotspots, flood basalts, eruptions) and the people. Ocean prussian, land umber (`colors.js`).
- A hidden browser pane runs as a background page: drive it with `tick()`, time it visible.
