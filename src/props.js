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

// A chunky cartoon microscope. Held by its curved arm: the base hangs below
// the hand (or swings out past it like a hammer head in 'club' mode).
function microscope() {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x23232b, roughness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9d1dc, roughness: 0.2, metalness: 0.8 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffd34d, emissiveIntensity: 0.6 });

  const base = part(new THREE.BoxGeometry(0.13, 0.032, 0.1), white, -0.155, group);
  base.position.x = 0.03;
  const post = part(new THREE.CylinderGeometry(0.018, 0.022, 0.06, 10), white, -0.11, group);
  post.position.x = -0.005;
  // The curved arm (where the hand grips), opening toward the front.
  const arm = part(new THREE.TorusGeometry(0.06, 0.017, 8, 16, Math.PI), white, -0.02, group);
  arm.rotation.z = Math.PI / 2;
  arm.position.x = 0.055;
  const stage = part(new THREE.BoxGeometry(0.085, 0.01, 0.075), black, -0.07, group);
  stage.position.x = 0.065;
  const light = part(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10), lamp, -0.13, group);
  light.position.x = 0.065;
  const knob = part(new THREE.CylinderGeometry(0.024, 0.024, 0.07, 12).rotateX(Math.PI / 2), chrome, -0.05, group);
  knob.position.x = 0.0;
  // Body tube + eyepiece, tilted back toward the viewer like a real one.
  const tube = part(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 12), black, 0.07, group);
  tube.position.x = 0.075;
  tube.rotation.z = 0.25;
  const eyepiece = part(new THREE.CylinderGeometry(0.015, 0.017, 0.05, 10), black, 0.15, group);
  eyepiece.position.x = 0.055;
  eyepiece.rotation.z = 0.35;
  // Objective lenses with colored rings.
  [0xe74c3c, 0xf1c40f, 0x3498db].forEach((ring, i) => {
    const lens = part(new THREE.CylinderGeometry(0.008, 0.01, 0.035, 8), chrome, -0.025, group);
    lens.position.x = 0.07 + (i - 1) * 0.016;
    lens.rotation.z = (i - 1) * 0.25;
    const band = part(new THREE.CylinderGeometry(0.0105, 0.0105, 0.006, 8), new THREE.MeshStandardMaterial({ color: ring }), -0.03, group);
    band.position.x = lens.position.x;
    band.rotation.z = lens.rotation.z;
  });
  group.scale.setScalar(1.35);
  return { object: group, setGlow() {} };
}

// ---- Snacks Jacoby digs up (held in the left hand while he eats) ----

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

// A 2-liter of cola, cap toward -y so it sprays down when held under him.
function soda() {
  const group = new THREE.Group();
  const bottle = new THREE.MeshStandardMaterial({ color: 0x7ad99a, transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false });
  const cola = new THREE.MeshStandardMaterial({ color: 0x5a2d0c, roughness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.5 });
  part(new THREE.CylinderGeometry(0.042, 0.042, 0.16, 14), cola, 0.07, group);
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 16), bottle, 0.07, group);
  part(new THREE.CylinderGeometry(0.052, 0.052, 0.06, 16), red, 0.07, group);
  part(new THREE.CylinderGeometry(0.018, 0.05, 0.06, 14), bottle, -0.06, group);
  part(new THREE.CylinderGeometry(0.021, 0.021, 0.025, 12), red, -0.1, group);
  return { object: group, setGlow() {} };
}

const MAKERS = { bong, dabPen, microscope, chips, cookie, donut, pizza, soda };

export function createProp(name) {
  const make = MAKERS[name];
  if (!make) {
    console.warn(`Unknown prop "${name}"`);
    return null;
  }
  return make();
}
