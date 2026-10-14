import { keyframes } from '../poses.js';
import { REST as GUARD_REST, GRABS } from '../moves.js';

// Eli: chronically online. Built like Velma from MultiVersus: he shouts
// speech bubbles (TikTok brainrot) for his neutral special, charges up a
// sprint (the Griddy) for his side special, spills something on the floor
// and jumps off it for his up special, and builds up a meter by landing his
// specials. Velma collects evidence until a van comes to take someone away;
// Eli builds clout until he can call the FBI.
// Frame data format: see src/moves.js. Poses: see src/poses.js.

// Neutral special: one bubble per press, in this order. Each flies its own way.
const PHRASES = [
  // Fast and straight.
  { text: 'NEEGY', color: '#ff2d6f', speed: 14, life: 50, r: 0.36, dmg: 5, base: 4.5, growth: 0.35, angle: 30 },
  // Big, slow and lingering: hits a few times.
  { text: 'GUCCI MORTY', color: '#2bd96b', speed: 4.5, drag: 0.012, life: 120, r: 0.62, pierce: true, hitEvery: 20, dmg: 2.5, base: 3.5, growth: 0.12, angle: 55 },
  // Short range, but it bonks.
  { text: 'KIRK', color: '#ffb31f', speed: 9.5, drag: 0.07, life: 38, r: 0.55, dmg: 9, base: 7.5, growth: 0.8, angle: 40 },
  // Wobbles up and down on its way.
  { text: 'FUNKY EHH', color: '#a259ff', speed: 8, life: 85, r: 0.45, dmg: 6, base: 5.5, growth: 0.5, angle: 60, update: (p) => { p.y = p.baseY + Math.sin(p.age * 0.18) * 0.7; } },
];

// Words that float up off his phone while he doomscrolls.
const SCROLL_WORDS = ['skibidi', 'rizz', 'gyatt', 'fanum tax', 'mewing', 'ohio', 'sigma', 'aura +1000', 'NEEGY', 'delulu'];

const CLOUT_BUBBLE = 15; // clout per bubble hit
const CLOUT_SPECIAL = 12; // ...per Griddy hit
const CLOUT_SCROLL = 0.55; // ...per frame of doomscrolling

function gainClout(f, amount, world) {
  const st = f.charState;
  const before = st.clout ?? 0;
  st.clout = Math.min(100, before + amount);
  if (before < 100 && st.clout >= 100) world.effects.text(f.x, f.y + f.h + 0.9, 'WENT VIRAL', '#25f4ee', 0.5, 1.2);
}

const clout = (f) => f.charState.clout ?? 0;

// Phone held up in his right hand (screen lit), left fist up.
const IDLE = { rArm: [0.3, -1, 0.35], rFore: [0.8, 0.75, -0.1], lArm: [0.2, -1, -0.3], lFore: [0.9, 0.7, -0.1] };
const REST = { ...GUARD_REST, ...IDLE, glow: 0.15 };
const STAND = { rThigh: REST.rThigh, rShin: REST.rShin, lThigh: REST.lThigh, lShin: REST.lShin, crouch: 0 };
const CROUCH_LEGS = { rThigh: [0.75, -0.65, 0.15], rShin: [-0.45, -0.9, 0.1], lThigh: [0.55, -0.8, -0.15], lShin: [-0.55, -0.85, -0.1] };

// The Griddy: heel taps and swinging arms. `phase` drives the step.
function griddy(phase, lean = 0.35) {
  const s = Math.sin(phase);
  const up = Math.max(0, s);
  const down = Math.max(0, -s);
  return {
    lean, crouch: 0.45, look: 0.1,
    rArm: [0.65 * s, -0.8, 0.35], rFore: [0.3 + 0.8 * s, -0.35, 0.3],
    lArm: [-0.65 * s, -0.8, -0.35], lFore: [0.3 - 0.8 * s, -0.35, -0.3],
    rThigh: [0.35 + 0.35 * up, -0.9, 0.15], rShin: [0.7 * up - 0.15, -1, 0.1],
    lThigh: [0.35 + 0.35 * down, -0.9, -0.15], lShin: [0.7 * down - 0.15, -1, -0.1],
  };
}

