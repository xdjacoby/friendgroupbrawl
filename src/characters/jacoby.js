import { keyframes } from '../poses.js';
import { REST as GUARD_REST } from '../moves.js';

// Jacoby: carries a microscope in his right hand and digs snacks out of the
// ground. Eating a snack heals a little and stacks "munchies" that make him
// hit harder until he's KO'd. The microscope is his projectile: once thrown
// it lies where it lands until he walks over it, or pops back into his hand a
// few seconds after falling off the stage. Try to throw it again without it
// and he stands there patting his pockets.
// Frame data format: see src/moves.js. Poses: see src/poses.js.

const SNACKS = {
  chips: { label: 'CHIPS!', heal: 2, weight: 30 },
  cookie: { label: 'COOKIE!', heal: 3, weight: 30 },
  donut: { label: 'DONUT!', heal: 3, weight: 25 },
  pizza: { label: 'PIZZA!', heal: 5, weight: 15 },
};
const MAX_MUNCHIES = 5;
const MUNCHIE_POWER = 0.04; // +4% damage and knockback per snack

function pickSnack() {
  const total = Object.values(SNACKS).reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (const [name, s] of Object.entries(SNACKS)) {
    roll -= s.weight;
    if (roll < 0) return name;
  }
  return 'chips';
}

function eatSnack(f, world) {
  f.heal(SNACKS[f.move.snack].heal, world);
  const st = f.charState;
  st.munchies = Math.min(MAX_MUNCHIES, (st.munchies ?? 0) + 1);
  f.powerBonus = st.munchies * MUNCHIE_POWER;
  const label = st.munchies >= MAX_MUNCHIES ? 'MAX MUNCHIES' : `MUNCHIES x${st.munchies}`;
  world.effects.text(f.x, f.y + f.h + 1.05, label, '#ffb347', 0.4, 1.2);
}

// Where his mouth is (for crumbs).
const mouth = (f) => [f.x + 0.18 * f.facing * f.stats.scale, f.y + 1.62 * f.stats.scale];

// Carrying the microscope upright at his side, left fist up.
const IDLE = { rArm: [0.1, -1, 0.25], rFore: [0.7, -0.4, 0.15], lArm: [0.2, -1, -0.3], lFore: [1, 0.8, -0.1] };
const REST = { ...GUARD_REST, ...IDLE, rProp: 'upright' };
const CROUCH_LEGS = { rThigh: [0.75, -0.65, 0.15], rShin: [-0.45, -0.9, 0.1], lThigh: [0.55, -0.8, -0.15], lShin: [-0.55, -0.85, -0.1] };
const STAND_LEGS = { rThigh: REST.rThigh, rShin: REST.rShin, lThigh: REST.lThigh, lShin: REST.lShin };

// Winding up and letting go of a throw (shared by the real throw and the whiff).
const THROW_WINDUP = { rArm: [-0.6, 0.8, 0.3], rFore: [-0.3, 1, 0.2], rProp: 'club', lArm: [0.8, 0.1, -0.3], lFore: [1, 0.3, -0.1], lean: -0.2 };
const THROW_RELEASE = { rArm: [1, 0.2, 0.2], rFore: [1, -0.1, 0.1], lArm: [0.2, -1, -0.4], lFore: [-0.2, -0.6, -0.6], lean: 0.3 };

// Snack Dig: hand down in the dirt / scooping it back over his shoulder.
const SCOOP_DOWN = { lArm: [0.7, -0.7, -0.3], lFore: [0.5, -1, -0.1] };
const SCOOP_BACK = { lArm: [0.3, -0.6, -0.6], lFore: [-0.3, 0.2, -0.7] };
const DIG = 6; // first digging frame (frames before it are the dive when used in the air)

