import { keyframes } from './poses.js';

// Shared moveset. Frame data is at 60fps.
//
// Hitbox fields:
//   start/end   active frames (inclusive)
//   x, y        offset from the fighter's feet; +x is the direction they face
//   path        [[frame, x, y], ...] instead of x/y: the hitbox slides along the swing
//   r           radius (m)
//   dmg         percent dealt
//   base        base knockback (m/s)
//   growth      how much knockback scales with the victim's percent
//   angle       launch angle in degrees (0 = forward, 90 = up, -90 = down)
//   group       hitboxes in the same group (default 0) hit someone once per move;
//               give multi-hit moves a group per hit. List sweet spots first.
//   prop        'right'/'left': only counts while that hand still holds its prop
//
// Every attack has a `pose` built with keyframes() (src/poses.js) whose swing
// lands on the hitbox frames. `limb` ('arm', 'leg', 'spin') is the fallback
// animation for moves without one. Turn on "Show hitboxes" in the menu to see them.
// `scripted: true` means the move controls the fighter's velocity itself.
// `combo: { next, from }`: pressing attack again rolls into `next` (from that frame on).
// `available(f)` + `fallback`: if the move can't be used right now, do `fallback` instead.
// `ledgeGrab: true` lets the fighter grab ledges during the move.
// `onHit(f, victim, world)` runs when one of the move's hitboxes connects.
//
// Projectile fields (all optional except speed/life/r and the hit fields):
//   x, y        spawn offset from the feet    look       'orb', 'cloud' or 'prop' (+ prop: name)
//   drag        speed lost per frame (0-1)    grow/maxR  radius growth per second / cap
//   pierce      keeps going after a hit       hitEvery   frames between hits on the same target
//   noKnockback chip damage only              slow       frames of slowdown applied on hit
//   unique      only one alive per owner with this tag
//   color/opacity/squash   cloud look (squash < 1 flattens it vertically)
//   vy, gravity initial upward speed and fall acceleration (thrown objects)
//   pickup      'right'/'left': the prop leaves that hand, lands, and has to be picked
//               back up (restLife frames on the floor, returnFrames if lost offstage)
//   spin, restLift   tumble speed in flight / height of its pivot when resting

