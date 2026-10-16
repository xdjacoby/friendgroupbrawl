import { keyframes, HOLD } from '../poses.js';
import { REST as GUARD_REST, hitboxPos } from '../moves.js';

// Byron: a professional larper. He confidently "knows" karate, parkour, Krav
// Maga and cars, and he fights with his wired earbuds like Wonder Woman's
// Lasso of Truth (MultiVersus): whips, twirls, and a lasso that reels people
// in. His side special is his Lamborghini, which works like Wario's bike in
// Smash: drive it around, run people over, hop it, turn it around, bail out.
// Frame data format: see src/moves.js. Poses: see src/poses.js.

const SHOULDER_Y = 1.45;
const ARM = 0.62;

// Point the earbud arm at a spot (body space) and pay out just enough cord to reach it.
function aimCord(x, y, z = 0.12) {
  const dy = y - SHOULDER_Y;
  const d = Math.hypot(x, dy) || 1;
  const dir = [x / d, dy / d, z];
  return { rArm: dir, rFore: dir, rProp: 'club', glow: Math.max(0, Math.min(1, (d - ARM - 0.32) / 3.6)) };
}
// Glow (the earbuds' cord) for a cord this long past his hand.
const cord = (len) => Math.max(0, (len - 0.25) / 3.6);

// Earbuds dangling from his right hand, left hand on his chin like he's
// about to explain something.
const IDLE = { rArm: [0.15, -1, 0.3], rFore: [0.6, -0.5, 0.3], lArm: [0.45, -0.75, -0.3], lFore: 'mouth' };
const REST = { ...GUARD_REST, ...IDLE, rProp: 'upright', glow: 0 };
const GUARD = { lArm: [0.2, -1, -0.3], lFore: [1, 0.75, -0.1] };
const STAND = { rThigh: REST.rThigh, rShin: REST.rShin, lThigh: REST.lThigh, lShin: REST.lShin, crouch: 0 };

// ---- Lasso of Truth ----
const LASSO_OUT = [[8, 1.3, 1.3], [16, 3.9, 1.2]]; // the earbuds fly out...
const LASSO_IN = [[16, 3.9, 1.2], [26, 0.9, 1.2]]; // ...and come back if they miss
// In the air it flies up at an angle, so it can reach a ledge from below.
const LASSO_AIR = [[8, 1.15, 1.75], [16, 3.2, 3.3]];
const LASSO_AIR_IN = [[16, 3.2, 3.3], [26, 0.8, 1.7]];

function lassoPose(frame, f) {
  const m = f.move;
  const left = { lArm: [-0.1, -0.95, -0.4], lFore: [0.4, -0.6, -0.4] };
  if (m?.zip) {
    const s = f.stats.scale;
    return { ...REST, ...left, ...aimCord((m.zip.x - f.x) * f.facing / s, (m.zip.y - f.y) / s), lean: 0.1 };
  }
  if (frame < 4) return { ...REST, ...GUARD };
  if (frame < 8) return { ...REST, ...left, rArm: [-0.2, 0.9, 0.5], rFore: [0.4, 0.85, -0.3], rProp: 'club', glow: cord(0.5), lean: -0.1, look: 0.1 };
  if (frame > 27) return REST;
  const air = m?.name === 'lassoAir';
  const [x, y] = hitboxPos({ path: frame <= 16 ? (air ? LASSO_AIR : LASSO_OUT) : (air ? LASSO_AIR_IN : LASSO_IN) }, frame);
  return { ...REST, ...left, ...aimCord(x, y), lean: frame <= 16 ? 0.25 : 0.1 };
}

// ---- Lamborghini ----
const LAMBO_TOP = 15; // m/s holding forward
const LAMBO_CRUISE = 10; // m/s rolling along
const LAMBO_ACCEL = 0.45;
const LAMBO_BRAKE = 0.9;
const LAMBO_MAX = 420; // frames before he hops out on his own
const LAMBO_COOLDOWN = 240; // frames after it crashes before he can call it again
const fast = (f) => f.move.speed >= 11;

