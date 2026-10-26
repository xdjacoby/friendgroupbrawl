import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toon, ink, mergeStatic, place, seeded, paint, FRONT } from '../stage.js';

// Rushton Hall: a fall afternoon out front of the dorm, built in 3D from the
// owner's photo (public/stages/rushton-hall.jpg, also the stage picker's
// thumbnail) and seen from about where it was taken: eye level, straight on
// at the entrance. The fight happens on the plaza in front of the doors.
//
//   - The entrance: the arched canopy (teal fascia, maroon steel truss), the
//     glass vestibule and its doors with the lobby behind them, stone
//     planters with mums at the columns' feet, pumpkins by the doors.
//   - Left: the stucco wing with the RUSHTON sign, the lamp post, a maple.
//     Right: the split-face block wall and its downspout, then stucco.
//   - Both wings are one story, so behind it there's only sky and treetops,
//     like the photo. Lawns, red shrubs and raked leaf piles to the sides,
//     leaves drifting down.
//
// Platforms: the canopy's truss beam is the top one (4 m); the side ones are
// two bike shelters (2 m) in the same maroon and teal as the canopy. The
// plaza juts out over the edge of the campus bluff, so falling off the sides
// drops past the rock and the treetops below into the haze.

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
    // full hop tops out at ~2.7 m), and the beam from a side platform.
    platforms: [
      { x1: -6.1, x2: -3.7, y: 2.0, passThrough: true }, // bike shelter
      { x1: 3.7, x2: 6.1, y: 2.0, passThrough: true }, // bike shelter
      { x1: -2.8, x2: 2.8, y: 4.0, passThrough: true }, // the canopy's truss beam
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

const PHOTO = 'stages/rushton-hall.jpg';
const AIR = 0xf6dfbd; // the warm afternoon air: the rim light on the fighters
const LEAVES = [0xe8732a, 0xc8392b, 0xf2b632, 0xd9822b, 0xa8452a, 0xc9a33a];

// ---- Geometry helpers ----

// Texture coordinates in meters (u along the surface, v up; floors use x and
// -z), so a texture tiles at real size and lines up across neighboring walls.
function meterUV(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [nx, ny, nz] = [nor.getX(i), nor.getY(i), nor.getZ(i)];
    if (Math.abs(ny) > Math.max(Math.abs(nx), Math.abs(nz))) uv.set([x, -z], i * 2);
    else if (Math.abs(nx) > Math.abs(nz)) uv.set([nx > 0 ? -z : z, y], i * 2);
    else uv.set([nz > 0 ? x : -x, y], i * 2);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// A box from corner to corner, textured in meters, outlined.
function box(x1, x2, y1, y2, z1, z2, mat, parent, inkWidth = 0.04) {
  const geo = new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1);
  geo.translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  const mesh = place(meterUV(geo), mat, 0, 0, 0, parent);
  return inkWidth ? ink(mesh, inkWidth) : mesh;
}

// A flat panel facing the camera (+z), textured in meters.
function panel(x1, x2, y1, y2, z, mat, parent) {
  const geo = new THREE.PlaneGeometry(x2 - x1, y2 - y1);
  geo.translate((x1 + x2) / 2, (y1 + y2) / 2, z);
  return place(meterUV(geo), mat, 0, 0, 0, parent);
}

// Flat ground at height y, textured in meters.
function ground(x1, x2, z1, z2, y, mat, parent) {
  const geo = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x1 + x2) / 2, y, (z1 + z2) / 2);
  return place(meterUV(geo), mat, 0, 0, 0, parent);
}

// A beam from (x1, y1) to (x2, y2) in the plane at depth z.
function beam(x1, y1, x2, y2, z, size, mat, parent) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const m = place(new THREE.BoxGeometry(size, len, size), mat, (x1 + x2) / 2, (y1 + y2) / 2, z, parent);
  m.rotation.z = Math.atan2(x1 - x2, y2 - y1);
  return ink(m, 0.022);
}

// A lip with blobby drips over the front edge (grass over the bluff's
// stone), from x1 to x2, `depth` deep, top at y.
function dripLip(x1, x2, y, depth, mat, parent, { drips = 10, thick = 0.14 } = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(x1, y);
  shape.lineTo(x2, y);
  shape.lineTo(x2, y - thick);
  const dw = (x2 - x1) / drips;
  for (let i = 0; i < drips; i++) {
    const x0 = x2 - i * dw;
    const dd = [0.12, 0.22, 0.08, 0.18, 0.14][i % 5] * Math.min(1, dw / 0.7);
    shape.quadraticCurveTo(x0 - dw / 2, y - thick - dd * 2, x0 - dw, y - thick);
  }
  shape.lineTo(x1, y);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 5 });
  geo.translate(0, 0, -depth / 2);
  return ink(place(geo, mat, 0, 0, 0, parent), 0.04);
}

// ---- Textures (painted at load, like every other stage) ----

function tiled(tex) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;

// A fallen leaf on a canvas: a pointy oval with a midrib.
function leafStroke(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.quadraticCurveTo(0, -size * 0.7, size, 0);
  ctx.quadraticCurveTo(0, size * 0.7, -size, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,40,20,0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(size, 0);
  ctx.stroke();
  ctx.restore();
}

// Light concrete pavers with fallen leaves (2.4 m per tile).
function plazaTexture() {
  const rnd = seeded(21);
  const tex = paint(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#7d7a74';
    ctx.fillRect(0, 0, w, h);
    const n = 4;
    const s = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = ['#b3ada3', '#aaa49a', '#bbb5aa', '#a59f95'][Math.floor(rnd() * 4)];
        ctx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      }
    }
    for (let i = 0; i < 46; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const color = css(LEAVES[Math.floor(rnd() * LEAVES.length)]);
      const size = 7 + rnd() * 6;
      const angle = rnd() * Math.PI;
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) leafStroke(ctx, x + dx, y + dy, size, angle, color);
    }
  });
  tex.repeat.set(1 / 2.4, 1 / 2.4);
  return tiled(tex);
}