const GRIDDY_HOLD = 8; // frame the charge holds on
const GRIDDY_MAX = 50; // frames of charge for the strongest sprint
const GRIDDY_STRONG = 30; // charge needed for the strong hitbox
const GRIDDY_END = 26; // last sprinting frame

const SCROLL_HOLD = 8;
const SCROLL_MAX = 180;

// The van Eli calls in when he's gone viral. Drives in from behind him.
const FBI_VAN = {
  look: 'prop', prop: 'fbiVan', drive: true, gravity: 0, ride: 1.0, x: -12, y: 0, speed: 26, vy: 0, life: 90,
  r: 1.3, pierce: true, hitEvery: 999, dmg: 16, base: 9.5, growth: 1.15, angle: 35,
  onHit(p, victim, world) {
    world.effects.text(victim.x, victim.y + victim.h + 0.5, 'OPEN UP!', '#ffd400', 0.55, 1.0);
  },
};

const PRIME_PUDDLE = {
  look: 'puddle', color: 0x3df5ff, x: 0.3, y: 0, speed: 0, life: 300, r: 1.3, flat: true,
  pierce: true, hitEvery: 15, dmg: 1, noKnockback: true, slow: 25, unique: 'prime',
  // Standing in it for a second gets you stuck to the floor for a moment.
  onHit(p, v, world) {
    p.stuck ??= new Map();
    const s = p.stuck.get(v);
    const n = s && p.age - s.at < 20 ? s.n + 1 : 1;
    p.stuck.set(v, { n, at: p.age });
    if (n < 4 || !v.grounded || v.hitstun > 0 || v.heldBy || v.holding) return;
    p.stuck.set(v, { n: 0, at: p.age });
    v.interruptMove(world);
    v.hitstun = 50;
    v.vx = v.kbx = 0;
    world.effects.text(v.x, v.y + v.h + 0.4, 'STUCK!', '#3df5ff', 0.45, 0.9);
    gainClout(p.owner, 10, world);
  },
};

