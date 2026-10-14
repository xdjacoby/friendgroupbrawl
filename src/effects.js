import * as THREE from 'three';

// Short-lived visual effects: hit sparks, KO blasts, shockwave rings.
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

  update(dt) {
    this.items = this.items.filter((it) => {
      it.life -= dt;
      if (it.life <= 0) {
        it.mesh.removeFromParent();
        it.mesh.material.dispose();
        return false;
      }
      it.update(it.mesh, 1 - it.life / it.max);
      return true;
    });
  }
}
