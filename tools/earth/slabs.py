# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "scipy", "pygplates"]
# ///
"""The slabs Müller et al. 2019's trenches have sent into the mantle over the last 200 Myr: for each 10 Myr
of the past, the plate area (km²) each trench point subducted, on the cell of the level-4 grid nearest
where the trench then stood (the model's absolute frame, the sim's mantle frame). src/engine/mantle.js
weights the bins by their age into today's slab graveyard (src/engine/mantle.js).

    node tools/earth/cells.mjs 4
    uv run --no-project --with numpy --with scipy --with pygplates python -I tools/earth/slabs.py

Writes earth/slabs.json and earth/slabs-4.bin.gz (Float32, bins × cells, gzipped). Snapshots every STEP Myr (each
standing for STEP Myr of subduction), boundary points every ~32 km, the convergence across each
subduction zone's segments (pygplates's plate boundary statistics; positive closing).
"""
import gzip
import json
import math
import sys
from pathlib import Path

import numpy as np
import pygplates
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
CACHE = HERE / '.cache'
OUT = HERE.parent.parent / 'earth'
T_MAX, BIN, STEP, LEVEL = 200, 10, 2, 4
R = 6371.0

cells = np.fromfile(CACHE / f'cells-{LEVEL}.f64').reshape(-1, 3)
n = len(cells)
tree = cKDTree(cells)
root = CACHE / 'muller2019' / 'model'
simp = next(root.glob('*/SimplifiedFiles'))
rm = pygplates.RotationModel(str(simp / 'Muller_etal_2019_CombinedRotations.rot'))
topo = pygplates.FeatureCollection(str(simp / 'Muller_etal_2019_PlateBoundaries_DeformingNetworks.gpmlz'))

bins = np.zeros((T_MAX // BIN, n), dtype=np.float64)
rates = []
for t in np.arange(STEP / 2, T_MAX, STEP):
    snap = pygplates.TopologicalSnapshot(topo, rm, float(t))
    stats = snap.calculate_plate_boundary_statistics(0.005, velocity_units=pygplates.VelocityUnits.cms_per_yr)
    pts, area = [], []
    for s in stats:
        if s.boundary_feature.get_feature_type() != pygplates.FeatureType.gpml_subduction_zone:
            continue
        v = s.convergence_velocity_orthogonal
        if not math.isfinite(v) or v <= 0:
            continue
        pts.append(s.boundary_point.to_xyz())
        area.append(v * 10 * s.boundary_length * R * STEP)   # cm/yr → km/Myr, × km of trench, × Myr
    if pts:
        _, idx = tree.query(np.array(pts))
        np.add.at(bins[int(t // BIN)], idx, np.array(area))
    rates.append((float(t), sum(area) / STEP))
    print(f'{t:6.1f} Ma: {len(pts)} trench points, {sum(area) / STEP / 1e6:.2f} M km² a Myr', file=sys.stderr)

OUT.mkdir(exist_ok=True)
with open(OUT / f'slabs-{LEVEL}.bin.gz', 'wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, compresslevel=9, mtime=0) as fh:   # no name or time in the header
    fh.write(bins.astype(np.float32).tobytes())
json.dump({
    'level': LEVEL, 'n': n, 'bin': BIN, 'bins': T_MAX // BIN, 'file': f'slabs-{LEVEL}.bin.gz',
    'source': 'Müller et al. 2019 (CC BY 4.0): subduction zones every %d Myr to %d Ma, km² subducted per cell' % (STEP, T_MAX),
    'rate': [[round(t, 1), round(a)] for t, a in rates],
}, open(OUT / 'slabs.json', 'w'), indent=0)
print(f'wrote {OUT / ("slabs-%d.bin.gz" % LEVEL)}', file=sys.stderr)
