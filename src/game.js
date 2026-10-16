import * as THREE from 'three';
import { Fighter } from './fighter.js';
import { SHOCKWAVE, hitboxPos } from './moves.js';
import { stageById } from './stages.js';
import { FighterView } from './view.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { SLOT_COLORS } from './roster.js';
import { createProp } from './props.js';
import { voice } from './voice.js';

const END_DELAY = 120; // frames to linger after the final KO

function circleHitsBox(cx, cy, r, f) {
  const nx = Math.max(f.x - f.hw, Math.min(cx, f.x + f.hw));
  const ny = Math.max(f.y, Math.min(cy, f.y + f.hurtH));
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

// A hitbox that moved since last frame sweeps the whole gap, so fast swings
// and lunges can't skip past someone between two frames.
function sweepHitsBox(x0, y0, x1, y1, r, f) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 1;
    if (circleHitsBox(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, f)) return true;
  }
  return false;
}

// World-space center of a fighter's hitbox on a given frame and position.
function hitboxWorld(a, hb, frame, x, y) {
  const s = a.stats.scale;
  const [hx, hy] = hitboxPos(hb, frame);
  return [x + hx * s * a.facing, y + hy * s];
}

// One match: simulation + its scene. Create a new Game per match.
export class Game {
  constructor({ renderer, players, stocks, onEnd, stage }) {
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

    const where = stageById(stage);
    this.stage = where.create();
    this.stageView = where.build(this.stage, this.scene);
    // Stages with faraway scenery (SUNY Canton) ask for a longer view.
    if (this.stageView.camera) {
      Object.assign(this.camera, this.stageView.camera);
      this.camera.updateProjectionMatrix();
    }
    this.effects = new Effects(this.scene);

    this.fighters = players.map((p, i) => new Fighter({
      slot: p.slot,
      character: p.character,
      controller: p.controller,
      spawn: this.stage.spawns[i],
      stocks,
      look: p.look,
    }));
    this.views = this.fighters.map((f) => new FighterView(f, this.scene, SLOT_COLORS[f.slot]));
    this.projectiles = [];
    this.projectileGeo = new THREE.SphereGeometry(1, 16, 12);
    this.hud = new Hud(this.fighters);
    this.showHitboxes = false;
  }

  // ---- Simulation ----

  step() {
    this.frame++;
    if (this.endTimer > 0 && --this.endTimer === 0) return this.finish();

    for (const f of this.fighters) {
      const input = f.controller.poll(f, this);
      f.step(input, this);
    }
    this.pushApart();
    this.resolveHits();
    this.stepProjectiles();
  }

