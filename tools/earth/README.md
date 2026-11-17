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

Müller et al. 2022 is not used for today: its README advises against it for present-day absolute motions and points to the 2019 model, which is also the one the 2020 age grid is built on. IMCCE refuses automated fetches of La2004 (403), so the orbit is fitted to Berger and Loutre instead.

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
- `bake.py` puts each data point in its nearest cell (its Voronoi cell), weighted by area: the mean bedrock, the mean grounded ice (ice shelves are left as sea), the share of the cell the age grid dates and its mean age, and each cell's plate (Müller et al. 2019's rigid plates, then its deforming networks for the cells those leave out, else the nearest plate), with each plate's motion over the last Myr and ten hotspots. ~45 s. pygplates 1.0.0 segfaults on `resolve_topology_types=ResolveTopologyType.boundary`, so the bake resolves everything and filters by type.
- `orbit-fit.py` fits the sim's orbital form (`OrbitCycles`: sums of cosines and a steady precession) to the last 5 Myr: twelve terms of eccentricity (rms 0.0043) and ten of obliquity (0.05°), the present exact.
- `gpts.py` takes GTS2012's chron boundaries to 83.64 Ma from PmagPy (`pmag.get_ts('gts12')`, BSD-3) and the superchron's start from the M0 isochrons (125.93 Ma, 29 of 40).
