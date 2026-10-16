"""Adds the real world to public/stages/campus.json: hills, true building
heights, real trees, and the countryside around campus.

    python3 tools/prep_terrain.py public/stages/campus.json [cache dir]

Run it after tools/prep_campus.py. Needs network access and
    pip install numpy shapely matplotlib pillow laspy lazrs pyarrow
(pyarrow only for building names and the river; skipped if missing).

Where the data comes from:
- USGS 3DEP lidar (the laser survey USGS_LPC_NY_FEMA_R2_B2_2016, public on
  AWS, ~6 points per square meter): the ground under campus (a 4 m grid),
  every roof (1 m cells, split into parts at their own heights) and tree tops.
- Terrain tiles (AWS "elevation-tiles-prod", from the same USGS elevation
  data): the countryside out to 4 km (40 m grid) and 40 km (800 m grid).
- Overture Maps (open map data, OpenStreetMap inside): building names and
  the river and ponds around campus.

The campus model (from the OBJ) turned out to be laid out exactly on the
map: its origin is at ORIGIN, x east, z south, no rotation (matched against
Overture's building outlines to within half a meter). Elevations are stored
relative to DATUM (m above sea level), so the campus plateau sits near 0.
"""
import base64
import io
import json
import math
import os
import sys
import urllib.request
import concurrent.futures as cf

import numpy as np
from PIL import Image
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import unary_union
from matplotlib.path import Path

ORIGIN = (44.603066, -75.183521)  # lat, lon of the model's (0, 0)
DATUM = 125.0
LIDAR = 'USGS_LPC_NY_FEMA_R2_B2_2016_LAS_2018'
OVERTURE = 'overturemaps-us-west-2/release/2026-09-23.1'
KX = 111320 * math.cos(math.radians(ORIGIN[0]))  # meters per degree of longitude here
KY = 110540
R = 6378137
GRID = 4.0  # campus ground grid, meters


def to_model(lon, lat):
    return (np.asarray(lon) - ORIGIN[1]) * KX, -(np.asarray(lat) - ORIGIN[0]) * KY


def to_lonlat(x, z):
    return ORIGIN[1] + np.asarray(x) / KX, ORIGIN[0] - np.asarray(z) / KY


def b64(arr):
    return base64.b64encode(np.asarray(arr, '<i2').tobytes()).decode()


def grid_entry(x0, z0, step, data):
    """Heights in decimeters above DATUM, row by row (z), little-endian int16."""
    return {'x0': round(float(x0), 2), 'z0': round(float(z0), 2), 'step': step, 'nx': int(data.shape[1]), 'nz': int(data.shape[0]),
            'data': b64(np.round((data - DATUM) * 10))}


# ---- Lidar ----

