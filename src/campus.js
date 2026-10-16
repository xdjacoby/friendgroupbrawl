import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, paint, seeded, INK } from './stage.js';

// SUNY Canton, as a backdrop: the campus below, a painted sky around it, and
// the countryside out to the Adirondack foothills. The victory screen and the
// SUNY Canton stage both stand a floating platform above it, the way Smash's
// Battlefield floats over its scenery.
//
// The layout comes from public/stages/campus.json (tools/prep_campus.py made
// it from an OpenStreetMap massing model): ground layers as polygons, building
// footprints with heights, and trees. Everything else is dressed on here:
// the ground is painted into one texture (lawns with mowing stripes, paths,
// roads, parking stalls, the river, soft shadows), buildings get brick or
// glass facades with windows that light up at night, roof parapets and
// rooftop units, trees become cartoon maples and pines, and the lots fill
// with parked cars.
//
// Building it takes a moment, so it's built once (`loadCampus()`, started from
// the menu) and every scene that shows it shares the same geometry and
// textures. Its meshes are marked `userData.cached` so disposing a scene
// leaves them alone.
//
// Times of day (`TIMES`): day, sunset, night. A world can sit at one of them
// or blend along `cycle(t)` (the stage goes day -> sunset -> night -> dawn).

const DATA_URL = 'stages/campus.json';
const PX_PER_M = 4; // ground texture resolution (capped at 4096 px a side)
const BAY = 3.2; // facade window spacing, meters
const FLOOR = 3.5; // story height
const PARAPET = 0.6;

const rad = (d) => (d * Math.PI) / 180;
const dir = (az, el) => [Math.cos(rad(el)) * Math.sin(rad(az)), Math.sin(rad(el)), -Math.cos(rad(el)) * Math.cos(rad(az))];

// ---- Times of day ----
// sunDir is where the sun (or moon) is drawn in the sky, as seen by a camera
// looking down -z; keyDir is where the main light comes from. They don't match
// on purpose: the light always comes from the camera's side so faces read.
const DAY = {
  zenith: 0x2a7de1, horizon: 0x9fd3ff, haze: 0xdcefff, ground: 0x9fbf7a,
  sunDir: dir(-35, 30), sunColor: 0xfff1b8, sunSize: 0.04, glow: 0.45, moon: 0, stars: 0,
  hemiSky: 0xe4f3ff, hemiGround: 0x6a8a4a, hemi: 1.25,
  key: 0xfff3dc, keyI: 2.3, keyDir: [0.35, 0.82, 0.45], fillI: 0.2,
  windows: 0, lamps: 0, cloud: 0xffffff, cloudGlow: 0x2a3550, water: 0x4aa3e0,
};
const SUNSET = {
  zenith: 0x34418f, horizon: 0xff9466, haze: 0xffcf8a, ground: 0x8a8a6a,
  sunDir: dir(-38, 4), sunColor: 0xffa53d, sunSize: 0.06, glow: 1.1, moon: 0, stars: 0.15,
  hemiSky: 0xffcfa8, hemiGround: 0x5c4a68, hemi: 1.1,
  key: 0xffb784, keyI: 2.2, keyDir: [-0.45, 0.45, 0.77], fillI: 0.35,
  windows: 0.6, lamps: 0.8, cloud: 0xffb19c, cloudGlow: 0x7a3048, water: 0xe8906a,
};
const NIGHT = {
  zenith: 0x060a22, horizon: 0x1d3466, haze: 0x2b4a84, ground: 0x2a3a4a,
  sunDir: dir(30, 34), sunColor: 0xe6eeff, sunSize: 0.035, glow: 0.3, moon: 1, stars: 1,
  hemiSky: 0x8696e0, hemiGround: 0x2c3050, hemi: 1.0,
  key: 0xb4c6ff, keyI: 1.45, keyDir: [0.3, 0.7, 0.65], fillI: 0.5,
  windows: 1, lamps: 1, cloud: 0x3c4a78, cloudGlow: 0x161c38, water: 0x2a4f8a,
};
const DAWN = {
  ...SUNSET,
  zenith: 0x5a6fbf, horizon: 0xffa8a0, haze: 0xffd6c0, sunDir: dir(40, 5), sunColor: 0xffc070,
  key: 0xffd0b0, keyDir: [0.45, 0.5, 0.74], windows: 0.4, cloud: 0xffc4c4, cloudGlow: 0x6a3a5a,
};
export const TIMES = { day: DAY, sunset: SUNSET, night: NIGHT, dawn: DAWN };
// A full day for the stage: [position 0..1, palette].
const CYCLE = [[0, DAY], [0.32, DAY], [0.44, SUNSET], [0.54, NIGHT], [0.86, NIGHT], [0.94, DAWN], [1, DAY]];

function mixPalette(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) {
    const va = a[k];
    const vb = b[k];
    if (Array.isArray(va)) {
      const v = va.map((x, i) => x + (vb[i] - x) * t);
      const n = Math.hypot(...v) || 1;
      out[k] = v.map((x) => x / n);
    } else if (k === 'sunSize' || k === 'glow' || !/^(zenith|horizon|haze|ground|sunColor|hemiSky|hemiGround|key|cloud|cloudGlow|water)$/.test(k)) {
      out[k] = va + (vb - va) * t;
    } else {
      out[k] = new THREE.Color(va).lerp(new THREE.Color(vb), t).getHex();
    }
  }
  return out;
}

export function cycle(t) {
  t = ((t % 1) + 1) % 1;
  for (let i = 1; i < CYCLE.length; i++) {
    const [t1, p1] = CYCLE[i];
    const [t0, p0] = CYCLE[i - 1];
    if (t <= t1) return mixPalette(p0, p1, t1 > t0 ? (t - t0) / (t1 - t0) : 0);
  }
  return DAY;
}

// ---- Loading ----

let campusPromise = null;
// Fetches the layout and builds the shared campus once. Safe to call often.
export function loadCampus() {
  campusPromise ??= fetch(DATA_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`${DATA_URL}: ${r.status}`);
      return r.json();
    })
    .then((data) => buildCampus(data))
    .catch((err) => {
      console.warn('Campus failed to load:', err);
      campusPromise = null;
      return null;
    });
  return campusPromise;
}

const m = (v) => v / 10; // the file is in decimeters
function ringPoints(flat) {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push(new THREE.Vector2(m(flat[i]), m(flat[i + 1])));
  return pts;
}
function ringArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
function insideRing(x, z, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if ((a.y > z) !== (b.y > z) && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
function edgeDistance(x, z, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.y) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.y - dz * t));
  }
  return best;
}

