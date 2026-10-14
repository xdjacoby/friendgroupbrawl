import { keyframes, HOLD } from '../poses.js';
import { REST as GUARD_REST, GRABS } from '../moves.js';

// Jacoby: carries a magnifying glass in his right hand and digs snacks out of
// the ground. He holds one snack at a time in his left hand: throw it at
// someone, or eat it to heal a little and stack "munchies" (he hits harder
// until he's KO'd). The magnifying glass is his side special: once thrown it
// lies where it lands until he walks over it, or pops back into his hand a
// few seconds after falling off the stage. Try to throw it again without it
// and he stands there patting his pockets.
// Frame data format: see src/moves.js. Poses: see src/poses.js.

// heal: % healed when eaten. thrown: the projectile when he throws it instead
// (every snack flies its own way). See the projectile fields in moves.js.
const SNACKS = {
  chips: {
    label: 'CHIPS!', emoji: '🍟', heal: 3, weight: 30,
    // A lob that bursts into crumbs where it lands.
    thrown: { speed: 9, vy: 5, gravity: 22, spin: 10, life: 120, r: 0.3, dmg: 5, base: 5.5, growth: 0.45, angle: 45, burst: 0xf2c14e },
  },
  cookie: {
    label: 'COOKIE!', emoji: '🍪', heal: 4, weight: 30,
    // Flies flat and fast like a frisbee, but not far.
    thrown: { speed: 15, vy: 0.6, gravity: 2.5, spin: 25, life: 45, r: 0.28, dmg: 4, base: 4.5, growth: 0.35, angle: 25, burst: 0xd9a05b },
  },
  donut: {
    label: 'DONUT!', emoji: '🍩', heal: 4, weight: 25,
    // Bounces down and rolls along the floor, tripping people up.
    thrown: { speed: 8, vy: 3, gravity: 22, roll: true, spin: 9, life: 150, r: 0.3, dmg: 6, base: 6, growth: 0.5, angle: 60, burst: 0xff7eb6 },
  },
  pizza: {
    label: 'PIZZA!', emoji: '🍕', heal: 7, weight: 15,
    // Rare and heavy: a slow lob that really sends.
    thrown: { speed: 7.5, vy: 6.5, gravity: 24, spin: 7, life: 140, r: 0.36, dmg: 9, base: 7, growth: 0.75, angle: 40, burst: 0xffcf4a },
  },
};
const MAX_MUNCHIES = 5;
const MUNCHIE_POWER = 0.04; // +4% damage and knockback per snack eaten

function pickSnack() {
  const total = Object.values(SNACKS).reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (const [name, s] of Object.entries(SNACKS)) {
    roll -= s.weight;
    if (roll < 0) return name;
  }
  return 'chips';
}

function eatSnack(f, snack, world) {
  f.heal(SNACKS[snack].heal, world);
  const st = f.charState;
  st.munchies = Math.min(MAX_MUNCHIES, (st.munchies ?? 0) + 1);
  f.powerBonus = st.munchies * MUNCHIE_POWER;
  const label = st.munchies >= MAX_MUNCHIES ? 'MAX MUNCHIES' : `MUNCHIES x${st.munchies}`;
  world.effects.text(f.x, f.y + f.h + 1.05, label, '#ffb347', 0.4, 1.2);
}

// Where his mouth is (for crumbs).
const mouth = (f) => [f.x + 0.18 * f.facing * f.stats.scale, f.y + 1.62 * f.stats.scale];

// Magnifying glass held up in front of him like he's inspecting something, left fist up.
const IDLE = { rArm: [0.25, -1, 0.3], rFore: [0.85, 0.6, 0.1], lArm: [0.2, -1, -0.3], lFore: [1, 0.8, -0.1] };
const REST = { ...GUARD_REST, ...IDLE, rProp: 'club' };
// Showing off the snack he's carrying: left hand out in front of him.
const SNACK_OUT = { lArm: [0.45, -0.85, 0.1], lFore: [0.8, 0.45, 0.45], lProp: 'upright' };
const CROUCH_LEGS = { rThigh: [0.75, -0.65, 0.15], rShin: [-0.45, -0.9, 0.1], lThigh: [0.55, -0.8, -0.15], lShin: [-0.55, -0.85, -0.1] };
const STAND_LEGS = { rThigh: REST.rThigh, rShin: REST.rShin, lThigh: REST.lThigh, lShin: REST.lShin };

