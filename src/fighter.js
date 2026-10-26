import { MOVES, DODGES, GRABS, pickAttack, pickSpecial, hitboxPos } from './moves.js';

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
const CROUCH_HEIGHT = 0.6; // hurtbox height while crouching (high attacks whiff)
const CROUCH_KB = 0.85; // crouch cancel: take less knockback while crouching
const GRAB_HOLD = 80; // frames before a grabbed fighter breaks free...
const GRAB_HOLD_PER = 1.0; // ...plus this many per percent of damage they have
const GRAB_CATCH = 8; // frames after catching someone before you can pummel or throw
const GRAB_MASH = 5; // frames each button mash knocks off the hold
const RELEASE_STUN = 14; // both stumble apart when a grab breaks
const PARRY_FREEZE = 12; // both freeze for a beat when a parry lands
const PARRY_STUN = 44; // ...then the attacker is stuck while the parrier is free: a free punish
const WAVEDASH_FRICTION = 34; // slide after air dodging into the ground (m/s², normal is 40)

const approach = (v, target, amount) =>
  v < target ? Math.min(v + amount, target) : Math.max(v - amount, target);

export class Fighter {
  constructor({ slot, character, controller, spawn, stocks, look = null }) {
    this.slot = slot;
    this.character = character;
    this.look = look; // cosmetics from the character select: { model, accessory }
    this.controller = controller;
    this.spawn = spawn;
    const s = character.stats;
    this.stats = s;
    this.moves = { ...MOVES, ...DODGES, ...GRABS, ...character.moves }; // characters can replace any move
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
    this.dropGrab();
    this.holding = null; // { victim, timer, frame } while holding someone in a grab
    this.heldBy = null; // the fighter holding us
    this.crouching = false;
    this.ledge = null; // { ledge, timer, action, frame } while hanging
    this.ledgeCooldown = 0;
    this.ledgeInvulnReady = true;
    this.airDodgeUsed = false;
    this.x = x;
    this.y = y;
    this.prevX = x;
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
    this.dizzy = 0; // frames of seeing stars (parried, shield broken)
    this.confused = 0; // frames with left and right swapped (Eli's brainrot)
    this.status = {}; // things other characters put on you (e.g. brainrot stacks)
    this.sliding = false; // wavedashing: less friction until the slide ends
    this.handEmpty = {}; // { right: true } after throwing the prop in that hand
    this.propReturn = null; // { side, timer }: a lost prop pops back into your hand
    this.powerBonus = 0; // e.g. +0.04 per snack Jacoby eats; lost on KO
    this.speedMul = 1; // run/air speed multiplier (e.g. Andrew's sugar rush)
    this.charState = {}; // scratch space for character-specific mechanics
  }

  // Damage multiplier for everything this fighter dishes out.
  get power() {
    return this.stats.power * (1 + this.powerBonus);
  }

  get eliminated() {
    return this.stocks <= 0 && this.dead;
  }

  // Hurtbox height: lower while crouching.
  get hurtH() {
    return this.crouching ? this.h * CROUCH_HEIGHT : this.h;
  }

  // Can't be hit: respawn/ledge invincibility, dodge frames, or climbing up.
  get intangible() {
    if (this.invuln > 0 || this.ledge?.action) return true;
    const range = this.move?.def.intangible;
    return !!range && this.move.frame >= range[0] && this.move.frame <= range[1];
  }

  get canAct() {
    return !this.move && !this.holding && this.hitstun === 0 && this.landingLag === 0 && this.jumpsquat === 0 && !this.helpless;
  }

  step(input, world) {
    if (this.dead) {
      if (this.stocks > 0 && --this.respawnTimer <= 0) this.respawn(world);
      return;
    }
    // Brainrotted: left is right and right is left.
    if (this.confused > 0) {
      if (this.hitlag === 0) this.confused--;
      input = { ...input, x: -input.x, xPressed: -input.xPressed };
    }
    if (this.hitlag > 0) {
      this.hitlag--;
      // Don't drop combo presses made during the hit freeze.
      if (input.attack && this.move?.def.combo) this.move.comboQueued = true;
      return;
    }
    if (this.invuln > 0) this.invuln--;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.dropTimer > 0) this.dropTimer--;
    if (this.slowTimer > 0) this.slowTimer--;
    if (this.dizzy > 0) this.dizzy--;
    if (this.ledgeCooldown > 0) this.ledgeCooldown--;
    if (this.propReturn && --this.propReturn.timer <= 0) this.regainProp(this.propReturn.side, world);
    this.character.update?.(this, world); // per-frame character mechanics (cooldowns, meters)
    this.prevX = this.x;
    this.prevY = this.y;
    this.crouching = false; // handleActions sets it again while down is held

