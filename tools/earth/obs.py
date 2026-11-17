# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "scipy", "h5py"]
# ///
"""Earth's observed climate on the sim's grid, the target tools/earth/climate-score.mjs scores today's
Earth against: monthly means per cell, written to tools/earth/.cache/obs-L.f32 (+ .json).

    node tools/earth/cells.mjs 6
    uv run --no-project --with numpy --with scipy --with h5py python -I tools/earth/obs.py 6

Fields, each n × 12 float32 (NaN where a source has nothing):
  tland   °C      surface air over land (University of Delaware v5.01, 0.5°, 1981–2010)
  pland   mm/mo   precipitation over land (the same)
  landw   0–1     the share of the cell those cover (land)
  sst     °C      the sea's surface (NOAA OISST v2, 1°, 1991–2020)
  icec    0–1     sea ice concentration (the same)
  pall    mm/mo   precipitation everywhere (GPCP v2.3, 2.5°, 1991–2020)
"""
import json
import pathlib
import sys

import h5py
import numpy as np
from scipy.io import netcdf_file
from scipy.spatial import cKDTree

LEVEL = int(sys.argv[1]) if len(sys.argv) > 1 else 6
HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / '.cache'
OBS = CACHE / 'obs'
cells = np.fromfile(CACHE / f'cells-{LEVEL}.f64', dtype='<f8').reshape(-1, 3)
n = len(cells)
tree = cKDTree(cells)
DAYS = np.array([31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])


def xyz(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)


def read(path, name):
    """(lat, lon, data[12, lat, lon]) as float64, NaN for missing, from netCDF 3 or 4."""
    raw = open(path, 'rb').read(4)
    if raw[:3] == b'CDF':
        f = netcdf_file(path, 'r', mmap=False)
        v = f.variables[name]
        z = v[:].astype(np.float64)
        att = v._attributes
        lat, lon = f.variables['lat'][:].astype(float), f.variables['lon'][:].astype(float)
    else:
        f = h5py.File(path, 'r')
        v = f[name]
        z = v[:].astype(np.float64)
        att = {k: v.attrs[k] for k in v.attrs}
        lat, lon = f['lat'][:].astype(float), f['lon'][:].astype(float)
    for key in ('missing_value', '_FillValue'):
        if key in att:
            mv = np.asarray(att[key]).ravel()[0]
            z[np.isclose(z, mv) | (np.abs(z) > 1e20)] = np.nan
    if 'scale_factor' in att:
        z = z * float(np.asarray(att['scale_factor']).ravel()[0])
    if 'add_offset' in att:
        z = z + float(np.asarray(att['add_offset']).ravel()[0])
    units = att.get('units', b'')
    units = units.decode() if isinstance(units, bytes) else str(units)
    return lat, lon, z, units


def bin_monthly(lat, lon, z):
    """Area-weighted means per cell per month over the points with data, and the share with data."""
    LA, LO = np.meshgrid(lat, lon, indexing='ij')
    _, idx = tree.query(xyz(LA, LO).reshape(-1, 3), workers=-1)
    w = np.cos(np.radians(LA)).ravel()
    total = np.bincount(idx, w, n)
    out = np.full((n, 12), np.nan)
    share = np.zeros(n)
    for m in range(12):
        v = z[m].ravel()
        ok = np.isfinite(v)
        s = np.bincount(idx[ok], w[ok], n)
        a = np.bincount(idx[ok], w[ok] * v[ok], n)
        out[:, m] = np.where(s > 0, a / np.maximum(s, 1e-30), np.nan)
        if m == 0:
            share = np.where(total > 0, s / np.maximum(total, 1e-30), 0)
    # Cells too small to hold a point take their nearest cell's (coarse sources).
    miss = ~np.isfinite(out[:, 0]) & (total == 0)
    if miss.any():
        have = np.flatnonzero(total > 0)
        _, j = cKDTree(cells[have]).query(cells[miss])
        out[miss] = out[have[j]]
        share[miss] = share[have[j]]
    return out, share


fields = {}
lat, lon, z, u = read(OBS / 'udel-air.nc', 'air')
print('UDel air', z.shape, u)
fields['tland'], landw = bin_monthly(lat, lon, z)
lat, lon, z, u = read(OBS / 'udel-precip.nc', 'precip')
print('UDel precip', z.shape, u)
pl, _ = bin_monthly(lat, lon, z)
fields['pland'] = pl * (10 if u.startswith('cm') else 1)   # cm → mm per month
fields['landw'] = np.repeat(landw[:, None], 12, 1)
lat, lon, z, u = read(OBS / 'oisst-sst.nc', 'sst')
print('OISST sst', z.shape, u)
fields['sst'], _ = bin_monthly(lat, lon, z)
lat, lon, z, u = read(OBS / 'oisst-icec.nc', 'icec')
print('OISST icec', z.shape, u)
ic, _ = bin_monthly(lat, lon, z)
fields['icec'] = ic / (100 if np.nanmax(ic) > 1.5 else 1)
lat, lon, z, u = read(OBS / 'gpcp-precip.nc', 'precip')
print('GPCP precip', z.shape, u)
pa, _ = bin_monthly(lat, lon, z)
fields['pall'] = pa * DAYS[None, :]   # mm/day → mm per month

names = list(fields)
arr = np.stack([fields[k].astype(np.float32) for k in names])   # (field, n, 12)
arr.tofile(CACHE / f'obs-{LEVEL}.f32')
(CACHE / f'obs-{LEVEL}.json').write_text(json.dumps({'level': LEVEL, 'n': n, 'fields': names}))
land = landw > 0.5
print(f'land cells {land.sum()}; land T annual mean {np.nanmean(fields["tland"][land]):.1f} °C; land P {np.nanmean(fields["pland"][land].sum(1)):.0f} mm/yr; '
      f'GPCP global {np.nanmean(fields["pall"].sum(1)):.0f} mm/yr (unweighted cells ≈ area-weighted on this grid)')
