import * as THREE from 'three';
import MODEL_FILES from 'virtual:model-files';

// Cosmetics: outfits (other models of the same friend) and accessories
// (hats, shades, a chain...) picked per player on the character select.
//
// Outfits: any file in public/models/ whose name starts with the character's
// id is one of their outfits: byron.glb is the classic look, byroncos1.glb,
// byroncos2.glb or byron-hoodie.glb are more. Nothing else to set up.
// (A new model still needs a skeleton: rig it in Meshy before downloading,
// or ask Claude to run tools/autorig.py on it.)

const title = (s) => s.replace(/[-_]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());

export function outfitsFor(character) {
  const list = [{ name: 'Classic', model: character.model }];
  const id = character.id.toLowerCase();
  for (const file of MODEL_FILES) {
    const lower = file.toLowerCase();
    if (!lower.startsWith(id) || `models/${file}` === character.model) continue;
    const rest = file.slice(id.length).replace(/\.(glb|gltf)$/i, '');
    if (/^[a-z]/i.test(rest) && !/^cos/i.test(rest)) continue; // "elijah.glb" isn't Eli's
    const n = rest.match(/^[-_ ]*cos(?:metic)?[-_ ]*(\d+)$/i);
    list.push({ name: n ? `Fit #${n[1]}` : title(rest) || file, model: `models/${file}` });
  }
  return list;
}

// ---- Accessories ----
// Each is built around the middle of the head (or wherever its spot is), in
// meters, with +y up and +z the way the face points. `size` is the head's
// radius, so it fits any head.

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

function beanie(size) {
  const g = new THREE.Group();
  const knit = mat(0xd9363e, { roughness: 0.95 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(size * 1.05, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), knit);
  dome.scale.y = 0.95;
  dome.position.y = size * 0.12;
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(size * 1.08, size * 1.1, size * 0.35, 24, 1, true), mat(0xb52a31, { roughness: 0.95, side: THREE.DoubleSide }));
  cuff.position.y = size * 0.18;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 10, 8), mat(0xf4f1ea, { roughness: 1 }));
  pom.position.y = size * 1.12;
  g.add(dome, cuff, pom);
  g.rotation.x = -0.12; // pulled down a bit at the back
  return g;
}

// A snapback worn backwards.
function cap(size) {
  const g = new THREE.Group();
  const cloth = mat(0x1d2433);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(size * 1.04, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), cloth);
  crown.position.y = size * 0.15;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.75, size * 0.75, size * 0.06, 20, 1, false, 0, Math.PI), mat(0xffcf3f));
  brim.position.set(0, size * 0.2, -size * 0.85);
  brim.rotation.y = Math.PI / 2;
  brim.scale.set(1, 1, 1.2);
  const button = new THREE.Mesh(new THREE.SphereGeometry(size * 0.09, 8, 6), mat(0xffcf3f));
  button.position.y = size * 1.15;
  g.add(crown, brim, button);
  return g;
}

// Built around the eyes; about 1.4x `size` wide.
function shades(size) {
  const g = new THREE.Group();
  const frame = mat(0x111111, { roughness: 0.3 });
  const lens = mat(0x1a1030, { roughness: 0.05, metalness: 0.4, emissive: 0x3a1460, emissiveIntensity: 0.6 });
  for (const x of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(size * 0.62, size * 0.32, size * 0.05), lens);
    l.position.set(x * size * 0.38, 0, 0);
    g.add(l);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(size * 1.5, size * 0.07, size * 0.06), frame);
  bar.position.y = size * 0.14;
  g.add(bar);
  for (const x of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(size * 0.05, size * 0.06, size * 0.9), frame);
    arm.position.set(x * size * 0.74, size * 0.1, -size * 0.45);
    g.add(arm);
  }
  return g;
}

// Gold chain: the pendant sits on the breastbone (the mount point), the chain
// runs up over the collarbones and around the back of the neck.
function chain(size) {
  const g = new THREE.Group();
  const gold = mat(0xffc93c, { roughness: 0.25, metalness: 0.8, emissive: 0x3a2600 });
  const s = size / 0.14; // ~1 for an average build
  const pts = [[0, 0.03, 0.012], [0.07, 0.11, -0.01], [0.085, 0.2, -0.07], [0.05, 0.25, -0.13], [0, 0.26, -0.15],
    [-0.05, 0.25, -0.13], [-0.085, 0.2, -0.07], [-0.07, 0.11, -0.01]].map(([x, y, z]) => new THREE.Vector3(x * s, y * s, z * s));
  const link = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.0065, 6, true), gold);
  const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.008, 16), gold);
  medal.rotation.x = Math.PI / 2;
  medal.position.set(0, 0, 0.012);
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.003, 6, 12), gold);
  bail.position.set(0, 0.033, 0.012);
  g.add(link, medal, bail);
  return g;
}

function crown(size) {
  const g = new THREE.Group();
  const gold = mat(0xffcc33, { roughness: 0.25, metalness: 0.85, emissive: 0x3a2a00 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.72, size * 0.66, size * 0.35, 20, 1, true), gold);
  band.material.side = THREE.DoubleSide;
  band.position.y = size * 0.82;
  g.add(band);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(size * 0.12, size * 0.35, 6), gold);
    spike.position.set(Math.sin(a) * size * 0.7, size * 1.15, Math.cos(a) * size * 0.7);
    g.add(spike);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(size * 0.07, 8, 6), mat([0xff2d55, 0x2d9bff, 0x2bd96b][i % 3], { roughness: 0.1 }));
    gem.position.set(Math.sin(a) * size * 0.73, size * 0.82, Math.cos(a) * size * 0.73);
    g.add(gem);
  }
  g.rotation.x = -0.15;
  return g;
}