// Fall lawn: still green, mowing stripes, leaves blown across it (4 m tile).
function lawnTexture() {
  const rnd = seeded(27);
  const tex = paint(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#7ea24a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#8bae52';
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * 128, w, 64);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(60,90,30,0.25)' : 'rgba(190,200,110,0.25)';
      ctx.fillRect(rnd() * w, rnd() * h, 2, 4);
    }
    for (let i = 0; i < 60; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const color = css(LEAVES[Math.floor(rnd() * LEAVES.length)]);
      const size = 6 + rnd() * 5;
      const angle = rnd() * Math.PI;
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) leafStroke(ctx, x + dx, y + dy, size, angle, color);
    }
  });
  tex.repeat.set(1 / 4, 1 / 4);
  return tiled(tex);
}

// Split-face concrete block, tan-grey, running bond (1.6 m tile).
function blockTexture() {
  const rnd = seeded(8);
  const tex = paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7d756a';
    ctx.fillRect(0, 0, w, h);
    const bw = 64;
    const bh = 32;
    for (let row = 0; row < h / bh; row++) {
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + (row % 2) * (bw / 2);
        ctx.fillStyle = ['#b3aa9b', '#a89f90', '#bbb2a3', '#a39a8a'][Math.floor(rnd() * 4)];
        ctx.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
        for (let k = 0; k < 10; k++) {
          ctx.fillStyle = `rgba(${rnd() < 0.5 ? '70,60,50' : '235,228,215'},0.18)`;
          ctx.fillRect(x + 4 + rnd() * (bw - 10), row * bh + 4 + rnd() * (bh - 10), 3, 3);
        }
      }
    }
  });
  tex.repeat.set(1 / 1.6, 1 / 1.6);
  return tiled(tex);
}

// Rough fieldstone (the planters and the retaining wall; 1.5 m tile).
function stoneTexture() {
  const rnd = seeded(13);
  const tex = paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6f675b';
    ctx.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const rh = 26 + rnd() * 24;
      let x = -rnd() * 40;
      while (x < w) {
        const rw = 36 + rnd() * 50;
        ctx.fillStyle = ['#b4a996', '#a39985', '#c0b6a2', '#978d7a', '#ab9f8e'][Math.floor(rnd() * 5)];
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, rw - 6, rh - 6, 7);
        ctx.fill();
        x += rw;
      }
      y += rh;
    }
  });
  tex.repeat.set(1 / 1.5, 1 / 1.5);
  return tiled(tex);
}

// The bluff's rock: layered bands, cracks, moss and grass on the ledges (4 m tile).
function rockTexture() {
  const rnd = seeded(52);
  const tex = paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6b6158';
    ctx.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const bh = 34 + rnd() * 40;
      ctx.fillStyle = ['#887b6c', '#7a6e62', '#8f8272', '#7f7366'][Math.floor(rnd() * 4)];
      ctx.beginPath();
      ctx.moveTo(0, y + 3);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + 3 + Math.sin(x / 40 + y) * 4);
      ctx.lineTo(w, y + bh);
      ctx.lineTo(0, y + bh);
      ctx.fill();
      // Now and then, moss on a ledge.
      if (rnd() < 0.5) {
        ctx.fillStyle = 'rgba(110,140,60,0.85)';
        ctx.beginPath();
        ctx.ellipse(rnd() * w, y + 4, 18 + rnd() * 26, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      y += bh;
    }
    ctx.strokeStyle = 'rgba(40,30,24,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      let x = rnd() * w;
      let yy = rnd() * h;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      for (let k = 0; k < 3; k++) {
        x += (rnd() - 0.5) * 14;
        yy += 8 + rnd() * 12;
        ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  });
  tex.repeat.set(1 / 4, 1 / 4);
  return tiled(tex);
}

// Beige stucco with faint panel joints (4 m tile).
function stuccoTexture() {
  const rnd = seeded(31);
  const tex = paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e6dac6';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(150,128,100,${rnd() * 0.1})`;
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    ctx.fillStyle = 'rgba(120,100,80,0.18)';
    ctx.fillRect(0, h / 2 - 1, w, 2);
    ctx.fillRect(0, h - 2, w, 2);
  });
  tex.repeat.set(1 / 4, 1 / 4);
  return tiled(tex);
}

// The vestibule glass: sky and fall trees reflected, with glare streaks.
// One picture over the whole glass front (6 m x 6.5 m).
function glassTexture() {
  const rnd = seeded(17);
  const tex = paint(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9cc4e4');
    g.addColorStop(0.55, '#cfe0ea');
    g.addColorStop(0.75, '#e8e6dc');
    g.addColorStop(1, '#a9a69c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Reflected maples across the lower half.
    for (let i = 0; i < 16; i++) {
      const x = rnd() * w;
      const y = h * (0.52 + rnd() * 0.18);
      ctx.fillStyle = `${css(LEAVES[Math.floor(rnd() * LEAVES.length)])}88`;
      ctx.beginPath();
      ctx.ellipse(x, y, 16 + rnd() * 16, 12 + rnd() * 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const [x, wd] of [[40, 18], [70, 6], [150, 26], [190, 8]]) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 60, 0);
      ctx.lineTo(x + 60 + wd, 0);
      ctx.lineTo(x + wd, h);
      ctx.fill();
    }
  });
  tex.repeat.set(1 / 6, 1 / 6.5);
  tex.offset.set(0.5, 0);
  return tex;
}

