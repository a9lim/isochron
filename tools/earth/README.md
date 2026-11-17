# Today's Earth: the bake

`?seed=earth` opens on today's Earth (`src/engine/earth.js`), from data put on the sim's level-7 grid here. The outputs are committed (`earth/earth.json`, `earth/earth-7.bin`, `src/engine/gpts.js`, and `EARTH_CYCLES` in `src/engine/orbit.js`), so the site and the engine need none of this; it's here to remake them.

## Fetch

Everything goes under `tools/earth/.cache/` (ignored), one directory per source:

| Directory | File | From | Terms |
|---|---|---|---|
| `etopo/` | `bed.nc`, `surface.nc` | ETOPO 2022, 60″, bedrock and ice surface: `https://www.ngdc.noaa.gov/thredds/fileServer/global/ETOPO2022/60s/60s_{bed,surface}_elev_netcdf/ETOPO_2022_v1_60s_N90W180_{bed,surface}.nc` (~480 MB each) | NOAA, public domain |
| `agegrid/` | `age.2020.1.GTS2012.6m.nc` | Seton et al. 2020: `https://www.earthbyte.org/webdav/ftp/earthbyte/agegrid/2020/Grids/` | CC BY 4.0 |
| `muller2019/` | `model.zip`, unzipped to `model/` | Müller et al. 2019, `Muller_etal_2019_PlateMotionModel_v2.0_Tectonics_Updated.zip`: `https://www.earthbyte.org/webdav/ftp/Data_Collections/Muller_etal_2019_Tectonics/Muller_etal_2019_PlateMotionModel/` | CC BY 4.0 |
| `hotspots/` | `Hotspots.zip`, unzipped to `x/` | Whittaker et al. 2015's compilation: `https://www.earthbyte.org/webdav/ftp/earthbyte/GPlates/GPlates2.3_GeoData/Individual/Hotspots.zip` | cite Whittaker et al. 2015 |
| `isochrons/` | `GTS2012.gpml` | EarthByte's GTS2012 isochrons: `https://www.earthbyte.org/webdav/ftp/earthbyte/agegrid/2020/FeatureData/Global_EarthByte_GTS2012_Isochrons_2019_v3.gpml` | CC BY 4.0 |
| `bl91/` | `orbit91` | Berger and Loutre 1991, NOAA's World Data Service for Paleoclimatology: `https://www.ncei.noaa.gov/pub/data/paleo/climate_forcing/orbital_variations/insolation/orbit91` | cite Berger and Loutre 1991 |
| `obs/` | `udel-air.nc`, `udel-precip.nc`, `oisst-sst.nc`, `oisst-icec.nc`, `gpcp-precip.nc` | NOAA PSL's long-term means: `https://downloads.psl.noaa.gov/Datasets/` + `udel.airt.precip/{air,precip}.mon.v501.ltm.1981-2010.nc`, `noaa.oisst.v2/{sst,icec}.ltm.1991-2020.nc`, `gpcp/precip.mon.ltm.1991-2020.nc` (~43 MB) | NOAA (UDel's: cite Willmott and Matsuura) |
| `ceres/` | `rsdt.nc`, `rsut.nc`, `rsutcs.nc`, `rlut.nc`, `rlutcs.nc` | CERES EBAF 4.2's monthly TOA fluxes, 03/2000–10/2023, through obs4MIPs (no account): `https://esgf-node.ornl.gov/thredds/fileServer/user_pub_work/obs4MIPs/NASA-LaRC/CERES-EBAF-4-2/mon/{v}/gn/v20240513/{v}_mon_CERES-EBAF-4-2_RSS_gn_200003-202310.nc` (~118 MB) | CC BY 4.0, NASA LaRC (cite Loeb and others 2018) |

NASA's own CERES order tool asks for an email address, and the Hamburg mirror for an account; the obs4MIPs copy on ESGF needs neither (found through the ORNL index's `esgf-1-5-bridge` search). Müller et al. 2022 is not used for today: its README advises against it for present-day absolute motions and points to the 2019 model, which is also the one the 2020 age grid is built on. IMCCE refuses automated fetches of La2004 (403), so the orbit is fitted to Berger and Loutre instead.

## Run

The Python runs in throwaway uv environments (`uv run --with`), so nothing is installed in the shared venv:

```bash
node tools/earth/cells.mjs 7
uv run --no-project --with numpy --with scipy --with h5py --with pygplates python -I tools/earth/bake.py
uv run --no-project --with numpy --with scipy python -I tools/earth/orbit-fit.py          # prints EARTH_CYCLES for orbit.js
uv run --no-project --with pmagpy --with pygplates python -I tools/earth/gpts.py          # writes src/engine/gpts.js
node --test tests/earth.test.mjs
```

