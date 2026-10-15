import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toon, ink, mergeStatic, place, seeded, paint, INK } from '../stage.js';
import { FONTS } from '../fonts.js';

// Rushton Hall: a snow day out front of the dorm. The photo of the building
// is the backdrop (turned cartoony when it loads, to match the toon look);
// in front of it: the brick plaza, the entrance canopy's roof as the top
// platform, two snowy chunks of the sign wall (RUSH / TON) as the side
// platforms, the lamp post, a bare tree, a snowman, and falling snow.

const PHOTO = 'stages/rushton-hall.jpg';

export function createRushton() {
  const main = { x1: -7.4, x2: 7.4, y: 0, top: 0, bottom: -3, passThrough: false };
  return {
    name: 'Rushton Hall',
    main,
    ledges: [
      { x: main.x1, y: main.top, dir: -1, platform: main, holder: null },
      { x: main.x2, y: main.top, dir: 1, platform: main, holder: null },
    ],
    // Low enough that everyone's first jump reaches the sides (the lowest
    // full hop tops out at ~2.7 m), and the roof from a side platform.
    platforms: [
      { x1: -6.1, x2: -3.7, y: 2.0, passThrough: true }, // RUSH
      { x1: 3.7, x2: 6.1, y: 2.0, passThrough: true }, // TON
      { x1: -2.8, x2: 2.8, y: 4.0, passThrough: true }, // the canopy roof
    ],
    blast: { left: -20, right: 20, top: 16, bottom: -10 },
    respawnY: 8.5,
    spawns: [
      { x: -4.8, y: 0 },
      { x: 4.8, y: 0 },
      { x: -1.8, y: 0 },
      { x: 1.8, y: 0 },
    ],
  };
}

// ---- Textures ----