// ---- Terrain ----
// tools/prep_terrain.py stores heights as grids (decimeters above the datum,
// base64 int16): `terrain` under campus (4 m), `region` out to 4 km (40 m),
// `far` out to 40 km (800 m). heightAt() takes the finest one that covers a
// spot (0 everywhere for a file without them).
function decodeGrid(g) {
  if (!g) return null;
  const raw = atob(g.data);
  const h = new Float32Array(raw.length / 2);
  for (let i = 0; i < h.length; i++) h[i] = (((raw.charCodeAt(2 * i) | (raw.charCodeAt(2 * i + 1) << 8)) << 16) >> 16) / 10;
  return { ...g, h };
}
function sampleGrid(G, x, z) {
  const fx = (x - G.x0) / G.step;
  const fz = (z - G.z0) / G.step;
  if (!(fx >= 0 && fz >= 0 && fx <= G.nx - 1 && fz <= G.nz - 1)) return null;
  const j = Math.min(G.nx - 2, Math.floor(fx));
  const i = Math.min(G.nz - 2, Math.floor(fz));
  const tx = fx - j;
  const tz = fz - i;
  const h = G.h;
  const a = i * G.nx + j;
  return (h[a] * (1 - tx) + h[a + 1] * tx) * (1 - tz) + (h[a + G.nx] * (1 - tx) + h[a + G.nx + 1] * tx) * tz;
}
function terrainOf(data) {
  const grids = [decodeGrid(data.terrain), decodeGrid(data.region), decodeGrid(data.far)];
  const heightAt = (x, z) => {
    for (const G of grids) {
      if (!G) continue;
      const h = sampleGrid(G, x, z);
      if (h !== null) return h;
    }
    return 0;
  };
  return { heightAt, terrain: grids[0], region: grids[1], far: grids[2] };
}

