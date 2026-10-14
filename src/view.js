import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { computePose } from './poses.js';
import { Puppet } from './puppet.js';
import { createProp } from './props.js';

const loader = new GLTFLoader();
const modelCache = new Map();

function loadModel(url) {
  if (!modelCache.has(url)) {
    modelCache.set(url, loader.loadAsync(url).catch((err) => {
      console.warn(`Could not load ${url}, using placeholder.`, err);
      return null;
    }));
  }
  return modelCache.get(url);
}

const lerp = (a, b, t) => a + (b - a) * t;
const NEG_Y = new THREE.Vector3(0, -1, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _hand = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _bodyQuat = new THREE.Quaternion();
const _invBody = new THREE.Quaternion();
const _spin = new THREE.Quaternion();

function capsule(radius, length, material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), material);
  mesh.castShadow = true;
  return mesh;
}

// Placeholder limbs only bend at one joint, so aim them at the average of the two segments.
const MOUTH_ANGLE = 2.6; // arm raised up and forward so the hand reaches the face
function limbAngle(upper, lower) {
  if (lower === 'mouth') return MOUTH_ANGLE;
  const u = new THREE.Vector2(upper[0], upper[1]).normalize();
  const l = new THREE.Vector2(lower[0], lower[1]).normalize();
  const d = u.add(l);
  return Math.atan2(d.x, -d.y);
}

// Visual for one fighter. Reads simulation state, never writes it.
export class FighterView {
  constructor(fighter, scene, slotColor) {
    this.f = fighter;
    this.root = new THREE.Group();
    this.z = 0; // depth (the victory screen lines people up front to back)
    this.tumble = new THREE.Group(); // pivots at the waist so launched fighters spin in place
    this.tumble.position.y = 0.9;
    this.body = new THREE.Group(); // everything that turns to face left/right
    this.body.position.y = -0.9;
    this.root.add(this.tumble);
    this.tumble.add(this.body);
    scene.add(this.root);

    this.materials = [];
    this.buildPlaceholder(fighter.character.color);
    this.buildShield(slotColor);
    this.buildMarker(slotColor, `P${fighter.slot + 1}`);
    this.buildProps(fighter.character.props);
    this.root.scale.setScalar(fighter.stats.scale);

    if (fighter.character.model) this.tryLoadModel(fighter.character.model);
  }