// The cleared brick walkway, with slush along the joints.
function paverTexture() {
  const rnd = seeded(21);
  const tex = paint(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6e5147';
    ctx.fillRect(0, 0, w, h);
    const bw = 64;
    const bh = 32;
    for (let row = 0; row < h / bh; row++) {
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + (row % 2) * (bw / 2);
        const shade = ['#a4705f', '#96655a', '#ab7a66', '#8f6156'][Math.floor(rnd() * 4)];
        ctx.fillStyle = shade;
        ctx.fillRect(x + 3, row * bh + 3, bw - 6, bh - 6);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x + 3, row * bh + 3, bw - 6, 5);
      }
    }
    // Slushy patches.
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(235,244,255,${0.35 + rnd() * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(rnd() * w, rnd() * h, 18 + rnd() * 40, 8 + rnd() * 14, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Tan brick, like the dorm's walls (the floating chunk's sides).
function brickTexture() {
  const rnd = seeded(8);
  const tex = paint(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#8c7a66';
    ctx.fillRect(0, 0, w, h);
    const bw = 85;
    const bh = 32;
    for (let row = 0; row < h / bh; row++) {
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + (row % 2) * (bw / 2);
        ctx.fillStyle = ['#c3ab8c', '#b79f80', '#cdb594', '#a99377'][Math.floor(rnd() * 4)];
        ctx.fillRect(x + 3, row * bh + 3, bw - 6, bh - 6);
      }
    }
    ctx.strokeStyle = 'rgba(60,40,30,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6 + rnd() * 10, y + (rnd() - 0.5) * 6);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Rough stone blocks (the planters at the canopy's feet).
function stoneTexture() {
  const rnd = seeded(13);
  const tex = paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7d7466';
    ctx.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const rh = 30 + rnd() * 26;
      let x = -rnd() * 40;
      while (x < w) {
        const rw = 40 + rnd() * 50;
        ctx.fillStyle = ['#b9ae9c', '#a99f8c', '#c4b9a5', '#9d927f'][Math.floor(rnd() * 4)];
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, rw - 6, rh - 6, 7);
        ctx.fill();
        x += rw;
      }
      y += rh;
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Beige stucco with the sign's teal letters on it.
function signTexture(text) {
  return paint(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#e6dac4';
    ctx.fillRect(0, 0, w, h);
    const rnd = seeded(text.length * 7);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(150,130,100,${rnd() * 0.12})`;
      ctx.fillRect(rnd() * w, rnd() * h, 3, 3);
    }
    ctx.font = `124px ${FONTS.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#1d5562';
    ctx.strokeText(text, w / 2, h / 2 + 6);
    ctx.fillStyle = '#3aa3b5';
    ctx.fillText(text, w / 2, h / 2 + 6);
  });
}

// The sky, fading to snow at the bottom, behind the photo's edges.
function skyTexture() {
  return paint(2, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a7fd4');
    g.addColorStop(0.45, '#7cc0f0');
    g.addColorStop(0.62, '#cfe6f7');
    g.addColorStop(1, '#f2f7fc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// The photo, cartoon-ified: smoothed, saturated, flattened into a few tones
// per color, with dark ink where the edges are strong, and soft borders that
// fade into the sky. Works for any photo, so future stages can do the same.
export function cartoonPhoto(url, done) {
  const img = new Image();
  img.onload = () => {
    const W = 1600;
    const H = Math.round((W * img.height) / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.filter = 'blur(3px) saturate(1.3) contrast(1.05) brightness(1.04)';
    ctx.drawImage(img, 0, 0, W, H);
    ctx.filter = 'none';
    const data = ctx.getImageData(0, 0, W, H);
    const d = data.data;
    const lum = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) lum[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
    const LEVELS = 8;
    const ink = new THREE.Color(INK);
    const [ir, ig, ib] = [ink.r * 255, ink.g * 255, ink.b * 255];
    const fade = (t) => Math.min(1, Math.max(0, t / 0.06));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const o = i * 4;
        for (let c = 0; c < 3; c++) d[o + c] = (Math.round((d[o + c] / 255) * LEVELS) / LEVELS) * 255;
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {
          const gx = lum[i - W + 1] + 2 * lum[i + 1] + lum[i + W + 1] - lum[i - W - 1] - 2 * lum[i - 1] - lum[i + W - 1];
          const gy = lum[i + W - 1] + 2 * lum[i + W] + lum[i + W + 1] - lum[i - W - 1] - 2 * lum[i - W] - lum[i - W + 1];
          const edge = Math.min(0.75, Math.max(0, (Math.hypot(gx, gy) - 95) / 140));
          d[o] += (ir - d[o]) * edge;
          d[o + 1] += (ig - d[o + 1]) * edge;
          d[o + 2] += (ib - d[o + 2]) * edge;
        }
        d[o + 3] = 255 * Math.min(fade(x / W), fade(1 - x / W), fade(y / H), fade(1 - y / H));
      }
    }
    ctx.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    done(tex, img.width / img.height);
  };
  img.onerror = () => console.warn(`Could not load ${url}`);
  img.src = url;
}

// ---- Scenery pieces ----

const SNOW = 0xf4f8ff;

// A snow cap with blobby drips over the front edge, from x1 to x2, `depth` deep, top at y.
function snowCap(x1, x2, y, depth, mat, parent, { drips = 10, thick = 0.18 } = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(x1, y);
  shape.lineTo(x2, y);
  shape.lineTo(x2, y - thick);
  const dw = (x2 - x1) / drips;
  for (let i = 0; i < drips; i++) {
    const x0 = x2 - i * dw;
    const dd = [0.16, 0.3, 0.1, 0.24, 0.18][i % 5] * Math.min(1, dw / 0.7);
    shape.quadraticCurveTo(x0 - dw / 2, y - thick - dd * 2, x0 - dw, y - thick);
  }
  shape.lineTo(x1, y);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 5 });
  geo.translate(0, 0, -depth / 2);
  return ink(place(geo, mat, 0, 0, 0, parent), 0.04);
}

function icicles(x1, x2, y, z, mat, parent, rnd, count) {
  for (let i = 0; i < count; i++) {
    const len = 0.12 + rnd() * 0.32;
    const ice = place(new THREE.ConeGeometry(0.035 + rnd() * 0.03, len, 6), mat, x1 + rnd() * (x2 - x1), y - len / 2, z, parent);
    ice.rotation.x = Math.PI;
    ice.castShadow = false;
  }
}

function snowBank(parent, x, z, s, mat, rnd) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const r = (0.45 + rnd() * 0.35) * s;
    const blob = ink(place(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat, (i - 1.5) * 0.55 * s, 0, (rnd() - 0.5) * 0.4, g), 0.04);
    blob.scale.y = 0.7;
  }
  g.position.set(x, 0, z);
  parent.add(g);
}