// A grid of heights as a mesh, uv from world x/z (uvOf), heights through
// `lift`. Vertex colors shade the slopes as if lit from the north-west (like
// a relief map): the toon light alone barely tells a gentle hill from flat.
const RELIEF = new THREE.Vector3(-1, 1.1, -1).normalize();
function gridMesh(G, uvOf, lift = (x, z, h) => h, relief = 1.6) {
  const pos = new Float32Array(G.nx * G.nz * 3);
  const uv = new Float32Array(G.nx * G.nz * 2);
  for (let i = 0; i < G.nz; i++) {
    for (let j = 0; j < G.nx; j++) {
      const k = i * G.nx + j;
      const x = G.x0 + j * G.step;
      const z = G.z0 + i * G.step;
      pos.set([x, lift(x, z, G.h[k]), z], k * 3);
      uv.set(uvOf(x, z), k * 2);
    }
  }
  const index = [];
  for (let i = 0; i < G.nz - 1; i++) {
    for (let j = 0; j < G.nx - 1; j++) {
      const a = i * G.nx + j;
      index.push(a, a + G.nx, a + 1, a + 1, a + G.nx, a + G.nx + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const col = new Float32Array(n.count * 3);
  const flatLit = RELIEF.y;
  for (let k = 0; k < n.count; k++) {
    const lit = n.getX(k) * RELIEF.x + n.getY(k) * RELIEF.y + n.getZ(k) * RELIEF.z;
    const v = Math.min(1.12, Math.max(0.62, 1 + (lit - flatLit) * relief));
    col.set([v, v, v], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Triangles cut down until no edge is longer than `max`, then laid on the
// terrain (water and anything else flat that has to follow the ground).
function drape(positions, heightAt, lift, max = 12) {
  const out = [];
  const stack = [];
  for (let i = 0; i < positions.length; i += 9) stack.push(positions.slice(i, i + 9));
  while (stack.length) {
    const t = stack.pop();
    const d = (a, b) => Math.hypot(t[a] - t[b], t[a + 2] - t[b + 2]);
    const e = [d(0, 3), d(3, 6), d(6, 0)];
    const k = e.indexOf(Math.max(...e));
    if (e[k] <= max) {
      for (let v = 0; v < 9; v += 3) out.push(t[v], heightAt(t[v], t[v + 2]) + lift, t[v + 2]);
      continue;
    }
    // Split the longest edge in two.
    const [a, b, c] = [[0, 3, 6], [3, 6, 0], [6, 0, 3]][k];
    const m = [(t[a] + t[b]) / 2, 0, (t[a + 2] + t[b + 2]) / 2];
    const P = (o) => [t[o], t[o + 1], t[o + 2]];
    stack.push([...P(a), ...m, ...P(c)], [...m, ...P(b), ...P(c)]);
  }
  return out;
}

// Flat triangles for a ring (+ holes) at height y, facing up.
function capTriangles(pts, holes, y, out) {
  const tris = THREE.ShapeUtils.triangulateShape(pts, holes);
  const all = [...pts, ...holes.flat()];
  for (const [a, b, c] of tris) {
    const A = all[a];
    const B = all[b];
    const C = all[c];
    const up = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y) > 0;
    const [p, q] = up ? [B, C] : [C, B];
    out.push(A.x, y, A.y, p.x, y, p.y, q.x, y, q.y);
  }
}

// Inverted-hull outline from a closed-ish triangle soup (positions only).
function hull(positions, width) {
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g = mergeVertices(g, 1e-3);
  g.computeVertexNormals();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * width, pos.getY(i) + nor.getY(i) * width, pos.getZ(i) + nor.getZ(i) * width);
  }
  g.deleteAttribute('normal');
  return g;
}

const INK_MAT = () => new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

// Bakes a color into a geometry (non-indexed, position + normal only), so
// differently colored pieces can share one vertex-colored mesh.
function tint(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function geometry(positions, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

// ---- Facades ----
// One texture per style: 8 bays by 4 floors, so lit windows at night don't
// repeat every bay. The emissive map holds just the lit panes.
const BAYS_TEX = 8;
const FLOORS_TEX = 4;
const STYLES = {
  brick: { wall: '#a2523d', mortar: '#8a4130', band: '#d8c8ae', frame: '#efe6d6', glass: '#2c3d5a', kind: 'punched' },
  tan: { wall: '#c9a676', mortar: '#b38f60', band: '#e6d6b8', frame: '#4b3c2e', glass: '#30445c', kind: 'punched' },
  concrete: { wall: '#d6d3cb', mortar: '#bdb9b0', band: '#a9a59c', frame: '#8f989e', glass: '#36536e', kind: 'ribbon' },
  glass: { wall: '#7fb1c9', mortar: '#6a9db6', band: '#41606f', frame: '#e3e8ea', glass: '#5d94b0', kind: 'curtain' },
};

function facadeTextures(style, rnd) {
  const S = STYLES[style];
  const bw = 64;
  const fh = 64;
  const W = bw * BAYS_TEX;
  const H = fh * FLOORS_TEX;
  const lit = [];
  const map = paint(W, H, (ctx) => {
    ctx.fillStyle = S.wall;
    ctx.fillRect(0, 0, W, H);
    if (S.kind !== 'curtain') {
      // Brick courses / panel seams.
      ctx.strokeStyle = S.mortar;
      ctx.lineWidth = 1;
      const course = S.kind === 'punched' ? 4 : 32;
      for (let y = 0; y < H; y += course) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
        ctx.stroke();
      }
      if (S.kind === 'ribbon') for (let x = 0; x < W; x += bw) ctx.strokeRect(x + 0.5, 0, bw, H);
    }
    for (let f = 0; f < FLOORS_TEX; f++) {
      const top = H - (f + 1) * fh; // floor 0 at the bottom
      // Floor band.
      ctx.fillStyle = S.band;
      ctx.fillRect(0, top, W, S.kind === 'curtain' ? 9 : 5);
      if (S.kind === 'ribbon') {
        ctx.fillStyle = S.frame;
        ctx.fillRect(0, top + 20, W, 30);
        for (let b = 0; b < BAYS_TEX; b++) {
          ctx.fillStyle = S.glass;
          ctx.fillRect(b * bw + 3, top + 23, bw - 6, 24);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(b * bw + 6, top + 25, 10, 20);
          if (rnd() < 0.5) lit.push([b * bw + 3, top + 23, bw - 6, 24]);
        }
      } else if (S.kind === 'curtain') {
        for (let b = 0; b < BAYS_TEX; b++) {
          for (const half of [0, 1]) {
            const x = b * bw + half * (bw / 2);
            ctx.fillStyle = S.glass;
            ctx.fillRect(x + 2, top + 11, bw / 2 - 4, fh - 13);
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.beginPath();
            ctx.moveTo(x + 4, top + fh - 6);
            ctx.lineTo(x + 12, top + 13);
            ctx.lineTo(x + 18, top + 13);
            ctx.lineTo(x + 10, top + fh - 6);
            ctx.fill();
            if (rnd() < 0.35) lit.push([x + 2, top + 11, bw / 2 - 4, fh - 13]);
          }
        }
        ctx.fillStyle = S.frame;
        for (let x = 0; x <= W; x += bw / 2) ctx.fillRect(x - 1.5, 0, 3, H);
      } else {
        for (let b = 0; b < BAYS_TEX; b++) {
          const x = b * bw + 14;
          const y = top + 16;
          const w = bw - 28;
          const h = fh - 26;
          ctx.fillStyle = S.frame;
          ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
          ctx.fillStyle = S.glass;
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(x + 3, y + 3, 6, h - 6);
          ctx.fillStyle = S.frame;
          ctx.fillRect(x + w / 2 - 1, y, 2, h); // mullion
          ctx.fillStyle = S.band;
          ctx.fillRect(x - 5, y + h + 3, w + 10, 4); // sill
          if (rnd() < 0.45) lit.push([x, y, w, h]);
        }
      }
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const glow = paint(W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    for (const [x, y, w, h] of lit) {
      ctx.fillStyle = rnd() < 0.8 ? '#ffd88a' : '#d6ecff';
      ctx.fillRect(x, y, w, h);
    }
  });
  glow.wrapS = glow.wrapT = THREE.RepeatWrapping;
  return { map, glow };
}

function roofTexture() {
  const rnd = seeded(41);
  const tex = paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a9abaf';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    ctx.strokeStyle = 'rgba(70,72,78,0.25)';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 1, 0);
      ctx.lineTo(x + 1, h);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---- Parking lots: rows of stalls along each lot's long side ----

function lotStalls(pts, rnd) {
  // Orientation: the edge direction whose bounding box is smallest.
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a.distanceTo(b) < 4) continue;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    for (const p of pts) {
      const u = p.x * c + p.y * s;
      const w = -p.x * s + p.y * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w);
    }
    const area = (u1 - u0) * (w1 - w0);
    if (!best || area < best.area) best = { area, ang, u0, u1, w0, w1 };
  }
  if (!best) return [];
  let { ang, u0, u1, w0, w1 } = best;
  if (u1 - u0 < w1 - w0) { // rows run along the long side
    ang += Math.PI / 2;
    [u0, u1, w0, w1] = [w0, w1, -u1, -u0];
  }
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const world = (u, w) => [u * c - w * s, u * s + w * c];
  const stalls = [];
  const SW = 2.7;
  const SL = 5.4;
  // [stall row, stall row, aisle] across the lot.
  for (let w = w0 + 1.2; w + SL < w1 - 0.5; w += SL * 2 + 6.6) {
    for (const [rowW, face] of [[w + SL / 2, 1], [w + SL * 1.5, -1]]) {
      if (rowW + SL / 2 > w1 - 0.5) continue;
      for (let u = u0 + 1.5 + SW / 2; u < u1 - 1.5; u += SW) {
        const [x, z] = world(u, rowW);
        const corners = [[-SW / 2, -SL / 2], [SW / 2, -SL / 2], [SW / 2, SL / 2], [-SW / 2, SL / 2]].map(([du, dw]) => world(u + du, rowW + dw));
        if (!corners.every(([cx, cz]) => insideRing(cx, cz, pts))) continue;
        if (edgeDistance(x, z, pts) < 1.6) continue;
        stalls.push({ x, z, ang, face, corners, car: rnd() < 0.68 });
      }
    }
  }
  return stalls;
}

// ---- The painted ground ----

function tracePolys(ctx, polys) {
  for (const poly of polys) {
    for (const ring of poly) {
      ctx.moveTo(m(ring[0]), m(ring[1]));
      for (let i = 2; i < ring.length; i += 2) ctx.lineTo(m(ring[i]), m(ring[i + 1]));
      ctx.closePath();
    }
  }
}

function paintGround(data, stalls, trees, footprints) {
  const [bx0, bz0, bx1, bz1] = data.bounds.map(m);
  const scale = Math.min(PX_PER_M, 4096 / (bx1 - bx0), 4096 / (bz1 - bz0));
  const W = Math.ceil((bx1 - bx0) * scale);
  const H = Math.ceil((bz1 - bz0) * scale);
  const rnd = seeded(77);
  const L = data.layers;
  const tex = paint(W, H, (ctx) => {
    ctx.setTransform(scale, 0, 0, scale, -bx0 * scale, -bz0 * scale);
    ctx.lineJoin = 'round';
    const px = 1 / scale; // one pixel, in meters
    const layer = (polys, fill, edge, edgeW) => {
      ctx.beginPath();
      tracePolys(ctx, polys);
      if (edge) {
        ctx.strokeStyle = edge;
        ctx.lineWidth = edgeW;
        ctx.stroke();
      }
      ctx.fillStyle = fill;
      ctx.fill('nonzero');
    };
    const clipped = (polys, draw) => {
      ctx.save();
      ctx.beginPath();
      tracePolys(ctx, polys);
      ctx.clip('nonzero');
      draw();
      ctx.restore();
    };
    const speckle = (count, colors, size) => {
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = colors[i % colors.length];
        const s = size * (0.6 + rnd() * 0.8);
        ctx.fillRect(bx0 + rnd() * (bx1 - bx0), bz0 + rnd() * (bz1 - bz0), s, s);
      }
    };

    // Meadow, then lawns with mowing stripes, then woods.
    layer(L.ground, '#a3c46c');
    speckle(26000, ['#93b660', '#b2cf7a', '#8aad58'], 0.9);
    layer(L.grass, '#78c457', '#5f9a45', 0.6);
    clipped(L.grass, () => {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.save();
      ctx.rotate(0.6);
      for (let x = -1400; x < 1400; x += 12) ctx.fillRect(x, -1400, 6, 2800);
      ctx.restore();
      speckle(14000, ['#6cb54d', '#86cf62'], 0.7);
    });
    layer(L.wood, '#4e8a3d', '#3c6e30', 0.8);

    // River with its pale shallows.
    layer(L.water, '#3f8fd0', '#2a4f73', 1.0);
    clipped(L.water, () => {
      ctx.beginPath();
      tracePolys(ctx, L.water);
      ctx.strokeStyle = '#86c8f0';
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    // Sports fields: turf with a white line just inside the edge.
    layer(L.pitch, '#5aa65a', '#3d7a40', 0.8);
    clipped(L.pitch, () => {
      ctx.beginPath();
      tracePolys(ctx, L.pitch);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 4;
      ctx.stroke();
    });

    // Parking: asphalt, then the stall lines.
    layer(L.parking, '#7a7c84', '#45464e', 0.9);
    ctx.strokeStyle = 'rgba(245,245,235,0.85)';
    ctx.lineWidth = Math.max(px, 0.16);
    ctx.beginPath();
    for (const s of stalls) {
      const [a, b, c, d] = s.corners;
      ctx.moveTo(a[0], a[1]); ctx.lineTo(d[0], d[1]);
      ctx.moveTo(b[0], b[1]); ctx.lineTo(c[0], c[1]);
    }
    ctx.stroke();

    // Walkways and roads.
    layer(L.path, '#e6dcc8', '#b3a68e', 0.5);
    layer(L.road, '#5c5e67', '#33343c', 0.8);

    // Soft shadows: under every tree, and around each building's foot.
    ctx.fillStyle = 'rgba(28,48,20,0.22)';
    for (const t of trees) {
      ctx.beginPath();
      ctx.ellipse(t.x + 0.6, t.z + 0.6, t.r * 0.95, t.r * 0.85, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(20,24,28,0.5)';
    ctx.shadowBlur = 2.2 * scale;
    ctx.fillStyle = '#3d3f46';
    for (const pts of footprints) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Fade the edges out into the farmland around the campus.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    const fade = 60 * scale;
    for (const [x0, y0, x1, y1, rect] of [
      [0, 0, fade, 0, [0, 0, fade, H]], [W, 0, W - fade, 0, [W - fade, 0, fade, H]],
      [0, 0, 0, fade, [0, 0, W, fade]], [0, H, 0, H - fade, [0, H - fade, W, fade]],
    ]) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(...rect);
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.userData.cached = true;
  return { tex, bounds: [bx0, bz0, bx1, bz1] };
}

// ---- Shared unit geometries for instanced things ----

function blobGeometry(w, h, single = false) {
  // A maple's canopy: one big puff and two smaller ones, unit sized.
  const parts = (single ? [[0, 0, 0, 1.1]] : [
    [0, 0, 0, 1],
    [0.45, -0.25, 0.3, 0.6],
    [-0.4, -0.2, -0.35, 0.62],
  ]).map(([x, y, z, r]) => {
    const g = new THREE.SphereGeometry(r, w, h);
    g.translate(x, y, z);
    return g;
  });
  const g = mergeGeometries(parts);
  g.scale(1 / 1.15, 1 / 1.1, 1 / 1.15);
  return g;
}

function pineGeometry() {
  const parts = [[0, 0.42, 1], [0.32, 0.4, 0.76], [0.6, 0.4, 0.5]].map(([y, h, r]) => {
    const g = new THREE.ConeGeometry(r, h, 8, 1, true); // open: never seen from below
    g.translate(0, y + h / 2, 0);
    return g;
  });
  return mergeGeometries(parts);
}

function carGeometry() {
  // Body and cabin with baked tints (white body takes the instance color,
  // dark glass stays dark). Seen from far above, so: two boxes.
  const body = new THREE.BoxGeometry(4.4, 0.95, 1.85);
  body.translate(0, 0.55, 0);
  const cabin = new THREE.BoxGeometry(2.3, 0.62, 1.62);
  cabin.translate(-0.25, 1.33, 0);
  const tint = (g, v) => {
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(v), 3));
    return g;
  };
  return mergeGeometries([tint(body, 1), tint(cabin, 0.28)]);
}

// The cars' outline: one box around the body.
function carOutline() {
  const box = new THREE.BoxGeometry(4.4 + 0.14, 0.95 + 0.14, 1.85 + 0.14);
  box.translate(0, 0.55, 0);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  return box;
}

// Inflated copy of a unit geometry for instanced outlines.
function unitHull(g, w) {
  const p = g.index ? g.toNonIndexed().attributes.position.array : g.attributes.position.array;
  return hull(Array.from(p), w);
}

function instanced(geo, mat, matrices, colors) {
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((mx, i) => mesh.setMatrixAt(i, mx));
  if (colors) colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.computeBoundingSphere();
  return mesh;
}

// ---- Building the campus (once) ----

function buildCampus(data) {
  const rnd = seeded(9);
  const { heightAt, terrain, region, far } = terrainOf(data);
  const meshes = []; // [mesh], all at campus coordinates
  const facades = Object.fromEntries(Object.keys(STYLES).map((s) => {
    const { map, glow } = facadeTextures(s, rnd);
    const mat = toon(0xffffff, { map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0 });
    return [s, { mat, pos: [], uv: [] }];
  }));
  const roofMat = toon(0xffffff, { map: roofTexture() });
  const trimMat = toon(0xffffff, { vertexColors: true }); // parapets and rooftop units
  const inkMat = INK_MAT();
  const roofPos = [];
  const roofUv = [];
  const trimPos = [];
  const unitGeos = [];
  const inkGeos = [];
  const footprints = [];

  const styleOrder = ['brick', 'brick', 'tan', 'brick', 'concrete', 'tan', 'glass', 'brick', 'concrete', 'tan'];
  data.buildings.forEach((b, bi) => {
    let pts = ringPoints(b.ring);
    if (ringArea(pts) < 0) pts = pts.reverse();
    footprints.push(pts);
    const style = styleOrder[bi % styleOrder.length];
    const F = facades[style];
    // Measured buildings come in parts at their own roof heights, standing
    // on the lowest ground around them (walls go a little into the slope).
    const base = b.parts ? b.base : 0;
    const parts = b.parts
      ? b.parts.map((p) => ({ top: p.top, rings: p.rings.map(ringPoints) }))
      : [{ top: b.h, rings: [pts, ...(b.holes ?? []).map(ringPoints)] }];
    let u = Math.floor(rnd() * BAYS_TEX);
    for (const part of parts) {
      let [outer, ...holes] = part.rings;
      if (ringArea(outer) < 0) outer = outer.reverse();
      holes = holes.map((hl) => (ringArea(hl) > 0 ? hl.reverse() : hl));
      const h = part.top;
      const y0 = base - 0.6;
      const floors = Math.max(1, Math.round((h - base - 1) / FLOOR));
      const v1 = floors / FLOORS_TEX;
      const top = h + PARAPET;
      const hullPos = [];
      for (const ring of [outer, ...holes]) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const c = ring[(i + 1) % ring.length];
          const len = a.distanceTo(c);
          if (len < 0.05) continue;
          // Whole bays per wall so windows never get cut at a corner; short
          // walls show just the brick between two windows.
          const bays = len >= 2.2 ? Math.max(1, Math.round(len / BAY)) : 0;
          const ua = bays ? u : u - 0.15 / BAYS_TEX;
          const uc = bays ? u + bays / BAYS_TEX : u + 0.15 / BAYS_TEX;
          if (bays) u = uc;
          // Rings have the building on their left (outer ring counter-clockwise
          // in x/z, courtyards the other way), so `out` winds the face to the right.
          const quad = (pos, uvs, ya, yb, out, uv) => {
            const P = [[a.x, ya, a.y], [c.x, ya, c.y], [c.x, yb, c.y], [a.x, yb, a.y]];
            const T = uv ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
            const order = out ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
            for (const k of order) {
              pos.push(...P[k]);
              uvs?.push(...T[k]);
            }
          };
          quad(F.pos, F.uv, y0, h, true, [[ua, 0], [uc, 0], [uc, v1], [ua, v1]]);
          quad(trimPos, null, h, top, true);
          quad(trimPos, null, h, top, false); // the parapet's inside, seen from above
          quad(hullPos, null, y0, top, true);
        }
      }
      // Roof just under the parapet, and a cap on the outline hull.
      const roofTris = [];
      capTriangles(outer, holes, h, roofTris);
      roofPos.push(...roofTris);
      for (let i = 0; i < roofTris.length; i += 3) roofUv.push(roofTris[i] / 12, roofTris[i + 2] / 12);
      capTriangles(outer, holes, top, hullPos);
      inkGeos.push(hull(hullPos, 0.22));
      roofUnits(outer, holes, h);
    }
  });

  // Rooftop units on the bigger roofs, lined up with the longest wall.
  function roofUnits(pts, holes, h) {
    const area = Math.abs(ringArea(pts));
    if (area < 250) return;
    let longest = 0;
    let yaw = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const c = pts[(i + 1) % pts.length];
      const len = a.distanceTo(c);
      if (len > longest) { longest = len; yaw = -Math.atan2(c.y - a.y, c.x - a.x); }
    }
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.y);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const want = Math.min(7, Math.max(1, Math.round(area / 700)));
    for (let tries = 0, placed = 0; tries < 60 && placed < want; tries++) {
      const x = x0 + rnd() * (x1 - x0);
      const z = z0 + rnd() * (z1 - z0);
      const w = 2 + rnd() * 3;
      const d = 1.6 + rnd() * 1.6;
      if (!insideRing(x, z, pts) || edgeDistance(x, z, pts) < Math.max(w, d) / 2 + 1.5) continue;
      if (holes.some((hole) => insideRing(x, z, hole) || edgeDistance(x, z, hole) < 4)) continue;
      const uh = 0.9 + rnd() * 0.8;
      const box = new THREE.BoxGeometry(w, uh, d);
      box.rotateY(yaw);
      box.translate(x, h + uh / 2, z);
      unitGeos.push(box);
      if (rnd() < 0.6) { // a fan on top
        const fan = new THREE.CylinderGeometry(0.45, 0.45, 0.2, 10);
        fan.translate(x + 0.5 * Math.cos(-yaw), h + uh + 0.1, z + 0.5 * Math.sin(-yaw));
        unitGeos.push(fan);
      }
      placed++;
    }
  }

  for (const F of Object.values(facades)) {
    if (F.pos.length) meshes.push(new THREE.Mesh(geometry(F.pos, F.uv), F.mat));
  }
  meshes.push(new THREE.Mesh(geometry(roofPos, roofUv), roofMat));
  const trim = [tint(geometry(trimPos), 0xe9e3d6)];
  if (unitGeos.length) {
    const units = mergeGeometries(unitGeos.map((g) => g.toNonIndexed()));
    trim.push(tint(units, 0xc7cad0));
    inkGeos.push(unitHull(units, 0.1));
  }
  meshes.push(new THREE.Mesh(mergeGeometries(trim), trimMat));

  // ---- Trees ----
  const trees = [];
  for (let i = 0; i < data.trees.length; i += 5) {
    const [x, z, top, base, r] = data.trees.slice(i, i + 5).map(m);
    trees.push({ x, z, top, base, r });
  }
  const leafMat = toon(0xffffff);
  const trunkMat = toon(0x7a5232);
  const greens = [0x4caf50, 0x5ab94e, 0x3f9e48, 0x6cc04a, 0x58a845, 0x479c3e];
  const autumn = [0xe8812c, 0xd94a2b, 0xf2b53a, 0xc9352f, 0xe9a23b];
  const pines = [0x2f7d4a, 0x2a6e43, 0x367f52, 0x24653d];
  const forest = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const t of trees) {
    const spin = q.setFromAxisAngle(up, rnd() * Math.PI * 2).clone();
    const tall = t.top - t.base;
    const g = heightAt(t.x, t.z);
    if (rnd() < 0.36) {
      forest.push({
        x: t.x, z: t.z, g, top: t.top, kind: 'pine', color: new THREE.Color(pines[Math.floor(rnd() * pines.length)]),
        m: new THREE.Matrix4().compose(new THREE.Vector3(t.x, g + t.base * 0.55, t.z), spin, new THREE.Vector3(t.r * 0.72, t.top - t.base * 0.55, t.r * 0.72)),
        trunk: new THREE.Matrix4().compose(new THREE.Vector3(t.x, g - 0.5, t.z), spin, new THREE.Vector3(0.3, t.base * 0.8 + 0.5, 0.3)),
      });
    } else {
      const fall = rnd() < 0.24;
      const cy = t.base + tall * 0.52;
      const colors = fall ? autumn : greens;
      forest.push({
        x: t.x, z: t.z, g, top: t.top, kind: 'maple', color: new THREE.Color(colors[Math.floor(rnd() * colors.length)]),
        m: new THREE.Matrix4().compose(new THREE.Vector3(t.x, g + cy, t.z), spin, new THREE.Vector3(t.r * 0.92, tall * 0.5, t.r * 0.92)),
        trunk: new THREE.Matrix4().compose(new THREE.Vector3(t.x, g - 0.5, t.z), spin, new THREE.Vector3(0.38, cy + 0.5, 0.38)),
      });
    }
  }
  // Maples near where a scene looks from get three puffs; far ones one low-poly puff.
  const blob = blobGeometry(10, 7);
  const farBlob = blobGeometry(6, 4, true);
  const pine = pineGeometry();
  const trunk = new THREE.CylinderGeometry(0.7, 1, 1, 5, 1, true);
  trunk.translate(0, 0.5, 0);
  const treeKit = {
    forest,
    leafMat, trunkMat, inkMat: INK_MAT(),
    blob, blobInk: unitHull(blob, 0.06), farBlob, farBlobInk: unitHull(farBlob, 0.07),
    pine, pineInk: unitHull(pine, 0.07), trunk,
    sets: new Map(),
  };

  // ---- Parked cars ----
  const stalls = [];
  for (const poly of data.layers.parking) stalls.push(...lotStalls(ringPoints(poly[0]), rnd));
  const carColors = [0xf4f4f4, 0xc9ccd2, 0x2b2d33, 0xc8352f, 0x2f5fb3, 0x7a8088, 0x2f6b4a, 0xe8c64a, 0x8b2f3c];
  const cars = { m: [], c: [] };
  for (const s of stalls) {
    if (!s.car) continue;
    const yaw = -(s.ang + Math.PI / 2) + (s.face < 0 ? Math.PI : 0) + (rnd() - 0.5) * 0.08;
    cars.m.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, heightAt(s.x, s.z) - 0.05, s.z), q.setFromAxisAngle(up, yaw).clone(), new THREE.Vector3(1, 1, 1)));
    cars.c.push(new THREE.Color(carColors[Math.floor(rnd() * carColors.length)]));
  }
  if (cars.m.length) {
    const car = carGeometry();
    meshes.push(instanced(car, toon(0xffffff, { vertexColors: true }), cars.m, cars.c));
    meshes.push(instanced(carOutline(), INK_MAT(), cars.m));
  }

  // ---- Ground and river ----
  const { tex, bounds } = paintGround(data, stalls, trees, footprints);
  const [bx0, bz0, bx1, bz1] = bounds;
  const uvOf = (x, z) => [Math.min(1, Math.max(0, (x - bx0) / (bx1 - bx0))), Math.min(1, Math.max(0, 1 - (z - bz0) / (bz1 - bz0)))];
  let ground;
  if (terrain) {
    ground = gridMesh(terrain, uvOf);
  } else {
    ground = new THREE.BufferGeometry();
    ground.setAttribute('position', new THREE.Float32BufferAttribute([bx0, 0, bz0, bx0, 0, bz1, bx1, 0, bz1, bx1, 0, bz0], 3));
    ground.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    ground.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 1], 2));
    ground.setIndex([0, 1, 2, 0, 2, 3]);
  }
  const groundMesh = new THREE.Mesh(ground, toon(0xffffff, { map: tex, transparent: true, vertexColors: !!terrain }));
  groundMesh.renderOrder = -2;
  meshes.push(groundMesh);

  const flat = [];
  for (const poly of data.layers.water) capTriangles(ringPoints(poly[0]), poly.slice(1).map(ringPoints), 0, flat);
  const waterPos = drape(flat, heightAt, 0.25);
  const waterUv = [];
  for (let i = 0; i < waterPos.length; i += 3) waterUv.push(waterPos[i] / 36, waterPos[i + 2] / 36);
  const ripples = rippleTexture();
  const waterMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, map: ripples, transparent: true, opacity: 0.55, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const water = new THREE.Mesh(geometry(waterPos, waterUv), waterMat);
  water.renderOrder = -1;
  meshes.push(water);

  // The countryside: the real hills and the river around campus.
  const country = buildCountryside(data, { heightAt, region, far, bounds });
  for (const mesh of country) mesh.userData.countryside = true;
  meshes.push(...country);

  // All the outlines in one mesh.
  meshes.push(new THREE.Mesh(mergeGeometries(inkGeos), inkMat));

  for (const mesh of meshes) mesh.userData.cached = true;
  const glass = Object.values(facades).map((f) => f.mat);
  return { meshes, glass, ripples, waterMat, bounds, trees: treeKit, ground: tex };
}

