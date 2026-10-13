import { MOVES, pickAttack, pickSpecial } from './moves.js';

export const STEP = 1 / 60;
const KB_DECAY = 25; // knockback speed lost per second
const JUMPSQUAT = 3;
const SHIELD_MAX = 50;
const RESPAWN_FRAMES = 90;
const RESPAWN_INVULN = 120;
const MIDAIR_JUMPS = 1;

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
    this.moves = { ...MOVES, ...character.moves }; // characters can replace any move
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
    this.prevY = this.y;

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
    world.checkBlastZone(this);
  }

  respawn(world) {
    const stocks = this.stocks;
    this.reset(0, world.stage.respawnY);
    this.stocks = stocks;
    this.invuln = RESPAWN_INVULN;
  }

  handleActions(input, world) {
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