def lidar_points(bounds, cache):
    """All points inside bounds (model meters), from the USGS EPT octree."""
    (x0, z0, x1, z1) = bounds
    lo_lon, hi_lat = to_lonlat(x0, z0)
    hi_lon, lo_lat = to_lonlat(x1, z1)
    X0, Y0 = R * math.radians(lo_lon), R * math.log(math.tan(math.pi / 4 + math.radians(lo_lat) / 2))
    X1, Y1 = R * math.radians(hi_lon), R * math.log(math.tan(math.pi / 4 + math.radians(hi_lat) / 2))
    base = f'https://usgs-lidar-public.s3.amazonaws.com/{LIDAR}'
    ept = json.load(urllib.request.urlopen(f'{base}/ept.json'))
    B = ept['bounds']
    hier = {}

    def hierarchy(key):
        if key not in hier:
            hier[key] = json.load(urllib.request.urlopen(f'{base}/ept-hierarchy/{key}.json'))
        return hier[key]

    nodes = []

    def walk(key, h):
        d, x, y, z = map(int, key.split('-'))
        size = (B[3] - B[0]) / 2 ** d
        bx0, by0 = B[0] + x * size, B[1] + y * size
        if bx0 > X1 or bx0 + size < X0 or by0 > Y1 or by0 + size < Y0 or key not in h:
            return
        n = h[key]
        if n == -1:
            h = hierarchy(key)
            n = h[key]
        if n > 0:
            nodes.append(key)
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    walk(f'{d + 1}-{2 * x + dx}-{2 * y + dy}-{2 * z + dz}', h)

    walk('0-0-0-0', hierarchy('0-0-0-0'))
    os.makedirs(f'{cache}/laz', exist_ok=True)

    def get(key):
        p = f'{cache}/laz/{key}.laz'
        if not os.path.exists(p):
            urllib.request.urlretrieve(f'{base}/ept-data/{key}.laz', p)
        return p

    import laspy
    with cf.ThreadPoolExecutor(8) as ex:
        paths = list(ex.map(get, nodes))
    parts = []
    for p in paths:
        las = laspy.read(p)
        x, y = np.asarray(las.x), np.asarray(las.y)
        k = (x >= X0) & (x <= X1) & (y >= Y0) & (y <= Y1)
        parts.append((x[k], y[k], np.asarray(las.z)[k], np.asarray(las.classification)[k]))
    x, y, z, c = (np.concatenate(v) for v in zip(*parts))
    lon = np.degrees(x / R)
    lat = np.degrees(2 * np.arctan(np.exp(y / R)) - math.pi / 2)
    mx, mz = to_model(lon, lat)
    keep = c != 7  # noise
    print(f'lidar: {len(nodes)} tiles, {keep.sum()} points')
    return mx[keep], mz[keep], z[keep], c[keep]


def fill_nan(a, iters=400):
    a = a.copy()
    for _ in range(iters):
        m = np.isnan(a)
        if not m.any():
            break
        p = np.pad(a, 1, constant_values=np.nan)
        nb = np.stack([p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]])
        with np.errstate(all='ignore'):
            avg = np.nanmean(nb, 0)
        a[m] = avg[m]
    return a


def blur(a, passes=1):
    for _ in range(passes):
        p = np.pad(a, 1, mode='edge')
        a = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 4 * p[1:-1, 1:-1]) / 8
    return a


def raster(x, z, v, x0, z0, step, nx, nz, how):
    ix = ((x - x0) / step).astype(int)
    iz = ((z - z0) / step).astype(int)
    k = (ix >= 0) & (ix < nx) & (iz >= 0) & (iz < nz)
    if how == 'mean':
        s = np.zeros((nz, nx))
        n = np.zeros((nz, nx))
        np.add.at(s, (iz[k], ix[k]), v[k])
        np.add.at(n, (iz[k], ix[k]), 1)
        with np.errstate(all='ignore'):
            return np.where(n > 0, s / n, np.nan)
    out = np.full((nz, nx), -np.inf)
    np.maximum.at(out, (iz[k], ix[k]), v[k])
    out[out == -np.inf] = np.nan
    return out


def median3(a):
    nz, nx = a.shape
    p = np.pad(a, 1, constant_values=np.nan)
    with np.errstate(all='ignore'):
        return np.nanmedian(np.stack([p[i:i + nz, j:j + nx] for i in range(3) for j in range(3)]), 0)


# ---- Buildings: split each footprint into parts by roof height ----

def levels(vals, max_k=4, tol=0.8):
    """1D k-means with the fewest levels whose spread stays within tol."""
    vals = np.sort(vals)
    best = None
    for k in range(1, max_k + 1):
        cent = np.percentile(vals, np.linspace(10, 90, k))
        for _ in range(30):
            lab = np.abs(vals[:, None] - cent[None]).argmin(1)
            cent = np.array([vals[lab == j].mean() if (lab == j).any() else cent[j] for j in range(k)])
        spread = max(vals[lab == j].std() for j in range(k) if (lab == j).any())
        best = cent
        if spread < tol:
            break
    cent = np.sort(best)
    merged = [cent[0]]
    for c in cent[1:]:
        if c - merged[-1] < 1.4:
            merged[-1] = (merged[-1] + c) / 2
        else:
            merged.append(c)
    return np.array(merged)


