import * as THREE from 'three';
import { Fighter } from './fighter.js';
import { FighterView } from './view.js';
import { Effects } from './effects.js';
import { SLOT_COLORS } from './roster.js';
import { createProp } from './props.js';
import { keyframes } from './poses.js';
import { REST } from './moves.js';
import { outfitsFor } from './cosmetics.js';
import { setAtmosphere } from './look.js';
import { toon, ink, place, paint, mergeStatic } from './stage.js';
import { createCampusWorld } from './campus.js';
import { STAGE_SPOT, roundIsland, lampPost, campusArch } from './stages/canton.js';

// The victory screen, Smash style: the winner on a podium on a floating chunk
// of SUNY Canton's plaza, high over the campus (src/campus.js), everyone else
// clapping behind them. The camera swoops in from a wide shot of the campus
// and settles in front of the winner, then drifts around them while light
// rays burst behind them, a spotlight shines down, confetti falls and (at
// sunset and night) fireworks go off over the campus.
//
// Characters define their part as
//   victory: { pose(frame), onFrame(frame, { effects, x, y }), quote, prop }
// pose works like a move's pose (src/poses.js); onFrame adds effects (puffs,
// pop-up text); prop parks a prop in the scene ({ name, x, z, yaw }).

// For characters without their own: a fist pump.
const FIST_PUMP = {
  quote: 'GG.',
  pose: keyframes([
    [0, REST],
    [14, { rArm: [0.3, 1, 0.3], rFore: [0.2, 1, 0.15], look: 0.3 }],
    [22, { rArm: [0.6, -0.1, 0.6], rFore: [0.3, 0.9, 0.4] }],
    [30, { rArm: [0.3, 1, 0.3], rFore: [0.2, 1, 0.15] }],
    [38, { rArm: [0.6, -0.1, 0.6], rFore: [0.3, 0.9, 0.4] }],
    [46, { rArm: [0.3, 1, 0.3], rFore: [0.2, 1, 0.15], look: 0.2 }],
  ]),
};

// The losers clap (on a loop), props put away. On rigged models the palms
// reach for each other and meet in front of the chest.
const CLAP_HANDS = { rHeld: null, lHeld: null, rHand: 'open', lHand: 'open', rPalm: [0.1, 0.1, -1], lPalm: [0.1, 0.1, 1] };
const CLAP_OPEN = {
  rArm: [0.6, -0.6, 0.45], rFore: [0.7, 0.55, -0.1], lArm: [0.6, -0.6, -0.45], lFore: [0.7, 0.55, 0.1],
  rReach: [0.34, 1.22, 0.2], lReach: [0.34, 1.22, -0.2],
};
const CLAP_SHUT = {
  rArm: [0.65, -0.6, 0.2], rFore: [0.65, 0.55, -0.55], lArm: [0.65, -0.6, -0.2], lFore: [0.65, 0.55, 0.55],
  rReach: [0.36, 1.2, 0], lReach: [0.36, 1.2, 0],
};
const clap = keyframes([[0, CLAP_OPEN], [6, CLAP_SHUT], [12, CLAP_OPEN]]);
const CLAP = { pose: (frame) => ({ ...REST, ...clap(frame % 12), ...CLAP_HANDS, look: 0.1 }) };

const PODIUM = 0.5; // podium height
// Where the winner and the others stand: [x, z, yaw toward the camera].
// The results table sits bottom right, so the others line up on the left.
const SPOTS = [[0, 0, 0], [-2.0, -1.3, 0.3], [-3.3, -2.4, 0.4], [-4.5, -3.5, 0.5]];
const ISLAND = 8.5; // the island's radius

// Over the same spot as the SUNY Canton stage, a little higher.
const SPOT = { ...STAGE_SPOT, drop: 36 };
// Random time of day when the match wasn't on the campus: [name, weight].
const TIMES = [['day', 4], ['sunset', 3], ['night', 3]];

// ---- Camera: a swoop from a wide shot to the winner, then a slow drift ----
const SWOOP = 2.6; // seconds
const WIDE = { az: -1.05, el: 0.24, dist: 30, look: [0, -1.5, 0], roll: 0.18 };
const HERO = { az: 0, el: 0.12, dist: 7.4, look: [0, 1.5, 0], roll: 0 };
const HERO_LOOK = new THREE.Vector3(...HERO.look);
const ease = (t) => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;

function pickTime() {
  let r = Math.random() * TIMES.reduce((s, [, w]) => s + w, 0);
  for (const [name, w] of TIMES) if ((r -= w) < 0) return name;
  return 'day';
}

// A soft round dot for fireworks.
let dotTexture = null;
function dot() {
  if (!dotTexture) {
    dotTexture = paint(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    });
    dotTexture.userData.cached = true;
  }
  return dotTexture;
}

