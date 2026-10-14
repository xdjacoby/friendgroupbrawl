// Turns keyboards, gamepads and the CPU into one per-frame input shape:
//   { x, y, jump, jumpHeld, attack, special, specialHeld, grab, parry, shield,
//     shieldPressed, downPressed, xPressed, pause }
// x/y are -1..1 with +y = up. jump/attack/special/grab/parry/shieldPressed/downPressed/pause
// are "pressed this frame" edges; xPressed is -1/1 on the frame left/right is
// pressed (else 0); jumpHeld/specialHeld/shield are held states.

const KEYMAPS = {
  kb1: {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    jump: ['KeyW', 'Space'], attack: ['KeyF'], special: ['KeyG'], shield: ['KeyH'], grab: ['KeyJ'], parry: ['KeyK'],
  },
  kb2: {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: ['ArrowUp'], attack: ['Comma', 'Numpad1'], special: ['Period', 'Numpad2'], shield: ['Slash', 'Numpad3'],
    grab: ['KeyM', 'Numpad0'], parry: ['KeyN', 'NumpadDecimal'],
  },
};

export const CONTROL_HELP = {
  kb1: 'Move WASD · Crouch S · Jump W/Space · Attack F · Special G · Shield/Dodge H · Grab J · Parry K',
  kb2: 'Move Arrows · Crouch ↓ · Jump ↑ · Attack , · Special . · Shield/Dodge / · Grab M · Parry N',
  gamepad: 'Stick/D-pad move · A/Y jump · X attack · B special · Triggers shield/dodge · LB grab · RB parry',
};

const held = new Set();
const pressedLatch = new Set();
const mappedCodes = new Set(Object.values(KEYMAPS).flatMap((m) => Object.values(m).flat()));

