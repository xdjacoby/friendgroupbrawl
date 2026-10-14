import { keyframes } from '../poses.js';
import { REST as GUARD_REST } from '../moves.js';

// Draven: dab pen in his left hand, a big empty bong in his right.
// His normals swing, thrust and golf with the bong (a long, disjointed reach)
// or poke and puff with the pen, and all four specials are built around the
// pen or the bong. Frame data format: see src/moves.js. Poses: see src/poses.js.
//
// Bong reach: with the arm straight, the base sits ~1.3m from his shoulder
// (shoulder ~1.45m up), so hitbox paths trace that arc.

// Lift the left hand (dab pen) to his mouth.
const PEN_TO_MOUTH = { lArm: [0.45, -0.75, -0.3], lFore: 'mouth' };
// Lift the bong upright with the mouthpiece at his mouth.
const BONG_TO_MOUTH = { rArm: [0.55, -0.6, 0.35], rFore: 'mouth', rProp: 'upright' };

// Bong hanging from his right hand, pen held up in his left.
const IDLE = { rArm: [0.05, -1, 0.3], rFore: [0.5, -1, 0.15], lArm: [0.25, -1, -0.3], lFore: [1, 0.75, -0.15] };
const REST = { ...GUARD_REST, ...IDLE, glow: 0 };
const ARMS = { rArm: IDLE.rArm, rFore: IDLE.rFore, lArm: IDLE.lArm, lFore: IDLE.lFore };
const LEGS = { rThigh: REST.rThigh, rShin: REST.rShin, lThigh: REST.lThigh, lShin: REST.lShin };
const PUFF = 0xeeeef6;

// Hotbox: hold the special button to keep ripping (charge, in frames, up to
// HOTBOX_CHARGE); the cloud's size and how long it lingers grow with it.
const HOTBOX_RIP = 10; // bong reaches his mouth; charging starts
const HOTBOX_CHARGE = 120;
const liftBong = keyframes([[0, REST], [6, BONG_TO_MOUTH]]);
const HOTBOX_CLOUD = {
  look: 'cloud', color: 0xd6ebcf, opacity: 0.3, squash: 0.7, x: 0.6, y: 1.2,
  drag: 0.04, grow: 4, pierce: true, hitEvery: 15, dmg: 0.8, noKnockback: true, slow: 20, unique: 'hotbox',
};

