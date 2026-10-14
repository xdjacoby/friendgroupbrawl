import * as THREE from 'three';

// Short-lived visual effects: hit sparks, KO blasts, shockwave rings, pop-up text, debris.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.sphere = new THREE.IcosahedronGeometry(1, 1);
    this.ring = new THREE.RingGeometry(0.8, 1, 32);
  }

  add(mesh, life, update) {
    this.scene.add(mesh);
    this.items.push({ mesh, life, max: life, update });
  }

  spark(x, y, color = 0xfff2a8, size = 0.5) {
    const mesh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color, transparent: true }));
    mesh.position.set(x, y, 0.6);
    this.add(mesh, 0.18, (m, t) => {
      m.scale.setScalar(size * (0.5 + t * 1.5));
      m.material.opacity = 1 - t;
    });
  }

  shockwave(x, y, radius) {
    const mesh = new THREE.Mesh(this.ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.05, 0);
    this.add(mesh, 0.3, (m, t) => {
      m.scale.setScalar(radius * (0.3 + t));
      m.material.opacity = 0.9 * (1 - t);
    });
  }

  koBlast(x, y, color) {
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color: i === 1 ? 0xffffff : color, transparent: true }));
      mesh.position.set(x, y, 0.5 - i * 0.2);
      this.add(mesh, 0.6 + i * 0.15, (m, t) => {
        m.scale.setScalar(1 + t * (4 + i * 2));
        m.material.opacity = 1 - t;
      });
    }
  }

  // Exhaust puff: drifts and expands, then fades.
  puff(x, y, size = 0.5, color = 0xf2f2f7, drift = -0.6) {
    const mesh = new THREE.Mesh(this.sphere, new THREE.MeshStandardMaterial({
      color, transparent: true, opacity: 0.6, roughness: 1, depthWrite: false,
    }));
    mesh.position.set(x + (Math.random() - 0.5) * 0.3, y, (Math.random() - 0.5) * 0.4);
    const vy = drift * (0.6 + Math.random() * 0.8);
    this.add(mesh, 0.7, (m, t) => {
      m.position.y += vy / 60;
      m.scale.setScalar(size * (0.4 + t * 1.4));
      m.material.opacity = 0.6 * (1 - t);
    });
  }

  // A soft cluster of puffs used for vapor clouds. Animated by updateCloud().
  makeCloud(color, opacity = 0.5, squash = 1) {
    const group = new THREE.Group();
    group.scale.set(1, squash, 0.6); // shallow in z so it stays inside the stage's depth
    group.userData.opacity = opacity;
    const material = new THREE.MeshStandardMaterial({
      color, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false,
    });
    group.userData.puffs = [];
    for (let i = 0; i < 9; i++) {
      const puff = new THREE.Mesh(this.sphere, material);
      const a = (i / 9) * Math.PI * 2;
      const d = i === 0 ? 0 : 0.45 + Math.random() * 0.25;
      puff.userData = {
        base: new THREE.Vector3(Math.cos(a) * d, Math.sin(a) * d * 0.75, (Math.random() - 0.5) * 0.6),
        size: i === 0 ? 0.75 : 0.45 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
      };
      group.add(puff);
      group.userData.puffs.push(puff);
    }
    group.userData.material = material;
    return group;
  }

  updateCloud(group, radius, alpha, time) {
    group.userData.material.opacity = group.userData.opacity * alpha;
    for (const puff of group.userData.puffs) {
      const { base, size, phase } = puff.userData;
      const wobble = 1 + Math.sin(time * 2 + phase) * 0.08;
      puff.position.copy(base).multiplyScalar(radius);
      puff.position.y += Math.sin(time * 1.3 + phase) * 0.05 * radius;
      puff.scale.setScalar(size * radius * wobble);
    }
  }

  shieldBreak(f) {
    this.koBlast(f.x, f.y + 1, 0x99ccff);
  }

  // Cartoon text that pops up and floats away (heal numbers, "?", "CHOMP!").
  text(x, y, str, color = '#ffffff', size = 0.55, life = 1.0) {
    const font = '900 92px system-ui, sans-serif';
    const canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(str).width + 48); // fit the text
    canvas.height = 128;
    ctx = canvas.getContext('2d'); // resizing resets the context
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#1d1630';
    ctx.strokeText(str, canvas.width / 2, 66);
    ctx.fillStyle = color;
    ctx.fillText(str, canvas.width / 2, 66);
    const aspect = canvas.width / canvas.height;
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
    sprite.renderOrder = 12;
    sprite.position.set(x, y, 1);
    this.add(sprite, life, (m, t) => {
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.5 : 1.1 - Math.min(0.1, (t - 0.12));
      m.scale.set(size * aspect * pop, size * pop, 1);
      m.position.y = y + t * 0.8;
      m.material.opacity = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
    });
  }

  // Little chunks thrown out with gravity (dirt from digging, snack crumbs).
  debris(x, y, color, { count = 6, size = 0.07, speed = 3, up = 4, dir = 0, life = 0.6 } = {}) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color, transparent: true })); // flat cartoon colors
      mesh.position.set(x, y, (Math.random() - 0.5) * 0.4);
      const vx = dir * speed * (0.5 + Math.random()) + (Math.random() - 0.5) * speed;
      let vy = up * (0.6 + Math.random() * 0.6);
      const s = size * (0.6 + Math.random() * 0.8);
      mesh.scale.setScalar(s);
      this.add(mesh, life, (m, t) => {
        vy -= 18 / 60;
        m.position.x += vx / 60;
        m.position.y += vy / 60;
        m.rotation.x += 0.3;
        m.material.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      });
    }
  }

  dirt(x, y, dir) {
    this.debris(x, y, 0x8a5a2b, { count: 5, size: 0.09, speed: 2.5, up: 5, dir });
  }

  crumbs(x, y, color = 0xe0b46a) {
    this.debris(x, y, color, { count: 4, size: 0.045, speed: 1.5, up: 2, life: 0.5 });
  }

  update(dt) {
    this.items = this.items.filter((it) => {
      it.life -= dt;
      if (it.life <= 0) {
        it.mesh.removeFromParent();
        it.mesh.material.map?.dispose();
        it.mesh.material.dispose();
        return false;
      }
      it.update(it.mesh, 1 - it.life / it.max);
      return true;
    });
  }
}
