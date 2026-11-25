# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "scipy", "h5py", "pygplates"]
# ///
"""Today's Earth on the sim's grid: the data `?seed=earth` opens on (src/engine/earth.js).

    node tools/earth/cells.mjs 7
    uv run --no-project --with numpy --with scipy --with h5py --with pygplates python -I tools/earth/bake.py

Reads tools/earth/.cache/ (ignored; where to fetch each file is in tools/earth/README.md) and writes
earth/earth.json and earth/earth-7.bin.gz. Each data point goes to its nearest cell centre (its Voronoi
cell) and is weighted by its area (cos latitude). Per cell, little-endian, n cells each:

  bed    int16   m     the mean bedrock (ETOPO 2022's bed: under the ice sheets, the rock)
  ice    uint16  m     the mean grounded ice (surface less bed where the ice stands above flotation;
                       ice shelves are sea, as the sim has none)
  low    int16   m     the lowest ground in the cell: the least 2′ block of the bed where the surface
                       stands above sea level (32767 where none does), where its water runs: a gorge
                       narrower than a cell (the Congo's, the Yangtze's) stands far below the cell's
                       mean, and a lake's floor (where ETOPO has its bathymetry) below its surface
  reach  int16   m     the level at which today's ocean floods into the cell: the least, over its 60″
                       pixels, of the level at which each joins the open ocean through ground below it
                       (the bed, or the grounded ice's surface), taken every 5 m from −600 m (the least)
                       to +200 m (32767 where it doesn't by then): a strait narrower than a cell
                       (Gibraltar's sill, −341 m at 60″) stands far below the cell's mean
  ocean  uint8   /255  the share of the cell with a seafloor age (Seton et al. 2020): its oceanic crust
  age    uint16  /100  Myr, the mean age over that share
  plate  uint8         an index into earth.json's plates (Müller et al. 2019's plates today: the rigid
                       plates, then the deforming networks for the cells they leave out)

Each plate's ω (rad/Myr, x y z) is its motion over the last Myr in the model's absolute frame;
earth.json also carries the ten hotspots (Whittaker et al. 2015's compilation).
"""
import gzip
import json
import pathlib
import time

import h5py
import numpy as np
import pygplates
from scipy import ndimage
from scipy.spatial import cKDTree

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / '.cache'
OUT = HERE.parent.parent / 'earth'
LEVEL = 7
RHO_I, RHO_W = 917.0, 1028.0