// Where a hitbox is on a given frame of its move.
export function hitboxPos(hb, frame) {
  const p = hb.path;
  if (!p) return [hb.x, hb.y];
  if (frame <= p[0][0]) return [p[0][1], p[0][2]];
  for (let i = 1; i < p.length; i++) {
    if (frame <= p[i][0]) {
      const [f0, x0, y0] = p[i - 1];
      const [f1, x1, y1] = p[i];
      const t = (frame - f0) / Math.max(1, f1 - f0);
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
  }
  const last = p[p.length - 1];
  return [last[1], last[2]];
}

// The guard stance, so keyframes have something to swing from and back to.
export const REST = {
  rArm: [0.25, -1, 0.3], rFore: [1, 0.7, 0.1], lArm: [0.2, -1, -0.3], lFore: [1, 0.8, -0.1],
  rThigh: [0.15, -1, 0.12], rShin: [-0.05, -1, 0.1], lThigh: [-0.15, -1, -0.12], lShin: [-0.1, -1, -0.1],
  lean: 0.05, look: 0, crouch: 0,
};

export const MOVES = {
  // ---- Ground ----
  // Jab: quick right, then press attack again for a harder left.
  jab: {
    total: 16, limb: 'arm', combo: { next: 'jab2', from: 5 },
    hitboxes: [
      { start: 2, end: 4, x: 0.85, y: 1.4, r: 0.45, dmg: 3, base: 3.5, growth: 0.1, angle: 35 },
      { start: 2, end: 4, x: 0.4, y: 1.35, r: 0.38, dmg: 3, base: 3.5, growth: 0.1, angle: 35 },
    ],
    pose: keyframes([
      [0, REST],
      [2, { rArm: [1, -0.05, 0.25], rFore: [1, 0, 0.05], lFore: [0.9, 0.9, -0.1], lean: 0.2 }],
      [6, {}],
      [14, { rArm: REST.rArm, rFore: REST.rFore, lFore: REST.lFore, lean: 0.05 }],
    ]),
  },
  jab2: {
    total: 24, limb: 'arm',
    hitboxes: [
      { start: 3, end: 5, x: 0.95, y: 1.38, r: 0.5, dmg: 4, base: 6.5, growth: 0.55, angle: 38 },
      { start: 3, end: 5, x: 0.45, y: 1.32, r: 0.4, dmg: 4, base: 6.5, growth: 0.55, angle: 38 },
    ],
    pose: keyframes([
      [0, { ...REST, rArm: [1, -0.05, 0.25], rFore: [1, 0, 0.05], lean: 0.2 }],
      [3, { lArm: [1, -0.05, -0.25], lFore: [1, 0, -0.05], rArm: [0.3, -1, 0.3], rFore: [0.9, 0.9, 0.1], lean: 0.3 }],
      [8, {}],
      [20, { lArm: REST.lArm, lFore: REST.lFore, rArm: REST.rArm, rFore: REST.rFore, lean: 0.05 }],
    ]),
  },
  // Side kick at hip height.
  ftilt: {
    total: 30, limb: 'leg',
    hitboxes: [
      { start: 7, end: 10, x: 1.1, y: 0.95, r: 0.55, dmg: 10, base: 7, growth: 0.95, angle: 35 },
      { start: 7, end: 10, x: 0.5, y: 0.95, r: 0.42, dmg: 8, base: 6, growth: 0.8, angle: 35 },
    ],
    pose: keyframes([
      [0, REST],
      [4, { rThigh: [0.9, 0.1, 0.15], rShin: [-0.3, -1, 0.1], lean: -0.2 }],
      [7, { rThigh: [1, 0.05, 0.12], rShin: [1, 0.05, 0.1], lean: -0.35, rArm: [-0.5, -0.6, 0.6], lArm: [0.5, -0.4, -0.7] }],
      [11, {}],
      [26, REST],
    ]),
  },
  // Overhead swipe from front to back.
  utilt: {
    total: 28, limb: 'arm',
    hitboxes: [
      { start: 6, end: 12, path: [[6, 0.6, 1.95], [9, 0.05, 2.25], [12, -0.55, 1.95]], r: 0.55, dmg: 8, base: 8, growth: 0.9, angle: 88 },
      { start: 6, end: 9, x: 0.25, y: 1.6, r: 0.45, dmg: 8, base: 8, growth: 0.9, angle: 88 },
    ],
    pose: keyframes([
      [0, REST],
      [3, { rArm: [0.9, -0.4, 0.3], rFore: [1, 0, 0.2], lean: 0.15 }],
      [6, { rArm: [0.8, 0.6, 0.25], rFore: [0.7, 0.7, 0.15], lean: 0.05 }],
      [9, { rArm: [0.05, 1, 0.2], rFore: [0, 1, 0.1], lean: -0.1, look: 0.25 }],
      [12, { rArm: [-0.7, 0.7, 0.2], rFore: [-0.75, 0.6, 0.1], lean: -0.15 }],
      [24, REST],
    ]),
  },
  // Crouching low kick: pops them up.
  dtilt: {
    total: 22, limb: 'leg',
    hitboxes: [
      { start: 5, end: 8, x: 1.05, y: 0.3, r: 0.5, dmg: 7, base: 6, growth: 0.6, angle: 72 },
      { start: 5, end: 8, x: 0.5, y: 0.4, r: 0.4, dmg: 6, base: 6, growth: 0.5, angle: 72 },
    ],
    pose: keyframes([
      [0, REST],
      [3, { crouch: 1, lean: 0.25, rThigh: [0.7, -0.6, 0.15], rShin: [-0.2, -1, 0.1], lThigh: [0.5, -0.8, -0.15], lShin: [-0.6, -0.8, -0.1] }],
      [5, { rThigh: [1, -0.3, 0.12], rShin: [1, -0.4, 0.1] }],
      [9, {}],
      [18, REST],
    ]),
  },

  // ---- Air ----
  // Spin with arms and legs out: hits all around.
  nair: {
    total: 32, limb: 'spin', aerial: true, landingLag: 6,
    hitboxes: [
      { start: 5, end: 14, x: 0, y: 0.95, r: 1.0, dmg: 8, base: 6, growth: 0.7, angle: 45 },
      { start: 15, end: 22, x: 0, y: 0.95, r: 0.85, dmg: 5, base: 5, growth: 0.5, angle: 50 },
    ],
    pose: keyframes([
      [0, { ...REST, spin: 0 }],
      [4, {
        rArm: [0.1, 0, 1], rFore: [0.2, 0, 1], lArm: [0.1, 0, -1], lFore: [0.2, 0, -1],
        rThigh: [0.7, -0.7, 0.2], rShin: [0.2, -1, 0.1], lThigh: [-0.6, -0.8, -0.2], lShin: [-0.3, -1, -0.1],
      }],
      [16, { spin: Math.PI * 2 }],
      [22, {}],
      [30, REST],
    ]),
  },
  // Overhead hammer-fist that arcs down in front.
  fair: {
    total: 36, limb: 'arm', aerial: true, landingLag: 12,
    hitboxes: [
      { start: 9, end: 13, path: [[9, 0.55, 2.0], [11, 0.85, 1.35], [13, 0.55, 0.75]], r: 0.55, dmg: 12, base: 7, growth: 1.05, angle: 40 },
    ],
    pose: keyframes([
      [0, REST],
      [6, { rArm: [-0.3, 1, 0.3], rFore: [-0.4, 0.9, 0.2], lean: -0.15 }],
      [9, { rArm: [0.6, 0.8, 0.25], rFore: [0.75, 0.65, 0.15], lean: 0.1 }],
      [11, { rArm: [1, -0.05, 0.2], rFore: [1, -0.2, 0.1], lean: 0.35 }],
      [13, { rArm: [0.55, -0.85, 0.2], rFore: [0.45, -0.9, 0.1], lean: 0.3 }],
      [16, {}],
      [30, REST],
    ]),
  },
  // Back kick: the strongest aerial.
  bair: {
    total: 30, limb: 'leg', aerial: true, landingLag: 10,
    hitboxes: [
      { start: 7, end: 10, x: -1.1, y: 0.95, r: 0.55, dmg: 13, base: 8, growth: 1.1, angle: 145 },
      { start: 7, end: 10, x: -0.5, y: 0.95, r: 0.42, dmg: 9, base: 6, growth: 0.8, angle: 145 },
    ],
    pose: keyframes([
      [0, REST],
      [4, { rThigh: [-0.6, -0.6, 0.12], rShin: [0.3, -1, 0.1], lean: 0.2 }],
      [7, { rThigh: [-1, 0.05, 0.12], rShin: [-1, 0.1, 0.1], lean: 0.45, look: -0.1 }],
      [11, {}],
      [26, REST],
    ]),
  },
  // Backflip kick: the leg sweeps from in front, over the head, to behind.
  uair: {
    total: 28, limb: 'leg', aerial: true, landingLag: 8,
    hitboxes: [
      { start: 6, end: 10, path: [[6, 0.95, 1.2], [7, 0.7, 1.65], [8, 0.25, 1.95], [9, -0.3, 1.95], [10, -0.75, 1.6]], r: 0.6, dmg: 9, base: 7, growth: 0.95, angle: 85 },
    ],
    pose: keyframes([
      [0, { ...REST, pitch: 0 }],
      [3, { rThigh: [0.3, -1, 0.12], rShin: [0.3, -1, 0.1], lThigh: [0.6, -0.5, -0.12], lShin: [-0.5, -0.8, -0.1], rArm: [-0.3, -1, 0.5], lArm: [-0.3, -1, -0.5] }],
      [15, { pitch: Math.PI * 2 }],
      [24, REST],
    ]),
  },
  // Two-footed stomp. The early hit spikes.
  dair: {
    total: 40, limb: 'leg', aerial: true, landingLag: 15,
    hitboxes: [
      { start: 12, end: 15, x: 0.1, y: -0.15, r: 0.6, dmg: 13, base: 6, growth: 0.9, angle: -80 },
      { start: 16, end: 21, x: 0.1, y: 0.1, r: 0.5, dmg: 8, base: 6, growth: 0.7, angle: 60 },
    ],
    pose: keyframes([
      [0, REST],
      [8, {
        rThigh: [0.8, -0.2, 0.15], rShin: [-0.3, -1, 0.1], lThigh: [0.8, -0.2, -0.15], lShin: [-0.3, -1, -0.1],
        rArm: [0.2, 0.8, 0.5], rFore: [0.1, 1, 0.3], lArm: [0.2, 0.8, -0.5], lFore: [0.1, 1, -0.3],
      }],
      [12, { rThigh: [0.1, -1, 0.15], rShin: [0.05, -1, 0.1], lThigh: [0.05, -1, -0.15], lShin: [0, -1, -0.1], lean: -0.1 }],
      [18, {}],
      [34, REST],
    ]),
  },

  // ---- Specials ----
  // Neutral special: fires a projectile on frame 14.
  nspecial: {
    total: 36, limb: 'arm', projectileFrame: 14,
    projectile: { speed: 13, life: 70, r: 0.32, dmg: 6, base: 4, growth: 0.35, angle: 25 },
    hitboxes: [],
  },
  // Side special: lunge forward. Once per airtime.
  sspecial: {
    total: 40, limb: 'arm', landingLag: 14, scripted: true,
    onStart(f) { f.vy = Math.max(f.vy, 2); },
    onFrame(f, frame) {
      if (frame >= 8 && frame <= 20) { f.vx = 15 * f.facing; f.vy = Math.max(f.vy, 0); }
      else if (frame > 20) f.vx *= 0.85;
    },
    hitboxes: [{ start: 8, end: 20, x: 0.8, y: 1.1, r: 0.55, dmg: 11, base: 8, growth: 0.85, angle: 30 }],
  },
  // Up special: the recovery move. Leaves you helpless until you land.
  uspecial: {
    total: 34, limb: 'arm', helplessAfter: true, landingLag: 18, scripted: true,
    onStart(f) { f.grounded = false; f.fastFalling = false; },
    onFrame(f, frame, input) {
      if (frame >= 4 && frame <= 18) {
        f.vy = 17;
        f.vx = (input.x || 0) * 4.5;
      }
    },
    hitboxes: [{ start: 4, end: 16, x: 0.3, y: 1.9, r: 0.6, dmg: 7, base: 7, growth: 0.75, angle: 80 }],
  },
  // Down special: ground pound. In the air it plunges until you land.
  dspecial: {
    total: 48, limb: 'leg', landingLag: 4, scripted: true,
    onFrame(f, frame, input, world) {
      if (frame < 10) { f.vx *= 0.8; f.vy = Math.max(f.vy, 0) + 0.5; }
      else if (f.grounded) this.onLand(f, world);
      else { f.vy = -26; f.vx = 0; f.move.frame = Math.min(f.move.frame, 20); }
    },
    onLand(f, world) {
      world.addShockwave(f);
      f.move = null;
      f.landingLag = 14;
    },
    hitboxes: [{ start: 10, end: 20, x: 0, y: 0.1, r: 0.6, dmg: 12, base: 7, growth: 0.8, angle: -75 }],
  },
};

// ---- Dodges and ledge options ----
// `intangible: [start, end]` frames can't be hit. Shared by every character.

// Curled up mid-roll / mid-air-dodge.
const CURL = {
  rThigh: [0.9, -0.3, 0.15], rShin: [-0.6, -0.8, 0.1], lThigh: [0.9, -0.3, -0.15], lShin: [-0.6, -0.8, -0.1],
  rArm: [0.6, -0.6, 0.3], rFore: [0.6, 0.6, 0.2], lArm: [0.6, -0.6, -0.3], lFore: [0.6, 0.6, -0.2],
  lean: 0.5,
};

export const DODGES = {
  // Ground roll: shield + left/right. You end up facing back the way you came.
  roll: {
    total: 28, limb: 'dodge', scripted: true, intangible: [3, 17], hitboxes: [],
    onStart(f, input) { f.move.dir = Math.sign(input.x) || f.facing; },
    onFrame(f, frame) {
      f.vx = frame >= 2 && frame <= 18 ? 9 * f.move.dir : f.vx * 0.6;
      // Rolls stop at the edge instead of carrying you off the stage.
      const p = f.platform;
      if (p && f.grounded) {
        const next = f.x + f.vx / 60;
        if (next < p.x1 + 0.25 || next > p.x2 - 0.25) f.vx = 0;
      }
      if (frame === 18) f.facing = -f.move.dir;
    },
    pose: () => ({ ...CURL, crouch: 0.6 }),
  },
  // Spot dodge: shield + down. Sidestep in place.
  spotdodge: {
    total: 24, limb: 'dodge', scripted: true, intangible: [2, 16], hitboxes: [],
    onFrame(f) { f.vx *= 0.6; },
    pose: () => ({ crouch: 0.3, lean: -0.15 }),
  },
  // Air dodge: shield in the air. Hold a direction to zip that way. Once per airtime.
  airdodge: {
    total: 32, limb: 'dodge', scripted: true, aerial: true, intangible: [2, 18], landingLag: 10, hitboxes: [],
    onStart(f, input) {
      const len = Math.hypot(input.x, input.y);
      f.move.dir = len > 0.3 ? [input.x / len, input.y / len] : null;
      f.airDodgeUsed = true;
      f.fastFalling = false;
    },
    onFrame(f, frame) {
      const d = f.move.dir;
      if (d && frame <= 12) {
        const speed = 13 * (1 - frame / 16);
        f.vx = d[0] * speed;
        f.vy = d[1] * speed;
      } else if (d) {
        f.vx *= 0.88;
        f.vy = Math.max(f.vy, -6);
      } else {
        f.vx *= 0.96;
        f.vy = Math.max(f.vy, -f.stats.maxFall);
      }
    },
    pose: () => CURL,
  },
  // Getup attack from the ledge (after climbing up).
  ledgeattack: {
    total: 26, limb: 'leg', intangible: [0, 4],
    hitboxes: [{ start: 5, end: 9, x: 0.9, y: 0.45, r: 0.7, dmg: 8, base: 8, growth: 0.55, angle: 30 }],
  },
};

// The ground-pound landing wave.
export const SHOCKWAVE = { r: 1.6, dmg: 8, base: 9, growth: 0.6, angle: 70 };

export function pickAttack(f, input) {
  const up = input.y > 0.5;
  const down = input.y < -0.5;
  const side = Math.abs(input.x) > 0.3;
  if (f.grounded) {
    if (up) return 'utilt';
    if (down) return 'dtilt';
    if (side) return 'ftilt';
    return 'jab';
  }
  if (up) return 'uair';
  if (down) return 'dair';
  if (side) return Math.sign(input.x) === f.facing ? 'fair' : 'bair';
  return 'nair';
}

export function pickSpecial(f, input) {
  if (input.y > 0.5) return 'uspecial';
  if (input.y < -0.5) return 'dspecial';
  if (Math.abs(input.x) > 0.3) return 'sspecial';
  return 'nspecial';
}
