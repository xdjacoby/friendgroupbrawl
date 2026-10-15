import { keyframes } from '../poses.js';
import { REST as GUARD_REST, GRABS } from '../moves.js';

// Eli: chronically online. Built like Velma from MultiVersus: he shouts
// speech bubbles (TikTok brainrot) for his neutral special, charges up a
// sprint (the Griddy) for his side special, rides a Subway Surfers
// hoverboard for his up special, and builds up a meter by landing his
// specials. Velma collects evidence until a van comes to take someone away;
// Eli builds clout until he can call the FBI.
// Frame data format: see src/moves.js. Poses: see src/poses.js.

// ---- Brainrot ----
// Every bubble that hits someone gives them a stack of brainrot (it wears off
// after a few seconds without a new one). Three stacks and they're
// BRAINROTTED: left and right swap for a couple of seconds.
// (Balance: it was 3 s of swapped controls that could be stacked right back
// up while it lasted; now 2 s, and no new stacks until it wears off.)
const ROT_STACKS = 3;
const ROT_FRAMES = 120; // how long the controls stay swapped
const ROT_KEEP = 360; // stacks wear off this long after the last one

function brainrot(v, eli, world) {
  if (v.confused > 0) return; // already brainrotted: let them get their bearings first
  const st = v.status;
  const prev = st.brainrot && world.frame - st.brainrot.at < ROT_KEEP ? st.brainrot.stacks : 0;
  const stacks = prev + 1;
  if (stacks >= ROT_STACKS) {
    st.brainrot = null;
    v.confused = ROT_FRAMES;
    world.effects.popBubble(v.x, v.y + v.h + 0.9, 'BRAINROTTED', '#a259ff', 0.45, 1.3);
    gainClout(eli, CLOUT_ROT, world);
    return;
  }
  st.brainrot = { stacks, at: world.frame };
  world.effects.text(v.x + 0.3, v.y + v.h + 0.35, `ROT ${stacks}/${ROT_STACKS}`, '#c08bff', 0.3, 0.7);
}

// Bubbles can be aimed: they carry on along vy (set when he shouts, from up/down held).
const drift = (p) => { p.y += p.vy / 60; };

// GUCCI MORTY swallows other people's shots (and clouds) that touch it.
function gucciEats(p, world) {
  drift(p);
  for (const q of world.liveProjectiles ?? []) {
    if (q === p || q.owner === p.owner || q.life <= 0 || q.hb.drive || q.hb.flat) continue;
    if (Math.hypot(q.x - p.x, q.y - p.y) > p.r + q.r * 0.7) continue;
    q.life = 0;
    world.effects.puff(q.x, q.y, 0.4, 0x2bd96b, 0.3);
    world.effects.text(p.x, p.y + p.r + 0.3, 'GUCCI\'D', '#2bd96b', 0.3, 0.6);
  }
}

// KIRK bursts into three little kirks when it ends (hit or not).
function kirkSplit(p, world) {
  const b = world.stage.blast;
  if (p.y < b.bottom || p.x < b.left || p.x > b.right || p.hb.mini) return;
  const dir = Math.sign(p.vx) || p.owner.facing;
  for (const a of [-0.6, 0, 0.6]) {
    const q = world.spawnProjectile(p.owner, MINI_KIRK);
    q.x = p.x;
    q.y = q.baseY = p.y;
    q.vx = Math.cos(a) * 9 * dir;
    q.vy = Math.sin(a) * 9;
  }
}
const MINI_KIRK = {
  look: 'bubble', text: 'kirk', color: '#ffb31f', speed: 0, life: 24, r: 0.26, dmg: 3, base: 4, growth: 0.2, angle: 50,
  mini: true, update: drift,
};

// FUNKY EHH wobbles out, then turns around and flies back to him like a
// boomerang (hitting again on the way back). He catches it.
function boomerang(p, world) {
  p.baseY += p.vy / 60;
  p.y = p.baseY + Math.sin(p.age * 0.18) * 0.55;
  if (p.age < 26) return;
  const o = p.owner;
  const dx = o.x - p.x;
  p.vx = Math.max(-11, Math.min(11, p.vx + Math.sign(dx) * 0.75));
  p.baseY += (o.y + 1.5 - p.baseY) * 0.04;
  if (p.age > 40 && Math.abs(dx) < 0.7 && Math.abs(o.y + 1.2 - p.y) < 1.2 && !o.dead) {
    p.life = 0;
    world.effects.sparkle(o.x, o.y + 1.4, 0xa259ff, 4, 0.5);
  }
}

