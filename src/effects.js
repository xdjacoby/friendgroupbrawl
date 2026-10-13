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
