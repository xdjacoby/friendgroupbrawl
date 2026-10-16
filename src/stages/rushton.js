import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toon, ink, mergeStatic, place, seeded, paint } from '../stage.js';

// Rushton Hall: a snow day out front of the dorm, built in 3D from the
// owner's photo (public/stages/rushton-hall.jpg, also the stage picker's
// thumbnail) and seen from about where it was taken: eye level, straight on
// at the entrance. The fight happens on the plaza in front of the doors.
//
//   - The entrance: the swooping canopy (low on the left, high on the right,
//     teal fascia, maroon steel truss), the glass vestibule and its doors
//     with the lobby behind them, stone planters at the columns' feet.
//   - Left: the stucco wing with the RUSHTON sign, the lamp post, a bare tree.
//     Right: the split-face block wall with its ice column, big snowbanks.
//   - Behind: the dorm's stepped residence towers (one window per room).
//
// Platforms: the canopy's truss beam is the top one (4 m); the side ones are
// two snowy bike shelters (2 m) in the same maroon and teal as the canopy.
// The plaza juts out over the edge of the campus bluff, so falling off the
// sides drops past the snowy cliff into the mist.

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
const SNOW = 0xf4f8ff;
const SKY = 0xcfe6ff; // the air's color: the haze, and the rim light on the fighters

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

// A beam from (x1, y1) to (x2, y2) in the plane at depth z.
function beam(x1, y1, x2, y2, z, size, mat, parent) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const m = place(new THREE.BoxGeometry(size, len, size), mat, (x1 + x2) / 2, (y1 + y2) / 2, z, parent);
  m.rotation.z = Math.atan2(x1 - x2, y2 - y1);
  return ink(m, 0.022);
}

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
const drips = (x1, x2) => Math.max(2, Math.round((x2 - x1) / 0.75));

// Snow lying on a flat roof or ledge: a soft slab, drips over the front.
function roofSnow(x1, x2, y, z1, z2, mat, parent) {
  const slab = place(new RoundedBoxGeometry(x2 - x1 + 0.12, 0.3, z2 - z1 + 0.1, 2, 0.12), mat, (x1 + x2) / 2, y + 0.08, (z1 + z2) / 2, parent);
  ink(slab, 0.04);
  snowCap(x1 - 0.06, x2 + 0.06, y + 0.2, 0.3, mat, parent, { drips: drips(x1, x2), thick: 0.12 }).position.z = z2;
}

function icicles(x1, x2, y, z, mat, parent, rnd, count) {
  for (let i = 0; i < count; i++) {
    const len = 0.12 + rnd() * 0.32;
    const ice = place(new THREE.ConeGeometry(0.035 + rnd() * 0.03, len, 6), mat, x1 + rnd() * (x2 - x1), y - len / 2, z, parent);
    ice.rotation.x = Math.PI;
  }
}

function snowBank(parent, x, z, s, mat, rnd, blobs = 4) {
  const g = new THREE.Group();
  for (let i = 0; i < blobs; i++) {
    const r = (0.45 + rnd() * 0.35) * s;
    const blob = ink(place(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat, (i - (blobs - 1) / 2) * 0.55 * s, 0, (rnd() - 0.5) * 0.5 * s, g), 0.04);
    blob.scale.y = 0.62 + rnd() * 0.2;
  }
  g.position.set(x, 0, z);
  parent.add(g);
}

// ---- Textures (painted at load, like every other stage) ----