function rippleTexture() {
  const rnd = seeded(5);
  const tex = paint(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const len = 14 + rnd() * 26;
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const px = x + t * len;
        const py = y + Math.sin(t * Math.PI * 2) * 2.5;
        for (const dx of [-w, 0, w]) {
          if (k === 0) ctx.moveTo(px + dx, py);
          else ctx.lineTo(px + dx, py);
        }
      }
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.userData.cached = true;
  return tex;
}

// ---- The countryside around it ----
// The real lay of the land out to 40 km (tools/prep_terrain.py): farm fields
// draped over it, the river and ponds, red barns. The farthest hills are
// stretched taller (up to 3x past 20 km) so the Adirondack foothills to the
// south-east still read on the horizon; nearby it's true to scale.

function fieldsTexture() {
  const rnd = seeded(13);
  const fields = paint(1024, 1024, (ctx, w, h) => {
    const colors = ['#9fc46a', '#b7cf74', '#8fb85e', '#c9c77a', '#a8c46e', '#86ad57', '#b9b46a'];
    // Rows of fields of uneven sizes, plowed lines across each.
    for (let y = 0; y < h;) {
      const rh = 70 + Math.floor(rnd() * 4) * 30;
      for (let x = 0; x < w;) {
        const fw = Math.min(w - x, 90 + Math.floor(rnd() * 5) * 40);
        ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
        ctx.fillRect(x, y, fw, rh);
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 2;
        const across = rnd() < 0.5;
        for (let k = 6; k < (across ? rh : fw); k += 9) {
          ctx.beginPath();
          if (across) { ctx.moveTo(x, y + k); ctx.lineTo(x + fw, y + k); } else { ctx.moveTo(x + k, y); ctx.lineTo(x + k, y + rh); }
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(70,110,50,0.55)'; // hedgerows
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, fw, rh);
        x += fw;
      }
      y += rh;
    }
  });
  fields.wrapS = fields.wrapT = THREE.RepeatWrapping;
  fields.anisotropy = 8;
  fields.userData.cached = true;
  return fields;
}

