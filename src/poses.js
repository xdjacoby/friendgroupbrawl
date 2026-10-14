// Procedural poses shared by the placeholder figures and rigged (Mixamo-style) models.
//
// A pose is a set of limb directions in "body space":
//   +x = the way the fighter faces, +y = up, +z = the fighter's right side.
// Upper limbs: rArm/lArm (shoulder -> elbow), rFore/lFore (elbow -> hand; 'mouth' aims the hand at the mouth).
// Lower limbs: rThigh/lThigh (hip -> knee), rShin/lShin (knee -> ankle).
// Extras: lean (forward bend, radians), look (head tilt up, radians), crouch (0-1;
// up to 2 for a deep duck, it lowers the body 0.2m per 1),
// spin (yaw, radians), pitch (whole-body flip around the waist, radians, + = backflip),
// rProp/lProp ('club' = along the forearm, 'upright' = held vertical),
// rHeld/lHeld (show this prop in that hand instead of the usual one; null = empty hand),
// glow (0-1, lights up a held prop like the dab pen, or inflates Jacoby's chip bag).
//
// Attacks use keyframes() so the swing lands on the same frames as the hitbox.
// Handy reference points (body space, model scaled to 1.8m): shoulders ~1.45m up,
// hips ~0.92m, an arm reaches ~0.62m and a leg ~0.95m.

const GUARD = {
  rArm: [0.25, -1, 0.3], rFore: [1, 0.7, 0.1],
  lArm: [0.2, -1, -0.3], lFore: [1, 0.8, -0.1],
  rThigh: [0.15, -1, 0.12], rShin: [-0.05, -1, 0.1],
  lThigh: [-0.15, -1, -0.12], lShin: [-0.1, -1, -0.1],
  lean: 0.05, look: 0, crouch: 0, spin: 0, rProp: 'club', lProp: 'club', glow: 0,
};

// Both hands out in front, gripping someone you've grabbed.
export const HOLD = {
  rArm: [0.95, -0.35, 0.3], rFore: [1, 0.05, -0.2], lArm: [0.95, -0.35, -0.3], lFore: [1, 0.05, 0.2],
  lean: 0.15,
};

const STATES = {
  idle: {},
  hold: HOLD,
  // Grabbed: leaning back, arms up, legs kicking (see computePose).
  held: {
    rArm: [0.3, 0.6, 0.7], rFore: [0.4, 0.9, 0.3], lArm: [0.3, 0.6, -0.7], lFore: [0.4, 0.9, -0.3],
    rThigh: [0.3, -1, 0.2], rShin: [-0.2, -1, 0.1], lThigh: [-0.1, -1, -0.2], lShin: [-0.3, -1, -0.1],
    lean: -0.3, look: 0.2,
  },
  crouch: {
    rThigh: [0.75, -0.65, 0.15], rShin: [-0.45, -0.9, 0.1],
    lThigh: [0.55, -0.8, -0.15], lShin: [-0.55, -0.85, -0.1],
    crouch: 1, lean: 0.25,
  },
  // Holding down: a deep duck, low enough for high attacks to pass over.
  duck: {
    rThigh: [1, -0.3, 0.2], rShin: [-0.55, -0.85, 0.15],
    lThigh: [0.85, -0.5, -0.2], lShin: [-0.7, -0.7, -0.15],
    crouch: 1.9, lean: 0.55, look: 0.35,
  },
  rise: {
    rArm: [0.15, 0.95, 0.45], rFore: [0.2, 1, 0.2], lArm: [0.1, 0.9, -0.5], lFore: [0.2, 1, -0.2],
    rThigh: [0.8, -0.45, 0.1], rShin: [-0.1, -1, 0.1], lThigh: [0.1, -1, -0.1], lShin: [-0.5, -0.85, -0.1],
  },
  fall: {
    rArm: [0.7, 0.35, 0.45], rFore: [0.8, 0.6, 0.3], lArm: [-0.6, 0.35, -0.45], lFore: [-0.5, 0.7, -0.3],
    rThigh: [0.35, -1, 0.15], rShin: [-0.3, -1, 0.1], lThigh: [-0.15, -1, -0.15], lShin: [-0.35, -1, -0.1],
  },
  helpless: {
    rArm: [-0.1, 1, 0.5], rFore: [-0.1, 1, 0.3], lArm: [-0.1, 1, -0.5], lFore: [-0.1, 1, -0.3],
    rThigh: [0.2, -1, 0.3], rShin: [-0.2, -1, 0.2], lThigh: [-0.2, -1, -0.3], lShin: [-0.2, -1, -0.2],
    look: 0.3,
  },
  // Hanging from a ledge (facing the stage): both hands up on the edge, legs dangling.
  ledge: {
    rArm: [0.5, 1, 0.3], rFore: [0.6, 1, 0.15], lArm: [0.5, 1, -0.3], lFore: [0.6, 1, -0.15],
    rThigh: [0.15, -1, 0.12], rShin: [0, -1, 0.1], lThigh: [-0.05, -1, -0.12], lShin: [-0.1, -1, -0.1],
    lean: 0.1, look: 0.2,
  },
  // Hauling yourself up over the edge.
  climb: {
    rArm: [0.6, -0.5, 0.3], rFore: [0.6, -0.8, 0.2], lArm: [0.6, -0.5, -0.3], lFore: [0.6, -0.8, -0.2],
    rThigh: [0.8, -0.4, 0.15], rShin: [-0.3, -1, 0.1], lThigh: [0.2, -1, -0.15], lShin: [-0.5, -0.85, -0.1],
    lean: 0.45,
  },
  hurt: {
    rArm: [-0.3, 0.9, 0.6], rFore: [-0.5, 0.8, 0.3], lArm: [-0.2, 0.9, -0.6], lFore: [-0.4, 0.9, -0.3],
    rThigh: [0.45, -0.9, 0.3], rShin: [-0.5, -0.85, 0.2], lThigh: [-0.25, -1, -0.3], lShin: [-0.4, -0.9, -0.2],
    lean: -0.35, look: 0.35,
  },
};