function lampPost(parent, x, z, dark, glow) {
  const g = new THREE.Group();
  ink(place(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 10), dark, 0, 2.1, 0, g), 0.035);
  ink(place(new THREE.BoxGeometry(0.42, 0.14, 0.42), dark, 0.12, 4.25, 0, g), 0.03);
  const light = place(new THREE.BoxGeometry(0.36, 0.06, 0.36), glow, 0.12, 4.15, 0, g);
  light.castShadow = false;
  ink(place(new THREE.BoxGeometry(0.62, 0.1, 0.12), dark, -0.12, 4.0, 0, g), 0.03);
  g.position.set(x, 0, z);
  parent.add(g);
}

// A bare winter tree: trunk and a few forked branches.
function bareTree(parent, x, z, s, mat, rnd) {
  const g = new THREE.Group();
  const branch = (x0, y0, len, angle, r, depth) => {
    const geo = new THREE.CylinderGeometry(r * 0.6, r, len, 6);
    geo.translate(0, len / 2, 0);
    const m = ink(place(geo, mat, x0, y0, 0, g), 0.025);
    m.rotation.z = angle;
    if (depth <= 0) return;
    const ex = x0 - Math.sin(angle) * len;
    const ey = y0 + Math.cos(angle) * len;
    branch(ex, ey, len * 0.7, angle + 0.45 + rnd() * 0.2, r * 0.6, depth - 1);
    branch(ex, ey, len * 0.65, angle - 0.4 - rnd() * 0.2, r * 0.6, depth - 1);
  };
  branch(0, 0, 1.9, 0.05, 0.14, 3);
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  parent.add(g);
}

function snowman(parent, x, z, snow, coal, carrot, scarf) {
  const g = new THREE.Group();
  ink(place(new THREE.SphereGeometry(0.42, 18, 12), snow, 0, 0.36, 0, g), 0.03);
  ink(place(new THREE.SphereGeometry(0.3, 18, 12), snow, 0, 0.92, 0, g), 0.03);
  ink(place(new THREE.SphereGeometry(0.21, 16, 10), snow, 0, 1.33, 0, g), 0.03);
  for (const zz of [-0.07, 0.07]) place(new THREE.SphereGeometry(0.028, 6, 4), coal, 0.18, 1.39, zz, g);
  const nose = place(new THREE.ConeGeometry(0.035, 0.2, 8), carrot, 0.27, 1.33, 0, g);
  nose.rotation.z = -Math.PI / 2;
  for (const y of [0.85, 0.98]) place(new THREE.SphereGeometry(0.03, 6, 4), coal, 0.29, y, 0, g);
  ink(place(new THREE.TorusGeometry(0.2, 0.05, 6, 16), scarf, 0, 1.16, 0, g), 0.02).rotation.x = Math.PI / 2;
  // A beanie: it's a dorm snowman.
  ink(place(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), scarf, 0, 1.43, 0, g), 0.02);
  g.position.set(x, 0, z);
  g.rotation.y = -0.4;
  parent.add(g);
}

// ---- The scene ----