export const ELI = {
  id: 'eli',
  name: 'Eli',
  tagline: 'Chronically online. Fluent in brainrot.',
  color: 0x25f4ee,
  model: 'models/eli.glb',
  props: { right: 'phone' },
  stats: { weight: 92, runSpeed: 8.3, airSpeed: 6.5, jump: 15.5, gravity: 41, maxFall: 15, power: 0.98, scale: 1.0 },

  // HUD: the next phrase and his clout.
  hud: (f) => `💬${PHRASES[f.charState.phrase ?? 0].text} ${clout(f) >= 100 ? '📈VIRAL' : `📈${Math.floor(clout(f))}%`}`,

  poses: {
    base: { glow: 0.15 },
    idle: IDLE,
    crouch: { rArm: [0.3, -1, 0.35], rFore: [0.7, 0.6, 0.1], lArm: [0.2, -1, -0.3], lFore: [1, 0.5, -0.1] },
  },

  // CPU habits: call the van when it's ready, scroll from far away, shout from mid range.
  cpu(f, { dist, dx, dy }) {
    if (f.grounded && clout(f) >= 100 && Math.abs(dy) < 1) return { special: true, y: -1, face: true };
    if (f.grounded && dist > 7 && clout(f) < 100 && Math.random() < 0.02) return { special: true, y: -1 };
    if (dist > 3 && dist < 9 && Math.abs(dy) < 1.5 && Math.random() < 0.04) return { special: true, face: true };
    if (f.grounded && dist > 2.5 && dist < 6 && Math.abs(dy) < 1 && Math.random() < 0.02) return { special: true, x: Math.sign(dx) };
    return null;
  },

  // Victory: hits the Griddy, then holds a dab while brainrot pops up around him.
  victory: {
    quote: 'Funky ehh. That\'s a W.',
    pose(frame) {
      if (frame < 90) return griddy(frame * 0.35, 0.2);
      if (frame < 100) return { ...REST, ...STAND, crouch: 0.3 };
      return {
        ...STAND, rArm: [0.5, 0.85, 0.15], rFore: [0.5, 0.85, 0.15],
        lArm: [0.75, 0.4, 0.4], lFore: [-0.2, 0.3, 1], look: -0.45, lean: 0.15,
      };
    },
    onFrame(frame, { effects, x, y }) {
      const i = Math.floor(frame / 28);
      if (frame % 28 === 10 && i < 8) {
        const p = PHRASES[i % PHRASES.length];
        const [bx, by] = [[1.2, 0.9], [1.45, 1.35], [-1.15, 1.2]][i % 3];
        effects.popBubble(x + bx, y + by, p.text, p.color, 0.2, 1.1);
      }
    },
  },

  moves: {
    // ---- Ground ----

    // JAB - Phone Smack: backhand with the phone, a left slap, then a selfie
    // with the flash on, right in their face. Keep tapping attack.
    jab: {
      total: 16, limb: 'arm', combo: { next: 'jab2', from: 5 },
      onStart(f) { if (f.grounded) f.vx = 3.5 * f.facing; },
      hitboxes: [
        { start: 2, end: 4, x: 1.05, y: 1.4, r: 0.48, dmg: 2.5, base: 3.5, growth: 0.08, angle: 35 },
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
      onStart(f) { if (f.grounded) f.vx = 3.5 * f.facing; },
      hitboxes: [
        { start: 3, end: 5, x: 1.1, y: 1.38, r: 0.5, dmg: 2.5, base: 4, growth: 0.12, angle: 40 },
        { start: 3, end: 5, x: 0.45, y: 1.33, r: 0.4, dmg: 2.5, base: 4, growth: 0.12, angle: 40 },
      ],
      pose: keyframes([
        [0, { ...REST, rArm: [1, -0.05, 0.25], rFore: [1, 0, 0.05], lean: 0.3 }],
        [3, { lArm: [1, -0.05, -0.25], lFore: [1, 0, -0.05], rArm: IDLE.rArm, rFore: IDLE.rFore, lean: 0.35 }],
        [7, {}],
        [15, { lArm: IDLE.lArm, lFore: IDLE.lFore, lean: 0.05 }],
      ]),
    },
    jab3: {
      total: 30, limb: 'arm',
      onFrame(f, frame, input, world) {
        if (frame !== 8) return;
        world.effects.flash(f.x + 1.25 * f.facing * f.stats.scale, f.y + 1.5 * f.stats.scale, 1.3);
        world.effects.text(f.x + 1.2 * f.facing, f.y + f.h + 0.3, 'SNAP!', '#ffffff', 0.4, 0.6);
      },
      hitboxes: [
        { start: 8, end: 10, x: 1.25, y: 1.5, r: 0.6, dmg: 5, base: 7.5, growth: 0.6, angle: 40 },
        { start: 8, end: 10, x: 0.6, y: 1.45, r: 0.42, dmg: 4, base: 7, growth: 0.55, angle: 40 },
      ],
      pose: keyframes([
        [0, { ...REST, lArm: [1, -0.05, -0.25], lFore: [1, 0, -0.05] }],
        [5, { rArm: [0.9, 0.15, 0.3], rFore: [1, 0.25, 0.1], lArm: IDLE.lArm, lFore: IDLE.lFore, lean: 0.1, glow: 0.4 }],
        [8, { rArm: [1, 0.1, 0.2], rFore: [1, 0.1, 0.05], lean: 0.3, glow: 1 }],
        [12, { glow: 0.15 }],
        [26, REST],
      ]),
    },

    // FORWARD TILT - Hit the Woah: winds an arm up and snaps it down and across
    // into the Woah, leaning into it.
    ftilt: {
      total: 28, limb: 'arm',
      hitboxes: [
        { start: 7, end: 10, path: [[7, 0.6, 1.75], [10, 1.15, 1.2]], r: 0.52, dmg: 10, base: 7.5, growth: 0.95, angle: 38 },
        { start: 7, end: 9, x: 0.5, y: 1.3, r: 0.42, dmg: 8, base: 6.5, growth: 0.8, angle: 38 },
      ],
      pose: keyframes([
        [0, REST],
        [4, { rArm: [-0.2, 0.5, 0.8], rFore: [0.3, 0.9, 0.4], lArm: [-0.3, -0.6, -0.7], lean: -0.1, look: 0.1 }],
        [7, { rArm: [0.8, 0.45, 0.35], rFore: [0.9, 0.3, 0.1], lean: 0.15 }],
        [10, { rArm: [0.9, -0.4, 0.2], rFore: [0.95, -0.3, 0.05], lArm: [0.4, -0.9, -0.3], lFore: [0.6, -0.5, -0.2], lean: 0.45, crouch: 0.35, look: -0.1 }],
        [16, {}],
        [24, { ...REST }],
      ]),
    },

    // UP TILT - Dab: stretches one arm up and out and buries his face in the
    // other elbow. The stretched arm hits above him.
    utilt: {
      total: 26, limb: 'arm',
      hitboxes: [
        { start: 5, end: 11, x: 0.55, y: 2.2, r: 0.55, dmg: 8, base: 8, growth: 0.9, angle: 85 },
        { start: 5, end: 9, x: 0.2, y: 1.7, r: 0.45, dmg: 8, base: 8, growth: 0.9, angle: 85 },
      ],
      pose: keyframes([
        [0, REST],
        [3, { crouch: 0.4, rArm: [0.3, -0.9, 0.4], rFore: [0.5, -0.6, 0.3], lean: 0.1 }],
        [5, {
          crouch: 0, rArm: [0.5, 0.85, 0.15], rFore: [0.5, 0.85, 0.15],
          lArm: [0.75, 0.4, 0.4], lFore: [-0.2, 0.3, 1], look: -0.45, lean: 0.15,
        }],
        [13, {}],
        [22, REST],
      ]),
    },

    // DOWN TILT - Fanum Tax: crouches and swipes low, taking a cut of whatever
    // they've got. (Jacoby: he really takes your snack.)
    dtilt: {
      total: 22, limb: 'arm',
      onHit(f, victim, world) {
        world.effects.text(victim.x, victim.y + victim.h + 0.3, 'FANUM TAX', '#ffd23f', 0.42, 0.8);
        if (victim.charState.snack) {
          victim.charState.snack = null;
          f.heal(2, world);
        }
      },
      hitboxes: [
        { start: 6, end: 9, x: 1.1, y: 0.4, r: 0.5, dmg: 7, base: 6, growth: 0.6, angle: 75 },
        { start: 6, end: 9, x: 0.55, y: 0.45, r: 0.42, dmg: 6, base: 6, growth: 0.55, angle: 75 },
      ],
      pose: keyframes([
        [0, REST],
        [3, { ...CROUCH_LEGS, crouch: 1, lean: 0.5, lArm: [0.4, -0.8, -0.5], lFore: [0.2, -1, -0.4] }],
        [6, { lArm: [0.9, -0.45, -0.2], lFore: [1, -0.35, 0.05], lean: 0.6 }],
        [10, {}],
        [19, { ...REST, ...STAND }],
      ]),
    },

    // ---- Air ----

    // NEUTRAL AIR - Floss: flosses in midair. Two hits that hold them in, then
    // a third that launches.
    nair: {
      total: 34, limb: 'spin', aerial: true, landingLag: 7,
      hitboxes: [
        { start: 5, end: 8, x: 0, y: 1.0, r: 0.95, dmg: 3, base: 4, growth: 0.08, angle: 70, group: 0 },
        { start: 11, end: 14, x: 0, y: 1.0, r: 0.95, dmg: 3, base: 4, growth: 0.08, angle: 70, group: 1 },
        { start: 17, end: 21, x: 0, y: 1.0, r: 1.0, dmg: 5, base: 7, growth: 0.8, angle: 50, group: 2 },
      ],
      pose: keyframes([
        [0, { ...REST, spin: 0 }],
        [4, { rArm: [0.55, -0.85, 0.25], rFore: [0.55, -0.85, 0.25], lArm: [0.55, -0.85, -0.25], lFore: [0.55, -0.85, -0.25], spin: 0.45, rThigh: [0.3, -1, 0.2], lThigh: [-0.2, -1, -0.2] }],
        [7, { rArm: [-0.55, -0.85, 0.25], rFore: [-0.55, -0.85, 0.25], lArm: [-0.55, -0.85, -0.25], lFore: [-0.55, -0.85, -0.25], spin: -0.45, rThigh: [-0.2, -1, 0.2], lThigh: [0.3, -1, -0.2] }],
        [10, { rArm: [0.55, -0.85, 0.25], rFore: [0.55, -0.85, 0.25], lArm: [0.55, -0.85, -0.25], lFore: [0.55, -0.85, -0.25], spin: 0.45, rThigh: [0.3, -1, 0.2], lThigh: [-0.2, -1, -0.2] }],
        [13, { rArm: [-0.55, -0.85, 0.25], rFore: [-0.55, -0.85, 0.25], lArm: [-0.55, -0.85, -0.25], lFore: [-0.55, -0.85, -0.25], spin: -0.45, rThigh: [-0.2, -1, 0.2], lThigh: [0.3, -1, -0.2] }],
        [16, { rArm: [0.55, -0.85, 0.25], rFore: [0.55, -0.85, 0.25], lArm: [0.55, -0.85, -0.25], lFore: [0.55, -0.85, -0.25], spin: 0.45, rThigh: [0.3, -1, 0.2], lThigh: [-0.2, -1, -0.2] }],
        [19, { rArm: [-0.4, -0.5, 0.9], rFore: [-0.3, -0.3, 1], lArm: [-0.4, -0.5, -0.9], lFore: [-0.3, -0.3, -1], spin: 0 }],
        [30, { ...REST, spin: 0 }],
      ]),
    },

    // FORWARD AIR - Swipe Up: swipes up like he's skipping a TikTok. Launches up and away.
    fair: {
      total: 32, limb: 'arm', aerial: true, landingLag: 11,
      hitboxes: [
        { start: 7, end: 11, path: [[7, 0.95, 0.85], [9, 1.1, 1.45], [11, 0.75, 2.05]], r: 0.55, dmg: 10, base: 7, growth: 0.9, angle: 65 },
        { start: 7, end: 10, x: 0.45, y: 1.35, r: 0.42, dmg: 8, base: 6.5, growth: 0.8, angle: 65 },
      ],
      pose: keyframes([
        [0, REST],
        [4, { rArm: [0.6, -0.8, 0.3], rFore: [0.8, -0.6, 0.2], lean: 0.2, glow: 0.6 }],
        [7, { rArm: [0.85, -0.5, 0.2], rFore: [1, -0.3, 0.1] }],
        [9, { rArm: [1, 0.05, 0.2], rFore: [1, 0.25, 0.1], lean: 0.1 }],
        [11, { rArm: [0.6, 0.8, 0.2], rFore: [0.45, 0.9, 0.1], lean: -0.1, look: 0.3, glow: 0.15 }],
        [15, {}],
        [28, REST],
      ]),
    },

    // BACK AIR - Mule Kick: both feet straight back. His strongest aerial.
    bair: {
      total: 30, limb: 'leg', aerial: true, landingLag: 10,
      hitboxes: [
        { start: 7, end: 10, x: -1.05, y: 0.85, r: 0.55, dmg: 13, base: 8, growth: 1.05, angle: 145 },
        { start: 7, end: 10, x: -0.5, y: 0.9, r: 0.42, dmg: 9, base: 6, growth: 0.8, angle: 145 },
      ],
      pose: keyframes([
        [0, REST],
        [4, { rThigh: [0.6, -0.6, 0.12], rShin: [-0.6, -0.7, 0.1], lThigh: [0.6, -0.6, -0.12], lShin: [-0.6, -0.7, -0.1], lean: 0.3 }],
        [7, {
          rThigh: [-1, -0.15, 0.12], rShin: [-1, -0.1, 0.1], lThigh: [-1, -0.25, -0.12], lShin: [-1, -0.2, -0.1],
          lean: 0.7, look: -0.2, rArm: [0.8, -0.5, 0.3], rFore: [0.9, -0.2, 0.1], lArm: [0.8, -0.5, -0.3], lFore: [0.9, -0.2, -0.1],
        }],
        [11, {}],
        [26, REST],
      ]),
    },

    // UP AIR - Selfie Stick: shoots a selfie stick straight up. The flash goes off at the top.
    uair: {
      total: 30, limb: 'arm', aerial: true, landingLag: 8,
      onFrame(f, frame, input, world) {
        if (frame === 9) world.effects.flash(f.x + 0.3 * f.facing * f.stats.scale, f.y + 3.0 * f.stats.scale, 0.9);
      },
      hitboxes: [
        { start: 6, end: 12, x: 0.35, y: 2.95, r: 0.55, dmg: 9, base: 7, growth: 0.95, angle: 88 },
        { start: 6, end: 12, x: 0.3, y: 2.25, r: 0.45, dmg: 8, base: 7, growth: 0.9, angle: 85 },
      ],
      pose(frame, f) {
        const p = { ...uairPose(frame) };
        if (frame >= 3 && frame <= 20) p.rHeld = 'selfieStick';
        return p;
      },
    },

    // DOWN AIR - Sigma Stomp: arms folded, stomps straight down. Spikes early.
    dair: {
      total: 40, limb: 'leg', aerial: true, landingLag: 14,
      onFrame(f, frame, input, world) {
        if (frame === 11) world.effects.text(f.x, f.y - 0.2, 'SIGMA', '#b0b8ff', 0.35, 0.6);
      },
      hitboxes: [
        { start: 11, end: 14, x: 0.1, y: -0.1, r: 0.6, dmg: 12, base: 6, growth: 0.9, angle: -80 },
        { start: 15, end: 20, x: 0.1, y: 0.15, r: 0.5, dmg: 7, base: 6, growth: 0.7, angle: 60 },
      ],
      pose: keyframes([
        [0, REST],
        [7, {
          rThigh: [0.8, -0.2, 0.15], rShin: [-0.3, -1, 0.1], lThigh: [0.8, -0.2, -0.15], lShin: [-0.3, -1, -0.1],
          rArm: [0.5, -0.7, 0.5], rFore: [0.1, 0.1, -1], lArm: [0.5, -0.6, -0.5], lFore: [0.1, 0.2, 1], look: 0.2,
        }],
        [11, { rThigh: [0.1, -1, 0.15], rShin: [0.05, -1, 0.1], lThigh: [0.05, -1, -0.15], lShin: [0, -1, -0.1], look: -0.1 }],
        [18, {}],
        [34, REST],
      ]),
    },

    // ---- Throws (the rest are the shared ones) ----

    // UP THROW - Yeet.
    uthrow: {
      ...GRABS.uthrow,
      onFrame(f, frame, input, world) {
        if (frame === 12) world.effects.text(f.x, f.y + f.h + 1.2, 'YEET', '#25f4ee', 0.55, 0.8);
      },
    },

    // ---- Specials ----

    // NEUTRAL SPECIAL - Brainrot: cups a hand to his mouth and shouts a speech
    // bubble: NEEGY (fast), GUCCI MORTY (big, slow, hits a few times), KIRK
    // (short, bonks hard), FUNKY EHH (wobbles), in that order. Bubble hits build clout.
    nspecial: {
      total: 30, limb: 'arm',
      onFrame(f, frame, input, world) {
        if (frame !== 11) return;
        const st = f.charState;
        const i = st.phrase ?? 0;
        st.phrase = (i + 1) % PHRASES.length;
        world.spawnProjectile(f, {
          look: 'bubble', x: 0.75, y: 1.85, ...PHRASES[i],
          onHit: (p, v, w) => gainClout(p.owner, CLOUT_BUBBLE, w),
        });
      },
      hitboxes: [],
      pose: keyframes([
        [0, REST],
        [6, { lArm: [0.45, -0.75, -0.3], lFore: 'mouth', lean: -0.1, look: 0.2 }],
        [11, { lean: 0.3, look: 0.05 }],
        [16, {}],
        [26, REST],
      ]),
    },

    // SIDE SPECIAL - Hit the Griddy: hold the button to hype it up (doing the
    // Griddy in place), let go to griddy across the stage into them. Charge
    // past halfway for the strong version. Good clout.
    sspecial: {
      total: 44, limb: 'arm', scripted: true, landingLag: 12,
      onStart(f) { f.move.charge = 0; },
      onFrame(f, frame, input, world) {
        const m = f.move;
        if (frame < GRIDDY_HOLD) {
          f.vx *= 0.8;
          if (!f.grounded) f.vy = Math.max(f.vy, -2);
          return;
        }
        if (frame === GRIDDY_HOLD && !m.go) {
          if (input.specialHeld && m.charge < GRIDDY_MAX) {
            m.charge++;
            m.frame--; // keep hyping it up while the button is held
            f.vx *= 0.8;
            if (!f.grounded) f.vy = Math.max(f.vy - 0.3, -2);
            return;
          }
          m.go = true;
          if (m.charge >= GRIDDY_STRONG) world.effects.text(f.x, f.y + f.h + 0.6, 'HIT THE GRIDDY', '#25f4ee', 0.4, 0.8);
        }
        if (frame <= GRIDDY_END) {
          f.vx = (9 + 7 * (m.charge / GRIDDY_MAX)) * f.facing;
          if (!f.grounded) f.vy = Math.max(f.vy, -1);
        } else {
          f.vx *= 0.85;
        }
      },
      onHit(f, victim, world) { gainClout(f, CLOUT_SPECIAL, world); },
      hitboxes: [
        { start: 9, end: GRIDDY_END, x: 0.75, y: 1.0, r: 0.6, dmg: 13, base: 8.5, growth: 1.0, angle: 38, when: (f) => f.move.charge >= GRIDDY_STRONG },
        { start: 9, end: GRIDDY_END, x: 0.75, y: 1.0, r: 0.55, dmg: 8, base: 6.5, growth: 0.65, angle: 38, when: (f) => f.move.charge < GRIDDY_STRONG },
      ],
      pose(frame, f) {
        const m = f.move;
        if (frame > GRIDDY_END + 4) return REST;
        const sprint = Math.max(0, frame - GRIDDY_HOLD);
        return griddy((m.charge ?? 0) * 0.3 + sprint * 0.75, frame > GRIDDY_HOLD ? 0.5 : 0.3);
      },
    },

    // UP SPECIAL - Prime Time: spills a bottle of Prime on the floor and rides
    // the energy up. The puddle stays for a few seconds: it slows anyone in
    // it, and standing in it too long sticks them to the floor. No puddle in the air.
    uspecial: {
      total: 40, limb: 'arm', scripted: true, helplessAfter: true, landingLag: 16, ledgeGrab: true,
      onFrame(f, frame, input, world) {
        if (frame < 9) {
          f.vx *= 0.85;
          if (!f.grounded) f.vy = Math.max(f.vy, -1.5);
          if (frame === 6 && f.grounded) world.spawnProjectile(f, PRIME_PUDDLE);
          return;
        }
        if (frame === 9) world.effects.text(f.x, f.y + f.h + 0.5, 'PRIME TIME', '#3df5ff', 0.4, 0.7);
        if (frame <= 24) {
          f.grounded = false;
          f.platform = null;
          f.vy = 16.5;
          f.vx = (input.x || 0) * 4.2;
          if (frame % 2) world.effects.sparkle(f.x, f.y + 0.3, 0x3df5ff, 2, 0.5);
        }
      },
      hitboxes: [
        { start: 9, end: 14, x: 0.2, y: 1.2, r: 0.7, dmg: 6, base: 7, growth: 0.5, angle: 80, group: 0 },
        { start: 15, end: 22, x: 0.25, y: 2.0, r: 0.6, dmg: 5, base: 7.5, growth: 0.7, angle: 85, group: 1 },
      ],
      pose(frame) {
        const p = { ...primePose(frame) };
        if (frame >= 2 && frame < 9) p.lHeld = 'prime';
        return p;
      },
    },

    // DOWN SPECIAL - Doomscroll: stares at his phone for as long as you hold
    // the button, building clout. Wide open while he does it. Once he's gone
    // viral (100%), down special on the ground is FBI OPEN UP instead.
    dspecial: {
      total: SCROLL_HOLD + 16, limb: 'arm', scripted: true, landingLag: 6,
      available: (f) => !(clout(f) >= 100 && f.grounded),
      fallback: 'fbi',
      onStart(f) { f.move.scroll = 0; },
      onFrame(f, frame, input, world) {
        const m = f.move;
        f.vx *= 0.8;
        if (!f.grounded) f.vy = Math.max(f.vy - 0.3, -3); // can't stall forever in the air
        if (frame === SCROLL_HOLD && !m.done) {
          if (input.specialHeld && m.scroll < SCROLL_MAX) {
            m.scroll++;
            m.frame--;
            gainClout(f, CLOUT_SCROLL, world);
            if (m.scroll % 24 === 12) {
              const word = SCROLL_WORDS[Math.floor(Math.random() * SCROLL_WORDS.length)];
              world.effects.text(f.x + 0.4 * f.facing, f.y + f.h + 0.2, word, '#25f4ee', 0.28, 0.9);
            }
            return;
          }
          m.done = true;
        }
      },
      hitboxes: [],
      pose(frame, f) {
        const scrolling = f.move.scroll ?? 0;
        const thumb = Math.sin(scrolling * 0.5) * 0.15;
        const p = frame < SCROLL_HOLD
          ? { rArm: [0.35, -0.9, 0.25], rFore: [0.6, 0.8, -0.2], look: -0.2, glow: 0.6 }
          : { rArm: [0.4, -0.85, 0.2], rFore: [0.55 + thumb, 0.85, -0.25], lArm: [0.3, -0.9, -0.1], lFore: [0.6, 0.7, 0.35], look: -0.45, lean: 0.15, glow: 1 };
        return frame > SCROLL_HOLD + 6 ? { ...p, look: -0.1, glow: 0.3 } : p;
      },
    },

    // FBI OPEN UP: he makes a call, and an FBI van tears across the stage from
    // behind him, running over everyone in its path. Uses up all his clout.
    fbi: {
      total: 56, limb: 'arm',
      onFrame(f, frame, input, world) {
        if (frame === 6) world.effects.text(f.x, f.y + f.h + 0.4, '*ring ring*', '#ffffff', 0.35, 0.8);
        if (frame === 18) {
          f.charState.clout = 0;
          world.effects.text(f.x, f.y + f.h + 0.9, 'FBI OPEN UP!', '#ffd400', 0.7, 1.4);
          world.spawnProjectile(f, FBI_VAN);
          world.shake = 0.4;
        }
      },
      hitboxes: [],
      pose: keyframes([
        [0, REST],
        [6, { rArm: [0.25, -0.5, 0.75], rFore: 'mouth', look: 0.05, glow: 1 }],
        [18, { lArm: [1, 0.15, -0.3], lFore: [1, 0.2, -0.1], lean: 0.15, look: 0.1 }],
        [40, {}],
        [52, REST],
      ]),
    },
  },
};

const uairPose = keyframes([
  [0, REST],
  [4, { rArm: [0.4, 0.5, 0.3], rFore: [0.3, 0.9, 0.2] }],
  [6, { rArm: [0.12, 1, 0.25], rFore: [0.08, 1, 0.2], look: 0.5, lean: -0.1, glow: 1 }],
  [13, {}],
  [26, REST],
]);

const primePose = keyframes([
  [0, REST],
  [3, { lArm: [0.5, -0.7, -0.3], lFore: [0.7, 0.6, -0.2], lProp: 'upright' }],
  [6, { lFore: [0.6, -0.6, -0.3], look: -0.25 }],
  [9, {
    rArm: [0.2, 1, 0.4], rFore: [0.1, 1, 0.2], lArm: [0.2, 1, -0.4], lFore: [0.1, 1, -0.2], look: 0.4,
    rThigh: [0.4, -0.9, 0.15], rShin: [-0.3, -1, 0.1], lThigh: [0.1, -1, -0.15], lShin: [-0.2, -1, -0.1],
  }],
  [24, {}],
  [38, { rArm: [-0.1, 1, 0.5], rFore: [-0.1, 1, 0.3], lArm: [-0.1, 1, -0.5], lFore: [-0.1, 1, -0.3], look: 0.3 }],
]);