function buildCountryside(data, { heightAt, region, far, bounds }) {
  const rnd = seeded(13);
  const meshes = [];
  const fields = toon(0xffffff, { map: fieldsTexture(), vertexColors: !!region });
  const fieldUv = (x, z) => [x / 1400, z / 1400];
  const [bx0, bz0, bx1, bz1] = bounds;
  if (region) {
    // Under the campus (but not its faded edge) the coarse grid ducks out of
    // the way of the detailed ground.
    const under = (x, z) => x > bx0 + 70 && x < bx1 - 70 && z > bz0 + 70 && z < bz1 - 70;
    meshes.push(new THREE.Mesh(gridMesh(region, fieldUv, (x, z, h) => (under(x, z) ? h - 4 : h)), fields));
  } else {
    const farm = new THREE.Mesh(new THREE.CircleGeometry(9000, 64).rotateX(-Math.PI / 2), fields);
    farm.position.y = -1.5;
    meshes.push(farm);
  }
  if (far) {
    const inRegion = (x, z) => region && Math.abs(x) < 3950 && Math.abs(z) < 3950;
    const stretch = (x, z) => {
      const d = Math.max(Math.abs(x), Math.abs(z));
      const t = Math.min(1, Math.max(0, (d - 4000) / 16000));
      return 1 + 2 * t * t * (3 - 2 * t);
    };
    meshes.push(new THREE.Mesh(gridMesh(far, fieldUv, (x, z, h) => (inRegion(x, z) ? h - 15 : h * stretch(x, z))), fields));
  }
  for (const mesh of meshes) mesh.renderOrder = -3;

  // The river and ponds (the campus ground paints its own stretch).
  const flat = [];
  for (const poly of data.waterRegion ?? []) capTriangles(ringPoints(poly[0]), poly.slice(1).map(ringPoints), 0, flat);
  if (flat.length) {
    const river = new THREE.Mesh(geometry(drape(flat, heightAt, 0.45, 30)), toon(0x3f8fd0, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    river.renderOrder = -3;
    meshes.push(river);
  }

  // Red barns and silos dotted around the farms.
  const farms = [];
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 650 + rnd() * 900;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = heightAt(x, z) - 0.5;
    const yaw = rnd() * Math.PI;
    const body = new THREE.BoxGeometry(22, 10, 13);
    body.translate(0, 5, 0);
    const roof = new THREE.CylinderGeometry(7.5, 7.5, 22.4, 4, 1, false, Math.PI / 4, Math.PI);
    roof.rotateZ(Math.PI / 2);
    roof.scale(1, 0.75, 1);
    roof.translate(0, 10, 0);
    for (const [g, color] of [[body, 0xb8382c], [roof, 0x5a5e66]]) {
      g.rotateY(yaw);
      g.translate(x, y, z);
      farms.push(tint(g, color));
    }
    const s = new THREE.CylinderGeometry(2.6, 2.6, 16, 10);
    s.translate(x + Math.cos(yaw) * 15, y + 8, z - Math.sin(yaw) * 15);
    farms.push(tint(s, 0xd8d4cc));
  }
  meshes.push(new THREE.Mesh(mergeGeometries(farms), toon(0xffffff, { vertexColors: true })));
  return meshes;
}

// ---- Sky: gradient, sun or moon, stars, all drawn at infinity ----

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 zenith, horizon, haze, sunColor, sunDir;
uniform float sunSize, glow, moon, stars, time;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.6, h));
  col = mix(col, haze, (1.0 - smoothstep(-0.02, 0.14, h)) * 0.75);
  // Stars: one dot per little patch of sky, some twinkling.
  if (stars > 0.0 && h > 0.0) {
    vec3 cell = floor(d * 160.0);
    float n = hash(cell);
    if (n > 0.993) {
      vec3 f = fract(d * 160.0) - 0.5;
      float tw = 0.65 + 0.35 * sin(time * (2.0 + n * 9.0) + n * 40.0);
      col += vec3(1.0, 0.97, 0.9) * smoothstep(0.32, 0.0, length(f)) * stars * tw * smoothstep(0.0, 0.25, h);
    }
  }
  // Sun or moon: a flat disc with a soft halo (cartoon style).
  float s = dot(d, sunDir);
  float halo = pow(max(s, 0.0), 18.0) * glow + pow(max(s, 0.0), 300.0) * 0.6;
  col += sunColor * halo;
  float edge = cos(sunSize);
  float disc = smoothstep(edge, edge + 0.0004, s);
  vec3 discCol = sunColor * 1.15;
  if (moon > 0.0) {
    // A crescent: take a bite out of the disc.
    vec3 side = normalize(cross(sunDir, vec3(0.0, 1.0, 0.0)));
    float bite = smoothstep(edge, edge + 0.0004, dot(d, normalize(sunDir + side * sunSize * 0.9)));
    disc *= 1.0 - bite * moon * 0.92;
  }
  col = mix(col, discCol, disc);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, haze: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunSize: { value: 0.04 }, glow: { value: 0.5 }, moon: { value: 0 }, stars: { value: 0 }, time: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

