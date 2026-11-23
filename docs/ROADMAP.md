# Roadmap

## Next: the industrial states (batch 2b)

Each landing is scored on Earth (`tools/people/earth-score.mjs`) and retuned.

1. **Overseas empires** (synthesis). A state's power at a place gains a projected part: its capital's arms carried by sea route, e-fold over a naval reach that grows with knowledge and industry (steam), lifted by the gap in knowledge between the capital and the place (Headrick's *Tools of Empire*, from memory). Settlers carry their state's allegiance, so lands the voyages fill become settler colonies rather than conquered ones. Extraction is what holding already does: a held place's national share of food goes to its capital, and after landing 2 its ores and fossil carbon too. Decolonization should fall out of cohesion (a colony's metaethnic frontier with its rulers; the nation's floor as learning spreads): check when. Targets on Earth, from memory: the largest empire holding about a quarter of the world's people ~160 years after industry began (the British, ~1920), decolonization mostly ~185–215 years after (1945–1975). Epidemics at the meeting of long-parted worlds stay out (below, Ideas).
2. **Regional economies.** `industrialStep` per polity (6.5 µs a call, so 500 polities cost ~3 ms a step and the full split is affordable), each with its own stocks, fossil carbon and ores from the cells it holds. Goods move by the gravity kernel with borders, energy and materials at a pooled price, and capital stays home (Feldstein–Horioka). Compute and the takeoff then have a place.
3. **The race.** Each polity has its compute, research minds and algorithmic frontier: grown by research, bounded by its learning, leaking across borders at a rate that closure lowers, with export controls on chips. The endings' draw reads the leader's margin in years, the contenders within a year, and the share they spend on safety and coordination (likeness on the torus, trade's ties). Alignment's odds rise with the margin and with safety (Armstrong, Bostrom and Shulman's race to the precipice); a pause's odds rise with coordination. The draw's mechanics stay (seam rule 4).
4. **Claims on the machines** (speculation, said so on the page): the aligned endings ask "aligned to whom", and claims by polity decide who returns and who is housed.
5. The docs and the about panel.

Left out: industrial war's nuclear exchanges (soot into the climate's forcing), a catastrophe outside the AI endings, to come after the race.

## Then: the game (batch 3)

- A third scenario beside World and People, the only one with controls; the other two keep the dial alone.
- The frame follows Scott Alexander's "The Goddess of Everything Else" (2015; none of its text is used). The model is the drive to multiply and consume, and the player never opposes it, only bends it. The score is the effective number of kinds the drive hasn't flattened: a Hill number over peoples, crops, polities, cities, works, worlds and stars. A star the probes reach could seed the next run.
- Standing rules: the player composes rules from words that are objects in the world (after Baba Is You). A rule pairs a trigger on a quantity with an action on a flow, then runs unattended. Revisions are scarce. Rules are ideas: each spreads by copying and takes root, held by a polity or its works, before it acts. Their forms open with the eras: prophecies, commandments, edicts, constitutions, manifestoes.
- The race as the last act: the takeoff's century played among the polities, each choosing pace against care. A treaty costs its signers.
- Needs saves (snapshots of the engine's and the people's workers) and, for rewinds, a repeatable GPU plate step (below).

Ideas not yet placed: place names laid down in layers; crowd diseases and the meeting of long-parted worlds (Miasma's SEIR); ruins the planet buries and subducts; a census; one cohort's life at the slow dial; an ancestry traced back by the coalescent; a Histomap of polities; the Silurian epilogue (the planet run on after the ending); a second rise on a planet whose coal is spent; worlds unlike this one (spin, tilt, no Moon, tidal locking).

## Open in the people's model

- **States**: Turchin's secular cycles (hunger lowering cohesion) aren't in; no state rules overseas until 2b's first landing, since a state's power comes only from its own people near a place; the largest city at takeoff is ~170 million, since capitals take a state's whole share; the Americas stay stateless longer than history's.
- **Earth**: Asia's paddies (wet rice beyond the floodplains) are missing; the model's Chukotka keeps half a steppe's pasture, so Eurasia's animals reach Alaska early and Africa gains as much from its animals as Eurasia; the Americas and Australia fill by diffusion, not by industry-era ships (the ships' flux runs down crowding, and without epidemics the Americas are never emptied to draw it); India holds ~3% of the people and China ~7%, under the climate's weak monsoon.
- **Food and ages**: births don't read the pyramid, so a baby bust doesn't echo in births a generation on; winter fodder, the animals' own climates and the horse's reach; the lean month isn't drawn; granaries as works should set the store by place.
- **Routes and cities**: the routes' kernel isn't reread as the winds shift between rebuilds; the routes' paths don't follow the works; the largest cities reach ~70–150 million by takeoff against today's ~30–40.
- **Works**: the land's works stop with industry instead of becoming its capital; canals water several times the pre-industrial world's land; drainage and salt-tolerant crops.
- **The pause**: what a paused world does in space, and whether a pause can lapse.
- **Late runs**: the robot fleet swings for decades after the dial; capital's weight (K/Y ~2.3 against Earth's 3–4); a runaway's end (carbonates baked into a CO₂ atmosphere); the swarm's pace past the belt; surveys across seeds (how often a world tips, farming's origins, the follow dial's length).

## Open in the planet

- **Eastern North America**: its year ~5 K warm and its rain under half Earth's. The gyres' boundary current runs up the coast with no cold Labrador Current inshore, and the template's zonal pressure has no continental winter trough.
- **Clouds**: deep convection's longwave is about half Earth's; deserts are too cloudy; eastern China's shortwave is short; the Pacific's cold tongue is 2.7 K warm; the polar clear sky's OLR is high.
- **Rain**: the deep tropics are wet (Southeast Asia nearly twice Earth's), the Sahel twice Earth's, India's monsoon short by two fifths, and eastern Africa two and a half times Earth's (the template's easterlies bring the Indian Ocean's water onshore where Earth's low-level flow runs along the coast). Forests evaporate as grass does, since the ground's evaporation reads the bucket's β alone; the cover's β and interception in the ground's year would fix that. The Caspian fills to its spill.
- **Ice that keeps orbital time**: the sheets barely answer the orbit, because the lowlands at 55–70° are too warm and dry in summer. Levers: moisture reaching high latitudes, refreezing in the degree-day scheme, the snow–albedo and tundra feedbacks. Run `tools/iceage-survey.mjs earth` to tell geography from model.
- **Plates on Earth**: Indo-Australia slows from 7 to ~4 cm/yr within 10 Myr, so the Himalayan front closes at ~1 cm/yr against Earth's ~4; Africa runs 32° and North America 55° off Müller's directions, because the mantle's flow is a potential flow with no toroidal part. True polar wander would follow from the same density, but every layer takes the spin axis as the grid's z.
- **The sea falls on today's Earth**, ~20 m in 2 Myr, as the opening's thick oceanic crust is replaced and West Antarctica's ice moves onto northern land; the Gulf drains with it.
- **Foreland basins**: a collision's stacking stands on local isostasy, so there is no foreland basin. One way: lay the stacking's load, smoothed along the front, on the incoming plate's cells ahead of it. The flexure's 2 km cap can then be retested.
- **Deltas**: three quarters of the eroded rock stops in closed depressions on land, and the load spreads over thousands of mouths; then delta plains, then drawn deltas.
- **Repeatability**: the GPU plate step isn't repeatable run to run (a reduction's order or a race), so a seed's page run can't be replayed.
- **Speed**: the dial's top at 10 Myr/s at level 7 (~3.5 now) and a climate cycle under ~100 ms (~400 now). The plate step is latency-bound (~4 GPU round trips a 0.5 Myr step, each followed by the CPU's sea solve); the climate's per-cell physics (dust, clouds, the template) is ~150 ms of a cycle and the ground's year ~70.
- **Earth at past dates** (`?seed=earth-66`): snapshots baked like today's, each with its CO₂, sunlight, day and Moon, from the PaleoDEMs (Scotese and Wright 2018) in PALEOMAP's frame.
- **Not built**: the Storm track, Spin, Tilt and Supercontinent experiments; floodplain lakes; an Equal Earth view; moving sea ice (dropped once: at 220 km its drift didn't move the ice edge).

## Open questions

- Does the weather–climate seam hold up at every dial?
- Does the rule-based supercontinent cycle actually cycle?
- Can nine layers stay show-don't-tell on one globe?
- How far do seeded planets drift as Earth's tuning moves?
