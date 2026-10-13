// Procedural poses shared by the placeholder figures and rigged (Mixamo-style) models.
//
// A pose is a set of limb directions in "body space":
//   +x = the way the fighter faces, +y = up, +z = the fighter's right side.
// Upper limbs: rArm/lArm (shoulder -> elbow), rFore/lFore (elbow -> hand; 'mouth' aims the hand at the mouth).
// Lower limbs: rThigh/lThigh (hip -> knee), rShin/lShin (knee -> ankle).
// Extras: lean (forward bend, radians), look (head tilt up, radians), crouch (0-1),
// spin (yaw, radians), rProp/lProp ('club' = along the forearm, 'upright' = held vertical),
// glow (0-1, lights up a held prop like the dab pen).

const GUARD = {
  rArm: [0.25, -1, 0.3], rFore: [1, 0.7, 0.1],
  lArm: [0.2, -1, -0.3], lFore: [1, 0.8, -0.1],
  rThigh: [0.15, -1, 0.12], rShin: [-0.05, -1, 0.1],
  lThigh: [-0.15, -1, -0.12], lShin: [-0.1, -1, -0.1],
  lean: 0.05, look: 0, crouch: 0, spin: 0, rProp: 'club', lProp: 'club', glow: 0,
};

const STATES = {
  idle: {},
  crouch: {
    rThigh: [0.75, -0.65, 0.15], rShin: [-0.45, -0.9, 0.1],
    lThigh: [0.55, -0.8, -0.15], lShin: [-0.55, -0.85, -0.1],
    crouch: 1, lean: 0.25,
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
  hurt: {
    rArm: [-0.3, 0.9, 0.6], rFore: [-0.5, 0.8, 0.3], lArm: [-0.2, 0.9, -0.6], lFore: [-0.4, 0.9, -0.3],
    rThigh: [0.45, -0.9, 0.3], rShin: [-0.5, -0.85, 0.2], lThigh: [-0.25, -1, -0.3], lShin: [-0.4, -0.9, -0.2],
    lean: -0.35, look: 0.35,
  },
};

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

  const tx = hb?.x ?? 0.9;
  const ty = hb?.y ?? 1.3;
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
  if (f.hitstun > 0) return 'hurt';
  if (f.move) return 'attack';
  if (f.shielding || f.jumpsquat > 0 || f.landingLag > 0) return 'crouch';
  if (!f.grounded) return f.helpless ? 'helpless' : f.vy > 0 ? 'rise' : 'fall';
  if (Math.abs(f.vx) > 0.5) return 'run';
  return 'idle';
}

export function computePose(f, time) {
  const state = stateOf(f);
  const overrides = f.character.poses?.[state];
  let pose;
  if (state === 'attack') {
    const { def, frame } = f.move;
    pose = { ...GUARD, ...f.character.poses?.idle, ...(def.pose ? def.pose(frame, f) : attackPose(def, frame)) };
  } else if (state === 'run') {
    pose = { ...GUARD, ...runPose(f, time), ...overrides };
  } else {
    pose = { ...GUARD, ...STATES[state], ...overrides };
  }
  if (state === 'idle') pose.lean += Math.sin(time * 3) * 0.03; // breathing
  if (state === 'helpless') {
    const w = Math.sin(time * 14) * 0.3;
    pose.rFore = [w, 1, 0.3];
    pose.lFore = [-w, 1, -0.3];
  }
  pose.state = state;
  return pose;
}