// ---- Keyframes ----

const slerpDir = (a, b, t) => {
  const la = Math.hypot(a[0], a[1], a[2]) || 1;
  const lb = Math.hypot(b[0], b[1], b[2]) || 1;
  const u = [a[0] / la, a[1] / la, a[2] / la];
  const v = [b[0] / lb, b[1] / lb, b[2] / lb];
  const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-3 || omega > Math.PI - 1e-3) return u.map((x, i) => x + (v[i] - x) * t);
  const s = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / s;
  const wb = Math.sin(t * omega) / s;
  return u.map((x, i) => x * wa + v[i] * wb);
};

function blend(a, b, t) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k];
    const y = b[k];
    if (x === undefined) out[k] = y;
    else if (y === undefined) out[k] = x;
    else if (Array.isArray(x) && Array.isArray(y)) out[k] = slerpDir(x, y, t);
    else if (typeof x === 'number' && typeof y === 'number') out[k] = x + (y - x) * t;
    else out[k] = t < 0.5 ? x : y;
  }
  return out;
}

// keyframes([[frame, pose], ...]) -> pose(frame). Each key keeps whatever the key
// before it set, and limbs swing smoothly (at a constant speed) from key to key.
// Keep keys less than ~150 degrees apart so a swing goes the way you expect.
export function keyframes(keys) {
  const full = [];
  let acc = {};
  for (const [frame, pose] of keys) {
    acc = { ...acc, ...pose };
    full.push([frame, acc]);
  }
  return (frame) => {
    if (frame <= full[0][0]) return full[0][1];
    for (let i = 1; i < full.length; i++) {
      const [f1, b] = full[i];
      if (frame <= f1) {
        const [f0, a] = full[i - 1];
        return blend(a, b, (frame - f0) / Math.max(1, f1 - f0));
      }
    }
    return full[full.length - 1][1];
  };
}

// Direction at `angle` radians from straight down, swinging toward +x.
const swingDir = (angle, z = 0) => [Math.sin(angle), -Math.cos(angle), z];

function runPose(f, time) {
  const speed = Math.abs(f.vx);
  const amp = Math.min(1.0, speed / 8);
  const s = Math.sin(time * (6 + speed * 0.9)) * amp;
  return {
    rThigh: swingDir(s * 0.9, 0.1), rShin: swingDir(s * 0.9 - 0.4 - Math.max(0, -s) * 0.8, 0.1),
    lThigh: swingDir(-s * 0.9, -0.1), lShin: swingDir(-s * 0.9 - 0.4 - Math.max(0, s) * 0.8, -0.1),
    rArm: swingDir(-s * 0.8, 0.25), rFore: swingDir(-s * 0.8 + 1.5, 0.1),
    lArm: swingDir(s * 0.8, -0.25), lFore: swingDir(s * 0.8 + 1.5, -0.1),
    lean: 0.25 * amp,
  };
}

