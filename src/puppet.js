import * as THREE from 'three';
import { boneKey } from './rig.js';

// Drives a Mixamo-style skeleton (Meshy's auto-rig uses the same bone names)
// from the procedural poses in poses.js, so a model with only a run cycle can
// still idle, jump, attack and flinch.
//
// Hands (with the measurements from rig.js): a held prop sits in the palm and
// the fingers close around it; empty hands make a fist, relax or open
// (pose.rHand / pose.lHand); pose.rReach / pose.lReach put a hand on a point
// (a ledge, someone you're holding); and elbows and hands are kept out of the
// torso, the head and each other, so poses can't phase through the body.

const BONES = {
  hips: 'Hips', spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head',
  rArm: 'RightArm', rFore: 'RightForeArm', rHand: 'RightHand',
  lArm: 'LeftArm', lFore: 'LeftForeArm', lHand: 'LeftHand',
  rThigh: 'RightUpLeg', rShin: 'RightLeg', rFoot: 'RightFoot',
  lThigh: 'LeftUpLeg', lShin: 'LeftLeg', lFoot: 'LeftFoot',
};
const REQUIRED = ['hips', 'spine', 'head', 'rArm', 'rFore', 'rHand', 'lArm', 'lFore', 'lHand',
  'rThigh', 'rShin', 'rFoot', 'lThigh', 'lShin', 'lFoot'];

// Finger curl per joint (radians, knuckle first) for each hand shape.
const DEG = Math.PI / 180;
const CURL = {
  open: [-4 * DEG, -2 * DEG, 0],
  relax: [18 * DEG, 24 * DEG, 14 * DEG],
  grip: [62 * DEG, 64 * DEG, 40 * DEG],
  fist: [88 * DEG, 98 * DEG, 70 * DEG],
  palm: [26 * DEG, 30 * DEG, 18 * DEG],
};
const THUMB = { open: 0, relax: 12 * DEG, grip: 40 * DEG, fist: 55 * DEG, palm: 25 * DEG };
const MAX_DEVIATION = 50 * DEG; // how far the wrist bends to line a grip up

const NEG_Y = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _mouth = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _s = new THREE.Vector3();

const V = () => new THREE.Vector3();

// Rotation that takes the frame (a, k, a x k) to (A, K, A x K).
function frameRotation(a, k, A, K, out) {
  _m.makeBasis(a, k, _a.crossVectors(a, k));
  _m2.makeBasis(A, K, _b.crossVectors(A, K));
  _q2.setFromRotationMatrix(_m);
  return out.setFromRotationMatrix(_m2).multiply(_q2.invert());
}

export class Puppet {
  static from(root, rig = null) {
    const all = [];
    root.traverse((o) => o.isBone && all.push(o));
    // GLTFLoader strips ':' from names, so "mixamorig:Hips" arrives as "mixamorigHips".
    const byKey = new Map(all.map((b) => [boneKey(b.name), b]));
    const byName = new Map(all.map((b) => [b.name, b]));
    const bones = {};
    for (const [key, suffix] of Object.entries(BONES)) bones[key] = byKey.get(suffix);
    if (REQUIRED.some((k) => !bones[k])) return null;
    return new Puppet(root, all, bones, rig, byName);
  }

  constructor(root, all, bones, rig, byName) {
    this.root = root;
    this.all = all;
    this.b = bones;
    this.rig = rig;
    this.rest = new Map(all.map((b) => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));
    this.prev = new Map(all.map((b) => [b, new THREE.Quaternion()]));
    this.hands = {};
    for (const side of ['right', 'left']) {
      const info = rig?.hands[side];
      if (!info) continue;
      const r = side === 'right';
      const named = (n) => byName?.get(n);
      this.hands[side] = {
        info,
        arm: r ? bones.rArm : bones.lArm,
        fore: r ? bones.rFore : bones.lFore,
        hand: r ? bones.rHand : bones.lHand,
        fingers: info.fingers.map((chain) => chain.map(named).filter(Boolean)),
        thumb: info.thumb.map(named).filter(Boolean),
      };
    }
    // Where each hand's prop sits, relative to the hand bone (see placeProp).
    this.grips = { right: null, left: null };
  }

