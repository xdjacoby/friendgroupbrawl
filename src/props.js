import * as THREE from 'three';

// Held props. Each is built with the grip at the origin and the "business end"
// pointing down -y, so 'club' mode can line -y up with the forearm. +x is the
// way the fighter faces when the prop is held 'upright'.

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

// A big cartoon magnifying glass. Held by the wooden handle; the lens sits
// past the hand (out in front like a racket head in 'club' mode). The lens
// faces the camera so it reads as a glass, with a shine across it.
function magnifyingGlass() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b4a22, roughness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a628, roughness: 0.3, metalness: 0.6, emissive: 0x3a2a00 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xbfe8ff, transparent: true, opacity: 0.35, roughness: 0.05, emissive: 0x1a3a50, depthWrite: false,
  });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });

  part(new THREE.CylinderGeometry(0.02, 0.024, 0.15, 12), wood, 0.03, group); // handle
  part(new THREE.SphereGeometry(0.024, 10, 8), wood, 0.105, group); // knob on the end
  part(new THREE.CylinderGeometry(0.022, 0.018, 0.04, 12), brass, -0.065, group); // ferrule
  part(new THREE.TorusGeometry(0.09, 0.014, 10, 32), brass, -0.175, group); // rim
  part(new THREE.CylinderGeometry(0.088, 0.088, 0.008, 32).rotateX(Math.PI / 2), glass, -0.175, group); // lens
  const glint = part(new THREE.PlaneGeometry(0.018, 0.09), shine, -0.15, group);
  glint.position.set(-0.03, -0.15, 0.006);
  glint.rotation.z = -0.6;
  group.scale.setScalar(1.5); // chunky enough to read at gameplay distance
  return { object: group, setGlow() {} };
}

// ---- Snacks Jacoby digs up (held in his left hand until he eats or throws them) ----

function chips() {
  const group = new THREE.Group();
  group.scale.setScalar(1.5); // cartoon-sized so it reads at gameplay distance
  const bag = new THREE.MeshStandardMaterial({ color: 0xe23b2e, roughness: 0.35, metalness: 0.3 });
  const label = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 });
  const crimp = new THREE.MeshStandardMaterial({ color: 0xcfd6de, roughness: 0.3, metalness: 0.6 });
  part(new THREE.BoxGeometry(0.15, 0.2, 0.06), bag, 0.06, group);
  part(new THREE.BoxGeometry(0.155, 0.07, 0.064), label, 0.06, group);
  part(new THREE.BoxGeometry(0.15, 0.02, 0.03), crimp, 0.17, group);
  part(new THREE.BoxGeometry(0.15, 0.02, 0.03), crimp, -0.05, group);
  return { object: group, setGlow() {} };
}

function cookie() {
  const group = new THREE.Group();
  group.scale.setScalar(1.5); // cartoon-sized so it reads at gameplay distance
  const dough = new THREE.MeshStandardMaterial({ color: 0xd9a05b, roughness: 0.9 });
  const choc = new THREE.MeshStandardMaterial({ color: 0x4a2a14, roughness: 0.7 });
  part(new THREE.CylinderGeometry(0.075, 0.075, 0.022, 20).rotateX(Math.PI / 2), dough, 0.06, group);
  for (const [x, y] of [[-0.03, 0.03], [0.025, 0.04], [0.0, -0.005], [-0.035, -0.03], [0.035, -0.02]]) {
    for (const z of [-0.012, 0.012]) {
      const chip = part(new THREE.SphereGeometry(0.012, 6, 4), choc, 0.06 + y, group);
      chip.position.set(x, 0.06 + y, z);
    }
  }
  return { object: group, setGlow() {} };
}

