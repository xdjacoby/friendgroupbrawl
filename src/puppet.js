import * as THREE from 'three';

// Drives a Mixamo-style skeleton (Meshy's auto-rig uses the same bone names)
// from the procedural poses in poses.js, so a model with only a run cycle can
// still idle, jump, attack and flinch.

const BONES = {
  hips: 'Hips', spine: 'Spine', spine1: 'Spine1', neck: 'Neck', head: 'Head',
  rArm: 'RightArm', rFore: 'RightForeArm', rHand: 'RightHand',
  lArm: 'LeftArm', lFore: 'LeftForeArm', lHand: 'LeftHand',
  rThigh: 'RightUpLeg', rShin: 'RightLeg', rFoot: 'RightFoot',
  lThigh: 'LeftUpLeg', lShin: 'LeftLeg', lFoot: 'LeftFoot',
};
const REQUIRED = ['hips', 'spine', 'head', 'rArm', 'rFore', 'rHand', 'lArm', 'lFore', 'lHand',
  'rThigh', 'rShin', 'rFoot', 'lThigh', 'lShin', 'lFoot'];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _mouth = new THREE.Vector3();
const _offset = new THREE.Vector3();

export class Puppet {
  static from(root) {
    const all = [];
    root.traverse((o) => o.isBone && all.push(o));
    const bones = {};
    for (const [key, suffix] of Object.entries(BONES)) {
      // GLTFLoader strips ':' from names, so "mixamorig:Hips" arrives as "mixamorigHips".
      bones[key] = all.find((b) => b.name.replace(/^mixamorig\d*[:_]?/, '') === suffix);
    }
    if (REQUIRED.some((k) => !bones[k])) return null;
    return new Puppet(root, all, bones);
  }

  constructor(root, all, bones) {
    this.root = root;
    this.all = all;
    this.b = bones;
    this.rest = new Map(all.map((b) => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));
    this.prev = new Map(all.map((b) => [b, new THREE.Quaternion()]));
  }

  // pose: from computePose(). bodyQuat: world rotation of body space. k: smoothing 0-1.
  apply(pose, bodyQuat, k) {
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

    // Ease from last frame's pose toward the new one.
    for (const b of this.all) b.quaternion.copy(this.prev.get(b).slerp(b.quaternion, k));
    this.root.updateMatrixWorld(true);
  }

  // Where the mouth is, in world space (a bit in front of the head bone).
  mouth(bodyQuat, out = _mouth) {
    this.b.head.getWorldPosition(out);
    return out.add(_offset.set(0.12, 0.02, 0).applyQuaternion(bodyQuat));
  }

  limb(bone, child, target, bodyQuat) {
    if (!target) return;
    const from = bone.getWorldPosition(_a);
    const to = child.getWorldPosition(_b);
    const current = to.sub(from).normalize();
    if (target === 'mouth') {
      _dir.copy(this.mouth(bodyQuat, _mouth)).sub(from).normalize();
    } else {
      _dir.set(target[0], target[1], target[2]).normalize().applyQuaternion(bodyQuat);
    }
    _q.setFromUnitVectors(current, _dir);
    this.setWorldRotation(bone, _q.multiply(bone.getWorldQuaternion(_wq)));
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
}