    if (this.heldBy) return this.updateHeld(input);
    if (this.ledge) return this.updateLedge(input, world);
    // The grab runs out (sooner if they mash) unless a throw has already started.
    if (this.holding && !this.move?.def.throw && --this.holding.timer <= 0) this.releaseGrab();

    if (this.hitstun > 0) {
      this.hitstun--;
      this.shielding = false;
    } else if (this.landingLag > 0) {
      this.landingLag--;
    } else if (this.move) {
      this.updateMove(input, world);
    } else if (this.holding) {
      this.updateHold(input, world);
    } else if (this.jumpsquat > 0) {
      this.updateJumpsquat(input);
    } else if (!this.helpless) {
      this.handleActions(input, world);
    }

    if (!this.shielding) this.shieldHP = Math.min(SHIELD_MAX, this.shieldHP + 0.15);

    this.integrate(input);
    world.collide(this);
    if (this.holding && !this.grounded) this.releaseGrab(); // pushed off the floor mid-grab
    if (this.holding) this.placeHeld();
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
    // Parry (its own button, ground or air): time it right before a hit lands.
    if (input.parry) return this.startMove('parry', input, world);

    // Grab: the grab button, or attack while shielding (like Smash). Running
    // into it gives a dash grab. In the air the grab button air dodges.
    if (this.grounded && (input.grab || (input.attack && input.shield))) {
      return this.startMove(Math.abs(this.vx) > this.stats.runSpeed * 0.6 ? 'dashgrab' : 'grab', input, world);
    }