const digPose = keyframes([
  [0, REST],
  [3, { rThigh: [0.8, -0.2, 0.15], rShin: [-0.3, -1, 0.1], lThigh: [0.8, -0.2, -0.15], lShin: [-0.3, -1, -0.1] }],
  [4, {
    rThigh: [0.1, -1, 0.15], rShin: [0.05, -1, 0.1], lThigh: [0.05, -1, -0.15], lShin: [0, -1, -0.1],
    rArm: [0.2, 1, 0.5], rFore: [0.1, 1, 0.3], lArm: [0.2, 1, -0.5], lFore: [0.1, 1, -0.3],
  }],
  [DIG, {
    ...CROUCH_LEGS, crouch: 1, lean: 0.6, look: -0.3, ...SCOOP_DOWN,
    rArm: [0.1, -1, 0.5], rFore: [-0.2, -0.6, 0.8],
  }],
  [10, SCOOP_BACK],
  [14, SCOOP_DOWN],
  [18, SCOOP_BACK],
  [22, SCOOP_DOWN],
  [26, SCOOP_BACK],
  [30, SCOOP_DOWN],
  // Ta-da!
  [35, { crouch: 0.3, lean: -0.05, look: 0.25, lArm: [0.4, 0.85, -0.3], lFore: [0.2, 1, -0.15] }],
  [41, {}],
  // Munch munch.
  [45, { ...STAND_LEGS, crouch: 0, lean: 0.05, look: 0, lArm: [0.45, -0.75, -0.3], lFore: 'mouth' }],
  [49, { look: -0.12 }],
  [53, { look: 0.05 }],
  [57, { look: -0.12 }],
  // Pat the belly, satisfied.
  [62, { look: 0.1, lArm: [0.2, -1, -0.2], lFore: [0.6, 0.1, 0.8] }],
  [70, { look: 0.25 }],
  [80, { ...REST, rArm: [0.1, -1, 0.5], rFore: [-0.2, -0.6, 0.8] }],
]);