def polygonize(mask, x0, z0, cell):
    boxes = [box(x0 + j * cell, z0 + i * cell, x0 + (j + 1) * cell, z0 + (i + 1) * cell) for i, j in zip(*np.nonzero(mask))]
    if not boxes:
        return None
    return unary_union(boxes).buffer(0.6, join_style=2).buffer(-0.6, join_style=2).simplify(0.7)


def rings(geom):
    polys = [geom] if isinstance(geom, Polygon) else list(getattr(geom, 'geoms', []))
    out = []
    for p in polys:
        if p.geom_type != 'Polygon' or p.area < 4:
            continue
        p = p.simplify(0.2)
        ext = np.array(p.exterior.coords)[:-1]
        out.append([ext] + [np.array(h.coords)[:-1] for h in p.interiors])
    return out


def building_parts(footprint, px, pz, py, ground_at):
    """[(rings, top elevation)], highest first, and the base (lowest ground)."""
    cell = 1.0
    bx0, bz0, bx1, bz1 = footprint.bounds
    nx, nz = int(np.ceil((bx1 - bx0) / cell)), int(np.ceil((bz1 - bz0) / cell))
    roof = median3(median3(raster(px, pz, py, bx0, bz0, cell, nx, nz, 'max')))
    gx, gz = np.meshgrid(bx0 + (np.arange(nx) + 0.5) * cell, bz0 + (np.arange(nz) + 0.5) * cell)
    shrunk = footprint.buffer(-0.5)
    edge = np.array((shrunk if not shrunk.is_empty and shrunk.geom_type == 'Polygon' else footprint).exterior.coords)
    inside = Path(edge).contains_points(np.stack([gx.ravel(), gz.ravel()], 1)).reshape(nz, nx)
    ring = np.array(footprint.exterior.coords)
    base = float(ground_at(ring[:, 0], ring[:, 1]).min())
    vals = roof[inside & np.isfinite(roof)]
    if len(vals) < max(12, 0.25 * inside.sum()):
        # Hardly any returns (sheds, things built since the survey): a 4 m box.
        return [(rings(footprint), base + 4.0)], base
    vals = vals[vals > base + 2.0] if (vals > base + 2.0).sum() > 10 else vals
    lv = levels(vals)
    lab = np.full(roof.shape, -1)
    ok = inside & np.isfinite(roof)
    lab[ok] = np.abs(roof[ok][:, None] - lv[None]).argmin(1)
    # Cells without returns take their neighbors' level, and specks follow the
    # majority around them (6 of 9 cells).
    for _ in range(8):
        p = np.pad(lab, 1, constant_values=-1)
        stack = np.stack([p[i:i + nz, j:j + nx] for i in range(3) for j in range(3)])
        counts = np.stack([(stack == j).sum(0) for j in range(len(lv))])
        mode, best = counts.argmax(0), counts.max(0)
        fix = inside & (((lab < 0) & (best > 0)) | (best >= 6))
        lab[fix] = mode[fix]
    parts = []
    taken = None
    for j in sorted(range(len(lv)), key=lambda j: -lv[j]):
        m = lab == j
        if m.sum() < 20:
            continue
        geom = polygonize(m, bx0, bz0, cell)
        if geom is None:
            continue
        geom = geom.intersection(footprint)
        if taken is not None:
            geom = geom.difference(taken)
        if geom.area < 20:
            continue
        top = float(np.median(roof[m & np.isfinite(roof)]))
        parts.append([geom, top])
        taken = geom if taken is None else taken.union(geom)
    if not parts:
        return [(rings(footprint), float(np.percentile(vals, 70)))], base
    # Whatever's left of the footprint joins the lowest part.
    rest = footprint.difference(taken) if taken is not None else footprint
    if rest.area > 1:
        parts[-1][0] = parts[-1][0].union(rest)
    return [(rings(g), top) for g, top in parts if rings(g)], base