  buildPlaceholder(color) {
    const base = new THREE.Color(color);
    const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55 });
    const skin = new THREE.MeshStandardMaterial({ color: base.clone().lerp(new THREE.Color(0xffe0c4), 0.65), roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1f });
    this.placeholderMaterials = [mat, skin];
    this.materials.push(mat, skin);

    const rig = new THREE.Group();
    this.rig = rig;
    this.body.add(rig);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.9;
    rig.add(this.hips);

    const torso = capsule(0.28, 0.45, mat);
    torso.position.y = 0.32;
    this.hips.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14), skin);
    head.position.y = 0.98;
    head.castShadow = true;
    this.hips.add(head);
    for (const z of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), dark);
      eye.position.set(0.24, 1.02, z);
      this.hips.add(eye);
    }

    const limb = (x, y, z, radius, length, material) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const m = capsule(radius, length, material);
      m.position.y = -length / 2 - radius * 0.5;
      pivot.add(m);
      this.hips.add(pivot);
      return pivot;
    };
    // +z is the fighter's right side.
    this.armR = limb(0, 0.6, 0.36, 0.09, 0.45, skin);
    this.armL = limb(0, 0.6, -0.36, 0.09, 0.45, skin);
    this.legR = limb(0, 0.02, 0.15, 0.11, 0.72, mat);
    this.legL = limb(0, 0.02, -0.15, 0.11, 0.72, mat);

    const socket = (arm) => {
      const s = new THREE.Object3D();
      s.position.y = -0.62;
      arm.add(s);
      return s;
    };
    this.sockets = {
      right: { hand: socket(this.armR), elbow: this.armR },
      left: { hand: socket(this.armL), elbow: this.armL },
    };
  }

  buildShield(color) {
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shield.position.y = 0.95;
    this.shield.visible = false;
    this.root.add(this.shield);
  }

  buildMarker(color, text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 64, 52);
    ctx.beginPath();
    ctx.moveTo(44, 64);
    ctx.lineTo(84, 64);
    ctx.lineTo(64, 90);
    ctx.fill();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
    sprite.scale.set(0.9, 0.675, 1);
    sprite.position.y = 2.45;
    sprite.renderOrder = 10;
    this.root.add(sprite);
    this.marker = sprite;
  }

  // character.props = { right: 'bong', left: 'dabPen' }. Moves can also put
  // something else in a hand for a moment (pose.rHeld / pose.lHeld), so each
  // hand keeps every prop it has shown and only one is visible at a time.
  buildProps(props = {}) {
    this.defaultProps = props;
    this.hands = {};
    for (const side of ['right', 'left']) {
      const holder = new THREE.Group();
      this.body.add(holder);
      this.hands[side] = { holder, props: {} };
    }
    for (const side of ['right', 'left']) if (props[side]) this.handProp(side, props[side]);
    // Something to ride (pose.mount, e.g. Byron's Lamborghini), parked at the feet.
    this.mount = { holder: new THREE.Group(), props: {} };
    this.body.add(this.mount.holder);
  }

  handProp(side, name) {
    const hand = this.hands[side];
    if (!(name in hand.props)) {
      const prop = createProp(name);
      if (prop) hand.holder.add(prop.object);
      hand.props[name] = prop;
    }
    return hand.props[name];
  }

  async tryLoadModel(url) {
    const gltf = await loadModel(url);
    if (!gltf) return;
    const model = SkeletonUtils.clone(gltf.scene);

    // Normalize: 1.8m tall, feet at y = 0, centered.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = 1.8 / (size.y || 1);
    model.scale.setScalar(scale);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    // Rigged models: center on the hips rather than the bounding box, so the
    // body lines up with the hurtbox even if the arms or hood stick out.
    let hips = null;
    model.traverse((o) => { if (!hips && o.isBone && /hips$/i.test(o.name)) hips = o; });
    if (hips) {
      model.updateMatrixWorld(true);
      const p = hips.getWorldPosition(new THREE.Vector3());
      model.position.x -= p.x;
      model.position.z -= p.z;
    }

    // Files exported without materials/textures get a clay look tinted with the character color.
    // Textured ones get their own copy of each material so hit flashes don't
    // light up every fighter using the same model.
    const untextured = !gltf.parser.json.materials?.length;
    const clay = untextured && new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xd8c8b8).lerp(new THREE.Color(this.f.character.color), 0.3),
      roughness: 0.75,
      metalness: 0,
    });

    const holder = new THREE.Group();
    holder.rotation.y = Math.PI / 2; // glTF faces +z; gameplay "forward" is +x
    holder.add(model);
    model.traverse((o) => {
      o.userData.cached = true; // geometry and textures are shared with the model cache
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds don't follow procedural poses
        if (clay) o.material = clay;
        else o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        // Scans export as fully metallic, which renders dark and muddy with no
        // reflections around. People aren't metal.
        for (const mat of mats) {
          // Scans are flagged double-sided, which draws every hidden inside
          // face too; they're closed shells, so the outside is enough.
          mat.side = THREE.FrontSide;
          if (mat.metalness === undefined) continue;
          mat.metalness = 0;
          mat.metalnessMap = null;
        }
        for (const mat of mats) if (mat.emissive && !this.materials.includes(mat)) this.materials.push(mat);
      }
    });

    this.body.remove(this.rig);
    this.materials = this.materials.filter((m) => !this.placeholderMaterials.includes(m));
    this.rig = null;
    this.model = holder;
    this.body.add(holder);

    this.puppet = Puppet.from(model);
    if (this.puppet) {
      const b = this.puppet.b;
      this.sockets = {
        right: { hand: b.rHand, elbow: b.rFore },
        left: { hand: b.lHand, elbow: b.lFore },
      };
    }

    if (gltf.animations.length) {
      this.mixer = new THREE.AnimationMixer(model);
      this.clips = {};
      for (const clip of gltf.animations) this.clips[clip.name.toLowerCase()] = this.mixer.clipAction(clip);
    }
  }

  // Find an animation clip whose name contains one of the given words.
  clip(...names) {
    if (!this.clips) return null;
    for (const n of names) {
      const key = Object.keys(this.clips).find((k) => k.includes(n));
      if (key) return this.clips[key];
    }
    return null;
  }

  playClip(action, fade = 0.12) {
    if (!action || action === this.current) return;
    action.reset().fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = action;
  }

  stopClips() {
    if (!this.current) return;
    this.mixer.stopAllAction();
    this.current = null;
  }

  update(dt, time) {
    const f = this.f;
    this.root.visible = !f.dead;
    if (f.dead) return;

    this.root.position.set(f.x, f.y, this.z);
    const targetYaw = f.facing > 0 ? 0 : Math.PI;
    this.body.rotation.y = lerp(this.body.rotation.y, targetYaw, Math.min(1, dt * 20));

    // Shield bubble
    this.shield.visible = f.shielding;
    if (f.shielding) this.shield.scale.setScalar(0.45 + 0.65 * (f.shieldHP / 50));

    // Hit flash / respawn + ledge invincibility blink / dodge tint / slowed by a cloud
    const flash = f.hitFlash > 0 ? 0.9 : f.invuln > 0 && Math.floor(time * 10) % 2 ? 0.45 : f.helpless ? 0.15 : 0;
    const dodging = flash === 0 && f.intangible && f.invuln === 0;
    for (const mat of this.materials) {
      if (!mat.emissive) continue;
      if (dodging) mat.emissive.setRGB(0.12, 0.22, 0.4);
      else if (flash === 0 && f.slowTimer > 0) mat.emissive.setRGB(0.05, 0.18, 0.05);
      else mat.emissive.setScalar(flash);
    }

    const pose = computePose(f, time);
    const m = f.move;
    if (m?.name === 'roll') {
      // One full forward roll in the direction of travel.
      const t = Math.max(0, Math.min(1, (m.frame - 2) / 16));
      this.tumble.rotation.z = -t * Math.PI * 2 * m.dir;
    } else if (m && pose.pitch !== undefined) {
      // Flips (e.g. a backflip kick) turn the whole body around the waist.
      this.tumble.rotation.z = pose.pitch * f.facing;
    } else {
      // Tumble when launched hard
      const tumbling = f.hitstun > 12 && !f.grounded;
      this.tumble.rotation.z = tumbling ? this.tumble.rotation.z + dt * 12 * f.facing : lerp(this.tumble.rotation.z % (Math.PI * 2), 0, Math.min(1, dt * 15));
    }
    // Spot dodge: sidestep back into the screen.
    const sidestep = m?.name === 'spotdodge' && m.frame <= 16 ? -0.8 : 0;
    this.body.position.z = lerp(this.body.position.z, sidestep, Math.min(1, dt * 25));
    this.root.updateMatrixWorld(true);

    // Attacks follow their keyframes closely so the swing lines up with the hitbox.
    const k = Math.min(1, dt * (pose.state === 'attack' ? 45 : 22));
    if (this.rig) this.animatePlaceholder(pose, k);
    else if (this.puppet) this.animatePuppet(pose, dt, k);
    else this.animateModel(dt);
    this.updateProps(pose);
    this.updateMount(pose, dt);
  }

  updateMount(pose, dt) {
    const { holder, props } = this.mount;
    const name = pose.mount ?? null;
    if (name && !(name in props)) {
      props[name] = createProp(name);
      if (props[name]) holder.add(props[name].object);
    }
    for (const [n, p] of Object.entries(props)) if (p) p.object.visible = n === name;
    if (!name || !props[name]) return;
    holder.position.x = pose.mountX ?? 0;
    holder.rotation.z = lerp(holder.rotation.z, pose.mountPitch ?? 0, Math.min(1, dt * 12)); // wheelies
    props[name].roll?.(Math.abs(this.f.vx) * dt);
  }

  animatePuppet(pose, dt, k) {
    const f = this.f;
    this.model.position.y = lerp(this.model.position.y, -0.2 * pose.crouch, k);
    this.model.rotation.y = Math.PI / 2 + pose.spin;

    // Use the file's own run/walk cycle when it has one; everything else is procedural.
    const speed = Math.abs(f.vx);
    const clip = pose.state === 'run' && (speed > 4.5 ? this.clip('run') : this.clip('walk', 'run'));
    if (clip) {
      this.playClip(clip, 0.08);
      clip.timeScale = Math.max(0.7, Math.min(1.4, speed / 8));
      this.mixer.update(dt);
      this.model.updateMatrixWorld(true);
      return;
    }
    this.stopClips();
    this.body.getWorldQuaternion(_bodyQuat);
    _bodyQuat.multiply(_spin.setFromAxisAngle(Y_AXIS, pose.spin));
    this.puppet.apply(pose, _bodyQuat, k);
  }

  animateModel(dt) {
    const f = this.f;
    if (this.mixer) {
      let action;
      if (f.hitstun > 0) action = this.clip('hit', 'damage', 'fall');
      else if (f.move) action = this.clip(f.move.name, f.move.def.limb === 'leg' ? 'kick' : 'punch', 'attack');
      else if (!f.grounded) action = this.clip('jump', 'fall', 'air');
      else if (Math.abs(f.vx) > 1) action = this.clip('run', 'walk');
      else action = this.clip('idle');
      this.playClip(action ?? this.clip('idle'));
      this.mixer.update(dt);
      return;
    }
    // No skeleton or animations in the file: squash and lean for some life.
    const squash = f.jumpsquat > 0 || f.landingLag > 0 ? 0.85 : 1;
    const lean = f.move ? 0.25 : f.grounded ? Math.min(Math.abs(f.vx) / 40, 0.2) : -0.1;
    this.model.scale.y = lerp(this.model.scale.y, squash, Math.min(1, dt * 20));
    this.model.rotation.z = lerp(this.model.rotation.z, -lean, Math.min(1, dt * 12));
  }

  animatePlaceholder(pose, k) {
    const set = (obj, value) => { obj.rotation.z = lerp(obj.rotation.z, value, k); };
    set(this.armR, limbAngle(pose.rArm, pose.rFore));
    set(this.armL, limbAngle(pose.lArm, pose.lFore));
    set(this.legR, limbAngle(pose.rThigh, pose.rShin));
    set(this.legL, limbAngle(pose.lThigh, pose.lShin));
    this.hips.rotation.z = lerp(this.hips.rotation.z, -pose.lean * 0.6, k);
    this.hips.position.y = lerp(this.hips.position.y, 0.9 - 0.2 * pose.crouch, k);
    this.rig.rotation.y = pose.spin;
    this.rig.updateMatrixWorld(true);
  }

  // Keep held props in the hands: 'club' lines the prop up with the forearm,
  // 'upright' holds it vertical (e.g. lifting the bong to take a rip).
  updateProps(pose) {
    this.body.getWorldQuaternion(_invBody).invert();
    for (const side of ['right', 'left']) {
      const { holder, props } = this.hands[side];
      const held = side === 'right' ? pose.rHeld : pose.lHeld;
      const name = held !== undefined ? held : this.f.handEmpty[side] ? null : this.defaultProps[side];
      const prop = name ? this.handProp(side, name) : null;
      for (const p of Object.values(props)) if (p) p.object.visible = p === prop;
      if (!prop) continue;
      const { hand, elbow } = this.sockets[side];
      hand.getWorldPosition(_hand);
      elbow.getWorldPosition(_elbow);
      _dir.subVectors(_hand, _elbow).normalize();
      _hand.addScaledVector(_dir, this.puppet ? 0.07 : 0); // wrist -> palm
      holder.position.copy(this.body.worldToLocal(_hand));
      const mode = side === 'right' ? pose.rProp : pose.lProp;
      if (mode === 'upright') holder.quaternion.identity();
      else holder.quaternion.setFromUnitVectors(NEG_Y, _dir.applyQuaternion(_invBody));
      prop.setGlow(pose.glow ?? 0);
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}
