import * as THREE from 'three';
import { Fighter } from './fighter.js';
import { SHOCKWAVE } from './moves.js';
import { createStage, buildStageScene } from './stage.js';
import { FighterView } from './view.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { SLOT_COLORS } from './roster.js';

const END_DELAY = 120; // frames to linger after the final KO

function circleHitsBox(cx, cy, r, f) {
  const nx = Math.max(f.x - f.hw, Math.min(cx, f.x + f.hw));
  const ny = Math.max(f.y, Math.min(cy, f.y + f.h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

// One match: simulation + its scene. Create a new Game per match.
export class Game {
  constructor({ renderer, players, stocks, onEnd }) {
    this.renderer = renderer;
    this.onEnd = onEnd;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    this.camera.position.set(0, 4, 24);
    this.camTarget = new THREE.Vector3(0, 2, 0);
    this.shake = 0;
    this.time = 0;
    this.frame = 0;
    this.endTimer = -1;

    this.stage = createStage();
    this.stageView = buildStageScene(this.stage, this.scene);
    this.effects = new Effects(this.scene);

    this.fighters = players.map((p, i) => new Fighter({
      slot: p.slot,
      character: p.character,
      controller: p.controller,
      spawn: this.stage.spawns[i],
      stocks,
    }));
    this.views = this.fighters.map((f) => new FighterView(f, this.scene, SLOT_COLORS[f.slot]));
    this.projectiles = [];
    this.projectileGeo = new THREE.SphereGeometry(1, 16, 12);
    this.hud = new Hud(this.fighters);
  }

  // ---- Simulation ----

  step() {
    this.frame++;
    if (this.endTimer > 0 && --this.endTimer === 0) return this.finish();

    for (const f of this.fighters) {
      const input = f.controller.poll(f, this);
      f.step(input, this);
    }
    this.resolveHits();
    this.stepProjectiles();
  }

  resolveHits() {
    for (const a of this.fighters) {
      if (a.dead) continue;
      for (const hb of a.activeHitboxes()) {
        const s = a.stats.scale;
        const cx = a.x + hb.x * s * a.facing;
        const cy = a.y + hb.y * s;
        const r = hb.r * s;
        for (const v of this.fighters) {
          if (v === a || v.dead || v.intangible || a.move?.hit.has(v)) continue;
          if (!circleHitsBox(cx, cy, r, v)) continue;
          a.move.hit.add(v);
          v.takeHit(a, hb, a.facing, this);
          this.effects.spark((cx + v.x) / 2, Math.min(cy, v.y + v.h * 0.6), 0xfff2a8, 0.35 + hb.dmg * 0.04);
        }
      }
    }
  }

  spawnProjectile(owner, def) {
    const s = owner.stats.scale;
    if (def.unique) {
      // Only one of these per owner: the old one fades out quickly.
      for (const p of this.projectiles) {
        if (p.owner === owner && p.hb.unique === def.unique) p.life = Math.min(p.life, 15);
      }
    }
    let mesh;
    if (def.look === 'cloud') {
      mesh = this.effects.makeCloud(def.color ?? 0xf0f0f5, def.opacity, def.squash);
    } else {
      mesh = new THREE.Mesh(this.projectileGeo, new THREE.MeshBasicMaterial({ color: owner.character.color }));
    }
    this.scene.add(mesh);
    this.projectiles.push({
      owner,
      stats: owner.stats,
      x: owner.x + (def.x ?? 0.7) * s * owner.facing,
      y: owner.y + (def.y ?? 1.2) * s,
      vx: def.speed * owner.facing,
      r: def.r * s,
      maxR: (def.maxR ?? def.r) * s,
      life: def.life,
      age: 0,
      hits: new Map(), // victim -> age of last hit, for multi-hit clouds
      hb: def,
      mesh,
    });
  }

  stepProjectiles() {
    const m = this.stage.main;
    this.projectiles = this.projectiles.filter((p) => {
      const def = p.hb;
      p.age++;
      p.life--;
      if (def.drag) p.vx *= 1 - def.drag;
      if (def.grow) p.r = Math.min(p.maxR, p.r + def.grow / 60);
      p.x += p.vx / 60;
      let alive = p.life > 0;
      if (!def.pierce && p.x > m.x1 && p.x < m.x2 && p.y < m.top && p.y > m.bottom) alive = false;
      if (alive) {
        for (const v of this.fighters) {
          if (v === p.owner || v.dead || v.intangible) continue;
          if (!circleHitsBox(p.x, p.y, p.r, v)) continue;
          if (def.pierce) {
            const last = p.hits.get(v);
            if (last !== undefined && p.age - last < (def.hitEvery ?? 30)) continue;
            p.hits.set(v, p.age);
          }
          v.takeHit(p, def, Math.sign(p.vx) || Math.sign(v.x - p.x) || 1, this);
          if (!def.noKnockback) this.effects.spark(v.x, v.y + v.h * 0.6, p.owner.character.color, 0.4);
          if (!def.pierce) {
            alive = false;
            break;
          }
        }
      }
      if (!alive) {
        p.mesh.removeFromParent();
        p.mesh.traverse((o) => o.material?.dispose());
      }
      return alive;
    });
  }

  addShockwave(f) {
    const s = f.stats.scale;
    this.effects.shockwave(f.x, f.y, SHOCKWAVE.r * s);
    for (const v of this.fighters) {
      if (v === f || v.dead || v.intangible) continue;
      if (circleHitsBox(f.x, f.y + 0.2, SHOCKWAVE.r * s, v)) {
        v.takeHit(f, SHOCKWAVE, Math.sign(v.x - f.x) || f.facing, this);
      }
    }
  }

  collide(f) {
    const m = this.stage.main;
    const vy = f.vy + f.kby;

    const overMain = f.x + f.hw > m.x1 && f.x - f.hw < m.x2;
    if (overMain && f.y < m.top && f.y + f.h > m.bottom) {
      if (f.prevY >= m.top - 0.01 && vy <= 0) {
        this.landOn(f, m, m.top);
      } else if (f.prevY + f.h <= m.bottom + 0.05) {
        f.y = m.bottom - f.h;
        f.vy = Math.min(f.vy, 0);
        f.kby = -Math.abs(f.kby) * 0.5;
      } else {
        f.x = f.x < (m.x1 + m.x2) / 2 ? m.x1 - f.hw : m.x2 + f.hw;
        f.vx = 0;
        f.kbx = -f.kbx * 0.5;
      }
    }

    if (!f.grounded && f.dropTimer === 0 && vy <= 0) {
      for (const p of this.stage.platforms) {
        if (f.x >= p.x1 - 0.15 && f.x <= p.x2 + 0.15 && f.prevY >= p.y - 0.01 && f.y < p.y) {
          this.landOn(f, p, p.y);
          break;
        }
      }
    }

    // Walking off an edge
    if (f.grounded) {
      const p = f.platform;
      const onIt = p === m ? overMain : f.x >= p.x1 - 0.15 && f.x <= p.x2 + 0.15;
      if (!onIt) {
        f.grounded = false;
        f.platform = null;
      } else {
        f.y = p.y;
      }
    }
  }

  landOn(f, platform, y) {
    f.y = y;
    if (f.grounded) return;
    // Slammed into the floor: bounce instead of landing.
    if (f.hitstun > 0 && f.kby < -7) {
      f.kby = -f.kby * 0.55;
      f.y = y + 0.01;
      this.effects.spark(f.x, y, 0xffffff, 0.6);
      return;
    }
    f.land(platform, this);
  }

  // Snap to a free ledge when falling (or up-specialing / air dodging) next to it.
  tryLedgeGrab(f) {
    if (f.ledge || f.grounded || f.dead || f.hitstun > 0 || f.ledgeCooldown > 0) return;
    const m = f.move;
    if (m && m.name !== 'uspecial' && m.name !== 'airdodge') return;
    if (f.vy + f.kby > 0 && m?.name !== 'uspecial') return; // still rising past it
    const s = f.stats.scale;
    for (const lg of this.stage.ledges) {
      if (lg.holder && lg.holder !== f) continue;
      const outside = (f.x - lg.x) * lg.dir; // distance out past the stage edge
      if (outside < -0.3 || outside > 1.1) continue;
      const handY = f.y + 1.95 * s;
      if (handY < lg.y - 0.6 || handY > lg.y + 0.8) continue;
      f.grabLedge(lg);
      return;
    }
  }

  checkBlastZone(f) {
    if (this.endTimer >= 0) return; // match is decided; nobody else can lose a stock
    const b = this.stage.blast;
    if (f.x < b.left || f.x > b.right || f.y < b.bottom || f.y > b.top) f.die(this);
  }

  onHit(victim, kb) {
    if (kb > 16) this.shake = Math.min(0.6, kb / 60);
  }

  onKO(f) {
    const b = this.stage.blast;
    const x = Math.max(b.left + 3, Math.min(b.right - 3, f.x));
    const y = Math.max(b.bottom + 3, Math.min(b.top - 3, f.y));
    this.effects.koBlast(x, y, f.character.color);
    this.shake = 0.8;
    const left = this.fighters.filter((x) => x.stocks > 0);
    if (left.length <= 1 && this.endTimer < 0) this.endTimer = END_DELAY;
  }

  finish() {
    // Most stocks first; among the eliminated, whoever lasted longest.
    const ranked = [...this.fighters].sort((a, b) =>
      b.stocks - a.stocks || (b.outAt ?? Infinity) - (a.outAt ?? Infinity) || a.percent - b.percent);
    this.onEnd?.(ranked);
  }

  // ---- Rendering ----

  render(dt) {
    this.time += dt;
    this.stageView.update(dt);
    for (const v of this.views) v.update(dt, this.time);
    for (const p of this.projectiles) {
      p.mesh.position.set(p.x, p.y, 0);
      if (p.hb.look === 'cloud') {
        // Fade in over the first few frames, out over the last 30.
        const alpha = Math.min(1, p.age / 6, p.life / 30);
        this.effects.updateCloud(p.mesh, p.r, alpha, this.time);
      } else {
        p.mesh.scale.setScalar(p.r);
      }
    }
    this.effects.update(dt);
    this.updateCamera(dt);
    this.hud.update();
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt) {
    const live = this.fighters.filter((f) => !f.dead);
    const b = this.stage.blast;
    let minX = -6, maxX = 6, minY = -1, maxY = 4;
    for (const f of live) {
      minX = Math.min(minX, f.x);
      maxX = Math.max(maxX, f.x);
      minY = Math.min(minY, f.y);
      maxY = Math.max(maxY, f.y + f.h);
    }
    minX = Math.max(minX, b.left + 2);
    maxX = Math.min(maxX, b.right - 2);
    minY = Math.max(minY, b.bottom + 2);
    maxY = Math.min(maxY, b.top - 1);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2 - 1.2; // aim low so the HUD sits over the void, not the stage
    const aspect = this.camera.aspect;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const needH = Math.max(maxY - minY + 4, (maxX - minX + 5) / aspect);
    const dist = Math.max(14, Math.min(42, needH / (2 * Math.tan(vFov / 2))));

    const k = Math.min(1, dt * 3);
    this.camTarget.lerp(new THREE.Vector3(cx, cy, 0), k);
    const desired = new THREE.Vector3(this.camTarget.x, this.camTarget.y + 1.5, dist);
    this.camera.position.lerp(desired, k);

    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.lookAt(this.camTarget);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.hud.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        m.map?.dispose();
        m.dispose();
      }
    });
  }
}