// Puffy toon clouds high around everything.
function makeClouds(rnd) {
  const puffs = [];
  const outline = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rnd() * 0.3;
    const d = 900 + rnd() * 900;
    const y = 200 + rnd() * 260;
    const s = 20 + rnd() * 24;
    const n = 4 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const r = (1.1 + Math.sin((k / (n - 1)) * Math.PI) * 1.1 + rnd() * 0.4) * s;
      const off = (k - (n - 1) / 2) * 1.5 * s;
      const at = (g) => {
        g.scale(1, 0.75, 1);
        g.translate(Math.cos(a) * d - Math.sin(a) * off, y + r * 0.4, Math.sin(a) * d + Math.cos(a) * off);
        return g.toNonIndexed();
      };
      // Big soft puffs need lots of segments or the toon bands turn jagged;
      // their outline doesn't.
      puffs.push(at(new THREE.SphereGeometry(r, 26, 13)));
      outline.push(at(new THREE.SphereGeometry(r + 2.5, 14, 8)));
    }
  }
  const ink = mergeGeometries(outline);
  ink.deleteAttribute('normal');
  ink.deleteAttribute('uv');
  return { puffs: mergeGeometries(puffs), ink };
}

// Each world gets its own cloud material (its color follows the time of
// day); the geometry is built once.
let cloudGeometry = null;
function cloudLayer() {
  cloudGeometry ??= makeClouds(seeded(31));
  const mat = toon(0xffffff, { emissive: 0x2a3550 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(cloudGeometry.puffs, mat), new THREE.Mesh(cloudGeometry.ink, INK_MAT()));
  for (const mesh of group.children) mesh.userData.cached = true;
  return { group, mat };
}

// ---- A world: sky, lights, fog, countryside, and the campus once it's in ----
// center: the campus spot [x, z] (meters, x east, z south) that ends up under
// the scene's origin; yaw turns the campus around it; drop is how far below
// the origin the ground lies. time: a TIMES name, or a number for cycle().
// near: maples closer than this to `center` get the detailed look. clear:
// { radius, top } keeps trees around `center` below `top` (datum meters).

export function createCampusWorld(scene, { center = [0, 0], yaw = 0, drop = 30, time = 'day', near = 170, clear = null } = {}) {
  const root = new THREE.Group();
  root.position.y = -drop;
  root.rotation.y = yaw;
  const campus = new THREE.Group();
  campus.position.set(-center[0], 0, -center[1]);
  root.add(campus);
  scene.add(root);

  const sky = makeSky();
  scene.add(sky);
  const clouds = cloudLayer();
  scene.add(clouds.group);
  scene.fog = new THREE.FogExp2(0xdcefff, 0.00006); // light: the hills 20 km out still show

  const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.2);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3);
  fill.position.set(0, 2, 10);
  scene.add(hemi, key, fill);

  let assets = null;
  let disposed = false;
  const ready = loadCampus().then((a) => {
    if (!a || disposed) return;
    assets = a;
    for (const mesh of [...a.meshes, ...treeMeshes(a.trees, center, near, clear)]) {
      const copy = mesh.isInstancedMesh ? shareInstanced(mesh) : new THREE.Mesh(mesh.geometry, mesh.material);
      copy.renderOrder = mesh.renderOrder;
      copy.userData.cached = true;
      campus.add(copy);
    }
    applyPalette();
  });

  let palette = DAY;
  let elapsed = 0;
  function applyPalette() {
    const p = palette;
    const u = sky.material.uniforms;
    u.zenith.value.setHex(p.zenith);
    u.horizon.value.setHex(p.horizon);
    u.haze.value.setHex(p.haze);
    u.sunColor.value.setHex(p.sunColor);
    u.sunDir.value.set(...p.sunDir).normalize();
    u.sunSize.value = p.sunSize;
    u.glow.value = p.glow;
    u.moon.value = p.moon;
    u.stars.value = p.stars;
    scene.fog.color.setHex(p.haze);
    hemi.color.setHex(p.hemiSky);
    hemi.groundColor.setHex(p.hemiGround);
    hemi.intensity = p.hemi;
    key.color.setHex(p.key);
    key.intensity = p.keyI;
    key.position.set(...p.keyDir).multiplyScalar(30);
    fill.intensity = p.fillI;
    fill.color.setHex(p.key);
    clouds.mat.color.setHex(p.cloud);
    clouds.mat.emissive.setHex(p.cloudGlow);
    if (assets) {
      for (const g of assets.glass) g.emissiveIntensity = p.windows * 0.9;
      assets.waterMat.color.setHex(p.water).lerp(new THREE.Color(0xffffff), 0.55);
    }
  }
  function setTime(t) {
    palette = typeof t === 'number' ? cycle(t) : TIMES[t] ?? DAY;
    applyPalette();
  }
  setTime(time);

  return {
    root,
    hemi,
    key,
    fill,
    ready,
    get palette() { return palette; },
    setTime,
    update(dt) {
      elapsed += dt;
      sky.material.uniforms.time.value = elapsed;
      clouds.group.rotation.y += dt * 0.004;
      if (assets) {
        assets.ripples.offset.x = (elapsed * 0.012) % 1;
        assets.ripples.offset.y = Math.sin(elapsed * 0.3) * 0.02;
      }
    },
    dispose() {
      disposed = true;
    },
  };
}

