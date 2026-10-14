import * as THREE from 'three';

// Stage layout in meters. Gameplay happens on the x/y plane at z = 0.
export function createStage() {
  const main = { x1: -7, x2: 7, y: 0, top: 0, bottom: -3, passThrough: false };
  return {
    name: 'Battleground',
    main,
    // Grabbable corners of the main platform. dir = which side the hanging fighter is on.
    ledges: [
      { x: main.x1, y: main.top, dir: -1, platform: main, holder: null },
      { x: main.x2, y: main.top, dir: 1, platform: main, holder: null },
    ],
    platforms: [
      { x1: -4.4, x2: -1.6, y: 2.7, passThrough: true },
      { x1: 1.6, x2: 4.4, y: 2.7, passThrough: true },
      { x1: -1.4, x2: 1.4, y: 5.3, passThrough: true },
    ],
    blast: { left: -19, right: 19, top: 15, bottom: -10 },
    respawnY: 8,
    spawns: [
      { x: -4.5, y: 0 },
      { x: 4.5, y: 0 },
      { x: -1.8, y: 0 },
      { x: 1.8, y: 0 },
    ],
  };
}

export function buildStageScene(stage, scene) {
  scene.background = new THREE.Color(0x87b6e8);
  scene.fog = new THREE.Fog(0x87b6e8, 40, 120);

  const hemi = new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 14, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 14, bottom: -8, near: 1, far: 50 });
  scene.add(sun);

  const m = stage.main;
  const width = m.x2 - m.x1;
  const depth = 4;

  // Grass top
  const grass = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.35, depth),
    new THREE.MeshStandardMaterial({ color: 0x5cb85c, roughness: 0.9 }),
  );
  grass.position.set((m.x1 + m.x2) / 2, m.top - 0.175, 0);
  grass.receiveShadow = true;
  scene.add(grass);

  // Rocky body, tapering underneath so it reads as a floating island.
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a6f55, roughness: 1, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, m.top - m.bottom - 0.35, depth), rockMat);
  body.position.set((m.x1 + m.x2) / 2, (m.top - 0.35 + m.bottom) / 2, 0);
  body.receiveShadow = true;
  scene.add(body);
  const under = new THREE.Mesh(new THREE.ConeGeometry(width * 0.45, 5, 7), rockMat);
  under.rotation.x = Math.PI;
  under.scale.z = 0.35;
  under.position.set(0, m.bottom - 2.5, 0);
  scene.add(under);

  // Pass-through platforms
  const platMat = new THREE.MeshStandardMaterial({ color: 0xf2e6c9, roughness: 0.6 });
  for (const p of stage.platforms) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.x2 - p.x1, 0.22, 2.2), platMat);
    mesh.position.set((p.x1 + p.x2) / 2, p.y - 0.11, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Background scenery: distant hills and clouds.
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x6f9f6a, roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(8 + (i % 3) * 4, 0), hillMat);
    hill.position.set(-48 + i * 12, -14 + (i % 2) * 3, -45 - (i % 3) * 8);
    scene.add(hill);
  }
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const clouds = [];
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + Math.random(), 0), cloudMat);
      puff.position.set(j * 1.6, Math.random() * 0.8, Math.random());
      cloud.add(puff);
    }
    cloud.position.set(-40 + i * 11, 8 + Math.random() * 10, -30 - Math.random() * 15);
    clouds.push(cloud);
    scene.add(cloud);
  }

  return {
    update(dt) {
      for (const c of clouds) {
        c.position.x += dt * 0.6;
        if (c.position.x > 50) c.position.x = -50;
      }
    },
  };
}
