"""Turns the SUNY Canton campus massing model (tools/campus/campus.obj, made
from OpenStreetMap data) into public/stages/campus.json, which src/campus.js
builds the 3D campus from at load time.

    python3 tools/prep_campus.py tools/campus/campus.obj public/stages/campus.json

The OBJ is a draft: flat ground layers (grass, roads, paths, ...) as
triangles, every building as plain walls plus a flat roof, and every tree as
a six-sided cone on a square trunk. The game paints its own look on top, so
all it needs from the file is the shapes:

- ground layers as polygons (outer ring + holes), with the triangles merged
  back into outlines and simplified: the game paints them into one texture,
- each building's footprint ring and height,
- each tree's spot, height and canopy size.

Coordinates are rounded to decimeters (ints) to keep the file small.
Only numpy is needed. The draft's ground is flat and its building heights
are made up: run tools/prep_terrain.py on the output next (real terrain,
heights, trees and countryside from survey data).
"""
import json
import sys
from collections import defaultdict

import numpy as np

LAYERS = ['ground', 'grass', 'wood', 'water', 'pitch', 'parking', 'path', 'road']
SIMPLIFY = 0.12  # meters: outline points closer than this to a straight line are dropped


def read_obj(path):
    verts, objects, cur = [], {}, None
    with open(path) as fh:
        for line in fh:
            if line.startswith('v '):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('o '):
                cur = line.split()[1]
                objects[cur] = []
            elif line.startswith('f '):
                objects[cur].append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])
    return np.array(verts), objects


def area(ring):
    x, z = ring[:, 0], ring[:, 1]
    return 0.5 * float(np.sum(x * np.roll(z, -1) - np.roll(x, -1) * z))


def simplify(ring, tol):
    """Douglas-Peucker on a closed ring (keeps the two points farthest apart)."""
    if len(ring) <= 4:
        return ring
    far = int(np.argmax(np.sum((ring - ring[0]) ** 2, axis=1)))

    def dp(pts):
        if len(pts) < 3:
            return pts
        a, b = pts[0], pts[-1]
        ab = b - a
        n = np.hypot(*ab)
        rel = pts - a
        d = np.abs(ab[0] * rel[:, 1] - ab[1] * rel[:, 0]) / n if n > 1e-9 else np.hypot(rel[:, 0], rel[:, 1])
        i = int(np.argmax(d))
        if d[i] <= tol:
            return np.array([a, b])
        return np.vstack([dp(pts[: i + 1])[:-1], dp(pts[i:])])

    first = dp(ring[: far + 1])
    second = dp(np.vstack([ring[far:], ring[:1]]))
    out = np.vstack([first[:-1], second[:-1]])
    return out if len(out) >= 3 else ring


def polygons(V, faces):
    """Triangles/quads that share corners -> [outer ring, *holes] per piece.
    A piece's outline is the edges only one of its faces uses."""
    tris = []
    for f in faces:
        for i in range(1, len(f) - 1):
            tris.append((f[0], f[i], f[i + 1]))
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for t in tris:
        parent[find(t[1])] = find(t[0])
        parent[find(t[2])] = find(t[0])
    pieces = defaultdict(list)
    for t in tris:
        pieces[find(t[0])].append(t)

    out = []
    for tris in pieces.values():
        # The OBJ's faces don't all wind the same way: count edges undirected.
        count = defaultdict(int)
        for a, b, c in tris:
            for e in ((a, b), (b, c), (c, a)):
                count[tuple(sorted(e))] += 1
        nxt = defaultdict(list)
        for (a, b), n in count.items():
            if n == 1:
                nxt[a].append(b)
                nxt[b].append(a)
        seen = set()
        rings = []
        for start in list(nxt):
            if start in seen:
                continue
            ring, prev, cur = [start], None, start
            seen.add(start)
            while True:
                options = [n for n in nxt[cur] if n != prev and (n not in seen or n == start)]
                if not options:
                    break
                prev, cur = cur, options[0]
                if cur == start:
                    break
                seen.add(cur)
                ring.append(cur)
            if len(ring) >= 3:
                rings.append(V[ring][:, [0, 2]])
        if not rings:
            continue
        rings.sort(key=lambda r: -abs(area(r)))
        # Outer ring counter-clockwise (x right, z down), holes the other way,
        # so the game can fill overlapping pieces with the nonzero rule.
        fixed = []
        for i, r in enumerate(rings):
            r = simplify(r, SIMPLIFY)
            if abs(area(r)) < 0.5:
                continue
            want_positive = i == 0
            if (area(r) > 0) != want_positive:
                r = r[::-1]
            fixed.append(r)
        if fixed and abs(area(fixed[0])) >= 1.0:
            out.append(fixed)
    return out


