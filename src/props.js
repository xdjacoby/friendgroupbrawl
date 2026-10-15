import * as THREE from 'three';
import { RoundedBoxGeometry as RoundedBox } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { loadModel } from './models.js';
import { FONTS } from './fonts.js';

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
  group.scale.setScalar(1.2); // a bit chunky so it reads at gameplay distance

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
  group.scale.setScalar(1.35); // a bit chunky so it reads at gameplay distance
  return { object: group, setGlow() {} };
}

// ---- Snacks Jacoby digs up (held in his left hand until he eats or throws them) ----

function chips() {
  const group = new THREE.Group();
  group.scale.setScalar(1.25); // a bit big so it reads at gameplay distance
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
  group.scale.setScalar(1.25); // a bit big so it reads at gameplay distance
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
  group.scale.setScalar(1.25); // a bit big so it reads at gameplay distance
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
  group.scale.setScalar(1.25); // a bit big so it reads at gameplay distance
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

// ---- Eli ----

// His phone: always out. `glow` lights up the screen (1 = camera flash).
function phone() {
  const group = new THREE.Group();
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.4 });
  const screen = new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0xff2d6f, emissiveIntensity: 0.25, roughness: 0.2 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x000000 });
  part(new THREE.BoxGeometry(0.075, 0.15, 0.012), caseMat, -0.06, group);
  const face = part(new THREE.PlaneGeometry(0.066, 0.135), screen, -0.06, group);
  face.position.z = 0.0065;
  const back = part(new THREE.PlaneGeometry(0.066, 0.135), screen, -0.06, group);
  back.position.z = -0.0065;
  back.rotation.y = Math.PI;
  const cam = part(new THREE.SphereGeometry(0.009, 8, 6), lens, -0.115, group);
  cam.position.z = -0.008;
  group.scale.setScalar(1.12); // a big phone, but a phone
  return {
    object: group,
    setGlow(v) {
      screen.emissiveIntensity = 0.25 + 0.75 * v;
      screen.emissive.setHex(v > 0.9 ? 0xffffff : 0xff2d6f);
      lens.emissive.setScalar(v > 0.9 ? 1 : 0);
    },
  };
}

// Selfie stick with the phone on the end (up air).
function selfieStick() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.3, metalness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.6 });
  part(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 10), grip, 0, group);
  part(new THREE.CylinderGeometry(0.01, 0.012, 0.72, 8), metal, -0.43, group);
  const ph = phone();
  ph.object.scale.setScalar(1.3);
  ph.object.position.y = -0.76;
  ph.setGlow(1);
  group.add(ph.object);
  return { object: group, setGlow() {} };
}

// ---- Andrew ----

// Insulin pen: blue body, a little window on the cartridge, orange dose dial
// on top and the needle at the business end.
function insulinPen() {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x2e86de, roughness: 0.35 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.4 });
  const dial = new THREE.MeshStandardMaterial({ color: 0xff8a1f, roughness: 0.4, emissive: 0x000000 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xd8f3ff, transparent: true, opacity: 0.6, roughness: 0.1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.2, metalness: 0.8 });
  part(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), dial, 0.08, group); // dose dial
  part(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 12), body, 0.0, group);
  part(new THREE.CylinderGeometry(0.019, 0.019, 0.06, 12), glass, -0.09, group); // cartridge window
  part(new THREE.CylinderGeometry(0.016, 0.019, 0.025, 12), white, -0.13, group);
  part(new THREE.CylinderGeometry(0.0025, 0.0025, 0.05, 6), steel, -0.165, group); // needle
  group.scale.setScalar(0.8); // ~24 cm: a real pen is ~17
  return { object: group, setGlow(v) { dial.emissive.setRGB(0.6 * v, 0.25 * v, 0); } };
}

