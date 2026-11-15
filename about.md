---
name: Isochron
title: Isochron — Planet Simulator
description: Run an Earth-like planet from plate tectonics to weather on one globe: seafloor that spreads and sinks, rivers that wear down mountains, ice ages paced by the orbit, a carbon thermostat, ocean gyres, tides that slow its spin, and weather fronts.
updated: 2026-11-15
---

# Isochron

Isochron is an Earth-like planet on one globe. Plate tectonics shapes it, rivers wear it down, and its climate follows from the geography. A logarithmic dial runs the planet from a year a second to ten million years a second.

## Plates

The surface is divided into rigid plates, each turning about its own Euler pole. Where plates part, new oceanic crust forms at the ridge. Where they close, the denser crust sinks: ocean under continent, old ocean under young. Where two continents meet, the crust thickens and the plates eventually weld. Plates are driven by the pull of their sinking slabs and the push of their cooling seafloor, against drag on their bases, and continents drag harder. Seafloor that grows old at a margin begins to sink there, and large plates split along old sutures.

## The seafloor

New crust records the direction of the planet's magnetic field as it cools, and the field reverses at random intervals, so the seafloor carries a symmetric record of stripes on either side of each ridge. The stripes' width is the spreading rate times the length of each polarity interval. Seafloor deepens as it ages and cools: with the square root of its age at first, then levelling off.

## Sea level

Elevation comes from isostasy: thicker and lighter crust floats higher. Sea level is the level at which the ocean basins hold the planet's water, so young, shallow seafloor from fast spreading raises the sea, and thick ice would lower it.

## The landscape

Rivers drain the land toward the sea, filling closed basins into lakes. A river cuts its bed at a rate that grows with its discharge and its slope, so mountains wear down from their rivers inward. Rock removed from the top of the crust lowers the surface only by a fraction of its thickness, because the lighter crust rebounds on the mantle beneath, which is why old mountain belts outlast their erosion. The sediment fills lakes and builds continental shelves at the coast, and enough of it turns ocean crust into continent. Thick crust under a mountain belt also spreads under its own weight. Over hundreds of millions of years the ocean's volume itself drifts so the continents keep their height above the sea; the planet's water is exchanged with the mantle at ridges and trenches, and how Earth's freeboard has stayed constant is still debated.

## Climate

Temperature comes from an energy balance: sunlight absorbed, less heat radiated to space, plus heat carried from warm latitudes to cold ones. Radiated heat falls as carbon dioxide rises, logarithmically. The ocean's surface layer stores heat through the year, and land stores little, so continental interiors have wide seasons and coasts mild ones, and the seasons lag the sun more at sea. Snow and sea ice reflect sunlight, and the cold they keep makes more of them. Air is colder with height, so mountains carry snow.

Sunlight at each latitude follows from the planet's tilt, its orbit's eccentricity and where the planet is in that orbit at each solstice. The calendar is tied to the spring equinox.

The circulation follows a template rather than solving the atmosphere's equations. Rain gathers in a band (the intertropical convergence zone) that follows the warmest latitudes through the year. Dry air sinks in the subtropics at the edge of the Hadley cells, whose width grows with the equator-to-pole contrast and narrows as the planet spins faster. Westerlies blow at middle latitudes. Land hotter than its latitude draws in air in summer and pushes it out in winter, which makes monsoons. Surface winds turn from the pressure gradient toward the low by friction.

Water vapour evaporates from the sea, faster where it's warm and windy, and travels with the winds. Rain rises steeply with the air's humidity, so it falls where moist air converges, where it cools on its way poleward, and where it's lifted up a mountain's slope. The lee side of a range lies in its rain shadow. Land returns part of its rain to the air.

## Ice

Where snow outlasts the summer it builds into ice sheets, which flow outward under their own weight, faster where they are thick and steep. Snow falls where the month is below freezing at the ice's surface, and melts by how far and how long the days rise above it; a high ice sheet keeps itself cold, because the air is colder with height. Ice presses the crust down, and the crust rises again thousands of years after the ice melts. The water the ice holds is taken from the sea.

## The orbit

