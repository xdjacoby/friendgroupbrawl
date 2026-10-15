import * as THREE from 'three';
import { boneKey } from './rig.js';
import { RING_STEP } from './props.js';

// Drives a Mixamo-style skeleton (Meshy's auto-rig uses the same bone names)
// from the procedural poses in poses.js, so a model with only a run cycle can
// still idle, jump, attack and flinch.
//
// Hands (with the measurements from rig.js): a held prop's handle is seated
// in the fist (seatHandle: the tightest curl it still fits in, resting on the
// palm), flat things lie on the palm with the fingers closed until they touch
// (closeChains), all tested on real skin points so props don't go through the
// fingers; empty hands make a fist, relax or open (pose.rHand / pose.lHand);
// pose.rReach / pose.lReach put a hand on a point (a ledge, someone you're
// holding); and elbows and hands are kept out of the torso, the head and each
// other, so poses can't phase through the body.

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
// Holding a prop, the fingers close until the skin touches it, each joint
// up to these (knuckle first). Mittens have two joints doing the work of three.
const CLOSE_MAX = [95 * DEG, 105 * DEG, 80 * DEG];
const MITTEN_MAX = [95 * DEG, 120 * DEG];
const THUMB_MAX = [60 * DEG, 50 * DEG, 50 * DEG];
const CLOSE_STEPS = 12;
const SKIN_GAP = 0.001; // stop this far from the prop's surface (meters)
// A handle is seated in a fist: the tightest of these (scaled down step by
// step) that it still fits in, with the fingertips reaching past its middle.
const SEAT_FIST = [85 * DEG, 95 * DEG, 70 * DEG];
const SEAT_MITTEN = [85 * DEG, 115 * DEG];
const SEAT_SLIDE = [-0.6, 0, 0.6]; // where along the palm to try (in handle radii)
const SEAT_SQUISH = 0.12; // fingers may press this much of the handle's radius into it (skin gives; it reads as a grip)
const SOLVED_KEEP = 48; // grips remembered per hand (a swing goes through the same few over and over)

