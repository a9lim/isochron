# Today's Earth: data, bake and check

`?seed=earth` opens on today's Earth (`src/engine/earth.js`), from data put on the sim's level-7 grid here. The outputs are committed (`earth/earth.json`, `earth/earth-7.bin.gz`, `src/engine/gpts.js`, and `EARTH_CYCLES` in `src/engine/orbit.js`), so the site and the engine need none of this; it's here to remake them.

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

## Bake

The Python runs in throwaway uv environments (`uv run --with`), so nothing is installed in the shared venv:

```bash
node tools/earth/cells.mjs 7
uv run --no-project --with numpy --with scipy --with h5py --with pygplates python -I tools/earth/bake.py
uv run --no-project --with numpy --with scipy python -I tools/earth/orbit-fit.py          # prints EARTH_CYCLES for orbit.js
uv run --no-project --with pmagpy --with pygplates python -I tools/earth/gpts.py          # writes src/engine/gpts.js
node --test tests/earth.test.mjs
```

## Score and tune

```bash
node tools/earth/cells.mjs 6
uv run --no-project --with numpy --with scipy --with h5py python -I tools/earth/obs.py 6   # the observations on level 6
node tools/earth/climate-score.mjs        # the climate against them (JSON=1: one summary line)
node tools/earth/tune.mjs spec.json 12 reg   # a parallel pattern search (spec format in its header)
node tools/earth/plates-score.mjs         # the plates' balance against Müller's motions, and their drift over 20 Myr
node tools/earth/crust-table.mjs 6        # Earth's continental crust by distance from the ocean, for genesis.js
node tools/earth/cells.mjs 4 && uv run --no-project --with numpy --with scipy --with pygplates python -I tools/earth/slabs.py   # the mantle's slabs (earth/slabs.json, slabs-4.bin.gz)
```

The scores these print are the calibration targets in `docs/MODEL.md`. Run `crust-table.mjs` again after a change to the crust fit or the isostasy, since seeded planets' continents are stood on its table.