export function buildRushton(stage, scene) {
  const rnd = seeded(5);
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xdfeaf5, 70, 260);

  scene.add(new THREE.HemisphereLight(0xeef6ff, 0x8e9bb5, 1.35));
  const sun = new THREE.DirectionalLight(0xfff2de, 2.2);
  sun.position.set(-8, 14, 10); // low winter sun from the left, like the photo
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 14, bottom: -8, near: 1, far: 50 });
  scene.add(sun);

  const snow = toon(SNOW, { emissive: 0x1a2533 });
  const ice = toon(0xcfeeff, { emissive: 0x2a4a60, transparent: true, opacity: 0.85 });
  const paverTex = paverTexture();
  paverTex.repeat.set(0.35, 0.5);
  const pavers = toon(0xffffff, { map: paverTex });
  const brickTex = brickTexture();
  brickTex.repeat.set(0.25, 0.25);
  const brick = toon(0xffffff, { map: brickTex });
  const stoneTex = stoneTexture();
  const stone = toon(0xffffff, { map: stoneTex });
  const maroon = toon(0x7a2836);
  const panel = toon(0x6fa7c4, { emissive: 0x10283a, side: THREE.DoubleSide });
  const dark = toon(0x2e3138);

  // ---- The plaza (main platform): pavers on top, a chunk of brick
  // foundation underneath, snow piled along the front edge. ----
  const m = stage.main;
  const plaza = new THREE.Group();
  scene.add(plaza);
  const topSlab = new THREE.BoxGeometry(m.x2 - m.x1 + 0.3, 0.28, 4.2);
  ink(place(topSlab, pavers, (m.x1 + m.x2) / 2, -0.14, 0, plaza), 0.05);
  snowCap(m.x1 - 0.18, m.x2 + 0.18, -0.02, 0.5, snow, plaza, { drips: 16, thick: 0.12 }).position.z = 1.9;
  const body = new THREE.Shape();
  body.moveTo(m.x1 + 0.1, -0.28);
  body.lineTo(m.x2 - 0.1, -0.28);
  body.splineThru([
    new THREE.Vector2(m.x2 - 0.2, -1.4), new THREE.Vector2(m.x2 - 0.8, -2.6), new THREE.Vector2(4.6, -3.5),
    new THREE.Vector2(2.4, -4.4), new THREE.Vector2(0.4, -5.9), new THREE.Vector2(-1.4, -4.6),
    new THREE.Vector2(-3.4, -3.8), new THREE.Vector2(m.x1 + 1.0, -2.7), new THREE.Vector2(m.x1 + 0.2, -1.4),
    new THREE.Vector2(m.x1 + 0.1, -0.28),
  ]);
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: 3.8, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 2, curveSegments: 10 });
  bodyGeo.translate(0, 0, -1.9);
  ink(place(bodyGeo, brick, 0, 0, 0, plaza), 0.07);
  icicles(m.x1 + 0.3, m.x2 - 0.3, -0.25, 2.15, ice, plaza, rnd, 26);

  // Along the back of the plaza: snow banks, the lamp post, a bare tree, a snowman.
  for (const [x, s] of [[-6.4, 1.2], [-3.2, 0.9], [2.1, 1.0], [6.3, 1.3]]) snowBank(plaza, x, -1.6, s, snow, rnd);
  lampPost(plaza, -6.75, -1.4, dark, new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
  bareTree(plaza, 4.6, -1.7, 1.15, toon(0x4a372c), rnd);
  snowman(plaza, -2.3, -1.25, snow, toon(0x1e1e22), toon(0xff8a1f), toon(0xd9363e));
  mergeStatic(plaza, { receive: true });

  // ---- Side platforms: floating chunks of the sign wall, RUSH and TON ----
  // A thin snowy ledge to stand on, with the sign block hanging under its
  // back half: the platforms are low enough that people walk underneath,
  // and they pass in front of the sign instead of through it.
  const [left, right, roof] = stage.platforms;
  for (const [p, text] of [[left, 'RUSH'], [right, 'TON']]) {
    const g = new THREE.Group();
    const w = p.x2 - p.x1;
    const cx = (p.x1 + p.x2) / 2;
    const front = -0.32; // the sign's face, just behind the fighters
    const back = -1.0;
    const bz = (front + back) / 2;
    ink(place(new RoundedBoxGeometry(w, 0.72, front - back, 2, 0.05), stone, cx, p.y - 0.46, bz, g), 0.045);
    // The sign's letters on the front face.
    place(new THREE.PlaneGeometry(w - 0.12, 0.58), toon(0xffffff, { map: signTexture(text) }), cx, p.y - 0.47, front + 0.006, g);
    snowCap(p.x1 - 0.08, p.x2 + 0.08, p.y + 0.02, 1.95, snow, g, { drips: 14, thick: 0.08 });
    icicles(p.x1 + 0.15, p.x2 - 0.15, p.y - 0.82, front + 0.04, ice, g, rnd, 7);
    scene.add(g);
    mergeStatic(g, { receive: true });
  }

  // ---- The canopy roof (top platform): maroon arched frame, blue panels,
  // snow on top. Two columns hold it up from the back of the plaza. ----
  const canopy = new THREE.Group();
  scene.add(canopy);
  const rw = roof.x2 - roof.x1;
  const rcx = (roof.x1 + roof.x2) / 2;
  const depth = 2.6;
  // Arched blue roof: a shallow slice of a cylinder running front to back,
  // with maroon arches along its front, middle and back.
  const R = 11;
  const half = Math.asin(rw / 2 / R);
  const cy = roof.y - 0.16 - R; // the arch's center, far below
  const vault = new THREE.CylinderGeometry(R, R, depth, 24, 1, true, -half, half * 2);
  vault.rotateX(-Math.PI / 2);
  place(vault, panel, rcx, cy, 0, canopy);
  for (const z of [-depth / 2, 0, depth / 2]) {
    const arch = new THREE.TorusGeometry(R, 0.08, 6, 30, half * 2);
    arch.rotateZ(Math.PI / 2 - half);
    ink(place(arch, maroon, rcx, cy, z, canopy), 0.025);
  }
  // Snow piled on top fills the curve up to a flat top (that's what you stand on).
  const drift = new THREE.Shape();
  drift.moveTo(roof.x1 - 0.08, roof.y);
  drift.lineTo(roof.x2 + 0.08, roof.y);
  for (let i = 0; i <= 16; i++) {
    const x = roof.x2 + 0.08 - (i / 16) * (rw + 0.16);
    drift.lineTo(x, cy + Math.sqrt(R * R - (x - rcx) ** 2) - 0.02);
  }
  const driftGeo = new THREE.ExtrudeGeometry(drift, { depth, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  driftGeo.translate(0, 0, -depth / 2);
  ink(place(driftGeo, snow, 0, 0, 0, canopy), 0.04);
  snowCap(roof.x1 - 0.1, roof.x2 + 0.1, roof.y, 0.35, snow, canopy, { drips: 9, thick: 0.1 }).position.z = depth / 2 - 0.1;
  icicles(roof.x1 + 0.3, roof.x2 - 0.3, roof.y - 0.3, depth / 2 + 0.1, ice, canopy, rnd, 11);
  // Columns at the back corners, standing on stone planters.
  for (const x of [roof.x1 + 0.35, roof.x2 - 0.35]) {
    ink(place(new THREE.BoxGeometry(0.2, roof.y - 0.25, 0.2), maroon, x, (roof.y - 0.25) / 2, -depth / 2 + 0.15, canopy), 0.03);
    const planter = place(new RoundedBoxGeometry(0.8, 0.7, 0.8, 2, 0.06), stone, x, 0.35, -depth / 2 + 0.15, canopy);
    ink(planter, 0.035);
    snowCap(x - 0.42, x + 0.42, 0.74, 0.84, snow, canopy, { drips: 3, thick: 0.06 }).position.z = -depth / 2 + 0.15;
    // Diagonal brace up into the roof.
    const brace = ink(place(new THREE.BoxGeometry(0.12, 1.5, 0.12), maroon, x + (x < rcx ? 0.45 : -0.45), roof.y - 0.95, -depth / 2 + 0.15, canopy), 0.025);
    brace.rotation.z = x < rcx ? -0.6 : 0.6;
  }
  mergeStatic(canopy, { receive: true });

  // ---- The photo of the real building, far behind ----
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
  backdrop.renderOrder = -1;
  scene.add(backdrop);
  cartoonPhoto(PHOTO, (tex, aspect) => {
    const w = 96;
    const h = w / aspect;
    // Line the bottom of the doors (82% down the photo) up with the plaza, as
    // seen from the usual camera, so the building stands right behind the stage.
    const z = -52;
    const doorsY = -6.5;
    backdrop.scale.set(w, h, 1);
    backdrop.position.set(0, doorsY + (0.82 - 0.5) * h, z);
    backdrop.material.map = tex;
    backdrop.material.opacity = 1;
    backdrop.material.needsUpdate = true;
  });

  // ---- Falling snow ----
  const COUNT = 700;
  const flakes = new Float32Array(COUNT * 3);
  const sway = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    flakes[i * 3] = (rnd() - 0.5) * 60;
    flakes[i * 3 + 1] = -12 + rnd() * 34;
    flakes[i * 3 + 2] = -14 + rnd() * 20;
    sway[i] = rnd() * Math.PI * 2;
  }
  const flakeGeo = new THREE.BufferGeometry();
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakes, 3));
  const dot = paint(32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });
  const snowfall = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ map: dot, size: 0.14, transparent: true, depthWrite: false, opacity: 0.9 }));
  snowfall.frustumCulled = false;
  scene.add(snowfall);

  let time = 0;
  return {
    update(dt) {
      time += dt;
      const p = flakeGeo.attributes.position;
      for (let i = 0; i < COUNT; i++) {
        let y = flakes[i * 3 + 1] - dt * (0.9 + (i % 5) * 0.12);
        if (y < -12) y += 34;
        flakes[i * 3 + 1] = y;
        flakes[i * 3] += Math.sin(time * 0.8 + sway[i]) * dt * 0.35;
      }
      p.needsUpdate = true;
    },
  };
}

export const RUSHTON = {
  id: 'rushton', name: 'Rushton Hall', create: createRushton, build: buildRushton,
  thumb: `url(${PHOTO}) center / cover`,
};
