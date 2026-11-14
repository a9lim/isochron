# Isochron: ideas

A brainstorm from 2026-11-14, after phases 1–4, the tides and the Moon. Nothing here is ratified. Once a9 picks, the chosen ideas fold into `docs/PLAN.md` as new phases, and this file goes.

Claude wrote the first draft. Codex brainstormed separately from the same docs and code without seeing it (gaslamp thread `isochron-brainstorm-2026-11-14`), and its ideas that weren't already here are merged in, marked **(Codex)**. The two lists converged on the same lead, independently: give the planet a memory and let visitors follow its consequences.

Marks follow the plan: **standard** (textbook geoscience), **synthesis** (a combination made for this sim), **speculation** (a bet the build has to test). Cost is rough agent time at the pace of phases 1–4: **S** an hour or so, **M** a session, **L** a few sessions, **XL** a phase of its own. Lineages named here are from memory and get checked before any public text.

## Where the planet is thin

What the sim does well is the coupled state at one moment. The ideas below mostly answer six gaps:

- **The rocks don't remember.** The record figure and the stripes are the only memory. Rock doesn't keep the climate it formed in, so nothing on the globe tells you the planet was ever different.
- **You can't touch it.** The pointer only turns the camera. There is no probe, no place to follow, no way to push on a coupling and watch the others answer.
- **Every year is the same year.** Between the season and the plate step there's no variability: no El Niño, no volcanic winter, no cold decade. The soft Köppen widths are constants, not the planet's own spread.
- **Events happen invisibly.** Rifts, merges, provinces and superchrons happen in the engine and leave no mark.
- **Life is a coefficient.** Vegetation is an instant function of climate, and the biosphere is a factor on albedo and weathering.
- **Deep time stops at ~100 Myr.** The Sun doesn't brighten, the mantle doesn't cool, and the top of the dial is engine-bound (~1–3 Myr/s at level 7), so a Wilson cycle takes minutes and a Gyr takes an afternoon.

## A. The rocks remember

**A1. Proxies in the record** (standard proxies, synthesis as computed; S–M)
- δ¹⁸O: an ice-volume term plus a deep-water temperature term (the high-latitude winter sea, where deep water forms). The ice ages then look like a benthic stack, the planet's own LR04.
- δ¹³C of the exogenic carbon, by mass balance of mantle input against carbonate and organic burial (organic carbon light by ~25‰). Provinces' pulses show as negative excursions (PETM-like) and burial surges as positive ones. Organic burial already exists, so this costs almost nothing.
- ⁸⁷Sr/⁸⁶Sr of seawater: river input, radiogenic by the eroded rock's age and felsic fraction, against hydrothermal input scaled by ridge production. Orogenies push it up and fast spreading pulls it down, as the Himalaya's rise does on Earth.
- No new physics: three readouts of fluxes the model already has, which turn the record into a geochemist's figure.

**A2. A Geology view** (standard convention, synthesis implementation; L)
- A fifth view as a geological map: exposed bedrock by age on a sequential ramp, and kind as pattern: sediment by facies, young volcanics in red v's (the mantle at the surface), arc plutons, metamorphic cores at sutures, oceanic crust by isochron. Erosion unroofs old cores in mountains and basins fill with young cover.
- Facies come from the climate where they're laid down: evaporite in arid zones and closed lakes, coal in wet lowlands, tillite under ice, carbonate on warm shallow shelves, red beds in dry basins, fans at river mouths, pelagic ooze. That's how paleoclimate is read from rock.
- State: a cover package (thickness, age, facies) over a basement (age, kind) in each plate's frame, so three or four more fields per plate copy.
- New arrows: climate → sediment facies, ice → till.

**A3. Follow a rock** (synthesis; M, needs I1)
- Click a place: it's pinned to its plate and rides with it. The margin draws its life: paleolatitude, elevation and Köppen class over time as a strip (the zone as its pattern), and a stratigraphic column of what was laid down there.
- A place drifts from the tropics through desert into glaciation, which is the story geology students learn from one outcrop.
- Backfilled for any rock, not just pinned ones, from the history cube (I1). No per-cell stacks are needed.

**A4. Apparent polar wander paths** (standard; S once I1 exists)
- Select a continent and its rocks' record of the pole is drawn on the globe: a dotted track beaded every 10 Myr. Two continents' paths diverge before their collision and coincide after it, the classic evidence for drift. With true polar wander (F2) they share a common component.