// Winding up and letting go of the magnifying glass (shared by the real throw and the whiff).
const THROW_WINDUP = { rArm: [-0.6, 0.8, 0.3], rFore: [-0.3, 1, 0.2], lArm: [0.8, 0.1, -0.3], lFore: [1, 0.3, -0.1], lean: -0.2 };
const THROW_RELEASE = { rArm: [1, 0.2, 0.2], rFore: [1, -0.1, 0.1], lArm: [0.2, -1, -0.4], lFore: [-0.2, -0.6, -0.6], lean: 0.3 };

// Snack Dig: hand down in the dirt / scooping it back over his shoulder.
const SCOOP_DOWN = { lArm: [0.7, -0.7, -0.3], lFore: [0.5, -1, -0.1] };
const SCOOP_BACK = { lArm: [0.3, -0.6, -0.6], lFore: [-0.3, 0.2, -0.7] };
const DIG = 6; // first digging frame (frames before it are the dive when used in the air)
const FOUND = 34; // the frame the snack comes out of the ground

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
  [40, {}],
  [46, { ...REST, ...STAND_LEGS, crouch: 0, rArm: [0.1, -1, 0.5], rFore: [-0.2, -0.6, 0.8] }],
]);

// Eating: hand to mouth, munch munch, pat the belly.
const eatPose = keyframes([
  [0, REST],
  [5, { lArm: [0.45, -0.75, -0.3], lFore: 'mouth', lean: 0.05 }],
  [9, { look: -0.12 }],
  [13, { look: 0.05 }],
  [17, { look: -0.12 }],
  [21, { look: 0.05 }],
  [25, { look: -0.12 }],
  [30, { look: 0.1, lArm: [0.2, -1, -0.2], lFore: [0.6, 0.1, 0.8] }],
  [36, { look: 0.25 }],
  [44, REST],
]);

// Mostly Air: the chip bag is inflated above his head and he hangs from it.
const BAG = 8; // the bag puffs up
const RISE_END = 28; // stops rising, starts floating
const FLOAT_END = 150; // the bag pops