def xyz(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    c = np.cos(la)
    return np.stack([c * np.cos(lo), c * np.sin(lo), np.sin(la)], axis=-1)


def var(f, *names):
    for k in names:
        if k in f:
            return f[k]
    raise KeyError(f'none of {names} in {list(f)}')


cells = np.fromfile(CACHE / f'cells-{LEVEL}.f64', dtype='<f8').reshape(-1, 3)
n = len(cells)
tree = cKDTree(cells)
print(f'level {LEVEL}: {n} cells')


# ── ETOPO 2022, 60″: bed and ice, averaged 2 × 2 (2′, ~3.7 km) before they're assigned ──
REACH_LEVELS = np.arange(-600, 201, 5)   # m: the levels the sea's flood is taken at


def flood(zb, zs):
    """The level (m) at which today's ocean floods each 60″ pixel: the lowest level at which it joins
    the open ocean through pixels below that level (4-connected), the ground being the bed where
    there's no grounded ice and the ice's surface where there is. Taken at REACH_LEVELS, so a pixel
    the ocean reaches below the lowest level reads that level, and one it doesn't reach by the
    highest reads 32767. The open ocean is the body holding the deep Pacific (0°, 150° W)."""
    t0 = time.time()
    H = zb.shape[0]
    z = np.empty(zb.shape, np.int16)
    for r0 in range(0, H, 1200):
        b = zb[r0:r0 + 1200].astype(np.float64)
        s = zs[r0:r0 + 1200].astype(np.float64)
        thick = s - b
        grounded = (thick > 0.5) & ((b >= 0) | (thick >= -b * RHO_W / RHO_I))
        z[r0:r0 + 1200] = np.clip(np.round(np.where(grounded, s, b)), -32768, 32767)
    seed = (H // 2, zb.shape[1] * 30 // 360)
    out = np.full(zb.shape, 32767, np.int16)
    for L in REACH_LEVELS:
        lab, _ = ndimage.label(z < L)
        k = lab[seed]
        assert k > 0, f'the seed is dry at {L} m'
        out[(lab == k) & (out == 32767)] = L
        print(f'  the sea\'s flood at {L:5d} m ({time.time() - t0:.0f} s)', end='\r', flush=True)
    print()
    return out


def etopo():
    t0 = time.time()
    fb = h5py.File(CACHE / 'etopo' / 'bed.nc', 'r')
    fs = h5py.File(CACHE / 'etopo' / 'surface.nc', 'r')
    lat, lon = var(fb, 'lat', 'y')[:], var(fb, 'lon', 'x')[:]
    zb, zs = var(fb, 'z'), var(fs, 'z')
    assert zb.shape == (len(lat), len(lon)) and zs.shape == zb.shape, (zb.shape, zs.shape)
    reach = flood(zb, zs)
    W, B, I, L = (np.zeros(n) for _ in range(4))
    LOW, REACH = np.full(n, np.inf), np.full(n, 32767.0)
    other = 0
    nr = len(lat) - len(lat) % 2
    step = 600
    lon2 = lon[: len(lon) // 2 * 2].reshape(-1, 2).mean(1)
    for r0 in range(0, nr, step):
        r1 = min(nr, r0 + step)
        b = zb[r0:r1, : len(lon2) * 2].astype(np.float64)
        s = zs[r0:r1, : len(lon2) * 2].astype(np.float64)
        thick = s - b
        on = thick > 0.5
        # Grounded where the ice is thicker than the water it displaces would float.
        grounded = on & ((b >= 0) | (thick >= -b * RHO_W / RHO_I))
        la = lat[r0:r1]
        other += int(np.count_nonzero(on[np.abs(la) < 59]))
        ice = np.where(grounded, thick, 0.0)
        blk = lambda a: a.reshape(a.shape[0] // 2, 2, -1, 2).mean(axis=(1, 3))
        bb, ii, ll = blk(b), blk(ice), blk((b > 0).astype(np.float64))
        la2 = la.reshape(-1, 2).mean(1)
        LA, LO = np.meshgrid(la2, lon2, indexing='ij')
        _, idx = tree.query(xyz(LA, LO).reshape(-1, 3), workers=-1)
        w = np.cos(np.radians(LA)).ravel()
        W += np.bincount(idx, w, n); B += np.bincount(idx, w * bb.ravel(), n)
        I += np.bincount(idx, w * ii.ravel(), n); L += np.bincount(idx, w * ll.ravel(), n)
        ss, bl = blk(s).ravel(), bb.ravel()
        land = ss > 0
        np.minimum.at(LOW, idx[land], bl[land])
        rr = reach[r0:r1, : len(lon2) * 2]
        np.minimum.at(REACH, idx, rr.reshape(rr.shape[0] // 2, 2, -1, 2).min(axis=(1, 3)).ravel().astype(np.float64))
        print(f'  etopo rows {r0}–{r1} of {nr} ({time.time() - t0:.0f} s)', end='\r', flush=True)
    print()
    if other:
        print(f'  note: {other} pixels equatorward of 59° where the surface stands above the bed (not ice sheets)')
    return B / W, I / W, L / W, W, LOW, REACH


# ── Seton et al. 2020: the seafloor's age, 6′, gridline-registered. What it leaves blank is
# continental crust, and also some deep floor it can't date (forearcs, the Canada Basin, the
# eastern Mediterranean, the Japan Sea): src/engine/earth.js decides those by their depth ──
def ages():
    f = h5py.File(CACHE / 'agegrid' / 'age.2020.1.GTS2012.6m.nc', 'r')
    lat, lon = var(f, 'lat', 'y')[:], var(f, 'lon', 'x')[:]
    z = var(f, 'z')[:].astype(np.float64)
    fill = var(f, 'z').attrs.get('_FillValue')
    if fill is not None:
        z[z == np.asarray(fill).ravel()[0]] = np.nan
    if np.isclose(lon[-1] - lon[0], 360):
        lon, z = lon[:-1], z[:, :-1]
    z[~(z >= 0)] = np.nan
    LA, LO = np.meshgrid(lat, lon, indexing='ij')
    _, idx = tree.query(xyz(LA, LO).reshape(-1, 3), workers=-1)
    w = np.cos(np.radians(LA)).ravel()
    zz = z.ravel()
    ok = np.isfinite(zz)
    Wa = np.bincount(idx, w, n)
    Wo = np.bincount(idx[ok], w[ok], n)
    Ao = np.bincount(idx[ok], w[ok] * zz[ok], n)
    share = np.where(Wa > 0, Wo / np.maximum(Wa, 1e-30), 0)
    age = np.where(Wo > 0, Ao / np.maximum(Wo, 1e-30), 0)
    print(f'  ages: {ok.mean():.1%} of points dated, oldest {np.nanmax(zz):.1f} Myr')
    return share, age


# ── Müller et al. 2019: the plates today, and each one's motion over the last Myr ──
def plates():
    root = CACHE / 'muller2019' / 'model'
    simp = next(root.glob('*/SimplifiedFiles'))
    rm = pygplates.RotationModel(str(simp / 'Muller_etal_2019_CombinedRotations.rot'))
    topo = pygplates.FeatureCollection(str(simp / 'Muller_etal_2019_PlateBoundaries_DeformingNetworks.gpmlz'))
    resolved = []
    # The rigid plates first, then the deforming networks (the western interior of North America,
    # the Andes, Tibet: the plates' polygons leave them out) for the cells no plate holds. Filtered
    # here: pygplates 1.0.0 segfaults on resolve_topology_types=ResolveTopologyType.boundary.
    pygplates.resolve_topologies(topo, rm, resolved, 0.0)
    rigid = [r for r in resolved if isinstance(r, pygplates.ResolvedTopologicalBoundary)]
    nets = [r for r in resolved if isinstance(r, pygplates.ResolvedTopologicalNetwork)]
    pid = np.full(n, -1, dtype=np.int64)
    names = {}
    lat = np.degrees(np.arcsin(np.clip(cells[:, 2], -1, 1)))
    lon = np.degrees(np.arctan2(cells[:, 1], cells[:, 0]))
    part = pygplates.PlatePartitioner(rigid, rm)
    for i in range(n):
        rt = part.partition_point(pygplates.PointOnSphere(float(lat[i]), float(lon[i])))
        if rt is not None:
            f = rt.get_feature()
            p = f.get_reconstruction_plate_id()
            pid[i] = p
            names.setdefault(p, f.get_name())
    gaps = np.count_nonzero(pid < 0)
    # A network's cells go to its plate when that is one of the rigid plates. A network with a plate of
    # its own (Southeast Asia's, East China's: plates the rigid ones don't have) goes, cell by cell, to
    # whichever of the rigid plates bordering it moves most like it there, so Sundaland rides Eurasia
    # (within ~0.3 cm/yr of it) rather than whatever polygon happens to be nearest (Australia, across
    # the Java trench); compared with every plate, a distant one's motion can match by chance.
    part = pygplates.PlatePartitioner(nets, rm)
    omega = {}
    def w_of(p):
        if p not in omega:
            fr = rm.get_rotation(0.0, int(p), 1.0)
            pole, ang = fr.get_euler_pole_and_angle() if not fr.represents_identity_rotation() else (None, 0.0)
            omega[p] = np.array(pole.to_xyz()) * ang if pole is not None else np.zeros(3)
        return omega[p]
    net = {}
    for i in np.flatnonzero(pid < 0):
        rt = part.partition_point(pygplates.PointOnSphere(float(lat[i]), float(lon[i])))
        if rt is None:
            continue
        q = rt.get_feature().get_reconstruction_plate_id()
        if q in names:
            pid[i] = q
        else:
            net.setdefault(q, []).append(i)
    rigid_cells = np.flatnonzero(pid >= 0)
    near = cKDTree(cells[rigid_cells])
    spacing = 2.5 * np.sqrt(4 * np.pi / n)   # a cell and a half past the network's edge
    own = 0
    for q, idx in net.items():
        border = set()
        for hits in near.query_ball_point(cells[idx], spacing):
            border.update(pid[rigid_cells[hits]].tolist())
        if not border:
            continue
        for i in idx:
            vq = np.cross(w_of(q), cells[i])
            pid[i] = min(border, key=lambda p: np.linalg.norm(np.cross(w_of(p), cells[i]) - vq))
            own += 1
    print(f'  {gaps} cells in no rigid plate: {gaps - np.count_nonzero(pid < 0) - own} given their network\'s, {own} the plate their network moves with')
    # The rest (gaps between topologies) take their nearest partitioned cell's plate.
    if (pid < 0).any():
        ok = np.flatnonzero(pid >= 0)
        _, j = cKDTree(cells[ok]).query(cells[pid < 0])
        pid[pid < 0] = pid[ok[j]]
    ids = sorted(set(pid.tolist()))
    out = []
    for p in ids:
        fr = rm.get_rotation(0.0, int(p), 1.0)
        pole, ang = fr.get_euler_pole_and_angle() if not fr.represents_identity_rotation() else (None, 0.0)
        w = (np.array(pole.to_xyz()) * ang).tolist() if pole is not None else [0.0, 0.0, 0.0]
        out.append({'id': int(p), 'name': names.get(p, ''), 'w': w})
    index = {p: k for k, p in enumerate(ids)}
    return np.array([index[p] for p in pid], dtype=np.uint8), out


# ── Hotspots: the sim keeps ten (PLUMES.HOTSPOTS). Courtillot et al. 2003's seven primary plumes,
# with Iceland, Galápagos and Yellowstone, from Whittaker et al. 2015's compilation ──
HOTSPOTS = ['Hawaii', 'Iceland', 'Afar', 'Reunion', 'Tristan_da_Cunha', 'Easter', 'Louisville', 'Samoa', 'Galapagos', 'Yellowstone']


def hotspots():
    fc = pygplates.FeatureCollection(str(CACHE / 'hotspots' / 'x' / 'Hotspots' / 'Hotspots_Compilation_Whittaker_etal.gpmlz'))
    at = {}
    for f in fc:
        for g in f.get_geometries():
            at.setdefault(f.get_name(), g.to_lat_lon())
    missing = [h for h in HOTSPOTS if h not in at]
    assert not missing, f'hotspots not in the compilation: {missing}'
    return [{'name': h.replace('_', ' '), 'lat': at[h][0], 'lon': at[h][1]} for h in HOTSPOTS]


print('ETOPO 2022…')
bed, ice, landShare, _, low, reach = etopo()
print('Seafloor ages…')
ocean, age = ages()
print('Plates…')
plate, plist = plates()
hot = hotspots()

area = 4 * np.pi * 6371.0 ** 2 / n
print(f'land (bed above sea level): {landShare.mean():.1%} of the sphere by area-share; cells with mean bed > 0: {(bed > 0).mean():.1%}')
print(f'grounded ice: {(ice * area * 1e-3).sum() / 1e6:.1f} M km³ over {(ice > 0).sum()} cells')
inc = np.where(np.isfinite(low) & (bed + ice > 0), bed + ice - low, 0)
print(f'lowest land: {np.isfinite(low).sum()} cells; the mean surface above it, where above sea level: median {np.median(inc[inc > 0]):.0f} m, 90th percentile {np.percentile(inc[inc > 0], 90):.0f} m')
ch = (reach < bed) & (bed > -600) & (reach < 32767)
print(f'the sea\'s reach: {ch.sum()} cells with a channel below their mean bed above −600 m; where the mean is above −50 m, median {np.median((bed - reach)[ch & (bed > -50)]):.0f} m below it')
print(f'oceanic crust: {ocean.mean():.1%} of cells by share; mean age where dated {np.average(age, weights=ocean):.1f} Myr')
for k, p in enumerate(plist):
    cnt = int((plate == k).sum())
    if cnt * area > 1e6:
        print(f'  plate {p["id"]:4d} {p["name"][:28]:28s} {cnt * area / 1e6:6.1f} M km²  |ω| {np.linalg.norm(p["w"]) * 637.1:5.2f} cm/yr at 90°')

OUT.mkdir(exist_ok=True)
fields = [
    ('bed', '<i2', np.clip(np.round(bed), -32768, 32767)),
    ('ice', '<u2', np.clip(np.round(ice), 0, 65535)),
    ('low', '<i2', np.where(np.isfinite(low), np.clip(np.round(low), -32768, 32766), 32767)),
    ('reach', '<i2', np.clip(np.round(reach), -32768, 32767)),
    ('ocean', 'u1', np.clip(np.round(ocean * 255), 0, 255)),
    ('age', '<u2', np.clip(np.round(age * 100), 0, 65535)),
    ('plate', 'u1', plate),
]
meta = {'level': LEVEL, 'n': n, 'fields': [], 'plates': plist, 'hotspots': hot}
off = 0
with gzip.open(OUT / f'earth-{LEVEL}.bin.gz', 'wb', compresslevel=9, mtime=0) as fh:
    for name, dt, a in fields:
        b = np.asarray(a).astype(dt).tobytes()
        meta['fields'].append({'name': name, 'type': dt.lstrip('<'), 'offset': off})
        fh.write(b)
        off += len(b)
(OUT / 'earth.json').write_text(json.dumps(meta, separators=(',', ':')) + '\n')
print(f'wrote {OUT / f"earth-{LEVEL}.bin.gz"} ({off / 1e6:.2f} MB raw) and earth.json')