// The lobby seen through the glass: warm lights, the front desk, a couch,
// mailboxes and the bulletin board every dorm has (6 m x 4.4 m).
function lobbyTexture() {
  const tex = paint(512, 376, (ctx, w, h) => {
    const m = w / 6; // px per meter
    ctx.fillStyle = '#e9d7b8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c9b18d';
    ctx.fillRect(0, h - 0.15 * m, w, 0.15 * m); // baseboard
    // Ceiling lights glowing.
    for (const x of [1, 3, 5]) {
      const g = ctx.createRadialGradient(x * m, 0, 0, x * m, 0, 1.4 * m);
      g.addColorStop(0, 'rgba(255,246,214,0.95)');
      g.addColorStop(1, 'rgba(255,246,214,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // Mailboxes.
    ctx.fillStyle = '#b7a58a';
    ctx.fillRect(0.3 * m, h - 2.2 * m, 1.4 * m, 1.3 * m);
    ctx.fillStyle = '#8f7d63';
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) ctx.fillRect((0.36 + i * 0.22) * m, h - (2.12 - j * 0.3) * m, 0.18 * m, 0.24 * m);
    // Bulletin board with flyers.
    ctx.fillStyle = '#a8794e';
    ctx.fillRect(2.3 * m, h - 2.6 * m, 1.5 * m, 1.0 * m);
    const flyers = ['#ff7eb6', '#ffd23f', '#7fd4ff', '#ffffff', '#9ef08c', '#ffb36b'];
    flyers.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect((2.38 + (i % 3) * 0.47) * m, h - (2.52 - Math.floor(i / 3) * 0.46) * m, 0.38 * m, 0.38 * m);
    });
    // Front desk.
    ctx.fillStyle = '#7a4a2e';
    ctx.fillRect(3.9 * m, h - 1.1 * m, 1.9 * m, 1.1 * m);
    ctx.fillStyle = '#5a3420';
    ctx.fillRect(3.85 * m, h - 1.15 * m, 2.0 * m, 0.08 * m);
    // Couch.
    ctx.fillStyle = '#3f6e8c';
    ctx.fillRect(0.4 * m, h - 0.75 * m, 2.0 * m, 0.45 * m);
    ctx.fillRect(0.35 * m, h - 1.05 * m, 2.1 * m, 0.35 * m);
    ctx.fillStyle = '#2f566e';
    ctx.fillRect(0.4 * m, h - 0.3 * m, 0.1 * m, 0.15 * m);
    ctx.fillRect(2.3 * m, h - 0.3 * m, 0.1 * m, 0.15 * m);
  });
  tex.repeat.set(1 / 5.7, 1 / 4.4); // stretched over the back wall: x -2.85..2.85, y 0..4.4
  tex.offset.set(0.5, 0);
  return tex;
}