  // pose: from computePose(). bodyQuat: world rotation of body space. k: smoothing 0-1.
  // opts: { body (the body-space Object3D, for reach targets), held: { right, left } props }.
  apply(pose, bodyQuat, k, opts = {}) {
    const B = this.b;
    for (const b of this.all) this.prev.get(b).copy(b.quaternion);
    for (const b of this.all) {
      const r = this.rest.get(b);
      b.quaternion.copy(r.q);
      b.position.copy(r.p);
    }
    this.root.updateMatrixWorld(true);

    const side = _axis.set(0, 0, 1).applyQuaternion(bodyQuat).clone();
    const lean = pose.lean ?? 0;
    this.rotateWorld(B.spine, side, -lean * 0.5);
    this.rotateWorld(B.spine1 ?? B.spine, side, -lean * 0.5);
    this.rotateWorld(B.head, side, pose.look ?? 0);

    this.limb(B.rArm, B.rFore, pose.rArm, bodyQuat);
    this.limb(B.rFore, B.rHand, pose.rFore, bodyQuat);
    this.limb(B.lArm, B.lFore, pose.lArm, bodyQuat);
    this.limb(B.lFore, B.lHand, pose.lFore, bodyQuat);
    this.limb(B.rThigh, B.rShin, pose.rThigh, bodyQuat);
    this.limb(B.rShin, B.rFoot, pose.rShin, bodyQuat);
    this.limb(B.lThigh, B.lShin, pose.lThigh, bodyQuat);
    this.limb(B.lShin, B.lFoot, pose.lShin, bodyQuat);

    if (this.rig) {
      if (pose.rReach && opts.body) this.reach('right', pose.rReach, opts.body, bodyQuat);
      if (pose.lReach && opts.body) this.reach('left', pose.lReach, opts.body, bodyQuat);
      this.measureBody(bodyQuat);
      for (const s of ['right', 'left']) this.avoidBody(s);
      this.separateHands();
      for (const s of ['right', 'left']) this.solveHand(s, pose, bodyQuat, opts.held?.[s]);
    }

    // Ease from last frame's pose toward the new one.
    for (const b of this.all) b.quaternion.copy(this.prev.get(b).slerp(b.quaternion, k));
    this.root.updateMatrixWorld(true);
  }

  // When an animation clip moves the body (the run cycle), only the hands are ours.
  applyHands(pose, bodyQuat, opts = {}) {
    if (!this.rig) return;
    for (const s of ['right', 'left']) {
      const H = this.hands[s];
      if (!H) continue;
      for (const b of [H.hand, ...H.fingers.flat(), ...H.thumb]) b.quaternion.copy(this.rest.get(b).q);
    }
    this.root.updateMatrixWorld(true);
    this.measureBody(bodyQuat);
    for (const s of ['right', 'left']) this.solveHand(s, pose, bodyQuat, opts.held?.[s]);
    this.root.updateMatrixWorld(true);
  }

  // Where the mouth is, in world space (a bit in front of the head bone).
  mouth(bodyQuat, out = _mouth) {
    this.b.head.getWorldPosition(out);
    return out.add(_offset.set(0.12, 0.02, 0).applyQuaternion(bodyQuat));
  }

  limb(bone, child, target, bodyQuat) {
    if (!target) return;
    if (target === 'mouth') {
      bone.getWorldPosition(_c);
      _dir.copy(this.mouth(bodyQuat, _mouth)).sub(_c).normalize();
    } else {
      _dir.set(target[0], target[1], target[2]).normalize().applyQuaternion(bodyQuat);
    }
    this.aimDir(bone, child, _dir);
  }

  // Turn `bone` so `child` lies in direction `dir` (world) from it.
  aimDir(bone, child, dir) {
    const from = bone.getWorldPosition(_a);
    const current = child.getWorldPosition(_b).sub(from).normalize();
    _q.setFromUnitVectors(current, _d.copy(dir).normalize());
    this.setWorldRotation(bone, _q.multiply(bone.getWorldQuaternion(_wq)));
  }

  aimAt(bone, child, point) {
    bone.getWorldPosition(_c);
    this.aimDir(bone, child, _dir.subVectors(point, _c));
  }

  rotateWorld(bone, axis, angle) {
    if (!bone || !angle) return;
    _q.setFromAxisAngle(axis, angle);
    this.setWorldRotation(bone, _q.multiply(bone.getWorldQuaternion(_wq)));
  }

