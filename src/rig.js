import * as THREE from 'three';

// Reads a rigged model's own shape once, when it first loads, so the puppet
// can put props in the palm, curl the fingers around them, keep arms out of
// the body, and so cosmetics (hats, Andrew's CGM) sit on the surface. It works
// on any model with Mixamo bone names, so new outfits get it for free.
//
// Models rigged by Meshy have finger bones. Ones rigged by tools/autorig.py
// only have a wrist, so this gives each hand two "mitten" joints (knuckles and
// middle of the fingers) and moves the finger skin onto them.
//
// Everything is stored in bone space, so it holds for every copy of the model
// at any size.

export const boneKey = (name) => name.replace(/^mixamorig\d*[:_]?/, '');

const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1); // glTF models face +z

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function percentile(values, p) {
  if (!values.length) return 0;
  const s = Float64Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
}

export function prepareModel(gltf) {
  if ('rig' in gltf.userData) return gltf.userData.rig;
  gltf.userData.rig = null;
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) return null;
  const skeleton = meshes[0].skeleton;
  const users = meshes.filter((m) => m.skeleton === skeleton);
  const bones = skeleton.bones;
  const index = new Map(bones.map((b, i) => [boneKey(b.name), i]));
  for (const k of ['Hips', 'Neck', 'Head', 'RightHand', 'LeftHand', 'RightForeArm', 'LeftForeArm']) {
    if (!index.has(k)) return null;
  }
  const bindWorld = skeleton.boneInverses.map((m) => m.clone().invert());
  const joint = (key) => new THREE.Vector3().setFromMatrixPosition(bindWorld[index.get(key)]);

  // Every vertex in bind pose (world space) with its four bone slots.
  let total = 0;
  for (const m of users) total += m.geometry.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const slotI = new Uint16Array(total * 4);
  const slotW = new Float32Array(total * 4);
  const dominant = new Uint16Array(total);
  const owner = []; // [mesh, first vertex]
  const v = new THREE.Vector3();
  let n = 0;
  for (const m of users) {
    const g = m.geometry;
    const P = g.attributes.position;
    const SI = g.attributes.skinIndex;
    const SW = g.attributes.skinWeight;
    owner.push([m, n]);
    for (let i = 0; i < P.count; i++, n++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m.bindMatrix);
      pos[n * 3] = v.x;
      pos[n * 3 + 1] = v.y;
      pos[n * 3 + 2] = v.z;
      let best = 0;
      for (let s = 0; s < 4; s++) {
        slotI[n * 4 + s] = SI.getComponent(i, s);
        slotW[n * 4 + s] = SW.getComponent(i, s);
        if (slotW[n * 4 + s] > slotW[n * 4 + best]) best = s;
      }
      dominant[n] = slotI[n * 4 + best];
    }
  }
  const at = (i, out = v) => out.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const weightOn = (i, set) => {
    let w = 0;
    for (let s = 0; s < 4; s++) if (set.has(slotI[i * 4 + s])) w += slotW[i * 4 + s];
    return w;
  };
  const ids = (...keys) => new Set(keys.filter((k) => index.has(k)).map((k) => index.get(k)));

  // ---- Hands ----
  const toLocal = (boneI, p) => p.clone().applyMatrix4(skeleton.boneInverses[boneI]);
  const dirLocal = (boneI, d) => d.clone().transformDirection(skeleton.boneInverses[boneI]);
  const unitsLocal = (boneI) => skeleton.boneInverses[boneI].getMaxScaleOnAxis();

  const newBones = [];
  const newInverses = [];
  const remaps = []; // per synthetic hand: { hand, b1, b2, W, a, L }

  function hand(side) {
    const S = side === 'right' ? 'Right' : 'Left';
    const hi = index.get(`${S}Hand`);
    const set = new Set([hi]);
    for (const [k, i] of index) if (k.startsWith(`${S}Hand`) && i !== hi) set.add(i);
    const W = joint(`${S}Hand`);
    const E = joint(`${S}ForeArm`);
    const pts = [];
    for (let i = 0; i < total; i++) if (weightOn(i, set) >= 0.5) pts.push(at(i, new THREE.Vector3()));
    const fore = W.clone().sub(E).normalize();
    let a = fore.clone();
    if (pts.length >= 20) {
      const c = new THREE.Vector3();
      for (const p of pts) c.add(p);
      c.divideScalar(pts.length).sub(W);
      if (c.length() > 1e-4) a = c.normalize().lerp(fore, 0.25).normalize();
    }
    const s = pts.map((p) => v.subVectors(p, W).dot(a));
    let L = percentile(s, 0.97);
    // A hand is roughly 0.4x the forearm; trust that if the mesh says otherwise.
    const foreLen = W.distanceTo(E);
    if (!(L > foreLen * 0.25 && L < foreLen * 0.9)) L = foreLen * 0.42;

    // Thumb side: Meshy rigs have a thumb bone. Scans with mitten hands
    // stand with the thumbs forward (arms down: palms face the thighs; T-pose: palms down).
    let t = index.has(`${S}HandThumb2`) ? joint(`${S}HandThumb2`).sub(W) : FORWARD.clone();
    t.addScaledVector(a, -t.dot(a));
    if (t.lengthSq() < 1e-8) t = FORWARD.clone().addScaledVector(a, -FORWARD.dot(a));
    const k = t.normalize();
    // Palm normal: anatomy says thumb x fingers for the right hand, the other way for the left.
    const nrm = side === 'right' ? new THREE.Vector3().crossVectors(k, a) : new THREE.Vector3().crossVectors(a, k);
    nrm.normalize();

    const band = pts.filter((p) => {
      const d = v.subVectors(p, W).dot(a);
      return d > 0.2 * L && d < 0.55 * L;
    });
    const kk = band.map((p) => v.subVectors(p, W).dot(k));
    const nn = band.map((p) => v.subVectors(p, W).dot(nrm));
    const kMid = band.length ? percentile(kk, 0.5) : 0;
    const nMid = band.length ? percentile(nn, 0.5) : 0;
    let front = band.length ? percentile(nn, 0.92) - nMid : L * 0.12;
    let back = band.length ? nMid - percentile(nn, 0.08) : L * 0.12;
    front = Math.max(L * 0.06, Math.min(L * 0.25, front));
    back = Math.max(L * 0.06, Math.min(L * 0.25, back));
    const width = band.length ? percentile(kk, 0.95) - percentile(kk, 0.05) : L * 0.5;
    const palm = W.clone().addScaledVector(a, 0.42 * L).addScaledVector(k, kMid).addScaledVector(nrm, nMid);
    const palmFront = palm.clone().addScaledVector(a, 0.05 * L).addScaledVector(nrm, front);
    const u = unitsLocal(hi);

    const info = {
      a: dirLocal(hi, a), k: dirLocal(hi, k), n: dirLocal(hi, nrm),
      palm: toLocal(hi, palm), front: toLocal(hi, palmFront),
      len: L * u, thick: (front + back) * u, width: Math.max(width, L * 0.35) * u,
      fingers: [], thumb: [],
    };

    const has = (k2) => index.has(k2);
    if (FINGERS.some((fn) => has(`${S}Hand${fn}1`))) {
      for (const fn of FINGERS) {
        const chain = [1, 2, 3].map((j) => `${S}Hand${fn}${j}`).filter(has);
        if (chain.length) info.fingers.push(chain.map((key) => bones[index.get(key)].name));
      }
      info.thumb = [1, 2, 3].map((j) => `${S}HandThumb${j}`).filter(has).map((key) => bones[index.get(key)].name);
    } else {
      // Mitten joints: knuckles at ~half the hand, then the middle of the fingers.
      const Hinv = skeleton.boneInverses[hi];
      const k1 = W.clone().addScaledVector(a, 0.5 * L).applyMatrix4(Hinv);
      const k2 = W.clone().addScaledVector(a, 0.74 * L).applyMatrix4(Hinv);
      const b1 = new THREE.Bone();
      const b2 = new THREE.Bone();
      b1.name = `mixamorig${S}HandMitten1`;
      b2.name = `mixamorig${S}HandMitten2`;
      b1.position.copy(k1);
      b2.position.copy(k2).sub(k1);
      bones[hi].add(b1);
      b1.add(b2);
      newBones.push(b1, b2);
      newInverses.push(
        new THREE.Matrix4().makeTranslation(-k1.x, -k1.y, -k1.z).multiply(Hinv),
        new THREE.Matrix4().makeTranslation(-k2.x, -k2.y, -k2.z).multiply(Hinv),
      );
      remaps.push({ hand: hi, b1: bones.length + newBones.length - 2, b2: bones.length + newBones.length - 1, W, a, L });
      info.fingers.push([b1.name, b2.name]);
      info.mitten = true;
    }
    return info;
  }

  const hands = { right: hand('right'), left: hand('left') };

  if (newBones.length) {
    // Move the finger part of each mitten hand's skin onto its new joints.
    for (const r of remaps) {
      for (const [m, first] of owner) {
        const SI = m.geometry.attributes.skinIndex;
        const SW = m.geometry.attributes.skinWeight;
        for (let i = 0; i < SI.count; i++) {
          const gi = first + i;
          let slot = -1;
          for (let s = 0; s < 4; s++) if (slotI[gi * 4 + s] === r.hand && slotW[gi * 4 + s] > 0) slot = s;
          if (slot < 0) continue;
          at(gi).sub(r.W);
          const d = v.dot(r.a);
          if (v.addScaledVector(r.a, -d).length() > 0.6 * r.L) continue; // not part of the hand
          const t = d / r.L;
          const f1 = smooth(0.4, 0.56, t);
          const f2 = smooth(0.66, 0.8, t);
          if (f1 <= 0) continue;
          const wh = slotW[gi * 4 + slot];
          const list = [];
          for (let s = 0; s < 4; s++) if (s !== slot && slotW[gi * 4 + s] > 0) list.push([slotI[gi * 4 + s], slotW[gi * 4 + s]]);
          list.push([r.hand, wh * (1 - f1)], [r.b1, wh * (f1 - f2)], [r.b2, wh * f2]);
          const top = list.filter((e) => e[1] > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4);
          const sum = top.reduce((acc, e) => acc + e[1], 0) || 1;
          for (let s = 0; s < 4; s++) {
            const e = top[s];
            slotI[gi * 4 + s] = e ? e[0] : 0;
            slotW[gi * 4 + s] = e ? e[1] / sum : 0;
            SI.setComponent(i, s, slotI[gi * 4 + s]);
            SW.setComponent(i, s, slotW[gi * 4 + s]);
          }
        }
        SI.needsUpdate = true;
        SW.needsUpdate = true;
      }
    }
    const skel = new THREE.Skeleton(bones.concat(newBones), skeleton.boneInverses.concat(newInverses));
    for (const m of users) m.bind(skel, m.bindMatrix);
  }

  // ---- Torso and head (for keeping arms out of the body) ----
  const hips = joint('Hips');
  const neck = joint('Neck');
  const H = Math.max(1e-4, neck.distanceTo(hips));
  // The chest: every vertex in a slice between the belly and the collarbones,
  // minus the arms (the spine bones only own the back of it in some rigs).
  const armBones = new Set();
  for (const [k, i] of index) if (/^(Left|Right)(Arm|ForeArm|Hand)/.test(k)) armBones.add(i);
  const shoulderX = index.has('RightArm') && index.has('LeftArm')
    ? Math.abs(joint('RightArm').x - joint('LeftArm').x) / 2 : 0.2 * H;
  const xs = [];
  const zs = [];
  for (let i = 0; i < total; i++) {
    if (armBones.has(dominant[i])) continue;
    const y = pos[i * 3 + 1];
    if (y < hips.y + 0.4 * H || y > hips.y + 0.8 * H) continue;
    if (Math.abs(pos[i * 3] - hips.x) > shoulderX * 0.95) continue;
    xs.push(pos[i * 3]);
    zs.push(pos[i * 3 + 2]);
  }
  const span = (a, fallback) => (a.length > 50 ? [(percentile(a, 0.04) + percentile(a, 0.96)) / 2, (percentile(a, 0.96) - percentile(a, 0.04)) / 2] : fallback);
  const [, halfW] = span(xs, [0, 0.17 * H]);
  const [cz, halfD] = span(zs, [(hips.z + neck.z) / 2, 0.11 * H]);
  const torso = { w: halfW / H, d: halfD / H, z: (cz - (hips.z + neck.z) / 2) / H };

  const hi = index.get('Head');
  const headSet = ids('Head', 'HeadTop_End', 'headfront');
  const headPts = [];
  for (let i = 0; i < total; i++) if (headSet.has(dominant[i])) headPts.push(at(i, new THREE.Vector3()));
  const hc = new THREE.Vector3();
  for (const p of headPts) hc.add(p);
  if (headPts.length) hc.divideScalar(headPts.length);
  else hc.copy(joint('Head')).addScaledVector(UP, 0.1 * H);
  const hr = headPts.length ? percentile(headPts.map((p) => p.distanceTo(hc)), 0.8) : 0.18 * H;
  const topY = headPts.length ? percentile(headPts.map((p) => p.y), 0.995) : hc.y + hr;
  // Eyes: follow the face's side profile (how far forward the middle of the
  // face sticks out at each height), walking up from the chin. The nose is
  // the first bump that's the biggest around it; the eye sockets are the dip
  // right above it. (Fringes and hats stick out further than the nose, so
  // just taking the front-most point lands on the hair.)
  const base = joint('Head').y;
  const crown = index.has('HeadTop_End') ? joint('HeadTop_End').y : topY;
  const headSpan = Math.max(1e-4, crown - base);
  const STEPS = 30;
  const lo = base - 0.15 * headSpan;
  const step = (crown - lo) / STEPS;
  const raw = new Array(STEPS).fill(-Infinity);
  for (const p of headPts) {
    if (Math.abs(p.x - hc.x) > 0.035 * H) continue;
    const k = Math.floor((p.y - lo) / step);
    if (k >= 0 && k < STEPS) raw[k] = Math.max(raw[k], p.z);
  }
  const prof = raw.map((z, k) => { // median of 3: drops stray vertices
    const w = [raw[k - 1], z, raw[k + 1]].filter((x) => x !== undefined && x > -Infinity).sort((a, b) => a - b);
    return w.length ? w[Math.floor(w.length / 2)] : -Infinity;
  });
  const win = Math.max(1, Math.round((0.1 * headSpan) / step));
  const after = Math.max(2, Math.round((0.22 * headSpan) / step));
  let eye = -1;
  for (let k = 1; k < STEPS * 0.75 && eye < 0; k++) {
    if (!(prof[k] > -Infinity)) continue;
    let biggest = true;
    for (let j = Math.max(0, k - win); j <= Math.min(STEPS - 1, k + win); j++) if (prof[j] > prof[k]) biggest = false;
    if (!biggest) continue;
    let dip = -1;
    for (let j = k + 1; j <= Math.min(STEPS - 1, k + after); j++) if (prof[j] > -Infinity && (dip < 0 || prof[j] < prof[dip])) dip = j;
    if (dip >= 0 && prof[k] - prof[dip] > 0.005 * H) eye = dip;
  }
  const eyes = eye >= 0
    ? new THREE.Vector3(hc.x, lo + (eye + 0.5) * step, prof[eye] + 0.008 * H)
    : new THREE.Vector3(hc.x, base + 0.33 * headSpan, hc.z + hr * 0.85);
  const head = {
    center: toLocal(hi, hc), r: hr * unitsLocal(hi),
    top: toLocal(hi, new THREE.Vector3(hc.x, topY, hc.z)),
    eyes: toLocal(hi, eyes), eyeWidth: 0.2 * H * unitsLocal(hi),
    up: dirLocal(hi, UP), forward: dirLocal(hi, FORWARD),
    neckUp: dirLocal(index.get('Neck'), UP), neckForward: dirLocal(index.get('Neck'), FORWARD),
    neckR: hr * 0.55 * unitsLocal(index.get('Neck')),
  };

  // A spot on the skin of a limb: `t` of the way from `boneName`'s joint to
  // `childName`'s, on the side facing `dir` (model space: +z forward, +x the
  // model's left). Returns the point and outward direction in that bone's
  // space, for sticking things on (Andrew's CGM).
  const surfaceCache = new Map();
  function surface(boneName, childName, t, dir) {
    const key = `${boneName}|${childName}|${t}|${dir.x},${dir.y},${dir.z}`;
    if (surfaceCache.has(key)) return surfaceCache.get(key);
    const bi = index.get(boneName);
    if (bi === undefined || !index.has(childName)) return null;
    const A = joint(boneName);
    const B = joint(childName);
    const axis = B.clone().sub(A);
    const len = axis.length();
    axis.normalize();
    const d = dir.clone().addScaledVector(axis, -dir.dot(axis)).normalize();
    const c = A.clone().addScaledVector(axis, t * len);
    const proj = [];
    for (let i = 0; i < total; i++) {
      if (dominant[i] !== bi) continue;
      at(i).sub(c);
      if (Math.abs(v.dot(axis)) > 0.08 * len) continue;
      const along = v.dot(d);
      if (along <= 0) continue;
      if (v.addScaledVector(axis, -v.dot(axis)).normalize().dot(d) < 0.85) continue;
      proj.push(along);
    }
    const out = proj.length ? percentile(proj, 0.9) : 0.05 * len;
    const result = {
      point: toLocal(bi, c.clone().addScaledVector(d, out)),
      normal: dirLocal(bi, d),
      along: dirLocal(bi, axis),
      units: unitsLocal(bi),
    };
    surfaceCache.set(key, result);
    return result;
  }

  // Front of the chest at the breastbone (where a chain's pendant hangs).
  const chestBone = index.has('Spine2') ? 'Spine2' : index.has('Spine1') ? 'Spine1' : 'Spine';
  const sternumY = neck.y - 0.24 * H;
  const front = [];
  for (let i = 0; i < total; i++) {
    if (armBones.has(dominant[i]) || Math.abs(pos[i * 3 + 1] - sternumY) > 0.05 * H) continue;
    if (Math.abs(pos[i * 3] - hips.x) > 0.3 * shoulderX) continue;
    front.push(pos[i * 3 + 2]);
  }
  const ci = index.get(chestBone);
  const chest = {
    bone: chestBone,
    point: toLocal(ci, new THREE.Vector3(hips.x, sternumY, front.length > 10 ? percentile(front, 0.95) : cz + halfD)),
    up: dirLocal(ci, UP), forward: dirLocal(ci, FORWARD),
    size: H * unitsLocal(ci), // the spine's length, in the bone's units
  };

  const rig = { hands, torso, head, chest, surface };
  gltf.userData.rig = rig;
  return rig;
}