// The empty car after he bails (or gets knocked out of it): it rolls on,
// slowing down, then blows up. The explosion hits everyone near it but him.
const EXPLOSION = { r: 1.9, dmg: 13, base: 9, growth: 0.95, angle: 60 };
const LOOSE_LAMBO = {
  look: 'prop', prop: 'lambo', drive: true, gravity: 40, ride: 0.6, x: 0, y: 0, vy: 0, life: 75,
  r: 0.75, pierce: true, hitEvery: 40, dmg: 9, base: 7.5, growth: 0.8, angle: 45,
  update(p, world) {
    p.vx *= 0.985;
    // About to blow: smoke pours out and it flashes.
    if (p.life < 30 && p.age % 4 === 0) world.effects.puff(p.x - 0.8 * Math.sign(p.vx || 1), p.y + 0.9, 0.35, 0x45454c, 1.2);
    if (p.life < 30) p.mesh.visible = p.life % 6 > 1;
  },
  onEnd(p, world) {
    const b = world.stage.blast;
    if (p.y > b.bottom && p.x > b.left && p.x < b.right) {
      world.effects.explosion(p.x, p.y, 1, 'KABOOM!');
      world.blast(p.owner, p.x, p.y, EXPLOSION);
    }
    p.owner.charState.lambo = null;
    p.owner.charState.lamboCooldown = LAMBO_COOLDOWN;
  },
};

function loseCar(f, m, world) {
  if (f.charState.lambo !== 'riding') return;
  f.charState.lambo = 'loose';
  world.spawnProjectile(f, { ...LOOSE_LAMBO, speed: Math.max(4, m.speed ?? 0) });
}

function bail(f, world) {
  const m = f.move;
  f.move = null;
  loseCar(f, m, world);
  f.vy = 10;
  f.vx = -2 * f.facing;
  f.grounded = false;
  f.platform = null;
  world.effects.puff(f.x, f.y + 0.5, 0.6);
}