# ---- Trees from the canopy ----

def lidar_trees(x, z, y, c, ground_at, footprints, bounds):
    cell = 1.5
    x0, z0, x1, z1 = bounds
    nx, nz = int((x1 - x0) / cell), int((z1 - z0) / cell)
    veg = c == 1
    top = raster(x[veg], z[veg], y[veg], x0, z0, cell, nx, nz, 'max')
    gx, gz = np.meshgrid(x0 + (np.arange(nx) + 0.5) * cell, z0 + (np.arange(nz) + 0.5) * cell)
    chm = top - ground_at(gx, gz)
    chm = np.nan_to_num(median3(chm), nan=0)
    blocked = np.zeros(chm.shape, bool)
    pts = np.stack([gx.ravel(), gz.ravel()], 1)
    for fp in footprints:
        b = fp.buffer(2.5)
        bx0, bz0, bx1, bz1 = b.bounds
        k = (pts[:, 0] > bx0) & (pts[:, 0] < bx1) & (pts[:, 1] > bz0) & (pts[:, 1] < bz1)
        idx = np.nonzero(k)[0]
        if len(idx):
            blocked.ravel()[idx[Path(np.array(b.exterior.coords)).contains_points(pts[idx])]] = True
    # Tree tops: highest cell within ~5 m, at least 5 m tall.
    w = 3
    p = np.pad(chm, w, constant_values=0)
    local = np.max(np.stack([p[i:i + nz, j:j + nx] for i in range(2 * w + 1) for j in range(2 * w + 1)]), 0)
    tops = (chm >= local - 1e-6) & (chm > 5.0) & ~blocked
    out = []
    for i, j in zip(*np.nonzero(tops)):
        h = float(chm[i, j])
        # Crown size: how far the canopy stays above half the tree's height.
        r = 1.5
        for rr in range(1, 6):
            ring = chm[max(0, i - rr):i + rr + 1, max(0, j - rr):j + rr + 1]
            if (ring > h * 0.5).mean() < 0.55:
                break
            r = (rr + 0.5) * cell
        out.append((float(gx[i, j]), float(gz[i, j]), h, max(1.8, h * 0.28), min(max(r, 1.6), 7.5)))
    return out


# ---- Terrain tiles for the countryside ----

