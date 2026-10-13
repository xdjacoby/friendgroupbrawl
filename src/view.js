import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

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

function capsule(radius, length, material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), material);
  mesh.castShadow = true;
  return mesh;
}

// Visual for one fighter. Reads simulation state, never writes it.
export class FighterView {
  constructor(fighter, scene, slotColor) {
    this.f = fighter;
    this.root = new THREE.Group();
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
    this.root.scale.setScalar(fighter.stats.scale);

    if (fighter.character.model) this.tryLoadModel(fighter.character.model);
  }

  buildPlaceholder(color) {
    const base = new THREE.Color(color);
    const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55 });
    const skin = new THREE.MeshStandardMaterial({ color: base.clone().lerp(new THREE.Color(0xffe0c4), 0.65), roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1f });
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
    this.armNear = limb(0, 0.6, 0.36, 0.09, 0.45, skin);
    this.armFar = limb(0, 0.6, -0.36, 0.09, 0.45, skin);
    this.legNear = limb(0, 0.02, 0.15, 0.11, 0.72, mat);
    this.legFar = limb(0, 0.02, -0.15, 0.11, 0.72, mat);
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

    const holder = new THREE.Group();
    holder.rotation.y = Math.PI / 2; // glTF faces +z; gameplay "forward" is +x
    holder.add(model);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) if (mat.emissive) this.materials.push(mat);
      }
    });

    this.body.remove(this.rig);
    this.rig = null;
    this.model = holder;
    this.body.add(holder);

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

  playClip(action) {
    if (!action || action === this.current) return;
    action.reset().fadeIn(0.12).play();
    this.current?.fadeOut(0.12);
    this.current = action;
  }

  update(dt, time) {
    const f = this.f;
    this.root.visible = !f.dead;
    if (f.dead) return;

    this.root.position.set(f.x, f.y, 0);
    const targetYaw = f.facing > 0 ? 0 : Math.PI;
    this.body.rotation.y = lerp(this.body.rotation.y, targetYaw, Math.min(1, dt * 20));

    // Shield bubble
    this.shield.visible = f.shielding;
    if (f.shielding) this.shield.scale.setScalar(0.45 + 0.65 * (f.shieldHP / 50));

    // Hit flash / respawn blink
    const flash = f.hitFlash > 0 ? 0.9 : f.invuln > 0 && Math.floor(time * 10) % 2 ? 0.45 : f.helpless ? 0.15 : 0;
    for (const m of this.materials) m.emissive?.setScalar(flash);

    // Tumble when launched hard
    const tumbling = f.hitstun > 12 && !f.grounded;
    this.tumble.rotation.z = tumbling ? this.tumble.rotation.z + dt * 12 * f.facing : lerp(this.tumble.rotation.z % (Math.PI * 2), 0, Math.min(1, dt * 15));

    if (this.rig) this.animatePlaceholder(dt, time);
    else this.animateModel(dt);
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
    // No animations in the file: squash and lean for some life.
    const squash = f.jumpsquat > 0 || f.landingLag > 0 ? 0.85 : 1;
    const lean = f.move ? 0.25 : f.grounded ? Math.min(Math.abs(f.vx) / 40, 0.2) : -0.1;
    this.model.scale.y = lerp(this.model.scale.y, squash, Math.min(1, dt * 20));
    this.model.rotation.z = lerp(this.model.rotation.z, -lean, Math.min(1, dt * 12));
  }

  animatePlaceholder(dt, time) {
    const f = this.f;
    const k = Math.min(1, dt * 18);
    const pose = { armNear: 0.15, armFar: -0.15, legNear: 0, legFar: 0, hipsY: 0.9, spin: 0 };

    if (f.hitstun > 0) {
      Object.assign(pose, { armNear: 2.4, armFar: 2.0, legNear: 0.6, legFar: -0.4 });
    } else if (f.move) {
      this.attackPose(pose);
    } else if (f.shielding || f.jumpsquat > 0 || f.landingLag > 0) {
      Object.assign(pose, { hipsY: 0.72, legNear: 0.5, legFar: -0.3, armNear: 0.6, armFar: 0.5 });
    } else if (!f.grounded) {
      const rising = f.vy > 0;
      Object.assign(pose, {
        armNear: f.helpless ? 2.8 : rising ? 2.2 : 1.2,
        armFar: f.helpless ? 2.6 : rising ? 1.8 : 1.0,
        legNear: 0.7, legFar: -0.2,
      });
    } else if (Math.abs(f.vx) > 0.5) {
      const speed = Math.abs(f.vx);
      const swing = Math.sin(time * speed * 2.2) * Math.min(1.1, speed / 7);
      Object.assign(pose, { legNear: swing, legFar: -swing, armNear: -swing * 0.8, armFar: swing * 0.8 });
    } else {
      pose.hipsY = 0.9 + Math.sin(time * 3) * 0.015;
    }

    this.armNear.rotation.z = lerp(this.armNear.rotation.z, pose.armNear, k);
    this.armFar.rotation.z = lerp(this.armFar.rotation.z, pose.armFar, k);
    this.legNear.rotation.z = lerp(this.legNear.rotation.z, pose.legNear, k);
    this.legFar.rotation.z = lerp(this.legFar.rotation.z, pose.legFar, k);
    this.hips.position.y = lerp(this.hips.position.y, pose.hipsY, k);
    this.rig.rotation.y = pose.spin;
  }

  attackPose(pose) {
    const { def, frame } = this.f.move;
    const hb = def.hitboxes[0];
    const start = hb?.start ?? def.projectileFrame ?? 8;
    const end = hb?.end ?? start + 4;

    if (def.limb === 'spin') {
      const t = Math.max(0, frame - start) / Math.max(1, end - start);
      pose.spin = frame >= start && frame <= end ? t * Math.PI * 2 : 0;
      Object.assign(pose, { armNear: Math.PI / 2, armFar: Math.PI / 2, legNear: 0.9, legFar: -0.9 });
      return;
    }

    // Point the swinging limb from its joint toward the hitbox.
    const tx = hb?.x ?? 0.9;
    const ty = hb?.y ?? 1.3;
    const isArm = def.limb === 'arm';
    const jointY = isArm ? 1.5 : 0.92;
    const aim = Math.atan2(tx, -(ty - jointY));
    const windup = aim - Math.sign(tx || 1) * 1.2;
    const angle = frame < start ? lerp(0, windup, frame / start) : frame <= end ? aim : aim * 0.6;

    if (isArm) pose.armNear = angle;
    else {
      pose.legNear = angle;
      pose.legFar = -0.3;
      pose.armNear = 1.0;
      pose.armFar = -0.6;
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}
