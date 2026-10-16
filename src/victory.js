import * as THREE from 'three';
import { Fighter } from './fighter.js';
import { FighterView } from './view.js';
import { Effects } from './effects.js';
import { SLOT_COLORS } from './roster.js';
import { createProp } from './props.js';
import { keyframes } from './poses.js';
import { REST } from './moves.js';
import { outfitsFor } from './cosmetics.js';
import { setAtmosphere } from './look.js';

// The victory screen: the winner on a podium doing their victory animation,
// everyone else clapping behind them, confetti. Characters define it as
//   victory: { pose(frame), onFrame(frame, { effects, x, y }), quote, prop }
// pose works like a move's pose (src/poses.js); onFrame adds effects (puffs,
// pop-up text); prop parks a prop in the scene ({ name, x, z, yaw }).

// For characters without their own: a fist pump.
const FIST_PUMP = {
  quote: 'GG.',
  pose: keyframes([
    [0, REST],
    [14, { rArm: [0.3, 1, 0.3], rFore: [0.2, 1, 0.15], look: 0.3 }],
    [22, { rArm: [0.6, -0.1, 0.6], rFore: [0.3, 0.9, 0.4] }],
    [30, { rArm: [0.3, 1, 0.3], rFore: [0.2, 1, 0.15] }],
    [38, { rArm: [0.6, -0.1, 0.6], rFore: [0.3, 0.9, 0.4] }],
    [46, { rArm: [0.3, 1, 0.3], rFore: [0.2, 1, 0.15], look: 0.2 }],
  ]),
};

// The losers clap (on a loop), props put away. On rigged models the palms
// reach for each other and meet in front of the chest.
const CLAP_HANDS = { rHeld: null, lHeld: null, rHand: 'open', lHand: 'open', rPalm: [0.1, 0.1, -1], lPalm: [0.1, 0.1, 1] };
const CLAP_OPEN = {
  rArm: [0.6, -0.6, 0.45], rFore: [0.7, 0.55, -0.1], lArm: [0.6, -0.6, -0.45], lFore: [0.7, 0.55, 0.1],
  rReach: [0.34, 1.22, 0.2], lReach: [0.34, 1.22, -0.2],
};
const CLAP_SHUT = {
  rArm: [0.65, -0.6, 0.2], rFore: [0.65, 0.55, -0.55], lArm: [0.65, -0.6, -0.2], lFore: [0.65, 0.55, 0.55],
  rReach: [0.36, 1.2, 0], lReach: [0.36, 1.2, 0],
};
const clap = keyframes([[0, CLAP_OPEN], [6, CLAP_SHUT], [12, CLAP_OPEN]]);
const CLAP = { pose: (frame) => ({ ...REST, ...clap(frame % 12), ...CLAP_HANDS, look: 0.1 }) };

const PODIUM = 0.5; // podium height
// Where the winner and the others stand: [x, z, yaw toward the camera].
// The results table sits bottom right, so the others line up on the left.
const SPOTS = [[0, 0, 0], [-2.0, -1.3, 0.3], [-3.3, -2.4, 0.4], [-4.5, -3.5, 0.5]];