export const JACOBY = {
  id: 'jacoby',
  name: 'Jacoby',
  tagline: 'Magnifying glass + bottomless snacks',
  color: 0xe67e22,
  model: 'models/jacoby.glb',
  props: { right: 'magnifyingGlass' },
  stats: { weight: 100, runSpeed: 8, airSpeed: 6.3, jump: 15, gravity: 40, maxFall: 14.5, power: 1.0, scale: 1.0 },

  // HUD line under his name: the glass (while he has it), the snack in his
  // hand and his munchies stacks.
  hud: (f) => {
    const st = f.charState;
    return `${f.handEmpty.right ? '' : '🔎'}${st.snack ? SNACKS[st.snack].emoji : ''}${st.munchies ? ` 😋x${st.munchies}` : ''}`;
  },

  poses: {
    // The glass sticks out past his fist; a snack he's dug up stays in his left hand.
    base: (f) => ({ rProp: 'club', ...(f.charState.snack && { lHeld: f.charState.snack }) }),
    idle: (f) => (f.charState.snack ? { ...IDLE, ...SNACK_OUT } : IDLE),
    crouch: { rArm: [0.2, -1, 0.35], rFore: [0.8, 0.3, 0.2], lArm: [0.2, -1, -0.3], lFore: [1, 0.8, -0.1] },
  },

  // Victory: inspects the camera up close with the magnifying glass, then
  // celebrates with a slice of pizza.
  victory: {
    quote: 'Case closed. Where are the snacks?',
    pose: (frame) => {
      const p = { ...victoryPose(frame) };
      if (frame >= 56) p.lHeld = 'pizza';
      return p;
    },
    onFrame(frame, { effects, x, y }) {
      if (frame >= 70 && frame < 100 && frame % 5 === 0) effects.crumbs(x + 0.2, y + 1.6, 0xffcf4a);
      if (frame === 104) effects.text(x + 0.8, y + 1.45, 'mmm', '#ffd23f', 0.36, 1.2);
    },
  },

  // CPU habits: dig when there's room, eat when hurt, throw from range.
  cpu(f, { dist }) {
    if (!f.grounded) return null;
    const snack = f.charState.snack;
    if (!snack && dist > 5 && Math.random() < 0.03) return { special: true };
    if (snack && f.percent > 25 && dist > 5 && Math.random() < 0.04) return { special: true, y: -1 };
    if (snack && dist > 2.5 && dist < 8 && Math.random() < 0.03) return { special: true, face: true };
    return null;
  },

  moves: {
    // ---- Normals (the rest are the shared ones from moves.js) ----

    // FORWARD TILT - Lens Bash: swings the magnifying glass like a hammer.
    // Without it he just punches (the orange hitbox only counts while he holds it).
    ftilt: {
      total: 28, limb: 'arm',
      hitboxes: [
        { start: 8, end: 11, x: 1.0, y: 1.38, r: 0.5, dmg: 11, base: 7.5, growth: 1.0, angle: 35, prop: 'right' },
        { start: 8, end: 11, x: 0.55, y: 1.4, r: 0.42, dmg: 7, base: 6, growth: 0.7, angle: 35 },
      ],
      pose: keyframes([
        [0, REST],
        [5, { rArm: [-0.4, -0.3, 0.7], rFore: [-0.5, 0.4, 0.6], lean: -0.1 }],
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

    // FORWARD AIR - Glass Hammer: overhead swing with the magnifying glass.
    fair: {
      total: 36, limb: 'arm', aerial: true, landingLag: 12,
      hitboxes: [
        { start: 9, end: 13, path: [[9, 0.7, 2.15], [11, 1.05, 1.3], [13, 0.6, 0.6]], r: 0.55, dmg: 13, base: 7, growth: 1.05, angle: 40, prop: 'right' },
        { start: 9, end: 13, path: [[9, 0.45, 1.9], [11, 0.7, 1.38], [13, 0.45, 0.85]], r: 0.42, dmg: 9, base: 6, growth: 0.85, angle: 40 },
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

    // DOWN THROW - Close Inspection: holds the magnifying glass over them and
    // burns them with focused sunlight, then lets them pop off. Without the
    // glass it's the normal slam.
    dthrow: {
      total: 40, hitboxes: [],
      available: (f) => !f.handEmpty.right,
      fallback: 'dthrowPlain',
      throw: { frame: 30, dmg: 3, base: 7.5, growth: 0.6, angle: 80 },
      carry: [[0, 0.88, 0.05], [30, 0.88, 0.05]],
      onFrame(f, frame, input, world) {
        const v = f.holding?.victim;
        if (!v) return;
        const x = v.x;
        const y = v.y + v.h * 0.85;
        if (frame >= 10 && frame < 30 && frame % 3 === 0) world.effects.spark(x, y, 0xffb030, 0.25);
        if (frame === 12 || frame === 19 || frame === 26) {
          f.pummelHeld(world, 1.5);
          world.effects.puff(x, y, 0.3, 0x6b6b6b, 1.5);
        }
        if (frame === 13) world.effects.text(x, y + 0.6, 'TSSS', '#ffb030', 0.45, 0.8);
      },
      pose: keyframes([
        [0, HOLD],
        [8, { rArm: [0.8, 0.45, 0.3], rFore: [0.85, -0.35, 0.05], lean: 0.25, look: -0.2 }],
        [30, { lean: 0.3 }],
        [34, { rArm: GUARD_REST.rArm, rFore: IDLE.rFore, lean: 0.05, look: 0 }],
        [40, REST],
      ]),
    },
    dthrowPlain: GRABS.dthrow,

    // ---- Specials ----

    // NEUTRAL SPECIAL - Snack Dig: digs a snack out of the ground and holds it
    // up: chips, cookie, donut or (rarely) pizza. He can only carry one, so
    // with a snack in hand the same button throws it instead (Snack Toss).
    // Slow, so dig when nobody's close. In the air he dives feet-first
    // (spiking anyone below) and digs in wherever he lands.
    nspecial: {
      total: 46, limb: 'arm', scripted: true, ledgeGrab: true,
      available: (f) => !f.charState.snack,
      fallback: 'snackToss',
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
        if (frame === FOUND) {
          f.charState.snack = m.snack;
          world.effects.text(f.x, f.y + f.h + 0.75, SNACKS[m.snack].label, '#ffd23f', 0.5, 0.7);
          world.effects.spark(f.x + 0.3 * f.facing, f.y + 2.1, 0xfff6a0, 0.5);
        }
      },
      hitboxes: [
        { start: 4, end: 4, x: 0.1, y: -0.05, r: 0.55, dmg: 7, base: 6, growth: 0.6, angle: -65 },
      ],
      pose(frame, f) {
        const p = { ...digPose(frame) };
        if (frame >= FOUND - 1) p.lHeld = f.move.snack;
        // No magnifying glass in hand: dig with both hands.
        if (f.handEmpty.right && frame >= DIG && frame < 32) {
          const q = digPose(frame + 4);
          p.rArm = [q.lArm[0], q.lArm[1], -q.lArm[2]];
          p.rFore = [q.lFore[0], q.lFore[1], -q.lFore[2]];
        }
        return p;
      },
    },

    // ...with a snack in hand: Snack Toss. Every snack flies differently:
    // chips lob, a cookie flies flat like a frisbee, a donut rolls along the
    // floor, and pizza is a heavy lob that hits hardest.
    snackToss: {
      total: 30, limb: 'arm',
      onFrame(f, frame, input, world) {
        const snack = f.charState.snack;
        if (frame !== 11 || !snack) return;
        world.spawnProjectile(f, { look: 'prop', prop: snack, x: 0.55, y: 1.5, ...SNACKS[snack].thrown });
        f.charState.snack = null;
      },
      hitboxes: [],
      pose: keyframes([
        [0, REST],
        [8, { lArm: [-0.6, 0.75, -0.35], lFore: [-0.3, 1, -0.2], lean: -0.2, look: 0.1 }],
        [11, { lArm: [1, 0.15, -0.2], lFore: [1, -0.05, -0.1], lean: 0.3, look: 0 }],
        [16, {}],
        [28, REST],
      ]),
    },

    // SIDE SPECIAL - Magnifying Glass Toss: lobs the magnifying glass. It
    // bonks whoever it hits, then lies on the floor until he picks it up (walk
    // over it). Falls off the stage? It pops back into his hand after 3
    // seconds. Left on the floor for 10 seconds, it comes back too.
    sspecial: {
      total: 38, limb: 'arm', projectileFrame: 14,
      available: (f) => !f.handEmpty.right,
      fallback: 'sspecialEmpty',
      projectile: {
        look: 'prop', prop: 'magnifyingGlass', x: 0.7, y: 1.6,
        speed: 8.5, vy: 6.5, gravity: 26, spin: 14, life: 900, r: 0.32,
        dmg: 9, base: 7, growth: 0.8, angle: 40,
        pickup: 'right', restLife: 600, returnFrames: 180, restLift: 0.2, restAngle: Math.PI / 2,
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

    // ...and what happens when he tries it without the glass: throws
    // nothing, stares at his empty hand, pats his pockets, shrugs. Wide open.
    sspecialEmpty: {
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
        [30, { rArm: [0.4, -0.6, 0.4], rFore: [0.3, 0.9, 0.2], look: -0.25, lean: 0.05 }],
        [44, {}],
        [50, { rArm: [0.05, -1, 0.35], rFore: [0.2, -1, 0.3], lArm: [0.05, -1, -0.35], lFore: [0.2, -1, -0.3], look: -0.4 }],
        [54, { rFore: [0.5, -0.8, 0.3], lFore: [0.5, -0.8, -0.3] }],
        [58, { rFore: [0.2, -1, 0.3], lFore: [0.2, -1, -0.3] }],
        [62, { rFore: [0.5, -0.8, 0.3], lFore: [0.5, -0.8, -0.3] }],
        [66, { rArm: [0.1, -0.5, 1], rFore: [0.3, 0.8, 0.6], lArm: [0.1, -0.5, -1], lFore: [0.3, 0.8, -0.6], look: 0.15 }],
        [75, REST],
      ]),
    },

    // UP SPECIAL - Mostly Air: rips open a family-size bag of chips (it's 90%
    // air) and it puffs up like a balloon. The bag bonks anyone above him on
    // the way up, then he floats down slowly, drifting left/right. Not much
    // height, but a long float: hold toward the stage. Down or shield lets go
    // early. The bag pops after a few seconds and he falls helpless.
    uspecial: {
      total: FLOAT_END, limb: 'arm', scripted: true, helplessAfter: true, ledgeGrab: true, landingLag: 8,
      onFrame(f, frame, input, world) {
        const m = f.move;
        if (frame < BAG) {
          f.vx *= 0.85;
          if (!f.grounded) f.vy = Math.max(f.vy, -1.5);
          return;
        }
        if (frame === BAG) {
          world.effects.text(f.x, f.y + f.h + 1.0, 'FWUMP', '#ffd23f', 0.45, 0.6);
          world.effects.crumbs(f.x, f.y + 2.3, 0xf2c14e);
        }
        f.grounded = false;
        f.platform = null;
        if (frame <= RISE_END) {
          f.vy = 12.5;
          f.vx = (input.x || 0) * 4;
          return;
        }
        // Floating: drift slowly and sink.
        f.vy = Math.max(f.vy, -2.2);
        f.vx += ((input.x || 0) * 3.2 - f.vx) * 0.08;
        if (input.downPressed || input.shieldPressed || frame === FLOAT_END) {
          world.effects.text(f.x, f.y + f.h + 0.9, 'POP!', '#ffffff', 0.5, 0.6);
          world.effects.crumbs(f.x, f.y + 2.4, 0xf2c14e);
          m.frame = FLOAT_END; // ends the move: helpless from here
        }
      },
      hitboxes: [
        { start: BAG, end: BAG + 3, x: 0.1, y: 1.3, r: 0.75, dmg: 4, base: 6, growth: 0.3, angle: 80, group: 0 },
        { start: BAG + 2, end: 16, x: 0.1, y: 2.7, r: 0.7, dmg: 4, base: 6.5, growth: 0.4, angle: 85, group: 1 },
        { start: 18, end: RISE_END, x: 0.1, y: 2.8, r: 0.7, dmg: 3, base: 7.5, growth: 0.6, angle: 85, group: 2 },
      ],
      pose: keyframes([
        [0, REST],
        // Pulls the bag out and rips it open...
        [3, { lHeld: 'chipBag', lProp: 'upright', lArm: [0.7, -0.4, -0.15], lFore: [0.5, 0.8, -0.35], look: -0.1, glow: 0 }],
        [6, { rArm: [0.6, -0.4, 0.3], rFore: [0.3, 0.9, -0.2], glow: 0.25 }],
        // ...FWUMP. Up he goes, hanging on with his left hand.
        [BAG + 2, {
          lArm: [0.1, 1, -0.3], lFore: [0.05, 1, -0.1], glow: 1, look: 0.35,
          rArm: [0.4, -0.2, 0.9], rFore: [0.6, 0.5, 0.5],
          rThigh: [0.2, -1, 0.15], rShin: [0, -1, 0.1], lThigh: [-0.1, -1, -0.15], lShin: [-0.2, -1, -0.1],
        }],
        [RISE_END, { look: 0.2 }],
        // Floating: legs dangling, the bag slowly losing air.
        [60, { rShin: [0.3, -1, 0.1], lShin: [-0.35, -1, -0.1], glow: 0.9 }],
        [90, { rShin: [-0.2, -1, 0.1], lShin: [0.2, -1, -0.1], glow: 0.8 }],
        [120, { rShin: [0.3, -1, 0.1], lShin: [-0.3, -1, -0.1], glow: 0.7 }],
        [FLOAT_END, { glow: 0.6 }],
      ]),
    },

    // DOWN SPECIAL - Snack Time: eats the snack in his hand. Heals 3-7% and
    // adds a munchies stack (+4% power each, up to 5) until he's KO'd.
    // No snack? He lunges mouth-first and takes a bite out of whoever's in
    // front instead (Munch).
    dspecial: {
      total: 44, limb: 'arm',
      available: (f) => !!f.charState.snack,
      fallback: 'munch',
      onStart(f) { f.move.snack = f.charState.snack; },
      onFrame(f, frame, input, world) {
        if (frame >= 7 && frame <= 25 && frame % 4 === 3) world.effects.crumbs(...mouth(f));
        if (frame === 26) {
          f.charState.snack = null;
          eatSnack(f, f.move.snack, world);
        }
      },
      hitboxes: [],
      pose(frame, f) {
        const p = { ...eatPose(frame) };
        if (frame < 26) p.lHeld = f.move.snack;
        return p;
      },
    },

    // Munch: lunges mouth-first and bites whoever's in front. Heals 1% when it connects.
    munch: {
      total: 42, limb: 'arm', scripted: true, landingLag: 12,
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
  },
};

const victoryPose = keyframes([
  [0, REST],
  [16, { rArm: [0.55, -0.35, 0.55], rFore: 'mouth', lean: 0.3, look: 0 }],
  [30, { lean: 0.4, look: -0.1 }],
  [44, { lean: 0.35, look: 0.1 }],
  [56, { rArm: IDLE.rArm, rFore: IDLE.rFore, lean: 0.05, lArm: [0.45, -0.85, 0.1], lFore: [0.8, 0.45, 0.45], lProp: 'upright' }],
  [66, { lArm: [0.45, -0.75, -0.3], lFore: 'mouth' }],
  [72, { look: -0.12 }],
  [78, { look: 0.05 }],
  [84, { look: -0.12 }],
  [90, { look: 0.05 }],
  [102, { lArm: [0.3, 0.9, -0.3], lFore: [0.2, 1, -0.1], look: 0.25 }],
]);