- `cells.mjs` writes the grid's cell centres for the bake.
- `bake.py` puts each data point in its nearest cell (its Voronoi cell), weighted by area: the mean bedrock, the mean grounded ice (ice shelves are left as sea), the lowest land (the least 2′ block of the bed where the surface stands above sea level: where the cell's water runs, so a gorge narrower than a cell drains its basin; the sim carries its depth below the mean with the crust, `gz`), the share of the cell the age grid dates and its mean age, and each cell's plate (Müller et al. 2019's rigid plates, then its deforming networks for the cells those leave out: a network's own plate where that is a rigid one, else, cell by cell, the bordering rigid plate that moves most like it, so Sundaland rides the Sunda plate; else the nearest plate), with each plate's motion over the last Myr and ten hotspots. ~45 s. pygplates 1.0.0 segfaults on `resolve_topology_types=ResolveTopologyType.boundary`, so the bake resolves everything and filters by type.
- `orbit-fit.py` fits the sim's orbital form (`OrbitCycles`: sums of cosines and a steady precession) to the last 5 Myr: twelve terms of eccentricity (rms 0.0043) and ten of obliquity (0.05°), the present exact.
- `gpts.py` takes GTS2012's chron boundaries to 83.64 Ma from PmagPy (`pmag.get_ts('gts12')`, BSD-3) and the superchron's start from the M0 isochrons (125.93 Ma, 29 of 40).

## Scoring and tuning

```bash
node tools/earth/cells.mjs 6
uv run --no-project --with numpy --with scipy --with h5py python -I tools/earth/obs.py 6     # the observations on level 6
node tools/earth/climate-score.mjs                     # the climate against them (JSON=1: a summary line; VEGO, SEAO, AIRO: overrides)
node tools/earth/tune.mjs spec.json 12 temp            # a parallel pattern search over constants (see its header for spec.json)
node tools/earth/plates-score.mjs                      # the plates' balance against Müller's motions, and their drift over 20 Myr
```

- `obs.py` puts the observed monthly climatologies on the grid: land temperature and rain (University of Delaware v5.01, 0.5°, 1981–2010), the sea's surface temperature and ice (NOAA OISST v2, 1991–2020), rain everywhere (GPCP v2.3), and the top of the atmosphere (CERES EBAF 4.2, 1°, the mean year of 2001–2020: sunlight in, reflected all-sky and clear-sky, outgoing longwave all-sky and clear-sky).
- `climate-score.mjs` runs the climate on today's Earth as `climate-check.mjs` does (the cover, the lakes on their channels, the regolith, the gyres, the year; the ice sheets held), settled at level 6 (~15 s), and scores it over land by region (January, July and the year's temperature, the year's rain, the Köppen groups), the sea's surface and its ice by latitude and in eight seas (the North Atlantic, the Labrador and Nordic Seas, the Barents, the North Pacific, the Bering and Okhotsk, the Southern Ocean, the South Atlantic), and the Köppen classes: the observations are classified with the sim's own thresholds (hard), so the comparison is like with like. It prints the sea's heat transport too (the overturning's strength, the channels' Ekman transport, and the heat the water carries north across seven latitudes) and the air's (its depth and the year's rotational wind), and the top of the atmosphere against CERES: the sunlight reflected and the outgoing longwave, clear and all-sky, per cell through the year at the energy balance's 24 samples, as global means, rms by cell and by 10° zone, the clouds' forcing (clear less all-sky) and by region.
- `tune.mjs` tries each parameter a step up and down in parallel (16 processes), takes the best and every improving move together, and halves the steps when nothing improves; its objective weighs land temperature (year, January, July), the sea's surface by latitude and (at half) in the eight seas, its ice, the Köppen groups and, with `all`, the rain and the classes, or with `rad` the classes and the top of the atmosphere (reflected and outgoing by cell and by zone, clear-sky reflected and outgoing by zone, and the clouds' forcing, 10 W/m² by cell or 5 by zone weighing about as a kelvin of land's year). Parameters are `CLIMATE.`, `VEG.`, `SEAHEAT.`, `AIRHEAT.` or `CLOUDS.` keys. The tuned values are in `src/engine/climate.js`'s CLIMATE (marked "Earth"), SEAHEAT, AIRHEAT, CLOUDS and VEG.PLANETARY. The tuner edits nothing, but it spawns `climate-score.mjs` fresh for each try, so it reads the source as it stands: run it on a copy of `src/`, `earth/` and `tools/earth/` (with `.cache` linked) when editing alongside.