// Fireworks over the campus behind the island: a rocket climbs, then bursts
// into a ball of sparks that droop and fade. Additive points, no lights.
const SPARKS = 90;
class Fireworks {
  constructor(scene, colors) {
    this.colors = colors.map((c) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.25));
    this.list = [];
    this.timer = 1.2;
    // Made up front and reused (at most 7 are ever up at once), so none has
    // to be built, uploaded or have its shader compiled mid-show.
    const mat = new THREE.PointsMaterial({
      size: 3.4, map: dot(), vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    this.pool = [];
    for (let i = 0; i < 7; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SPARKS + 1) * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array((SPARKS + 1) * 3), 3));
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.visible = false;
      scene.add(points);
      this.pool.push(points);
    }
  }

  launch() {
    const points = this.pool.find((p) => !p.visible);
    if (!points) return;
    points.visible = true;
    points.geometry.attributes.color.array.fill(0);
    // Somewhere out behind the island (the camera looks down -z).
    const x = (Math.random() - 0.5) * 160;
    const z = -60 - Math.random() * 90;
    const from = new THREE.Vector3(x, -30, z);
    const to = new THREE.Vector3(x + (Math.random() - 0.5) * 12, 12 + Math.random() * 30, z);
    const color = this.colors[Math.floor(Math.random() * this.colors.length)];
    const vel = [];
    for (let i = 0; i < SPARKS; i++) {
      // Even-ish ball of directions.
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      vel.push(new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a)).multiplyScalar(17 + Math.random() * 7));
    }
    this.list.push({ points, from, to, color, vel, age: 0, burst: false });
  }

  update(dt) {
    if ((this.timer -= dt) <= 0) {
      this.launch();
      this.timer = 0.5 + Math.random() * 1.1;
    }
    const RISE = 0.9;
    const LIFE = 2.6;
    this.list = this.list.filter((f) => {
      f.age += dt;
      const pos = f.points.geometry.attributes.position;
      const col = f.points.geometry.attributes.color;
      if (f.age < RISE) {
        const p = f.from.clone().lerp(f.to, ease(f.age / RISE));
        pos.setXYZ(0, p.x, p.y, p.z);
        col.setXYZ(0, 1, 0.85, 0.6);
      } else {
        const t = f.age - RISE;
        if (!f.burst) {
          f.burst = true;
          col.setXYZ(0, 0, 0, 0);
        }
        const fade = Math.max(0, 1 - t / LIFE) ** 1.5;
        const drag = (1 - Math.exp(-2.2 * t)) / 2.2; // fast at first, then hangs
        for (let i = 0; i < f.vel.length; i++) {
          const v = f.vel[i];
          pos.setXYZ(i + 1, f.to.x + v.x * drag, f.to.y + v.y * drag - 2.2 * t * t, f.to.z + v.z * drag);
          const tw = 0.75 + 0.25 * Math.sin(f.age * 30 + i);
          col.setXYZ(i + 1, f.color.r * fade * tw, f.color.g * fade * tw, f.color.b * fade * tw);
        }
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      if (f.age > RISE + LIFE) {
        f.points.visible = false; // back in the pool
        return false;
      }
      return true;
    });
  }
}

// Light rays fanning out behind the winner (always facing the camera), in
// their color, fading toward the tips. Added on top at night; by day they're
// laid over the sky like paint, or they'd just wash it out white.
function rays(color, glow) {
  const tex = paint(512, 512, (ctx, w) => {
    const c = w / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, c, a, a + (Math.PI / 16) * 0.9);
      ctx.closePath();
      ctx.fill();
    }
  });
  const mat = new THREE.MeshBasicMaterial({
    color, map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat);
  return { group: mesh, mat };
}

// A spotlight beam from above onto the podium: an open cone, brighter at the
// top, additive.
function beam() {
  const geo = new THREE.CylinderGeometry(0.45, 1.6, 13, 32, 1, true);
  geo.translate(0, 6.5, 0);
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = geo.attributes.position.getY(i);
    const v = 0.15 + (y / 13) * 0.85;
    colors.set([v, v * 0.97, v * 0.9], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, mat };
}