The planet's orbit changes in slow cycles: its eccentricity over about 100 and 400 thousand years, its tilt over about 41 thousand, and the season of its closest approach to the sun over about 22 thousand. Together they change how much sunlight summer brings to high latitudes, which decides whether winter snow survives. Running fast, the globe shows the climate of the average orbit; slowed to thousands of years a second, the cycles come through.

## Carbon

Volcanoes at ridges and above sinking slabs release carbon dioxide, and the weathering of rock on land takes it back into the sea floor's sediments. Weathering runs faster where it's warm and wet and where erosion keeps fresh rock exposed, so a warmer planet draws down its carbon dioxide and cools: a thermostat that works over hundreds of thousands of years. Faster plates outgas more and warm the planet; new mountains weather more and cool it. Living things take part too: plankton and plant debris buried with sediment at the coasts take carbon out of the air for good, and old organic carbon in rock gives it back when erosion exposes it.

## Plumes

Columns of hot mantle rise beneath the plates at fixed points. Each builds volcanic crust on whatever passes over it, leaving chains of seamounts and islands, oldest farthest away, and lifts the surface around itself. Every few tens of millions of years a new plume's head arrives: a flood of basalt across a region a thousand kilometres wide, a pulse of carbon dioxide, and, under a continent, the rift that splits it.

## Experiments

Each experiment starts from the opening planet and has one knob. Snowball turns down the sunlight: below a threshold the ice runs to the equator, and turning the sunlight back up doesn't thaw it until well past where it froze. Ice ages holds the carbon dioxide and lets the orbit drive the ice. High stand turns up the mantle's heat: faster plates make younger, shallower ocean floor, and the sea floods the continents. Thermostat turns up the volcanoes' outgassing and compares the carbon dioxide the planet settles at with the balance the weathering law predicts.

## The ocean

The winds drive the ocean's surface into great gyres. In the open ocean the water drifts toward the equator or the pole as the wind's twisting requires, and it returns in a narrow, fast current along each basin's western shore, so western boundary currents form in whatever basins the continents enclose. Warm water runs poleward on the west of each basin and cold water equatorward on the east, and where the wind pushes surface water off a coast, cold water wells up from below. Cold coasts evaporate little and rain little, which makes coastal deserts.

## Weather

Slowed to days a second, the weather runs live: two layers of air, each turning with the planet, whose difference is the temperature contrast between the equator and the poles. The contrast is unstable: it breaks into cyclones and anticyclones that carry heat poleward, and the storms stretch the surface temperature into fronts. Warm sea air carries moisture that rains out as it rises and cools; where dry air from a high desert meets moist air from a warm sea, a dry line forms. Faster than the weather can run, the chart blurs into the climate's mean pressure and rain, which is what weather averages to.

The planet runs, and is drawn with its weather, on cells about 55 km across (on phones and tablets the planet runs on cells twice that size, refined for drawing). The weather runs on the graphics card, a step every three minutes and twenty seconds; each step finds the air's flow from its spin by multigrid, solving on the grid and on coarser copies of it at once. The ice sheets and the climate's moisture also run on the graphics card, and the rest of the planet on a separate thread, so the globe stays smooth while the plates and the climate work. Before the opening, the planet runs 80 million years from rest, so its plates have settled into their own pace.

## Tides and the Moon

The Moon raises a bulge in the sea that the planet turns under twice a day. The ocean can't keep up with it: the tide runs round each basin as a wave, turning about points where the sea barely rises and falls (amphidromic points), and the basins' shapes and depths decide how high it climbs. Where a basin's own period of sloshing is near the tide's, it resonates and the range reaches ten metres or more. The tide is solved as the shallow-water equations on the rotating sphere, forced by the Moon and the Sun, and run until it repeats; it is re-solved as the continents move.

The tide loses its energy to friction on the shelves and to waves breaking inside the ocean over rough deep floor, and that energy comes out of the planet's spin. The day lengthens and the Moon, taking the spin's angular momentum, moves slowly away. How fast depends on the basins: as the plates rearrange them, the tide's resonances come and go, and the Moon's retreat speeds and slows. The planet starts with Earth's Moon at its present distance and Earth's day, and the day's length feeds back into the climate, the ocean's gyres and the weather through the turning that steers the winds and currents.

