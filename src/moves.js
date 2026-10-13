// Shared moveset. Frame data is at 60fps.
//
// Hitbox fields:
//   start/end   active frames (inclusive)
//   x, y        offset from the fighter's feet; +x is the direction they face
//   r           radius (m)
//   dmg         percent dealt
//   base        base knockback (m/s)
//   growth      how much knockback scales with the victim's percent
//   angle       launch angle in degrees (0 = forward, 90 = up, -90 = down)
//
// `limb` tells the animation what to swing: 'arm', 'leg' or 'spin'. A move can
// instead define `pose(frame)` for a hand-made pose (see src/poses.js).
// `scripted: true` means the move controls the fighter's velocity itself.
//
// Projectile fields (all optional except speed/life/r and the hit fields):
//   x, y        spawn offset from the feet    look       'orb' or 'cloud'
//   drag        speed lost per frame (0-1)    grow/maxR  radius growth per second / cap
//   pierce      keeps going after a hit       hitEvery   frames between hits on the same target
//   noKnockback chip damage only              slow       frames of slowdown applied on hit
//   unique      only one alive per owner with this tag
//   color/opacity/squash   cloud look (squash < 1 flattens it vertically)

export const MOVES = {
  // ---- Ground ----
  jab: {
    total: 18, limb: 'arm',
    hitboxes: [{ start: 3, end: 5, x: 0.8, y: 1.25, r: 0.45, dmg: 3, base: 4, growth: 0.15, angle: 30 }],
  },
  ftilt: {
    total: 30, limb: 'leg',
    hitboxes: [{ start: 8, end: 11, x: 1.0, y: 0.8, r: 0.5, dmg: 10, base: 7, growth: 0.95, angle: 35 }],
  },
  utilt: {
    total: 32, limb: 'arm',
    hitboxes: [{ start: 7, end: 12, x: 0.2, y: 2.1, r: 0.6, dmg: 9, base: 8, growth: 0.9, angle: 88 }],
  },
  dtilt: {
    total: 24, limb: 'leg',
    hitboxes: [{ start: 5, end: 8, x: 1.0, y: 0.25, r: 0.45, dmg: 7, base: 6, growth: 0.6, angle: 75 }],
  },

  // ---- Air ----
  nair: {
    total: 34, limb: 'spin', aerial: true, landingLag: 6,
    hitboxes: [{ start: 5, end: 18, x: 0, y: 0.95, r: 0.95, dmg: 8, base: 6, growth: 0.7, angle: 45 }],
  },
  fair: {
    total: 38, limb: 'arm', aerial: true, landingLag: 12,
    hitboxes: [{ start: 11, end: 14, x: 0.95, y: 1.0, r: 0.55, dmg: 13, base: 7, growth: 1.05, angle: 40 }],
  },
  bair: {
    total: 32, limb: 'leg', aerial: true, landingLag: 10, back: true,
    hitboxes: [{ start: 7, end: 10, x: -1.0, y: 0.85, r: 0.55, dmg: 13, base: 8, growth: 1.1, angle: 145 }],
  },
  uair: {
    total: 30, limb: 'leg', aerial: true, landingLag: 8,
    hitboxes: [{ start: 6, end: 10, x: 0.1, y: 2.1, r: 0.6, dmg: 9, base: 7, growth: 0.95, angle: 85 }],
  },
  dair: {
    total: 42, limb: 'leg', aerial: true, landingLag: 16,
    hitboxes: [{ start: 14, end: 18, x: 0.1, y: -0.1, r: 0.55, dmg: 14, base: 6, growth: 0.9, angle: -80 }],
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
