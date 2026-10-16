import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// The original stage: a floating island in a cartoon valley.
// Stage layout in meters. Gameplay happens on the x/y plane at z = 0.
// Every stage returns this same shape (see stages.js for the list).
export function createStage() {
  const main = { x1: -7, x2: 7, y: 0, top: 0, bottom: -3, passThrough: false };
  return {
    name: 'Sky Island',
    main,
    // Grabbable corners of the main platform. dir = which side the hanging fighter is on.
    ledges: [
      { x: main.x1, y: main.top, dir: -1, platform: main, holder: null },
      { x: main.x2, y: main.top, dir: 1, platform: main, holder: null },
    ],
    // Low enough that everyone's first jump reaches the sides (the lowest
    // full hop tops out at ~2.7 m), and the top one from a side platform.
    platforms: [
      { x1: -4.4, x2: -1.6, y: 2.0, passThrough: true },
      { x1: 1.6, x2: 4.4, y: 2.0, passThrough: true },
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

// ---- Cartoon look ----
// Toon shading (three flat tones per color), dark "ink" outlines, and textures
// painted onto canvases at load time, so there are no image files to manage.

export const INK = 0x2a1f3d;
const V2 = THREE.Vector2;

let rampTexture = null;
function ramp() {
  if (!rampTexture) {
    rampTexture = new THREE.DataTexture(new Uint8Array([105, 185, 255]), 3, 1, THREE.RedFormat);
    rampTexture.minFilter = rampTexture.magFilter = THREE.NearestFilter;
    rampTexture.needsUpdate = true;
  }
  return rampTexture;
}

export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp(), ...extra });

// Ink outline: a slightly inflated, inside-out copy of the mesh in a dark color.
// `width` is in world units (divided by the mesh's own scale). The inflation is
// baked into the outline's vertices, so every outline shares one material and
// mergeStatic() can draw all of them in one go.
const INK_MAT = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
export function ink(mesh, width = 0.05) {
  const src = mesh.geometry;
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', src.getAttribute('position'));
  if (src.index) geo.setIndex(src.index);
  geo = mergeVertices(geo, 1e-3); // shared corners -> smooth normals -> no gaps at the edges
  geo.computeVertexNormals();
  const scale = (Math.abs(mesh.scale.x) + Math.abs(mesh.scale.y) + Math.abs(mesh.scale.z)) / 3;
  const w = width / scale;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * w, pos.getY(i) + nor.getY(i) * w, pos.getZ(i) + nor.getZ(i) * w);
  }
  mesh.add(new THREE.Mesh(geo, INK_MAT));
  return mesh;
}

// Scenery that never moves (relative to `root`) is hundreds of small meshes;
// drawing each one separately is what slows the frame down. Bake them into one
// mesh per material (all the outlines become a single mesh, and so on).
// `cast`: the merged meshes cast shadows too (a few big pieces, like a roof).
export function mergeStatic(root, { receive = false, cast = false } = {}) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const buckets = new Map();
  for (const o of meshes) {
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const keep = ['position', 'normal', ...(o.material.map ? ['uv'] : []), ...(o.material.vertexColors ? ['color'] : [])];
    for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
  }
  root.clear();
  for (const [material, geos] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), material);
    mesh.receiveShadow = receive && material !== INK_MAT;
    mesh.castShadow = cast && material !== INK_MAT && !material.transparent;
    root.add(mesh);
    for (const g of geos) g.dispose();
  }
}