export const DRAVEN = {
  id: 'draven',
  name: 'Draven',
  tagline: 'Dab pen + a big empty bong',
  color: 0x8e44ad,
  model: 'models/draven.glb',
  props: { right: 'bong', left: 'dabPen' },
  stats: { weight: 108, runSpeed: 7.5, airSpeed: 6, jump: 14.5, gravity: 36, maxFall: 13, power: 1.05, scale: 1.0 },

  // Victory: one enormous rip from the bong, a cloud you could lose a car in,
  // then the bong held up like a trophy.
  victory: {
    quote: 'Puff, puff... nah. Not passing.',
    pose: keyframes([
      [0, REST],
      [14, { ...BONG_TO_MOUTH, look: 0.1 }],
      [50, { look: 0.3, lean: -0.15 }],
      [58, { rArm: [0.3, -0.9, 0.35], rFore: [0.5, -0.8, 0.2], rProp: 'club', look: 0.65, lean: -0.25 }],
      [92, { look: 0.5, lean: -0.2 }],
      [104, { rArm: [0.2, 1, 0.3], rFore: [0.1, 1, 0.2], lArm: [0.3, 0.6, -0.6], lFore: [0.5, 0.8, -0.2], look: 0.2, lean: 0, glow: 1 }],
    ]),
    onFrame(frame, { effects, x, y }) {
      if (frame >= 20 && frame < 50 && frame % 6 === 0) effects.puff(x + 0.4, y + 0.95, 0.15, 0xd6ebcf, 0.8);
      if (frame >= 58 && frame < 96 && frame % 3 === 0) effects.puff(x + 0.25 + (Math.random() - 0.5) * 0.8, y + 1.8, 0.3 + (frame - 58) / 110, 0xeeeef6, 1.0);
    },
  },

  // Resting with the bong hanging from his right hand and the pen held up in his left.
  poses: {
    idle: IDLE,
    crouch: { rArm: [0.2, -1, 0.35], rFore: [0.4, -1, 0.15], lArm: [0.25, -1, -0.3], lFore: [1, 0.75, -0.15] },
  },

  moves: {
    // ---- Ground ----

    // JAB - Puff, Puff, Pass: pen poke, bong backhand, then a bong thrust.
    // Tap attack to keep the combo going.
    jab: {
      total: 16, limb: 'arm', combo: { next: 'jab2', from: 5 },
      onStart(f) { if (f.grounded) f.vx = 3.5 * f.facing; }, // steps into the poke
      hitboxes: [
        { start: 2, end: 4, x: 1.1, y: 1.42, r: 0.48, dmg: 2.5, base: 3.5, growth: 0.08, angle: 35 },
        { start: 2, end: 4, x: 0.45, y: 1.35, r: 0.4, dmg: 2.5, base: 3.5, growth: 0.08, angle: 35 },
      ],
      pose: keyframes([
        [0, REST],
        [2, { lArm: [1, -0.05, -0.15], lFore: [1, 0.05, -0.05], lean: 0.3, glow: 1 }],
        [6, {}],
        [12, { lArm: IDLE.lArm, lFore: IDLE.lFore, lean: 0.05, glow: 0 }],
      ]),
    },
    jab2: {
      total: 20, limb: 'arm', combo: { next: 'jab3', from: 8 },
      hitboxes: [
        { start: 4, end: 6, path: [[4, 0.75, 1.0], [5, 1.2, 1.05], [6, 1.05, 1.05]], r: 0.5, dmg: 3, base: 4, growth: 0.15, angle: 35 },
        { start: 4, end: 6, x: 0.45, y: 1.2, r: 0.4, dmg: 3, base: 4, growth: 0.15, angle: 35 },
      ],
      pose: keyframes([
        [0, { ...REST, lArm: [1, -0.05, -0.15], lFore: [1, 0.05, -0.05], lean: 0.15 }],
        [2, { rArm: [-0.2, -0.7, 0.7], rFore: [-0.1, -0.4, 0.9], lean: 0 }],
        [5, { rArm: [0.9, -0.35, 0.35], rFore: [1, -0.25, 0.1], lArm: IDLE.lArm, lFore: IDLE.lFore, lean: 0.2 }],
        [7, { rArm: [0.8, -0.3, -0.3], rFore: [0.6, -0.2, -0.75] }],
        [16, { ...ARMS, lean: 0.05 }],
      ]),
    },
    jab3: {
      total: 28, limb: 'arm',
      onFrame(f, frame, input, world) {
        if (frame === 7) world.effects.puff(f.x + 1.45 * f.facing * f.stats.scale, f.y + 1.2, 0.5, PUFF, 0.3);
      },
      hitboxes: [
        { start: 6, end: 9, x: 1.4, y: 1.2, r: 0.55, dmg: 5, base: 7.5, growth: 0.6, angle: 38 },
        { start: 6, end: 9, x: 0.75, y: 1.25, r: 0.42, dmg: 4, base: 7, growth: 0.55, angle: 38 },
      ],
      pose: keyframes([
        [0, { ...REST, rArm: [0.8, -0.3, -0.3], rFore: [0.6, -0.2, -0.75] }],
        [3, { rArm: [-0.4, -0.9, 0.4], rFore: [0.3, -0.2, 0.9], lean: -0.1 }],
        [6, { rArm: [1, -0.2, 0.2], rFore: [1, -0.15, 0.05], lean: 0.3 }],
        [12, {}],
        [24, { ...ARMS, lean: 0.05 }],
      ]),
    },

    // FORWARD TILT - Fore!: golf swing with the bong, low to high. Launches up and away.
    ftilt: {
      total: 34, limb: 'arm',
      hitboxes: [
        { start: 9, end: 13, path: [[9, 0.75, 0.45], [11, 1.2, 1.15], [13, 1.05, 1.85]], r: 0.55, dmg: 11, base: 7.5, growth: 1.0, angle: 55 },
        { start: 9, end: 11, x: 0.5, y: 0.9, r: 0.4, dmg: 8, base: 6.5, growth: 0.8, angle: 55 },
      ],
      pose: keyframes([
        [0, REST],
        [6, { rArm: [-0.6, -0.75, 0.3], rFore: [-0.75, -0.6, 0.2], lArm: [0.3, -1, -0.2], lFore: [0.8, 0.3, 0.4], lean: -0.05, look: -0.15 }],
        [9, { rArm: [0.3, -1, 0.3], rFore: [0.6, -0.8, 0.2], lean: 0.25 }],
        [11, { rArm: [0.8, -0.5, 0.25], rFore: [1, -0.1, 0.1], lean: 0.2, look: 0 }],
        [13, { rArm: [1, 0.3, 0.2], rFore: [1, 0.6, 0.1], lean: -0.05, look: 0.2 }],
        [18, {}],
        [30, REST],
      ]),
    },

    // UP TILT - Halo: swings the bong in a big arc over his head, front to back.
    utilt: {
      total: 28, limb: 'arm',
      hitboxes: [
        { start: 5, end: 13, path: [[5, 0.95, 2.0], [9, 0.03, 2.55], [13, -1.05, 1.8]], r: 0.55, dmg: 9, base: 8, growth: 0.85, angle: 85 },
        { start: 5, end: 8, x: 0.4, y: 1.7, r: 0.45, dmg: 9, base: 8, growth: 0.85, angle: 85 },
      ],
      pose: keyframes([
        [0, REST],
        [3, { rArm: [0.8, -0.5, 0.3], rFore: [1, -0.2, 0.2], lean: 0.1 }],
        [5, { rArm: [0.9, 0.2, 0.3], rFore: [0.8, 0.6, 0.2], lean: 0 }],
        [9, { rArm: [0.1, 1, 0.2], rFore: [0, 1, 0.1], look: 0.3, lean: -0.1 }],
        [13, { rArm: [-0.8, 0.5, 0.2], rFore: [-0.9, 0.2, 0.1], lean: -0.15 }],
        [24, REST],
      ]),
    },

    // DOWN TILT - Floor Sweep: crouches and sweeps the bong base along the
    // floor. Low launch angle, great near the ledge.
    dtilt: {
      total: 22, limb: 'arm',
      hitboxes: [
        { start: 6, end: 9, x: 1.2, y: 0.3, r: 0.5, dmg: 7, base: 6, growth: 0.55, angle: 22 },
        { start: 6, end: 9, x: 0.6, y: 0.45, r: 0.4, dmg: 6, base: 5.5, growth: 0.5, angle: 22 },
      ],
      pose: keyframes([
        [0, REST],
        [3, {
          crouch: 1, lean: 0.35, rArm: [0.4, -0.9, 0.5], rFore: [-0.2, -1, 0.4],
          rThigh: [0.75, -0.65, 0.15], rShin: [-0.45, -0.9, 0.1], lThigh: [0.55, -0.8, -0.15], lShin: [-0.55, -0.85, -0.1],
        }],
        [6, { rArm: [0.8, -0.6, 0.3], rFore: [1, -0.75, 0.1] }],
        [9, {}],
        [18, { ...REST }],
      ]),
    },

    // ---- Air ----

    // NEUTRAL AIR - The Rotation: holds the bong out and spins, passing it all the way around.
    nair: {
      total: 32, limb: 'spin', aerial: true, landingLag: 7,
      onFrame(f, frame, input, world) {
        if (frame >= 6 && frame <= 16 && frame % 2 === 0) {
          const a = ((frame - 4) / 12) * Math.PI * 2;
          world.effects.puff(f.x + Math.sin(a) * 1.2 * f.facing * f.stats.scale, f.y + 1.3, 0.3, PUFF, 0.2);
        }
      },
      hitboxes: [
        { start: 5, end: 16, path: [[5, 0.6, 1.3], [7, 1.15, 1.3], [10, 0, 1.3], [13, -1.15, 1.3], [16, 0, 1.3]], r: 0.55, dmg: 9, base: 6.5, growth: 0.8, angle: 45 },
        { start: 5, end: 16, x: 0, y: 1.0, r: 0.75, dmg: 7, base: 6, growth: 0.7, angle: 45 },
      ],
      pose: keyframes([
        [0, { ...REST, spin: 0 }],
        [4, {
          rArm: [0.25, -0.1, 1], rFore: [0.3, 0, 1], lArm: [0.2, -0.3, -1], lFore: [0.3, 0.2, -1],
          rThigh: [0.7, -0.7, 0.2], rShin: [0.2, -1, 0.1], lThigh: [-0.6, -0.8, -0.2], lShin: [-0.3, -1, -0.1],
        }],
        [16, { spin: Math.PI * 2 }],
        [22, {}],
        [30, { ...ARMS, ...LEGS }],
      ]),
    },

    // FORWARD AIR - Bong Hammer: overhead slam. The top of the swing launches;
    // the bottom of the swing spikes (meteor) anyone below.
    fair: {
      total: 38, limb: 'arm', aerial: true, landingLag: 13,
      hitboxes: [
        { start: 10, end: 12, path: [[10, 0.9, 2.1], [12, 1.2, 1.5]], r: 0.55, dmg: 11, base: 7, growth: 0.95, angle: 45 },
        { start: 13, end: 15, path: [[13, 1.2, 1.15], [15, 0.8, 0.55]], r: 0.55, dmg: 13, base: 6, growth: 0.8, angle: -70 },
      ],
      pose: keyframes([
        [0, REST],
        [7, { rArm: [-0.2, 1, 0.3], rFore: [-0.5, 0.8, 0.2], lean: -0.15 }],
        [10, { rArm: [0.6, 0.8, 0.25], rFore: [0.8, 0.6, 0.15], lean: 0.1 }],
        [13, { rArm: [1, -0.1, 0.2], rFore: [1, -0.3, 0.1], lean: 0.35 }],
        [16, { rArm: [0.6, -0.8, 0.2], rFore: [0.5, -0.9, 0.1], lean: 0.3 }],
        [20, {}],
        [32, REST],
      ]),
    },

    // BACK AIR - Backhand: whips the bong around behind him. His strongest aerial.
    bair: {
      total: 30, limb: 'arm', aerial: true, landingLag: 10,
      hitboxes: [
        { start: 8, end: 11, x: -1.3, y: 1.38, r: 0.55, dmg: 14, base: 8, growth: 1.1, angle: 145 },
        { start: 8, end: 11, x: -0.6, y: 1.38, r: 0.42, dmg: 9, base: 6, growth: 0.8, angle: 145 },
      ],
      pose: keyframes([
        [0, REST],
        [5, { rArm: [0.6, -0.5, -0.5], rFore: [0.8, -0.2, -0.6] }],
        [7, { rArm: [-0.3, -0.3, 0.9], rFore: [-0.3, -0.2, 0.95], lean: 0.1 }],
        [8, { rArm: [-1, -0.1, 0.2], rFore: [-1, 0, 0.1], lean: 0.2, look: -0.2 }],
        [11, {}],
        [24, REST],
      ]),
    },

    // UP AIR - Smoke Signal: quick hit of the pen, then blows a column of vapor straight up.
    uair: {
      total: 30, limb: 'arm', aerial: true, landingLag: 8,
      onFrame(f, frame, input, world) {
        if (frame >= 7 && frame <= 13 && frame % 2 === 1) {
          world.effects.puff(f.x + 0.2 * f.facing, f.y + (1.9 + (frame - 7) * 0.12) * f.stats.scale, 0.5, PUFF, 3.5);
        }
      },
      hitboxes: [
        { start: 7, end: 13, x: 0.15, y: 2.3, r: 0.55, dmg: 9, base: 7, growth: 0.95, angle: 87 },
        { start: 7, end: 13, x: 0.15, y: 3.0, r: 0.65, dmg: 9, base: 7, growth: 0.95, angle: 87 },
      ],
      pose: keyframes([
        [0, REST],
        [4, { ...PEN_TO_MOUTH, glow: 1, look: 0.1 }],
        [7, {
          lArm: [0.3, -1, -0.3], lFore: [0.6, 0.6, -0.2], glow: 0, look: 0.75, lean: -0.25,
          rThigh: [0.5, -0.8, 0.15], rShin: [0.1, -1, 0.1],
        }],
        [14, {}],
        [26, REST],
      ]),
    },

    // DOWN AIR - Bong Plunge: raises the bong and drives it straight down.
    // The base spikes on the way down.
    dair: {
      total: 38, limb: 'arm', aerial: true, landingLag: 15,
      hitboxes: [
        { start: 12, end: 15, x: 0.15, y: -0.05, r: 0.55, dmg: 13, base: 6, growth: 0.9, angle: -80 },
        { start: 16, end: 22, x: 0.15, y: 0.1, r: 0.5, dmg: 8, base: 6, growth: 0.7, angle: 60 },
      ],
      pose: keyframes([
        [0, REST],
        [8, {
          rArm: [0.4, 0.9, 0.3], rFore: [0.2, 1, 0.2], look: 0,
          rThigh: [0.8, -0.2, 0.15], rShin: [-0.3, -1, 0.1], lThigh: [0.8, -0.2, -0.15], lShin: [-0.3, -1, -0.1],
        }],
        [10, { rArm: [1, 0.1, 0.3], rFore: [1, -0.1, 0.2] }],
        [12, {
          rArm: [0.12, -1, 0.25], rFore: [0.05, -1, 0.1], look: -0.4,
          rThigh: [0.6, -0.6, 0.25], rShin: [0.1, -1, 0.15], lThigh: [0.5, -0.7, -0.25], lShin: [0, -1, -0.15],
        }],
        [18, {}],
        [30, REST],
      ]),
    },

    // ---- Specials ----

    // NEUTRAL SPECIAL - Dab Rip: hits the pen, then blows a fat cloud that
    // drifts forward and chips anyone inside it.
    nspecial: {
      total: 46, limb: 'arm', projectileFrame: 26,
      projectile: {
        look: 'cloud', color: 0xeeeef6, x: 0.55, y: 1.6,
        speed: 7, drag: 0.03, life: 120, r: 0.45, grow: 0.9, maxR: 1.3,
        pierce: true, hitEvery: 22, dmg: 2, base: 3.5, growth: 0.15, angle: 65, unique: 'dab',
      },
      hitboxes: [],
      pose(frame) {
        if (frame < 26) return { ...PEN_TO_MOUTH, look: frame > 10 ? -0.12 : 0, glow: frame > 6 ? 1 : 0 };
        return { lArm: [0.35, -1, -0.3], lFore: [1, 0.2, -0.1], look: 0.25, lean: -0.1 };
      },
    },

    // SIDE SPECIAL - Bong Bonk: big overhead swing. Slow, but it sends people.
    sspecial: {
      total: 48, limb: 'arm', landingLag: 14,
      onStart(f) { if (!f.grounded) f.vy = Math.max(f.vy, 4); },
      onFrame(f, frame) { if (frame === 12) f.vx = 5 * f.facing; },
      hitboxes: [{ start: 14, end: 19, x: 1.35, y: 0.95, r: 0.65, dmg: 15, base: 9, growth: 1.1, angle: 40 }],
      pose(frame) {
        if (frame < 13) return { rArm: [-0.45, 0.9, 0.3], rFore: [-0.7, 0.7, 0.2], lean: -0.15 };
        if (frame <= 20) return { rArm: [1, 0.2, 0.25], rFore: [1, -0.35, 0.1], lean: 0.35 };
        return { rArm: [0.7, -0.7, 0.3], rFore: [0.8, -0.6, 0.1], lean: 0.15 };
      },
    },

    // UP SPECIAL - Rip Rocket: one huge rip from the bong, then he blasts the
    // cloud straight down and rides it up. The exhaust spikes anyone underneath.
    uspecial: {
      total: 40, limb: 'arm', scripted: true, helplessAfter: true, landingLag: 16,
      onFrame(f, frame, input, world) {
        if (frame < 9) {
          f.vx *= 0.85;
          if (!f.grounded) f.vy = Math.max(f.vy, -1.5);
        } else if (frame <= 26) {
          f.grounded = false;
          f.platform = null;
          f.vy = 16;
          f.vx = (input.x || 0) * 4;
          if (frame % 2 === 0) world.effects.puff(f.x, f.y - 0.1, 0.6);
        }
      },
      hitboxes: [{ start: 9, end: 24, x: 0, y: -0.25, r: 0.75, dmg: 5, base: 6, growth: 0.45, angle: -75 }],
      pose(frame) {
        if (frame < 9) return BONG_TO_MOUTH;
        return {
          look: -0.45, lean: 0.1,
          rArm: [0.15, -1, 0.45], rFore: [0.3, -1, 0.2], lArm: [0, 0.35, -1], lFore: [0.1, 0.7, -1],
          rThigh: [0.15, -1, 0.15], rShin: [-0.1, -1, 0.1], lThigh: [-0.1, -1, -0.15], lShin: [-0.15, -1, -0.1],
        };
      },
    },

    // DOWN SPECIAL - Hotbox: takes a rip from the bong for as long as you
    // hold the button (like Piranha Plant's Poison Breath), then exhales a
    // cloud that hangs around. The longer the rip, the bigger the cloud and
    // the longer it lasts, up to a cap (2 seconds of holding). Opponents
    // inside take chip damage and slow down. At full charge he lets it out
    // on his own.
    dspecial: {
      total: HOTBOX_RIP + 30, limb: 'arm', scripted: true, landingLag: 6,
      onStart(f) { f.move.charge = 0; },
      onFrame(f, frame, input, world) {
        const m = f.move;
        f.vx *= 0.85;
        if (!f.grounded) f.vy = Math.max(f.vy - 0.4, m.released ? -1.2 : -3.5); // no infinite stalling while charging
        if (frame === HOTBOX_RIP && !m.released) {
          if (input.specialHeld && m.charge < HOTBOX_CHARGE) {
            m.charge++;
            m.frame--; // hold here while he keeps ripping
            if (m.charge % 7 === 0) world.effects.puff(f.x + 0.25 * f.facing, f.y + 0.9, 0.15 + 0.25 * (m.charge / HOTBOX_CHARGE), 0xd6ebcf, 1.2);
            if (m.charge === HOTBOX_CHARGE) world.effects.text(f.x, f.y + f.h + 0.6, 'MAX RIP', '#c8f5b0', 0.45, 0.7);
            return;
          }
          m.released = true;
        }
        if (frame === HOTBOX_RIP + 4) {
          const t = m.charge / HOTBOX_CHARGE;
          world.spawnProjectile(f, {
            ...HOTBOX_CLOUD,
            r: 0.8 + 0.4 * t,
            maxR: 1.4 + 1.3 * t,
            life: Math.round(150 + 270 * t),
            speed: 2.5 + 1.5 * t,
          });
        }
      },
      hitboxes: [],
      pose(frame, f) {
        const m = f.move;
        if (frame < 6) return liftBong(frame);
        if (frame <= HOTBOX_RIP && !m.released) {
          // Ripping: leans back a little more the longer he holds it.
          const t = m.charge / HOTBOX_CHARGE;
          return { ...BONG_TO_MOUTH, look: 0.1 + 0.25 * t + Math.sin(m.charge * 0.5) * 0.03, lean: -0.05 - 0.2 * t };
        }
        return { look: 0.6, lean: -0.2, rArm: [0.3, -0.6, 0.8], rFore: [0.6, -0.8, 0.4], lArm: [0.1, -0.2, -1], lFore: [0.2, 0.3, -1] };
      },
    },
  },
};