export class VictoryScene {
  // time: the time of day (a campus.js TIMES name or cycle position); random if left out.
  constructor({ renderer, ranked, time }) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.2, 60000);
    this.effects = new Effects(this.scene);
    this.frame = 0;
    this.time = 0;
    this.acc = 0;
    const winner = ranked[0];
    this.winner = winner;
    this.victory = winner.character.victory ?? FIST_PUMP;
    this.slotColors = ranked.map((f) => new THREE.Color(SLOT_COLORS[f.slot]).getHex());
    const winColor = new THREE.Color(SLOT_COLORS[winner.slot]);

    // The campus, sky and lights.
    this.world = createCampusWorld(this.scene, { ...SPOT, time: time ?? pickTime(), clear: { radius: 130, top: SPOT.drop - 7, dip: 12, front: 1.3 } });
    const p = this.world.palette;
    this.night = p.lamps; // 0 by day, 1 at night
    // Everyone's edges catch the color of the air (sunset orange, night blue...).
    setAtmosphere(p.haze, 0.45);
    const key = this.world.key;
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); // over 16 m: ~1.6 cm a texel, plenty up close
    key.shadow.bias = -0.0004;
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 70 });

    // The island, the podium and the plaza's fixtures.
    this.island = roundIsland(this.scene, ISLAND);
    const fixtures = new THREE.Group();
    this.scene.add(fixtures);
    const podium = ink(place(new THREE.CylinderGeometry(1.1, 1.25, PODIUM, 40), toon(winColor.getHex()), 0, PODIUM / 2, 0, fixtures), 0.04);
    podium.receiveShadow = true;
    place(new THREE.TorusGeometry(1.12, 0.06, 8, 48).rotateX(Math.PI / 2), toon(0xffd23f), 0, PODIUM, 0, fixtures);
    place(new THREE.CylinderGeometry(1.32, 1.4, 0.1, 40), toon(0xddd5c6), 0, 0.05, 0, fixtures);
    this.lampGlow = toon(0xfff6dd, { emissive: 0xffd88a, emissiveIntensity: this.night * 1.6 });
    lampPost(fixtures, -6.4, -3.6, this.lampGlow);
    lampPost(fixtures, 6.3, -3.0, this.lampGlow);
    // The gateway stands behind the clappers (clear of Byron's Lambo).
    campusArch(fixtures, -4.6, -1.4, -6.8);
    mergeStatic(fixtures, { receive: true });
    for (const mesh of fixtures.children) mesh.castShadow = mesh.material.side !== THREE.BackSide;

    // Flash: rays behind the winner, a spotlight, a glow ring on the podium.
    this.rays = rays(winColor.clone().lerp(new THREE.Color(0xffffff), this.night > 0.5 ? 0.35 : 0.15), this.night > 0.5);
    this.scene.add(this.rays.group);
    this.beam = beam();
    this.scene.add(this.beam.mesh);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.75, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: winColor, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.position.y = 0.06;
    this.scene.add(ring);
    this.ring = ring;
    this.fireworks = p.windows > 0.3 ? new Fireworks(this.scene, this.slotColors.concat(0xffe680)) : null;

    const prop = this.victory.prop;
    if (prop) {
      const pr = createProp(prop.name);
      if (pr) {
        pr.object.position.set(prop.x ?? 0, 0, prop.z ?? 0);
        pr.object.rotation.y = prop.yaw ?? 0;
        pr.object.traverse((o) => { o.castShadow = true; });
        this.scene.add(pr.object);
      }
    }

    this.actors = ranked.slice(0, SPOTS.length).map((r, i) => {
      const f = new Fighter({ slot: r.slot, character: r.character, controller: null, spawn: { x: 0, y: 0 }, stocks: 1, look: r.look });
      const [x, z, yaw] = SPOTS[i];
      f.x = x;
      f.y = i === 0 ? PODIUM : 0;
      f.facing = 1;
      f.grounded = true;
      f.invuln = 0;
      const view = new FighterView(f, this.scene, SLOT_COLORS[r.slot]);
      view.z = z;
      view.marker.visible = false;
      // Turn to face the camera (fighters face +x; the camera looks down -z).
      view.root.rotation.y = -Math.PI / 2 + yaw;
      const anim = i === 0 ? this.victory : CLAP;
      f.move = { name: 'victory', def: { pose: anim.pose, hitboxes: [] }, frame: 0, hit: new Set() };
      return { f, view, offset: i === 0 ? 0 : i * 4 };
    });

    this.look = new THREE.Vector3();
    this.camDir = new THREE.Vector3();

    // Things that would otherwise show up mid-show (and stall a frame while
    // their shaders compile): the confetti, the effects' materials, and the
    // props the winner's animation swaps into their hands.
    this.effects.confettiPool();
    this.effects.warmUp();
    const winnerView = this.actors[0].view;
    for (let frame = 0; frame < 600; frame += 2) {
      const pose = this.victory.pose(frame, this.actors[0].f) ?? {};
      if (pose.rHeld) winnerView.handProp('right', pose.rHeld);
      if (pose.lHeld) winnerView.handProp('left', pose.lHeld);
    }
  }

  // Resolves once everything is in (the campus, the fighters' models) and
  // every shader is compiled, in the background where the browser can. Until
  // then main.js keeps showing the match, so the switch doesn't freeze.
  async prepare() {
    await Promise.all([this.world.ready, ...this.actors.map((a) => a.view.ready)]);
    this.scene.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        if (m.map) this.renderer.initTexture(m.map);
      }
    });
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.disposed) return;
    // One frame drawn into a single pixel (the match covers it up next
    // frame): uploads the geometry and builds the shadow pass's shaders,
    // which compiling alone doesn't.
    const r = this.renderer;
    this.placeCamera(0);
    r.setScissorTest(true);
    r.setScissor(0, 0, 1, 1);
    r.render(this.scene, this.camera);
    r.setScissorTest(false);
  }

  // Some outfits have their own line (Eli as The Bender...).
  get quote() {
    const { character, look } = this.winner;
    const outfit = look?.model && outfitsFor(character).find((o) => o.model === look.model);
    return outfit?.quote ?? this.victory.quote ?? '';
  }

  // Where the camera is at `t` seconds: swoop, then drift.
  placeCamera(t) {
    let az, el, dist, roll;
    const look = this.look;
    if (t < SWOOP) {
      const k = ease(t / SWOOP);
      az = lerp(WIDE.az, HERO.az, k);
      el = lerp(WIDE.el, HERO.el, k);
      dist = lerp(WIDE.dist, HERO.dist, ease(Math.min(1, (t / SWOOP) * 1.15)));
      roll = lerp(WIDE.roll, HERO.roll, k);
      look.set(...WIDE.look).lerp(HERO_LOOK, ease(Math.min(1, (t / SWOOP) * 1.3)));
    } else {
      const s = t - SWOOP;
      // Slow figure-eight around the winner; starts at the hero shot.
      az = Math.sin(s * 0.22) * 0.34;
      el = HERO.el + Math.sin(s * 0.15) * 0.035;
      dist = HERO.dist + Math.sin(s * 0.31) * 0.25;
      roll = Math.sin(s * 0.22) * -0.012;
      look.set(...HERO.look);
      look.y += Math.sin(s * 0.4) * 0.04;
    }
    const cam = this.camera;
    cam.position.set(
      look.x + Math.sin(az) * Math.cos(el) * dist,
      look.y + Math.sin(el) * dist,
      look.z + Math.cos(az) * Math.cos(el) * dist,
    );
    cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    cam.lookAt(look);
  }

  render(dt) {
    this.time += dt;
    // Animate at a steady 60 frames a second, like the match.
    this.acc += dt;
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      this.frame++;
      const w = this.actors[0].f;
      this.victory.onFrame?.(this.frame, { effects: this.effects, x: w.x, y: w.y });
      // Confetti starts as the camera lands on the winner.
      const f = this.frame - Math.round(SWOOP * 60) + 30;
      if (f > 0 && f < 360 && f % 40 === 1) this.effects.confetti(0, 6, this.slotColors, 26, 9);
      if (this.frame % 30 === 0) this.effects.sparkle(0, PODIUM + 0.2, 0xffe680, 2, 2.2);
    }
    for (const a of this.actors) {
      a.f.move.frame = this.frame + a.offset;
      a.view.update(dt, this.time);
    }
    this.effects.update(dt);
    this.world.update(dt);
    this.island.update(this.time);
    this.fireworks?.update(dt);
    this.placeCamera(this.time);

    // The rays burst open behind the winner as the camera lands, then turn.
    const t = this.time - SWOOP * 0.8;
    const open = t <= 0 ? 0 : Math.min(1, t / 0.45);
    const pop = open < 1 ? ease(open) * 1.15 : 1 + Math.max(0, 0.15 - (t - 0.45) * 0.3);
    this.camDir.subVectors(this.camera.position, this.look).setY(0).normalize();
    this.rays.group.position.set(0, 1.6, 0).addScaledVector(this.camDir, -9);
    this.rays.group.lookAt(this.camera.position);
    this.rays.group.rotateZ(this.time * 0.12);
    this.rays.group.scale.setScalar(Math.max(0.001, pop));
    this.rays.mat.opacity = open * (this.night > 0.5 ? 0.3 : 0.32);
    this.beam.mat.opacity = (0.035 + this.night * 0.13) * (0.85 + Math.sin(this.time * 2.1) * 0.15);
    this.ring.material.opacity = 0.35 + Math.sin(this.time * 3) * 0.15;

    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    this.world.dispose();
    this.scene.traverse((o) => {
      if (o.isSkinnedMesh) o.skeleton.dispose(); // each fighter's bone texture
      if (o.isLight) o.dispose(); // the shadow map
      if (!o.userData.cached) o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (!o.userData.cached && !m.map?.userData.cached) m.map?.dispose();
        if (!m.userData.shared) m.dispose();
      }
    });
  }
}