def terrarium(z, x0, z0, x1, z1):
    def tile(lon, lat):
        n = 2 ** z
        return (lon + 180) / 360 * n, (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    lon0, lat1 = to_lonlat(x0, z0)
    lon1, lat0 = to_lonlat(x1, z1)
    tx0, ty0 = tile(lon0, lat1)
    tx1, ty1 = tile(lon1, lat0)
    xs, ys = range(int(tx0), int(tx1) + 1), range(int(ty0), int(ty1) + 1)
    rows = []
    for ty in ys:
        row = []
        for tx in xs:
            data = urllib.request.urlopen(f'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{tx}/{ty}.png', timeout=60).read()
            a = np.asarray(Image.open(io.BytesIO(data)).convert('RGB')).astype(np.float64)
            row.append(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)
        rows.append(np.hstack(row))
    e = np.vstack(rows)
    n = 2 ** z

    def sample(mx, mz):
        lon, lat = to_lonlat(mx, mz)
        px = ((np.asarray(lon) + 180) / 360 * n - xs[0]) * 256 - 0.5
        py = ((1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n - ys[0]) * 256 - 0.5
        px = np.clip(px, 0, e.shape[1] - 1.001)
        py = np.clip(py, 0, e.shape[0] - 1.001)
        i, j = py.astype(int), px.astype(int)
        fy, fx = py - i, px - j
        return (e[i, j] * (1 - fx) * (1 - fy) + e[i, j + 1] * fx * (1 - fy) + e[i + 1, j] * (1 - fx) * fy + e[i + 1, j + 1] * fx * fy)
    return sample


def overture(kind, x0, z0, x1, z1):
    """Overture features in the box: [(shapely geometry in model meters, row)]."""
    try:
        import pyarrow.dataset as ds, pyarrow.compute as pc, pyarrow.fs as pafs
        import shapely
    except ImportError:
        print('pyarrow missing: skipping Overture', kind)
        return []
    theme, typ = kind.split('/')
    fs = pafs.S3FileSystem(anonymous=True, region='us-west-2', proxy_options=os.environ.get('HTTPS_PROXY') or None)
    lon0, lat1 = to_lonlat(x0, z0)
    lon1, lat0 = to_lonlat(x1, z1)
    dset = ds.dataset(f'{OVERTURE}/theme={theme}/type={typ}/', filesystem=fs, format='parquet')
    f = (pc.field('bbox', 'xmax') > lon0) & (pc.field('bbox', 'xmin') < lon1) & (pc.field('bbox', 'ymax') > lat0) & (pc.field('bbox', 'ymin') < lat1)
    out = []
    for row in dset.to_table(columns=['geometry', 'names', 'subtype', 'class'], filter=f).to_pylist():
        g = shapely.from_wkb(row['geometry'])
        g = shapely.transform(g, lambda c: np.stack(to_model(c[:, 0], c[:, 1]), 1))
        out.append((g, row))
    print(f'overture {kind}: {len(out)}')
    return out


def dm(a):
    return [int(round(v * 10)) for v in np.asarray(a).ravel()]


def main(path, cache):
    os.makedirs(cache, exist_ok=True)
    data = json.load(open(path))
    bx0, bz0, bx1, bz1 = [v / 10 for v in data['bounds']]
    margin = 40
    lb = (bx0 - margin, bz0 - margin, bx1 + margin, bz1 + margin)
    npz = f'{cache}/lidar_points.npz'
    if os.path.exists(npz):
        L = np.load(npz)
        x, z, y, c = L['x'], L['z'], L['y'], L['c']
    else:
        x, z, y, c = lidar_points(lb, cache)
        np.savez_compressed(npz, x=x, z=z, y=y, c=c)

    # Ground: 2 m cells from ground (2) and water (9) returns, holes under
    # buildings filled from around them, then a light blur.
    step = 2.0
    nx, nz = int((lb[2] - lb[0]) / step), int((lb[3] - lb[1]) / step)
    g = (c == 2) | (c == 9)
    dtm2 = blur(fill_nan(raster(x[g], z[g], y[g], lb[0], lb[1], step, nx, nz, 'mean')), 2)

    def ground_at(px, pz):
        px = np.clip((np.asarray(px, float) - lb[0]) / step - 0.5, 0, nx - 1.001)
        pz = np.clip((np.asarray(pz, float) - lb[1]) / step - 0.5, 0, nz - 1.001)
        i, j = pz.astype(int), px.astype(int)
        fz, fx = pz - i, px - j
        return (dtm2[i, j] * (1 - fx) * (1 - fz) + dtm2[i, j + 1] * fx * (1 - fz) + dtm2[i + 1, j] * (1 - fx) * fz + dtm2[i + 1, j + 1] * fx * fz)

    gx = np.arange(bx0, bx1 + GRID, GRID)
    gz = np.arange(bz0, bz1 + GRID, GRID)
    GX, GZ = np.meshgrid(gx, gz)
    ground = ground_at(GX, GZ)
    data['geo'] = {'lat': ORIGIN[0], 'lon': ORIGIN[1], 'datum': DATUM,
                   'note': 'model x east, z south (meters); heights in decimeters above datum (meters above sea level)'}
    data['terrain'] = grid_entry(gx[0], gz[0], GRID, ground)
    print('campus ground', round(ground.min(), 1), '..', round(ground.max(), 1), 'm', ground.shape)

    # Buildings.
    names = {}
    for geom, row in overture('buildings/building', bx0, bz0, bx1, bz1):
        n = (row['names'] or {}).get('primary')
        if n:
            names[n] = geom
    nonground = c == 1
    footprints = []
    for b in data['buildings']:
        fp = Polygon(np.array(b['ring']).reshape(-1, 2) / 10, [np.array(h).reshape(-1, 2) / 10 for h in b.get('holes', [])])
        fp = fp if fp.is_valid else fp.buffer(0)
        if fp.geom_type != 'Polygon':
            fp = max(fp.geoms, key=lambda p: p.area)
        footprints.append(fp)
        bxa, bza, bxb, bzb = fp.bounds
        k = nonground & (x > bxa - 2) & (x < bxb + 2) & (z > bza - 2) & (z < bzb + 2)
        parts, base = building_parts(fp, x[k], z[k], y[k], ground_at)
        b['base'] = round(base - DATUM, 2)
        b['parts'] = [{'top': round(top - DATUM, 2), 'rings': [dm(r) for r in rr]} for rr_list, top in parts for rr in rr_list]
        name = next((n for n, gm in names.items() if gm.intersects(fp) and gm.intersection(fp).area > 0.6 * max(gm.area, fp.area)), None)
        if name:
            b['name'] = name
        tops = [round(top - base, 1) for _, top in parts]
        print(f"  {name or '(unnamed)':36s} {fp.area:6.0f} m2  heights {tops}  draft had {b['h']}")

    # Trees: the real ones, from the canopy (replaces the draft's scattered cones).
    trees = lidar_trees(x, z, y, c, ground_at, footprints, (bx0, bz0, bx1, bz1))
    data['trees'] = dm([(tx, tz, h, base, r) for tx, tz, h, base, r in trees])
    print('trees', len(trees))

    # Countryside: 40 m grid out to 4 km, 800 m grid out to 40 km. Near campus
    # the lidar ground is used so the edges line up.
    near = terrarium(14, -4200, -4200, 4200, 4200)
    rx = np.arange(-4000, 4001, 40.0)
    RX, RZ = np.meshgrid(rx, rx)
    region = near(RX, RZ)
    inl = (RX > lb[0]) & (RX < lb[2]) & (RZ > lb[1]) & (RZ < lb[3])
    region[inl] = ground_at(RX[inl], RZ[inl])
    data['region'] = grid_entry(rx[0], rx[0], 40.0, region)
    far = terrarium(10, -42000, -42000, 42000, 42000)
    fx = np.arange(-40000, 40001, 800.0)
    FX, FZ = np.meshgrid(fx, fx)
    farh = far(FX, FZ)
    farh[(np.abs(FX) < 4000) & (np.abs(FZ) < 4000)] = near(FX, FZ)[(np.abs(FX) < 4000) & (np.abs(FZ) < 4000)]
    data['far'] = grid_entry(fx[0], fx[0], 800.0, np.maximum(farh, 60))
    print('region', round(region.min(), 1), '..', round(region.max(), 1), 'far', round(farh.min(), 1), '..', round(farh.max(), 1))

    # The river and ponds around campus (outside the painted campus ground).
    water = []
    # Outside the campus ground, which paints its own stretch of river (the
    # last 30 m overlap its faded edge).
    clip = box(-4000, -4000, 4000, 4000).difference(box(bx0 + 30, bz0 + 30, bx1 - 30, bz1 - 30))
    for geom, row in overture('base/water', -4000, -4000, 4000, 4000):
        if geom.geom_type not in ('Polygon', 'MultiPolygon'):
            continue
        geom = geom.intersection(clip).simplify(2.0)
        for rr in rings(geom):
            if Polygon(rr[0]).area > 400:
                water.append([dm(r) for r in rr])
    data['waterRegion'] = water
    print('water polygons', len(water))

    with open(path, 'w') as fh:
        json.dump(data, fh, separators=(',', ':'))
    print('wrote', path, round(os.path.getsize(path) / 1e6, 2), 'MB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '/tmp/campus-geo-cache')
