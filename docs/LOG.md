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

Phase 2:
- **Erosion replaces the relaxation of thick crust.** Phase 1's `ERODE_TAU` relaxed crust over 40 km toward 35 km and destroyed the difference. The landscape now takes thickness by stream power and returns it as sediment, and continental thickness diffuses (faster under thick crust, for orogenic collapse). Crust is conserved (tested).
- **A slow water buffer.** Sediment filling basins and young seafloor raised the sea until land fell to 12–21%. The ocean's volume now relaxes toward the genesis land fraction over 150 Myr (`WATER_TAU`), a stand-in for water exchanged with the mantle. It's a closure for something unmodelled, marked speculation. Short high stands remain (seed `c` falls to 18% land and recovers).
- **Erodibility** K = 1.2 × 10⁻⁷ /yr (half the first try) keeps more relief; erosion runs at 3–6 km³/yr, Earth's natural order.
- **The EBM runs a level coarser** (220 km cells) than the surface, with transfer operators between levels: heat spreads over thousands of km, and it's 8× cheaper. Mean and two harmonics, solved by COCG.
- **Two diffusivities.** One D for the mean and a smaller one for the seasons (`D_SEASON` 0.1 against 0.45). With one D the continents had the ocean's seasons (45°N land ranged −4 to 11 °C); now −13 to 18 °C, near Earth's.
- **Rain rises exponentially with column humidity** (the shape of Bretherton and others' tropical fit, constants from memory, kept out of public text). A hard humidity threshold dumped all tropical moisture in one row of cells at 15 m/yr.
- **Moisture rides a less divergent wind**: the geostrophic part plus 40% of the frictional drift. With the full surface drift the trades dried to 30% humidity and evaporated 15 mm/day.
- **Climate constants tuned on the default seed** for mean 13–14 °C, ~1,000 mm/yr of rain, zone shares near Earth's: albedos 0.25 (sea) and 0.27 (land) + 0.12 sin²φ, evaporation 0.35/day, background rain 0.08/day.
- **Fourteen classes**: Af Am Aw As BW BS Cf Cs Cw Df Ds Dw ET EF (the plan's second letters; third letters and h/k left out). Logistic widths 1.5 K and 0.25 in log rain.
- **The mosaic draws p², not p.** The logistic tails gave every desert a few percent of green tesserae. Squaring keeps even ecotones even and drops the speckle. A, C and D also step in value (A darkest), so they part in grayscale: pattern before hue.
- **Figures are numbered by page order**: Fig. 1 the globe, 2 zonal means, 3 hypsometry, 4 polarity. The plan's list numbered them by topic. The margin has tabs, Climate and Crust.
- **The dial reaches 1 yr/s**, past the phase's 10 yr/s, because the seasonal solution is analytic: below ~4 yr/s the globe shows the season at the planet's clock, above ~40 yr/s the share of the year under snow and ice.
- **Snow and sea ice are the paper**, sea ice with a sparse stipple. Lakes show only where inflow beats ~1 m/yr of evaporation. Rivers are drawn above 1,500 m³/s and three cells long (wet coasts sprouted combs of one-cell streams).
- **Shallow water got a visible tint** (square-root depth curve, higher floor): the new shelves read as paper.
- **Reversals halved** (median rate 1.2/Myr, mean ~1.8): 1,203 reversals in 160 Myr made stripes finer than a pixel; Earth's record has ~300.

Phase 3:
- **The orbit is averaged over what the dial passes in ~2 s**, each periodic term scaled by sinc(W/P), so the climate sees the mean orbit at plate speed and whole cycles at kyr/s, crossfading without a switch. Earth-like periods and amplitudes, jittered by the seed.
- **Ice is explicit within a real-time budget** (3 ms a frame); past it the ice lags the climate rather than the clock. That is its closure; a semi-implicit solver is the upgrade if level 7 needs it. Ice lives in the mantle's frame.
- **Rain is capped at 25 mm/day per cell** (`RAIN_MAX`), with the rest carried on, and moisture diffusion lowered to 7×10⁴ km²/day. A mountain cell had drawn moisture from all sides and rained 38 m/yr, which grew an ice spike that collapsed the time step.
- **Outgassing is normalized to this model's settled plate activity** (~500 cells/Myr at level 6), not the spin-up's (~180), and **weathering takes pCO₂^0.3 directly** (soil CO₂). With the spin-up baseline, CO₂ ran to 1,100+ ppm in 10 Myr as the plates sped up; with only the temperature path, doubling outgassing multiplied CO₂ ~9×, now ~3×.
- **Plume heads rift continents through themselves** (`tec.rift(k, point)`), and leave a hotspot.
- **Experiments reload the planet** (`?exp=`): a snowball can't be undone by the knob, which is the experiment, so each starts from the opening. Snowball holds CO₂ at its value when chosen, so sunlight is the only cause.
- **Margin tabs**: Experiments, Record (Figs. 2, 3), Climate (Fig. 4, the key), Crust (Figs. 5, 6). The record's window is 40 s of the dial.
- **The ice-age rhythm didn't emerge** in a 600 kyr run at 220 ppm on the default seed: ice grows to 76 m of sea level and holds, with small orbital wobbles. The forcing is there (July on 55–72°N land swings 10 K between extreme orbits); this seed may lack land in the 50–70°N band. Open: survey seeds and CO₂ for marginal northern ice.

Phase 4:
- **Stommel's gyres, not Munk's**: the same western intensification with one boundary condition (Munk's ∇⁴ needs two). The layer is two cells wide (~220 km), numerically resolved; currents peak ~0.2 m/s at this width.
- **Outgassing's reference is the plates' activity at the end of the spin-up.** Right after genesis the plates make crust at ~40% of their settled rate; against the settled reference, CO₂ crashed to 57 ppm in 0.5 Myr and the planet froze. Now the opening is in balance and CO₂ drifts from ~260 to ~450 ppm as the plates speed up.
- **The weather runs on the 220 km grid, at 20-minute steps**, only while its view is shown, and only from a warm climate (from a cold one it drew noise). Its storms are drawn on the climate's own pressure belts (ρfψ₂ less its zonal mean, plus the template): the QG model's zonal flow drifts toward a 70 hPa polar high, a known weakness of two-layer models whose eddies don't carry enough westerly momentum down.
- **Isobars at whole hPa**, so a flat field doesn't sit on a contour; the drawn pressure is smoothed three passes.
- **Fronts by Hewson's TFP with percentile thresholds** (upper quarter of |∇θ| at mid-latitudes), chains of at least five segments.

Phase 5:
- **Not registered on the site.** The build throws unless a registered project's `index.html` names `/<slug>/og-image.webp?v=…` (`tools/build.mjs`, `og:image`), and a9 kept the social card for their own session; registering without it would break `npm test`. The checklist is below, for doing both together.
- **No Japanese yet.** Every caption, label and the about text would need a translation pass and an `i18n/strings.js`; that's a session of its own, and better done once the English settles after a9's review.
- **Fig. 7 is drawn from the code's actual couplings.** The weather's feedback to the climate (running means) isn't built, so the diagram has no arrow for it rather than imply one.
- **Five margin tabs** (Experiments, Record, Climate, Crust, Model); the margin is 372 px, as Miasma's.

## After a9's review (2026-11-15)

a9's notes: rivers look unnatural; ice caps stand out, their pattern is fixed to the screen and should be more conventional with harder edges; patterns don't scale with zoom; a legend; vegetation colour in the Relief view; biological carbon; the weather looks erratic; no Japanese (only Worldline has it).
- **Patterns are fixed to the globe**, triplanar and octave-blended, so they move and scale with it; marks stay a constant width on screen. The mosaic was already fixed to the globe.
- **Snow, sea ice and ice sheets are drawn as a map draws them**: a light fill with a hard, antialiased edge and a hairline. Ice sheets lost their flow hachures for contours of the ice's surface every 500 m (the flow crosses them downhill), which reads the same quantity conventionally.
- **The Relief view takes the climate's vegetation** as natural colours blended by the zones' mixture (not a mosaic), rock toward the summits.
- **A key per view**, at the globe's lower left, toggled by `K`.
- **Rivers route over ±25 m of roughness fixed to the crust**, so flats branch instead of draining in parallel straight lines, and are no longer drawn across lakes. It's sub-grid relief, the same idea as the coastline's easing; erosion still uses the true surface.
- **Fronts lie in troughs** (cyclonic low-level flow) and **hold their type in runs**: they had flipped cold and warm point to point.
- **Organic carbon**: burial with sediment and oxidation of old organic carbon in eroded rock, each a fifth of the reference outgassing at the opening; a new arrow in Fig. 7.
- **Conservation tolerance** in the landscape test is now 10⁻⁷: plates store thickness in float32.

## Registering on the site

When the social card is made (a9's session):
1. Paint the card: `tools/og/paint/isochron.py` and `tools/og/isochron.html`, then `node generate.js isochron` writes `projects/isochron/og-image.webp`. Its red is the mantle at the surface (ridges, arcs, hotspots).
2. `projects/isochron/index.html`: the canonical link, `og:*` and `twitter:*` tags with `og-image.webp?v=1`, and JSON-LD blocks like Miasma's (`WebApplication`, breadcrumbs); drop `noindex`. Any `isBasedOn` or educational reference gets checked against its live source first.
3. `content/projects/isochron.md` and `isochron.ja.md` (title Isochron, href /isochron, an order among the sims, `external: false`, an emoji, `seoName: Isochron — Planet Simulator`, 2–4 tags from the existing vocabulary).
4. Add `'isochron'` to `PROJECTS` in `tools/stage-assets.mjs` and `tools/subset-fonts.mjs`.
5. `static/_headers`: a `/isochron/*` preload stanza and the `/isochron/*.js` and `*.css` edge-cache rules, as for the others (mind the 100-rule limit).
6. `npm test` in the parent; then deploy when a9 says.

Open from phase 2: mean ocean depth is 5.3 km (Earth 3.7) because isostasy ignores the water's load and lithospheric roots; D climates are short (14–18% of land against Earth's ~25%); a climate cycle costs ~190 ms warm, spread over frames.

## Progress

- 2026-11-14, before the run: phase 1 is built (see `AGENTS.md`). The repo is github.com/a9lim/isochron, a submodule of the parent (parent b073e84). It isn't registered on the site.
- Phase 2 built: landscape, climate engine, Relief and Climate views, the margin's figures, the season at slow dial. Verified in the browser (light, dark, phone); 34 tests pass.
- Phase 5 in part: Fig. 7 (the model diagram with live fluxes). Not registered (needs the card), no Japanese. 38 tests pass.
- Phase 4 built: ocean gyres and SST, the QG weather and the synoptic chart, the dial to 2.8 h/s. Verified in the browser (a chart with lows, highs, fronts and a dry line); 38 tests pass, including Sverdrup and Phillips.
- Phase 3 built: orbit cycles, ice sheets, carbon thermostat, hotspots and provinces, the record and orbit figures, the five experiments. Verified in the browser (Snowball freezes at 88% sunlight; Ice ages and the record run); 36 tests pass, including Vialov's ice cap and the thermostat's balance.