window.addEventListener('keydown', (e) => {
  if (mappedCodes.has(e.code) && !(e.target instanceof HTMLSelectElement)) e.preventDefault();
  if (!held.has(e.code)) pressedLatch.add(e.code);
  held.add(e.code);
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

// Escape pauses for everyone, so it is read globally rather than per player.
export function consumeKey(code) {
  const had = pressedLatch.has(code);
  pressedLatch.delete(code);
  return had;
}

// Call once at the end of each simulation step so taps shorter than a step
// still register exactly once.
export function endInputFrame() {
  pressedLatch.clear();
}

const blank = () => ({
  x: 0, y: 0, jump: false, jumpHeld: false, attack: false, special: false, specialHeld: false,
  grab: false, parry: false, shield: false, shieldPressed: false, downPressed: false, xPressed: 0, pause: false,
});

class KeyboardController {
  constructor(mapName) {
    this.map = KEYMAPS[mapName];
  }

  poll() {
    const m = this.map;
    const isHeld = (k) => m[k].some((c) => held.has(c));
    const wasPressed = (k) => m[k].some((c) => pressedLatch.has(c));
    const out = blank();
    out.x = (isHeld('right') ? 1 : 0) - (isHeld('left') ? 1 : 0);
    out.y = (isHeld('up') ? 1 : 0) - (isHeld('down') ? 1 : 0);
    out.jump = wasPressed('jump');
    out.jumpHeld = isHeld('jump');
    out.attack = wasPressed('attack');
    out.special = wasPressed('special');
    out.specialHeld = isHeld('special');
    out.grab = wasPressed('grab');
    out.parry = wasPressed('parry');
    out.shield = isHeld('shield');
    out.shieldPressed = wasPressed('shield');
    out.downPressed = wasPressed('down');
    out.xPressed = (wasPressed('right') ? 1 : 0) - (wasPressed('left') ? 1 : 0);
    return out;
  }
}

const DEADZONE = 0.3;

class GamepadController {
  constructor(index) {
    this.index = index;
    this.prev = {};
  }

  poll() {
    const out = blank();
    const pad = navigator.getGamepads?.()[this.index];
    if (!pad) return out;
    const btn = (i) => !!pad.buttons[i]?.pressed;
    let x = pad.axes[0] ?? 0;
    let y = -(pad.axes[1] ?? 0);
    if (Math.abs(x) < DEADZONE) x = 0;
    if (Math.abs(y) < DEADZONE) y = 0;
    if (btn(14)) x = -1;
    if (btn(15)) x = 1;
    if (btn(12)) y = 1;
    if (btn(13)) y = -1;

    const now = {
      jump: btn(0) || btn(3),
      attack: btn(2),
      special: btn(1),
      // Smash layout: triggers shield, left bumper grabs; right bumper parries.
      shield: btn(6) || btn(7),
      grab: btn(4),
      parry: btn(5),
      down: y < -0.7,
      left: x < -0.7,
      right: x > 0.7,
      pause: btn(9),
    };
    const edge = (k) => now[k] && !this.prev[k];
    out.x = x;
    out.y = y;
    out.jump = edge('jump');
    out.jumpHeld = now.jump;
    out.attack = edge('attack');
    out.special = edge('special');
    out.specialHeld = now.special;
    out.grab = edge('grab');
    out.parry = edge('parry');
    out.shield = now.shield;
    out.shieldPressed = edge('shield');
    out.downPressed = edge('down');
    out.xPressed = (edge('right') ? 1 : 0) - (edge('left') ? 1 : 0);
    out.pause = edge('pause');
    this.prev = now;
    return out;
  }
}

// A simple CPU so you can test without a second person.
class CpuController {
  constructor() {
    this.cooldown = 30;
    this.jumpCooldown = 0;
    this.shieldFor = 0;
    this.crouchFor = 0;
    this.ledgeWait = 0;
    this.holdSpecial = 0;
    this.holdPlan = null;
  }

  poll(me, world) {
    const out = this.decide(me, world);
    // Specials that charge while held (Draven's Hotbox) get held for a random while.
    if (out.special) this.holdSpecial = Math.floor(Math.random() * 130);
    out.specialHeld = out.special || this.holdSpecial-- > 0;
    return out;
  }

  decide(me, world) {
    const out = blank();
    if (!me || me.dead) return out;
    if (this.cooldown > 0) this.cooldown--;
    if (this.jumpCooldown > 0) this.jumpCooldown--;

    const stage = world.stage.main;

    // Grabbed: mash to break free.
    if (me.heldBy) {
      if (Math.random() < 0.15) out.attack = true;
      else if (Math.random() < 0.2) out.xPressed = out.x = Math.random() < 0.5 ? -1 : 1;
      return out;
    }
    // Holding someone: a pummel or two, then a throw. Back throw when the
    // ledge is behind us and they're high enough to die, else toward the
    // nearest edge; up/down throws to start juggles at low percent.
    if (me.holding) {
      if (me.move) return out;
      if (!this.holdPlan) this.holdPlan = { wait: 10 + Math.floor(Math.random() * 25), pummels: Math.floor(Math.random() * 3) };
      const plan = this.holdPlan;
      if (--plan.wait > 0) return out;
      if (plan.pummels > 0) {
        plan.pummels--;
        plan.wait = 4;
        out.attack = true;
        return out;
      }
      const v = me.holding.victim;
      const behindIsEdge = me.facing > 0 ? me.x - stage.x1 < stage.x2 - me.x : stage.x2 - me.x < me.x - stage.x1;
      const r = Math.random();
      if (v.percent < 60 && r < 0.6) out.y = r < 0.3 ? 1 : -1;
      else out.x = behindIsEdge ? -me.facing : me.facing;
      this.holdPlan = null;
      return out;
    }
    this.holdPlan = null;

    // Hanging on a ledge: wait a moment, then pick a getup option.
    if (me.ledge) {
      if (me.ledge.action) return out;
      if (!this.ledgeWait) this.ledgeWait = 10 + Math.floor(Math.random() * 50);
      if (me.ledge.timer < this.ledgeWait) return out;
      this.ledgeWait = 0;
      const toward = -me.ledge.ledge.dir;
      const r = Math.random();
      if (r < 0.35) out.x = toward;
      else if (r < 0.55) { out.jump = true; out.jumpHeld = true; }
      else if (r < 0.75) out.attack = true;
      else out.shieldPressed = true;
      return out;
    }

    const offstage = me.x < stage.x1 - 0.1 || me.x > stage.x2 + 0.1 || me.y < stage.top - 0.3;

    if (offstage) {
      out.x = Math.sign(-me.x) || 1;
      const falling = me.vy + me.kby < 0;
      if (falling && me.jumpsLeft > 0 && this.jumpCooldown === 0) {
        out.jump = true;
        out.jumpHeld = true;
        this.jumpCooldown = 20;
      } else if (falling && me.jumpsLeft === 0 && !me.upSpecialUsed && me.y < stage.top + 1.5) {
        out.y = 1;
        out.special = true;
      }
      return out;
    }

    const target = world.fighters
      .filter((f) => f !== me && !f.dead && f.stocks > 0)
      .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    if (!target) return out;

    const dx = target.x - me.x;
    const dy = target.y - me.y;
    const dist = Math.hypot(dx, dy);
    const targetOffstage = target.x < stage.x1 || target.x > stage.x2;

    // Go fetch a thrown prop (Jacoby's magnifying glass) when nobody is in our face.
    const dropped = world.projectiles.find((p) => p.owner === me && p.resting);
    if (dropped && dist > 2.5) {
      out.x = Math.abs(dropped.x - me.x) > 0.2 ? Math.sign(dropped.x - me.x) : 0;
      if (dropped.y > me.y + 1.2 && me.grounded && this.jumpCooldown === 0) {
        out.jump = out.jumpHeld = true;
        this.jumpCooldown = 40;
      } else if (dropped.y < me.y - 1 && me.grounded && me.platform?.passThrough) {
        out.y = -1;
        out.downPressed = true;
      }
      return out;
    }

    // Character-specific habits (e.g. Jacoby digging, eating and throwing snacks).
    const habit = this.cooldown === 0 && me.canAct ? me.character.cpu?.(me, { target, dist, dx, dy }) : null;
    if (habit) {
      if (habit.face) me.facing = Math.sign(dx) || me.facing;
      this.cooldown = 40;
      return { ...out, ...habit };
    }

    if (Math.abs(dx) > 1.4) {
      out.x = Math.sign(dx);
      // Don't chase off the edge.
      if (targetOffstage && me.grounded && (me.x < stage.x1 + 1 || me.x > stage.x2 - 1)) out.x = 0;
    }

    if (dy > 1.8 && me.grounded && this.jumpCooldown === 0 && Math.random() < 0.08) {
      out.jump = true;
      out.jumpHeld = Math.random() < 0.6;
      this.jumpCooldown = 40;
    } else if (dy < -1.5 && me.grounded && me.platform?.passThrough && Math.random() < 0.05) {
      out.y = -1;
      out.downPressed = true; // drop through toward a target below
      return out;
    }

    // React to an attack starting right next to us: parry it (timed to its
    // first hitbox), shield, roll away, spot dodge, or duck under it if it's aimed high.
    if (this.parryIn > 0 && --this.parryIn === 0) return { ...out, parry: true };
    if (dist < 2.4 && target.move && target.move.frame <= 1 && !target.move.def.intangible && Math.random() < 0.22) {
      const first = Math.min(...target.move.def.hitboxes.map((hb) => hb.start), 99);
      if (first < 40) {
        this.parryIn = Math.max(1, first - 3 - Math.floor(Math.random() * 4));
        return out;
      }
    }
    if (dist < 2 && target.move && target.move.frame <= 1 && !target.move.def.intangible && me.grounded) {
      const r = Math.random();
      const high = target.move.def.hitboxes.length > 0 && target.move.def.hitboxes.every((hb) => (hb.y ?? 0) - hb.r > 1.0);
      if (high && r < 0.35) this.crouchFor = 18;
      else if (r < 0.3) this.shieldFor = 20;
      else if (r < 0.42) {
        out.shield = out.shieldPressed = true;
        out.x = -Math.sign(dx) || 1;
        return out;
      } else if (r < 0.52) {
        out.shield = out.shieldPressed = true;
        out.y = -1;
        return out;
      }
    }
    if (this.shieldFor > 0) {
      this.shieldFor--;
      out.shield = true;
      out.x = 0;
      return out;
    }
    if (this.crouchFor > 0) {
      this.crouchFor--;
      out.y = -1;
      return out;
    }

    // Grab people who sit in their shield (and sometimes anyone up close).
    if (dist < 1.7 && me.grounded && target.grounded && this.cooldown === 0 && (target.shielding || Math.random() < 0.12)) {
      me.facing = Math.sign(dx) || me.facing;
      out.grab = true;
      this.cooldown = 30;
      return out;
    }

    if (dist < 2.2 && this.cooldown === 0) {
      const roll = Math.random();
      if (dy > 1.2) out.y = 1;
      else if (dy < -1.2 && !me.grounded) out.y = -1;
      else if (roll < 0.25) out.x = 0; // jab / nair
      else out.x = Math.sign(dx);
      if (roll > 0.9 && me.grounded) {
        out.x = Math.sign(dx);
        out.special = true; // side special lunge
      } else if (roll > 0.85 && !me.grounded && dy < -0.5) {
        out.y = -1;
        out.special = true; // ground pound
      } else {
        out.attack = true;
      }
      this.cooldown = 18 + Math.floor(Math.random() * 25);
    } else if (dist > 4.5 && Math.abs(dy) < 1.5 && this.cooldown === 0 && me.canUse('nspecial') && Math.random() < 0.02) {
      out.x = 0;
      out.special = true; // fire a projectile from range
      me.facing = Math.sign(dx) || me.facing;
      this.cooldown = 40;
    }
    return out;
  }
}

export function createController(kind) {
  if (kind === 'kb1' || kind === 'kb2') return new KeyboardController(kind);
  if (kind.startsWith('pad')) return new GamepadController(Number(kind.slice(3)));
  if (kind === 'cpu') return new CpuController();
  return null;
}