  setWorldRotation(bone, worldQuat) {
    bone.parent.getWorldQuaternion(_pq).invert();
    bone.quaternion.copy(_pq.multiply(worldQuat));
    bone.updateMatrixWorld(true);
  }

  // World-space scale of a bone (models are scaled to 1.8 m when they load).
  units(bone) {
    return bone.getWorldScale(_s).x;
  }

  palmPoint(side, out) {
    const H = this.hands[side];
    return out.copy(H.info.palm).applyMatrix4(H.hand.matrixWorld);
  }

  // ---- Reaching for a point (two-bone IK) ----
  // target: body-space point in meters (from the feet), e.g. the ledge's corner.
  // The palm ends up on it; the elbow bends down and out.
  reach(side, target, body, bodyQuat) {
    const H = this.hands[side];
    if (!H) return;
    const T = body.localToWorld(V().set(target[0], target[1], target[2]));
    for (let pass = 0; pass < 2; pass++) {
      const S = H.arm.getWorldPosition(V());
      const E = H.fore.getWorldPosition(V());
      const Wr = H.hand.getWorldPosition(V());
      // Aim the wrist so the palm (not the wrist) lands on the target.
      const palmOff = pass ? this.palmPoint(side, V()).sub(Wr) : V();
      const goal = T.clone().sub(palmOff);
      const l1 = S.distanceTo(E);
      const l2 = E.distanceTo(Wr);
      const toGoal = goal.clone().sub(S);
      const d = Math.min(Math.max(toGoal.length(), Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999);
      const dir = toGoal.normalize();
      const pole = V().set(-0.35, -1, side === 'right' ? 0.45 : -0.45).applyQuaternion(bodyQuat);
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
      const elbow = S.clone().addScaledVector(dir, x).addScaledVector(pole, h);
      this.aimAt(H.arm, H.fore, elbow);
      this.aimAt(H.fore, H.hand, goal);
    }
  }

  // ---- Keeping the arms out of the body ----

  // The torso as an elliptical tube from the hips to the neck, and the head as a ball.
  measureBody(bodyQuat) {
    const B = this.b;
    const t = this.rig.torso;
    const hips = B.hips.getWorldPosition(V());
    const neck = (B.neck ?? B.head).getWorldPosition(V());
    const up = neck.clone().sub(hips);
    const len = up.length();
    up.normalize();
    const fwd = V().set(1, 0, 0).applyQuaternion(bodyQuat);
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    const side = V().crossVectors(fwd, up).normalize();
    const hd = this.rig.head;
    const head = B.head;
    this.body = {
      hips, up, fwd, side, len,
      w: t.w * len, d: t.d * len, z: t.z * len,
      headC: hd.center.clone().applyMatrix4(head.matrixWorld),
      headR: hd.r * this.units(head),
    };
  }

  // If `p` is inside the body (grown by `margin`), where it should be instead.
  // head: false skips the head (props are meant to touch the mouth).
  pushOut(p, margin, head = true) {
    const bd = this.body;
    let moved = false;
    const out = p.clone();
    // Head
    const toHead = out.clone().sub(bd.headC);
    const hr = bd.headR + margin;
    if (head && toHead.lengthSq() < hr * hr) {
      if (toHead.lengthSq() < 1e-8) toHead.copy(bd.fwd);
      out.copy(bd.headC).addScaledVector(toHead.normalize(), hr);
      moved = true;
    }
    // Torso
    const rel = out.clone().sub(bd.hips);
    const h = rel.dot(bd.up);
    if (h > -0.05 * bd.len && h < bd.len * 1.02) {
      const df = rel.dot(bd.fwd) - bd.z;
      const ds = rel.dot(bd.side);
      const D = bd.d + margin;
      const Wd = bd.w + margin;
      const q = (df / D) ** 2 + (ds / Wd) ** 2;
      if (q < 1) {
        let nf = df;
        let ns = ds;
        if (q < 1e-6) nf = D;
        else {
          const sc = 1 / Math.sqrt(q);
          nf *= sc;
          ns *= sc;
        }
        out.copy(bd.hips).addScaledVector(bd.up, h).addScaledVector(bd.fwd, nf + bd.z).addScaledVector(bd.side, ns);
        moved = true;
      }
    }
    return moved ? out : null;
  }

  avoidBody(side) {
    const H = this.hands[side];
    if (!H) return;
    const L = H.info.len * this.units(H.hand);
    const elbow = H.fore.getWorldPosition(V());
    const e = this.pushOut(elbow, 0.035);
    if (e) this.aimAt(H.arm, H.fore, e);
    const wrist = H.hand.getWorldPosition(V());
    const palm = this.palmPoint(side, V());
    const p = this.pushOut(palm, Math.max(0.03, L * 0.22));
    if (p) this.aimAt(H.fore, H.hand, p.sub(palm.sub(wrist)));
  }

  // Clapping hands meet instead of passing through each other.
  separateHands() {
    const R = this.hands.right;
    const Lh = this.hands.left;
    if (!R || !Lh) return;
    const pr = this.palmPoint('right', V());
    const pl = this.palmPoint('left', V());
    const gap = (R.info.thick * this.units(R.hand) + Lh.info.thick * this.units(Lh.hand)) * 0.55;
    const d = pr.clone().sub(pl);
    const dist = d.length();
    if (dist >= gap) return;
    if (dist < 1e-5) d.copy(this.body.side);
    else d.divideScalar(dist);
    const push = (gap - dist) / 2;
    for (const [H, p, sign] of [[R, pr, 1], [Lh, pl, -1]]) {
      const wrist = H.hand.getWorldPosition(V());
      const goal = p.clone().addScaledVector(d, push * sign);
      this.aimAt(H.fore, H.hand, goal.sub(p.clone().sub(wrist)));
    }
  }

  // ---- Hands ----

  // Turns the hand to hold its prop (or to the palm direction a pose asks
  // for), curls the fingers, and remembers where the prop goes.
  solveHand(side, pose, bodyQuat, prop) {
    const H = this.hands[side];
    if (!H) return;
    const r = side === 'right';
    const info = H.info;
    const hand = H.hand;
    const f = hand.getWorldPosition(V()).sub(H.fore.getWorldPosition(V())).normalize();
    const cur = hand.getWorldQuaternion(new THREE.Quaternion());
    let A = info.a.clone().applyQuaternion(cur);
    let N = info.n.clone().applyQuaternion(cur);
    let shape = (r ? pose.rHand : pose.lHand) ?? 'relax';
    let curlScale = 1;
    this.grips[side] = null;

    if (prop?.grip) {
      const g = prop.grip;
      const mode = r ? pose.rProp : pose.lProp;
      // The prop's own direction, as before: along the forearm ('club') or standing up ('upright').
      const Qp = new THREE.Quaternion();
      if (mode === 'upright') Qp.copy(bodyQuat);
      else {
        const inv = bodyQuat.clone().invert();
        Qp.copy(bodyQuat).multiply(new THREE.Quaternion().setFromUnitVectors(NEG_Y, f.clone().applyQuaternion(inv)));
      }
      const units = this.units(hand);
      const Lw = info.len * units;
      if (g.clear !== false && prop.extent) this.clearProp(Qp, hand.getWorldPosition(V()).addScaledVector(f, Lw * 0.5), prop, bodyQuat);
      const p = NEG_Y.clone().applyQuaternion(Qp); // business end
      let K;
      if (g.style === 'palm') {
        // Flat things (a phone) lie on the palm with the fingers along them.
        A = p.clone().multiplyScalar(p.dot(f) >= 0 ? 1 : -1);
        const z = V().set(0, 0, 1).applyQuaternion(Qp);
        z.addScaledVector(A, -z.dot(A)).normalize();
        N = z.dot(N) >= 0 ? z : z.negate();
        K = r ? V().crossVectors(A, N) : V().crossVectors(N, A);
        shape = 'palm';
      } else {
        // Handles go across the fist, diagonally, with the wrist bending a
        // little so the prop can still point along the arm.
        const pa = p.clone().multiplyScalar(p.dot(f) > 0.35 ? 1 : -1);
        const alpha = Math.acos(Math.max(-1, Math.min(1, f.dot(pa))));
        const phi = Math.max(0, Math.min(Math.PI / 2 - MAX_DEVIATION + 0.05, Math.PI / 2 - alpha));
        const u = f.clone().addScaledVector(pa, -f.dot(pa));
        const ref = V().set(-0.3, -1, 0).applyQuaternion(bodyQuat);
        u.addScaledVector(ref.addScaledVector(pa, -ref.dot(pa)), 0.25).normalize();
        A = pa.clone().multiplyScalar(Math.sin(phi)).addScaledVector(u, Math.cos(phi)).normalize();
        K = pa.clone().addScaledVector(A, -Math.sin(phi)).normalize();
        N = r ? V().crossVectors(K, A) : V().crossVectors(A, K);
        shape = 'grip';
        // Thick handles open the fist up; thin ones close it.
        curlScale = Math.max(0.75, Math.min(1.35, 0.03 / Math.max(0.01, g.r) * 0.55 + 0.6));
      }
      this.orientHand(H, A, K);
      // The prop's grip point goes where the fingers close.
      const front = info.front.clone().applyMatrix4(hand.matrixWorld);
      const G = g.style === 'palm'
        ? front.addScaledVector(N, (g.r ?? 0.006) + 0.004)
        : front.addScaledVector(N, g.r * 0.9).addScaledVector(A, Lw * 0.08);
      const origin = G.addScaledVector(V().set(0, -(g.y ?? 0), 0).applyQuaternion(Qp), 1);
      const hw = hand.getWorldQuaternion(new THREE.Quaternion());
      this.grips[side] = {
        pos: hand.worldToLocal(origin.clone()),
        quat: hw.invert().multiply(Qp),
      };
    } else {
      // Empty hand: a palm direction from the pose (body space), or leave the wrist as it is.
      const palm = r ? pose.rPalm : pose.lPalm;
      if (palm) {
        N = V().set(palm[0], palm[1], palm[2]).normalize().applyQuaternion(bodyQuat);
        A = f.clone().addScaledVector(N, -f.dot(N));
        if (A.lengthSq() < 1e-6) A = f.clone();
        A.normalize();
        const K = r ? V().crossVectors(A, N) : V().crossVectors(N, A);
        this.orientHand(H, A, K);
      }
    }
    this.curl(H, side, shape, curlScale);
  }

  orientHand(H, A, K) {
    const q = frameRotation(H.info.a, H.info.k, A, K, new THREE.Quaternion());
    this.setWorldRotation(H.hand, q);
  }

  curl(H, side, shape, scale = 1) {
    const angles = CURL[shape] ?? CURL.relax;
    if (!H.fingers.length) return;
    const cur = H.hand.getWorldQuaternion(new THREE.Quaternion());
    const A = H.info.a.clone().applyQuaternion(cur);
    const N = H.info.n.clone().applyQuaternion(cur);
    const axis = V().crossVectors(A, N).normalize();
    const mitten = H.info.mitten;
    for (const chain of H.fingers) {
      chain.forEach((bone, j) => {
        // Two mitten joints do the work of three finger joints.
        const a = mitten ? (j === 0 ? angles[0] : angles[1] + angles[2] * 0.6) : angles[j] ?? angles[angles.length - 1];
        this.rotateWorld(bone, axis, a * scale);
      });
    }
    const t = (THUMB[shape] ?? 0) * scale;
    if (H.thumb.length && t) {
      const tAxis = A.clone().multiplyScalar(side === 'right' ? -1 : 1);
      this.rotateWorld(H.thumb[0], tAxis, t);
      for (let j = 1; j < H.thumb.length; j++) this.rotateWorld(H.thumb[j], axis, t * 0.6);
    }
  }

  // Tip a held prop away from the body if it would go through it (a bong
  // held up to the mouth hangs in front of the chest, not inside it).
  clearProp(Qp, grip, prop, bodyQuat) {
    const { top, bottom, profile } = prop.extent;
    const gy = prop.grip.y ?? 0;
    const n = profile.length;
    const pts = profile.map((r, i) => [bottom + ((i + 0.5) / n) * (top - bottom) - gy, Math.min(r, 0.2) + 0.015]);
    const blocked = (q) => pts.some(([y, m]) => this.pushOut(V().set(0, y, 0).applyQuaternion(q).add(grip), m, false));
    if (!blocked(Qp)) return;
    const axis = V().set(0, 0, 1).applyQuaternion(bodyQuat);
    const tilted = new THREE.Quaternion();
    for (let i = 1; i <= 8; i++) {
      for (const sign of [1, -1]) {
        tilted.setFromAxisAngle(axis, sign * i * 0.16).multiply(Qp);
        if (!blocked(tilted)) {
          Qp.copy(tilted);
          return;
        }
      }
    }
  }
}