// Working out a new grip takes a few milliseconds, so at most one a frame
// (across everyone): other hands keep their last grip for a frame or two.
let lastSolve = -Infinity;
function maySolve() {
  const now = performance.now();
  if (now - lastSolve < 6) return false;
  lastSolve = now;
  return true;
}

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
const _jm = Array.from({ length: 4 }, () => new THREE.Vector3());
const _rqs = Array.from({ length: 4 }, () => new THREE.Quaternion());
const _sp = new THREE.Vector3();
const _lp = new THREE.Vector3();

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
      // The same fingers with points on their skin, for closing on a prop.
      const chain = (c) => {
        const list = c?.bones.map(named);
        if (!list || !list.every(Boolean)) return null;
        // The fingertip: the few points of the last segment farthest from its joint.
        const last = c.skin[c.skin.length - 1];
        const tips = last.map((q, i) => [q.length(), i]).sort((x, y) => y[0] - x[0]).slice(0, 3).map(([, i]) => i);
        return { bones: list, skin: c.skin, tips, world: c.skin.map((pts) => pts.map(() => new THREE.Vector3())), joints: list.map(() => new THREE.Vector3()) };
      };
      this.hands[side].chains = (info.chains ?? []).map(chain).filter(Boolean);
      this.hands[side].thumbChain = chain(info.thumbChain);
      this.hands[side].closed = {}; // finger/thumb angles worked out per grip (closeChains)
      this.hands[side].palmPoints = info.palmPoints ?? [];
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
      const hw = hand.getWorldQuaternion(new THREE.Quaternion());
      const rel = hw.clone().invert().multiply(Qp); // how the prop lies in the hand
      // The prop's grip point goes where the fingers close.
      const front = (info.surface ?? info.front).clone().applyMatrix4(hand.matrixWorld);
      let G;
      let seat = null;
      if (g.style === 'palm') G = front.addScaledVector(N, (g.r ?? 0.006) + 0.004);
      else if (H.chains.length && H.palmPoints.length && prop.extent) {
        // Seated in the fist (the fingers stay out of it, the handle out of the palm).
        const q = (x) => Math.round(x * 30); // ~4 degree steps: close enough to share a seat
        const key = `${q(rel.x)},${q(rel.y)},${q(rel.z)},${q(rel.w)}|${g.r}|${g.y}`;
        seat = this.seatHandle(H, g, prop.extent, Qp, p, A, N, key);
        G = seat.center.clone().applyMatrix4(hand.matrixWorld);
      } else G = front.addScaledVector(N, g.r + 0.002).addScaledVector(A, Lw * 0.08);
      const origin = G.addScaledVector(V().set(0, -(g.y ?? 0), 0).applyQuaternion(Qp), 1);
      this.grips[side] = { pos: hand.worldToLocal(origin.clone()), quat: rel };
      if (H.chains.length) {
        this.held = { origin, inv: Qp.clone().invert(), grip: g, extent: prop.extent };
        if (seat) {
          // Curl the fingers as the seat found; the thumb closes on the handle.
          const X = V().crossVectors(A, N).normalize();
          for (const c of H.chains) seat.angles.forEach((a, j) => this.rotateWorld(c.bones[j], X, a));
          if (H.thumbChain) this.closeChains([H.thumbChain], [A.clone().multiplyScalar(r ? -1 : 1), X, X], THUMB_MAX, H.closed, 'thumb', `${seat.key}`);
        } else {
          // Flat things lie on the palm's skin (lifted off it where it bulges),
          // then the fingers close until they touch them (fixed curl angles
          // pushed them through phones).
          let m = 0;
          for (const lp of H.palmPoints) m = Math.min(m, this.heldDistance(_sp.copy(lp).applyMatrix4(hand.matrixWorld)));
          for (const c of H.chains) c.skin.forEach((pts, k) => { for (const lp of pts) m = Math.min(m, this.heldDistance(_sp.copy(lp).applyMatrix4(c.bones[k].matrixWorld))); });
          if (m < 0) {
            origin.addScaledVector(N, -m);
            this.grips[side].pos.copy(hand.worldToLocal(origin.clone()));
          }
          this.closeOn(H, side);
        }
        return;
      }
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

  // Signed distance (meters) from a world point to the held prop: round
  // things by how thick they are at that height (props.js `rings`), flat
  // things held on the palm by their box.
  heldDistance(p) {
    const { origin, inv, grip, extent } = this.held;
    _lp.copy(p).sub(origin).applyQuaternion(inv);
    if (!extent) return Math.hypot(_lp.x, _lp.z) - grip.r;
    if (grip.style === 'palm') {
      const { min, max } = extent.box;
      const qx = Math.abs(_lp.x - (min.x + max.x) / 2) - (max.x - min.x) / 2;
      const qy = Math.abs(_lp.y - (min.y + max.y) / 2) - (max.y - min.y) / 2;
      const qz = Math.abs(_lp.z - (min.z + max.z) / 2) - (max.z - min.z) / 2;
      const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
      return out + Math.min(Math.max(qx, qy, qz), 0);
    }
    // Widest it gets within a finger's width of this height (counted up to a
    // bit past the handle: rings treat every part as round, which is right
    // for a pen's button or a bong's mouthpiece, not a chip bag's flat crimp).
    const { rings, bottom, top } = extent;
    const y = _lp.y;
    let r = 0;
    const b0 = Math.max(0, Math.floor((y - 0.008 - bottom) / RING_STEP));
    const b1 = Math.min(rings.length - 1, Math.floor((y + 0.008 - bottom) / RING_STEP));
    for (let b = b0; b <= b1; b++) r = Math.max(r, rings[b]);
    r = Math.min(r, grip.r * 1.6);
    const radial = Math.hypot(_lp.x, _lp.z) - r;
    const past = Math.max(bottom - y, y - top); // beyond its ends
    return past > 0 ? Math.hypot(Math.max(0, radial), past) : radial;
  }

  // Fingers (and thumb) close on the held prop until they touch it.
  closeOn(H, side) {
    const cur = H.hand.getWorldQuaternion(new THREE.Quaternion());
    const A = H.info.a.clone().applyQuaternion(cur);
    const N = H.info.n.clone().applyQuaternion(cur);
    const X = V().crossVectors(A, N).normalize();
    // Only re-solve when the prop moved in the hand (the grip changes during
    // swings, not while idling): otherwise the last answer still fits.
    const g = this.grips[side];
    const q = (x) => Math.round(x * 60);
    const key = `${q(g.quat.x)},${q(g.quat.y)},${q(g.quat.z)},${q(g.quat.w)},${Math.round(g.pos.x * 300)},${Math.round(g.pos.y * 300)},${Math.round(g.pos.z * 300)}`;
    const maxes = H.info.mitten ? MITTEN_MAX : CLOSE_MAX;
    // The four fingers close together (scans often share skin between
    // neighboring fingertips, so fingers at different angles drag it into the prop).
    if (H.chains.length) this.closeChains(H.chains, [X, X, X], maxes, H.closed, 'fingers', key);
    if (H.thumbChain) {
      const tAxis = A.clone().multiplyScalar(side === 'right' ? -1 : 1);
      this.closeChains([H.thumbChain], [tAxis, X, X], THUMB_MAX, H.closed, 'thumb', key);
    }
  }

  // Seats a handle in the fist: curls the fingers (all together, like the
  // scans' fingers that share skin) as tight as they go while a handle that
  // thick still fits in the hook between them and the palm, then finds
  // where along the palm it sits deepest, touching the skin but not inside
  // it (tested on real skin points, rig.js). Depends only on how the prop
  // lies in the hand, so it's worked out once per grip. Returns
  // { key, angles, center (the grip point, in the hand bone's space) }.
  seatHandle(H, g, extent, Qp, p, A, N, key) {
    H.seats ??= new Map();
    const known = H.seats.get(key);
    if (known) return (H.lastSeat = known);
    if (H.lastSeat && !maySolve()) return H.lastSeat;
    const hand = H.hand;
    const chains = H.chains;
    const n = Math.min(...chains.map((c) => c.bones.length));
    for (const c of chains) {
      for (let j = 0; j < n; j++) c.bones[j].getWorldPosition(c.joints[j]);
      for (let k = 0; k < n; k++) for (let i = 0; i < c.skin[k].length; i++) c.world[k][i].copy(c.skin[k][i]).applyMatrix4(c.bones[k].matrixWorld);
    }
    const palm = H.palmPoints.map((lp) => lp.clone().applyMatrix4(hand.matrixWorld));
    const X = V().crossVectors(A, N).normalize();
    const held = { origin: V(), inv: Qp.clone().invert(), grip: g, extent };
    this.held = held;
    // How far the handle is from the skin (negative: into it). The fingers
    // can squish into it a little, the palm can't.
    const inside = (C, pts) => {
      held.origin.copy(C).addScaledVector(p, g.y ?? 0);
      let m = Infinity;
      const squish = Math.min(0.004, SEAT_SQUISH * g.r);
      for (let i = 0; i < pts.length; i++) m = Math.min(m, this.heldDistance(pts[i]) + (i < fingerCount ? squish : 0));
      return m;
    };
    let fingerCount = 0;
    // Start resting on the middle of the palm.
    const mid = H.info.palm.clone().applyMatrix4(hand.matrixWorld);
    let top = 0;
    for (const q of palm) top = Math.max(top, q.clone().sub(mid).dot(N));
    const base = mid.addScaledVector(N, top + g.r + SKIN_GAP);
    const fist = H.info.mitten ? SEAT_MITTEN : SEAT_FIST;
    const pts = [];
    const tips = [];
    // Where the handle sits with the fingers curled `s` of the way to a fist,
    // if it fits there and they wrap it (null if not; `any` takes it anyway).
    const tryCurl = (s, any = false) => {
      const ang = fist.slice(0, n).map((a) => a * s);
      for (let j = 0; j < n; j++) _rqs[j].setFromAxisAngle(X, ang[j]);
      pts.length = 0;
      tips.length = 0;
      for (const c of chains) {
        for (let j = 0; j < n; j++) {
          _jm[j].copy(c.joints[j]);
          for (let r2 = 0; r2 < j; r2++) _jm[j].sub(_jm[r2]).applyQuaternion(_rqs[r2]).add(_jm[r2]);
        }
        for (let k = 0; k < n; k++) {
          c.world[k].forEach((q, i) => {
            const tip = k === n - 1 && c.tips.includes(i);
            const w = q.clone();
            for (let r2 = 0; r2 <= k; r2++) w.sub(_jm[r2]).applyQuaternion(_rqs[r2]).add(_jm[r2]);
            pts.push(w);
            if (tip) tips.push(w);
          });
        }
      }
      fingerCount = pts.length;
      pts.push(...palm);
      let seat = null;
      for (const da of SEAT_SLIDE) {
        const C = base.clone().addScaledVector(A, da * g.r);
        // Lift it out of anything it's in.
        let m = inside(C, pts);
        for (let it = 0; it < 6 && m < 0; it++) {
          C.addScaledVector(N, -m + 0.0005);
          m = inside(C, pts);
        }
        if (m < 0) continue;
        const depth = C.clone().sub(base).dot(N);
        if (!seat || depth < seat.depth - 1e-4) seat = { C, depth };
      }
      if (!seat) return null;
      // Gripped: the handle still rests against the palm (not lifted out on
      // top of a fist too tight for it), and the fingertips come up past its middle.
      let reach = -Infinity;
      for (const t of tips) reach = Math.max(reach, t.clone().sub(seat.C).dot(N));
      return any || (seat.depth <= 0.3 * g.r + 0.003 && reach >= 0) ? { angles: ang, C: seat.C } : null;
    };
    // The tightest curl that works, stepping down from a full fist (too tight
    // and it won't fit, too loose and the fingers don't reach round it, so the
    // ones that work are a band in between: no halving search).
    let best = null;
    for (let s = 1; s > 0.06 && !best; s -= 0.125) best = tryCurl(s);
    // Too fat to wrap at all: an open hand with it resting on the palm.
    best ??= tryCurl(0, true) ?? { angles: new Array(n).fill(0), C: base };
    const seat = { key, angles: best.angles, center: hand.worldToLocal(best.C.clone()) };
    if (H.seats.size >= SOLVED_KEEP) H.seats.delete(H.seats.keys().next().value);
    H.seats.set(key, seat);
    return (H.lastSeat = seat);
  }

  // Closes fingers around the prop, wrapping like a real grasp: the first
  // joint bends until its segment touches, then the next one curls on from
  // there, and so on to the tip (each segment ends up resting on the prop).
  // "Touching" is tested on real points of the fingers' skin (rig.js), so
  // they don't sink into it. The chains given share one set of angles
  // (scans often share skin between neighboring fingertips, so fingers at
  // different angles would drag it into the prop).
  closeChains(chains, axes, maxes, memo, name, key) {
    const n = Math.min(...chains.map((c) => c.bones.length));
    memo[name] ??= new Map();
    let angles = memo[name].get(key) ?? (memo[name].last && !maySolve() ? memo[name].last : null);
    if (!angles) {
      for (const c of chains) {
        for (let j = 0; j < n; j++) c.bones[j].getWorldPosition(c.joints[j]);
        for (let k = 0; k < n; k++) for (let i = 0; i < c.skin[k].length; i++) c.world[k][i].copy(c.skin[k][i]).applyMatrix4(c.bones[k].matrixWorld);
      }
      // Smallest gap between any finger's segment k and the prop, with the joints bent by `ang`.
      const gap = (ang, k) => {
        for (let j = 0; j <= k; j++) _rqs[j].setFromAxisAngle(axes[j], ang[j]);
        let min = Infinity;
        for (const c of chains) {
          // Each joint turns about where it is once the joints before it have turned.
          for (let j = 0; j <= k; j++) {
            _jm[j].copy(c.joints[j]);
            for (let r = 0; r < j; r++) _jm[j].sub(_jm[r]).applyQuaternion(_rqs[r]).add(_jm[r]);
          }
          for (const p of c.world[k]) {
            _sp.copy(p);
            for (let r = 0; r <= k; r++) _sp.sub(_jm[r]).applyQuaternion(_rqs[r]).add(_jm[r]);
            min = Math.min(min, this.heldDistance(_sp));
          }
        }
        return min - SKIN_GAP;
      };
      const ang = new Array(n).fill(0);
      // A fat handle can already touch a segment at rest: that one may not sink in deeper.
      const limit = Array.from({ length: n }, (_, k) => Math.min(0, gap(ang, k)));
      const clear = (k) => gap(ang, k) >= limit[k];
      const steps = maxes.map((m) => m / CLOSE_STEPS);
      for (let j = 0; j < n; j++) {
        const max = maxes[Math.min(j, maxes.length - 1)];
        const step = steps[Math.min(j, steps.length - 1)];
        // Bend until this segment touches...
        while (ang[j] < max) {
          const before = ang[j];
          ang[j] = Math.min(max, before + step);
          if (clear(j)) continue;
          let lo = before;
          let hi = ang[j];
          for (let it = 0; it < 3; it++) {
            ang[j] = (lo + hi) / 2;
            if (clear(j)) lo = ang[j];
            else hi = ang[j];
          }
          ang[j] = lo;
          break;
        }
        // ...but not so far that the next segment starts out inside it.
        for (let it = 0; j + 1 < n && it < 2 * CLOSE_STEPS && ang[j] > 0 && !clear(j + 1); it++) ang[j] = Math.max(0, ang[j] - step / 2);
      }
      // Anything still inside (a segment that couldn't open far enough):
      // open the joints before it until it's out.
      for (let k = n - 1; k > 0; k--) {
        for (let j = k - 1; j >= 0 && !clear(k); j--) {
          for (let it = 0; it < 2 * CLOSE_STEPS && ang[j] > 0 && !clear(k); it++) ang[j] = Math.max(0, ang[j] - steps[Math.min(j, steps.length - 1)] / 2);
        }
      }
      angles = ang;
      if (memo[name].size >= SOLVED_KEEP) memo[name].delete(memo[name].keys().next().value);
      memo[name].set(key, angles);
    }
    memo[name].last = angles;
    for (const c of chains) for (let j = 0; j < n; j++) this.rotateWorld(c.bones[j], axes[j], angles[j]);
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