// Juice box with a bendy straw (down special: fixes a low).
function juiceBox() {
  const group = new THREE.Group();
  const box = new THREE.MeshStandardMaterial({ color: 0x5cc243, roughness: 0.6 });
  const label = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.6 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  part(new THREE.BoxGeometry(0.075, 0.11, 0.05), box, 0.06, group);
  part(new THREE.SphereGeometry(0.022, 10, 8), label, 0.06, group).position.z = 0.022;
  const s1 = part(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 6), straw, 0.145, group);
  s1.position.x = 0.02;
  const s2 = part(new THREE.CylinderGeometry(0.005, 0.005, 0.04, 6), straw, 0.185, group);
  s2.position.x = 0.035;
  s2.rotation.z = -0.9;
  group.scale.setScalar(1.25);
  return { object: group, setGlow() {} };
}

// A big French loaf (carbs!) he swings like a club.
function bread() {
  const group = new THREE.Group();
  const crust = new THREE.MeshStandardMaterial({ color: 0xd9953f, roughness: 0.8 });
  const score = new THREE.MeshStandardMaterial({ color: 0xf6d9a0, roughness: 0.9 });
  const loaf = part(new THREE.CapsuleGeometry(0.06, 0.62, 4, 10), crust, -0.3, group);
  loaf.scale.z = 0.85;
  for (let i = 0; i < 4; i++) {
    const cut = part(new THREE.CapsuleGeometry(0.012, 0.07, 2, 6), score, -0.08 - i * 0.15, group);
    cut.position.z = 0.05;
    cut.rotation.x = 0.25;
    cut.rotation.z = 0.7;
  }
  return { object: group, setGlow() {} };
}

// Glucose meter with a test strip; the screen shows a reading.
function glucoseMeter() {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0xe8ebf0, roughness: 0.4 });
  const screen = new THREE.MeshStandardMaterial({ color: 0x9fe8a8, emissive: 0x2a6a32, roughness: 0.3 });
  const strip = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  part(new THREE.BoxGeometry(0.06, 0.1, 0.022), shell, 0.05, group);
  part(new THREE.PlaneGeometry(0.045, 0.035), screen, 0.065, group).position.z = 0.012;
  part(new THREE.BoxGeometry(0.012, 0.04, 0.002), strip, 0.115, group);
  group.scale.setScalar(1.25);
  return { object: group, setGlow() {} };
}

// ---- Byron ----

// Wired earbuds (his Lasso of Truth). Held by the cord with the buds dangling
// ('upright'); `glow` pays the cord out from 0.25m to ~3.8m for whips and the lasso.
function earbuds() {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.35 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.4 });
  const cord = part(new THREE.CylinderGeometry(0.006, 0.006, 1, 6).translate(0, -0.5, 0), white, 0, group);
  const end = new THREE.Group();
  group.add(end);
  for (const side of [-1, 1]) {
    const lead = part(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 6).translate(0, -0.06, 0), white, 0, end);
    lead.rotation.z = side * 0.35;
    const bud = part(new THREE.CapsuleGeometry(0.022, 0.03, 4, 8), white, -0.13, end);
    bud.position.x = side * 0.045;
    const tip = part(new THREE.SphereGeometry(0.018, 8, 6), grey, -0.16, end);
    tip.position.x = side * 0.05;
  }
  end.scale.setScalar(1.2);
  const set = (v) => {
    const len = 0.25 + 3.6 * v;
    cord.scale.y = len;
    end.position.y = -len;
  };
  set(0);
  return { object: group, setGlow: set };
}

// His car keys (for when the Lambo is "in the shop").
function carKeys() {
  const group = new THREE.Group();
  const ring = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.8 });
  const fob = new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.4 });
  const badge = new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.4 });
  part(new THREE.TorusGeometry(0.025, 0.004, 6, 16), ring, -0.025, group);
  part(new THREE.BoxGeometry(0.035, 0.06, 0.016), fob, -0.08, group);
  part(new THREE.CircleGeometry(0.01, 6), badge, -0.075, group).position.z = 0.009;
  group.scale.setScalar(1.4);
  return { object: group, setGlow() {} };
}

