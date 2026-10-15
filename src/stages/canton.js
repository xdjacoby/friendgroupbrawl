import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, ink, mergeStatic, place, seeded, paint } from '../stage.js';
import { createCampusWorld } from '../campus.js';
import { FONTS } from '../fonts.js';

// SUNY Canton: a Battlefield-style floating platform high over the campus
// (src/campus.js builds the campus, the sky and the countryside). The day
// goes by during a match: day, sunset, then night with the windows lit.
// The island builders here are shared with the victory screen, which floats
// the winner over the campus on a round chunk of the same plaza.

// Where things float over the campus (campus meters: x east, z south; drop
// is from the campus datum, 125 m above sea level, which is about the ground
// here). The stage looks north up the main quad at the big brick buildings,
// high enough to clear the tallest trees around it (~30 m).
export const STAGE_SPOT = { center: [8, 130], yaw: 0, drop: 32 };
const DAY_LENGTH = 300; // seconds for a full day on the stage
const START = 0.08; // matches start in the morning

export function createCanton() {
  const main = { x1: -7.2, x2: 7.2, y: 0, top: 0, bottom: -3, passThrough: false };
  return {
    name: 'SUNY Canton',
    main,
    ledges: [
      { x: main.x1, y: main.top, dir: -1, platform: main, holder: null },
      { x: main.x2, y: main.top, dir: 1, platform: main, holder: null },
    ],
    // Battlefield's layout, low enough for everyone's first jump (the lowest
    // full hop tops out at ~2.7 m), and the top one from a side platform.
    platforms: [
      { x1: -4.6, x2: -1.8, y: 2.0, passThrough: true },
      { x1: 1.8, x2: 4.6, y: 2.0, passThrough: true },
      { x1: -1.4, x2: 1.4, y: 4.0, passThrough: true },
    ],
    blast: { left: -19, right: 19, top: 15, bottom: -10 },
    respawnY: 8,
    spawns: [
      { x: -4.5, y: 0 },
      { x: 4.5, y: 0 },
      { x: -1.8, y: 0 },
      { x: 1.8, y: 0 },
    ],
  };
}

// ---- Textures ----

