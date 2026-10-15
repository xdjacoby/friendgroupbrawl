import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Loads each .glb once; everyone who asks for the same file shares it
// (fighters clone the scene, props like Byron's Lambo clone it too).
const loader = new GLTFLoader();
const cache = new Map();

export function loadModel(url) {
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).catch((err) => {
      console.warn(`Could not load ${url}, using a stand-in.`, err);
      return null;
    }));
  }
  return cache.get(url);
}