def buildings(V, wall_faces):
    """Wall quads -> footprint rings with heights. A quad's first two corners
    are its bottom edge; walking those edges gives each ring."""
    nxt, height = {}, {}
    for f in wall_faces:
        a, b = f[0], f[1]
        nxt[a] = b
        height[a] = max(V[i][1] for i in f)
    rings, seen = [], set()
    for start in nxt:
        if start in seen:
            continue
        ring, cur = [], start
        while cur not in seen and cur in nxt:
            seen.add(cur)
            ring.append(cur)
            cur = nxt[cur]
        if len(ring) >= 3:
            rings.append((V[ring][:, [0, 2]], max(height[i] for i in ring)))
    # Courtyards: a ring inside another ring of the same height is its hole.
    def inside(p, ring):
        x, z = p
        c = False
        n = len(ring)
        for i in range(n):
            x1, z1 = ring[i]
            x2, z2 = ring[(i + 1) % n]
            if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
                c = not c
        return c

    rings.sort(key=lambda r: -abs(area(r[0])))
    out = []
    for ring, h in rings:
        host = next((b for b in out if abs(b['h'] - h) < 0.01 and inside(ring[0], b['ring'])), None)
        if host:
            host['holes'].append(ring)
        else:
            out.append({'ring': ring, 'h': h, 'holes': []})
    for b in out:
        if area(b['ring']) < 0:
            b['ring'] = b['ring'][::-1]
        b['holes'] = [h if area(h) < 0 else h[::-1] for h in b['holes']]
    return out


def trees(V, foliage_faces):
    """Each cone is seven faces on its own seven corners: apex + base ring."""
    ids = sorted({i for f in foliage_faces for i in f})
    out = []
    for k in range(0, len(ids), 7):
        P = V[ids[k: k + 7]]
        apex = P[np.argmax(P[:, 1])]
        base = P[P[:, 1] < apex[1] - 0.01]
        r = float(np.mean(np.hypot(base[:, 0] - apex[0], base[:, 2] - apex[2])))
        out.append((apex[0], apex[2], apex[1], float(base[:, 1].min()), r))
    return out


def dm(a):
    """Meters -> decimeter ints, flattened."""
    return [int(round(v * 10)) for v in np.asarray(a).ravel()]


def main(src, dst):
    V, objects = read_obj(src)
    data = {
        'credit': 'Campus layout (c) OpenStreetMap contributors, ODbL. Units: decimeters, x east, z south.',
        'layers': {},
    }
    for name in LAYERS:
        polys = polygons(V, objects.get(name, []))
        data['layers'][name] = [[dm(r) for r in poly] for poly in polys]
        print(f'{name:8s} {len(objects.get(name, [])):6d} faces -> {len(polys):4d} polygons, '
              f'{sum(len(r) for p in polys for r in p)} points')
    blds = buildings(V, objects['wall'])
    data['buildings'] = [{'ring': dm(b['ring']), 'h': round(b['h'], 2), 'holes': [dm(h) for h in b['holes']]} for b in blds]
    print(f'buildings {len(blds)} ({sum(len(b["holes"]) for b in blds)} courtyards)')
    tr = trees(V, objects['foliage'])
    data['trees'] = dm(tr)
    print(f'trees {len(tr)}')
    xs = V[:, 0]
    zs = V[:, 2]
    g = V[sorted({i for f in objects['ground'] for i in f})]
    data['bounds'] = dm([g[:, 0].min(), g[:, 2].min(), g[:, 0].max(), g[:, 2].max()])
    print('extent', xs.min(), xs.max(), zs.min(), zs.max())
    with open(dst, 'w') as fh:
        json.dump(data, fh, separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