  // Bodies are solid: overlapping fighters get pushed apart, so you can't walk
  // through someone (you shove them along instead) and they stay in front of
  // you to hit. Dodges, launched fighters and grabs pass through. Nobody gets
  // shoved off the edge of what they're standing on.
  pushApart() {
    const solid = (f) => !f.dead && !f.ledge && !f.heldBy && !f.holding && !f.move?.def.intangible
      && !(f.hitstun > 0 && !f.grounded);
    const fs = this.fighters;
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i];
        const b = fs[j];
        if (!solid(a) || !solid(b)) continue;
        const overlapY = Math.min(a.y + a.hurtH, b.y + b.hurtH) - Math.max(a.y, b.y);
        if (overlapY < 0.45) continue;
        const dx = b.x - a.x;
        const overlap = a.hw * 0.8 + b.hw * 0.8 - Math.abs(dx);
        if (overlap <= 0) continue;
        const dir = Math.sign(dx) || (a.slot < b.slot ? 1 : -1);
        const push = overlap * (a.grounded && b.grounded ? 0.5 : 0.25);
        this.shove(a, -dir * push);
        this.shove(b, dir * push);
      }
    }
  }

  shove(f, dx) {
    let x = f.x + dx;
    const p = f.grounded ? f.platform : null;
    if (p) x = Math.max(p.x1 + 0.1, Math.min(p.x2 - 0.1, x)); // don't push anyone off
    if (Math.sign(x - f.x) === Math.sign(dx)) f.x = x;
  }

  // A parry landed: flash, freeze, and say so.
  onParry(f, attacker) {
    const x = (f.x + attacker.x) / 2;
    const y = f.y + f.h * 0.6;
    this.effects.parry(x, y);
    this.effects.text(f.x, f.y + f.h + 0.5, 'PARRY!', '#7ef9ff', 0.55, 0.8);
    this.shake = Math.max(this.shake, 0.35);
    voice.say(f.character.id, 'parry', { chance: 0.7, cooldown: 2 });
  }

  // Hitboxes earlier in a move's list win when two of the same group overlap
  // someone, so list sweet spots first.
  resolveHits() {
    for (const a of this.fighters) {
      if (a.dead) continue;
      const g = a.move?.def.grab;
      if (g && a.move.frame >= g.start && a.move.frame <= g.end && a.hitlag === 0) this.tryGrab(a, g);
      const m = a.move;
      for (const hb of a.activeHitboxes()) {
        const [cx, cy] = hitboxWorld(a, hb, m.frame, a.x, a.y);
        const swept = m.frame - 1 >= hb.start;
        const [px, py] = swept ? hitboxWorld(a, hb, m.frame - 1, a.prevX, a.prevY) : [cx, cy];
        const r = hb.r * a.stats.scale;
        for (const v of this.fighters) {
          if (v === a || v.dead || v.intangible || a.move !== m || a.hasHit(v, hb)) continue;
          if (!sweepHitsBox(px, py, cx, cy, r, v)) continue;
          a.markHit(v, hb);
          const result = v.takeHit(a, hb, a.facing, this);
          this.effects.spark((cx + v.x) / 2, Math.min(cy, v.y + v.h * 0.6), 0xfff2a8, 0.35 + hb.dmg * 0.04);
          if (result === 'hit') m.def.onHit?.(a, v, this);
        }
      }
    }
  }

  // Grab boxes catch the first fighter they touch. Shields don't stop a grab;
  // dodges (intangibility) do, and nobody can be in two grabs at once.
  tryGrab(a, g) {
    const [cx, cy] = hitboxWorld(a, g, a.move.frame, a.x, a.y);
    const r = g.r * a.stats.scale;
    for (const v of this.fighters) {
      if (v === a || v.dead || v.intangible || v.heldBy || v.holding || v.ledge) continue;
      if (!circleHitsBox(cx, cy, r, v)) continue;
      a.catchFighter(v, this);
      return;
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
    } else if (def.look === 'bubble') {
      mesh = this.effects.makeBubble(def.text, def.color);
    } else if (def.look === 'puddle') {
      mesh = this.effects.makePuddle(def.color, def.r);
    } else if (def.look === 'prop') {
      // A thrown prop (e.g. Jacoby's magnifying glass or a snack). Spins in flight.
      mesh = new THREE.Group();
      const prop = createProp(def.prop);
      mesh.add(prop.object);
      mesh.userData.prop = prop;
      mesh.scale.setScalar(s);
    } else {
      mesh = new THREE.Mesh(this.projectileGeo, new THREE.MeshBasicMaterial({ color: owner.character.color }));
    }
    this.scene.add(mesh);
    if (def.pickup) owner.handEmpty[def.pickup] = true;
    const p = {
      owner,
      power: owner.power,
      x: owner.x + (def.x ?? 0.7) * s * owner.facing,
      y: owner.y + (def.y ?? 1.2) * s,
      vx: def.speed * owner.facing,
      vy: def.vy ?? 0,
      r: def.r * s,
      maxR: (def.maxR ?? def.r) * s,
      life: def.life,
      age: 0,
      hits: new Map(), // victim -> age of last hit, for multi-hit clouds
      spent: false, // a pickup that already hit something or touched the ground
      resting: false,
      hb: def,
      mesh,
    };
    p.baseY = p.y;
    this.projectiles.push(p);
    return p;
  }

  // The floor a falling point crosses this frame, if any.
  floorUnder(x, prevY, y) {
    const m = this.stage.main;
    if (x > m.x1 && x < m.x2 && prevY >= m.top - 0.01 && y < m.top) return m.top;
    for (const p of this.stage.platforms) {
      if (x >= p.x1 && x <= p.x2 && prevY >= p.y - 0.01 && y < p.y) return p.y;
    }
    return null;
  }

  // Pickups (def.pickup = the hand it came from) bounce off whoever they hit,
  // settle on the floor, and go back to the owner's hand when touched. If one
  // is lost off the stage, or left lying around, it pops back after a while.
  stepPickup(p) {
    const def = p.hb;
    const prevY = p.y;
    if (!p.resting) {
      p.vy -= (def.gravity ?? 20) / 60;
      p.y += p.vy / 60;
      const m = this.stage.main;
      const floor = p.vy <= 0 ? this.floorUnder(p.x, prevY, p.y) : null;
      if (floor !== null) {
        p.y = floor;
        p.spent = true;
        if (p.vy < -5) {
          p.vy *= -0.3;
          p.vx *= 0.5;
        } else {
          p.resting = true;
          p.vx = p.vy = 0;
          p.life = def.restLife ?? 600;
        }
      } else if (p.x > m.x1 && p.x < m.x2 && p.y < m.top && p.y > m.bottom) {
        // Hit the underside or a side wall of the stage: bounce off it.
        if (prevY <= m.bottom) {
          p.y = m.bottom - 0.01;
          p.vy = -Math.abs(p.vy) * 0.3;
        } else {
          p.x = p.vx > 0 ? m.x1 - 0.01 : m.x2 + 0.01;
          p.vx *= -0.3;
        }
        p.spent = true;
      }
    }
    const o = p.owner;
    if ((p.resting || p.spent) && !o.dead && circleHitsBox(p.x, p.y + 0.2, p.r + 0.25, o)) {
      o.regainProp(def.pickup, this);
      return false;
    }
    const b = this.stage.blast;
    if (p.y < b.bottom || p.x < b.left || p.x > b.right) {
      o.propReturn = { side: def.pickup, timer: def.returnFrames ?? 180 };
      return false;
    }
    if (p.life <= 0) {
      this.effects.puff(p.x, p.y + 0.2, 0.5, 0xffffff, 0.4);
      o.regainProp(def.pickup, this);
      return false;
    }
    return true;
  }

  // Thrown things that aren't picked back up (Jacoby's snacks): they arc down
  // and burst when they land, or roll along the floor if `roll` is set.
  stepThrown(p) {
    const def = p.hb;
    const prevY = p.y;
    p.vy -= def.gravity / 60;
    p.y += p.vy / 60;
    const floor = p.vy <= 0 ? this.floorUnder(p.x, prevY, p.y) : null;
    if (floor !== null) {
      p.y = floor;
      if (!def.roll) return false;
      p.vy = 0;
      p.rolling = true;
    }
    const m = this.stage.main;
    if (p.x > m.x1 && p.x < m.x2 && p.y < m.top - 0.05 && p.y > m.bottom) return false; // hit the stage's side
    const b = this.stage.blast;
    return p.life > 0 && p.y > b.bottom && p.x > b.left && p.x < b.right;
  }

  // Vehicles (Byron's Lamborghini once he bails, Eli's FBI van) drive along
  // whatever floor they're on and fall off edges (gravity 0: they just drive
  // straight). p.y is their feet; they hit with a circle `ride` m above that.
  stepVehicle(p) {
    const def = p.hb;
    if (def.gravity) {
      const prevY = p.y;
      p.vy -= def.gravity / 60;
      p.y += p.vy / 60;
      const floor = p.vy <= 0 ? this.floorUnder(p.x, prevY, p.y) : null;
      if (floor !== null) {
        p.y = floor;
        p.vy = 0;
      }
      const m = this.stage.main;
      if (p.x > m.x1 && p.x < m.x2 && p.y < m.top - 0.05 && p.y > m.bottom) return false; // hit the stage's side
    }
    const b = this.stage.blast;
    return p.life > 0 && p.y > b.bottom && p.x > b.left - 8 && p.x < b.right + 8;
  }

  removeProjectile(p) {
    p.hb.onEnd?.(p, this);
    if (p.hb.burst !== undefined) this.effects.debris(p.x, p.y + 0.15, p.hb.burst, { count: 7, size: 0.06, speed: 2.5, up: 3.5, life: 0.5 });
    this.disposeProjectile(p);
  }

  disposeProjectile(p) {
    p.mesh.removeFromParent();
    // Thrown props and vehicles are built fresh each time; clouds and bubbles share geometry/textures.
    const own = p.hb.look === 'prop';
    p.mesh.traverse((o) => {
      if (own && !o.userData.cached) o.geometry?.dispose(); // loaded models stay cached
      if (own && !o.userData.cached) o.material?.map?.dispose();
      o.material?.dispose();
    });
  }

  stepProjectiles() {
    const m = this.stage.main;
    // Hits can spawn new projectiles mid-loop (Byron knocked out of his Lambo
    // leaves the car rolling), so they go in a fresh list that's kept too.
    const current = this.projectiles;
    this.liveProjectiles = current; // everything flying this frame (Eli's GUCCI MORTY eats other shots)
    this.projectiles = [];
    const kept = current.filter((p) => {
      const def = p.hb;
      p.age++;
      p.life--;
      if (def.drag) p.vx *= 1 - def.drag;
      if (def.grow) p.r = Math.min(p.maxR, p.r + def.grow / 60);
      p.x += p.vx / 60;
      def.update?.(p, this); // custom motion (e.g. a bubble wobbling up and down)
      let alive = p.life > 0;
      if (def.pickup) alive = this.stepPickup(p);
      else if (def.drive) alive = this.stepVehicle(p);
      else if (def.gravity !== undefined) alive = this.stepThrown(p);
      else if (!def.pierce && p.x > m.x1 && p.x < m.x2 && p.y < m.top && p.y > m.bottom) alive = false;
      if (alive && !p.spent) {
        const hy = p.y + (def.ride ?? 0);
        for (const v of this.fighters) {
          if (v === p.owner || v.dead || v.intangible) continue;
          // Flat zones (a puddle) only catch people standing in them.
          const touching = def.flat
            ? Math.abs(v.x - p.x) < p.r + v.hw && v.y >= p.y - 0.1 && v.y < p.y + 0.35
            : circleHitsBox(p.x, hy, p.r, v);
          if (!touching) continue;
          if (def.pierce) {
            const last = p.hits.get(v);
            if (last !== undefined && p.age - last < (def.hitEvery ?? 30)) continue;
            p.hits.set(v, p.age);
          }
          const result = v.takeHit(p, def, Math.sign(p.vx) || Math.sign(v.x - p.x) || 1, this);
          if (result === 'parry') {
            // Parried: shots fly back and are the parrier's now; clouds,
            // cars and puddles just miss them; thrown pickups bonk off.
            if (!def.pierce && !def.pickup && !def.drive) {
              p.owner = v;
              p.power = v.power;
              p.vx = -(p.vx || 6) * 1.25;
              p.vy = Math.max(p.vy, 2);
              p.life = Math.max(p.life, 40);
              p.hits.clear();
              break;
            }
            if (!def.pickup) continue;
          }
          if (!def.noKnockback) this.effects.spark(v.x, v.y + v.h * 0.6, p.owner.character.color, 0.4);
          if (result !== 'counter' && result !== 'parry') def.onHit?.(p, v, this, result);
          if (def.pickup) {
            // Bonk: bounce back off them and fall to the floor.
            p.spent = true;
            p.vx *= -0.3;
            p.vy = Math.max(p.vy, 5);
            break;
          }
          if (!def.pierce) {
            alive = false;
            break;
          }
        }
      }
      if (!alive) this.removeProjectile(p);
      return alive;
    });
    this.projectiles = kept.concat(this.projectiles);
  }

  // An explosion (Byron's wrecked Lambo): hits everyone in range except
  // `owner`, launching them away from the middle. hb is a hitbox (dmg, base,
  // growth, angle) plus r.
  blast(owner, x, y, hb) {
    const source = { owner, power: owner.power, x, y };
    for (const v of this.fighters) {
      if (v === owner || v.dead || v.intangible) continue;
      if (!circleHitsBox(x, y + 0.6, hb.r, v)) continue;
      v.takeHit(source, hb, Math.sign(v.x - x) || 1, this);
      this.effects.spark(v.x, v.y + v.h * 0.6, 0xffb02e, 0.6);
    }
    this.shake = Math.max(this.shake, 0.9);
    this.flashScreen('#ffd27a');
  }

  // A quick full-screen flash over the game (explosions).
  flashScreen(color) {
    const el = document.createElement('div');
    el.className = 'screen-flash';
    el.style.background = color;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
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
    if (m && m.name !== 'uspecial' && m.name !== 'airdodge' && !m.def.ledgeGrab) return;
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
    if (kb > 20) voice.say(victim.character.id, 'hurt', { chance: 0.5 });
  }

  // Voicelines named after a move (voicelines/<character>/<move>.mp3) play when it starts.
  onMoveStart(f, name) {
    if (name === 'parry') return; // that line plays when a parry lands (onParry)
    voice.say(f.character.id, name, { chance: 0.6, cooldown: 2.5 });
  }

  onKO(f) {
    voice.say(f.character.id, 'ko', { interrupt: true });
    // A KO'd fighter respawns with their props back in hand.
    this.projectiles = this.projectiles.filter((p) => {
      if (p.owner !== f || !p.hb.pickup) return true;
      this.disposeProjectile(p);
      return false;
    });
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
      if (p.hb.look === 'prop' && p.hb.drive) {
        // Vehicles face the way they drive and spin their wheels.
        p.mesh.rotation.y = p.vx < 0 ? Math.PI : 0;
        p.mesh.userData.prop.roll?.(Math.abs(p.vx) * dt);
      } else if (p.hb.look === 'prop') {
        if (p.resting) {
          p.mesh.rotation.z = p.hb.restAngle ?? 0;
          p.mesh.position.y += (p.hb.restLift ?? 0) * p.owner.stats.scale;
        } else if (p.hb.aim) {
          // Darts fly point first (props point their business end down -y).
          p.mesh.rotation.z = Math.atan2(p.vy, p.vx) + Math.PI / 2;
        } else {
          p.mesh.rotation.z -= dt * (p.hb.spin ?? 12) * Math.sign(p.vx || 1);
        }
      } else if (p.hb.look === 'cloud') {
        // Fade in over the first few frames, out over the last 30.
        const alpha = Math.min(1, p.age / 6, p.life / 30);
        this.effects.updateCloud(p.mesh, p.r, alpha, this.time);
      } else if (p.hb.look === 'bubble') {
        this.effects.updateBubble(p.mesh, p.r, Math.min(1, p.age / 5), Math.min(1, p.life / 10));
      } else if (p.hb.look === 'puddle') {
        this.effects.updatePuddle(p.mesh, Math.min(1, p.age / 10, p.life / 30), this.time);
      } else {
        p.mesh.scale.setScalar(p.r);
      }
    }
    this.effects.update(dt);
    this.drawHitboxes();
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

  // Debug view: hurtboxes (yellow, blue while intangible) and active hitboxes (red).
  drawHitboxes() {
    if (!this.debugLayer) {
      if (!this.showHitboxes) return;
      this.debugLayer = new THREE.Group();
      this.debugLayer.renderOrder = 20;
      this.scene.add(this.debugLayer);
      this.debugGeo = { circle: new THREE.CircleGeometry(1, 28), box: new THREE.PlaneGeometry(1, 1) };
      this.debugPool = [];
    }
    this.debugLayer.visible = this.showHitboxes;
    if (!this.showHitboxes) return;
    let used = 0;
    const shape = (kind, color, x, y, sx, sy, opacity) => {
      let mesh = this.debugPool[used];
      if (!mesh) {
        mesh = new THREE.Mesh(this.debugGeo.circle, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
        mesh.renderOrder = 20;
        this.debugLayer.add(mesh);
        this.debugPool.push(mesh);
      }
      used++;
      mesh.visible = true;
      mesh.geometry = this.debugGeo[kind];
      mesh.material.color.setHex(color);
      mesh.material.opacity = opacity;
      mesh.position.set(x, y, 1.2);
      mesh.scale.set(sx, sy, 1);
    };
    for (const f of this.fighters) {
      if (f.dead) continue;
      shape('box', f.intangible ? 0x4aa8ff : 0xffe14a, f.x, f.y + f.hurtH / 2, f.hw * 2, f.hurtH, 0.25);
      for (const hb of f.activeHitboxes()) {
        const [x, y] = hitboxWorld(f, hb, f.move.frame, f.x, f.y);
        const r = hb.r * f.stats.scale;
        shape('circle', hb.prop ? 0xff8a1f : 0xff2a2a, x, y, r, r, 0.45);
      }
      const g = f.move?.def.grab;
      if (g && f.move.frame >= g.start && f.move.frame <= g.end) {
        const [x, y] = hitboxWorld(f, g, f.move.frame, f.x, f.y);
        const r = g.r * f.stats.scale;
        shape('circle', 0xb04aff, x, y, r, r, 0.45);
      }
    }
    for (const p of this.projectiles) {
      if (!p.spent) shape('circle', 0xff2a7a, p.x, p.y, p.r, p.r, 0.4);
    }
    for (let i = used; i < this.debugPool.length; i++) this.debugPool[i].visible = false;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.hud.dispose();
    this.scene.background?.dispose?.();
    this.scene.traverse((o) => {
      if (o.isSkinnedMesh) o.skeleton.dispose(); // each fighter's bone texture
      if (o.isLight) o.dispose(); // the shadow map
      // Loaded models share geometry and textures with the cache for the next match.
      if (!o.userData.cached) o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (!o.userData.cached) m.map?.dispose();
        m.dispose();
      }
    });
  }
}