function tiled(tex) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Grey concrete pavers, wet and slushy (2.4 m per tile).
function plazaTexture() {
  const rnd = seeded(21);
  const tex = paint(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#5d6672';
    ctx.fillRect(0, 0, w, h);
    const n = 4;
    const s = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = ['#8d97a3', '#86909c', '#939ca8', '#7f8995'][Math.floor(rnd() * 4)];
        ctx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      }
    }
    // Slush and packed snow.
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = `rgba(232,242,252,${0.3 + rnd() * 0.45})`;
      const x = rnd() * w;
      const y = rnd() * h;
      const rx = 14 + rnd() * 50;
      const ry = 6 + rnd() * 16;
      for (const dx of [-w, 0, w]) {
        for (const dy of [-h, 0, h]) {
          ctx.beginPath();
          ctx.ellipse(x + dx, y + dy, rx, ry, rnd() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
  tex.repeat.set(1 / 2.4, 1 / 2.4);
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

// The bluff's rock: layered bands, cracks, snow on the ledges (4 m tile).
function rockTexture() {
  const rnd = seeded(52);
  const tex = paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6a6168';
    ctx.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const bh = 34 + rnd() * 40;
      ctx.fillStyle = ['#857b74', '#776e6c', '#8c827a', '#7d7471'][Math.floor(rnd() * 4)];
      ctx.beginPath();
      ctx.moveTo(0, y + 3);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + 3 + Math.sin(x / 40 + y) * 4);
      ctx.lineTo(w, y + bh);
      ctx.lineTo(0, y + bh);
      ctx.fill();
      // Now and then, snow caught on a ledge.
      if (rnd() < 0.5) {
        ctx.fillStyle = 'rgba(236,243,251,0.9)';
        ctx.beginPath();
        ctx.ellipse(rnd() * w, y + 4, 22 + rnd() * 30, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      y += bh;
    }
    ctx.strokeStyle = 'rgba(40,32,48,0.45)';
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

// The residence towers: a room's window per bay, four bays by two floors
// (12.8 m x 6.2 m), curtains in whatever colors the residents put up.
function dormTexture() {
  const rnd = seeded(44);
  const W = 1024;
  const H = 496; // 80 px per meter
  const tex = paint(W, H, (ctx) => {
    ctx.fillStyle = '#e4d6bf';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = `rgba(150,128,100,${rnd() * 0.09})`;
      ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
    }
    const curtains = ['#c0392b', '#2e86de', '#f1c40f', '#8e44ad', '#27ae60', '#e67e22', '#ecf0f1', '#ff7eb6'];
    for (let floor = 0; floor < 2; floor++) {
      const y0 = H - (floor + 1) * 248; // top of this floor
      // Floor line.
      ctx.fillStyle = 'rgba(110,90,70,0.25)';
      ctx.fillRect(0, y0 + 244, W, 4);
      for (let bay = 0; bay < 4; bay++) {
        const x = bay * 256 + 80;
        const y = y0 + 64;
        const ww = 96;
        const wh = 120;
        ctx.fillStyle = '#f4f1ea';
        ctx.fillRect(x - 8, y - 8, ww + 16, wh + 16);
        ctx.fillStyle = '#cfc6b6';
        ctx.fillRect(x - 12, y + wh + 6, ww + 24, 10); // sill
        const g = ctx.createLinearGradient(x, y, x + ww, y + wh);
        const lit = rnd() < 0.18;
        g.addColorStop(0, lit ? '#ffe7a8' : '#5d84a8');
        g.addColorStop(1, lit ? '#f2b85a' : '#253f5c');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, ww, wh);
        const style = rnd();
        if (style < 0.45) {
          ctx.fillStyle = curtains[Math.floor(rnd() * curtains.length)];
          const open = 0.25 + rnd() * 0.25;
          ctx.fillRect(x, y, ww * open * 0.5, wh);
          ctx.fillRect(x + ww - ww * open * 0.5, y, ww * open * 0.5, wh);
        } else if (style < 0.7) {
          ctx.fillStyle = 'rgba(240,236,226,0.85)'; // blinds half down
          const down = 0.3 + rnd() * 0.5;
          for (let k = 0; k < wh * down; k += 8) ctx.fillRect(x, y + k, ww, 5);
        }
        // Glare.
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.moveTo(x + ww * 0.15, y + wh);
        ctx.lineTo(x + ww * 0.55, y);
        ctx.lineTo(x + ww * 0.75, y);
        ctx.lineTo(x + ww * 0.35, y + wh);
        ctx.fill();
        // Mullion.
        ctx.fillStyle = '#f4f1ea';
        ctx.fillRect(x + ww / 2 - 3, y, 6, wh);
      }
    }
  });
  tex.repeat.set(1 / 12.8, 1 / 6.2);
  tex.offset.set(0, -1 / 6.2); // the first floor starts on top of the 1 m block base
  return tiled(tex);
}

// The vestibule glass: sky and snowy trees reflected, with glare streaks.
// One picture over the whole glass front (6 m x 6.5 m).
function glassTexture() {
  const rnd = seeded(17);
  const tex = paint(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9cc4e4');
    g.addColorStop(0.55, '#cfe3f2');
    g.addColorStop(0.75, '#e9f2f8');
    g.addColorStop(1, '#b8c8d6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Reflected bare trees across the lower half.
    ctx.strokeStyle = 'rgba(70,70,85,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w;
      const top = h * (0.45 + rnd() * 0.15);
      ctx.beginPath();
      ctx.moveTo(x, h * 0.78);
      ctx.lineTo(x + (rnd() - 0.5) * 10, top);
      ctx.stroke();
      for (let k = 0; k < 3; k++) {
        const y = top + rnd() * (h * 0.78 - top) * 0.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 30, y - 10 - rnd() * 14);
        ctx.stroke();
      }
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
  tex.repeat.set(1 / 5.7, 1 / 4.4);
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

// Clear winter sky, pale toward the horizon, and pale mist below it.
function skyTexture() {
  return paint(2, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2b7fd6');
    g.addColorStop(0.42, '#83c2f0');
    g.addColorStop(0.6, '#d3e8f7');
    g.addColorStop(1, '#eef5fb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function mistTexture() {
  return paint(2, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(234,243,251,0)');
    g.addColorStop(0.12, 'rgba(234,243,251,0.1)');
    g.addColorStop(0.32, 'rgba(234,243,251,0.85)');
    g.addColorStop(1, 'rgba(238,245,251,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// ---- The canopy ----
// Its roof sweeps up from the left (4.6 m) to the right (7.1 m), like the
// photo: quick at first, flattening out. Front edge at z = -0.5, back into
// the building at z = -6.3.
const ROOF = { x1: -4.0, x2: 4.2, low: 4.6, rise: 2.5, front: -0.5, back: -6.3, thick: 0.45 };
const roofY = (x) => ROOF.low + ROOF.rise * Math.sin((Math.PI / 2) * THREE.MathUtils.clamp((x - ROOF.x1) / (ROOF.x2 - ROOF.x1), 0, 1));
const COLUMN_X = 2.95; // the front columns, at the beam's ends
const COLUMN_Z = -0.85;
const GLASS_Z = -6.0;

// A slab that follows the roof curve, `bottom`..`top` above the roof line, from z1 to z2.
function curvedSlab(bottom, top, z1, z2, mat, parent, { x1 = ROOF.x1, x2 = ROOF.x2, bevel = 0 } = {}) {
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

function buildCanopy(scene, m, rnd) {
  const g = new THREE.Group();
  scene.add(g);
  // The roof: teal all over (the soffit underneath is teal panels too), a
  // maroon trim under the front edge, snow piled on top.
  ink(curvedSlab(-ROOF.thick, 0, ROOF.back, ROOF.front, m.teal, g), 0.035);
  ink(curvedSlab(-ROOF.thick - 0.14, -ROOF.thick, ROOF.front - 0.25, ROOF.front + 0.02, m.maroon, g), 0.02);
  ink(curvedSlab(-0.02, 0.26, ROOF.back, ROOF.front - 0.06, m.snow, g, { x1: ROOF.x1 + 0.05, x2: ROOF.x2 - 0.05, bevel: 0.08 }), 0.035);
  // Maroon ribs and purlins under the soffit.
  for (const z of [-1.6, -2.9, -4.2, -5.5]) {
    ink(curvedSlab(-ROOF.thick - 0.12, -ROOF.thick, z - 0.06, z + 0.06, m.maroon, g), 0.015);
  }
  for (let i = 1; i < 6; i++) {
    const x = ROOF.x1 + ((ROOF.x2 - ROOF.x1) * i) / 6;
    const y = roofY(x) - ROOF.thick - 0.05;
    place(new THREE.BoxGeometry(0.08, 0.08, ROOF.front - ROOF.back), m.maroon, x, y, (ROOF.front + ROOF.back) / 2, g);
  }
  for (let i = 0; i < 7; i++) {
    const x = ROOF.x1 + 0.2 + rnd() * 2.6;
    const len = 0.15 + rnd() * 0.3;
    const ice = place(new THREE.ConeGeometry(0.04, len, 6), m.ice, x, roofY(x) - ROOF.thick - 0.14 - len / 2, ROOF.front - 0.1, g);
    ice.rotation.x = Math.PI;
  }

  // The truss across the front: the bottom chord is the top platform (4 m),
  // posts and diagonals up to the roof.
  const under = (x) => roofY(x) - ROOF.thick - 0.14;
  box(-COLUMN_X, COLUMN_X, 3.78, 4.0, COLUMN_Z - 0.11, COLUMN_Z + 0.11, m.maroon, g, 0.03);
  box(-COLUMN_X + 0.05, COLUMN_X - 0.05, 3.99, 4.04, COLUMN_Z - 0.12, COLUMN_Z + 0.16, m.snow, g, 0.015);
  const posts = [-COLUMN_X, -1.5, 0, 1.5, COLUMN_X];
  for (const x of posts.slice(1, -1)) beam(x, 4.0, x, under(x) + 0.05, COLUMN_Z, 0.13, m.maroon, g);
  for (let i = 0; i < posts.length - 1; i++) {
    const [a, b] = [posts[i], posts[i + 1]];
    // A W: each diagonal climbs toward the middle of the span.
    if (i < 2) beam(a + 0.05, under(a), b, 4.0, COLUMN_Z, 0.11, m.maroon, g);
    else beam(a, 4.0, b - 0.05, under(b), COLUMN_Z, 0.11, m.maroon, g);
  }
  // Columns: the front pair on stone planters, the back pair at the glass.
  for (const s of [-1, 1]) {
    const x = s * COLUMN_X;
    box(x - 0.12, x + 0.12, 1.0, under(x) + 0.1, COLUMN_Z - 0.12, COLUMN_Z + 0.12, m.maroon, g, 0.03);
    box(x - 0.12, x + 0.12, 0, under(x) + 0.1, GLASS_Z + 0.05, GLASS_Z + 0.29, m.maroon, g, 0.03);
    // Brace from the column into the roof, like the photo's.
    beam(x, 3.0, x - s * 0.9, under(x - s * 0.9) + 0.05, COLUMN_Z - 0.25, 0.1, m.maroon, g);
    // The planter.
    const planter = place(new RoundedBoxGeometry(0.95, 1.0, 0.95, 2, 0.04), m.stone, x, 0.5, COLUMN_Z, g);
    meterUV(planter.geometry);
    ink(planter, 0.03);
    ink(place(new RoundedBoxGeometry(1.08, 0.1, 1.08, 2, 0.03), m.cap, x, 1.03, COLUMN_Z, g), 0.02);
    const pile = ink(place(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.snow, x, 1.07, COLUMN_Z, g), 0.025);
    pile.scale.set(1.05, 0.35, 1.05);
  }
  mergeStatic(g, { receive: true, cast: true });
}

// ---- The vestibule: glass front, doors, the lobby behind ----

function buildEntrance(scene, m) {
  const g = new THREE.Group();
  scene.add(g);
  const x1 = -COLUMN_X + 0.1;
  const x2 = COLUMN_X - 0.1;
  const head = 4.4;
  const z = GLASS_Z;

  // The lobby: a warm-lit room behind the glass (lit by its own lights, so
  // it isn't shaded by the sun).
  const back = z - 4.5;
  panel(x1, x2, 0, head, back, m.lobby, g);
  for (const [x, rot] of [[x1, Math.PI / 2], [x2, -Math.PI / 2]]) {
    const side = place(new THREE.PlaneGeometry(4.5, head), m.lobbySide, x, head / 2, (z + back) / 2, g);
    side.rotation.y = rot;
  }
  const floor = place(new THREE.PlaneGeometry(x2 - x1, 4.5), m.lobbyFloor, 0, 0.01, (z + back) / 2, g);
  floor.rotation.x = -Math.PI / 2;
  const ceiling = place(new THREE.PlaneGeometry(x2 - x1, 4.5), m.lobbySide, 0, head, (z + back) / 2, g);
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
  mergeStatic(g, { receive: true });
}

// ---- The building around the entrance ----

function buildWalls(scene, m, rnd) {
  const g = new THREE.Group();
  scene.add(g);

  // Left: the stucco wing with the sign, its front 1.6 m ahead of the glass;
  // a block wall turns back to the vestibule.
  const lf = -4.4;
  box(-12, -3.9, 0, 4.3, -11, lf, m.stucco, g);
  box(-3.9, -COLUMN_X + 0.1, 0, 4.3, -11, -5.0, m.block, g);
  box(-12.1, -3.8, 4.3, 4.45, -11, lf + 0.06, m.coping, g, 0.02);
  box(-3.9, -COLUMN_X + 0.1, 4.3, 4.45, -11, -4.94, m.coping, g, 0.02);
  roofSnow(-12, -3.9, 4.45, -11, lf + 0.05, m.snow, g);
  roofSnow(-3.9, -COLUMN_X + 0.1, 4.45, -11, -4.95, m.snow, g);
  const sign = place(new THREE.PlaneGeometry(3.4, 0.74), m.sign, -6.9, 3.05, lf + 0.02, g);
  sign.castShadow = false;
  icicles(-12, -4.1, 4.35, lf + 0.12, m.ice, g, rnd, 12);

  // Right: split-face block, a step taller, then stucco toward the tower.
  const rf = -4.6;
  box(COLUMN_X - 0.1, 9.5, 0, 5.2, -11, rf, m.block, g);
  box(9.5, 11.6, 0, 5.2, -11, rf - 0.3, m.stucco, g);
  box(COLUMN_X - 0.2, 11.7, 5.2, 5.35, -11, rf + 0.06, m.coping, g, 0.02);
  roofSnow(COLUMN_X - 0.1, 11.6, 5.35, -11, rf + 0.05, m.snow, g);
  // The ice column frozen down the wall's corner (from a leaky gutter).
  const drip = [];
  for (let i = 0; i <= 24; i++) {
    const y = (5.2 * i) / 24;
    drip.push(new THREE.Vector2(i === 24 ? 0.01 : 0.07 + 0.11 * (y / 5.2) + 0.04 * Math.sin(y * 4.3) * (0.4 + rnd() * 0.6), y));
  }
  drip[0].x = 0.12; // a frozen puddle at its foot
  ink(place(new THREE.LatheGeometry(drip, 10), m.icicle, COLUMN_X + 0.32, 0, rf + 0.14, g), 0.02);
  icicles(4.0, 11.4, 5.25, rf + 0.12, m.ice, g, rnd, 12);
  mergeStatic(g, { receive: true });
}

// The residence towers: stepped facades (each step a few rooms wide), one
// window per room, snow on the roofs.
function tower(parent, steps, floors, m) {
  const h = floors * 3.1 + 0.4;
  for (const [x1, x2, z] of steps) {
    box(x1, x2, 0, h, z - 16, z, m.dorm, parent, 0.06);
    box(x1 - 0.02, x2 + 0.02, 0, 1.0, z - 16, z + 0.08, m.block, parent, 0.03);
    box(x1 - 0.06, x2 + 0.06, h, h + 0.18, z - 16, z + 0.08, m.coping, parent, 0.03);
    roofSnow(x1, x2, h + 0.18, z - 16, z + 0.06, m.snow, parent);
  }
}

function buildTowers(scene, m) {
  const g = new THREE.Group();
  scene.add(g);
  tower(g, [[-18.4, -11.8, -9], [-25, -18.4, -10.2], [-31.6, -25, -11.4], [-40, -31.6, -12.6]], 5, m);
  tower(g, [[11.4, 17.8, -9.6], [17.8, 24.4, -10.8], [24.4, 31.0, -12.0], [31.0, 40, -13.2]], 4, m);
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
  const cap = place(new RoundedBoxGeometry(0.22, 0.05, 0.12, 2, 0.02), m.snow, -0.22, 0.95, 0, g); // snow on it
  ink(cap, 0.01);
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
    // Posts at the back, arms reaching forward under a curved roof that
    // sits 1.86 m up (heads clear it), snow on top level with the platform.
    for (const x of [p.x1 + 0.3, p.x2 - 0.3]) {
      box(x - 0.06, x + 0.06, 0, 1.86, postZ - 0.06, postZ + 0.06, m.maroon, g, 0.02);
      box(x - 0.04, x + 0.04, 1.74, 1.82, backZ, front - 0.05, m.maroon, g, 0.015);
    }
    ink(archSlab(p.x1 - 0.05, p.x2 + 0.05, backZ, front, 1.9, 0.07, m.teal, g), 0.02);
    ink(archSlab(p.x1, p.x2, backZ + 0.03, front - 0.03, 2.0, 0.1, m.snow, g), 0.025);
    // A bike rack and two bikes under it, snowed in for the winter.
    box(p.x1 + 0.5, p.x2 - 0.5, 0.0, 0.08, -1.05, -0.95, m.steel, g, 0.012);
    bike(g, (p.x1 + p.x2) / 2 - 0.55, -1.0, colors[i][0], m, i === 1);
    bike(g, (p.x1 + p.x2) / 2 + 0.6, -1.15, colors[i][1], m, i === 0);
  });
  mergeStatic(g, { receive: true, cast: true });
}

// ---- Trees, lamp post, snowman ----

// A bare winter tree: forked branches going every which way.
function bareTree(parent, x, z, s, mat, rnd) {
  const root = new THREE.Group();
  const grow = (holder, len, r, depth) => {
    const geo = new THREE.CylinderGeometry(r * 0.62, r, len, 5);
    geo.translate(0, len / 2, 0);
    ink(place(geo, mat, 0, 0, 0, holder), 0.02 / s);
    if (depth <= 0) return;
    const kids = depth > 2 ? 2 : 3;
    for (let k = 0; k < kids; k++) {
      const turn = new THREE.Group();
      turn.position.y = len * (k === 0 ? 0.98 : 0.55 + rnd() * 0.35);
      turn.rotation.y = rnd() * Math.PI * 2;
      const tilt = new THREE.Group();
      tilt.rotation.z = 0.35 + rnd() * 0.45;
      turn.add(tilt);
      holder.add(turn);
      grow(tilt, len * (0.62 + rnd() * 0.15), r * 0.6, depth - 1);
    }
  };
  grow(root, 2.6, 0.2, 4);
  root.position.set(x, 0, z);
  root.scale.setScalar(s);
  parent.add(root);
}

// A snowy spruce: three tiers of needles, each dusted with snow.
function pine(parent, x, z, h, m, outline = true) {
  const g = new THREE.Group();
  place(new THREE.CylinderGeometry(h * 0.025, h * 0.035, h * 0.25, 6), m.bark, 0, h * 0.12, 0, g);
  const tiers = [[0.3, 0.45, 0.4], [0.24, 0.36, 0.62], [0.16, 0.3, 0.82]];
  for (const [r, th, y] of tiers) {
    const needles = place(new THREE.ConeGeometry(h * r, h * th, 8), m.needles, 0, h * y - h * th * 0.3, 0, g);
    if (outline) ink(needles, 0.03);
    place(new THREE.ConeGeometry(h * r * 0.72, h * th * 0.42, 8), m.snow, 0, h * y - h * th * 0.3 + h * th * 0.3, 0, g);
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
  g.rotation.y = -1.1;
  parent.add(g);
}

// ---- The scene ----

export function buildRushton(stage, scene) {
  const rnd = seeded(5);
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xdde9f4, 40, 230);

  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x8d98ad, 1.35));
  const sun = new THREE.DirectionalLight(0xfff2de, 2.2);
  sun.position.set(-8, 14, 10); // low winter sun from the front left, like the photo
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 14, bottom: -8, near: 1, far: 50 });
  scene.add(sun);

  const m = {
    snow: toon(SNOW, { emissive: 0x1a2533 }),
    ice: toon(0xcfeeff, { emissive: 0x2a4a60, transparent: true, opacity: 0.85 }),
    icicle: toon(0xe8f6ff, { emissive: 0x2a4a60 }),
    plaza: toon(0xffffff, { map: plazaTexture() }),
    stone: toon(0xffffff, { map: stoneTexture() }),
    block: toon(0xffffff, { map: blockTexture() }),
    stucco: toon(0xffffff, { map: stuccoTexture() }),
    dorm: toon(0xffffff, { map: dormTexture() }),
    cap: toon(0xd8d0c0),
    coping: toon(0x5b5652),
    maroon: toon(0x6e2232),
    teal: toon(0x2c8fbf, { emissive: 0x06223a }),
    steel: toon(0xb9c2cc),
    tire: toon(0x26262b),
    glass: new THREE.MeshBasicMaterial({ map: glassTexture(), transparent: true, opacity: 0.5, depthWrite: false }),
    lobby: new THREE.MeshBasicMaterial({ map: lobbyTexture(), color: 0xd9cbb4 }),
    // (the lobby picture spans the back wall: x -2.85..2.85, y 0..4.4)
    lobbySide: new THREE.MeshBasicMaterial({ color: 0xc9b496 }),
    lobbyFloor: new THREE.MeshBasicMaterial({ color: 0x8c7a66 }),
    sign: toon(0xffffff, { map: signTexture('RUSHTON') }),
    rock: toon(0xffffff, { map: rockTexture() }),
    bark: toon(0x4a3a30),
    needles: toon(0x2f5a45),
    dark: toon(0x34373f),
  };

  // ---- The ground: the plaza (the stage juts out at the front), the
  // bluff's stone retaining wall and rock face under it, snowbanks. ----
  const ground = new THREE.Group();
  scene.add(ground);
  const main = stage.main;
  const front = 2.1;
  const edge = -2.6; // where the plaza beyond the stage's edges stops
  const top = (x1, x2, z1, z2) => {
    const geo = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x1 + x2) / 2, 0, (z1 + z2) / 2);
    place(meterUV(geo), m.plaza, 0, 0, 0, ground);
  };
  top(main.x1, main.x2, edge, front);
  top(-70, 70, -30, edge);
  // The stage block: a stone band under the pavers, rock tapering below.
  box(main.x1, main.x2, -1.4, -0.01, edge + 0.01, front, m.stone, ground, 0.06);
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
  ink(place(meterUV(underGeo), m.rock, 0, 0, 0, ground), 0.06);
  // The bluff's edge all along, set back behind the fighters: the plaza's
  // stone wall, then rock down into the mist.
  box(-70, 70, -1.4, -0.01, edge - 4, edge, m.stone, ground, 0.06);
  box(-70, 70, -18, -1.4, edge - 4, edge - 0.4, m.rock, ground, 0.05);
  for (const [x1, x2] of [[-70, main.x1], [main.x2, 70]]) {
    snowCap(x1, x2, 0.02, 0.4, m.snow, ground, { drips: drips(x1, x2), thick: 0.1 }).position.z = edge - 0.1;
  }
  // Snowy ledges down the rock face.
  for (const [x1, x2, y] of [[-30, -11, -3.2], [-19, -8.2, -6.4], [9, 24, -4.1], [12.5, 30, -7.5], [-6, 5, -7.8]]) {
    box(x1, x2, y - 0.15, y, edge - 1.2, edge - 0.15, m.snow, ground, 0.03);
  }
  // Snow along the stage's front edge and sides, icicles hanging off.
  snowCap(main.x1 - 0.15, main.x2 + 0.15, 0.02, 0.5, m.snow, ground, { drips: 18, thick: 0.12 }).position.z = front - 0.15;
  // (Turned a quarter: the cap's length runs along z, its drips face out.)
  const right = snowCap(-front, -edge, 0.02, 0.36, m.snow, ground, { drips: 5, thick: 0.1 });
  right.rotation.y = Math.PI / 2;
  right.position.x = main.x2 - 0.08;
  const left = snowCap(edge, front, 0.02, 0.36, m.snow, ground, { drips: 5, thick: 0.1 });
  left.rotation.y = -Math.PI / 2;
  left.position.x = main.x1 + 0.08;
  icicles(main.x1 + 0.3, main.x2 - 0.3, -0.12, front + 0.15, m.ice, ground, rnd, 26);

  // Snowbanks: the big plowed piles left and right (the photo's), smaller
  // ones along the back of the stage, out of the fighters' way.
  for (const [x, z, s, n] of [[-10.8, -3.6, 1.7, 5], [-8.4, -3.3, 1.1, 3], [8.6, -3.4, 1.3, 4], [11.4, -3.8, 1.8, 5], [14.5, -4.2, 1.4, 4], [-14.2, -4.0, 1.4, 4]]) {
    snowBank(ground, x, z, s, m.snow, rnd, n);
  }
  for (const [x, s] of [[-6.6, 0.75], [-1.7, 0.55], [1.9, 0.6], [6.7, 0.8]]) snowBank(ground, x, edge + 0.2, s, m.snow, rnd, 3);
  lampPost(ground, -9.0, -3.2, m.dark, new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
  snowman(ground, 9.9, -2.9, m.snow, toon(0x1e1e22), toon(0xff8a1f), toon(0xd9363e));
  mergeStatic(ground, { receive: true });

  buildCanopy(scene, m, rnd);
  buildEntrance(scene, m);
  buildWalls(scene, m, rnd);
  buildTowers(scene, m);
  buildShelters(scene, stage, m);

  // ---- Trees: bare ones by the building, snowy spruces behind it, a
  // treeline across the fields. ----
  const trees = new THREE.Group();
  scene.add(trees);
  for (const [x, z, s] of [[-12.6, -4.3, 1.25], [-14.8, -7.4, 1.55], [12.7, -6.0, 1.5], [9.0, -14, 1.9], [-9.5, -14.5, 1.8], [2.5, -15, 1.7], [-3.5, -16, 2.0]]) {
    bareTree(trees, x, z, s, m.bark, rnd);
  }
  for (const [x, z, h] of [[-6.5, -13, 9], [5.6, -13.5, 10], [-1, -18, 12], [-8, -22, 13], [8, -21, 11], [15, -26, 12], [-16, -28, 13]]) {
    pine(trees, x, z, h, m);
  }
  // Spruces growing up the slope below the bluff, beside the stage (behind
  // the fighters, in front of the rock).
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (8.6 + rnd() * 24);
    const h = 6.5 + rnd() * 2.5;
    const base = -12.5 - rnd() * 3.5;
    const g = new THREE.Group();
    pine(g, 0, 0, h, m, Math.abs(x) < 20);
    g.position.set(x, base, -2.5 + rnd() * 1.4);
    trees.add(g);
  }
  for (let i = 0; i < 90; i++) {
    const x = -160 + rnd() * 320;
    const z = -45 - rnd() * 80;
    pine(trees, x, z, 8 + rnd() * 9, m, false);
  }
  mergeStatic(trees);

  // ---- Far away: snowy hills under the haze ----
  const far = new THREE.Group();
  scene.add(far);
  const hill = toon(0xe9f0f8);
  for (let i = 0; i < 9; i++) {
    const r = 40 + rnd() * 40;
    const h = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), hill);
    h.scale.y = 0.22 + rnd() * 0.12;
    h.position.set(-260 + i * 65 + rnd() * 20, -4, -170 - rnd() * 40);
    far.add(h);
  }
  const fields = new THREE.Mesh(new THREE.PlaneGeometry(900, 300), toon(0xf2f6fb));
  fields.rotation.x = -Math.PI / 2;
  fields.position.set(0, -0.05, -170);
  far.add(fields);
  mergeStatic(far);

  // Mist down the bluff, behind the fighters (they stay visible as they fall).
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(260, 30), new THREE.MeshBasicMaterial({ map: mistTexture(), transparent: true, depthWrite: false, fog: false }));
  mist.position.set(0, -16.5, edge - 0.3);
  mist.renderOrder = 1;
  scene.add(mist);

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
  rim: SKY,
};