// Wheels that turn as the vehicle rolls (roll(distance)).
function wheels(group, spots, r, width) {
  const tire = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.8 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.25, metalness: 0.7 });
  const list = [];
  for (const [x, z] of spots) {
    const w = new THREE.Group();
    w.position.set(x, r, z);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 18).rotateX(Math.PI / 2), tire);
    t.castShadow = true;
    w.add(t);
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.5, r * 0.22, width + 0.02), rim);
      spoke.rotation.z = (i / 3) * Math.PI;
      w.add(spoke);
    }
    group.add(w);
    list.push(w);
  }
  return (dist) => { for (const w of list) w.rotation.z -= dist / r; };
}

// Byron's Lamborghini: an Aventador SVJ (public/models/lambo.glb, made from a
// Sketchfab model by tools/prep_lambo.py: roof cut off so you can see him
// driving, seat at the origin, nose toward +x). The cartoon car below stands
// in until it loads, or if the file is missing.
function lambo() {
  const group = new THREE.Group();
  const stand = cartoonLambo();
  stand.object.position.x = 0.25; // its cockpit over the seat
  group.add(stand.object);
  let wheels = [];
  let rollStand = stand.roll;
  loadModel('models/lambo.glb').then((gltf) => {
    if (!gltf) return;
    const car = gltf.scene.clone();
    car.traverse((o) => {
      o.userData.cached = true; // geometry and textures are shared with the cache
      if (!o.isMesh) return;
      o.castShadow = true;
      // Its own materials, showing both sides now that the roof is gone.
      o.material = o.material.clone();
      o.material.side = THREE.DoubleSide;
    });
    wheels = ['wheel_fl', 'wheel_fr', 'wheel_rear'].map((n) => car.getObjectByName(n)).filter(Boolean);
    group.remove(stand.object);
    group.add(car);
    rollStand = null;
  });
  return {
    object: group,
    setGlow() {},
    pivot: [-1.0, 0.25], // rear axle: wheelies tip up around it
    roll(dist) {
      rollStand?.(dist);
      for (const w of wheels) w.rotation.z -= dist / 0.25; // wheel radius 0.25 m
    },
  };
}

// The cartoon Lambo (a roadster, so you can see him driving it). Sits on the
// ground at the origin, nose toward +x.
function cartoonLambo() {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.25, metalness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: 0x18181d, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223344, transparent: true, opacity: 0.55, roughness: 0.05 });
  const light = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
  const tail = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const profile = new THREE.Shape();
  [[-1.35, 0.25], [1.25, 0.25], [1.42, 0.36], [1.3, 0.48], [0.5, 0.62], [0.35, 0.6], [-0.55, 0.6],
    [-0.7, 0.72], [-1.2, 0.76], [-1.4, 0.6]].forEach(([x, y], i) => (i ? profile.lineTo(x, y) : profile.moveTo(x, y)));
  profile.closePath();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(profile, { depth: 1.0, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }).translate(0, 0, -0.5), paint);
  body.castShadow = true;
  group.add(body);
  // Black side intake and sill.
  const intake = new THREE.Shape();
  [[-0.65, 0.33], [-0.25, 0.33], [-0.45, 0.55], [-0.75, 0.55]].forEach(([x, y], i) => (i ? intake.lineTo(x, y) : intake.moveTo(x, y)));
  const intakeMat = new THREE.MeshStandardMaterial({ color: 0x18181d, roughness: 0.5, side: THREE.DoubleSide });
  for (const z of [-0.56, 0.56]) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(intake), intakeMat);
    m.position.z = z;
    group.add(m);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.06, 1.12), black);
  sill.position.set(0, 0.27, 0);
  group.add(sill);
  // Windshield, slanted back over the cockpit.
  const ws = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.95), glass);
  ws.position.set(0.37, 0.8, 0);
  ws.rotation.z = 0.75;
  group.add(ws);
  // Rear wing.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 1.15), black);
  wing.position.set(-1.25, 0.98, 0);
  group.add(wing);
  for (const z of [-0.35, 0.35]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.04), black);
    strut.position.set(-1.2, 0.86, z);
    group.add(strut);
  }
  // Lights.
  for (const z of [-0.35, 0.35]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.22), light);
    h.position.set(1.33, 0.43, z);
    h.rotation.z = -0.5;
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.3), tail);
    t.position.set(-1.43, 0.62, z);
    group.add(t);
  }
  const roll = wheels(group, [[0.85, 0.5], [0.85, -0.5], [-0.85, 0.5], [-0.85, -0.5]], 0.3, 0.24);
  return { object: group, setGlow() {}, roll };
}

