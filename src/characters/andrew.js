import { keyframes, HOLD } from '../poses.js';
import { REST as GUARD_REST } from '../moves.js';

// Andrew: type 1 diabetic, and his whole kit is built around it. He carries
// an insulin pen, and he has to manage his blood sugar (shown on the HUD in
// mg/dL) while he fights:
//   LOW    under 70     slower and weaker until he gets some sugar in him
//   normal 70-180
//   RUSH   180-300      faster and hits harder (sugar is fuel)
//   SPIKE  over 300     hits hardest, but sluggish. His insulin brings it down.
// It burns off slowly over the match. The juice box (down special) is +80.
// Frame data format: see src/moves.js. Poses: see src/poses.js.

const BG_START = 110;
const BG_BURN = 1.5 / 60; // mg/dL per frame: fighting burns sugar
const JUICE = 80;
const INSULIN_TO = 120; // where a dose brings a spike back down to

const STATES = {
  low: { speed: 0.85, power: -0.1, label: 'LOW!', color: '#6fb6ff', hud: ' LOW' },
  ok: { speed: 1, power: 0, hud: '' },
  rush: { speed: 1.15, power: 0.12, label: 'SUGAR RUSH!', color: '#ffd23f', hud: ' ⚡RUSH' },
  spike: { speed: 0.85, power: 0.25, label: 'SPIKE!', color: '#ff4f4f', hud: ' ⚠️SPIKE' },
};
const stateOf = (bg) => (bg < 70 ? 'low' : bg > 300 ? 'spike' : bg > 180 ? 'rush' : 'ok');
const sugar = (f) => f.charState.bg ?? BG_START;

function setSugar(f, bg, world) {
  f.charState.bg = Math.max(40, Math.min(450, bg));
  const state = stateOf(f.charState.bg);
  if (state !== f.charState.state) {
    const s = STATES[state];
    if (f.charState.state && s.label) world.effects.text(f.x, f.y + f.h + 0.8, s.label, s.color, 0.45, 1.0);
    f.charState.state = state;
  }
  f.speedMul = STATES[state].speed;
  f.powerBonus = STATES[state].power;
}

const CGM_COLORS = { low: 0x4aa8ff, ok: 0x3ddc84, rush: 0xffd23f, spike: 0xff3b3b };

// Insulin makes your blood sugar crash: slowed for a couple of seconds.
function crash(v, world) {
  v.slowTimer = Math.max(v.slowTimer, 150);
  world.effects.text(v.x, v.y + v.h + 0.5, 'CRASH zZz', '#9fd0ff', 0.4, 1.0);
}

// Insulin pen held like a dart, left fist up.
const IDLE = { rArm: [0.25, -1, 0.3], rFore: [0.9, 0.6, 0.1], lArm: [0.2, -1, -0.3], lFore: [1, 0.75, -0.1] };
const REST = { ...GUARD_REST, ...IDLE, glow: 0 };
const STAND = { rThigh: REST.rThigh, rShin: REST.rShin, lThigh: REST.lThigh, lShin: REST.lShin, crouch: 0 };
const CROUCH_LEGS = { rThigh: [0.75, -0.65, 0.15], rShin: [-0.45, -0.9, 0.1], lThigh: [0.55, -0.8, -0.15], lShin: [-0.55, -0.85, -0.1] };

// Swaps a prop into a hand for part of a move.
const holding = (pose, side, prop, from, to) => (frame, f) => {
  const p = { ...pose(frame, f) };
  if (frame >= from && frame <= to) p[side] = prop;
  return p;
};

const INSULIN_DART = {
  look: 'prop', prop: 'insulinPen', aim: true, x: 0.7, y: 1.55, speed: 16, vy: 2, gravity: 9, life: 70,
  r: 0.3, dmg: 5, base: 4, growth: 0.3, angle: 30, unique: 'dart',
  onHit: (p, v, world, result) => { if (result === 'hit') crash(v, world); },
};