    // Dodges. Ground: shield + left/right rolls, shield + down spot dodges. Air: shield air dodges.
    if (this.grounded && input.shield) {
      const rollDir = input.xPressed || (input.shieldPressed && Math.abs(input.x) > 0.6 ? Math.sign(input.x) : 0);
      if (rollDir) return this.startMove('roll', { ...input, x: rollDir }, world);
      if (input.downPressed || (input.shieldPressed && input.y < -0.6)) return this.startMove('spotdodge', input, world);
    }
    if (!this.grounded && (input.shieldPressed || input.grab) && !this.airDodgeUsed) return this.startMove('airdodge', input, world);

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
    } else {
      // Hold down to crouch: shorter hurtbox, less knockback, no walking.
      this.crouching = this.grounded && input.y < -0.5;
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
      this.airDodgeUsed = false; // every jump gets its own air dodge
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
    let def = this.moves[name];
    // Some moves need something you might not have (e.g. a thrown magnifying glass):
    // `available(f)` says whether you can, `fallback` is what you do instead
    // (which can have a fallback of its own).
    while (def.available && !def.available(this)) {
      name = def.fallback;
      def = this.moves[name];
    }
    this.shielding = false;
    this.move = { name, def, frame: 0, hit: new Set() };
    def.onStart?.(this, input, world);
    world?.onMoveStart?.(this, name);
  }

  // Something else ended our move early (a hit, a grab): let it clean up
  // (e.g. Byron's Lamborghini keeps rolling without him).
  interruptMove(world) {
    const m = this.move;
    this.move = null;
    m?.def.onInterrupt?.(this, m, world);
  }

  // Can this move be used right now (rather than falling back to something else)?
  canUse(name) {
    const def = this.moves[name];
    return !!def && (!def.available || def.available(this));
  }

  updateMove(input, world) {
    const m = this.move;
    m.frame++;
    m.def.onFrame?.call(m.def, this, m.frame, input, world);
    if (this.move !== m) return; // onFrame can end the move (e.g. ground pound landing)
    if (m.def.projectileFrame === m.frame) world.spawnProjectile(this, m.def.projectile);
    if (m.def.pummel?.frame === m.frame) this.pummelHeld(world);
    if (m.def.throw?.frame === m.frame) this.throwHeld(world);
    // Jab combos: press attack again to roll into the next hit.
    const combo = m.def.combo;
    if (combo && input.attack) m.comboQueued = true;
    if (combo && m.comboQueued && m.frame >= combo.from) return this.startMove(combo.next, input, world);
    if (m.frame >= m.def.total) {
      this.move = null;
      if (m.def.helplessAfter && !this.grounded) this.helpless = true;
    }
  }

  activeHitboxes() {
    const m = this.move;
    if (!m || this.hitlag > 0) return [];
    return m.def.hitboxes.filter((hb) => m.frame >= hb.start && m.frame <= hb.end
      && !(hb.prop && this.handEmpty[hb.prop]) && (!hb.when || hb.when(this)));
  }

  // Each hitbox `group` (default 0) can hit a given opponent once per move,
  // so multi-hit moves give each hit its own group.
  // Long moves (a car driving around) can set `rehit`: frames until the same
  // group can hit that victim again.
  hasHit(victim, hb) {
    const m = this.move;
    const key = `${hb.group ?? 0}:${victim.slot}`;
    if (!hb.rehit) return m.hit.has(key);
    const at = m.hitAt?.get(key);
    return at !== undefined && m.frame - at < hb.rehit;
  }

  markHit(victim, hb) {
    const m = this.move;
    const key = `${hb.group ?? 0}:${victim.slot}`;
    m.hit.add(key);
    (m.hitAt ??= new Map()).set(key, m.frame);
  }

  heal(amount, world) {
    const healed = Math.min(this.percent, amount);
    this.percent -= healed;
    world.effects.text(this.x, this.y + this.h + 0.55, `-${Math.round(healed)}%`, '#7dff8a');
    return healed;
  }

  regainProp(side, world) {
    this.handEmpty[side] = false;
    this.propReturn = null;
    world?.effects.puff(this.x + 0.3 * this.facing, this.y + 1.1, 0.45, 0xffffff, 0.4);
  }

  integrate(input) {
    const s = this.stats;
    const dt = STEP;
    const stunned = this.hitstun > 0;
    // Scripted moves (lunges, recoveries, ground pound) set their own velocity.
    const scripted = !!this.move?.def.scripted;
    const slow = (this.slowTimer > 0 ? 0.55 : 1) * this.speedMul;

    if (this.grounded) {
      this.vy = 0;
      if (this.sliding && (Math.abs(this.vx) < 1 || this.move || this.hitstun)) this.sliding = false;
      if (this.canAct && !this.shielding && !this.crouching && !this.sliding) {
        this.vx = approach(this.vx, input.x * s.runSpeed * slow, 70 * dt);
      } else if (!scripted) {
        this.vx = approach(this.vx, 0, (this.sliding ? WAVEDASH_FRICTION : 40) * dt);
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
    if (m?.name === 'airdodge' && m.dir && m.frame <= 20 && Math.abs(m.dir[0]) > 0.2) {
      // Air dodge into the floor: wavedash. Keep the sideways speed and slide.
      this.move = null;
      this.vx = Math.sign(m.dir[0]) * Math.min(Math.max(Math.abs(this.vx), 8 + 4.5 * Math.abs(m.dir[0])), 13);
      this.sliding = true;
      this.landingLag = 6;
      world?.effects.dirt(this.x, this.y + 0.05, -Math.sign(this.vx));
    } else if (m?.def.onLand) {
      m.def.onLand(this, world);
    } else if (m && (m.def.aerial || m.name === 'uspecial')) {
      this.move = null;
      this.landingLag = m.def.landingLag ?? 4;
    }
  }

  // Returns 'parry', 'chip', 'counter', 'shield' or 'hit'.
  takeHit(attacker, hb, dir, world) {
    const power = attacker.power ?? 1;
    const source = attacker instanceof Fighter ? attacker : attacker.owner;

    // Parry: a hit landing in the window does nothing, and a fighter who threw
    // it is stuck seeing stars while we're free to act. Projectiles bounce back.
    const parry = this.move?.def.parry;
    if (parry && this.move.frame >= parry[0] && this.move.frame <= parry[1]) {
      this.move = null;
      this.hitlag = PARRY_FREEZE;
      this.invuln = Math.max(this.invuln, PARRY_FREEZE + 8);
      this.facing = Math.sign(source.x - this.x) || this.facing;
      if (attacker instanceof Fighter) {
        attacker.interruptMove(world);
        attacker.hitlag = PARRY_FREEZE;
        attacker.hitstun = Math.max(attacker.hitstun, PARRY_STUN);
        attacker.dizzy = PARRY_FREEZE + PARRY_STUN;
        attacker.kbx = -dir * 3;
        attacker.shielding = false;
      }
      world.onParry?.(this, source);
      return 'parry';
    }

    // Gas-style hits (e.g. a lingering cloud): chip damage that seeps through shields, no knockback.
    if (hb.noKnockback) {
      this.percent = Math.min(999, this.percent + hb.dmg * power);
      this.hitFlash = Math.max(this.hitFlash, 3);
      if (hb.slow) this.slowTimer = Math.max(this.slowTimer, hb.slow);
      this.lastHitBy = source;
      return 'chip';
    }

    // Counter stance (Byron's Krav Maga): the hit whiffs and he answers it.
    const counter = this.move?.def.counter;
    if (counter && this.move.frame >= counter.start && this.move.frame <= counter.end) {
      this.facing = Math.sign(source.x - this.x) || this.facing;
      this.hitlag = 10;
      if (attacker instanceof Fighter) attacker.hitlag = 10;
      this.startMove(counter.then, { x: 0, y: 0 }, world);
      return 'counter';
    }

    if (this.shielding) {
      this.shieldHP -= hb.dmg * 1.3;
      this.hitlag = attacker.hitlag = Math.floor(3 + hb.dmg * 0.3);
      this.vx = dir * (2 + hb.dmg * 0.3);
      if (this.shieldHP <= 0) {
        this.shielding = false;
        this.shieldHP = SHIELD_MAX * 0.6;
        this.hitstun = 160; // shield break: dizzy
        this.dizzy = 160;
        this.vy = 10;
        this.grounded = false;
        world.effects.shieldBreak(this);
      }
      return 'shield';
    }

    const dmg = hb.dmg * power;
    if (this.ledge) this.releaseLedge();
    // Getting hit breaks any grab you're in, from either side.
    if (this.holding) this.releaseGrab();
    if (this.heldBy) this.heldBy.releaseGrab();
    this.airDodgeUsed = false;
    this.ledgeInvulnReady = true;
    this.percent = Math.min(999, this.percent + dmg);
    const crouchCancel = this.crouching ? CROUCH_KB : 1;
    const kb = (hb.base + hb.growth * this.percent * 0.19 * (100 / this.weight)) * (0.9 + 0.1 * power) * crouchCancel;
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
    this.interruptMove(world);
    this.jumpsquat = 0;
    this.landingLag = 0;
    this.helpless = false;
    this.fastFalling = false;
    this.crouching = false;
    this.upSpecialUsed = false;
    this.hitstun = Math.floor(kb * 1.15);
    this.hitlag = Math.floor(3 + dmg * 0.35);
    if (attacker instanceof Fighter) attacker.hitlag = this.hitlag;
    this.hitFlash = 8;
    this.lastHitBy = source;
    this.facing = -dir || this.facing;
    world.onHit(this, kb);
    return 'hit';
  }

  // ---- Grabs ----
  // The grabber keeps `holding = { victim, timer, frame }`: timer counts down
  // to the victim breaking free (mashing speeds it up), frame counts up from
  // the catch. The victim gets `heldBy`. While holding: attack/grab pummels,
  // a direction throws (moves with `throw` and `carry`, see moves.js).

  catchFighter(v, world) {
    // A long-range grab (Byron's earbud lasso) reels them in first.
    const grab = this.move?.def.grab;
    const reel = grab?.reel ?? 0;
    this.move = null;
    this.holding = {
      victim: v, timer: Math.floor(GRAB_HOLD + reel + v.percent * GRAB_HOLD_PER), frame: 0,
      reel: reel && { left: reel, total: reel, x: (v.x - this.x) * this.facing, y: v.y - this.y },
    };
    v.heldBy = this;
    v.interruptMove(world);
    grab?.onCatch?.(this, v, world);
    v.shielding = false;
    v.crouching = false;
    v.jumpsquat = 0;
    v.landingLag = 0;
    v.hitstun = 0;
    v.helpless = false;
    v.fastFalling = false;
    v.vx = v.vy = v.kbx = v.kby = 0;
    v.grounded = this.grounded;
    v.platform = this.platform;
    this.placeHeld();
  }

  // Keep the victim in our hands: in front of us, or along the throw's `carry` path.
  placeHeld() {
    const H = this.holding;
    const v = H.victim;
    const s = this.stats.scale;
    const carry = this.move?.def.carry;
    let [ox, oy] = carry ? hitboxPos({ path: carry }, this.move.frame) : [(this.hw + v.hw) / s + 0.12, 0.05];
    ox *= s;
    oy *= s;
    if (H.reel?.left > 0) {
      // Being reeled in: slide from where they were caught into our hands.
      const t = 1 - --H.reel.left / H.reel.total;
      const e = t * t * (3 - 2 * t);
      ox = H.reel.x + (ox - H.reel.x) * e;
      oy = H.reel.y + (oy - H.reel.y) * e;
    }
    v.x = v.prevX = this.x + ox * this.facing;
    v.y = v.prevY = this.y + oy;
    v.facing = -this.facing;
  }

  updateHold(input, world) {
    const H = this.holding;
    if (input.attack || input.grab) H.pummel = true; // remembered through the catch
    if (++H.frame < GRAB_CATCH + (H.reel?.total ?? 0)) return;
    const fwd = input.x * this.facing;
    let name = null;
    if (input.y > 0.5) name = 'uthrow';
    else if (input.y < -0.5) name = 'dthrow';
    else if (fwd > 0.5) name = 'fthrow';
    else if (fwd < -0.5) name = 'bthrow';
    else if (H.pummel) name = 'pummel';
    H.pummel = false;
    if (name) this.startMove(name, input, world);
  }

  // Held: struggle. Every button press (or a tap left/right/down) shortens the hold.
  updateHeld(input) {
    const H = this.heldBy.holding;
    const mash = input.attack || input.special || input.jump || input.grab || input.shieldPressed || input.xPressed || input.downPressed;
    if (mash && !this.heldBy.move?.def.throw) H.timer -= GRAB_MASH;
    this.vx = this.vy = this.kbx = this.kby = 0;
  }

  // Hurt whoever we're holding without letting go (pummels, burning them with a magnifying glass...).
  pummelHeld(world, dmg = this.move.def.pummel.dmg) {
    const v = this.holding?.victim;
    if (!v) return;
    dmg *= this.power;
    v.percent = Math.min(999, v.percent + dmg);
    v.hitFlash = 5;
    v.lastHitBy = this;
    this.hitlag = v.hitlag = 4;
    world.effects.spark((this.x + v.x) / 2, v.y + v.h * 0.7, 0xfff2a8, 0.3);
  }

  throwHeld(world) {
    const v = this.holding?.victim;
    if (!v) return;
    this.placeHeld();
    this.holding = null;
    v.heldBy = null;
    v.takeHit(this, this.move.def.throw, this.facing, world);
    world.effects.spark(v.x, v.y + v.h * 0.5, 0xffffff, 0.6);
  }

  // The grab breaks without a throw (escaped, or someone got hit): both stumble apart.
  releaseGrab() {
    const v = this.holding?.victim;
    this.holding = null;
    if (!v) return;
    v.heldBy = null;
    v.kbx = 6 * this.facing;
    v.hitstun = Math.max(v.hitstun, RELEASE_STUN);
    this.kbx = -4 * this.facing;
    this.hitstun = Math.max(this.hitstun, RELEASE_STUN);
    this.move = null;
  }

  // Forget any grab without the stumble (respawning).
  dropGrab() {
    if (this.holding) this.holding.victim.heldBy = null;
    if (this.heldBy) this.heldBy.holding = null;
    this.holding = null;
    this.heldBy = null;
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
    this.dropGrab();
    this.dead = true;
    this.stocks--;
    this.falls++;
    if (this.stocks <= 0) this.outAt = world.frame;
    this.respawnTimer = RESPAWN_FRAMES;
    if (this.lastHitBy && this.lastHitBy !== this) this.lastHitBy.koCount++;
    world.onKO(this);
  }
}