// Neutral special: one bubble per press, in this order. Each one does its own thing.
const PHRASES = [
  // Fast and straight (about 9 m: no longer across the whole stage).
  { text: 'NEEGY', color: '#ff2d6f', speed: 13, life: 42, r: 0.36, dmg: 5, base: 4.5, growth: 0.35, angle: 30, update: drift },
  // Big, slow and lingering: hits a few times, and eats other people's projectiles.
  { text: 'GUCCI MORTY', color: '#2bd96b', speed: 4.5, drag: 0.012, life: 105, r: 0.62, pierce: true, hitEvery: 20, dmg: 2.5, base: 3.5, growth: 0.12, angle: 55, update: gucciEats },
  // Short range, but it bonks, then bursts into three little kirks.
  { text: 'KIRK', color: '#ffb31f', speed: 9.5, drag: 0.07, life: 34, r: 0.55, dmg: 8, base: 7.5, growth: 0.75, angle: 40, update: drift, onEnd: kirkSplit },
  // Wobbles out and boomerangs back.
  { text: 'FUNKY EHH', color: '#a259ff', speed: 9, life: 110, r: 0.45, pierce: true, hitEvery: 30, dmg: 5, base: 5, growth: 0.45, angle: 60, update: boomerang },
];

// Words that float up off his phone while he doomscrolls.
const SCROLL_WORDS = ['skibidi', 'rizz', 'gyatt', 'fanum tax', 'mewing', 'ohio', 'sigma', 'aura +1000', 'NEEGY', 'delulu'];

// The van is his big payoff, so it takes a while: about 8 bubble hits, or
// ~4 seconds of standing there doomscrolling (it used to come much sooner).
const CLOUT_BUBBLE = 9; // clout per bubble hit
const CLOUT_ROT = 10; // ...for brainrotting someone
const CLOUT_SPECIAL = 10; // ...per Griddy hit
const CLOUT_SCROLL = 0.45; // ...per frame of doomscrolling

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
  r: 1.3, pierce: true, hitEvery: 999, dmg: 15, base: 9.5, growth: 1.1, angle: 35,
  onHit(p, victim, world) {
    world.effects.text(victim.x, victim.y + victim.h + 0.5, 'OPEN UP!', '#ffd400', 0.55, 1.0);
  },
};

// Up special: the hoverboard ride.
const SURF_START = 7; // frame he takes off
const SURF_END = 33; // last frame of the ride
const SURF_SPEED = 11.5;
const SURF_TURN = 0.07; // radians per frame he can steer