The Tides view is a co-tidal chart: the sea is tinted by the tide's range, lines join places with high water at the same hour (every lunar hour), converging on the amphidromic points, and stipple marks where the tide's energy is lost. Slowed to hours a second, the tint shows the sea's height now, and a heavier line marks high water, sweeping round each amphidromic point.

Behind the globe is the sky as a star chart. At the slowest settings it turns about the planet's axis once a day, and the Sun and the Moon appear where they are: the Sun moves along the ecliptic through the year, and the Moon goes round once a month, lit on the side facing the Sun, drawn larger when it is nearer. The tide's bulge sits under the Moon.

## Climate zones

The zones follow Köppen's classes, which are thresholds on monthly temperature and rainfall: tropical (A), arid (B), temperate (C), continental (D) and polar (E), with a second letter for when the dry season falls. Here each threshold is soft, standing for the variation from year to year, so each place holds a mixture of classes. The Climate view draws the mixture as a mosaic, so the boundary between two climates is a band where both appear.

## On the globe

Depth is shaded in blue and height in brown, with a contour every kilometre. The red is crust younger than a million years, at the ridge axes, and the volcanoes above sinking slabs. Plate boundaries follow the conventions of a tectonic map. Trenches have sawteeth on the plate that stays on top, with red marks for the volcanic arc on that side; where two continents collide and nothing sinks, the teeth are open, as on a thrust belt. Ridges are red. Transform faults carry paired half-arrows showing which way each side slides, and boundaries where the plates barely move are dotted. Land is coloured by its vegetation, from its climate: forest, savanna and steppe, desert, boreal forest and tundra, with bare rock toward the summits. Rivers are blue lines whose weight is their discharge. Slowed to a few years a second, rivers follow the seasons: snow held through the winter melts into spring floods, monsoon rivers swell in the wet season, and a river that runs dry is drawn as a dotted bed. Snow and sea ice are a light fill with a hard edge; sea ice follows the sea's own surface temperature, so warm currents keep water open poleward and cold ones carry ice toward the equator. Ground that stays frozen through the year, permafrost, carries a violet net of polygons, as ice wedges pattern the tundra: a whole net where it underlies all the ground, scattered polygons where only patches of it are frozen. The ground's mean temperature runs above the air's under deep snow, which insulates it from the winter, so permafrost reaches farther under thin snow than under thick. The net shows through the snow and stops at lakes and ice sheets.

In the Climate view each class is its group's colour in a pattern for its second letter: solid where it's wet all year, hatched one way or the other where the dry season falls in winter or in summer, cross-hatched for monsoon climates, stippled for deserts (densely) and steppes (sparsely), finely ruled for tundra, and bare for ice caps. The key lists each class with its share of the land.

The Weather view is a synoptic chart: isobars every 4 hPa, rain as stipple, cold fronts with triangles and warm fronts with semicircles pointing the way they move, occluded fronts (where a cold front has caught its warm front) with both on one side, troughs dashed, ridges as zigzags, shear lines dash-dotted, dry lines with scallops toward the moist air, and the highs and lows. It can also show the surface temperature, with isotherms every 5 °C, or the air's humidity. In the Climate view the sea carries isotherms of its surface temperature and the gyres' streamlines.

Ice sheets are outlined, with contours of their surface every 500 metres; the ice flows across the contours, downhill. Hotspots are red rings, and a province erupting is a red stippled disc.

The margin's figures are drawn from the same state: the planet's record of temperature, carbon dioxide, sea level, ice, land and ridge activity on a time axis that follows the dial; the orbit's cycles and the July sunlight at 65°N; temperature and rainfall by latitude, with the year's range of temperature, the band the rain belt sweeps through the year and the edges of the Hadley cells; the share of the surface at each height and depth; and the record of the field's reversals.

The key at the globe's corner names each view's symbols, and the patterns are fixed to the globe, growing and shrinking with the zoom. Below a few years a second the globe shows the season, and the caption names the month. Drag to turn the globe, scroll to zoom, and set the rate with the dial.
