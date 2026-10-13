import { MOVES, DODGES, pickAttack, pickSpecial } from './moves.js';

export const STEP = 1 / 60;
const KB_DECAY = 25; // knockback speed lost per second
const JUMPSQUAT = 3;
const SHIELD_MAX = 50;
const RESPAWN_FRAMES = 90;
const RESPAWN_INVULN = 120;
const MIDAIR_JUMPS = 1;
const LEDGE_CATCH = 8; // frames hanging before you can act
const LEDGE_MAX = 300; // let go automatically after 5 seconds
const LEDGE_INVULN = 45; // invincibility on grab (once per trip offstage)
const LEDGE_COOLDOWN = 30; // frames before you can regrab after letting go
const CLIMB_FRAMES = 12;

const approach = (v, target, amount) =>
  v < target ? Math.min(v + amount, target) : Math.max(v - amount, target);

export class Fighter {
  constructor({ slot, character, controller, spawn, stocks }) {
    this.slot = slot;
    this.character = character;
    this.controller = controller;
    this.spawn = spawn;
    const s = character.stats;
    this.stats = s;
    this.moves = { ...MOVES, ...DODGES, ...character.moves }; // characters can replace any move
    this.weight = s.weight;
    this.hw = 0.38 * s.scale;
    this.h = 1.8 * s.scale;
    this.stocks = stocks;
    this.koCount = 0;
    this.falls = 0;
    this.reset(spawn.x, spawn.y);
    this.facing = spawn.x <= 0 ? 1 : -1;
    this.invuln = 0;
  }

  reset(x, y) {
    if (this.ledge) this.ledge.ledge.holder = null;
    this.ledge = null; // { ledge, timer, action, frame } while hanging
    this.ledgeCooldown = 0;
    this.ledgeInvulnReady = true;
    this.airDodgeUsed = false;
    this.x = x;
    this.y = y;
    this.prevY = y;
    this.vx = 0;
    this.vy = 0;
    this.kbx = 0;
    this.kby = 0;
    this.percent = 0;
    this.grounded = false;
    this.platform = null;
    this.jumpsLeft = MIDAIR_JUMPS;
    this.move = null;
    this.hitstun = 0;
    this.hitlag = 0;
    this.landingLag = 0;
    this.jumpsquat = 0;
    this.shortHop = false;
    this.shielding = false;
    this.shieldHP = SHIELD_MAX;
    this.helpless = false;
    this.fastFalling = false;
    this.dropTimer = 0;
    this.upSpecialUsed = false;
    this.sideSpecialUsed = false;
    this.dead = false;
    this.respawnTimer = 0;
    this.lastHitBy = null;
    this.hitFlash = 0;
    this.slowTimer = 0;
  }

  get eliminated() {
    return this.stocks <= 0 && this.dead;
  }

  // Can't be hit: respawn/ledge invincibility, dodge frames, or climbing up.
  get intangible() {
    if (this.invuln > 0 || this.ledge?.action) return true;
    const range = this.move?.def.intangible;
    return !!range && this.move.frame >= range[0] && this.move.frame <= range[1];
  }

  get canAct() {
    return !this.move && this.hitstun === 0 && this.landingLag === 0 && this.jumpsquat === 0 && !this.helpless;
  }

  step(input, world) {
    if (this.dead) {
      if (this.stocks > 0 && --this.respawnTimer <= 0) this.respawn(world);
      return;
    }
    if (this.hitlag > 0) {
      this.hitlag--;
      return;
    }
    if (this.invuln > 0) this.invuln--;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.dropTimer > 0) this.dropTimer--;
    if (this.slowTimer > 0) this.slowTimer--;
    if (this.ledgeCooldown > 0) this.ledgeCooldown--;
    this.prevY = this.y;

    if (this.ledge) return this.updateLedge(input, world);

    if (this.hitstun > 0) {
      this.hitstun--;
      this.shielding = false;
    } else if (this.landingLag > 0) {
      this.landingLag--;
    } else if (this.move) {
      this.updateMove(input, world);
    } else if (this.jumpsquat > 0) {
      this.updateJumpsquat(input);
    } else if (!this.helpless) {
      this.handleActions(input, world);
    }