export const BYRON = {
  id: 'byron',
  name: 'Byron',
  tagline: 'Knows everything. Knows nothing.',
  color: 0x9be22d,
  model: 'models/byron.glb',
  // Outfit names and their victory quotes (see cosmetics.js).
  outfits: {
    'byroncos1.glb': { name: 'The Larp', quote: 'You could never out-larp me.' },
  },
  props: { right: 'earbuds' },
  preload: ['models/lambo.glb'], // his Lamborghini (see props.js)
  stats: { weight: 100, runSpeed: 7.8, airSpeed: 6.2, jump: 15, gravity: 40, maxFall: 14.5, power: 1.02, scale: 1.0 },

  update(f) {
    if (f.charState.lamboCooldown > 0) f.charState.lamboCooldown--;
  },

  // HUD: the Lambo's ready, out driving, about to blow, or in the shop (with a countdown).
  hud: (f) => {
    const cs = f.charState;
    if (cs.lambo === 'riding') return '🎧 🏎️💨';
    if (cs.lambo === 'loose') return '🎧 🏎️💥';
    if (cs.lamboCooldown > 0) return `🎧 🔧 ${Math.ceil(cs.lamboCooldown / 60)}s`;
    return '🎧 🏎️ READY';
  },

  poses: {
    base: { rProp: 'upright' },
    idle: IDLE,
    crouch: { rArm: [0.2, -1, 0.35], rFore: [0.5, -0.6, 0.3], ...GUARD },
  },

  // CPU habits: Lambo from range, lasso from mid range, counter up close.
  cpu(f, { dist, dx, dy }) {
    if (f.grounded && f.canUse('sspecial') && dist > 3 && dist < 10 && Math.abs(dy) < 1 && Math.random() < 0.03) return { special: true, x: Math.sign(dx) };
    if (f.grounded && dist > 2.2 && dist < 4.2 && Math.abs(dy) < 1 && Math.random() < 0.05) return { special: true, face: true };
    if (dist < 2.2 && Math.random() < 0.015) return { special: true, y: -1 };
    return null;
  },

  // Victory: leans by his Lambo twirling the keys, then folds his arms.
  victory: {
    quote: 'It\'s a Huracán. You wouldn\'t know.',
    prop: { name: 'lambo', x: 0.9, z: -5.0, yaw: -0.3 },
    pose: (frame) => {
      const p = { ...victoryPose(frame) };
      p.rHeld = frame < 60 ? 'carKeys' : null; // keys (then everything) in his pocket to fold his arms
      return p;
    },
    onFrame(frame, { effects, x, y }) {
      if (frame === 70) effects.text(x + 1.0, y + 1.35, 'TOLD YOU', '#9be22d', 0.36, 1.4);
    },
  },

  moves: {
    // ---- Ground ----

    // JAB - Karate (he watched a video): chop, chop, HADOUKEN.
    jab: {
      total: 16, limb: 'arm', combo: { next: 'jab2', from: 5 },
      onStart(f) { if (f.grounded) f.vx = 3.5 * f.facing; },
      hitboxes: [
        { start: 2, end: 4, path: [[2, 0.85, 1.65], [4, 1.05, 1.3]], r: 0.48, dmg: 2.5, base: 3.5, growth: 0.08, angle: 35 },
        { start: 2, end: 4, x: 0.45, y: 1.35, r: 0.4, dmg: 2.5, base: 3.5, growth: 0.08, angle: 35 },
      ],
      pose: keyframes([
        [0, { ...REST, ...GUARD }],
        [1, { lArm: [0.6, 0.3, -0.4], lFore: [0.3, 0.95, -0.1] }],
        [3, { lArm: [1, -0.1, -0.25], lFore: [0.85, -0.5, -0.05], lean: 0.3 }],
        [7, {}],
        [13, { ...REST }],
      ]),
    },
    jab2: {
      total: 18, limb: 'arm', combo: { next: 'jab3', from: 7 },
      onStart(f) { if (f.grounded) f.vx = 3 * f.facing; },
      hitboxes: [
        { start: 3, end: 5, path: [[3, 0.85, 1.65], [5, 1.05, 1.3]], r: 0.5, dmg: 2.5, base: 4, growth: 0.12, angle: 40 },
        { start: 3, end: 5, x: 0.45, y: 1.35, r: 0.4, dmg: 2.5, base: 4, growth: 0.12, angle: 40 },
      ],
      pose: keyframes([
        [0, { ...REST, lArm: [1, -0.1, -0.25], lFore: [0.85, -0.5, -0.05], lean: 0.3 }],
        [1, { rArm: [0.6, 0.3, 0.4], rFore: [0.3, 0.95, 0.1], lArm: GUARD.lArm, lFore: GUARD.lFore }],
        [4, { rArm: [1, -0.1, 0.25], rFore: [0.85, -0.5, 0.05], lean: 0.35 }],
        [8, {}],
        [15, REST],
      ]),
    },
    jab3: {
      total: 30, limb: 'arm',
      onFrame(f, frame, input, world) {
        if (frame !== 8) return;
        world.effects.puff(f.x + 1.2 * f.facing * f.stats.scale, f.y + 1.25, 0.5, 0x9be2ff, 0.2);
        world.effects.text(f.x + 0.8 * f.facing, f.y + f.h + 0.3, 'HADOUKEN!', '#9be2ff', 0.38, 0.7);
      },
      hitboxes: [
        { start: 8, end: 10, x: 1.25, y: 1.25, r: 0.6, dmg: 5, base: 7.5, growth: 0.6, angle: 38 },
        { start: 8, end: 10, x: 0.6, y: 1.25, r: 0.42, dmg: 4, base: 7, growth: 0.55, angle: 38 },
      ],
      pose: keyframes([
        [0, { ...REST, rArm: [1, -0.1, 0.25], rFore: [0.85, -0.5, 0.05] }],
        [5, {
          rArm: [-0.5, -0.85, 0.3], rFore: [0.7, 0.2, -0.3], lArm: [-0.5, -0.85, -0.3], lFore: [0.7, 0.2, 0.3],
          rThigh: [0.4, -0.9, 0.2], lThigh: [-0.35, -0.9, -0.2], crouch: 0.5, lean: -0.1,
        }],
        [8, { rArm: [1, -0.1, 0.15], rFore: [1, -0.05, -0.05], lArm: [1, -0.1, -0.15], lFore: [1, -0.05, 0.05], lean: 0.35, crouch: 0.3 }],
        [14, {}],
        [26, { ...REST, ...STAND }],
      ]),
    },

    // FORWARD TILT - Crane Kick: strikes the Karate Kid crane pose, then kicks.
    ftilt: {
      total: 32, limb: 'leg',
      hitboxes: [
        { start: 10, end: 13, x: 1.05, y: 1.3, r: 0.55, dmg: 11, base: 7.5, growth: 1.0, angle: 42 },
        { start: 10, end: 13, x: 0.5, y: 1.15, r: 0.42, dmg: 8, base: 6.5, growth: 0.8, angle: 42 },
      ],
      pose: keyframes([
        [0, REST],
        [7, {
          rArm: [0, 0.55, 1], rFore: [0.3, 0.45, 0.9], lArm: [0, 0.55, -1], lFore: [0.3, 0.45, -0.9],
          lThigh: [0.9, -0.3, -0.1], lShin: [-0.3, -1, -0.1], look: 0.1, lean: -0.05,
        }],
        [10, { lThigh: [1, 0.35, -0.1], lShin: [1, 0.3, -0.1], lean: -0.3 }],
        [14, {}],
        [28, REST],
      ]),
    },

    // UP TILT - Lasso Twirl: whirls the earbuds over his head, front to back.
    utilt: {
      total: 26, limb: 'arm',
      hitboxes: [
        { start: 6, end: 12, path: [[6, 1.05, 2.15], [9, 0.05, 2.85], [12, -1.0, 2.1]], r: 0.55, dmg: 8, base: 8, growth: 0.9, angle: 88 },
        { start: 6, end: 9, x: 0.3, y: 1.9, r: 0.45, dmg: 8, base: 8, growth: 0.9, angle: 88 },
      ],
      pose: keyframes([
        [0, REST],
        [3, { rArm: [0.9, -0.3, 0.3], rFore: [1, 0, 0.2], rProp: 'club', glow: cord(1.0) }],
        [6, { rArm: [0.8, 0.6, 0.25], rFore: [0.8, 0.6, 0.15] }],
        [9, { rArm: [0.05, 1, 0.2], rFore: [0, 1, 0.1], look: 0.3 }],
        [12, { rArm: [-0.8, 0.6, 0.2], rFore: [-0.8, 0.6, 0.1], lean: -0.1 }],
        [16, {}],
        [23, { ...REST }],
      ]),
    },

    // DOWN TILT - Capoeira Sweep: drops low and sweeps a leg along the floor.
    dtilt: {
      total: 24, limb: 'leg',
      hitboxes: [
        { start: 6, end: 10, path: [[6, 0.6, 0.25], [8, 1.15, 0.25], [10, 0.9, 0.25]], r: 0.5, dmg: 7, base: 6, growth: 0.55, angle: 25 },
        { start: 6, end: 10, x: 0.45, y: 0.4, r: 0.42, dmg: 6, base: 5.5, growth: 0.5, angle: 25 },
      ],
      pose: keyframes([
        [0, REST],
        [4, {
          crouch: 1.5, lean: 0.3, lArm: [0.3, -0.95, -0.4], lFore: [0.1, -1, -0.2],
          rThigh: [0.7, -0.7, 0.3], rShin: [-0.4, -0.9, 0.2], lThigh: [0.6, -0.8, -0.2], lShin: [-0.6, -0.8, -0.1],
        }],
        [7, { rThigh: [1, -0.4, 0.3], rShin: [1, -0.2, 0.2] }],
        [10, { rThigh: [0.95, -0.45, 0.1], rShin: [0.95, -0.3, 0.05] }],
        [14, {}],
        [22, { ...REST, ...STAND }],
      ]),
    },

    // ---- Air ----

    // NEUTRAL AIR - Lasso Spin: spins with the earbuds out, all the way around.
    nair: {
      total: 32, limb: 'spin', aerial: true, landingLag: 7,
      hitboxes: [
        { start: 5, end: 16, path: [[5, 0.6, 1.3], [7, 1.6, 1.3], [10, 0, 1.3], [13, -1.6, 1.3], [16, 0, 1.3]], r: 0.5, dmg: 8, base: 6.5, growth: 0.8, angle: 45 },
        { start: 5, end: 16, x: 0, y: 1.0, r: 0.75, dmg: 6, base: 6, growth: 0.65, angle: 45 },
      ],
      pose: keyframes([
        [0, { ...REST, spin: 0 }],
        [4, {
          rArm: [0.25, -0.1, 1], rFore: [0.3, 0, 1], rProp: 'club', glow: cord(1.0), lArm: [0.2, -0.3, -1], lFore: [0.3, 0.2, -1],
          rThigh: [0.7, -0.7, 0.2], rShin: [0.2, -1, 0.1], lThigh: [-0.6, -0.8, -0.2], lShin: [-0.3, -1, -0.1],
        }],
        [16, { spin: Math.PI * 2 }],
        [22, { glow: cord(0.4) }],
        [30, { ...REST, spin: 0 }],
      ]),
    },

    // FORWARD AIR - Earbud Whip: cracks the earbuds forward like a whip. The
    // tip hits hardest.
    fair: {
      total: 32, limb: 'arm', aerial: true, landingLag: 11,
      onFrame(f, frame, input, world) {
        if (frame === 10) world.effects.spark(f.x + 1.95 * f.facing * f.stats.scale, f.y + 1.4, 0xffffff, 0.35);
      },
      hitboxes: [
        { start: 10, end: 12, x: 1.95, y: 1.4, r: 0.45, dmg: 13, base: 7.5, growth: 1.0, angle: 40 },
        { start: 9, end: 12, x: 1.15, y: 1.45, r: 0.45, dmg: 8, base: 6, growth: 0.7, angle: 45 },
      ],
      pose: keyframes([
        [0, REST],
        [5, { rArm: [-0.2, 0.9, 0.4], rFore: [-0.5, 0.8, 0.3], rProp: 'club', glow: cord(0.6), lean: -0.15 }],
        [8, { rArm: [0.6, 0.75, 0.25], rFore: [0.8, 0.55, 0.15], glow: cord(1.3) }],
        [10, { rArm: [1, 0, 0.15], rFore: [1, 0, 0.1], lean: 0.3 }],
        [14, {}],
        [19, { glow: cord(0.6) }],
        [28, REST],
      ]),
    },

    // BACK AIR - Muay Thai (trust me): a spinning back kick.
    bair: {
      total: 30, limb: 'leg', aerial: true, landingLag: 10,
      hitboxes: [
        { start: 7, end: 10, x: -1.05, y: 1.0, r: 0.55, dmg: 13, base: 8, growth: 1.08, angle: 145 },
        { start: 7, end: 10, x: -0.5, y: 0.95, r: 0.42, dmg: 9, base: 6, growth: 0.8, angle: 145 },
      ],
      pose: keyframes([
        [0, REST],
        [4, { rThigh: [-0.5, -0.7, 0.12], rShin: [0.4, -0.9, 0.1], lean: 0.2, spin: -0.5 }],
        [7, { rThigh: [-1, 0.1, 0.12], rShin: [-1, 0.15, 0.1], lean: 0.5, look: -0.3, spin: 0 }],
        [11, {}],
        [26, REST],
      ]),
    },

    // UP AIR - Whip Up: cracks the earbuds straight up. Long reach.
    uair: {
      total: 30, limb: 'arm', aerial: true, landingLag: 8,
      hitboxes: [
        { start: 7, end: 11, x: 0.15, y: 3.2, r: 0.5, dmg: 10, base: 7, growth: 0.95, angle: 88 },
        { start: 6, end: 11, x: 0.15, y: 2.4, r: 0.45, dmg: 7, base: 6.5, growth: 0.85, angle: 85 },
      ],
      pose: keyframes([
        [0, REST],
        [4, { rArm: [0.7, 0.3, 0.3], rFore: [0.9, 0.3, 0.2], rProp: 'club', glow: cord(0.5) }],
        [7, { rArm: [0.08, 1, 0.15], rFore: [0.05, 1, 0.1], glow: cord(1.3), look: 0.5, lean: -0.1 }],
        [12, {}],
        [18, { glow: cord(0.5) }],
        [26, REST],
      ]),
    },

    // DOWN AIR - Earbud Plunge: whips the earbuds straight down. The tip spikes.
    dair: {
      total: 38, limb: 'arm', aerial: true, landingLag: 14,
      hitboxes: [
        { start: 11, end: 14, x: 0.2, y: -0.2, r: 0.5, dmg: 12, base: 6, growth: 0.9, angle: -80 },
        { start: 10, end: 14, x: 0.2, y: 0.45, r: 0.45, dmg: 8, base: 6, growth: 0.7, angle: 50 },
      ],
      pose: keyframes([
        [0, REST],
        [7, {
          rArm: [0.6, 0.8, 0.3], rFore: [0.3, 0.95, 0.2], rProp: 'club', glow: cord(0.4), look: 0,
          rThigh: [0.8, -0.2, 0.15], rShin: [-0.3, -1, 0.1], lThigh: [0.8, -0.2, -0.15], lShin: [-0.3, -1, -0.1],
        }],
        [11, { rArm: [0.15, -1, 0.3], rFore: [0.1, -1, 0.2], glow: cord(1.0), look: -0.45, lean: 0.25 }],
        [16, {}],
        [32, REST],
      ]),
    },

    // ---- Throws (the rest are the shared ones) ----

    // BACK THROW - YouTube Suplex: he watched one video. Arches back and
    // slams them behind him.
    bthrow: {
      total: 34, hitboxes: [],
      throw: { frame: 18, dmg: 11, base: 7.5, growth: 1.1, angle: 125 },
      carry: [[0, 0.88, 0.05], [6, 0.6, 0.8], [12, -0.2, 2.0], [18, -1.1, 0.15]],
      onFrame(f, frame, input, world) {
        if (frame === 3) world.effects.text(f.x, f.y + f.h + 0.6, 'I SAW THIS ON YOUTUBE', '#9be22d', 0.32, 1.0);
        if (frame === 18) world.effects.shockwave(f.x - 1.1 * f.facing, f.y, 0.9);
      },
      pose: keyframes([
        [0, HOLD],
        [6, { rArm: [0.6, 0.6, 0.4], rFore: [0.5, 0.85, 0.2], lArm: [0.6, 0.6, -0.4], lFore: [0.5, 0.85, -0.2], crouch: 0.5, lean: 0.1 }],
        [12, { rArm: [-0.1, 1, 0.3], rFore: [-0.3, 0.95, 0.1], lArm: [-0.1, 1, -0.3], lFore: [-0.3, 0.95, -0.1], crouch: 0, lean: -0.5, look: 0.5 }],
        [18, { rArm: [-0.8, 0.3, 0.3], rFore: [-0.9, -0.2, 0.1], lArm: [-0.8, 0.3, -0.3], lFore: [-0.9, -0.2, -0.1], lean: -0.7, look: 0.6, crouch: 0.6 }],
        [22, {}],
        [32, { ...REST, look: 0 }],
      ]),
    },

    // ---- Specials ----

    // NEUTRAL SPECIAL - Lasso of Truth: throws his earbuds out like Wonder
    // Woman's lasso. On the ground it catches whoever it touches (through
    // shields), reels them in and he's holding them: throw away. In the air it
    // yanks them toward him instead, and if it reaches a ledge while he's off
    // the stage, he zips to it.
    nspecial: {
      total: 32, limb: 'arm',
      available: (f) => f.grounded,
      fallback: 'lassoAir',
      grab: {
        start: 8, end: 16, path: LASSO_OUT, r: 0.45, reel: 12,
        onCatch(f, v, world) { world.effects.text(v.x, v.y + v.h + 0.4, 'TELL THE TRUTH!', '#ffd23f', 0.38, 0.9); },
      },
      hitboxes: [],
      pose: lassoPose,
    },
    lassoAir: {
      total: 30, limb: 'arm', aerial: true, landingLag: 10, scripted: true,
      onFrame(f, frame, input, world) {
        const m = f.move;
        const s = f.stats.scale;
        if (m.zip) {
          // Tethered: zip to the ledge.
          const lg = m.zip;
          const hx = lg.x + lg.dir * 0.34 * s;
          const hy = lg.y - 1.85 * s;
          const dx = hx - f.x;
          const dy = hy - f.y;
          const d = Math.hypot(dx, dy);
          m.frame = Math.min(m.frame, 16);
          if (lg.holder) {
            m.zip = null;
          } else if (d < 0.5) {
            f.grabLedge(lg);
            f.vx = f.vy = 0;
          } else {
            f.vx = (dx / d) * 16;
            f.vy = (dy / d) * 16 + f.stats.gravity / 60;
          }
          return;
        }
        f.vx *= 0.97;
        f.vy = Math.max(f.vy, -f.stats.maxFall);
        if (frame < 8 || frame > 16) return;
        const [tx, ty] = hitboxPos({ path: LASSO_AIR }, frame);
        const wx = f.x + tx * s * f.facing;
        const wy = f.y + ty * s;
        for (const lg of world.stage.ledges) {
          if (lg.holder || (f.x - lg.x) * lg.dir < 0 || f.y > lg.y + 0.3) continue;
          if (Math.hypot(wx - lg.x, wy - lg.y) < 1.0) {
            m.zip = lg;
            break;
          }
        }
      },
      hitboxes: [{ start: 8, end: 16, path: LASSO_AIR, r: 0.45, dmg: 4, base: 10, growth: 0, angle: 160 }],
      pose: lassoPose,
    },

    // SIDE SPECIAL - Lambo: hops in his Lamborghini and floors it (like
    // Wario's bike). It drives itself; hold forward to go faster, hold back to
    // brake and spin it around, jump to hop it, up for a wheelie. Running
    // someone over at speed sends them. Special or shield bails out (so does
    // jump in the air), and the empty car rolls on and wrecks. Only one Lambo:
    // after it wrecks it's "in the shop" for a few seconds.
    sspecial: {
      total: LAMBO_MAX + 10, limb: 'arm', scripted: true,
      available: (f) => !f.charState.lambo && !(f.charState.lamboCooldown > 0),
      fallback: 'inTheShop',
      onStart(f, input, world) {
        f.charState.lambo = 'riding';
        f.move.speed = Math.abs(f.vx) * 0.5;
        world?.effects.text(f.x, f.y + f.h + 0.5, 'VROOM', '#ffc400', 0.45, 0.7);
        world?.effects.puff(f.x, f.y + 0.4, 0.8);
      },
      onFrame(f, frame, input, world) {
        const m = f.move;
        if (frame < 8) {
          f.vx *= 0.8;
          if (!f.grounded) f.vy = Math.max(f.vy, -2);
          return;
        }
        if ((frame > 14 && (input.special || input.shieldPressed || (input.jump && !f.grounded))) || frame >= LAMBO_MAX) {
          bail(f, world);
          return;
        }
        const fwd = input.x * f.facing;
        if (fwd < -0.5 && f.grounded) {
          // Brake, then skid around.
          m.speed -= LAMBO_BRAKE;
          if (m.speed <= 0) {
            f.facing = -f.facing;
            m.speed = 2;
            world.effects.dirt(f.x, f.y + 0.1, f.facing);
          }
        } else if (f.grounded) {
          const target = fwd > 0.5 ? LAMBO_TOP : LAMBO_CRUISE;
          m.speed += Math.sign(target - m.speed) * Math.min(LAMBO_ACCEL, Math.abs(target - m.speed));
        }
        f.vx = m.speed * f.facing;
        m.wheelie = f.grounded && input.y > 0.5;
        if (input.jump && f.grounded) {
          f.vy = 11;
          f.grounded = false;
          f.platform = null;
        }
        if (f.grounded && m.speed > 6 && frame % 5 === 0) world.effects.puff(f.x - 1.2 * f.facing, f.y + 0.4, 0.3, 0x9a9aa8, 0.3);
      },
      onLand() {}, // keeps driving
      onInterrupt(f, m, world) { loseCar(f, m, world); }, // knocked out of the car
      hitboxes: [
        { start: 8, end: LAMBO_MAX, x: 1.2, y: 0.6, r: 0.7, dmg: 12, base: 8.5, growth: 1.0, angle: 45, rehit: 40, group: 0, when: (f) => fast(f) && !f.move.wheelie },
        { start: 8, end: LAMBO_MAX, x: 1.1, y: 0.95, r: 0.75, dmg: 12, base: 9, growth: 1.0, angle: 75, rehit: 40, group: 0, when: (f) => fast(f) && f.move.wheelie },
        { start: 8, end: LAMBO_MAX, x: 1.1, y: 0.6, r: 0.65, dmg: 6, base: 6, growth: 0.5, angle: 40, rehit: 40, group: 0, when: (f) => !fast(f) && f.move.speed > 3 },
      ],
      pose(frame, f) {
        const m = f.move;
        // In a wheelie the car tips up around its rear axle, so he rides up and back with it.
        const w = m.wheelie;
        const drive = {
          mount: 'lambo', mountPitch: w ? 0.22 : 0,
          crouch: w ? 1.2 : 2.3, lean: w ? -0.45 : -0.15, look: 0.05,
          rThigh: [1, w ? 0.25 : -0.05, 0.18], rShin: [1, w ? -0.25 : -0.5, 0.12],
          lThigh: [1, w ? 0.25 : -0.05, -0.18], lShin: [1, w ? -0.25 : -0.5, -0.12],
          rArm: [0.55, -0.7, 0.3], rFore: [0.95, 0.2, -0.15], lArm: [0.1, -0.5, -1], lFore: [0.3, -1, -0.3],
          rProp: 'upright',
        };
        if (frame >= 8) return drive;
        // Hopping in.
        return { ...drive, crouch: 2.3 * (frame / 8), mount: 'lambo' };
      },
    },

    // ...and when the Lambo is wrecked: he pulls out the keys and swears it's
    // "in the shop". Wide open.
    inTheShop: {
      total: 46, limb: 'arm',
      onFrame(f, frame, input, world) {
        if (frame === 14) world.effects.text(f.x, f.y + f.h + 0.5, 'IT\'S IN THE SHOP', '#ffc400', 0.38, 1.0);
      },
      hitboxes: [],
      pose: (frame) => {
        const p = { ...shopPose(frame) };
        if (frame >= 3 && frame <= 36) p.rHeld = 'carKeys';
        return p;
      },
    },

    // UP SPECIAL - Parkour!: a huge backflip straight up with the earbuds
    // whirling around him. Hits twice on the way.
    uspecial: {
      total: 44, limb: 'leg', scripted: true, helplessAfter: true, landingLag: 14, ledgeGrab: true,
      onFrame(f, frame, input, world) {
        if (frame < 6) {
          f.vx *= 0.85;
          if (!f.grounded) f.vy = Math.max(f.vy, -1.5);
          return;
        }
        if (frame === 6) world.effects.text(f.x, f.y + f.h + 0.4, 'PARKOUR!', '#9be22d', 0.4, 0.7);
        if (frame <= 20) {
          f.grounded = false;
          f.platform = null;
          f.vy = 17.5;
          f.vx = (input.x || 0) * 4.5;
        }
      },
      hitboxes: [
        { start: 6, end: 12, x: 0, y: 1.0, r: 0.95, dmg: 4, base: 5, growth: 0.15, angle: 80, group: 0 },
        { start: 13, end: 20, x: 0, y: 1.2, r: 0.95, dmg: 6, base: 7.5, growth: 0.8, angle: 75, group: 1 },
      ],
      pose: keyframes([
        [0, { ...REST, pitch: 0 }],
        [5, { crouch: 1, lean: 0.3, rArm: [-0.6, -0.8, 0.3], lArm: [-0.6, -0.8, -0.3], lFore: [-0.5, -0.8, -0.2] }],
        [8, {
          crouch: 0, lean: 0, rArm: [0.1, 0.2, 1], rFore: [0.3, 0.2, 1], rProp: 'club', glow: cord(0.8),
          lArm: [0.4, 0.6, -0.6], lFore: [0.6, 0.7, -0.3],
          rThigh: [0.9, 0.3, 0.15], rShin: [-0.3, -1, 0.1], lThigh: [0.9, 0.3, -0.15], lShin: [-0.3, -1, -0.1],
        }],
        [22, { pitch: Math.PI * 2 }],
        [26, {
          glow: 0, rProp: 'upright', rArm: [-0.1, 1, 0.5], rFore: [-0.1, 1, 0.3], lArm: [-0.1, 1, -0.5], lFore: [-0.1, 1, -0.3],
          rThigh: [0.2, -1, 0.15], rShin: [-0.1, -1, 0.1], lThigh: [-0.1, -1, -0.15], lShin: [-0.2, -1, -0.1], look: 0.3,
        }],
      ]),
    },

    // DOWN SPECIAL - Krav Maga (trust me bro): drops into a "Krav Maga"
    // stance. Get hit during it and he slips the hit and answers with a
    // spinning kick. Nothing happens? He just stands there in the stance.
    dspecial: {
      total: 46, limb: 'arm',
      counter: { start: 4, end: 22, then: 'kravKick' },
      onFrame(f, frame, input, world) {
        if (frame === 30) world.effects.text(f.x, f.y + f.h + 0.4, 'trust me bro', '#cfd6e0', 0.3, 0.9);
      },
      hitboxes: [],
      pose: keyframes([
        [0, REST],
        [4, {
          lArm: [0.75, -0.3, -0.3], lFore: [0.9, 0.45, 0], rArm: [0.3, -0.8, 0.4], rFore: [0.7, 0.6, -0.2],
          rThigh: [-0.35, -0.95, 0.2], rShin: [-0.4, -0.9, 0.1], lThigh: [0.45, -0.9, -0.2], lShin: [0.1, -1, -0.1],
          crouch: 0.6, lean: 0.1, look: 0.05,
        }],
        [24, {}],
        [30, { look: 0.2 }],
        [42, { ...REST, ...STAND }],
      ]),
    },
    kravKick: {
      total: 34, limb: 'leg', intangible: [0, 12],
      onStart(f, input, world) { world?.effects.text(f.x, f.y + f.h + 0.5, 'KRAV MAGA!', '#9be22d', 0.45, 0.8); },
      hitboxes: [
        { start: 8, end: 12, x: 1.05, y: 1.35, r: 0.6, dmg: 13, base: 9, growth: 1.05, angle: 40 },
        { start: 8, end: 12, x: 0.45, y: 1.2, r: 0.45, dmg: 10, base: 8, growth: 0.9, angle: 40 },
      ],
      pose: keyframes([
        [0, { ...REST, spin: 0, crouch: 0.4 }],
        [4, { spin: Math.PI, rThigh: [0.6, -0.4, 0.15], rShin: [-0.2, -1, 0.1], crouch: 0 }],
        [8, { spin: Math.PI * 2, rThigh: [1, 0.3, 0.15], rShin: [1, 0.35, 0.1], lean: -0.3, rArm: [-0.4, -0.5, 0.8], lArm: [0.4, -0.4, -0.8] }],
        [13, {}],
        [28, { ...REST, spin: Math.PI * 2 }],
      ]),
    },
  },
};

