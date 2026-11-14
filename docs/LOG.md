# Overnight log

The working log for the overnight run that a9 asked for on 2026-11-14: "go through each phase as far as you can; it'd be amazing if I could wake up to a complete sim". `docs/PLAN.md` holds the plan, and this file holds the brief, the rules for the run, and what got done, so the run survives a context compaction. Read it first after a compaction.

## Brief

- **Scope.** Phases 2 to 5 of `docs/PLAN.md`, in order, as far as they go. Skip the social card: a9 will do it in a fresh session.
- **Authority.** a9 trusts Claude's judgment and taste and expects hard decisions to be made, not deferred. a9 will give feedback in the morning. Record every judgment call under "Decisions made overnight" below so a9 can review them in one place, and move any that become part of the design into `docs/PLAN.md`.
- **Order.** Each phase should ship on its own: finish and verify one before starting the next, so whatever state the morning finds is coherent.
  1. **Phase 2, surface and climate:**
     - landscape (stream power, flow routing, sediment);
     - the seasonal energy-balance model (harmonic solution, land and ocean heat capacities, albedo, CO₂ forcing);
     - the circulation template (ITCZ, Hadley edge, pressure belts, monsoons);
     - moisture and precipitation (orographic rain, rain shadows);
     - soft Köppen zones and the Climate view;
     - Fig. 3 (zonal means);
     - the dial extended to 10 yr/s.
  2. **Phase 3, ice and carbon:** ice sheets (shallow-ice approximation, positive degree days, the ice load), sea ice, orbital forcing, glacial isostasy, the carbon loop, large igneous provinces, Figs. 1 and 5, and the Snowball, Ice ages, High stand and Thermostat presets.
  3. **Phase 4, ocean and weather:** gyres and SST, the two-layer QG core, tracers, fronts and dry lines, the synoptic chart, the weather–climate hand-off, and the dial reaching hours.
  4. **Phase 5, the harmony:** Fig. 6 (the model diagram with live fluxes), the presets surveyed across seeds, the about panel, Japanese, and registration on the site. No social card.
- **Commits.** Commit each milestone in the submodule with a clear message, push it, then bump the parent's pointer. Stage the parent explicitly, since a9 may edit the parent concurrently. Never `git add -A` in the parent.
- **Do not deploy.** `./deploy.sh` ships the working tree, and a9 should see the sim before it goes public. Registration on the site (phase 5) may be committed, since nothing is public until a deploy, but say clearly in the morning summary that it is registered and undeployed.
- **References.** Model lineages named in `about.md` or JSON-LD must be checked against their live source first (root `AGENTS.md`). Overnight, keep references out of public text, or mark them to be checked.
- **Design.** Follow the root `AGENTS.md` design system and "Inside the scene":
  - Depict, don't decorate.
  - Pattern before hue.
  - Show, don't tell: the caption carries only names and values.
  - One red: the mantle at the surface.
  - Newsreader everywhere and the inks for data. No cards, shadows or glow.

## Working notes (gotchas so far)

- WGSL derivatives (`fwidth`) only work in uniform control flow. Compute them first, then use `select`/`mix`, never `if`.
- The browser pane throttles `requestAnimationFrame` when hidden, so a frozen clock in the pane may be the pane, not a bug. `window.__isochron` exposes the state for checks.
- `read_console_messages` keeps errors from earlier page loads. Compare the line numbers with the current files before chasing one.
- Plate motion is exact because each plate stores crust in its own frame. Don't resample the world grid per step: a step moves less than half a cell, so nearest-cell resampling would freeze motion.
- Overlaps where plates slide past each other are rounding. Consume crust only where plates close (`CLOSING`), or transforms churn crust and leave false slabs.
- Slab pull acts along the trench line only. Counting the slab-memory band behind a migrating trench makes pull grow with speed and run away.
- The level-6 plate step is ~6 ms and line tracing ~6 ms, all on the main thread. Climate and weather will need a worker, or GPU compute for the QG core. Measure before adding per-step O(n) work.
- Sea level is very sensitive to mean seafloor age, because the continents are flat isostatic plateaus. The landscape layer should give them relief.
- The dev server is the parent's `docs/sim-overhaul/serve.mjs` (launch config "sims", port 8790).

## Decisions made overnight

(None yet.)

## Progress

- 2026-11-14, before the run: phase 1 is built (see `AGENTS.md`). The repo is github.com/a9lim/isochron, a submodule of the parent (parent b073e84). It isn't registered on the site.