// The trees as seen from one spot: detailed maples within `near` meters of
// it, simple ones past that. `clear` ({ radius, top, dip, front }) shrinks
// the trees around the spot so none reach above `top` (a floating stage's
// camera would otherwise be looking through their crowns), `dip` lower right
// under it; on the camera's side (+z) it reaches `front` times farther.
// Cached per spot.
function treeMeshes(kit, [cx, cz], near, clear) {
  const key = `${cx},${cz},${near},${JSON.stringify(clear)}`;
  if (!kit.sets.has(key)) {
    const close = [];
    const far = [];
    const pines = [];
    const fit = new Map();
    const shrink = new THREE.Matrix4();
    for (const t of kit.forest) {
      const d = Math.hypot(t.x - cx, t.z - cz);
      let { m, trunk } = t;
      const reach = clear ? clear.radius * (t.z > cz ? clear.front ?? 1 : 1) : 0;
      if (clear && d < reach) {
        const limit = clear.top - (clear.dip ?? 0) * (1 - d / reach);
        const f = (limit - t.g) / t.top;
        if (f < 1) {
          const k = Math.max(0.25, f);
          shrink.makeTranslation(t.x, t.g, t.z).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(-t.x, -t.g, -t.z));
          m = shrink.clone().multiply(m);
          trunk = shrink.clone().multiply(trunk);
        }
      }
      fit.set(t, { m, trunk });
      if (t.kind === 'pine') pines.push(t);
      else (d < near ? close : far).push(t);
    }
    const set = [];
    const add = (geo, mat, list, colored) => {
      if (list.length) set.push(instanced(geo, mat, list.map((t) => fit.get(t).m), colored ? list.map((t) => t.color) : null));
    };
    add(kit.blob, kit.leafMat, close, true);
    add(kit.blobInk, kit.inkMat, close);
    add(kit.farBlob, kit.leafMat, far, true);
    add(kit.farBlobInk, kit.inkMat, far);
    add(kit.pine, kit.leafMat, pines, true);
    add(kit.pineInk, kit.inkMat, pines);
    set.push(instanced(kit.trunk, kit.trunkMat, kit.forest.map((t) => fit.get(t).trunk)));
    kit.sets.set(key, set);
  }
  return kit.sets.get(key);
}

// A second InstancedMesh on the same instances (each scene gets its own mesh).
function shareInstanced(src) {
  const mesh = new THREE.InstancedMesh(src.geometry, src.material, src.count);
  mesh.instanceMatrix = src.instanceMatrix;
  mesh.instanceColor = src.instanceColor;
  mesh.boundingSphere = src.boundingSphere;
  return mesh;
}