**A5. Fracture zones and abyssal hills** (standard morphology, synthesis drawing; M)
- When a gap cell is born, store its spreading direction and rate in the plate's frame. The shader draws abyssal-hill fabric parallel to the ridge, its roughness reading the spreading rate (slow ridges rough, fast ones smooth), and fracture zones where the ridge was offset by a transform, carried away as scars along flow lines.
- This is what makes a Tharp–Heezen ocean floor read: the corrugated floor and the fracture zones fanning from the ridge. The seafloor is now smooth isobaths and stripes. Every mark reads spreading direction, rate or offset.

**A6. Glacial erosion and the regolith** (standard process, speculation as a rhythm; M)
- Ice erodes in proportion to its sliding (this is in the plan's layer 3 but isn't built): troughs under fast ice, planed shields, till at the margins.
- A regolith layer that weathering builds and ice strips. Ice slides fast on regolith (thin, quick sheets) and sticks on bare rock (thick, slow ones). That's the regolith hypothesis for the mid-Pleistocene switch from 41-kyr to 100-kyr ice ages (Clark and Pollard). Here it becomes a live experiment: ice ages that change rhythm as they strip their own beds.
- New arrows: ice → landscape, landscape → ice (bed friction).

**A7. Carbon that lives somewhere** (standard; M)
- Split the exogenic pool into air and ocean, with carbonate chemistry and a compensation depth. Carbonate is buried on warm shelves (which depend on sea level) and in the deep sea above the compensation depth, and subducted carbonate feeds arc outgassing.
- A carbon pulse then recovers in three visible stages: the ocean takes it up over centuries, carbonate compensation acts over ~10 kyr, and silicate weathering finishes over hundreds of kyr (Archer's long tail). Cold glacial oceans hold more CO₂, which gives the ice ages a carbon amplifier they don't have now.
- Carbonate platforms (Codex) keep pace with slow sea-level rises and drown under fast ones, or stand exposed as plateaus when the sea falls. Their erosion returns carbon later. Carbonate precipitation isn't simply a CO₂ sink, so this needs the alkalinity budget.
- Marine productivity (Codex): a minimal nutrient budget fed by rivers and the ocean's upwelling. Organic burial then happens where productive coasts are (black shales for A2), not just in proportion to sediment.
- New arrows: sea level → carbonate burial, plates → carbonate recycling, ocean temperature → CO₂, upwelling → organic burial.

**A8. Rock with a character** (Codex; synthesis; L)
- A small lithology mixture and a weathered regolith (shared with A6) carried with the crust, setting erodibility and weatherability. Resistant belts survive as ridges, old surfaces go soil-covered and supply-limited, and fresh basalt weathers several times faster than granite. A province's flood would then draw CO₂ back down after its pulse.
- It's the active half of A2's geological map: the same state, read by the landscape and the carbon cycle.

**A9. Loads bend the lithosphere** (Codex; standard; L)
- Elastic flexure from mountains, sediment, water and ice instead of local isostasy alone. A growing range gets a foreland basin beside it and a bulge beyond, a delta subsides under its own sediment and makes room for more, seamounts sit in moats, and an ice sheet raises a forebulge that collapses when it melts.
- Risk: flexure on the sphere with variable rigidity, without counting the compensation twice.

## B. The hand

**B1. The probe** (standard figures; S–M)
- Hover for a hairline readout of the cell (label–value pairs: height, crust age, plate, the top zones, T and P). Click to pin it (A3).
- A Walter–Lieth climograph for the pinned place: monthly T and P on paired axes, arid months stippled, humid ones hatched, frost months marked. It's a standard ecological diagram and already pattern before hue. The climate's harmonics give it directly.

**B2. Sculpting** (synthesis; L; a9 parked this earlier)
- A small palette on keys: Uplift (drag to thicken crust), Rift (draw a line and the plate splits along it; `tec.rift` exists), Plume (place a plume head; `Plumes` exists), Impact (B3), Carbon (a pulse), Water (raise or lower the ocean's volume).
- The point is to test the couplings by hand. Raise a range across the westerlies: the rain shadow appears at the next climate cycle, rivers reroute, the new slopes' weathering draws CO₂ down (uplift–weathering), and the range wears away over Myr while Fig. 7's arrows swell and settle.
- Each edit is a source in the books: added crust comes from the mantle, and Fig. 7 says so.

**B4. Where did this rain come from?** (Codex; synthesis; M–L)
- Select a river mouth: its watershed lights up, and so do the seas its rain evaporated from, as weighted patterns on the globe. Or select a sea and see where its water falls.
- Tagged moisture: a tracer riding the moisture balance with its source restricted to one region and rain removing it in proportion (the standard water-tagging technique). One selected source or destination at a time, not an all-to-all matrix. It's the coupling thesis as a question the visitor chooses.

**B3. Impacts** (standard effects, synthesis; M)
- Drop a bolide, or let a seeded Earth-like flux deliver them. A crater and ejecta blanket (a 10 km impactor's crater spans ~3 cells at level 7), an impact winter (an albedo forcing decaying over years), a tsunami at sea (D4), a boundary clay in the column (A3), and an extinction pulse (E2). The landscape erases craters over hundreds of Myr.

## C. Years between the seasons and the plates

**C1. Interannual variability** (standard, Hasselmann's model; S–M)
- Red-noise forcing by region, its amplitude from the weather's eddy variance, so years differ. The soft Köppen widths then come from the planet's own interannual spread, as the plan intended, and the zones' edges breathe.
- It's the weather → climate arrow, statistically.

**C2. An El Niño, if the geography allows one** (standard mechanism, synthesis; M–L)
- A recharge oscillator (Jin's) for each wide equatorial basin, its coupling set by the basin's width and the trades, so the planet has an ENSO only when its plates have made a Pacific. Its pattern feeds the SST, the template (the Walker cell and its rain shift east) and the weather.
- At 1–10 yr/s the equatorial sea's tint and the rain shift every few years. The question "does this planet have an El Niño?" is answered by its tectonics.
- Risk: whether a template climate carries teleconnections convincingly (speculation, in part).

**C3. Volcanic winters** (standard; S)
- Arc eruptions as a seeded power-law point process at active arcs, rate by convergence. Sulfate cools the planet ~0.5 K for a year or two after a Pinatubo-size eruption, more for larger ones; provinces add sulfate during their floods. The volcano flashes red when it erupts, and its veil spreads in latitude as a thin stipple.
- At yr/s the record dips after each large eruption, and at Myr/s they average out: the dial's closure, visible.

**C4. Dust and loess** (standard, synthesis; M)
- Deserts and glacial outwash emit dust, which the template's winds carry downwind: loess plains, dirty ice at sheets' edges (lower albedo), and iron for the sea (more organic burial, less CO₂: Martin's hypothesis). Glacials are dusty, so dust gives the ice ages another amplifier.
- The marks are the transported mass, ochre stipple crossing an ocean, not a haze.

**C5. The ground stores heat and water** (Codex; synthesis; M–L)
- A shallow soil reservoir of heat and water, and snow that insulates it (no lateral groundwater, which stays cut). Continental interiors stay wet after rains, freeze late and thaw unevenly, and runoff lags the rain. It would replace part of the seasonal rivers' baseflow rule, so the same water mustn't be counted twice.

**C6. Floods do the work** (Codex; standard idea, synthesis here; L)
- Erosion is nonlinear in discharge, so a mean runoff underestimates what floods cut. Feed the stream-power law the distribution of discharge (from C1's variability and the weather's storms) rather than its mean. A storm crossing a range swells the rivers downstream, and at fast dials the flood statistics' integrated effect stays in the erosion.

## D. Storms, seas and faults

**D1. Tropical cyclones** (standard climatology, synthesis; M–L)
- Seeded genesis where a genesis-potential index is high (sea over ~26 °C, low shear between the QG layers, vorticity off the equator, moist air; Emanuel and Nolan). Each storm is a tracked vortex steered by the barotropic wind plus beta drift, its intensity relaxing toward a potential intensity from the SST, decaying over land and cold water, recurving into the westerlies, and handed to the QG model as a PV anomaly when it goes extratropical.
- Drawn in the chart's convention, the hurricane glyph with its track. At the climate dial, track density shows the planet's typhoon alleys, wherever its geography puts them.

**D2. The weather's feedback to the climate** (synthesis; L, Codex says XL)
- The missing arrow: the weather's measured eddy heat flux, storm-track rain and variability correct the energy balance's diffusivity and the moisture by latitude. That's the seam calibration the plan called for. It makes the planned Storm track experiment measurable, and it supplies the distributions C1 and C6 need.
- Codex's catch: the weather runs only while its view is open, so the climate mustn't depend on which view a visitor chose. The statistics have to be gathered whatever the view (a background weather at lower cost, or a calibration run per planet at spin-up), with confidence growing over simulated seasons.

**D3. Hovmöller and storm-track figures** (standard; S)
- Time against longitude of the pressure anomaly at the storm track's latitude: storms run as diagonal streaks, their slope their speed. Eddy energy by latitude shows where the track lies. Together they're the Storm track experiment's figure (Phillips' criterion as its theory).

**D4. Earthquakes and tsunamis** (standard, synthesis; M–L)
- Seismicity as a point process: each boundary's moment rate from its relative velocity, length and seismogenic depth (Kostrov's budget), magnitudes Gutenberg–Richter, cut off by a corner per boundary type (subduction 9+, transforms ~8, ridges ~7), with depth along the slab behind trenches (Wadati–Benioff zones).
- At slow dials epicentres flash and fade, sized by magnitude and inked by depth: the world seismicity map whose dots outline the plates. At plate speed they become a density stipple along boundaries. A Gutenberg–Richter figure shows the straight line coming out of the model.
- Great subduction quakes launch tsunamis on the tide's shallow-water solver, run in the time domain from the rupture's uplift. They're drawn as travel-time contours every hour, the way tsunami charts draw them, and those contours are literally isochrons. At hours/s a tsunami crosses an ocean in seconds.

**D5. Closed lakes that breathe** (standard hydrology; S–M)
- A closed basin's lake rises until its evaporation matches its inflow, so its area follows the climate: pluvial lakes in glacials (Bonneville, Lahontan), salt flats when they dry (evaporite for A2), and old shorelines left as hairlines (strandlines).

**D6. Clouds as a nephanalysis** (standard convention, synthesis; M)
- A fourth weather chart: cloud cover from the QG's humidity and ascent, drawn in the notation 1960s satellite analysts used (scalloped cloud-area edges, cover by stipple density, symbols by type). It would be drawn only: cloud albedo in the energy balance is an easy way to mistune the climate.

**D7. Deep-water formation** (standard, speculation here; M; reopens a cut)
- Mark where the winter sea is dense enough to sink, with a Stommel two-box overturning whose strength sets heat transport to high latitudes, and its collapse under meltwater (Heinrich-like events). a9 cut deep overturning; this is the version that stays on the globe (the sites and their effect on SST and sea ice).

**D8. Sea ice that moves** (Codex; synthesis; L)
- Sea ice with thickness, drift under the wind and the currents, and resistance when compact. Winds open coastal gaps, currents export ice and the edge grows tongues. This addresses the near-circular ice edge (`LOG.md`) through dynamics rather than roughness.

**D9. Tides change the coastal climate** (Codex; standard criterion, synthesis coupling; L)
- Tidal stirring mixes shelf water top to bottom where the tide is strong against the depth (Simpson and Hunter's h/u³ criterion), and the fronts between mixed and stratified shelf water set summer sea temperatures, evaporation and coastal rain. As sea level moves the shelves, the fronts move.
- It gives the new tides an arrow into the climate and weather. Kept to shelf water columns, so it doesn't reopen deep overturning or the halocline.

**D10. Marine ice sheets** (Codex; standard; XL)
- Ice streams, floating shelves, buttressing and grounding lines that migrate, so an ice sheet on a bed deepening inland can collapse (the marine ice-sheet instability). It gives ice ages fast terminations. It needs a different stress balance (the shallow-shelf approximation), not a calving tweak.

**D11. A moist primitive-equation atmosphere** (Codex; standard; XL)
- Replace the two-layer QG core with moist primitive equations, keeping the statistical closure at fast dials, so tropical circulation, monsoon onsets and moist disturbances interact with the mid-latitude weather. It's the honest fix for the QG model's blind spots (the equator, latent heat), at the largest cost here; it wouldn't by itself make credible hurricanes, which is why D1 is parameterized.

## E. Life

**E1. Vegetation as a state** (standard feedbacks, synthesis; M)
- Biomes migrate toward their climate at finite speed instead of snapping to it. Transpiration feeds moisture back to the air (the interior rain of a forested continent), and albedo darkens under forest. A monsoon margin can then hold green or desert under the same orbit and flip abruptly as the orbit drifts (the green Sahara; Claussen).
- New arrows: vegetation ↔ moisture, vegetation's lag.

**E2. Biodiversity: the planet's Sepkoski curve and its Wallace lines** (synthesis, speculation; L–XL)
- Two realms, shelf seas and land. Each cell holds richness and a few faunal provinces, carried in the plates' frames so a fauna rides its continent. Speciation rises with area, warmth and isolation. Extinction rises with climate velocity, habitat loss (sea-level falls drain shelves, ice covers land), anoxia after rapid warming (provinces), and impacts. When continents collide their faunas mix, often asymmetrically (the Great American Interchange).
- A Life view: richness as stipple density, provinces in their inks, Wallace lines where faunas meet. The record gains a diversity curve whose mass extinctions come from provinces, snowballs and sea-level falls rather than a script. Valentine and Moores' idea, that breakup raises diversity, becomes testable here.
- New node: everything → life; life → weathering and organic burial.

**E3. The greening** (speculation; M, needs F1)
- Land plants multiply weathering several-fold (Berner's GEOCARB). Step the factor up at a time and the planet draws CO₂ down and may glaciate, the Devonian–Carboniferous story, as an experiment.

## F. Deep time and the interior

**F1. The long arc** (standard trends, synthesis; L, needs I3)
- The Sun brightens ~7% per Gyr (in the plan's planet table but not the code: `S0` is fixed), and the mantle cools (plates slow, outgassing falls, continents grow at arcs). The thermostat pays for the brightening Sun by drawing CO₂ down. The faint young Sun becomes a dial: start 3 Gyr ago and see whether the thermostat keeps the water liquid.
- It needs the dial's top at 10–100 Myr/s: a deep-time mode at level 5 with the plates on the GPU.

**F2. True polar wander** (standard physics, synthesis; M)
- The solid planet turns so that its largest moment of inertia aligns with the spin axis (Goldreich and Toomre). The model already holds the anomalies: slabs, continents and their keels, ice sheets, swells. Compute their inertia tensor each plate step and turn the mantle frame toward the principal axis at a viscous rate (≲1°/Myr).
- The whole globe rolls under the climate, which stays fixed to the spin, and everything's latitude shifts together. Ice sheets and slabs then steer the axis.
- New arrows: slabs and ice → the spin axis → climate.
- Codex's caution: a rotation toward the heaviest continent would mislead. The rate is set by the relaxation of the rotational bulge and the lithosphere's elastic remnant of it, which stabilizes the axis, so this is speculation as a model until it's built against that physics.

**F3. The Interior view: a cutaway** (synthesis; L, XL with convection)
- Cut a wedge out of the globe and draw its faces: the lithosphere, slabs sinking from the trenches (the slab memory carried down at a dip and a sinking rate, piling at 660 km and at the core), plume conduits rising under hotspots and plume heads, and two large low-velocity provinces at the base where plumes are born. Temperature is drawn as hatch density.
- Dynamic topography: the surface is pushed up over plumes and down over slab graveyards, by hundreds of metres to a kilometre, which moves sea level and floods continents' interiors.
- It keeps "nothing off the globe", since the cutaway is the globe. The XL version is a coarse Stokes solve in the shell on the GPU, driven by the slabs, so plumes rise where slabs aren't (Burke and Torsvik's LLSVP edges).

**F4. The supercontinent cycle** (planned experiment; M)
- An assembly index (the largest landmass's share, continents' mean separation), mantle insulation under a supercontinent biasing plume heads beneath it (speculation), and ocean lifespans. It's the planned Supercontinent experiment with its readouts.

**F5. Water through the mantle** (Codex; speculation; XL)
- Replace the 150-Myr freeboard buffer (`WATER_TAU`, a closure) with surface and mantle water inventories: seafloor hydrates, slabs carry water down, ridges and arcs degas it. Some planets then slowly expose their continents and others drown them, by their tectonic history. The risk is drifting into dull ocean worlds; Earth-like freeboard isn't guaranteed, and that's the point.

**F6. Inherited weakness** (Codex; synthesis; L)
- Sutures, rifts and damaged lithosphere carry a strength that heals with time and weakens with heating and strain. Oceans reopen along old belts, and failed rifts (aulacogens) stay visible through later cycles. It deepens the rift rule's preference for sutures, and it has to earn its keep by changing later choices rather than restating the rule.

## G. Sky and orbit

**G1. The Moon sets the ice ages' rhythm** (standard; S–M)
- The precession constant depends on the spin (the planet's flattening goes as Ω²) and on the Moon's distance. So as the tide slows the spin and the Moon recedes, the precession and obliquity periods lengthen, and in the deep past they were shorter (Berger and Loutre). Link `OrbitCycles` to the Moon and the spin: tides → orbital periods → ice ages, a new arrow.
- If the precession frequency drifts across a secular frequency, the obliquity goes wild (Laskar's chaotic zone). That's speculation for this model.

**G2. Other planets, and no Moon** (synthesis; M)
- A Planet tab with genesis knobs: water inventory (desert world to archipelago), day, obliquity, stellar flux. The planned Spin and Tilt experiments are its slices.
- A Moonless experiment: the obliquity unstabilized (a slow chaotic walk over tens of degrees), only the solar tide, and the day barely lengthening (Laskar, Joutel and Robutel).

**G3. Day and night** (standard; S)
- Below a few hours a second, the terminator as an almanac's hairline, and a diurnal cycle in the weather's forcing over land, which the plan says dry lines need.

**G4. Eclipses** (standard; S–M, low coupling)
- The Moon's inclined orbit and its nodes, and at the slowest dial the umbra's track across the globe, as an almanac draws eclipse paths. A treat, not a coupling.

## H. The planet's story, without telling

**H1. Names for continents and oceans** (synthesis; M)
- Seeded names, set as a globe sets them: italic Newsreader spaced along the landmass, oceans larger and lighter. Names follow the Wilson cycle: an ocean is named at its rift and its name is struck at its suture, a supercontinent takes a new name at assembly, and rifted pieces inherit or take new ones.
- Show, don't tell allows names, since they're labels. Risks: label placement on a globe, and the generator's taste.

**H2. Events on the record** (S)
- Each event the engine already has (rift, merge, initiation, province, superchron, snowball onset; impacts and extinctions once they exist) becomes a glyph on the record's time axis, keyed, and named via H1 ("the Thaen closes"). A log would be telling; marks are showing.

**H3. The planet's time scale** (speculation; S–M)
- The planet's own chronostratigraphic chart, divided at its largest events as Earth's is, drawn as a column beside the polarity barcode.

**H4. An atlas and Equal Earth** (M; leans on "no insets")
- The plan's open decision, an Equal Earth toggle for the whole planet's zones at once, and a margin strip of the planet every 50 Myr from the history cube (I1), the way paleogeographic atlases are laid out.

**H5. Experiments draw their theory** (standard; S–M)
- Each experiment's figure shows its theory and the planet's path across it: Snowball's S-curve of ice line against sunlight with the hysteresis loop traced as you sweep the knob, Thermostat's analytic balance with the live point, Ice ages' periodogram against the orbit's spectrum, High stand's sea level against mean ridge age. It's the plan's "Theory" column made visible, as Worldline's figures are oracles.

## I. Infrastructure that unlocks the rest

**I1. The history cube** (M)
- Record each plate's rotation every step (a few bytes) and every ~1 Myr a coarse snapshot (level 4, 2,562 cells) of height, zones, ice, sea and deposition. That's kilobytes a snapshot and tens of MB for a Gyr.
- It unlocks A3 (any rock's life story), A4 (polar wander paths), H4 (the atlas) and scrubbing the record to see the globe as it was.

**I2. Determinism, saves and branches** (M–L)
- The engine's real-time budgets (the ice, the async climate) make a run depend on the machine. A fixed-work replay mode would let `?seed=…&t=…` reproduce a moment, saves would let you return to a planet, and branching would allow counterfactuals: save, change one knob, and watch the planets diverge.
- Codex's extension: experiments that start from the planet you're watching rather than reloading the opening. Checkpoint, apply one bounded perturbation (double the outgassing, dim the Sun), and alternate the globe between the branch and its baseline. It reopens the overnight decision that experiments reload, which was made because a snowball can't be undone by its knob; a checkpoint answers that. Codex also proposes turning points: sparse full checkpoints indexed by event (H2), so you can return to the moment a strait closed and replay it slowly.

**I3. The rest of the engine on the GPU** (L)
- The plate step (each cell's point location in the plate frames is independent), the energy balance (multigrid), the template and zones, and the surface's preparation. The priority flood is the hard one, since parallel depression filling is iterative. It unlocks the deep-time dial (F1), level 8 (28 km) for the surface, and faster experiments.

## J. Wild cards

- **J1. Sonification** (S–M): a quiet voice per quantity (the weather's eddy energy as wind, earthquakes as clicks sized by magnitude, the season as a slow drone), off by default. Depict, don't decorate, for the ear.
- **J2. People** (L, parked by a9): settlement where the zones and rivers allow, then a carbon pulse and land use, so the Anthropocene runs as an experiment and the thermostat draws it down over ~100 kyr. B2's Carbon tool with A7 gives the physics without the people.
- **J3. A tidally locked world** (L–XL): a fixed substellar point, an eyeball climate. The template assumes zonal structure, so it's a rewrite of the circulation.
- **J4. A planet catalogue** (M): survey many seeds headless and offer the interesting ones (a supercontinent world, an archipelago, an ENSO planet) as presets.
- **J5. Close zoom by downscaling** (speculation; L): at the closest zoom, valleys generated from the model's own statistics (relief from the uplift–erosion balance, drainage density from runoff). The risk is decoration rather than depiction.

## Claude's picks

The ones I'd fight for, by payoff per cost:

1. **A1 Proxies** and **H2 Events**. Cheap, and the record becomes a real paleoclimate figure with the planet's history marked on it.
2. **B1 Probe + I1 History cube + A3 Follow a rock + A4 Polar wander.** One piece of infrastructure buys the sim its first interaction beyond the camera and its best story: a place living through the planet's history.
3. **A5 Seafloor fabric.** The largest visual gain for the cost, and the medium (Berann's ocean floor) asks for it.
4. **D4 Earthquakes and tsunamis.** It reuses the tide's solver, it's visceral at the slow dial, and it gives the plates a life at human timescales.
5. **F2 True polar wander.** A deep, real, little-known coupling (slabs and ice steer the axis) for moderate cost.
6. **A7 Carbon with an ocean** with **A6 regolith**. Together they give the ice-age rhythm, which didn't emerge in the overnight run, the two amplifiers the real one is thought to need.
7. **E2 Biodiversity.** The big swing: mass extinctions and Wallace lines that come out of the tectonics. The most speculative item, and the one I'm most excited by.

## Codex's picks

1. **B4 Where did this rain come from**: the strongest interaction payoff, the coupling thesis discovered through a question the visitor chooses.
2. **D2 Weather teaching climate**: completes the dial's central promise and supplies the distributions several other ideas need.
3. **A8 Rock with a character** (with A6's regolith): persistent character for every continent, improving the landscape and the carbon cycle from one state.
4. **A6 Glacial erosion**: a legible before-and-after, ice as an author of geography rather than a temporary cover.
5. **D9 Tidal shelf fronts**: makes the new tides part of the climate.

Its advice: build B4 first, then pick one physical chain, rock → weathering → carbon or ice → erosion → sediment → coast → tides, and deepen it end to end.

## Where the two lists meet

Both lead with memory plus following (A3 and B4 are the same instinct: pick a thing and trace its consequences), both want ice to carve (A6), and both want the regolith (A6, A8). Codex weights the physical chains, and I weight the record and the readouts. Codex's caution on D2 (the climate mustn't depend on the open view) and on F2 (the rotational bulge) are corrections I'd take.

A possible shape, for discussion rather than ratification:

- **6 The record and the probe**: I1, A1, B1, B4, A3, A4, H2, H5.
- **7 The floor and the faults**: A5, D4, A9, A2 with A8.
- **8 Ice and rock**: A6 with the regolith, A7, D8, D9.
- **9 The years**: C1, C3, C2, D1, D2, D3, D5, C5, C6.
- **10 Life**: E1, C4, E2.
- **11 Deep time**: I3, F1, F2, G1, F3, F5, F6.
- **12 The hand**: B2, B3, I2, H1.

The open tuning (the ice-age rhythm, the short D climates, the 5.3 km ocean) stays ahead of all of it. A6, A7 and C4 are partly that tuning, since they're the amplifiers the ice ages lack.