function backdrop(color) {
  const c = new THREE.Color(color);
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, `#${c.clone().multiplyScalar(0.25).getHexString()}`);
  g.addColorStop(0.55, `#${c.clone().multiplyScalar(0.6).getHexString()}`);
  g.addColorStop(1, `#${c.clone().lerp(new THREE.Color(0xffffff), 0.35).getHexString()}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class VictoryScene {
  constructor({ renderer, ranked }) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.effects = new Effects(this.scene);
    this.frame = 0;
    this.time = 0;
    this.acc = 0;
    const winner = ranked[0];
    this.winner = winner;
    this.victory = winner.character.victory ?? FIST_PUMP;
    this.slotColors = ranked.map((f) => new THREE.Color(SLOT_COLORS[f.slot]).getHex());

    this.scene.background = backdrop(winner.character.color);
    // Everyone's edges catch the backdrop's light.
    setAtmosphere(new THREE.Color(winner.character.color).lerp(new THREE.Color(0xffffff), 0.55), 0.45);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.4));
    const key = new THREE.DirectionalLight(0xfff3dc, 2.4);
    key.position.set(3, 8, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); // seen up close: crisp shadows are cheap with this few things in the scene
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -2, near: 1, far: 30 });
    this.scene.add(key);

    // Spinning rays behind everyone.
    this.rays = new THREE.Group();
    const rayMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false });
    for (let i = 0; i < 16; i++) {
      const shape = new THREE.Shape();
      shape.moveTo(-1.2, 0);
      shape.lineTo(1.2, 0);
      shape.lineTo(0, 30);
      const ray = new THREE.Mesh(new THREE.ShapeGeometry(shape), rayMat);
      ray.rotation.z = (i / 16) * Math.PI * 2;
      this.rays.add(ray);
    }
    this.rays.position.set(0, 1.5, -12);
    this.scene.add(this.rays);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshStandardMaterial({ color: 0x1b2033, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.25, PODIUM, 40),
      new THREE.MeshStandardMaterial({ color: SLOT_COLORS[winner.slot], roughness: 0.5 }),
    );
    podium.position.y = PODIUM / 2;
    podium.castShadow = podium.receiveShadow = true;
    this.scene.add(podium);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.05, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.3, metalness: 0.5 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = PODIUM;
    this.scene.add(rim);

    const prop = this.victory.prop;
    if (prop) {
      const p = createProp(prop.name);
      if (p) {
        p.object.position.set(prop.x ?? 0, 0, prop.z ?? 0);
        p.object.rotation.y = prop.yaw ?? 0;
        p.object.traverse((o) => { o.castShadow = true; });
        this.scene.add(p.object);
      }
    }

    this.actors = ranked.slice(0, SPOTS.length).map((r, i) => {
      const f = new Fighter({ slot: r.slot, character: r.character, controller: null, spawn: { x: 0, y: 0 }, stocks: 1, look: r.look });
      const [x, z, yaw] = SPOTS[i];
      f.x = x;
      f.y = i === 0 ? PODIUM : 0;
      f.facing = 1;
      f.grounded = true;
      f.invuln = 0;
      const view = new FighterView(f, this.scene, SLOT_COLORS[r.slot]);
      view.z = z;
      view.marker.visible = false;
      // Turn to face the camera (fighters face +x; the camera looks down -z).
      view.root.rotation.y = -Math.PI / 2 + yaw;
      const anim = i === 0 ? this.victory : CLAP;
      f.move = { name: 'victory', def: { pose: anim.pose, hitboxes: [] }, frame: 0, hit: new Set() };
      return { f, view, offset: i === 0 ? 0 : i * 4 };
    });
  }

  // Some outfits have their own line (Eli as The Bender...).
  get quote() {
    const { character, look } = this.winner;
    const outfit = look?.model && outfitsFor(character).find((o) => o.model === look.model);
    return outfit?.quote ?? this.victory.quote ?? '';
  }

  render(dt) {
    this.time += dt;
    // Animate at a steady 60 frames a second, like the match.
    this.acc += dt;
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      this.frame++;
      const w = this.actors[0].f;
      this.victory.onFrame?.(this.frame, { effects: this.effects, x: w.x, y: w.y });
      if (this.frame < 300 && this.frame % 40 === 1) this.effects.confetti(0, 6, this.slotColors, 26, 9);
      if (this.frame % 30 === 0) this.effects.sparkle(0, PODIUM + 0.2, 0xffe680, 2, 2.2);
    }
    for (const a of this.actors) {
      a.f.move.frame = this.frame + a.offset;
      a.view.update(dt, this.time);
    }
    this.rays.rotation.z += dt * 0.08;
    this.effects.update(dt);

    // Slow drift around the winner.
    const sway = Math.sin(this.time * 0.25) * 0.7;
    this.camera.position.set(sway, 1.8, 6.6 - Math.min(1, this.time * 0.4) * 0.8);
    this.camera.lookAt(0, 1.45, 0);
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.scene.background?.dispose?.();
    this.scene.traverse((o) => {
      if (!o.userData.cached) o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (!o.userData.cached && !m.map?.userData.cached) m.map?.dispose();
        if (!m.userData.shared) m.dispose();
      }
    });
  }
}