    if (!this.shielding) this.shieldHP = Math.min(SHIELD_MAX, this.shieldHP + 0.15);

    this.integrate(input);
    world.collide(this);
    world.tryLedgeGrab(this);
    world.checkBlastZone(this);
  }

  respawn(world) {
    const stocks = this.stocks;
    this.reset(0, world.stage.respawnY);
    this.stocks = stocks;
    this.invuln = RESPAWN_INVULN;
  }

  handleActions(input, world) {
    // Dodges. Ground: shield + left/right rolls, shield + down spot dodges. Air: shield air dodges.
    if (this.grounded && input.shield) {
      const rollDir = input.xPressed || (input.shieldPressed && Math.abs(input.x) > 0.6 ? Math.sign(input.x) : 0);
      if (rollDir) return this.startMove('roll', { ...input, x: rollDir }, world);
      if (input.downPressed || (input.shieldPressed && input.y < -0.6)) return this.startMove('spotdodge', input, world);
    }
    if (!this.grounded && input.shieldPressed && !this.airDodgeUsed) return this.startMove('airdodge', input, world);

    this.shielding = this.grounded && input.shield && this.shieldHP > 0;
    if (this.shielding) {
      this.shieldHP -= 0.28;
      if (input.jump) this.startJump(input);
      return;
    }

    if (this.grounded && Math.abs(input.x) > 0.2) this.facing = Math.sign(input.x);

    if (input.attack) return this.startMove(pickAttack(this, input), input, world);
    if (input.special) {
      const name = pickSpecial(this, input);
      if (name === 'uspecial' && this.upSpecialUsed) return;
      if (name === 'sspecial' && this.sideSpecialUsed) return;
      if (name === 'uspecial') this.upSpecialUsed = true;
      if (name === 'sspecial') {
        this.sideSpecialUsed = !this.grounded;
        this.facing = Math.sign(input.x) || this.facing;
      }
      return this.startMove(name, input, world);
    }
    if (input.jump) return this.startJump(input);

    if (this.grounded && this.platform?.passThrough && input.downPressed) {
      this.grounded = false;
      this.platform = null;
      this.dropTimer = 12;
      this.y -= 0.05;
    }
  }

  startJump(input) {
    this.shielding = false;
    if (this.grounded) {
      this.jumpsquat = JUMPSQUAT;
      this.shortHop = false;
    } else if (this.jumpsLeft > 0) {
      this.jumpsLeft--;
      this.vy = this.stats.jump * 0.9;
      this.vx = input.x * this.stats.airSpeed;
      this.kbx = this.kby = 0;
      this.fastFalling = false;
      if (Math.abs(input.x) > 0.2) this.facing = Math.sign(input.x);
    }
  }

  updateJumpsquat(input) {
    if (!input.jumpHeld) this.shortHop = true;
    // Up-attack out of jumpsquat, so W+F on keyboard does an up-tilt.
    if (input.attack && input.y > 0.5) {
      this.jumpsquat = 0;
      return this.startMove('utilt', input);
    }
    if (--this.jumpsquat === 0) {
      this.vy = this.stats.jump * (this.shortHop ? 0.62 : 1);
      this.grounded = false;
      this.platform = null;
    }
  }

  startMove(name, input, world) {
    const def = this.moves[name];
    this.shielding = false;
    this.move = { name, def, frame: 0, hit: new Set() };
    def.onStart?.(this, input, world);
  }

  updateMove(input, world) {
    const m = this.move;
    m.frame++;
    m.def.onFrame?.call(m.def, this, m.frame, input, world);
    if (this.move !== m) return; // onFrame can end the move (e.g. ground pound landing)
    if (m.def.projectileFrame === m.frame) world.spawnProjectile(this, m.def.projectile);
    if (m.frame >= m.def.total) {
      this.move = null;
      if (m.def.helplessAfter && !this.grounded) this.helpless = true;
    }
  }

  activeHitboxes() {
    const m = this.move;
    if (!m || this.hitlag > 0) return [];
    return m.def.hitboxes.filter((hb) => m.frame >= hb.start && m.frame <= hb.end);
  }

  integrate(input) {
    const s = this.stats;
    const dt = STEP;
    const stunned = this.hitstun > 0;
    // Scripted moves (lunges, recoveries, ground pound) set their own velocity.
    const scripted = !!this.move?.def.scripted;
    const slow = this.slowTimer > 0 ? 0.55 : 1;

    if (this.grounded) {
      this.vy = 0;
      if (this.canAct && !this.shielding) {
        this.vx = approach(this.vx, input.x * s.runSpeed * slow, 70 * dt);
      } else if (!scripted) {
        this.vx = approach(this.vx, 0, 40 * dt);
      }
    } else {
      if (!stunned && !scripted) {
        if (Math.abs(input.x) > 0.1) this.vx = approach(this.vx, input.x * s.airSpeed * slow, 30 * dt);
        else this.vx = approach(this.vx, 0, 4 * dt);
      }
      if (!stunned && input.downPressed && this.vy <= 0 && !scripted) this.fastFalling = true;
      // Scripted moves (e.g. the ground pound) are allowed past terminal velocity.
      const maxFall = scripted ? Infinity : this.fastFalling ? s.maxFall * 1.6 : s.maxFall;
      this.vy = Math.max(this.vy - s.gravity * dt, -maxFall);
    }

    this.x += (this.vx + this.kbx) * dt;
    this.y += (this.vy + this.kby) * dt;

    const kb = Math.hypot(this.kbx, this.kby);
    if (kb > 0) {
      const next = Math.max(0, kb - KB_DECAY * dt);
      this.kbx *= next / kb;
      this.kby *= next / kb;
    }
  }

  land(platform, world) {
    this.grounded = true;
    this.platform = platform;
    this.vy = 0;
    this.kby = 0;
    this.jumpsLeft = MIDAIR_JUMPS;
    this.upSpecialUsed = false;
    this.sideSpecialUsed = false;
    this.airDodgeUsed = false;
    this.ledgeInvulnReady = true;
    this.fastFalling = false;
    if (this.helpless) {
      this.helpless = false;
      this.landingLag = 10;
    }
    const m = this.move;
    if (m?.def.onLand) {
      m.def.onLand(this, world);
    } else if (m && (m.def.aerial || m.name === 'uspecial')) {
      this.move = null;
      this.landingLag = m.def.landingLag ?? 4;
    }
  }

  takeHit(attacker, hb, dir, world) {
    const power = attacker.stats?.power ?? 1;
    const source = attacker instanceof Fighter ? attacker : attacker.owner;

    // Gas-style hits (e.g. a lingering cloud): chip damage that seeps through shields, no knockback.
    if (hb.noKnockback) {
      this.percent = Math.min(999, this.percent + hb.dmg * power);
      this.hitFlash = Math.max(this.hitFlash, 3);
      if (hb.slow) this.slowTimer = Math.max(this.slowTimer, hb.slow);
      this.lastHitBy = source;
      return;
    }

    if (this.shielding) {
      this.shieldHP -= hb.dmg * 1.3;
      this.hitlag = attacker.hitlag = Math.floor(3 + hb.dmg * 0.3);
      this.vx = dir * (2 + hb.dmg * 0.3);
      if (this.shieldHP <= 0) {
        this.shielding = false;
        this.shieldHP = SHIELD_MAX * 0.6;
        this.hitstun = 160; // shield break: dizzy
        this.vy = 10;
        this.grounded = false;
        world.effects.shieldBreak(this);
      }
      return;
    }

    const dmg = hb.dmg * power;
    if (this.ledge) this.releaseLedge();
    this.airDodgeUsed = false;
    this.ledgeInvulnReady = true;
    this.percent = Math.min(999, this.percent + dmg);
    const kb = (hb.base + hb.growth * this.percent * 0.19 * (100 / this.weight)) * (0.9 + 0.1 * power);
    const rad = (hb.angle * Math.PI) / 180;
    this.kbx = Math.cos(rad) * kb * dir;
    this.kby = Math.sin(rad) * kb;
    if (this.grounded && this.kby < 0) this.kby = -this.kby * 0.4; // spiked on the ground: pop up
    if (this.kby > 0.5) {
      this.grounded = false;
      this.platform = null;
    }
    this.vx = 0;
    this.vy = 0;
    this.move = null;
    this.jumpsquat = 0;
    this.landingLag = 0;
    this.helpless = false;
    this.fastFalling = false;
    this.upSpecialUsed = false;
    this.hitstun = Math.floor(kb * 1.15);
    this.hitlag = Math.floor(3 + dmg * 0.35);
    if (attacker instanceof Fighter) attacker.hitlag = this.hitlag;
    this.hitFlash = 8;
    this.lastHitBy = source;
    this.facing = -dir || this.facing;
    world.onHit(this, kb);
  }

  // ---- Ledge ----
  // A ledge is { x, y, dir, platform, holder }; dir is -1 for the left edge, +1 for the right.

  grabLedge(ledge) {
    this.ledge = { ledge, timer: 0, action: null, frame: 0 };
    ledge.holder = this;
    this.move = null;
    this.helpless = false;
    this.fastFalling = false;
    this.shielding = false;
    this.jumpsquat = 0;
    this.landingLag = 0;
    this.jumpsLeft = MIDAIR_JUMPS;
    this.upSpecialUsed = false;
    this.sideSpecialUsed = false;
    this.airDodgeUsed = false;
    if (this.ledgeInvulnReady) {
      this.invuln = Math.max(this.invuln, LEDGE_INVULN);
      this.ledgeInvulnReady = false;
    }
  }

  releaseLedge(cooldown = LEDGE_COOLDOWN) {
    if (this.ledge) this.ledge.ledge.holder = null;
    this.ledge = null;
    this.ledgeCooldown = cooldown;
    this.grounded = false;
    this.platform = null;
  }

  // Hanging options: up/toward stage = climb, jump = ledge jump, attack/special =
  // getup attack, shield = roll onto the stage, down/away = let go.
  updateLedge(input, world) {
    const L = this.ledge;
    const lg = L.ledge;
    const s = this.stats.scale;
    const toward = -lg.dir;
    const hangX = lg.x + lg.dir * 0.34 * s;
    const hangY = lg.y - 1.85 * s;
    this.facing = toward;
    this.vx = this.vy = this.kbx = this.kby = 0;
    L.timer++;

    if (!L.action) {
      this.x = hangX;
      this.y = hangY;
      if (L.timer < LEDGE_CATCH) return;
      if (L.timer > LEDGE_MAX) return this.releaseLedge();
      if (input.jump) {
        this.releaseLedge();
        this.vy = this.stats.jump * 1.05;
        this.vx = toward * 2;
        return;
      }
      if (input.attack || input.special) L.action = 'attack';
      else if (input.shieldPressed) L.action = 'roll';
      else if (input.y > 0.5 || input.x * toward > 0.5) L.action = 'climb';
      else if (input.y < -0.5 || input.x * toward < -0.5) this.releaseLedge();
      return;
    }

    // Climbing up: rise first, then step over the edge.
    L.frame++;
    const t = Math.min(1, L.frame / CLIMB_FRAMES);
    const e = t * t * (3 - 2 * t);
    const topX = lg.x + toward * (this.hw + 0.15);
    this.x = hangX + (topX - hangX) * e;
    this.y = hangY + (lg.y - hangY) * Math.min(1, e * 1.4);
    if (t < 1) return;

    const action = L.action;
    this.releaseLedge(0);
    this.x = topX;
    this.y = this.prevY = lg.y;
    this.grounded = true;
    this.platform = lg.platform;
    this.ledgeInvulnReady = true; // back on stage counts as landing
    if (action === 'roll') this.startMove('roll', { ...input, x: toward }, world);
    if (action === 'attack') this.startMove('ledgeattack', input, world);
  }

  die(world) {
    this.dead = true;
    this.stocks--;
    this.falls++;
    if (this.stocks <= 0) this.outAt = world.frame;
    this.respawnTimer = RESPAWN_FRAMES;
    if (this.lastHitBy && this.lastHitBy !== this) this.lastHitBy.koCount++;
    world.onKO(this);
  }
}
