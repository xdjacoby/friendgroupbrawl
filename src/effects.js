import * as THREE from 'three';
import { FONTS } from './fonts.js';

// Speech bubble pictures are the same every time a phrase is shouted: draw each once.
const bubbleTextures = new Map();

export function bubbleTexture(text, color) {
  const key = `${text}|${color}`;
  if (bubbleTextures.has(key)) return bubbleTextures.get(key);
  const font = `84px ${FONTS.bubble}`;
  const canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  canvas.width = Math.ceil(tw + 120);
  canvas.height = 200;
  ctx = canvas.getContext('2d');
  const w = canvas.width;
  const cx = w / 2;
  const cy = 86;
  const rx = w / 2 - 14;
  const ry = 72;
  // Tail first, so the bubble's outline covers its base.
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#1d1630';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.45, cy + ry * 0.6);
  ctx.lineTo(cx - rx * 0.62, 192);
  ctx.lineTo(cx - rx * 0.15, cy + ry * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath(); // cover the tail's seam
  ctx.ellipse(cx, cy, rx - 5, ry - 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#1d1630';
  ctx.strokeText(text, cx, cy + 4);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy + 4);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.userData.cached = true; // shared by every bubble with this phrase
  const tex = { map, aspect: canvas.width / canvas.height };
  bubbleTextures.set(key, tex);
  return tex;
}

// Comic starbursts are the same every time: draw each word once.
const burstTextures = new Map();

function burstTexture(word) {
  if (burstTextures.has(word)) return burstTextures.get(word);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  const cx = 256;
  const cy = 160;
  ctx.beginPath();
  const spikes = 18;
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 ? 0.62 : 1 - (i % 4 === 0 ? 0 : 0.1);
    const px = cx + Math.cos(a) * 250 * r;
    const py = cy + Math.sin(a) * 150 * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 250);
  g.addColorStop(0, '#fff7b0');
  g.addColorStop(0.45, '#ffcf2e');
  g.addColorStop(1, '#ff6a1a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#c4161c';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.font = `92px ${FONTS.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#2a0e12';
  ctx.strokeText(word, cx, cy + 6);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(word, cx, cy + 6);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.userData.cached = true;
  const tex = { map, aspect: canvas.width / canvas.height };
  burstTextures.set(word, tex);
  return tex;
}

// Short-lived visual effects: hit sparks, KO blasts, shockwave rings, pop-up text, debris.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.sphere = new THREE.IcosahedronGeometry(1, 1);
    this.ring = new THREE.RingGeometry(0.8, 1, 32);
  }

  add(mesh, life, update) {
    this.scene.add(mesh);
    this.items.push({ mesh, life, max: life, update });
  }

  spark(x, y, color = 0xfff2a8, size = 0.5) {
    const mesh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color, transparent: true }));
    mesh.position.set(x, y, 0.6);
    this.add(mesh, 0.18, (m, t) => {
      m.scale.setScalar(size * (0.5 + t * 1.5));
      m.material.opacity = 1 - t;
    });
  }

  shockwave(x, y, radius) {
    const mesh = new THREE.Mesh(this.ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.05, 0);
    this.add(mesh, 0.3, (m, t) => {
      m.scale.setScalar(radius * (0.3 + t));
      m.material.opacity = 0.9 * (1 - t);
    });
  }

  koBlast(x, y, color) {
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color: i === 1 ? 0xffffff : color, transparent: true }));
      mesh.position.set(x, y, 0.5 - i * 0.2);
      this.add(mesh, 0.6 + i * 0.15, (m, t) => {
        m.scale.setScalar(1 + t * (4 + i * 2));
        m.material.opacity = 1 - t;
      });
    }
  }

  // Exhaust puff: drifts and expands, then fades.
  puff(x, y, size = 0.5, color = 0xf2f2f7, drift = -0.6) {
    const mesh = new THREE.Mesh(this.sphere, new THREE.MeshStandardMaterial({
      color, transparent: true, opacity: 0.6, roughness: 1, depthWrite: false,
    }));
    mesh.position.set(x + (Math.random() - 0.5) * 0.3, y, (Math.random() - 0.5) * 0.4);
    const vy = drift * (0.6 + Math.random() * 0.8);
    this.add(mesh, 0.7, (m, t) => {
      m.position.y += vy / 60;
      m.scale.setScalar(size * (0.4 + t * 1.4));
      m.material.opacity = 0.6 * (1 - t);
    });
  }

  // A soft cluster of puffs used for vapor clouds. Animated by updateCloud().
  makeCloud(color, opacity = 0.5, squash = 1) {
    const group = new THREE.Group();
    group.scale.set(1, squash, 0.6); // shallow in z so it stays inside the stage's depth
    group.userData.opacity = opacity;
    const material = new THREE.MeshStandardMaterial({
      color, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false,
    });
    group.userData.puffs = [];
    for (let i = 0; i < 9; i++) {
      const puff = new THREE.Mesh(this.sphere, material);
      const a = (i / 9) * Math.PI * 2;
      const d = i === 0 ? 0 : 0.45 + Math.random() * 0.25;
      puff.userData = {
        base: new THREE.Vector3(Math.cos(a) * d, Math.sin(a) * d * 0.75, (Math.random() - 0.5) * 0.6),
        size: i === 0 ? 0.75 : 0.45 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
      };
      group.add(puff);
      group.userData.puffs.push(puff);
    }
    group.userData.material = material;
    return group;
  }

  updateCloud(group, radius, alpha, time) {
    group.userData.material.opacity = group.userData.opacity * alpha;
    for (const puff of group.userData.puffs) {
      const { base, size, phase } = puff.userData;
      const wobble = 1 + Math.sin(time * 2 + phase) * 0.08;
      puff.position.copy(base).multiplyScalar(radius);
      puff.position.y += Math.sin(time * 1.3 + phase) * 0.05 * radius;
      puff.scale.setScalar(size * radius * wobble);
    }
  }

  // A comic speech bubble with a phrase in it (Eli's brainrot). Animated by updateBubble().
  makeBubble(text, color = '#ff2d6f') {
    const { map, aspect } = bubbleTexture(text, color);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
    sprite.renderOrder = 8;
    sprite.userData.aspect = aspect;
    sprite.userData.phase = Math.random() * Math.PI * 2;
    return sprite;
  }

  // r: hit radius; pop: 0-1 grows in; fade: 1-0 as it expires.
  updateBubble(sprite, r, pop, fade) {
    const h = r * 2.3 * (0.5 + 0.5 * pop) * (pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.25 : 1);
    sprite.scale.set(h * sprite.userData.aspect, h, 1);
    sprite.material.opacity = fade;
    sprite.material.rotation = Math.sin(performance.now() / 180 + sprite.userData.phase) * 0.06;
  }

  // A speech bubble that pops up, floats a little and fades (not a projectile).
  popBubble(x, y, text, color, size = 0.5, life = 1.6) {
    const sprite = this.makeBubble(text, color);
    sprite.position.set(x, y, 1);
    this.add(sprite, life, (m, t) => {
      this.updateBubble(m, size, Math.min(1, t * 8), t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1);
      m.position.y = y + t * 0.5;
    });
  }

  // A flat, glowing spill on the floor (Eli's Prime). Animated by updatePuddle().
  makePuddle(color = 0x3df5ff, r = 1) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false });
    const rim = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 28), material);
    disc.rotation.x = -Math.PI / 2;
    const shine = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 28, 1, 0.3, 1.6), rim);
    shine.rotation.x = -Math.PI / 2;
    shine.position.y = 0.005;
    group.add(disc, shine);
    group.scale.set(r, 1, r * 0.55);
    group.userData = { material, rim, r };
    return group;
  }

  updatePuddle(group, alpha, time) {
    const { material, rim, r } = group.userData;
    material.opacity = 0.75 * alpha;
    rim.opacity = 0.5 * alpha;
    const wobble = 1 + Math.sin(time * 3) * 0.03;
    group.scale.set(r * wobble, 1, r * 0.55 / wobble);
    group.position.y += 0.02;
  }

  // Camera flash: a quick bright white pop.
  flash(x, y, size = 1) {
    const mesh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    mesh.position.set(x, y, 0.8);
    this.add(mesh, 0.22, (m, t) => {
      m.scale.setScalar(size * (0.3 + t * 1.2));
      m.material.opacity = 0.95 * (1 - t) ** 2;
    });
  }

  // Sparkles that drift up and twinkle out (Andrew's sugar, victory glitter).
  sparkle(x, y, color = 0xffffff, count = 5, spread = 0.6) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
      mesh.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, 0.7);
      const vy = 0.6 + Math.random() * 1.2;
      const s = 0.03 + Math.random() * 0.04;
      this.add(mesh, 0.5 + Math.random() * 0.4, (m, t) => {
        m.position.y += vy / 60;
        m.scale.setScalar(s * (1 + Math.sin(t * Math.PI) * 1.5));
        m.material.opacity = 1 - t;
      });
    }
  }

  // Confetti for the victory screen.
  confetti(x, y, colors, count = 40, spread = 6) {
    for (let i = 0; i < count; i++) {
      const color = colors[i % colors.length];
      const mesh = new THREE.Mesh(this.confettiGeo ??= new THREE.PlaneGeometry(0.09, 0.16), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true }));
      mesh.position.set(x + (Math.random() - 0.5) * spread, y + Math.random() * 2, (Math.random() - 0.5) * 3);
      const vx = (Math.random() - 0.5) * 0.8;
      const vy = -(1 + Math.random() * 1.2);
      const spin = (Math.random() - 0.5) * 12;
      this.add(mesh, 4 + Math.random() * 2, (m, t) => {
        m.position.x += vx / 60 + Math.sin(t * 20 + spin) * 0.004;
        m.position.y += vy / 60;
        m.rotation.x += spin / 60;
        m.rotation.y += spin / 90;
        m.material.opacity = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
      });
    }
  }

  // A big cartoon explosion (Byron's Lambo wrecking): white flash, a fireball
  // of layered orange balls, two shockwave rings, the car's wheels and chunks
  // flying, sparks, smoke that hangs around, and a comic KABOOM.
  explosion(x, y, scale = 1, word = 'KABOOM!') {
    const s = scale;
    this.flash(x, y + 0.6 * s, 3.2 * s);
    const add = THREE.AdditiveBlending;
    // Fireball: hot core first, then the outer layers bloom a moment later.
    const fire = [0xfff6c8, 0xffd23f, 0xff9a1f, 0xff5a1f, 0xd8321a];
    fire.forEach((color, i) => {
      for (let k = 0; k < 2; k++) {
        const mesh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: add }));
        const ox = (Math.random() - 0.5) * 0.9 * s;
        const oy = (0.3 + Math.random() * 0.7) * s;
        mesh.position.set(x + ox, y + oy, 0.4 + Math.random() * 0.4);
        const delay = i * 0.05;
        const size = (0.7 + i * 0.35 + Math.random() * 0.4) * s;
        this.add(mesh, 0.75 + i * 0.08, (m, t) => {
          const u = Math.max(0, t - delay) / (1 - delay);
          m.scale.setScalar(size * (0.2 + Math.sqrt(u) * 1.6));
          m.position.y += 0.012 * s;
          m.material.opacity = u <= 0 ? 0 : 0.9 * (1 - u) ** 1.4;
        });
      }
    });
    // A flat ring along the ground and a ring facing the camera.
    for (const [flat, color, size, life] of [[true, 0xffe2a0, 4.2, 0.5], [false, 0xffffff, 3.2, 0.35]]) {
      const ring = new THREE.Mesh(this.ring, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      if (flat) ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, flat ? y + 0.08 : y + 0.7 * s, flat ? 0 : 0.9);
      this.add(ring, life, (m, t) => {
        m.scale.setScalar(size * s * (0.15 + t));
        m.material.opacity = 0.95 * (1 - t) ** 2;
      });
    }
    // The wheels come off, plus chunks of yellow bodywork and black trim.
    this.wheelGeo ??= new THREE.CylinderGeometry(0.25, 0.25, 0.2, 14).rotateX(Math.PI / 2);
    this.chunkGeo ??= new THREE.BoxGeometry(1, 0.55, 0.4);
    for (let i = 0; i < 4; i++) this.flying(this.wheelGeo, 0x1b1b1f, x, y + 0.5, s, { speed: 6, up: 10, spin: 14, life: 1.6, size: 1 });
    for (let i = 0; i < 9; i++) {
      const color = i % 3 ? 0xffc400 : 0x2a2a30;
      this.flying(this.chunkGeo, color, x, y + 0.6, s, { speed: 7, up: 9, spin: 18, life: 1.3, size: 0.18 + Math.random() * 0.22 });
    }
    // Sparks.
    for (let i = 0; i < 22; i++) {
      const mesh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, depthWrite: false, blending: add }));
      mesh.position.set(x, y + 0.6 * s, 0.7);
      const a = Math.random() * Math.PI * 2;
      const v = (5 + Math.random() * 9) * s;
      let vx = Math.cos(a) * v;
      let vy = Math.abs(Math.sin(a)) * v + 2;
      const size = 0.04 + Math.random() * 0.05;
      this.add(mesh, 0.5 + Math.random() * 0.4, (m, t) => {
        vy -= 22 / 60;
        vx *= 0.97;
        m.position.x += vx / 60;
        m.position.y += vy / 60;
        m.scale.set(size * 2.2, size, size);
        m.rotation.z = Math.atan2(vy, vx);
        m.material.opacity = 1 - t;
      });
    }
    // Smoke that rolls up and hangs around after the fire's gone.
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(this.sphere, new THREE.MeshStandardMaterial({ color: i % 2 ? 0x3a3a40 : 0x5a5a62, transparent: true, opacity: 0, roughness: 1, depthWrite: false }));
      mesh.position.set(x + (Math.random() - 0.5) * 1.6 * s, y + (0.4 + Math.random() * 0.6) * s, -0.2 - Math.random() * 0.5);
      const rise = (0.6 + Math.random() * 0.9) * s;
      const size = (0.5 + Math.random() * 0.5) * s;
      const delay = 0.08 + i * 0.025;
      this.add(mesh, 2.4, (m, t) => {
        const u = Math.max(0, t - delay) / (1 - delay);
        m.position.y += (rise / 60) * (1 - u);
        m.scale.setScalar(size * (0.5 + u * 1.8));
        m.material.opacity = u <= 0 ? 0 : 0.75 * Math.min(1, u * 6) * (1 - u);
      });
    }
    this.burst(x, y + 2.4 * s, word, 1.25 * s);
  }

  // Something knocked flying with gravity and a tumble (explosion debris).
  flying(geo, color, x, y, s, { speed, up, spin, life, size }) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true }));
    mesh.position.set(x + (Math.random() - 0.5) * 0.6, y, (Math.random() - 0.5) * 0.8);
    mesh.scale.setScalar(size * s);
    let vx = (Math.random() - 0.5) * 2 * speed * s;
    let vy = (0.5 + Math.random() * 0.7) * up * s;
    const sx = (Math.random() - 0.5) * spin;
    const sz = (Math.random() - 0.5) * spin;
    this.add(mesh, life, (m, t) => {
      vy -= 24 / 60;
      vx *= 0.99;
      m.position.x += vx / 60;
      m.position.y += vy / 60;
      m.rotation.x += sx / 60;
      m.rotation.z += sz / 60;
      m.material.opacity = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
    });
  }

  // A comic-book sound effect: big jagged starburst with the word on it.
  burst(x, y, word, size = 1) {
    const { map, aspect } = burstTexture(word);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
    sprite.renderOrder = 13;
    sprite.position.set(x, y, 1.2);
    const tilt = (Math.random() - 0.5) * 0.4;
    this.add(sprite, 1.3, (m, t) => {
      const pop = t < 0.1 ? 0.3 + (t / 0.1) * 1.0 : 1.3 - Math.min(0.3, (t - 0.1) * 1.2);
      m.scale.set(size * 2 * aspect * pop, size * 2 * pop, 1);
      m.material.rotation = tilt + Math.sin(t * 30) * 0.03 * (1 - t);
      m.position.y = y + t * 0.4;
      m.material.opacity = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    });
  }

  // Parry: a bright ring snapping out from the contact point, plus a flash.
  parry(x, y) {
    this.flash(x, y, 0.9);
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(this.ring, new THREE.MeshBasicMaterial({ color: i ? 0xffffff : 0x7ef9ff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      mesh.position.set(x, y, 0.9);
      mesh.renderOrder = 11;
      this.add(mesh, 0.32 + i * 0.1, (m, t) => {
        m.scale.setScalar(0.3 + t * (1.6 + i));
        m.material.opacity = (1 - t) ** 1.5;
      });
    }
    this.sparkle(x, y, 0xbff8ff, 8, 0.8);
  }

  shieldBreak(f) {
    this.koBlast(f.x, f.y + 1, 0x99ccff);
  }

  // Cartoon text that pops up and floats away (heal numbers, "?", "CHOMP!").
  text(x, y, str, color = '#ffffff', size = 0.55, life = 1.0) {
    const font = `92px ${FONTS.bubble}`;
    const canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(str).width + 48); // fit the text
    canvas.height = 128;
    ctx = canvas.getContext('2d'); // resizing resets the context
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#1d1630';
    ctx.strokeText(str, canvas.width / 2, 66);
    ctx.fillStyle = color;
    ctx.fillText(str, canvas.width / 2, 66);
    const aspect = canvas.width / canvas.height;
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
    sprite.renderOrder = 12;
    sprite.position.set(x, y, 1);
    this.add(sprite, life, (m, t) => {
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.5 : 1.1 - Math.min(0.1, (t - 0.12));
      m.scale.set(size * aspect * pop, size * pop, 1);
      m.position.y = y + t * 0.8;
      m.material.opacity = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
    });
  }

  // Little chunks thrown out with gravity (dirt from digging, snack crumbs).
  debris(x, y, color, { count = 6, size = 0.07, speed = 3, up = 4, dir = 0, life = 0.6 } = {}) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color, transparent: true })); // flat cartoon colors
      mesh.position.set(x, y, (Math.random() - 0.5) * 0.4);
      const vx = dir * speed * (0.5 + Math.random()) + (Math.random() - 0.5) * speed;
      let vy = up * (0.6 + Math.random() * 0.6);
      const s = size * (0.6 + Math.random() * 0.8);
      mesh.scale.setScalar(s);
      this.add(mesh, life, (m, t) => {
        vy -= 18 / 60;
        m.position.x += vx / 60;
        m.position.y += vy / 60;
        m.rotation.x += 0.3;
        m.material.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      });
    }
  }

  dirt(x, y, dir) {
    this.debris(x, y, 0x8a5a2b, { count: 5, size: 0.09, speed: 2.5, up: 5, dir });
  }

  crumbs(x, y, color = 0xe0b46a) {
    this.debris(x, y, color, { count: 4, size: 0.045, speed: 1.5, up: 2, life: 0.5 });
  }

  update(dt) {
    this.items = this.items.filter((it) => {
      it.life -= dt;
      if (it.life <= 0) {
        it.mesh.removeFromParent();
        if (!it.mesh.material.map?.userData.cached) it.mesh.material.map?.dispose();
        it.mesh.material.dispose();
        return false;
      }
      it.update(it.mesh, 1 - it.life / it.max);
      return true;
    });
  }
}