export const ANDREW = {
  id: 'andrew',
  name: 'Andrew',
  tagline: 'Type 1. Sugar is fuel.',
  color: 0x2e86de,
  model: 'models/andrew.glb',
  props: { right: 'insulinPen' },
  // His CGM on the back of his left arm; the light shows his blood sugar.
  wear: [{ id: 'cgm', spot: 'lUpperArm', update: (cgm, f) => cgm.setColor(CGM_COLORS[f.charState.state ?? 'ok']) }],
  stats: { weight: 104, runSpeed: 7.6, airSpeed: 6.1, jump: 14.8, gravity: 39, maxFall: 14, power: 1.03, scale: 1.0 },

  // Blood sugar burns off as he fights; his speed and power follow it.
  update(f, world) {
    setSugar(f, sugar(f) - BG_BURN, world);
    if (f.charState.state === 'rush' && world.frame % 10 === 0 && !f.dead) {
      world.effects.sparkle(f.x, f.y + 1.2, 0xfff3a0, 1, 1.0);
    }
  },

  hud: (f) => `🩸${Math.round(sugar(f))}${STATES[f.charState.state ?? 'ok'].hud}`,

  poses: {
    // Shaky when he's low.
    base: (f) => (f.charState.state === 'low' ? { look: Math.sin(performance.now() / 25) * 0.04 } : {}),
    idle: IDLE,
    crouch: { rArm: [0.25, -1, 0.35], rFore: [0.8, 0.4, 0.2], lArm: [0.2, -1, -0.3], lFore: [1, 0.6, -0.1] },
  },

  // CPU habits: drink when low, dose when spiking, darts from range.
  cpu(f, { dist, dx }) {
    const bg = sugar(f);
    if (bg < 85 && dist > 3.5 && Math.random() < 0.05) return { special: true, y: -1 };
    if (f.charState.state === 'spike' && dist > 3 && Math.random() < 0.05) return { special: true };
    if (dist > 3.5 && dist < 9 && Math.random() < 0.03) return { special: true, face: true };
    if (f.grounded && dist > 2 && dist < 5 && Math.random() < 0.02) return { special: true, x: Math.sign(dx) };
    return null;
  },

  // Victory: checks his sugar, likes what he sees, flexes.
  victory: {
    quote: 'Sugar\'s perfect. Unlike your gameplay.',
    pose: (frame) => {
      const p = { ...victoryPose(frame) };
      if (frame < 58) p.lHeld = 'glucoseMeter';
      return p;
    },
    onFrame(frame, { effects, x, y }) {
      if (frame === 30) effects.text(x - 1.05, y + 1.3, '105 mg/dL', '#7dff8a', 0.3, 1.6);
      if (frame === 52) effects.text(x + 1.0, y + 1.45, 'PERFECT', '#ffffff', 0.36, 1.4);
    },
  },

  moves: {
    // ---- Ground ----

    // JAB - Pen Pokes: a poke with the insulin pen, a left hook, then he
    // clicks the dose dial and stabs it forward.
    jab: {
      total: 16, limb: 'arm', combo: { next: 'jab2', from: 5 },
      onStart(f) { if (f.grounded) f.vx = 3.5 * f.facing; },
      hitboxes: [
        { start: 2, end: 4, x: 1.1, y: 1.42, r: 0.48, dmg: 2.5, base: 3.5, growth: 0.08, angle: 35 },
        { start: 2, end: 4, x: 0.45, y: 1.35, r: 0.4, dmg: 2.5, base: 3.5, growth: 0.08, angle: 35 },
      ],
      pose: keyframes([
        [0, REST],
        [2, { rArm: [1, -0.05, 0.25], rFore: [1, 0, 0.05], lean: 0.3 }],
        [6, {}],
        [13, { rArm: IDLE.rArm, rFore: IDLE.rFore, lean: 0.05 }],
      ]),
    },
    jab2: {
      total: 18, limb: 'arm', combo: { next: 'jab3', from: 7 },
      onStart(f) { if (f.grounded) f.vx = 3 * f.facing; },
      hitboxes: [
        { start: 3, end: 5, path: [[3, 0.7, 1.5], [5, 1.05, 1.35]], r: 0.5, dmg: 3, base: 4, growth: 0.12, angle: 40 },
        { start: 3, end: 5, x: 0.45, y: 1.33, r: 0.4, dmg: 3, base: 4, growth: 0.12, angle: 40 },
      ],
      pose: keyframes([
        [0, { ...REST, rArm: [1, -0.05, 0.25], rFore: [1, 0, 0.05], lean: 0.3 }],
        [1, { lArm: [0.3, -0.4, -0.9], lFore: [0.5, 0.3, -0.8] }],
        [3, { lArm: [0.85, -0.15, -0.5], lFore: [0.9, 0.1, 0.4], rArm: IDLE.rArm, rFore: IDLE.rFore, lean: 0.35 }],
        [7, {}],
        [15, { lArm: IDLE.lArm, lFore: IDLE.lFore, lean: 0.05 }],
      ]),
    },
    jab3: {
      total: 28, limb: 'arm',
      onFrame(f, frame, input, world) {
        if (frame === 5) world.effects.text(f.x + 0.3 * f.facing, f.y + f.h + 0.3, 'click', '#ff8a1f', 0.3, 0.5);
      },
      hitboxes: [
        { start: 7, end: 9, x: 1.2, y: 1.3, r: 0.55, dmg: 5, base: 7.5, growth: 0.6, angle: 40 },
        { start: 7, end: 9, x: 0.55, y: 1.35, r: 0.42, dmg: 4, base: 7, growth: 0.55, angle: 40 },
      ],
      pose: keyframes([
        [0, { ...REST, lArm: [0.85, -0.15, -0.5], lFore: [0.9, 0.1, 0.4] }],
        [4, { rArm: [0.2, 0.7, 0.5], rFore: [0.5, 0.85, 0.1], lArm: IDLE.lArm, lFore: IDLE.lFore, lean: -0.1, glow: 1 }],
        [7, { rArm: [1, -0.2, 0.2], rFore: [1, -0.15, 0.05], lean: 0.35 }],
        [12, { glow: 0 }],
        [24, REST],
      ]),
    },

    // FORWARD TILT - Carb Load: swings a big French loaf. Carbs hit hard.
    ftilt: {
      total: 30, limb: 'arm',
      onHit(f, victim, world) { world.effects.crumbs(victim.x, victim.y + 1.3, 0xd9953f); },
      hitboxes: [
        { start: 8, end: 11, path: [[8, 0.6, 1.95], [10, 1.35, 1.35], [11, 1.3, 1.05]], r: 0.5, dmg: 11, base: 7.5, growth: 1.0, angle: 40 },
        { start: 8, end: 10, x: 0.6, y: 1.35, r: 0.42, dmg: 8, base: 6.5, growth: 0.8, angle: 40 },
      ],
      pose: holding(keyframes([
        [0, REST],
        [5, { rArm: [-0.4, 0.6, 0.6], rFore: [-0.3, 0.9, 0.4], lean: -0.15 }],
        [8, { rArm: [0.5, 0.8, 0.3], rFore: [0.6, 0.75, 0.2], lean: 0.1 }],
        [10, { rArm: [1, -0.05, 0.2], rFore: [1, -0.1, 0.1], lean: 0.35 }],
        [12, { rArm: [0.85, -0.5, 0.2], rFore: [0.8, -0.6, 0.1] }],
        [17, {}],
        [26, REST],
      ]), 'rHeld', 'bread', 1, 22),
    },

    // UP TILT - Spike Chart: an uppercut that shoots straight up like his
    // sugar after a slice of cake.
    utilt: {
      total: 26, limb: 'arm',
      onFrame(f, frame, input, world) {
        if (frame >= 6 && frame <= 9) world.effects.sparkle(f.x + 0.3 * f.facing, f.y + 2.1, 0xff6b6b, 1, 0.4);
      },
      hitboxes: [
        { start: 5, end: 10, path: [[5, 0.65, 1.5], [7, 0.4, 2.15], [10, 0.15, 2.35]], r: 0.55, dmg: 9, base: 8, growth: 0.9, angle: 85 },
        { start: 5, end: 8, x: 0.25, y: 1.7, r: 0.45, dmg: 8, base: 8, growth: 0.9, angle: 85 },
      ],
      pose: keyframes([
        [0, REST],
        [3, { rArm: [0.6, -0.8, 0.3], rFore: [0.9, 0.2, 0.1], crouch: 0.4, lean: 0.2 }],
        [6, { rArm: [0.4, 0.9, 0.25], rFore: [0.25, 1, 0.15], crouch: 0, look: 0.35, lean: -0.05 }],
        [9, { rArm: [0.15, 1, 0.25], rFore: [0.1, 1, 0.15] }],
        [14, {}],
        [23, REST],
      ]),
    },

    // DOWN TILT - Low Blow: a quick kick at the ankles.
    dtilt: {
      total: 20, limb: 'leg',
      onHit(f, victim, world) { world.effects.text(victim.x, victim.y + 0.4, 'LOW', '#6fb6ff', 0.35, 0.6); },
      hitboxes: [
        { start: 5, end: 8, x: 1.05, y: 0.25, r: 0.5, dmg: 7, base: 6, growth: 0.55, angle: 30 },
        { start: 5, end: 8, x: 0.5, y: 0.35, r: 0.42, dmg: 6, base: 5.5, growth: 0.5, angle: 30 },
      ],
      pose: keyframes([
        [0, REST],
        [3, { ...CROUCH_LEGS, crouch: 1, lean: 0.15 }],
        [5, { rThigh: [0.95, -0.35, 0.15], rShin: [1, -0.2, 0.1], lean: 0.05 }],
        [9, {}],
        [17, { ...REST, ...STAND }],
      ]),
    },

    // ---- Air ----

    // NEUTRAL AIR - Sugar High: spins with his arms out in a cloud of sparkles.
    nair: {
      total: 32, limb: 'spin', aerial: true, landingLag: 6,
      onFrame(f, frame, input, world) {
        if (frame >= 5 && frame <= 15 && frame % 3 === 0) world.effects.sparkle(f.x, f.y + 1.0, 0xfff3a0, 3, 1.6);
      },
      hitboxes: [
        { start: 5, end: 14, x: 0, y: 0.95, r: 1.15, dmg: 8, base: 6, growth: 0.75, angle: 45 },
        { start: 15, end: 22, x: 0, y: 0.95, r: 1.0, dmg: 5, base: 5, growth: 0.5, angle: 50 },
      ],
      pose: keyframes([
        [0, { ...REST, spin: 0 }],
        [4, {
          rArm: [0.1, 0.1, 1], rFore: [0.2, 0.2, 1], lArm: [0.1, 0.1, -1], lFore: [0.2, 0.2, -1],
          rThigh: [0.6, -0.8, 0.2], rShin: [0.1, -1, 0.1], lThigh: [-0.5, -0.85, -0.2], lShin: [-0.3, -1, -0.1], look: 0.2,
        }],
        [16, { spin: Math.PI * 2 }],
        [22, {}],
        [30, { ...REST, spin: 0 }],
      ]),
    },

    // FORWARD AIR - Bread Slam: brings the loaf down overhead.
    fair: {
      total: 36, limb: 'arm', aerial: true, landingLag: 12,
      onHit(f, victim, world) { world.effects.crumbs(victim.x, victim.y + 1.2, 0xd9953f); },
      hitboxes: [
        { start: 10, end: 14, path: [[10, 0.75, 2.3], [12, 1.35, 1.45], [14, 1.0, 0.7]], r: 0.55, dmg: 13, base: 7, growth: 1.0, angle: 40 },
        { start: 10, end: 13, x: 0.5, y: 1.55, r: 0.42, dmg: 9, base: 6, growth: 0.85, angle: 40 },
      ],
      pose: holding(keyframes([
        [0, REST],
        [7, { rArm: [-0.3, 1, 0.3], rFore: [-0.4, 0.9, 0.2], lean: -0.15 }],
        [10, { rArm: [0.6, 0.8, 0.25], rFore: [0.75, 0.65, 0.15], lean: 0.1 }],
        [12, { rArm: [1, -0.05, 0.2], rFore: [1, -0.2, 0.1], lean: 0.35 }],
        [14, { rArm: [0.55, -0.85, 0.2], rFore: [0.45, -0.9, 0.1], lean: 0.3 }],
        [17, {}],
        [32, REST],
      ]), 'rHeld', 'bread', 1, 28),
    },

    // BACK AIR - Correction Kick: a high heel kick behind him.
    bair: {
      total: 30, limb: 'leg', aerial: true, landingLag: 10,
      hitboxes: [
        { start: 7, end: 10, x: -1.0, y: 1.2, r: 0.55, dmg: 13, base: 8, growth: 1.08, angle: 140 },
        { start: 7, end: 10, x: -0.45, y: 1.0, r: 0.42, dmg: 9, base: 6, growth: 0.8, angle: 140 },
      ],
      pose: keyframes([
        [0, REST],
        [4, { rThigh: [-0.5, -0.7, 0.12], rShin: [0.4, -0.9, 0.1], lean: 0.25, look: -0.1 }],
        [7, { rThigh: [-0.9, 0.3, 0.12], rShin: [-0.95, 0.35, 0.1], lean: 0.6, look: -0.25, rArm: [0.7, -0.6, 0.3], lArm: [0.7, -0.6, -0.3] }],
        [11, {}],
        [26, REST],
      ]),
    },

    // UP AIR - Finger Prick: a quick jab straight up with the pen.
    uair: {
      total: 24, limb: 'arm', aerial: true, landingLag: 7,
      onFrame(f, frame, input, world) {
        if (frame === 6) world.effects.sparkle(f.x + 0.2 * f.facing, f.y + 2.4, 0xff4f4f, 2, 0.2);
      },
      hitboxes: [
        { start: 5, end: 8, x: 0.2, y: 2.35, r: 0.5, dmg: 7, base: 7, growth: 0.85, angle: 88 },
        { start: 5, end: 8, x: 0.15, y: 1.85, r: 0.42, dmg: 6, base: 6.5, growth: 0.8, angle: 88 },
      ],
      pose: keyframes([
        [0, REST],
        [3, { rArm: [0.5, -0.4, 0.4], rFore: [0.6, 0.8, 0.2], crouch: 0 }],
        [5, { rArm: [0.15, 1, 0.25], rFore: [0.12, 1, 0.15], look: 0.45, glow: 1 }],
        [10, { glow: 0 }],
        [20, REST],
      ]),
    },

    // DOWN AIR - Sugar Crash: raises both fists and hammers straight down. Spikes.
    dair: {
      total: 40, limb: 'arm', aerial: true, landingLag: 15,
      onFrame(f, frame, input, world) {
        if (frame === 12) world.effects.text(f.x, f.y - 0.1, 'CRASH', '#9fd0ff', 0.38, 0.6);
      },
      hitboxes: [
        { start: 12, end: 15, x: 0.3, y: 0.45, r: 0.6, dmg: 13, base: 6, growth: 0.9, angle: -75 },
        { start: 16, end: 21, x: 0.25, y: 0.5, r: 0.5, dmg: 8, base: 6, growth: 0.7, angle: 60 },
      ],
      pose: keyframes([
        [0, REST],
        [8, {
          rArm: [0.1, 1, 0.3], rFore: [0, 1, 0.15], lArm: [0.1, 1, -0.3], lFore: [0, 1, -0.15], look: 0.2,
          rThigh: [0.7, -0.5, 0.15], rShin: [-0.4, -0.9, 0.1], lThigh: [0.7, -0.5, -0.15], lShin: [-0.4, -0.9, -0.1],
        }],
        [10, { rArm: [0.9, 0.45, 0.25], rFore: [0.95, 0.2, 0.1], lArm: [0.9, 0.45, -0.25], lFore: [0.95, 0.2, -0.1] }],
        [12, { rArm: [0.35, -0.95, 0.15], rFore: [0.25, -1, 0.05], lArm: [0.35, -0.95, -0.15], lFore: [0.25, -1, -0.05], lean: 0.4, look: -0.4 }],
        [18, {}],
        [34, REST],
      ]),
    },

    // ---- Throws (the rest are the shared ones) ----

    // DOWN THROW - Insulin Shot: pins them down and gives them a dose. Their
    // sugar crashes: slowed for a couple of seconds.
    dthrow: {
      total: 36, hitboxes: [],
      throw: { frame: 26, dmg: 4, base: 7.5, growth: 0.6, angle: 80 },
      carry: [[0, 0.88, 0.05], [26, 0.88, 0.05]],
      onFrame(f, frame, input, world) {
        const v = f.holding?.victim;
        if (frame !== 14 || !v) return;
        f.pummelHeld(world, 3);
        world.effects.text(v.x, v.y + v.h + 0.2, 'click', '#ff8a1f', 0.3, 0.5);
        crash(v, world);
      },
      pose: keyframes([
        [0, HOLD],
        [8, { rArm: [0.6, 0.6, 0.3], rFore: [0.6, 0.6, 0.1], lean: 0.1, glow: 1 }],
        [14, { rArm: [0.8, -0.3, 0.25], rFore: [0.6, -0.8, 0.1], lean: 0.4, look: -0.25 }],
        [26, { glow: 0 }],
        [32, REST],
      ]),
    },

    // ---- Specials ----

    // NEUTRAL SPECIAL - Insulin Dart: throws an insulin pen like a dart. Their
    // sugar crashes: slowed for a couple of seconds. One at a time.
    // While he's SPIKING, the same button doses himself instead (Correction).
    nspecial: {
      total: 30, limb: 'arm',
      available: (f) => f.charState.state !== 'spike',
      fallback: 'correction',
      onFrame(f, frame, input, world) {
        if (frame === 12) world.spawnProjectile(f, INSULIN_DART);
      },
      hitboxes: [],
      pose: holding(keyframes([
        [0, REST],
        [8, { rArm: [0.2, 0.6, 0.5], rFore: [-0.3, 0.9, 0.3], lArm: [0.8, -0.3, -0.3], lFore: [1, 0.1, -0.1], lean: -0.15 }],
        [12, { rArm: [1, 0.1, 0.25], rFore: [1, 0.05, 0.1], lean: 0.3 }],
        [16, {}],
        [27, REST],
      ]), 'rHeld', null, 12, 24),
    },

    // Correction: a shot in the thigh brings a spike back down to normal.
    correction: {
      total: 34, limb: 'arm',
      onFrame(f, frame, input, world) {
        if (frame !== 16) return;
        const drop = Math.round(sugar(f) - INSULIN_TO);
        setSugar(f, INSULIN_TO, world);
        world.effects.text(f.x, f.y + f.h + 0.5, `-${drop} mg/dL`, '#7dff8a', 0.4, 1.0);
      },
      hitboxes: [],
      pose: keyframes([
        [0, REST],
        [8, { rArm: [0.3, -0.9, 0.35], rFore: [0.35, -1, 0.15], crouch: 0.3, look: -0.3, lean: 0.15 }],
        [16, { rFore: [0.25, -1, 0.1], glow: 1 }],
        [22, { glow: 0 }],
        [32, REST],
      ]),
    },

    // SIDE SPECIAL - Glucose Check: lunges in with his meter and pricks them.
    // The meter reads their damage like a blood sugar, and if it says HI
    // (150%+) they fly a lot farther.
    sspecial: {
      total: 40, limb: 'arm', scripted: true, landingLag: 12,
      onFrame(f, frame) {
        if (frame >= 8 && frame <= 16) {
          f.vx = 13 * f.facing;
          f.vy = Math.max(f.vy, 0);
        } else {
          f.vx *= 0.8;
        }
      },
      onHit(f, victim, world) {
        const hi = victim.percent >= 150;
        const reading = hi ? 'HI' : `${Math.round(70 + victim.percent * 1.5)} mg/dL`;
        world.effects.text(victim.x, victim.y + victim.h + 0.5, reading, hi ? '#ff4f4f' : '#7dff8a', hi ? 0.7 : 0.4, 1.1);
        if (hi) {
          victim.kbx *= 1.4;
          victim.kby *= 1.4;
          victim.hitstun = Math.floor(victim.hitstun * 1.3);
          world.shake = 0.5;
        }
      },
      hitboxes: [
        { start: 9, end: 16, x: 0.85, y: 1.25, r: 0.5, dmg: 9, base: 7, growth: 0.8, angle: 35 },
        { start: 9, end: 16, x: 0.35, y: 1.15, r: 0.45, dmg: 9, base: 7, growth: 0.8, angle: 35 },
      ],
      pose: holding(keyframes([
        [0, REST],
        [5, { lArm: [0.4, -0.6, -0.5], lFore: [0.6, 0.6, -0.3], crouch: 0.3, lean: -0.1 }],
        [8, { lArm: [1, 0.05, -0.2], lFore: [1, 0.05, -0.05], rArm: [-0.4, -0.8, 0.4], rFore: [-0.2, -0.6, 0.6], lean: 0.45, crouch: 0 }],
        [17, {}],
        [36, REST],
      ]), 'lHeld', 'glucoseMeter', 2, 30),
    },

    // UP SPECIAL - Sugar Rush: downs a glucose tab and rockets up in a jittery
    // zigzag, hitting a few times on the way. Goes higher in a sugar rush,
    // lower when he's low.
    uspecial: {
      total: 42, limb: 'arm', scripted: true, helplessAfter: true, landingLag: 16, ledgeGrab: true,
      onFrame(f, frame, input, world) {
        const m = f.move;
        if (frame < 7) {
          f.vx *= 0.85;
          if (!f.grounded) f.vy = Math.max(f.vy, -1.5);
          return;
        }
        if (frame === 7) {
          const state = f.charState.state;
          m.boost = state === 'low' ? 0.82 : state === 'rush' ? 1.1 : 1;
          world.effects.text(f.x, f.y + f.h + 0.4, 'SUGAR RUSH', '#ffd23f', 0.38, 0.6);
        }
        if (frame <= 24) {
          f.grounded = false;
          f.platform = null;
          f.vy = 16.5 * m.boost;
          f.vx = (input.x || 0) * 4.5 + (frame % 6 < 3 ? 1.6 : -1.6);
          world.effects.sparkle(f.x, f.y + 0.6, 0xfff3a0, 1, 0.6);
        }
      },
      hitboxes: [
        { start: 7, end: 11, x: 0.15, y: 1.3, r: 0.75, dmg: 3, base: 5, growth: 0.1, angle: 85, group: 0 },
        { start: 12, end: 16, x: 0.15, y: 1.5, r: 0.7, dmg: 3, base: 5, growth: 0.1, angle: 85, group: 1 },
        { start: 17, end: 22, x: 0.2, y: 2.0, r: 0.7, dmg: 5, base: 7.5, growth: 0.75, angle: 80, group: 2 },
      ],
      pose: keyframes([
        [0, REST],
        [4, { lArm: [0.45, -0.75, -0.3], lFore: 'mouth', look: 0.1 }],
        [7, {
          rArm: [0.3, 1, 0.3], rFore: [0.25, 1, 0.15], lArm: [-0.2, -0.9, -0.4], lFore: [-0.1, -1, -0.2], look: 0.35,
          rThigh: [0.15, -1, 0.15], rShin: [-0.1, -1, 0.1], lThigh: [-0.1, -1, -0.15], lShin: [-0.15, -1, -0.1],
        }],
        [24, {}],
        [40, { rArm: [-0.1, 1, 0.5], rFore: [-0.1, 1, 0.3], lArm: [-0.1, 1, -0.5], lFore: [-0.1, 1, -0.3], look: 0.3 }],
      ]),
    },

    // DOWN SPECIAL - Juice Box: drinks a juice box. +80 mg/dL (fixes a low,
    // or tips him into a sugar rush) and heals 2%. Drink too many and he spikes.
    dspecial: {
      total: 44, limb: 'arm', scripted: true, landingLag: 6,
      onFrame(f, frame, input, world) {
        f.vx *= 0.8;
        if (!f.grounded) f.vy = Math.max(f.vy - 0.35, -3);
        if (frame === 14 || frame === 22) world.effects.text(f.x + 0.3 * f.facing, f.y + f.h + 0.2, 'slurp', '#ffffff', 0.28, 0.5);
        if (frame === 28) {
          setSugar(f, sugar(f) + JUICE, world);
          f.heal(2, world);
          world.effects.text(f.x, f.y + f.h + 0.9, `+${JUICE} mg/dL`, '#ffd23f', 0.38, 0.9);
        }
      },
      hitboxes: [],
      pose: holding(keyframes([
        [0, REST],
        [6, { lArm: [0.45, -0.75, -0.3], lFore: 'mouth', lProp: 'upright', look: 0.05 }],
        [12, { look: 0.15 }],
        [20, { look: 0.05 }],
        [28, { look: 0.25 }],
        [34, { lArm: IDLE.lArm, lFore: IDLE.lFore }],
        [42, REST],
      ]), 'lHeld', 'juiceBox', 3, 32),
    },
  },
};

const victoryPose = keyframes([
  [0, { ...REST, lArm: [0.4, -0.6, -0.4], lFore: [0.6, 0.8, 0.1], lProp: 'upright', look: -0.25 }],
  [40, { look: -0.3 }],
  [50, { look: 0.2, lean: -0.05 }],
  [58, { rArm: [0.3, 1, 0.3], rFore: [0.2, 1, 0.15], lArm: IDLE.lArm, lFore: IDLE.lFore }],
  [64, { rArm: [0.6, -0.1, 0.6], rFore: [0.3, 0.9, 0.4] }],
  [70, { rArm: [0.3, 1, 0.3], rFore: [0.2, 1, 0.15] }],
  [90, { rArm: [0, 0.2, 1], rFore: [0, 1, 0.35], lArm: [0, 0.2, -1], lFore: [0, 1, -0.35], look: 0.1, lean: -0.05 }],
]);