// The sign on the stucco: teal serif capitals on a cream panel.
function signTexture(text) {
  return paint(512, 112, (ctx, w, h) => {
    ctx.fillStyle = '#efe7d6';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9bea8';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.font = 'bold 84px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#173f52';
    ctx.strokeText(text, w / 2, h / 2 + 4);
    ctx.fillStyle = '#2f86a6';
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
}

// Clear fall sky, warm toward the horizon.
function skyTexture() {
  return paint(2, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2f7fd0');
    g.addColorStop(0.42, '#86c0ea');
    g.addColorStop(0.6, '#d6e4ea');
    g.addColorStop(1, '#f1e6d4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// Haze down the bluff.
function hazeTexture() {
  return paint(2, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(240,230,212,0)');
    g.addColorStop(0.12, 'rgba(240,230,212,0.1)');
    g.addColorStop(0.32, 'rgba(240,230,212,0.85)');
    g.addColorStop(1, 'rgba(242,233,216,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// ---- The canopy ----
// A symmetric arch: its front edge rises from 6.6 m at the ends (x ±4.4)
// to 8.4 m in the middle. Front edge at z = -0.5, back into the building
// at z = -6.3. It used to be 1.85 m lower, and whoever stood on the top
// platform had their head in the roof; now there's 1.3-2 m over them (the
// photo's canopy is about twice as tall as the wings anyway).
const ROOF = { half: 4.4, spring: 6.6, apex: 8.4, front: -0.5, back: -6.3, thick: 0.45 };
const ROOF_R = (ROOF.half ** 2 + (ROOF.apex - ROOF.spring) ** 2) / (2 * (ROOF.apex - ROOF.spring));
const roofY = (x) => ROOF.apex - ROOF_R + Math.sqrt(ROOF_R ** 2 - Math.min(x * x, ROOF.half ** 2));
const COLUMN_X = 2.95; // the front columns, at the beam's ends
const COLUMN_Z = -0.85;
const GLASS_Z = -6.0;

// A slab that follows the roof curve, `bottom`..`top` above the roof line, from z1 to z2.
function curvedSlab(bottom, top, z1, z2, mat, parent, { x1 = -ROOF.half, x2 = ROOF.half, bevel = 0 } = {}) {
  const shape = new THREE.Shape();
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const x = x1 + ((x2 - x1) * i) / N;
    if (i) shape.lineTo(x, roofY(x) + top);
    else shape.moveTo(x, roofY(x) + top);
  }
  for (let i = N; i >= 0; i--) {
    const x = x1 + ((x2 - x1) * i) / N;
    shape.lineTo(x, roofY(x) + bottom);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: z2 - z1, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  geo.translate(0, 0, z1);
  return place(geo, mat, 0, 0, 0, parent);
}

// Potted mums, the fall flowers every campus puts out.
function mums(parent, x, y, z, color, m) {
  ink(place(new THREE.CylinderGeometry(0.26, 0.2, 0.26, 14), m.pot, x, y + 0.13, z, parent), 0.02);
  const bloom = ink(place(new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), color, x, y + 0.24, z, parent), 0.02);
  bloom.scale.y = 0.8;
}

function buildCanopy(scene, m) {
  const g = new THREE.Group();
  scene.add(g);
  // The roof: teal all over (the soffit underneath is teal panels too), a
  // maroon trim under the front edge, a light metal cap on top.
  ink(curvedSlab(-ROOF.thick, 0, ROOF.back, ROOF.front, m.teal, g), 0.035);
  ink(curvedSlab(-ROOF.thick - 0.14, -ROOF.thick, ROOF.front - 0.25, ROOF.front + 0.02, m.maroon, g), 0.02);
  ink(curvedSlab(0, 0.08, ROOF.back, ROOF.front + 0.04, m.roofing, g), 0.02);
  // Maroon ribs and purlins under the soffit.
  for (const z of [-1.6, -2.9, -4.2, -5.5]) {
    ink(curvedSlab(-ROOF.thick - 0.12, -ROOF.thick, z - 0.06, z + 0.06, m.maroon, g), 0.015);
  }
  for (let i = 1; i < 6; i++) {
    const x = -ROOF.half + (ROOF.half * 2 * i) / 6;
    const y = roofY(x) - ROOF.thick - 0.05;
    place(new THREE.BoxGeometry(0.08, 0.08, ROOF.front - ROOF.back), m.maroon, x, y, (ROOF.front + ROOF.back) / 2, g);
  }

  // The truss across the front: the bottom chord is the top platform (4 m),
  // posts and diagonals up to the roof, mirrored about the middle.
  const under = (x) => roofY(x) - ROOF.thick - 0.14;
  box(-COLUMN_X, COLUMN_X, 3.78, 4.0, COLUMN_Z - 0.11, COLUMN_Z + 0.11, m.maroon, g, 0.03);
  const posts = [-COLUMN_X, -1.5, 0, 1.5, COLUMN_X];
  for (const x of posts.slice(1, -1)) beam(x, 4.0, x, under(x) + 0.05, COLUMN_Z, 0.13, m.maroon, g);
  for (let i = 0; i < posts.length - 1; i++) {
    const [a, b] = [posts[i], posts[i + 1]];
    // Each diagonal comes down toward the middle of the span.
    if (i < 2) beam(a + 0.05, under(a), b, 4.0, COLUMN_Z, 0.11, m.maroon, g);
    else beam(a, 4.0, b - 0.05, under(b), COLUMN_Z, 0.11, m.maroon, g);
  }
  // Columns: the front pair on stone planters, the back pair at the glass.
  for (const s of [-1, 1]) {
    const x = s * COLUMN_X;
    box(x - 0.12, x + 0.12, 1.0, under(x) + 0.1, COLUMN_Z - 0.12, COLUMN_Z + 0.12, m.maroon, g, 0.03);
    box(x - 0.12, x + 0.12, 0, under(x) + 0.1, GLASS_Z + 0.05, GLASS_Z + 0.29, m.maroon, g, 0.03);
    // Brace from the column into the roof, like the photo's.
    beam(x, under(x) - 2.1, x - s * 0.9, under(x - s * 0.9) + 0.05, COLUMN_Z - 0.25, 0.1, m.maroon, g);
    // The planter, with mums on top.
    const planter = place(new RoundedBoxGeometry(0.95, 1.0, 0.95, 2, 0.04), m.stone, x, 0.5, COLUMN_Z, g);
    meterUV(planter.geometry);
    ink(planter, 0.03);
    ink(place(new RoundedBoxGeometry(1.08, 0.1, 1.08, 2, 0.03), m.cap, x, 1.03, COLUMN_Z, g), 0.02);
    mums(g, x, 1.08, COLUMN_Z, s < 0 ? m.mumOrange : m.mumYellow, m);
  }
  mergeStatic(g, { receive: true, cast: true });
}

// ---- The vestibule: glass front, doors, the lobby behind ----

function pumpkin(parent, x, z, s, m) {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lobe = place(new THREE.SphereGeometry(0.16, 12, 8), m.pumpkin, Math.cos(a) * 0.08, 0.15, Math.sin(a) * 0.08, g);
    lobe.scale.set(0.8, 0.95, 0.8);
  }
  ink(place(new THREE.SphereGeometry(0.2, 14, 10), m.pumpkin, 0, 0.15, 0, g), 0.015).scale.set(1, 0.72, 1);
  place(new THREE.CylinderGeometry(0.02, 0.03, 0.1, 6), m.stem, 0, 0.32, 0, g);
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  parent.add(g);
}

function buildEntrance(scene, m) {
  const g = new THREE.Group();
  scene.add(g);
  const x1 = -COLUMN_X + 0.1;
  const x2 = COLUMN_X - 0.1;
  const head = 4.4;
  const z = GLASS_Z;

  // The lobby: a warm-lit room behind the glass (lit by its own lights, so
  // it isn't shaded by the sun), two stories tall up to the canopy.
  const back = z - 4.5;
  const top = ROOF.apex - ROOF.thick + 0.1; // hidden behind the soffit
  panel(x1, x2, 0, head, back, m.lobby, g);
  panel(x1, x2, head, top, back, m.lobbySide, g);
  for (const [x, rot] of [[x1, Math.PI / 2], [x2, -Math.PI / 2]]) {
    const side = place(new THREE.PlaneGeometry(4.5, top), m.lobbySide, x, top / 2, (z + back) / 2, g);
    side.rotation.y = rot;
  }
  const floor = place(new THREE.PlaneGeometry(x2 - x1, 4.5), m.lobbyFloor, 0, 0.01, (z + back) / 2, g);
  floor.rotation.x = -Math.PI / 2;
  const ceiling = place(new THREE.PlaneGeometry(x2 - x1, 4.5), m.lobbySide, 0, top, (z + back) / 2, g);
  ceiling.rotation.x = Math.PI / 2;

  // Glass: the front up to the head, then the clerestory up under the roof.
  const glass = new THREE.Shape();
  glass.moveTo(x1, 0);
  glass.lineTo(x2, 0);
  for (let i = 0; i <= 16; i++) {
    const x = x2 - ((x2 - x1) * i) / 16;
    glass.lineTo(x, roofY(x) - ROOF.thick - 0.05);
  }
  const glassGeo = new THREE.ShapeGeometry(glass);
  glassGeo.translate(0, 0, z + 0.02);
  const pane = place(meterUV(glassGeo), m.glass, 0, 0, 0, g);
  pane.castShadow = false;

  // Maroon mullions: a grid of bays, the double doors in the middle.
  const cols = [x1, -1.9, -0.95, 0, 0.95, 1.9, x2];
  for (const x of cols) {
    const top = roofY(x) - ROOF.thick - 0.05;
    box(x - 0.05, x + 0.05, 0, top, z, z + 0.14, m.maroon, g, 0.015);
  }
  for (const y of [0.08, 2.3, 3.3, head]) box(x1, x2, y - 0.06, y + 0.06, z, z + 0.14, m.maroon, g, 0.015);
  for (const [a, b] of [[x1, -0.95], [0.95, x2]]) box(a, b, 0.96, 1.04, z, z + 0.12, m.maroon, g, 0.012);
  // The doors: wide maroon rails, push bars.
  for (const [a, b] of [[-0.95, 0], [0, 0.95]]) {
    box(a + 0.04, b - 0.04, 0.12, 0.42, z + 0.04, z + 0.16, m.maroon, g, 0.012);
    box(a + 0.04, b - 0.04, 0.9, 1.0, z + 0.04, z + 0.16, m.maroon, g, 0.012);
    const hx = a < 0 ? b - 0.12 : a + 0.12;
    box(hx - 0.02, hx + 0.02, 0.85, 1.35, z + 0.18, z + 0.22, m.steel, g, 0.008);
  }
  // Pumpkins out front for fall.
  pumpkin(g, -1.55, z + 0.6, 1.3, m);
  pumpkin(g, -1.95, z + 0.75, 0.95, m);
  pumpkin(g, 1.7, z + 0.65, 1.15, m);
  mergeStatic(g, { receive: true });
}

// ---- The building around the entrance: one story, nothing behind it ----

// A dorm window: light frame, dark glass with a glare, a sill.
function windowAt(parent, x, y, z, m) {
  box(x - 0.62, x + 0.62, y - 0.72, y + 0.72, z, z + 0.06, m.frame, parent, 0.015);
  box(x - 0.52, x + 0.52, y - 0.62, y + 0.62, z + 0.06, z + 0.07, m.pane, parent, 0);
  box(x - 0.7, x + 0.7, y - 0.84, y - 0.74, z, z + 0.12, m.cap, parent, 0.012);
}

function buildWalls(scene, m) {
  const g = new THREE.Group();
  scene.add(g);

  // Left: the stucco wing with the sign, its front 1.6 m ahead of the glass;
  // a block wall turns back to the vestibule.
  const lf = -4.4;
  box(-19, -3.9, 0, 4.3, -11, lf, m.stucco, g);
  box(-3.9, -COLUMN_X + 0.1, 0, 4.3, -11, -5.0, m.block, g);
  box(-19.1, -3.8, 4.3, 4.45, -11.1, lf + 0.06, m.coping, g, 0.02);
  box(-3.9, -COLUMN_X + 0.1, 4.3, 4.45, -11, -4.94, m.coping, g, 0.02);
  const sign = place(new THREE.PlaneGeometry(3.4, 0.74), m.sign, -6.9, 3.05, lf + 0.02, g);
  sign.castShadow = false;
  for (const x of [-11, -13.8, -16.6]) windowAt(g, x, 2.3, lf, m);

  // Right: split-face block, a step taller, then stucco.
  const rf = -4.6;
  box(COLUMN_X - 0.1, 9.5, 0, 5.2, -11, rf, m.block, g);
  box(9.5, 19, 0, 5.2, -11, rf - 0.3, m.stucco, g);
  box(COLUMN_X - 0.2, 9.6, 5.2, 5.35, -11.1, rf + 0.06, m.coping, g, 0.02);
  box(9.4, 19.1, 5.2, 5.35, -11.1, rf - 0.24, m.coping, g, 0.02);
  for (const x of [11.4, 14.2, 17]) windowAt(g, x, 2.6, rf - 0.3, m);
  // The gutter's downspout down the block wall's corner.
  box(COLUMN_X + 0.26, COLUMN_X + 0.38, 0.25, 5.2, rf + 0.04, rf + 0.16, m.bronze, g, 0.015);
  box(COLUMN_X + 0.2, COLUMN_X + 0.6, 0.05, 0.25, rf + 0.04, rf + 0.3, m.bronze, g, 0.015);
  mergeStatic(g, { receive: true });
}

// ---- The bike shelters (side platforms) ----

// A gently arched roof running along x, from z1 (back) to z2 (front): its
// top is at `y` in the middle, `thick` thick, ~7 cm lower at the edges.
function archSlab(x1, x2, z1, z2, y, thick, mat, parent) {
  const mid = (z1 + z2) / 2;
  const half = (z2 - z1) / 2;
  const sag = (z) => 0.07 * ((z - mid) / half) ** 2;
  const shape = new THREE.Shape();
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const z = z1 + ((z2 - z1) * i) / N;
    if (i) shape.lineTo(-z, y - sag(z));
    else shape.moveTo(-z, y - sag(z));
  }
  for (let i = N; i >= 0; i--) {
    const z = z1 + ((z2 - z1) * i) / N;
    shape.lineTo(-z, y - thick - sag(z));
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: x2 - x1, bevelEnabled: false });
  geo.rotateY(Math.PI / 2); // the shape's x (= -z) turns to z, the extrusion to +x
  geo.translate(x1, 0, 0);
  return place(geo, mat, 0, 0, 0, parent);
}

function bike(parent, x, z, color, m, flip) {
  const g = new THREE.Group();
  const frame = toon(color);
  const wheel = new THREE.TorusGeometry(0.31, 0.03, 6, 20);
  for (const wx of [-0.52, 0.52]) ink(place(wheel, m.tire, wx, 0.34, 0, g), 0.012);
  const tube = (ax, ay, bx, by, r = 0.022) => {
    const len = Math.hypot(bx - ax, by - ay);
    const t = place(new THREE.CylinderGeometry(r, r, len, 6), frame, (ax + bx) / 2, (ay + by) / 2, 0, g);
    t.rotation.z = Math.atan2(ax - bx, by - ay);
    ink(t, 0.01);
  };
  tube(-0.52, 0.34, -0.08, 0.34); // chainstay
  tube(-0.08, 0.34, -0.2, 0.86); // seat tube
  tube(-0.2, 0.84, 0.4, 0.84); // top tube
  tube(-0.08, 0.34, 0.4, 0.82); // down tube
  tube(0.4, 0.84, 0.52, 0.34); // fork
  tube(-0.52, 0.34, -0.2, 0.84); // seat stay
  tube(0.4, 0.84, 0.36, 1.0, 0.018); // stem
  ink(place(new THREE.BoxGeometry(0.06, 0.03, 0.5), m.tire, 0.36, 1.0, 0, g), 0.01); // handlebar
  ink(place(new RoundedBoxGeometry(0.24, 0.06, 0.12, 2, 0.02), m.tire, -0.22, 0.9, 0, g), 0.01); // seat
  g.position.set(x, 0, z);
  if (flip) g.rotation.y = Math.PI;
  parent.add(g);
}

function buildShelters(scene, stage, m) {
  const g = new THREE.Group();
  scene.add(g);
  const colors = [[0x2e86de, 0xf1c40f], [0x27ae60, 0xe74c3c]];
  stage.platforms.slice(0, 2).forEach((p, i) => {
    const front = 0.45;
    const backZ = -1.75;
    const postZ = -1.4;
    // Posts at the back, arms reaching forward under a curved roof whose
    // top is the platform (2 m) and whose underside clears heads (~1.84 m).
    for (const x of [p.x1 + 0.3, p.x2 - 0.3]) {
      box(x - 0.06, x + 0.06, 0, 1.88, postZ - 0.06, postZ + 0.06, m.maroon, g, 0.02);
      box(x - 0.04, x + 0.04, 1.8, 1.88, backZ, front - 0.05, m.maroon, g, 0.015);
    }
    ink(archSlab(p.x1 - 0.05, p.x2 + 0.05, backZ, front, 2.0, 0.09, m.teal, g), 0.02);
    ink(archSlab(p.x1 - 0.02, p.x2 + 0.02, backZ - 0.02, front + 0.02, 2.01, 0.025, m.roofing, g), 0.015);
    // A bike rack and two bikes under it.
    box(p.x1 + 0.5, p.x2 - 0.5, 0.0, 0.08, -1.05, -0.95, m.steel, g, 0.012);
    bike(g, (p.x1 + p.x2) / 2 - 0.55, -1.0, colors[i][0], m, i === 1);
    bike(g, (p.x1 + p.x2) / 2 + 0.6, -1.15, colors[i][1], m, i === 0);
  });
  mergeStatic(g, { receive: true, cast: true });
}

// ---- Trees, shrubs, leaf piles, the lamp post ----

// A maple in fall colors: a forked trunk under a few round puffs of leaves.
function fallTree(parent, x, z, s, leaf, m, rnd, outline = true) {
  const g = new THREE.Group();
  const trunk = new THREE.CylinderGeometry(0.13, 0.2, 2.4, 7);
  trunk.translate(0, 1.2, 0);
  const t = place(trunk, m.bark, 0, 0, 0, g);
  if (outline) ink(t, 0.03 / s);
  for (const side of [-1, 1]) {
    const fork = new THREE.CylinderGeometry(0.06, 0.1, 1.3, 6);
    fork.translate(0, 0.65, 0);
    const f = place(fork, m.bark, 0, 2.2, 0, g);
    f.rotation.z = side * 0.55;
    if (outline) ink(f, 0.025 / s);
  }
  const puffs = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * Math.PI * 2 + rnd();
    const r = 0.75 + rnd() * 0.45;
    const p = place(new THREE.IcosahedronGeometry(r, 1), leaf, Math.cos(a) * 0.9, 3.1 + rnd() * 0.9, Math.sin(a) * 0.6, g);
    if (outline) ink(p, 0.035 / s);
  }
  const crown = place(new THREE.IcosahedronGeometry(1.0, 1), leaf, 0, 4.1, 0, g);
  if (outline) ink(crown, 0.035 / s);
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  parent.add(g);
  return g;
}

// A few round evergreens among the maples.
function evergreen(parent, x, z, h, m, outline = true) {
  const g = new THREE.Group();
  place(new THREE.CylinderGeometry(h * 0.025, h * 0.035, h * 0.25, 6), m.bark, 0, h * 0.12, 0, g);
  for (const [r, th, y] of [[0.3, 0.45, 0.4], [0.24, 0.36, 0.62], [0.16, 0.3, 0.82]]) {
    const needles = place(new THREE.ConeGeometry(h * r, h * th, 8), m.needles, 0, h * y - h * th * 0.3, 0, g);
    if (outline) ink(needles, 0.03);
  }
  g.position.set(x, 0, z);
  parent.add(g);
}

// Round shrubs along the walls (burning bush turns bright red in the fall).
function shrub(parent, x, z, s, mat) {
  const bush = ink(place(new THREE.SphereGeometry(0.55, 14, 10), mat, x, 0.38 * s, z, parent), 0.03);
  bush.scale.set(s * 1.25, s * 0.8, s);
}

// A raked pile of leaves.
function leafPile(parent, x, z, s, mats, rnd) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const r = (0.38 + rnd() * 0.22) * s;
    const blob = ink(place(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats[i % mats.length], (i - 1.5) * 0.36 * s, 0, (rnd() - 0.5) * 0.4 * s, g), 0.03);
    blob.scale.y = 0.55 + rnd() * 0.2;
  }
  g.position.set(x, 0, z);
  parent.add(g);
}

function lampPost(parent, x, z, dark, glow) {
  const g = new THREE.Group();
  ink(place(new THREE.CylinderGeometry(0.07, 0.11, 5.4, 10), dark, 0, 2.7, 0, g), 0.03);
  ink(place(new THREE.BoxGeometry(0.95, 0.1, 0.12), dark, 0.4, 5.3, 0, g), 0.025);
  ink(place(new THREE.BoxGeometry(0.5, 0.16, 0.4), dark, 0.8, 5.25, 0, g), 0.025);
  place(new THREE.BoxGeometry(0.42, 0.04, 0.32), glow, 0.8, 5.16, 0, g);
  g.position.set(x, 0, z);
  parent.add(g);
}

// ---- The scene ----

export function buildRushton(stage, scene) {
  const rnd = seeded(5);
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xefe4d2, 40, 230);

  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x8a7652, 1.3));
  const sun = new THREE.DirectionalLight(0xffe2b5, 2.3);
  sun.position.set(-8, 13, 10); // afternoon sun from the front left, like the photo
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 14, bottom: -8, near: 1, far: 50 });
  scene.add(sun);

  const leafMats = LEAVES.map((c) => toon(c));
  const m = {
    plaza: toon(0xffffff, { map: plazaTexture() }),
    lawn: toon(0xffffff, { map: lawnTexture() }),
    grass: toon(0x7ea24a),
    stone: toon(0xffffff, { map: stoneTexture() }),
    block: toon(0xffffff, { map: blockTexture() }),
    stucco: toon(0xffffff, { map: stuccoTexture() }),
    rock: toon(0xffffff, { map: rockTexture() }),
    cap: toon(0xd8d0c0),
    coping: toon(0x5b5652),
    roofing: toon(0xc4c8cc),
    maroon: toon(0x6e2232),
    teal: toon(0x2c8fbf, { emissive: 0x06223a }),
    steel: toon(0xb9c2cc),
    bronze: toon(0x4a3a2c),
    tire: toon(0x26262b),
    frame: toon(0xf2eee6),
    pane: toon(0x3d5f80),
    glass: new THREE.MeshBasicMaterial({ map: glassTexture(), transparent: true, opacity: 0.5, depthWrite: false }),
    lobby: new THREE.MeshBasicMaterial({ map: lobbyTexture(), color: 0xd9cbb4 }),
    lobbySide: new THREE.MeshBasicMaterial({ color: 0xc9b496 }),
    lobbyFloor: new THREE.MeshBasicMaterial({ color: 0x8c7a66 }),
    sign: toon(0xffffff, { map: signTexture('RUSHTON') }),
    bark: toon(0x4a3628),
    needles: toon(0x2f5a45),
    dark: toon(0x34373f),
    pot: toon(0x8a4a2a),
    mumOrange: toon(0xe8732a),
    mumYellow: toon(0xf2b632),
    pumpkin: toon(0xf07b1d),
    stem: toon(0x4f6b2a),
    burningBush: toon(0xc0282f),
    boxwood: toon(0x4f7a35),
  };

  // ---- The ground: the plaza (the stage juts out at the front) and the
  // walk up to the doors, lawns to the sides, the bluff's stone wall and
  // rock under it all. ----
  const land = new THREE.Group();
  scene.add(land);
  const main = stage.main;
  const front = FRONT;
  const edge = -2.6; // where the lawns beyond the stage's edges stop
  ground(main.x1 + 0.28, main.x2 - 0.28, edge, front - 0.3, 0, m.plaza, land);
  ground(-4.6, 4.6, GLASS_Z - 0.2, edge, 0, m.plaza, land);
  ground(-70, -4.6, -60, edge, -0.005, m.lawn, land);
  ground(4.6, 70, -60, edge, -0.005, m.lawn, land);
  ground(-4.6, 4.6, -60, GLASS_Z - 0.2, -0.005, m.lawn, land);
  // The stage block: a stone band with a lighter coping around the pavers.
  box(main.x1, main.x2, -1.4, -0.01, edge + 0.01, front, m.stone, land, 0.06);
  box(main.x1 - 0.06, main.x2 + 0.06, -0.12, 0, front - 0.3, front + 0.06, m.cap, land, 0.03);
  for (const x of [main.x1 - 0.06, main.x2 - 0.28]) box(x, x + 0.34, -0.12, 0, edge, front - 0.3, m.cap, land, 0.03);
  // Under it, a jagged outcrop of the bluff's rock.
  const under = new THREE.Shape();
  under.moveTo(main.x1 + 0.05, -1.35);
  under.lineTo(main.x2 - 0.05, -1.35);
  const half = (main.x2 - main.x1) / 2;
  for (let i = 1; i < 18; i++) {
    const x = main.x2 - 0.05 - ((main.x2 - main.x1 - 0.1) * i) / 18;
    const t = 1 - (x / half) ** 2;
    under.lineTo(x, -1.35 - 4.4 * Math.max(0, t) ** 0.75 - (i % 2 ? 0.45 : 0) * t - rnd() * 0.3 * t);
  }
  under.lineTo(main.x1 + 0.05, -1.35);
  const underGeo = new THREE.ExtrudeGeometry(under, { depth: front - edge - 0.6, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 1 });
  underGeo.translate(0, 0, edge + 0.3);
  ink(place(meterUV(underGeo), m.rock, 0, 0, 0, land), 0.06);
  // The bluff's edge all along, set back behind the fighters: stone, then
  // rock down into the haze, grass hanging over the top.
  box(-70, 70, -1.4, -0.01, edge - 4, edge, m.stone, land, 0.06);
  box(-70, 70, -18, -1.4, edge - 4, edge - 0.4, m.rock, land, 0.05);
  for (const [x1, x2] of [[-70, main.x1], [main.x2, 70]]) {
    dripLip(x1, x2, 0.0, 0.3, m.grass, land, { drips: Math.round((x2 - x1) / 0.7), thick: 0.1 }).position.z = edge - 0.12;
  }
  for (const [x1, x2, y] of [[-30, -11, -3.2], [-19, -8.2, -6.4], [9, 24, -4.1], [12.5, 30, -7.5], [-6, 5, -7.8]]) {
    box(x1, x2, y - 0.15, y, edge - 1.2, edge - 0.15, m.grass, land, 0.03);
  }

  // Shrubs along the walls, raked leaf piles, the lamp post.
  for (const [x, z, s, mat] of [[-8.6, -3.7, 1.1, m.burningBush], [-10.4, -3.6, 0.9, m.boxwood], [-14.5, -3.7, 1.2, m.burningBush],
    [8.2, -3.9, 1.0, m.boxwood], [10.2, -4.0, 1.2, m.burningBush], [15.5, -3.9, 1.0, m.burningBush], [17.4, -4.0, 0.9, m.boxwood]]) {
    shrub(land, x, z, s, mat);
  }
  const pileMats = [leafMats[0], leafMats[1], leafMats[3], leafMats[4]];
  for (const [x, z, s] of [[-11.8, -3.1, 1.3], [12.6, -3.2, 1.4], [-6.7, edge + 0.35, 0.8], [6.8, edge + 0.4, 0.75], [-1.9, edge + 0.3, 0.6]]) {
    leafPile(land, x, z, s, pileMats, rnd);
  }
  lampPost(land, -9.0, -3.2, m.dark, new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
  mergeStatic(land, { receive: true });

  buildCanopy(scene, m);
  buildEntrance(scene, m);
  buildWalls(scene, m);
  buildShelters(scene, stage, m);

  // ---- Trees: maples in fall colors by the building and behind the low
  // wings (nothing behind the canopy but sky, like the photo), a few
  // evergreens, treetops coming up the bluff, a fall treeline far off. ----
  const trees = new THREE.Group();
  scene.add(trees);
  const leafOf = (i) => leafMats[i % leafMats.length];
  for (const [x, z, s, c] of [[-12.4, -3.4, 1.15, 0], [12.9, -3.0, 1.1, 2], [-10.5, -14, 1.7, 1], [-16, -15, 1.9, 3],
    [10.8, -14.5, 1.8, 2], [16.5, -13.5, 1.6, 0], [-22, -9, 1.7, 5], [22, -9.5, 1.8, 1], [-26, -14, 2.0, 2], [27, -15, 1.9, 3]]) {
    fallTree(trees, x, z, s, leafOf(c), m, rnd);
  }
  for (const [x, z, h] of [[-7.5, -16, 9], [7.2, -17, 10], [-19, -20, 11], [19.5, -19, 12]]) evergreen(trees, x, z, h, m);
  // Treetops coming up the bluff below, beside the stage (behind the
  // fighters, in front of the rock).
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (8.6 + rnd() * 24);
    const t = fallTree(trees, 0, 0, 1.2 + rnd() * 0.3, leafOf(i), m, rnd, Math.abs(x) < 20);
    t.position.set(x, -14 - rnd() * 3, -2.5 + rnd() * 0.9);
  }
  // The treeline across the fields.
  for (let i = 0; i < 110; i++) {
    const x = -170 + rnd() * 340;
    const z = -45 - rnd() * 85;
    if (i % 6 === 0) evergreen(trees, x, z, 9 + rnd() * 6, m, false);
    else fallTree(trees, x, z, 1.6 + rnd() * 1.2, leafOf(Math.floor(rnd() * 6)), m, rnd, false);
  }
  mergeStatic(trees);

  // ---- Far away: rolling fall hills under the haze ----
  const far = new THREE.Group();
  scene.add(far);
  const hills = [toon(0xb08a4a), toon(0x9a7a3c), toon(0xa86a38)];
  for (let i = 0; i < 9; i++) {
    const r = 40 + rnd() * 40;
    const h = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), hills[i % 3]);
    h.scale.y = 0.22 + rnd() * 0.12;
    h.position.set(-260 + i * 65 + rnd() * 20, -4, -170 - rnd() * 40);
    far.add(h);
  }
  const fields = new THREE.Mesh(new THREE.PlaneGeometry(900, 300), toon(0xa9ad62));
  fields.rotation.x = -Math.PI / 2;
  fields.position.set(0, -0.05, -210);
  far.add(fields);
  mergeStatic(far);

  // Haze down the bluff, behind the fighters (they stay visible as they fall).
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(260, 30), new THREE.MeshBasicMaterial({ map: hazeTexture(), transparent: true, depthWrite: false, fog: false }));
  haze.position.set(0, -16.5, edge - 0.3);
  haze.renderOrder = 1;
  scene.add(haze);

  // ---- Leaves drifting down, tumbling as they go ----
  const COUNT = 90;
  const leafShape = new THREE.Shape();
  leafShape.moveTo(-0.07, 0);
  leafShape.quadraticCurveTo(0, 0.055, 0.07, 0);
  leafShape.quadraticCurveTo(0, -0.055, -0.07, 0);
  const drifting = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape), toon(0xffffff, { side: THREE.DoubleSide }), COUNT);
  drifting.frustumCulled = false;
  const leaves = [];
  const color = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    leaves.push({
      x: (rnd() - 0.5) * 50, y: -10 + rnd() * 30, z: -10 + rnd() * 14,
      fall: 0.5 + rnd() * 0.5, phase: rnd() * Math.PI * 2, spin: 1 + rnd() * 2.5,
    });
    drifting.setColorAt(i, color.setHex(LEAVES[i % LEAVES.length]));
  }
  scene.add(drifting);
  const dummy = new THREE.Object3D();
  const layLeaves = (time) => {
    for (let i = 0; i < COUNT; i++) {
      const l = leaves[i];
      dummy.position.set(l.x + Math.sin(time * 0.9 + l.phase) * 0.6, l.y, l.z);
      dummy.rotation.set(time * l.spin + l.phase, Math.sin(time + l.phase) * 1.2, time * l.spin * 0.6);
      dummy.updateMatrix();
      drifting.setMatrixAt(i, dummy.matrix);
    }
    drifting.instanceMatrix.needsUpdate = true;
  };
  layLeaves(0);

  let time = 0;
  return {
    update(dt) {
      time += dt;
      for (const l of leaves) {
        l.y -= dt * l.fall;
        l.x += dt * 0.25; // a light breeze
        if (l.y < -10) {
          l.y += 30;
          l.x = (rnd() - 0.5) * 50;
        }
      }
      layLeaves(time);
    },
  };
}

export const RUSHTON = {
  id: 'rushton', name: 'Rushton Hall', create: createRushton, build: buildRushton,
  thumb: `url(${PHOTO}) center / cover`,
  rim: AIR,
};
