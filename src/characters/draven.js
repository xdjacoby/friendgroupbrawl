// Draven: dab pen in his left hand, a big empty bong in his right.
// Every arm attack he does swings the bong, and all four specials are
// built around the pen or the bong. Frame data format: see src/moves.js.
// Poses: see src/poses.js.

// Lift the left hand (dab pen) to his mouth.
const PEN_TO_MOUTH = { lArm: [0.45, -0.75, -0.3], lFore: 'mouth' };
// Lift the bong upright with the mouthpiece at his mouth.
const BONG_TO_MOUTH = { rArm: [0.55, -0.6, 0.35], rFore: 'mouth', rProp: 'upright' };

export const DRAVEN = {
  id: 'draven',
  name: 'Draven',
  tagline: 'Dab pen + a big empty bong',
  color: 0x8e44ad,
  model: 'models/draven.glb',
  props: { right: 'bong', left: 'dabPen' },
  stats: { weight: 108, runSpeed: 7.5, airSpeed: 6, jump: 14.5, gravity: 36, maxFall: 13, power: 1.05, scale: 1.0 },

  // Resting with the bong hanging from his right hand and the pen held up in his left.
  poses: {
    idle: { rArm: [0.05, -1, 0.3], rFore: [0.5, -1, 0.15], lArm: [0.25, -1, -0.3], lFore: [1, 0.75, -0.15] },
    crouch: { rArm: [0.2, -1, 0.35], rFore: [0.4, -1, 0.15], lArm: [0.25, -1, -0.3], lFore: [1, 0.75, -0.15] },
  },

  moves: {
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

    // DOWN SPECIAL - Hotbox: rips the bong and exhales a huge cloud that hangs
    // around for 5 seconds. Anyone else inside takes chip damage and slows down.
    dspecial: {
      total: 50, limb: 'arm', scripted: true, projectileFrame: 20, landingLag: 6,
      projectile: {
        look: 'cloud', color: 0xd6ebcf, opacity: 0.3, squash: 0.7, x: 0, y: 1.2,
        speed: 0, life: 300, r: 1.0, grow: 4, maxR: 2.5,
        pierce: true, hitEvery: 15, dmg: 0.8, noKnockback: true, slow: 20, unique: 'hotbox',
      },
      onFrame(f) {
        f.vx *= 0.85;
        if (!f.grounded) f.vy = Math.max(f.vy - 0.4, -1.2);
      },
      hitboxes: [],
      pose(frame) {
        if (frame < 18) return BONG_TO_MOUTH;
        return { look: 0.6, lean: -0.2, rArm: [0.3, -0.6, 0.8], rFore: [0.6, -0.8, 0.4], lArm: [0.1, -0.2, -1], lFore: [0.2, 0.3, -1] };
      },
    },
  },
};
