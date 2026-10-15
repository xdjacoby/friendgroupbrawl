import * as THREE from 'three';
import { Fighter } from './fighter.js';
import { FighterView } from './view.js';

// Pictures for the character select, rendered from each friend's own 3D
// model in the outfit and extra picked, so a new friend or outfit gets one by
// itself. 'face' is head and shoulders (the roster grid), 'body' is from the
// knees up (the player cards). Each is drawn once, then reused.
//
//   portrait(renderer, character, look, kind) -> Promise<image URL | null>

const SIZES = { face: [256, 256], body: [320, 440] };
const cache = new Map();
let queue = Promise.resolve();

export function portrait(renderer, character, look, kind) {
  const key = `${character.id}|${look?.model ?? ''}|${look?.accessory ?? ''}|${kind}`;
  if (!cache.has(key)) {
    // One at a time: each loads a model and borrows the renderer for a moment.
    // A model that never finishes loading mustn't hold up everyone else's.
    const giveUp = () => new Promise((resolve) => setTimeout(() => resolve(null), 30000));
    const job = queue.then(() => Promise.race([draw(renderer, character, look, kind), giveUp()])).catch((err) => {
      console.warn('Could not draw a portrait', err);
      return null;
    });
    queue = job;
    cache.set(key, job);
  }
  return cache.get(key);
}

async function draw(renderer, character, look, kind) {
  const [w, h] = SIZES[kind];
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4058, 1.5));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.3);
  key.position.set(-2, 3, 4);
  scene.add(key);
  // A rim of their color from behind, so they pop off the card.
  const rim = new THREE.DirectionalLight(character.color, 2.2);
  rim.position.set(2.5, 2, -3);
  scene.add(rim);

  const f = new Fighter({ slot: 0, character, controller: null, spawn: { x: 0, y: 0 }, stocks: 1, look });
  Object.assign(f, { x: 0, y: 0, facing: 1, grounded: true, invuln: 0 });
  const view = new FighterView(f, scene, '#ffffff');
  await view.ready;
  view.marker.visible = false;
  // Turned three-quarters toward the camera (fighters face +x; the camera looks down -z).
  view.root.rotation.y = -Math.PI / 2 + 0.5;
  for (let i = 0; i < 4; i++) view.update(0.1, 0.4 + i * 0.1);
  // Up close, a prop held up in idle (Jacoby's magnifying glass) would hide the face.
  if (kind === 'face') for (const side of ['right', 'left']) view.hands[side].holder.visible = false;

  const s = f.stats.scale;
  const camera = new THREE.PerspectiveCamera(28, w / h, 0.05, 50);
  const target = new THREE.Vector3();
  let dist;
  if (kind === 'face') {
    const head = view.puppet?.b.head;
    if (head) head.getWorldPosition(target).add(new THREE.Vector3(0, -0.06 * s, 0));
    else view.hips.localToWorld(target.set(0, 0.85, 0)); // the stand-in figure's head
    dist = 0.42 * s / Math.tan((14 * Math.PI) / 180);
  } else {
    // Knees up, like the fighter renders on Smash's select screen.
    target.set(0, 1.2 * s, 0);
    dist = 0.82 * s / Math.tan((14 * Math.PI) / 180);
  }
  camera.position.copy(target).add(new THREE.Vector3(0, 0.12, 1).normalize().multiplyScalar(dist));
  camera.lookAt(target);

  // Render off screen with a see-through background, then copy it into an image.
  const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const clear = renderer.getClearColor(new THREE.Color());
  const alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const pixels = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, alpha);
  rt.dispose();
  dispose(scene);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    // WebGL rows run bottom to top; edges are blended with the clear color, so undo that.
    const src = (h - 1 - y) * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const a = pixels[src + x + 3];
      const k = a ? 255 / a : 0;
      const d = y * w * 4 + x;
      img.data[d] = Math.min(255, pixels[src + x] * k);
      img.data[d + 1] = Math.min(255, pixels[src + x + 1] * k);
      img.data[d + 2] = Math.min(255, pixels[src + x + 2] * k);
      img.data[d + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

// Throws away the stand-in's own materials and props (the model's geometry
// and textures are shared with the loader's cache, so those stay).
function dispose(scene) {
  scene.traverse((o) => {
    if (!o.userData.cached) o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (!o.userData.cached && !m.map?.userData.cached) m.map?.dispose();
      m.dispose();
    }
  });
}