// Eli's hoverboard (Subway Surfers): a graffiti deck with kicked-up ends and
// two jets underneath. Ridden at his feet (pose.mount); `setGlow` fires the jets.
function hoverboard() {
  const group = new THREE.Group();
  const top = new THREE.CanvasTexture((() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, '#ff2d6f');
    g.addColorStop(0.5, '#ffd23f');
    g.addColorStop(1, '#25f4ee');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#1d1630';
    for (let i = 0; i < 6; i++) ctx.fillRect(20 + i * 40, 0, 10, 64);
    return c;
  })());
  top.colorSpace = THREE.SRGBColorSpace;
  const deckMat = new THREE.MeshStandardMaterial({ map: top, roughness: 0.4 });
  const under = new THREE.MeshStandardMaterial({ color: 0x23254f, roughness: 0.5 });
  const deck = new THREE.Mesh(new RoundedBox(0.95, 0.06, 0.34, 2, 0.025), [under, under, deckMat, under, under, under]);
  deck.position.y = -0.03;
  deck.castShadow = true;
  group.add(deck);
  for (const side of [-1, 1]) {
    const kick = new THREE.Mesh(new RoundedBox(0.18, 0.05, 0.32, 2, 0.02), under);
    kick.position.set(side * 0.53, 0.0, 0);
    kick.rotation.z = side * 0.45;
    group.add(kick);
  }
  const jetMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.3, metalness: 0.6 });
  const flame = new THREE.MeshBasicMaterial({ color: 0x7ef9ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [];
  for (const x of [-0.25, 0.25]) {
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.08, 10), jetMat);
    jet.position.set(x, -0.1, 0);
    group.add(jet);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 10).translate(0, -0.15, 0).rotateZ(Math.PI), flame);
    f.rotation.z = Math.PI;
    f.position.set(x, -0.14, 0);
    group.add(f);
    flames.push(f);
  }
  let t = 0;
  return {
    object: group,
    setGlow() {},
    roll(dist) {
      t += 0.2 + dist;
      for (const f of flames) f.scale.set(1, 0.7 + Math.sin(t * 7 + f.position.x * 9) * 0.25 + Math.min(1, dist * 8) * 0.6, 1);
    },
  };
}

