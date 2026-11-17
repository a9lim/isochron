# Today's Earth: data, bake and scoring

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

Why these: Müller et al. 2019 rather than 2022, because 2022's README advises against it for present-day absolute motions and the 2020 age grid is built on 2019; Berger and Loutre for the orbit because IMCCE refuses automated fetches of La2004; CERES through obs4MIPs because NASA's order tool asks for an email address and needs no account there.

## Bake

The Python runs in throwaway uv environments (`uv run --with`), so nothing is installed in the shared venv:

```bash
node tools/earth/cells.mjs 7
uv run --no-project --with numpy --with scipy --with h5py --with pygplates python -I tools/earth/bake.py
uv run --no-project --with numpy --with scipy python -I tools/earth/orbit-fit.py          # prints EARTH_CYCLES for orbit.js
uv run --no-project --with pmagpy --with pygplates python -I tools/earth/gpts.py          # writes src/engine/gpts.js
node --test tests/earth.test.mjs
```

- `cells.mjs` writes the grid's cell centres.
- `bake.py` puts each data point in its nearest cell, weighted by area: the mean bedrock, the mean grounded ice (shelves left as sea), the lowest land (the least 2′ block of bed where the surface stands above sea level: `gz`), the sea's reach (the least level at which a cell's 60″ pixels join the open ocean, from connected components of the ground below each level every 5 m from −600 to +200 m, the ground the bed or the grounded ice's surface: `gs`, ~1.5 min), the dated share and its mean age, and each cell's plate (rigid plates, then the deforming networks cell by cell to the bordering rigid plate that moves most like the network, else the nearest), with each plate's motion over the last Myr and ten hotspots. ~45 s. pygplates 1.0.0 segfaults on `resolve_topology_types=ResolveTopologyType.boundary`, so the bake resolves everything and filters by type.
- `orbit-fit.py` fits the sim's orbital form (`OrbitCycles`) to the last 5 Myr: twelve terms of eccentricity, ten of obliquity, the present exact.
- `gpts.py` takes GTS2012's chron boundaries to 83.64 Ma from PmagPy (`pmag.get_ts('gts12')`, BSD-3) and the superchron's start from the M0 isochrons (125.93 Ma).

## Score and tune

```bash
node tools/earth/cells.mjs 6
uv run --no-project --with numpy --with scipy --with h5py python -I tools/earth/obs.py 6   # the observations on level 6
node tools/earth/climate-score.mjs        # the climate against them (JSON=1: one summary line)
node tools/earth/tune.mjs spec.json 12 rad   # a parallel pattern search (spec format in its header)
node tools/earth/plates-score.mjs         # the plates' balance against Müller's motions, and their drift over 20 Myr
```

- `obs.py` puts the monthly climatologies on the grid: land temperature and rain (UDel v5.01, 1981–2010), the sea's surface and ice (OISST v2, 1991–2020), rain everywhere (GPCP v2.3), and the top of the atmosphere (CERES EBAF 4.2's mean year of 2001–2020: sunlight in, reflected and outgoing longwave, all-sky and clear-sky).
- `climate-score.mjs` runs the climate on today's Earth as `tools/climate-check.mjs` does (the cover, the lakes on their channels, the regolith, the gyres, the year; the ice sheets held), settled at level 6 (~20 s). It scores land by region (January, July and the year's temperature, rain, Köppen groups), the sea's surface and ice by latitude and in eight seas, the Köppen classes (the observations classified by the sim's own thresholds), and the top of the atmosphere (reflected and outgoing, clear and all-sky, through the energy balance's 24 samples; by cell, by zone and by region, and the clouds' forcing). It prints the sea's and the air's heat transport too. Overrides: the first argument for CLIMATE, and the env vars `VEGO`, `SEAO`, `AIRO`, `CLOUDO` for VEG, SEAHEAT, AIRHEAT and CLOUDS.
- `tune.mjs` tries each parameter a step up and down in parallel (16 processes), takes the best and every improving move together, and halves the steps when nothing improves. Objectives: `temp` (land temperature, the sea's surface and ice, the Köppen groups), `all` (with rain and the classes), `rad` (with the classes and the top of the atmosphere; 10 W/m² rms by cell or 5 by zone weighs about as a kelvin of land's year). Parameters are `CLIMATE.`, `VEG.`, `SEAHEAT.`, `AIRHEAT.` or `CLOUDS.` keys. The tuner spawns `climate-score.mjs` fresh for each try, so run it on a copy of `src/`, `earth/` and `tools/earth/` (with `.cache` linked) when editing alongside.