function halo(size) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.7, size * 0.07, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3a0 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = size * 1.55;
  g.add(ring);
  return { object: g, update(t) { ring.position.y = size * (1.55 + Math.sin(t * 2.5) * 0.06); } };
}

// Andrew's CGM (continuous glucose monitor): the white disc on the back of his
// arm. The light shows his blood sugar (setColor).
function cgm() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.009, 24), mat(0xf4f6f8, { roughness: 0.35 }));
  shell.rotation.x = Math.PI / 2;
  shell.position.z = 0.0045;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0025, 6, 24), mat(0xc9cfd6));
  rim.position.z = 0.002;
  // Adhesive patch under it.
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), mat(0xe9e2d6, { roughness: 0.9 }));
  patch.position.z = 0.0008;
  const light = new THREE.MeshBasicMaterial({ color: 0x3ddc84 });
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.007, 12), light);
  led.position.z = 0.0095;
  g.add(patch, shell, rim, led);
  g.scale.setScalar(1.25); // a touch big so it reads in a match
  return { object: g, setColor: (c) => light.color.set(c), noFlash: [light] };
}

const ITEMS = { beanie, cap, shades, chain, crown, halo, cgm };

// The accessory picker on the character select.
export const ACCESSORIES = [
  { id: null, name: 'No extras' },
  { id: 'beanie', name: 'Beanie', spot: 'head' },
  { id: 'cap', name: 'Backwards cap', spot: 'head' },
  { id: 'shades', name: 'Shades', spot: 'face' },
  { id: 'chain', name: 'Gold chain', spot: 'chest' },
  { id: 'crown', name: 'Crown', spot: 'head' },
  { id: 'halo', name: 'Halo', spot: 'head' },
];

export function buildItem(id, size) {
  const made = ITEMS[id]?.(size);
  if (!made) return null;
  return made.isObject3D ? { object: made } : made;
}

// ---- Putting things on a body ----

const _x = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();

// A frame on a bone: at `point` (bone space), +y along `up`, +z along `forward`.
function mountOn(bone, root, point, up, forward) {
  const mount = new THREE.Group();
  const y = up.clone().normalize();
  const z = forward.clone().addScaledVector(y, -forward.dot(y)).normalize();
  _x.crossVectors(y, z);
  _m.makeBasis(_x, y, z);
  mount.quaternion.setFromRotationMatrix(_m);
  mount.position.copy(point);
  // Undo the bone's own scale (models come in at all sizes) so items are in meters.
  root.updateMatrixWorld(true);
  const s = bone.getWorldScale(_s).x / root.getWorldScale(new THREE.Vector3()).x;
  mount.scale.setScalar(1 / s);
  bone.add(mount);
  return mount;
}

// Spots on a rigged model (see rig.js): [bone, point, up, forward, size],
// with directions and size in that bone's space (size null = meters).
export function spotOnRig(spot, rig, bones) {
  const h = rig.head;
  if (spot === 'head') return [bones.head, h.center, h.up, h.forward, h.r];
  if (spot === 'face') return [bones.head, h.eyes, h.up, h.forward, h.eyeWidth];
  if (spot === 'chest') {
    const c = rig.chest;
    return [bones[c.bone === 'Spine2' ? 'spine2' : c.bone === 'Spine1' ? 'spine1' : 'spine'], c.point, c.up, c.forward, c.size / 3.9];
  }
  if (spot === 'lUpperArm' || spot === 'rUpperArm') {
    const left = spot === 'lUpperArm';
    // Back and outside of the upper arm, a bit above the middle (where a CGM goes).
    const s = rig.surface(left ? 'LeftArm' : 'RightArm', left ? 'LeftForeArm' : 'RightForeArm', 0.42,
      new THREE.Vector3(left ? 0.8 : -0.8, 0, -1));
    if (!s) return null;
    return [left ? bones.lArm : bones.rArm, s.point, s.along.clone().negate(), s.normal, null];
  }
  return null;
}

// Spots on the placeholder figure (view.js builds it): [parent, point, up, forward, size in meters].
export function spotOnPlaceholder(spot, view) {
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = new THREE.Vector3(1, 0, 0); // body space faces +x
  if (spot === 'head') return [view.hips, new THREE.Vector3(0, 0.98, 0), up, fwd, 0.27];
  if (spot === 'face') return [view.hips, new THREE.Vector3(0.25, 1.02, 0), up, fwd, 0.2];
  if (spot === 'chest') return [view.hips, new THREE.Vector3(0.27, 0.42, 0), up, fwd, 0.14];
  if (spot === 'lUpperArm') return [view.armL, new THREE.Vector3(-0.05, -0.22, -0.075), up, new THREE.Vector3(-0.55, 0, -0.85), null];
  if (spot === 'rUpperArm') return [view.armR, new THREE.Vector3(-0.05, -0.22, 0.075), up, new THREE.Vector3(-0.55, 0, 0.85), null];
  return null;
}

// Puts each item ({ id, spot, update(built, fighter) }) on the fighter's body.
// Returns what was attached, for updating and removing later.
export function dress(view, items, rig) {
  const worn = [];
  for (const item of items) {
    const where = rig && view.puppet ? spotOnRig(item.spot, rig, view.puppet.b) : spotOnPlaceholder(item.spot, view);
    if (!where?.[0]) continue;
    const [parent, point, up, forward, size] = where;
    const mount = mountOn(parent, view.root, point, up, forward);
    const meters = size === null ? 1 : size / mount.scale.x; // bone units -> meters
    const built = buildItem(item.id, meters);
    if (!built) {
      mount.removeFromParent();
      continue;
    }
    built.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    mount.add(built.object);
    worn.push({ item, mount, built });
  }
  return worn;
}
