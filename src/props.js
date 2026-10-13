import * as THREE from 'three';

// Held props. Each is built with the grip at the origin and the "business end"
// pointing down -y, so 'club' mode can line -y up with the forearm.

function part(geometry, material, y, parent) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// A big, empty glass bong. Held by the neck; the base is the heavy end.
function bong() {
  const group = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({
    color: 0xa8f0e0, transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.1,
    emissive: 0x1d4a44, depthWrite: false,
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x9b59d0, roughness: 0.4, emissive: 0x2a0f40 });

  part(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 16), glass, 0.12, group); // mouthpiece flare
  part(new THREE.TorusGeometry(0.06, 0.012, 8, 20).rotateX(Math.PI / 2), trim, 0.17, group);
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.62, 16), glass, -0.24, group); // neck tube
  part(new THREE.CylinderGeometry(0.055, 0.17, 0.26, 20), glass, -0.68, group); // beaker base
  part(new THREE.TorusGeometry(0.17, 0.018, 8, 24).rotateX(Math.PI / 2), trim, -0.8, group);
  part(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 24), glass, -0.81, group);

  // Downstem + bowl sticking out the front of the base.
  const stem = part(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), glass, -0.58, group);
  stem.position.x = 0.09;
  stem.rotation.z = -0.8;
  const bowl = part(new THREE.SphereGeometry(0.035, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), trim, -0.51, group);
  bowl.position.x = 0.165;
  group.scale.setScalar(0.85);
  return { object: group, setGlow() {} };
}

// A dab pen: slim battery, amber cartridge, black mouthpiece, LED button that
// lights up while he's ripping it.
function dabPen() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d46, roughness: 0.35, metalness: 0.7 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xe0a030, roughness: 0.2, transparent: true, opacity: 0.85, emissive: 0x402000 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.5 });
  const led = new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x000000 });

  part(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 12), metal, 0.03, group); // battery
  part(new THREE.CylinderGeometry(0.024, 0.024, 0.07, 12), amber, -0.085, group); // cartridge
  part(new THREE.CylinderGeometry(0.016, 0.022, 0.04, 12), black, -0.14, group); // mouthpiece
  const button = part(new THREE.SphereGeometry(0.014, 8, 6), led, 0.08, group);
  button.position.z = 0.024;
  part(new THREE.CylinderGeometry(0.027, 0.027, 0.012, 12), led, 0.11, group); // light ring
  group.scale.setScalar(1.4); // chunky enough to read at gameplay distance

  return {
    object: group,
    setGlow(v) {
      led.emissive.setRGB(0.25 * v, 0.85 * v, 1.0 * v);
    },
  };
}

const MAKERS = { bong, dabPen };

export function createProp(name) {
  const make = MAKERS[name];
  if (!make) {
    console.warn(`Unknown prop "${name}"`);
    return null;
  }
  return make();
}