// Generic attack pose: swing the limb from its joint toward the move's first hitbox.
function attackPose(def, frame) {
  const hb = def.hitboxes[0];
  const start = hb?.start ?? def.projectileFrame ?? 8;
  const end = hb?.end ?? start + 4;
  const t = frame < start ? frame / start : frame <= end ? 1 : 0.6;

  if (def.limb === 'spin') {
    const spinT = Math.max(0, frame - start) / Math.max(1, end - start);
    return {
      spin: frame >= start && frame <= end ? spinT * Math.PI * 2 : 0,
      rArm: [0.1, 0, 1], rFore: [0.2, 0, 1], lArm: [0.1, 0, -1], lFore: [0.2, 0, -1],
      rThigh: [0.7, -0.7, 0.2], rShin: [0.2, -1, 0.1], lThigh: [-0.6, -0.8, -0.2], lShin: [-0.3, -1, -0.1],
    };
  }

  const tx = hb?.x ?? hb?.path?.[0][1] ?? 0.9;
  const ty = hb?.y ?? hb?.path?.[0][2] ?? 1.3;
  const isArm = def.limb === 'arm';
  const jointY = isArm ? 1.45 : 0.92;
  const aim = Math.atan2(tx, -(ty - jointY));
  const windup = aim - Math.sign(tx || 1) * 1.3;
  const angle = frame < start ? windup * t : frame <= end ? aim : aim * 0.75;
  const dir = swingDir(angle, isArm ? 0.25 : 0.1);

  if (isArm) {
    return { rArm: dir, rFore: dir, lean: frame >= start ? 0.2 : -0.05 };
  }
  return {
    rThigh: dir, rShin: dir,
    lThigh: [-0.2 * Math.sign(tx || 1), -1, -0.12], lShin: [-0.1, -1, -0.1],
    rArm: [-0.4 * Math.sign(tx || 1), -0.5, 0.8], rFore: [0, 0.3, 1],
    lArm: [0.4 * Math.sign(tx || 1), -0.5, -0.8], lFore: [0, 0.3, -1],
    lean: -0.25 * Math.sign(tx || 1),
  };
}

export function stateOf(f) {
  if (f.heldBy) return 'held';
  if (f.hitstun > 0) return 'hurt';
  if (f.ledge) return f.ledge.action ? 'climb' : 'ledge';
  if (f.move) return 'attack';
  if (f.holding) return 'hold';
  if (f.crouching) return 'duck';
  if (f.shielding || f.jumpsquat > 0 || f.landingLag > 0) return 'crouch';
  if (!f.grounded) return f.helpless ? 'helpless' : f.vy > 0 ? 'rise' : 'fall';
  if (Math.abs(f.vx) > 0.5) return 'run';
  return 'idle';
}

export function computePose(f, time) {
  const state = stateOf(f);
  const poses = f.character.poses ?? {};
  // Character poses can be functions of the fighter (e.g. Jacoby holding out a snack).
  const get = (name) => (typeof poses[name] === 'function' ? poses[name](f) : poses[name]);
  // Characters' crouch arms carry over to the duck.
  const overrides = get(state) ?? (state === 'duck' ? get('crouch') : undefined);
  // `poses.base` applies in every state (e.g. how a prop is held), under everything else.
  const base = { ...GUARD, ...get('base') };
  let pose;
  if (state === 'attack') {
    const { def, frame } = f.move;
    pose = { ...base, ...get('idle'), ...(def.pose ? def.pose(frame, f) : attackPose(def, frame)) };
  } else if (state === 'run') {
    pose = { ...base, ...runPose(f, time), ...overrides };
  } else {
    pose = { ...base, ...STATES[state], ...overrides };
  }
  if (state === 'idle') pose.lean += Math.sin(time * 3) * 0.03; // breathing
  if (state === 'held') {
    const w = Math.sin(time * 16) * 0.5;
    pose.rShin = [w, -1, 0.1];
    pose.lShin = [-w, -1, -0.1];
  }
  if (state === 'helpless') {
    const w = Math.sin(time * 14) * 0.3;
    pose.rFore = [w, 1, 0.3];
    pose.lFore = [-w, 1, -0.3];
  }
  pose.state = state;
  return pose;
}