// The scenery never hides a fighter. The stage's front edge sticks out ~2 m
// toward the camera, so seen from the middle of the screen it used to cover
// whoever hung on a ledge (or recovered just under it). Every scenery
// material draws its depth `meters` farther back along the line of sight:
// nothing moves on screen and the scenery still sorts itself the same way,
// but fighters, hits and projectiles always end up in front of it.
const pushedBack = new WeakSet();
export function keepBehindFighters(root, meters = 3) {
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (pushedBack.has(m)) continue;
      pushedBack.add(m);
      const before = m.onBeforeCompile;
      // Keep its program apart from unpatched materials of the same kind.
      const key = m.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : m.customProgramCacheKey.bind(m);
      m.onBeforeCompile = (shader, renderer) => {
        before.call(m, shader, renderer);
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', /* glsl */ `#include <project_vertex>
          gl_Position = projectionMatrix * vec4(mvPosition.xyz + normalize(mvPosition.xyz) * ${meters.toFixed(2)}, 1.0);`);
      };
      m.customProgramCacheKey = () => `${key()}|behind${meters}`;
      m.needsUpdate = true;
    }
  });
}

// mesh(geometry, material, x, y, z, parent) with shadows on.
export function place(geometry, material, x, y, z, parent) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Seeded random so the scenery looks the same every match.
export function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export function paint(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const SKY_TOP = '#2f8fe6';
const HORIZON = 0xc6eaff;

function skyTexture() {
  return paint(2, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(0.45, '#79c6fa');
    g.addColorStop(0.62, '#c6eaff');
    g.addColorStop(1, '#eaf8ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// Warm dirt with wavy layers and outlined pebbles. Tiles in both directions.
function dirtTexture() {
  const rnd = seeded(11);
  const tex = paint(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#c4834a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const y0 = 50 + i * 128;
      ctx.fillStyle = i % 2 ? '#b7733d' : '#ab6935';
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y0 + Math.sin((x / w) * Math.PI * 4 + i) * 10);
      for (let x = w; x >= 0; x -= 8) ctx.lineTo(x, y0 + 36 + Math.sin((x / w) * Math.PI * 4 + i + 1) * 8);
      ctx.fill();
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#5e3a1c';
    for (let i = 0; i < 34; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const rx = 6 + rnd() * 16;
      const ry = rx * (0.55 + rnd() * 0.3);
      const rot = rnd() * Math.PI;
      const color = rnd() < 0.5 ? '#8e5a2e' : '#d99c5e';
      for (const dx of [-w, 0, w]) {
        for (const dy of [-h, 0, h]) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.ellipse(x + dx, y + dy, rx, ry, rot, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,240,210,0.35)';
          ctx.beginPath();
          ctx.ellipse(x + dx - rx * 0.3, y + dy - ry * 0.3, rx * 0.35, ry * 0.25, rot, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Front of a wooden platform: four planks with grain, seams and nails.
function plankTexture() {
  const rnd = seeded(5);
  return paint(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e3b06d';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(176,112,52,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const y0 = 12 + rnd() * (h - 24);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y0 + Math.sin(x / 60 + i) * 4);
      ctx.stroke();
    }
    ctx.fillStyle = '#7b4a22';
    for (let i = 1; i < 4; i++) ctx.fillRect((i * w) / 4 - 3, 0, 6, h);
    ctx.fillRect(0, 0, w, 8);
    ctx.fillRect(0, h - 8, w, 8);
    for (let i = 0; i < 4; i++) {
      for (const x of [i * 256 + 22, i * 256 + 234]) {
        for (const y of [34, 94]) {
          ctx.fillStyle = '#5b4636';
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#b9a698';
          ctx.beginPath();
          ctx.arc(x - 2, y - 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
}

// ---- Scenery pieces ----

function grassTuft(parent, x, y, z, s, mat) {
  const tuft = new THREE.Group();
  for (const [dx, tilt, h] of [[-0.07, 0.35, 0.8], [0, 0, 1], [0.07, -0.35, 0.75]]) {
    const blade = place(new THREE.ConeGeometry(0.06, 0.4 * h, 5), mat, dx, 0.2 * h, 0, tuft);
    blade.rotation.z = tilt;
    ink(blade, 0.02);
  }
  tuft.position.set(x, y, z);
  tuft.scale.setScalar(s);
  parent.add(tuft);
}

function flower(parent, x, y, z, petalColor, stemMat, centerMat) {
  const f = new THREE.Group();
  place(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 5), stemMat, 0, 0.2, 0, f);
  const petal = toon(petalColor);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ink(place(new THREE.SphereGeometry(0.055, 10, 8), petal, Math.cos(a) * 0.07, 0.42 + Math.sin(a) * 0.07, 0, f), 0.015);
  }
  ink(place(new THREE.SphereGeometry(0.05, 10, 8), centerMat, 0, 0.42, 0.02, f), 0.015);
  f.position.set(x, y, z);
  parent.add(f);
}

function mushroom(parent, x, y, z, s) {
  const m = new THREE.Group();
  ink(place(new THREE.CylinderGeometry(0.07, 0.09, 0.28, 10), toon(0xfff4e0), 0, 0.14, 0, m), 0.02);
  const cap = ink(place(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xe8413c), 0, 0.24, 0, m), 0.025);
  cap.scale.y = 0.8;
  const dot = toon(0xffffff);
  for (const [dx, dy, dz] of [[0.08, 0.12, 0.1], [-0.09, 0.1, 0.11], [0, 0.15, -0.12], [0.02, 0.17, 0.02]]) {
    place(new THREE.SphereGeometry(0.035, 8, 6), dot, dx, 0.24 + dy * 0.8, dz, m);
  }
  m.position.set(x, y, z);
  m.scale.setScalar(s);
  parent.add(m);
}

// Lollipop tree: trunk plus one or more round canopies.
function tree(parent, x, y, z, s, leafMat, trunkMat, inkWidth) {
  const t = new THREE.Group();
  ink(place(new THREE.CylinderGeometry(0.28, 0.4, 2.6, 8), trunkMat, 0, 1.3, 0, t), inkWidth);
  ink(place(new THREE.SphereGeometry(1.5, 16, 12), leafMat, 0, 3.3, 0, t), inkWidth);
  if (s > 1) ink(place(new THREE.SphereGeometry(1.0, 14, 10), leafMat, 0.9, 2.8, 0.4, t), inkWidth);
  t.position.set(x, y, z);
  t.scale.setScalar(s);
  parent.add(t);
}

function cloud(parent, x, y, z, s, mat, rnd) {
  const c = new THREE.Group();
  const n = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const r = 1.1 + Math.sin((i / (n - 1)) * Math.PI) * 1.1 + rnd() * 0.4;
    const puff = place(new THREE.SphereGeometry(r, 18, 12), mat, (i - (n - 1) / 2) * 1.5, r * 0.45, rnd() * 0.6, c);
    puff.castShadow = false;
    puff.scale.y = 0.8;
    ink(puff, 0.14);
  }
  c.position.set(x, y, z);
  c.scale.setScalar(s);
  parent.add(c);
  return c;
}

// Small floating chunk of island for the background.
function islet(parent, x, y, z, s, grassMat, dirtMat, leafMat, trunkMat) {
  const g = new THREE.Group();
  const top = ink(place(new THREE.CylinderGeometry(1.3, 1.2, 0.35, 16), grassMat, 0, 0, 0, g), 0.05);
  top.scale.z = 0.7;
  const bottom = ink(place(new THREE.ConeGeometry(1.15, 2.2, 12), dirtMat, 0, -1.25, 0, g), 0.05);
  bottom.rotation.x = Math.PI;
  bottom.scale.z = 0.7;
  if (s > 0.9) tree(g, 0.3, 0.15, -0.2, 0.35, leafMat, trunkMat, 0.04);
  g.position.set(x, y, z);
  g.scale.setScalar(s);
  parent.add(g);
  return g;
}

export function buildStageScene(stage, scene) {
  const rnd = seeded(3);
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(HORIZON, 70, 340);

  const hemi = new THREE.HemisphereLight(0xe4f3ff, 0x6a8a4a, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3dc, 2.3);
  sun.position.set(6, 14, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); // only the fighters and platforms cast shadows
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 14, bottom: -8, near: 1, far: 50 });
  scene.add(sun);

  const grassMat = toon(0x6ccf52);
  const darkGrass = toon(0x3fa34d);
  const dirtTex = dirtTexture();
  dirtTex.repeat.set(0.22, 0.22);
  const dirtMat = toon(0xffffff, { map: dirtTex });
  const plainDirt = toon(0xb9773f);
  const leafMat = toon(0x46ad4f);
  const trunkMat = toon(0x8a5a33);

  // ---- Main island ----
  const m = stage.main;
  const island = new THREE.Group();
  scene.add(island);

  // Grass cap with cartoon drips hanging over the dirt.
  const L = m.x1 - 0.22;
  const R = m.x2 + 0.22;
  const capShape = new THREE.Shape();
  capShape.moveTo(L, -0.1);
  capShape.lineTo(R, -0.1);
  capShape.lineTo(R, -0.42);
  const drips = 18;
  const dripW = (R - L) / drips;
  for (let i = 0; i < drips; i++) {
    const x0 = R - i * dripW;
    const depth = [0.18, 0.34, 0.12, 0.27, 0.2][i % 5];
    capShape.quadraticCurveTo(x0 - dripW / 2, -0.42 - depth * 2, x0 - dripW, -0.42);
  }
  capShape.lineTo(L, -0.1);
  const capGeo = new THREE.ExtrudeGeometry(capShape, { depth: 4.0, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2, curveSegments: 6 });
  capGeo.translate(0, 0, -2.0);
  ink(place(capGeo, grassMat, 0, 0, 0, island), 0.07);

  // Dirt body that tapers to a point underneath, so it reads as a floating island.
  const body = new THREE.Shape();
  body.moveTo(m.x1 + 0.05, -0.3);
  body.lineTo(m.x2 - 0.05, -0.3);
  body.splineThru([
    new V2(m.x2 - 0.15, -1.6), new V2(m.x2 - 0.9, -2.9), new V2(4.6, -3.8), new V2(2.6, -4.5),
    new V2(1.2, -6.0), new V2(0.2, -7.2), new V2(-1.0, -5.8), new V2(-2.8, -4.7), new V2(-4.8, -3.9),
    new V2(m.x1 + 0.9, -2.9), new V2(m.x1 + 0.15, -1.6), new V2(m.x1 + 0.05, -0.3),
  ]);
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: 3.6, bevelThickness: 0.18, bevelSize: 0.18, bevelSegments: 3, curveSegments: 10 });
  bodyGeo.translate(0, 0, -1.8);
  ink(place(bodyGeo, dirtMat, 0, 0, 0, island), 0.07);

  // Vines hanging off the front edge.
  for (const vx of [-5.2, -2.3, 1.1, 3.9, 5.8]) {
    const len = 0.5 + rnd() * 0.6;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(vx, -0.4, 2.05), new THREE.Vector3(vx + 0.08, -0.4 - len * 0.5, 2.1),
      new THREE.Vector3(vx - 0.05, -0.4 - len, 2.08),
    ]);
    ink(place(new THREE.TubeGeometry(curve, 8, 0.035, 5), darkGrass, 0, 0, 0, island), 0.02);
    for (let i = 1; i <= 2; i++) {
      const p = curve.getPoint(i / 2.5);
      const leaf = ink(place(new THREE.SphereGeometry(0.08, 8, 6), leafMat, p.x + 0.07, p.y, p.z, island), 0.015);
      leaf.scale.set(1.3, 0.7, 0.6);
    }
  }

  // Decorations along the back edge, out of the fighters' way.
  for (let i = 0; i < 16; i++) {
    grassTuft(island, m.x1 + 0.4 + rnd() * (m.x2 - m.x1 - 0.8), 0, -1.3 - rnd() * 0.6, 0.8 + rnd() * 0.6, darkGrass);
  }
  const stem = toon(0x3c9a45);
  const center = toon(0xffd23f);
  [[-5.6, 0xff8fc2], [-3.4, 0xffffff], [-0.9, 0xc59bff], [2.2, 0xff8fc2], [4.5, 0xffe066], [6.1, 0xffffff]].forEach(([x, c]) => {
    flower(island, x, 0, -1.6 - rnd() * 0.3, c, stem, center);
  });
  mushroom(island, -4.5, 0, -1.7, 1.2);
  mushroom(island, -4.1, 0, -1.45, 0.7);
  mushroom(island, 5.2, 0, -1.6, 0.9);

  mergeStatic(island, { receive: true });

  // ---- Pass-through platforms: little wooden plank decks ----
  const plankMat = toon(0xffffff, { map: plankTexture() });
  for (const p of stage.platforms) {
    // Thin enough to clear the heads of people walking underneath.
    const deck = place(new RoundedBoxGeometry(p.x2 - p.x1, 0.2, 2.0, 2, 0.06), plankMat, (p.x1 + p.x2) / 2, p.y - 0.1, 0, scene);
    ink(deck, 0.045);
  }

  // ---- Background ----
  const bg = new THREE.Group();
  scene.add(bg);

  // Sun with slowly turning rays (unaffected by fog so it stays bright).
  const sunGroup = new THREE.Group();
  sunGroup.position.set(-70, 62, -260);
  bg.add(sunGroup);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshBasicMaterial({ color: 0xffe35a, fog: false }));
  sunDisc.position.z = 0.5;
  sunGroup.add(sunDisc);
  sunGroup.add(new THREE.Mesh(new THREE.CircleGeometry(15.5, 48), new THREE.MeshBasicMaterial({ color: 0xffb84d, fog: false })));
  const rays = new THREE.Group();
  const rayMat = new THREE.MeshBasicMaterial({ color: 0xfff1a6, transparent: true, opacity: 0.45, fog: false, depthWrite: false });
  for (let i = 0; i < 14; i++) {
    const shape = new THREE.Shape();
    shape.moveTo(-3, 0);
    shape.lineTo(3, 0);
    shape.lineTo(0, 30);
    const ray = new THREE.Mesh(new THREE.ShapeGeometry(shape), rayMat);
    ray.rotation.z = (i / 14) * Math.PI * 2;
    rays.add(ray);
  }
  rays.position.z = -0.5;
  sunGroup.add(rays);

  // The valley far below: a big field, rolling hills, trees and mountains.
  const field = new THREE.Mesh(new THREE.PlaneGeometry(1400, 600), toon(0x7cc95e));
  field.rotation.x = -Math.PI / 2;
  field.position.set(0, -24, -310);
  bg.add(field);

  const mountainMat = toon(0x9aa9e0);
  const snowMat = toon(0xffffff);
  [[-150, 46, 64], [-60, 40, 52], [40, 52, 74], [140, 44, 58], [230, 40, 50]].forEach(([x, r, h]) => {
    const mtn = ink(place(new THREE.ConeGeometry(r, h, 28), mountainMat, x, -24 + h / 2, -230, bg), 0.9);
    mtn.castShadow = false;
    const cap = place(new THREE.ConeGeometry(r * 0.32, h * 0.32, 28), snowMat, x, -24 + h - h * 0.16 + 0.3, -229.5, bg);
    cap.castShadow = false;
  });

  const hillLayers = [
    { z: -150, color: 0x98d68f, r: [34, 46], ink: 0.7, count: 7, spread: 520, squash: 0.45 },
    { z: -95, color: 0x6cc767, r: [20, 30], ink: 0.45, count: 8, spread: 360, squash: 0.55 },
    { z: -55, color: 0x52b75a, r: [11, 17], ink: 0.25, count: 9, spread: 230, squash: 0.6 },
  ];
  for (const layer of hillLayers) {
    const mat = toon(layer.color);
    for (let i = 0; i < layer.count; i++) {
      const r = layer.r[0] + rnd() * (layer.r[1] - layer.r[0]);
      const x = -layer.spread / 2 + (i + 0.5) * (layer.spread / layer.count) + (rnd() - 0.5) * 12;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      hill.scale.y = layer.squash;
      hill.position.set(x, -24, layer.z + (rnd() - 0.5) * 10);
      ink(hill, layer.ink);
      bg.add(hill);
      // Trees on the nearer hills, sitting on the hill's surface.
      if (layer.z > -100) {
        const trees = 1 + Math.floor(rnd() * 3);
        for (let t = 0; t < trees; t++) {
          const dx = (rnd() - 0.5) * r;
          const dz = r * 0.35;
          const surface = Math.sqrt(Math.max(0, r * r - dx * dx - dz * dz)) * layer.squash;
          tree(bg, x + dx, -24 + surface - 0.5, hill.position.z + dz, layer.z > -60 ? 1.5 : 2.4, leafMat, trunkMat, layer.ink * 0.5);
        }
      }
    }
  }
  // Trees dotted around the valley floor.
  for (let i = 0; i < 22; i++) {
    tree(bg, -170 + rnd() * 340, -24, -45 - rnd() * 60, 1.4 + rnd(), leafMat, trunkMat, 0.14);
  }

  // Puffy clouds: high ones behind the stage and a couple drifting below it.
  const cloudMat = toon(0xffffff, { emissive: 0x2a3550 });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    clouds.push(cloud(bg, -80 + i * 19 + rnd() * 6, 9 + rnd() * 16, -45 - rnd() * 40, 1 + rnd() * 0.8, cloudMat, rnd));
  }
  clouds.push(cloud(bg, -22, -10, -22, 0.9, cloudMat, rnd));
  clouds.push(cloud(bg, 18, -13, -28, 1.1, cloudMat, rnd));

  // Little floating chunks of land that bob in place.
  const islets = [
    islet(bg, -15, -3, -14, 1.2, grassMat, plainDirt, leafMat, trunkMat),
    islet(bg, 16, 2, -18, 1.0, grassMat, plainDirt, leafMat, trunkMat),
    islet(bg, 11, -8, -10, 0.6, grassMat, plainDirt, leafMat, trunkMat),
  ];
  islets.forEach((g, i) => { g.userData.baseY = g.position.y; g.userData.phase = i * 2.1; });

  // Bake everything that doesn't move; clouds, islets and the sun's rays
  // move, so each of those is baked on its own.
  const scenery = new THREE.Group();
  for (const c of [...bg.children]) if (c !== sunGroup && !clouds.includes(c) && !islets.includes(c)) scenery.add(c);
  bg.add(scenery);
  mergeStatic(scenery);
  for (const g of [...clouds, ...islets, rays]) mergeStatic(g);

  let time = 0;
  return {
    update(dt) {
      time += dt;
      for (const c of clouds) {
        c.position.x += dt * 0.8;
        if (c.position.x > 95) c.position.x = -95;
      }
      rays.rotation.z += dt * 0.05;
      for (const g of islets) g.position.y = g.userData.baseY + Math.sin(time * 0.8 + g.userData.phase) * 0.35;
    },
  };
}