export const JACOBY = {
  id: 'jacoby',
  name: 'Jacoby',
  tagline: 'Digs up snacks, throws a microscope',
  color: 0xe67e22,
  model: 'models/jacoby.glb',
  props: { right: 'microscope' },
  stats: { weight: 100, runSpeed: 8, airSpeed: 6.3, jump: 15, gravity: 40, maxFall: 14.5, power: 1.0, scale: 1.0 },

  // HUD line under his name: the microscope (while he has it) and his snack stacks.
  hud: (f) => `${f.handEmpty.right ? '' : '🔬'}${'🍪'.repeat(f.charState.munchies ?? 0)}`,

  poses: {
    base: { rProp: 'upright' },
    idle: IDLE,
    crouch: { rArm: [0.2, -1, 0.35], rFore: [0.6, -0.5, 0.2], lArm: [0.2, -1, -0.3], lFore: [1, 0.8, -0.1] },
  },

  moves: {
    // ---- Normals (the rest are the shared ones from moves.js) ----

    // FORWARD TILT - Lens Bash: swings the microscope like a hammer. Without
    // it he just punches (the orange hitbox only counts while he holds it).
    ftilt: {
      total: 28, limb: 'arm',
      hitboxes: [
        { start: 8, end: 11, x: 1.0, y: 1.38, r: 0.5, dmg: 11, base: 7.5, growth: 1.0, angle: 35, prop: 'right' },
        { start: 8, end: 11, x: 0.55, y: 1.4, r: 0.42, dmg: 7, base: 6, growth: 0.7, angle: 35 },
      ],
      pose: keyframes([
        [0, REST],
        [5, { rArm: [-0.4, -0.3, 0.7], rFore: [-0.5, 0.4, 0.6], rProp: 'club', lean: -0.1 }],
        [8, { rArm: [1, -0.1, 0.25], rFore: [1, -0.05, 0.05], lean: 0.3 }],
        [12, {}],
        [24, REST],
      ]),
    },

    // DOWN TILT - Dirt Flick: scoops a handful of dirt into their face. Pops them up.
    dtilt: {
      total: 22, limb: 'arm',
      onFrame(f, frame, input, world) {
        if (frame === 6) world.effects.dirt(f.x + 0.9 * f.facing * f.stats.scale, f.y + 0.3, f.facing);
      },
      hitboxes: [
        { start: 6, end: 9, x: 1.25, y: 0.45, r: 0.5, dmg: 6, base: 6.5, growth: 0.5, angle: 80 },
        { start: 6, end: 9, x: 0.65, y: 0.35, r: 0.42, dmg: 6, base: 6.5, growth: 0.5, angle: 80 },
      ],
      pose: keyframes([
        [0, REST],
        [3, { ...CROUCH_LEGS, crouch: 1, lean: 0.5, ...SCOOP_DOWN, lArm: [0.6, -0.8, -0.3] }],
        [6, { lArm: [0.9, -0.3, -0.3], lFore: [1, 0.2, -0.2], lean: 0.35 }],
        [10, {}],
        [20, REST],
      ]),
    },

    // FORWARD AIR - Microscope Smash: overhead swing with the microscope.
    fair: {
      total: 36, limb: 'arm', aerial: true, landingLag: 12,
      hitboxes: [
        { start: 9, end: 13, path: [[9, 0.7, 2.15], [11, 1.05, 1.3], [13, 0.6, 0.6]], r: 0.55, dmg: 13, base: 7, growth: 1.05, angle: 40, prop: 'right' },
        { start: 9, end: 13, path: [[9, 0.45, 1.9], [11, 0.7, 1.38], [13, 0.45, 0.85]], r: 0.42, dmg: 9, base: 6, growth: 0.85, angle: 40 },
      ],
      pose: keyframes([
        [0, REST],
        [6, { rArm: [-0.3, 1, 0.3], rFore: [-0.4, 0.9, 0.2], rProp: 'club', lean: -0.15 }],
        [9, { rArm: [0.6, 0.8, 0.25], rFore: [0.75, 0.65, 0.15], lean: 0.1 }],
        [11, { rArm: [1, -0.05, 0.2], rFore: [1, -0.2, 0.1], lean: 0.35 }],
        [13, { rArm: [0.55, -0.85, 0.2], rFore: [0.45, -0.9, 0.1], lean: 0.3 }],
        [16, {}],
        [30, REST],
      ]),
    },

    // ---- Specials ----

    // NEUTRAL SPECIAL - Microscope Toss: lobs the microscope. It bonks whoever
    // it hits, then lies on the floor until he picks it up (walk over it).
    // Falls off the stage? It pops back into his hand after 3 seconds. Left on
    // the floor for 10 seconds, it comes back too.
    nspecial: {
      total: 38, limb: 'arm', projectileFrame: 14,
      available: (f) => !f.handEmpty.right,
      fallback: 'nspecialEmpty',
      projectile: {
        look: 'prop', prop: 'microscope', x: 0.7, y: 1.6,
        speed: 8.5, vy: 6.5, gravity: 26, spin: 14, life: 900, r: 0.32,
        dmg: 9, base: 7, growth: 0.8, angle: 40,
        pickup: 'right', restLife: 600, returnFrames: 180, restLift: 0.21,
      },
      hitboxes: [],
      pose: keyframes([
        [0, REST],
        [10, THROW_WINDUP],
        [14, THROW_RELEASE],
        [22, {}],
        [34, REST],
      ]),
    },

    // ...and what happens when he tries it without the microscope: throws
    // nothing, stares at his empty hand, pats his pockets, shrugs. Wide open.
    nspecialEmpty: {
      total: 75, limb: 'arm',
      onFrame(f, frame, input, world) {
        if (frame === 22) world.effects.text(f.x, f.y + f.h + 0.5, '?', '#ffe14a', 0.7, 1.1);
        if (frame === 50) world.effects.text(f.x, f.y + f.h + 0.5, '...', '#ffffff', 0.6, 1.0);
      },
      hitboxes: [],
      pose: keyframes([
        [0, REST],
        [10, THROW_WINDUP],
        [14, THROW_RELEASE],
        [22, {}],
        [30, { rArm: [0.4, -0.6, 0.4], rFore: [0.3, 0.9, 0.2], rProp: 'upright', look: -0.25, lean: 0.05 }],
        [44, {}],
        [50, { rArm: [0.05, -1, 0.35], rFore: [0.2, -1, 0.3], lArm: [0.05, -1, -0.35], lFore: [0.2, -1, -0.3], look: -0.4 }],
        [54, { rFore: [0.5, -0.8, 0.3], lFore: [0.5, -0.8, -0.3] }],
        [58, { rFore: [0.2, -1, 0.3], lFore: [0.2, -1, -0.3] }],
        [62, { rFore: [0.5, -0.8, 0.3], lFore: [0.5, -0.8, -0.3] }],
        [66, { rArm: [0.1, -0.5, 1], rFore: [0.3, 0.8, 0.6], lArm: [0.1, -0.5, -1], lFore: [0.3, 0.8, -0.6], look: 0.15 }],
        [75, REST],
      ]),
    },

    // SIDE SPECIAL - Munch: lunges mouth-first and takes a bite out of
    // whoever's in front. Heals 1% when it connects.
    sspecial: {
      total: 42, limb: 'arm', scripted: true, landingLag: 12,
      onStart(f) { if (!f.grounded) f.vy = Math.max(f.vy, 3); },
      onFrame(f, frame) {
        if (frame >= 6 && frame <= 16) {
          f.vx = 12 * f.facing;
          f.vy = Math.max(f.vy, 0);
        } else {
          f.vx *= 0.82;
        }
      },
      onHit(f, victim, world) {
        f.heal(1, world);
        world.effects.text(victim.x, victim.y + victim.h + 0.2, 'CHOMP!', '#ffd23f', 0.5, 0.8);
        world.effects.crumbs(...mouth(f));
      },
      hitboxes: [
        { start: 8, end: 15, x: 0.8, y: 1.5, r: 0.5, dmg: 9, base: 7, growth: 0.75, angle: 35 },
        { start: 8, end: 15, x: 0.35, y: 1.15, r: 0.45, dmg: 9, base: 7, growth: 0.75, angle: 35 },
      ],
      pose: keyframes([
        [0, REST],
        [5, { lean: -0.2, look: 0.2, rArm: [-0.3, -1, 0.4], lArm: [-0.3, -1, -0.4], ...CROUCH_LEGS, crouch: 0.4 }],
        [8, {
          lean: 0.75, look: 0.15, crouch: 0,
          rArm: [-0.8, -0.3, 0.4], rFore: [-0.9, 0.1, 0.3], lArm: [-0.8, -0.3, -0.4], lFore: [-0.9, 0.1, -0.3],
          rThigh: [-0.4, -1, 0.15], rShin: [-0.6, -0.8, 0.1], lThigh: [0.2, -1, -0.15], lShin: [-0.2, -1, -0.1],
        }],
        [11, { look: -0.25 }],
        [14, { look: 0.1 }],
        [17, { lean: 0.4 }],
        [26, {}],
        [38, REST],
      ]),
    },

    // UP SPECIAL - Soda Rocket: shakes up a 2-liter, flips it upside down and
    // rides the geyser. The spray hits anyone below a few times. His recovery.
    uspecial: {
      total: 44, limb: 'arm', scripted: true, helplessAfter: true, landingLag: 16,
      onFrame(f, frame, input, world) {
        if (frame < 11) {
          f.vx *= 0.85;
          if (!f.grounded) f.vy = Math.max(f.vy, -1.5);
        } else if (frame <= 30) {
          f.grounded = false;
          f.platform = null;
          f.vy = 15.5;
          f.vx = (input.x || 0) * 4.2;
          world.effects.puff(f.x, f.y + 0.3, 0.45, frame % 2 ? 0x8a4b1c : 0xfff3e0, -3);
        }
      },
      hitboxes: [
        { start: 11, end: 14, x: 0, y: -0.2, r: 0.75, dmg: 2, base: 4, growth: 0.1, angle: -80, group: 0 },
        { start: 17, end: 20, x: 0, y: -0.2, r: 0.75, dmg: 2, base: 4, growth: 0.1, angle: -80, group: 1 },
        { start: 23, end: 26, x: 0, y: -0.2, r: 0.75, dmg: 2, base: 4, growth: 0.1, angle: -80, group: 2 },
        { start: 28, end: 30, x: 0, y: -0.3, r: 0.8, dmg: 3, base: 6, growth: 0.45, angle: -70, group: 3 },
      ],
      pose: keyframes([
        [0, REST],
        // Shake it up in front of his chest...
        [3, { lHeld: 'soda', lProp: 'upright', lArm: [0.7, -0.4, 0.15], lFore: [0.5, 0.8, 0.35], look: -0.1 }],
        [5, { lFore: [0.3, 1, 0.3] }],
        [7, { lFore: [0.7, 0.5, 0.35] }],
        [9, { lFore: [0.3, 1, 0.3] }],
        // ...then flip it nozzle-down between his feet and ride the spray.
        [11, {
          lProp: 'club', lArm: [0.45, -0.9, 0.1], lFore: [0.2, -1, 0.3], look: -0.3,
          rArm: [0.3, 0.9, 0.5], rFore: [0.2, 1, 0.3], ...STAND_LEGS,
        }],
        [30, {}],
        [38, { look: 0.2 }],
      ]),
    },

    // DOWN SPECIAL - Snack Dig: digs a snack out of the ground and eats it.
    // Heals 2-5% and adds a munchies stack (+4% power each, up to 5) until
    // he's KO'd. Slow, so do it when nobody's close. In the air he dives
    // feet-first (spiking anyone below) and digs in wherever he lands.
    dspecial: {
      total: 80, limb: 'arm', scripted: true, ledgeGrab: true, cpuHeal: true,
      onStart(f) {
        f.move.snack = pickSnack();
        if (f.grounded) f.move.frame = DIG;
      },
      onFrame(f, frame, input, world) {
        const m = f.move;
        if (frame <= DIG && !f.grounded) {
          if (frame < 4) {
            f.vx *= 0.8;
            f.vy = Math.max(f.vy, 1);
          } else {
            f.vx = 0;
            f.vy = -18;
            m.frame = 4; // keep diving until he lands
          }
          return;
        }
        f.vx *= 0.7;
        if (frame > DIG && frame <= 31 && frame % 4 === 2) world.effects.dirt(f.x + 0.45 * f.facing, f.y + 0.1, -f.facing);
        if (frame === 34) {
          world.effects.text(f.x, f.y + f.h + 0.75, SNACKS[m.snack].label, '#ffd23f', 0.5, 0.42); // gone before the heal number shows
          world.effects.spark(f.x + 0.3 * f.facing, f.y + 2.1, 0xfff6a0, 0.5);
        }
        if (frame >= 46 && frame <= 58 && frame % 4 === 2) world.effects.crumbs(...mouth(f));
        if (frame === 60) eatSnack(f, world);
      },
      hitboxes: [
        { start: 4, end: 4, x: 0.1, y: -0.05, r: 0.55, dmg: 7, base: 6, growth: 0.6, angle: -65 },
      ],
      pose(frame, f) {
        const p = { ...digPose(frame) };
        if (frame >= 33 && frame < 61) p.lHeld = f.move.snack;
        // No microscope in hand: dig with both hands.
        if (f.handEmpty.right && frame >= DIG && frame < 32) {
          const q = digPose(frame + 4);
          p.rArm = [q.lArm[0], q.lArm[1], -q.lArm[2]];
          p.rFore = [q.lFore[0], q.lFore[1], -q.lFore[2]];
        }
        return p;
      },
    },
  },
};
