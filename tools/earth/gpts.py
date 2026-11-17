# /// script
# requires-python = ">=3.11"
# dependencies = ["pmagpy", "pygplates"]
# ///
"""Earth's geomagnetic reversals for `?seed=earth`'s stripes: writes src/engine/gpts.js.

    uv run --no-project --with pmagpy --with pygplates python -I tools/earth/gpts.py

GTS2012 (Ogg 2012), the timescale Seton et al. 2020's ages are on: its chron boundaries from today to
the end of the Cretaceous Normal Superchron (83.64 Ma) as PmagPy tabulates them (pmag.get_ts('gts12'),
BSD-3), and the superchron's start from the M0 isochrons in EarthByte's GTS2012 isochrons (the age most
of them carry; tools/earth/README.md).
"""
import collections
import pathlib
import re

import pmagpy.pmag as pmag
import pygplates

HERE = pathlib.Path(__file__).resolve().parent
ts, _ = pmag.get_ts('gts12')
bounds = sorted(float(t) for t in ts if t > 0)
fc = pygplates.FeatureCollection(str(HERE / '.cache' / 'isochrons' / 'GTS2012.gpml'))
m0 = collections.Counter()
for f in fc:
    name = f.get_name() or ''
    if re.search(r'\bM0\b', name):
        m0[round(f.get_valid_time()[0], 3)] += 1
cns = m0.most_common(1)[0][0]
assert cns > bounds[-1], (cns, bounds[-1])
assert len(bounds) % 2 == 0, 'today must be normal: an even count of reversals since the superchron'
out = HERE.parent.parent / 'src' / 'engine' / 'gpts.js'
rows = [', '.join(f'{b:g}' for b in bounds[k:k + 12]) for k in range(0, len(bounds), 12)]
out.write_text(f"""// Earth's geomagnetic reversals (GTS2012, Ogg 2012), for today's Earth's seafloor stripes
// (src/engine/polarity.js, src/engine/earth.js). Written by tools/earth/gpts.py: the chron boundaries
// from today to the Cretaceous Normal Superchron's end as PmagPy tabulates them, and the superchron's
// start from EarthByte's GTS2012 M0 isochrons. Ages in Ma; the field is normal today and through
// the superchron.
export const GTS2012 = [
  {(',\n  '.join(rows))},
];
export const CNS_START = {cns:g};
""")
print(f'{len(bounds)} reversals to {bounds[-1]} Ma, the superchron from {cns} Ma ({m0[cns]} of {sum(m0.values())} M0 isochrons) → {out}')