// Never take off much downward (and always upward from the ground).
function takeoffAngle(a, grounded) {
  if (grounded) return a < 0 ? (Math.cos(a) >= 0 ? 0.35 : Math.PI - 0.35) : Math.max(0.35, Math.min(Math.PI - 0.35, a));
  if (a < -0.4 && a >= -Math.PI / 2) return -0.4;
  if (a < -Math.PI / 2 && a > -Math.PI + 0.4) return -Math.PI + 0.4;
  return a;
}

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
    // bubble, in this order: NEEGY (fast), GUCCI MORTY (big and slow, hits a
    // few times, eats other people's projectiles), KIRK (short, bonks hard,
    // bursts into three little kirks), FUNKY EHH (wobbles out and boomerangs
    // back). Hold up or down to aim it. Every hit builds clout and a stack of
    // brainrot: three stacks and their left and right swap for a few seconds.
    nspecial: {
      total: 38, limb: 'arm', // was 30: a bubble every half second was too easy to camp with
      onFrame(f, frame, input, world) {
        if (frame !== 11) return;
        const st = f.charState;
        const i = st.phrase ?? 0;
        st.phrase = (i + 1) % PHRASES.length;
        const def = PHRASES[i];
        const aim = input.y > 0.5 ? 1 : input.y < -0.5 ? -1 : 0;
        const rotted = new Set(); // one stack per bubble, however many times it hits
        world.spawnProjectile(f, {
          look: 'bubble', x: 0.75, y: 1.85, ...def, vy: aim * def.speed * 0.45,
          onHit: (p, v, w, result) => {
            if (p.owner !== f) return; // parried back at him: no clout for that
            gainClout(f, CLOUT_BUBBLE, w);
            if (result === 'hit' && !rotted.has(v)) {
              rotted.add(v);
              brainrot(v, f, w);
            }
          },
        });
      },
      hitboxes: [],
      pose: keyframes([
        [0, REST],
        [6, { lArm: [0.45, -0.75, -0.3], lFore: 'mouth', lean: -0.1, look: 0.2 }],
        [11, { lean: 0.3, look: 0.05 }],
        [20, {}],
        [34, REST],
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

    // UP SPECIAL - Subway Surfers: pulls out a hoverboard and surfs off in
    // whatever direction you hold (straight up if you don't), steering as he
    // goes, leaving a trail of coins. Hits on takeoff and along the way. His recovery.
    uspecial: {
      total: SURF_END + 14, limb: 'leg', scripted: true, helplessAfter: true, landingLag: 14, ledgeGrab: true,
      onStart(f) {
        f.move.dir = null;
        f.fastFalling = false;
      },
      onFrame(f, frame, input, world) {
        const m = f.move;
        if (frame < SURF_START) {
          f.vx *= 0.8;
          f.vy = Math.max(f.vy, 0) * 0.7;
          if (frame === 2) world.effects.text(f.x, f.y + f.h + 0.5, 'SUBWAY SURFERS', '#ffd23f', 0.36, 0.8);
          return;
        }
        if (!m.dir) {
          // Takeoff: the held direction (never much downward), or straight up.
          const len = Math.hypot(input.x, input.y);
          m.angle = takeoffAngle(len > 0.3 ? Math.atan2(input.y, input.x) : Math.PI / 2, f.grounded);
          m.dir = true;
          f.grounded = false;
          f.platform = null;
          world.effects.puff(f.x, f.y + 0.1, 0.5, 0x7ef9ff, 0);
        }
        if (frame <= SURF_END) {
          // Steer toward the stick a little each frame.
          if (Math.hypot(input.x, input.y) > 0.3) {
            const want = Math.atan2(input.y, input.x);
            let d = want - m.angle;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            m.angle += Math.max(-SURF_TURN, Math.min(SURF_TURN, d));
          }
          const cx = Math.cos(m.angle);
          if (Math.abs(cx) > 0.25) f.facing = Math.sign(cx);
          f.vx = cx * SURF_SPEED;
          f.vy = Math.sin(m.angle) * SURF_SPEED;
          if (frame % 2) world.effects.sparkle(f.x - cx * 0.6, f.y - Math.sin(m.angle) * 0.6, 0xffd23f, 2, 0.35);
        } else {
          f.vx *= 0.9;
          f.vy = Math.max(f.vy - 0.9, -8);
        }
      },
      hitboxes: [
        { start: SURF_START, end: SURF_START + 6, x: 0.3, y: 0.4, r: 0.75, dmg: 8, base: 7.5, growth: 0.65, angle: 70, group: 0 },
        { start: SURF_START + 7, end: SURF_END, x: 0.35, y: 0.3, r: 0.6, dmg: 4, base: 6, growth: 0.45, angle: 60, group: 1 },
      ],
      pose(frame, f) {
        const m = f.move;
        const p = { ...surfPose(frame) };
        if (frame >= 3 && frame <= SURF_END + 4) {
          p.mount = 'hoverboard';
          // Tip the board (and him) with the way he's flying.
          if (m.angle !== undefined && frame >= SURF_START) {
            const fwd = Math.cos(m.angle) * f.facing;
            p.pitch = Math.max(-0.5, Math.min(0.75, Math.atan2(Math.sin(m.angle), Math.abs(fwd) + 0.35) * 0.6));
          }
        }
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
      total: 64, limb: 'arm',
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
        [46, {}],
        [60, REST],
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

// Surfing stance on the board: knees bent, feet apart, arms out for balance.
const SURF = {
  rThigh: [0.55, -0.85, 0.12], rShin: [-0.1, -1, 0.1], lThigh: [-0.45, -0.9, -0.12], lShin: [-0.35, -0.95, -0.1],
  rArm: [0.55, -0.15, 0.85], rFore: [0.6, 0.15, 0.75], lArm: [-0.6, -0.1, -0.8], lFore: [-0.7, 0.2, -0.6],
  crouch: 0.55, lean: 0.25, look: 0.1, rProp: 'club', rHand: 'grip', lHand: 'open',
};
const surfPose = keyframes([
  [0, REST],
  [4, { ...SURF, crouch: 0.9, lean: 0.4 }],
  [SURF_START, SURF],
  [SURF_END, {}],
  [SURF_END + 8, { rArm: [-0.1, 1, 0.5], rFore: [-0.1, 1, 0.3], lArm: [-0.1, 1, -0.5], lFore: [-0.1, 1, -0.3], look: 0.3, crouch: 0, lean: 0 }],
]);