// The FBI van that answers Eli's call. Black, "FBI" down the side, light bar.
function fbiVan() {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.35, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.05 });
  const red = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  const blue = new THREE.MeshBasicMaterial({ color: 0x2060ff });
  const body = new THREE.Mesh(new RoundedBox(3.2, 1.55, 1.3), paint);
  body.position.set(0, 1.08, 0);
  body.castShadow = true;
  group.add(body);
  const hood = new THREE.Mesh(new RoundedBox(0.7, 0.75, 1.28), paint);
  hood.position.set(1.75, 0.68, 0);
  group.add(hood);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 1.2), glass);
  ws.position.set(1.62, 1.4, 0);
  ws.rotation.z = 0.35;
  group.add(ws);
  const label = document.createElement('canvas');
  label.width = 512;
  label.height = 160;
  const ctx = label.getContext('2d');
  ctx.font = `150px ${FONTS.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd400';
  ctx.fillText('FBI', 256, 86);
  const map = new THREE.CanvasTexture(label);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const z of [-0.66, 0.66]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.56), new THREE.MeshBasicMaterial({ map, transparent: true }));
    sign.position.set(-0.2, 1.05, z);
    if (z < 0) sign.rotation.y = Math.PI;
    group.add(sign);
  }
  const bar = [];
  for (const [z, mat] of [[-0.3, red], [0.3, blue]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5), mat);
    l.position.set(0.9, 1.92, z);
    group.add(l);
    bar.push(l);
  }
  const rollWheels = wheels(group, [[1.1, 0.6], [1.1, -0.6], [-1.1, 0.6], [-1.1, -0.6]], 0.36, 0.26);
  let t = 0;
  return {
    object: group,
    setGlow() {},
    roll(dist) {
      rollWheels(dist);
      t += dist;
      const on = Math.floor(t * 1.5) % 2;
      bar[0].visible = !!on;
      bar[1].visible = !on;
    },
  };
}

const MAKERS = {
  bong, dabPen, magnifyingGlass, chips, cookie, donut, pizza, chipBag,
  phone, selfieStick, insulinPen, juiceBox, bread, glucoseMeter, earbuds, carKeys, lambo, fbiVan, hoverboard,
};

// How a hand holds each prop (rigged models close their fingers around it):
//   style  'fist' wraps a handle; 'palm' lays a flat thing (a phone) on the palm
//   r      handle radius in meters (or half the thickness for 'palm'); fingers close tighter on thin ones
//   y      where along the prop the hand goes (meters up its axis from the origin)
//   clear  false: don't tip it away from the body (cords, tiny things)
const GRIPS = {
  bong: { style: 'fist', r: 0.042, y: -0.02 },
  dabPen: { style: 'fist', r: 0.03, y: 0.03 },
  magnifyingGlass: { style: 'fist', r: 0.03, y: 0.04 },
  chips: { style: 'palm', r: 0.04, y: 0.07 },
  cookie: { style: 'palm', r: 0.015, y: 0.075 },
  donut: { style: 'palm', r: 0.03, y: 0.085 },
  pizza: { style: 'palm', r: 0.012, y: 0.12 },
  chipBag: { style: 'fist', r: 0.03, y: 0.03 },
  phone: { style: 'palm', r: 0.007, y: -0.07 },
  selfieStick: { style: 'fist', r: 0.018, y: 0, clear: false },
  insulinPen: { style: 'fist', r: 0.017, y: 0.02 },
  juiceBox: { style: 'fist', r: 0.035, y: 0.07 },
  bread: { style: 'fist', r: 0.055, y: -0.06 },
  glucoseMeter: { style: 'palm', r: 0.014, y: 0.06 },
  earbuds: { style: 'fist', r: 0.012, y: 0, clear: false },
  carKeys: { style: 'fist', r: 0.014, y: -0.04, clear: false },
};

const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const PROFILE_BINS = 6;

export function createProp(name) {
  const make = MAKERS[name];
  if (!make) {
    console.warn(`Unknown prop "${name}"`);
    return null;
  }
  const prop = make();
  prop.grip = GRIPS[name] ?? null;
  if (prop.grip) {
    // How thick it is along its length, so the puppet can keep it out of the
    // body (a bong's thin neck can sit by the chest, its base can't).
    prop.object.updateMatrixWorld(true);
    _box.setFromObject(prop.object);
    const top = _box.max.y;
    const bottom = _box.min.y;
    const profile = new Array(PROFILE_BINS).fill(0);
    prop.object.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const bin = Math.min(PROFILE_BINS - 1, Math.max(0, Math.floor(((_v.y - bottom) / (top - bottom || 1)) * PROFILE_BINS)));
        profile[bin] = Math.max(profile[bin], Math.hypot(_v.x, _v.z));
      }
    });
    prop.extent = { top, bottom, profile };
  }
  return prop;
}