// Red brick pavers in a basketweave, like the campus walkways. One tile is
// about 2 m square.
export function paverTexture() {
  const rnd = seeded(17);
  const tex = paint(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#7a4a3c';
    ctx.fillRect(0, 0, w, h);
    const u = w / 16; // a brick is 2u x u
    const shades = ['#b5654d', '#a85b45', '#bd7058', '#9e5340', '#c27a60'];
    const brick = (x, y, bw, bh) => {
      ctx.fillStyle = shades[Math.floor(rnd() * shades.length)];
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      ctx.fillStyle = 'rgba(255,240,220,0.12)';
      ctx.fillRect(x + 2, y + 2, bw - 4, 3);
    };
    // Squares of two bricks, turned every other square.
    for (let cy = 0; cy < 8; cy++) {
      for (let cx = 0; cx < 8; cx++) {
        const x = cx * 2 * u;
        const y = cy * 2 * u;
        if ((cx + cy) % 2) {
          brick(x, y, u, 2 * u);
          brick(x + u, y, u, 2 * u);
        } else {
          brick(x, y, 2 * u, u);
          brick(x, y + u, 2 * u, u);
        }
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Layered earth and rock for the island's front, with pebbles.
function strataTexture() {
  const rnd = seeded(23);
  const tex = paint(512, 512, (ctx, w, h) => {
    const bands = ['#6e4a30', '#87593a', '#7a5236', '#8e8174', '#7d7268', '#6d655d'];
    let y = 0;
    for (let i = 0; y < h; i++) {
      const bh = 60 + rnd() * 50;
      ctx.fillStyle = bands[i % bands.length];
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x / 50 + i) * 6);
      ctx.lineTo(w, y + bh + 10);
      ctx.lineTo(0, y + bh + 10);
      ctx.fill();
      y += bh;
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3e2c20';
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w;
      const py = rnd() * h;
      const r = 5 + rnd() * 12;
      ctx.fillStyle = rnd() < 0.5 ? '#a99b8c' : '#5d4636';
      for (const dx of [-w, 0, w]) {
        ctx.beginPath();
        ctx.ellipse(x + dx, py, r, r * 0.7, rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---- Island pieces ----

const hash = (x, y, z) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

// Rocky underside: a lathe that tapers to a point, nudged in and out so it
// reads as rock, banded earth -> stone by height.
function underside(R, depth) {
  const prof = [];
  const N = 10;
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    prof.push(new THREE.Vector2(Math.max(0.05, R * (1 - t ** 1.35) * (1 - 0.06 * Math.sin(t * 9))), -0.3 - t * depth));
  }
  let g = new THREE.LatheGeometry(prof, 30);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position;
  const colors = [];
  const band = [[-0.9, '#6b4a30'], [-2.0, '#86593a'], [-3.6, '#94877a'], [-6.0, '#7a7068'], [-99, '#6a625b']];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const top = y > -0.35;
    const n = top ? 0 : (hash(Math.round(x * 3), Math.round(y * 3), Math.round(z * 3)) - 0.5) * 0.35;
    pos.setXYZ(i, x * (1 + n), y + (top ? 0 : n * 0.6), z * (1 + n));
    const c = new THREE.Color(band.find(([by]) => y > by)?.[1] ?? '#6a625b');
    c.offsetHSL(0, 0, (hash(i, 1, 2) - 0.5) * 0.06);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// A grass skirt hanging over the rim with cartoon drips.
function dripSkirt(R, top, bottom, drips) {
  const pos = [];
  const segs = drips * 6;
  const at = (i, low) => {
    const a = (i / segs) * Math.PI * 2;
    const drip = Math.max(0, Math.sin(a * drips)) ** 0.7 * (0.18 + 0.2 * hash(Math.floor((a * drips) / Math.PI), 3, 1));
    return [Math.cos(a) * R, low ? bottom - drip : top, Math.sin(a) * R];
  };
  for (let i = 0; i < segs; i++) {
    const [a, b, c, d] = [at(i, false), at(i + 1, false), at(i, true), at(i + 1, true)];
    pos.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Roots hanging off the rim.
function roots(parent, R, count, mat, rnd) {
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = R * (0.92 + rnd() * 0.06);
    const len = 0.8 + rnd() * 1.4;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const pts = [0, 0.35, 0.7, 1].map((t) => out.clone().multiplyScalar(r - t * 0.3 + Math.sin(t * 5 + i) * 0.1).setY(-0.4 - t * len));
    ink(place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.06 * (1 - rnd() * 0.3), 5), mat, 0, 0, 0, parent), 0.025);
  }
}

// Little chunks of rock floating around the island. They're baked into two
// groups that bob out of step (two meshes instead of one per rock).
function chunks(parent, places, rock, grass, rnd) {
  const groups = [new THREE.Group(), new THREE.Group()];
  places.forEach(([x, y, z, s], i) => {
    const g = new THREE.Group();
    const r = ink(place(new THREE.IcosahedronGeometry(0.5, 0), rock, 0, 0, 0, g), 0.04);
    r.scale.set(1, 1.3, 1);
    r.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    const cap = ink(place(new THREE.CylinderGeometry(0.42, 0.36, 0.14, 7), grass, 0, 0.5, 0, g), 0.03);
    cap.rotation.y = rnd() * 3;
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    groups[i % 2].add(g);
  });
  groups.forEach((g, i) => {
    parent.add(g);
    mergeStatic(g);
    g.userData.phase = i * 2.4;
  });
  return groups;
}

function bob(list, time) {
  for (const g of list) {
    g.position.y = Math.sin(time * 0.9 + g.userData.phase) * 0.22;
    g.rotation.y = Math.sin(time * 0.2 + g.userData.phase) * 0.012;
  }
}

// A campus lamp post: black pole, white globe that lights up at night (the
// caller's `glow` material: set its emissiveIntensity from the time of day).
// Bake the parent with mergeStatic() afterwards.
export function lampPost(parent, x, z, glow) {
  const lamp = new THREE.Group();
  const pole = toon(0x26282e);
  ink(place(new THREE.CylinderGeometry(0.06, 0.09, 3.0, 8), pole, 0, 1.5, 0, lamp), 0.025);
  ink(place(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 8), pole, 0, 0.12, 0, lamp), 0.025);
  ink(place(new THREE.CylinderGeometry(0.13, 0.06, 0.12, 8), pole, 0, 3.05, 0, lamp), 0.02);
  const globe = place(new THREE.SphereGeometry(0.24, 16, 12), glow, 0, 3.3, 0, lamp);
  globe.castShadow = false;
  ink(globe, 0.025);
  lamp.position.set(x, 0, z);
  parent.add(lamp);
  return lamp;
}

// A campus gateway: two brick pillars and a green SUNY CANTON panel up high,
// so it shows over the heads of people standing in front of it.
export function campusArch(parent, x1, x2, z) {
  const arch = new THREE.Group();
  const brick = toon(0xa2523d);
  const stone = toon(0xddd5c6);
  const w = x2 - x1;
  const face = paint(1024, 160, (ctx, cw, ch) => {
    ctx.fillStyle = '#1f6b45';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#f2e9d0';
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, cw - 24, ch - 24);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 92px ${FONTS.ui}`;
    ctx.fillText('SUNY  CANTON', cw / 2, ch / 2 + 4);
  });
  for (const x of [x1, x2]) {
    ink(place(new RoundedBoxGeometry(0.55, 2.9, 0.55, 2, 0.04), brick, x, 1.45, 0, arch), 0.03);
    ink(place(new RoundedBoxGeometry(0.7, 0.14, 0.7, 2, 0.04), stone, x, 2.96, 0, arch), 0.03);
    ink(place(new THREE.SphereGeometry(0.16, 12, 9), stone, x, 3.12, 0, arch), 0.02);
  }
  ink(place(new RoundedBoxGeometry(w, 0.86, 0.22, 2, 0.04), brick, (x1 + x2) / 2, 2.38, 0, arch), 0.03);
  ink(place(new RoundedBoxGeometry(w + 0.2, 0.1, 0.32, 2, 0.03), stone, (x1 + x2) / 2, 2.86, 0, arch), 0.025);
  const panel = place(new THREE.PlaneGeometry(w - 0.75, 0.66), toon(0xffffff, { map: face }), (x1 + x2) / 2, 2.38, 0.115, arch);
  panel.castShadow = false;
  arch.position.z = z;
  parent.add(arch);
  return arch;
}

const grassMats = () => ({ grass: toon(0x6cc04a), dark: toon(0x4f9a3c) });

// The victory screen's island: a round chunk of brick plaza with a grass rim,
// floating over the campus. Stand things on it at y = 0.
export function roundIsland(parent, R = 7.5) {
  const rnd = seeded(4);
  const { grass, dark } = grassMats();
  const island = new THREE.Group();
  parent.add(island);
  const pavers = paverTexture();
  pavers.repeat.set((R * 2) / 2.2, (R * 2) / 2.2);
  const plaza = place(new THREE.CircleGeometry(R - 1.05, 56).rotateX(-Math.PI / 2), toon(0xffffff, { map: pavers }), 0, 0.03, 0, island);
  plaza.castShadow = false;
  const curb = place(new THREE.TorusGeometry(R - 1.05, 0.1, 6, 72).rotateX(Math.PI / 2), toon(0xddd5c6), 0, 0.05, 0, island);
  ink(curb, 0.025);
  place(new THREE.RingGeometry(R - 1.1, R + 0.12, 72, 1).rotateX(-Math.PI / 2), grass, 0, 0.02, 0, island);
  ink(place(dripSkirt(R + 0.12, 0.02, -0.42, 22), grass, 0, 0, 0, island), 0.05);
  ink(place(underside(R, R * 1.2), toon(0xffffff, { vertexColors: true }), 0, 0, 0, island), 0.06);
  roots(island, R, 9, toon(0x6b4a2e), rnd);
  // Tufts and a few shrubs along the rim, out of the way of the camera's front.
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    if (Math.abs(Math.sin(a) - 1) < 0.35) continue; // keep the front clear
    const r = R - 0.55 + rnd() * 0.4;
    const t = ink(place(new THREE.ConeGeometry(0.09, 0.32, 5), dark, Math.cos(a) * r, 0.16, Math.sin(a) * r, island), 0.015);
    t.rotation.z = (rnd() - 0.5) * 0.5;
  }
  for (const [a, s] of [[-2.2, 1], [-1.6, 0.8], [-0.7, 0.9], [-0.25, 0.75], [3.6, 0.85]]) {
    const bush = ink(place(new THREE.SphereGeometry(0.45, 12, 9), dark, Math.cos(a) * (R - 0.55), 0.3 * s, Math.sin(a) * (R - 0.55), island), 0.03);
    bush.scale.set(s, s * 0.8, s);
  }
  mergeStatic(island, { receive: true });

  const rock = toon(0x8c8076);
  const bits = chunks(parent, [
    [R + 1.6, -2.4, -2.5, 1.3], [-R - 2.0, -3.6, -1.0, 1.6], [3.0, -R * 1.25, 2.8, 1.1],
    [-4.5, -1.2, -R - 1.8, 1.0], [R - 0.5, -5.5, 3.5, 0.8], [-2.5, -6.2, -3.5, 0.9],
  ], rock, grass, rnd);
  return { group: island, update: (time) => bob(bits, time) };
}

// The stage's main platform: plaza on top, grass lip with drips, earth and
// rock tapering away underneath. Spans x1..x2, `depth` front to back.
function longIsland(parent, x1, x2, depth) {
  const rnd = seeded(6);
  const { grass, dark } = grassMats();
  const island = new THREE.Group();
  parent.add(island);
  const w = x2 - x1;
  const pavers = paverTexture();
  pavers.repeat.set(w / 2.2, depth / 2.2);
  place(new THREE.PlaneGeometry(w - 0.3, depth - 0.5).rotateX(-Math.PI / 2), toon(0xffffff, { map: pavers }), (x1 + x2) / 2, 0.012, 0, island).castShadow = false;

  // Grass lip (top at y = 0) with drips over the front.
  const L = x1 - 0.22;
  const R = x2 + 0.22;
  const cap = new THREE.Shape();
  cap.moveTo(L, -0.1);
  cap.lineTo(R, -0.1);
  cap.lineTo(R, -0.42);
  const drips = 18;
  const dw = (R - L) / drips;
  for (let i = 0; i < drips; i++) {
    const x0 = R - i * dw;
    cap.quadraticCurveTo(x0 - dw / 2, -0.42 - [0.18, 0.34, 0.12, 0.27, 0.2][i % 5] * 2, x0 - dw, -0.42);
  }
  cap.lineTo(L, -0.1);
  const capGeo = new THREE.ExtrudeGeometry(cap, { depth: depth + 0.2, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2, curveSegments: 6 });
  capGeo.translate(0, 0, -(depth + 0.2) / 2);
  ink(place(capGeo, grass, 0, 0, 0, island), 0.07);

  // The body tapers to a rocky point, like Battlefield's.
  const V2 = THREE.Vector2;
  const body = new THREE.Shape();
  body.moveTo(x1 + 0.05, -0.3);
  body.lineTo(x2 - 0.05, -0.3);
  body.splineThru([
    new V2(x2 - 0.3, -1.4), new V2(x2 - 1.4, -2.4), new V2(4.4, -3.3), new V2(2.4, -4.4), new V2(1.0, -6.0),
    new V2(-0.2, -7.6), new V2(-1.2, -5.8), new V2(-2.9, -4.3), new V2(-4.9, -3.2),
    new V2(x1 + 1.3, -2.3), new V2(x1 + 0.3, -1.3), new V2(x1 + 0.05, -0.3),
  ]);
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: depth - 0.4, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 3, curveSegments: 10 });
  bodyGeo.translate(0, 0, -(depth - 0.4) / 2);
  const strata = strataTexture();
  strata.repeat.set(0.2, 0.2);
  ink(place(bodyGeo, toon(0xffffff, { map: strata }), 0, 0, 0, island), 0.07);

  // Roots, and tufts along the back edge.
  const root = toon(0x6b4a2e);
  for (const vx of [-5.6, -3.1, -0.6, 1.9, 4.2, 6.1]) {
    const len = 0.6 + rnd() * 1.0;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(vx, -0.4, depth / 2 - 0.1), new THREE.Vector3(vx + 0.1, -0.4 - len * 0.5, depth / 2 - 0.05),
      new THREE.Vector3(vx - 0.06, -0.4 - len, depth / 2 - 0.15),
    ]);
    ink(place(new THREE.TubeGeometry(curve, 8, 0.05, 5), root, 0, 0, 0, island), 0.02);
  }
  for (let i = 0; i < 18; i++) {
    const t = ink(place(new THREE.ConeGeometry(0.09, 0.32, 5), dark, x1 + 0.3 + rnd() * (w - 0.6), 0.16, -depth / 2 + 0.25 + rnd() * 0.15, island), 0.015);
    t.rotation.z = (rnd() - 0.5) * 0.5;
  }
  mergeStatic(island, { receive: true });

  const rock = toon(0x8c8076);
  return chunks(parent, [
    [x2 + 2.2, -2.8, -1.5, 1.2], [x1 - 2.6, -3.8, -0.8, 1.5], [3.4, -8.4, 0.4, 1.1], [-5.6, -6.5, -1.6, 0.9], [6.4, -6.2, 1.2, 0.8],
  ], rock, grass, rnd);
}

// A floating stone slab (the soft platforms). Bake the parent afterwards.
function slab(parent, p, mats) {
  const w = p.x2 - p.x1;
  const g = new THREE.Group();
  ink(place(new RoundedBoxGeometry(w, 0.22, 1.8, 2, 0.06), mats.stone, 0, -0.11, 0, g), 0.045);
  const top = place(new THREE.PlaneGeometry(w - 0.24, 1.56).rotateX(-Math.PI / 2), mats.pavers, 0, 0.004, 0, g);
  top.castShadow = false;
  ink(place(new RoundedBoxGeometry(w - 0.1, 0.1, 0.12, 1, 0.03), mats.trim, 0, -0.17, 0.86, g), 0.02);
  g.position.set((p.x1 + p.x2) / 2, p.y, 0);
  parent.add(g);
  return g;
}

export function buildCanton(stage, scene) {
  const world = createCampusWorld(scene, { ...STAGE_SPOT, time: START, near: 100, clear: { radius: 190, top: STAGE_SPOT.drop - 7, dip: 10 } });
  const key = world.key;
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); // only the fighters and platforms cast shadows
  key.shadow.bias = -0.0005;
  Object.assign(key.shadow.camera, { left: -16, right: 16, top: 14, bottom: -8, near: 1, far: 70 });

  const m = stage.main;
  const bits = longIsland(scene, m.x1, m.x2, 4);
  const pavers = paverTexture();
  pavers.repeat.set(1.3, 0.75);
  const mats = { stone: toon(0xd8d0c0), trim: toon(0xa2523d), pavers: toon(0xffffff, { map: pavers }) };
  // The soft platforms and two lamps at the back of the plaza (lit at night),
  // baked together.
  const fixtures = new THREE.Group();
  scene.add(fixtures);
  for (const p of stage.platforms) slab(fixtures, p, mats);
  const glow = toon(0xfff6dd, { emissive: 0xffd88a, emissiveIntensity: 0 });
  for (const x of [m.x1 + 0.9, m.x2 - 0.9]) lampPost(fixtures, x, -1.55, glow);
  mergeStatic(fixtures, { receive: true });
  for (const mesh of fixtures.children) mesh.castShadow = mesh.material.side !== THREE.BackSide; // not the outlines

  let time = 0;
  let paletteTimer = 0;
  return {
    camera: { near: 0.5, far: 60000 },
    // The victory screen carries on at the same time of day.
    get timeOfDay() { return START + time / DAY_LENGTH; },
    update(dt) {
      time += dt;
      // The sky changes slowly: no need to recolor everything every frame.
      if ((paletteTimer -= dt) <= 0) {
        paletteTimer = 0.25;
        world.setTime(START + time / DAY_LENGTH);
        glow.emissiveIntensity = world.palette.lamps * 1.6;
      }
      world.update(dt);
      bob(bits, time);
    },
  };
}

export const CANTON = {
  id: 'canton', name: 'SUNY Canton', create: createCanton, build: buildCanton,
  thumb: 'linear-gradient(#5aa6ee 0 40%, #a2523d 40% 47%, #78c457 47% 62%, #e6dcc8 62% 66%, #78c457 66%)',
};