const shopPose = keyframes([
  [0, REST],
  [6, { rArm: [0.5, -0.6, 0.4], rFore: [0.6, 0.8, 0.1], rProp: 'upright', look: -0.2 }],
  [12, { rFore: [0.4, 0.9, 0.2] }],
  [18, { rFore: [0.6, 0.8, 0.1] }],
  [26, { rArm: [0.1, -0.5, 1], rFore: [0.3, 0.8, 0.6], lArm: [0.1, -0.5, -1], lFore: [0.3, 0.8, -0.6], look: 0.15 }],
  [36, {}],
  [44, REST],
]);

const victoryPose = keyframes([
  [0, { ...REST, rArm: [0.4, -0.6, 0.5], rFore: [0.5, 0.85, 0.1], rProp: 'upright' }],
  [12, { rFore: [0.2, 0.95, 0.3] }],
  [24, { rFore: [0.5, 0.85, -0.1] }],
  [36, { rFore: [0.2, 0.95, 0.3] }],
  [48, { rFore: [0.5, 0.85, -0.1] }],
  [64, {
    rArm: [0.3, -0.85, 0.35], rFore: [0.2, 0.15, -1], lArm: [0.3, -0.85, -0.35], lFore: [0.2, 0.3, 1],
    look: 0.2, lean: -0.1,
  }],
]);