function donut() {
  const group = new THREE.Group();
  group.scale.setScalar(1.5); // cartoon-sized so it reads at gameplay distance
  const dough = new THREE.MeshStandardMaterial({ color: 0xd49a5a, roughness: 0.8 });
  const icing = new THREE.MeshStandardMaterial({ color: 0xff7eb6, roughness: 0.4 });
  part(new THREE.TorusGeometry(0.055, 0.03, 12, 24), dough, 0.07, group);
  for (const z of [-1, 1]) {
    const top = part(new THREE.TorusGeometry(0.055, 0.026, 10, 24), icing, 0.07, group);
    top.scale.z = 0.5;
    top.position.z = z * 0.012;
  }
  const colors = [0xffffff, 0x4fc3f7, 0xffeb3b, 0x81c784];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const sprinkle = part(new THREE.BoxGeometry(0.014, 0.005, 0.005), new THREE.MeshStandardMaterial({ color: colors[i % 4] }), 0, group);
    sprinkle.position.set(Math.cos(a) * 0.055, 0.07 + Math.sin(a) * 0.055, i % 2 ? 0.028 : -0.028);
    sprinkle.rotation.z = a * 3;
  }
  return { object: group, setGlow() {} };
}

function pizza() {
  const group = new THREE.Group();
  group.scale.setScalar(1.5); // cartoon-sized so it reads at gameplay distance
  const cheese = new THREE.MeshStandardMaterial({ color: 0xffcf4a, roughness: 0.6 });
  const crust = new THREE.MeshStandardMaterial({ color: 0xc9853e, roughness: 0.9 });
  const pepperoni = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.08);
  shape.lineTo(0.075, 0.12);
  shape.lineTo(-0.075, 0.12);
  shape.closePath();
  const slice = part(new THREE.ExtrudeGeometry(shape, { depth: 0.016, bevelEnabled: false }).translate(0, 0, -0.008), cheese, 0, group);
  slice.position.y = 0;
  part(new THREE.CylinderGeometry(0.02, 0.02, 0.17, 10).rotateZ(Math.PI / 2), crust, 0.125, group);
  for (const [x, y] of [[0, 0.07], [-0.025, 0.02], [0.022, 0.025]]) {
    for (const z of [-0.01, 0.01]) {
      const p = part(new THREE.CylinderGeometry(0.017, 0.017, 0.004, 12).rotateX(Math.PI / 2), pepperoni, y, group);
      p.position.set(x, y, z);
    }
  }
  return { object: group, setGlow() {} };
}

// A family-size bag of chips, blown up like a balloon (they're mostly air).
// Held by the bottom crimp with the bag above the hand ('upright'); `glow`
// inflates it, from a limp bag at 0 to fully puffed at 1.
function chipBag() {
  const group = new THREE.Group();
  const bag = new THREE.Group();
  group.add(bag);
  const foil = new THREE.MeshStandardMaterial({ color: 0x2d7fd8, roughness: 0.3, metalness: 0.35 });
  const label = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 });
  const crimp = new THREE.MeshStandardMaterial({ color: 0xcfd6de, roughness: 0.3, metalness: 0.6 });
  const pillow = part(new THREE.SphereGeometry(0.2, 20, 14), foil, 0.32, bag);
  pillow.scale.set(1.15, 1.45, 0.75);
  const badge = part(new THREE.CircleGeometry(0.11, 20), label, 0.32, bag);
  badge.position.z = 0.15;
  part(new THREE.BoxGeometry(0.34, 0.035, 0.05), crimp, 0.02, bag);
  part(new THREE.BoxGeometry(0.34, 0.035, 0.05), crimp, 0.62, bag);
  group.scale.setScalar(1.5); // balloon-sized
  return {
    object: group,
    setGlow(v) {
      bag.scale.set(0.45 + 0.9 * v, 0.6 + 0.8 * v, 0.3 + 0.9 * v);
    },
  };
}

const MAKERS = { bong, dabPen, magnifyingGlass, chips, cookie, donut, pizza, chipBag };

export function createProp(name) {
  const make = MAKERS[name];
  if (!make) {
    console.warn(`Unknown prop "${name}"`);
    return null;
  }
  return make();
}
