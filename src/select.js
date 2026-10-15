import { ROSTER, SLOT_COLORS } from './roster.js';
import { createController } from './input.js';
import { outfitsFor, ACCESSORIES } from './cosmetics.js';
import { portrait } from './portraits.js';
import { voice } from './voice.js';

// The character select, Smash style: a row of portraits (plus Random) and a
// card per player underneath showing who they've got.
//   Mouse: you're picking for the player whose coin follows the pointer
//   (P1 to start with). Hover a portrait to see them on that player's card,
//   click to pick. Click another player's card or coin to pick for them.
//   Keyboard / gamepad players: each has their own cursor. Left/right to
//   move it, attack (or A) to pick. Enter or Start begins the fight.
// slot.char is a ROSTER index, or RANDOM (picked when the match starts).

export const RANDOM = -1;

export const CONTROL_OPTIONS = [
  ['off', 'Off'],
  ['kb1', 'Keyboard (WASD)'],
  ['kb2', 'Keyboard (Arrows)'],
  ['pad0', 'Gamepad 1'],
  ['pad1', 'Gamepad 2'],
  ['pad2', 'Gamepad 3'],
  ['pad3', 'Gamepad 4'],
  ['cpu', 'CPU'],
];
const PICK_KEY = { kb1: 'F', kb2: 'comma' };

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const isHuman = (s) => s.control !== 'off' && s.control !== 'cpu';
const tileCount = ROSTER.length + 1; // + Random
const tileChar = (t) => (t >= ROSTER.length ? RANDOM : t);
const charTile = (c) => (c === RANDOM || !ROSTER[c] ? ROSTER.length : c);

export function createSelect({ slots, renderer, onChange, onStart }) {
  const rosterEl = document.getElementById('roster');
  const slotsEl = document.getElementById('slots');
  const hand = document.getElementById('hand-token');

  // Who the mouse is picking for, the portrait it's over, and each
  // keyboard/gamepad player's cursor.
  let mouseSlot = Math.max(0, slots.findIndex(isHuman));
  let hover = null;
  const cursors = slots.map((s) => ({ tile: charTile(s.char), dir: 0, next: 0, moved: false }));
  const controllers = slots.map(() => null);
  const controlOf = slots.map(() => null);

  // ---- Pictures ----
  const pictures = new Map();
  const lookOf = (slot, c) => ({
    model: outfitsFor(ROSTER[c])[slot.outfit]?.model,
    accessory: ACCESSORIES[slot.extra]?.id ?? null,
  });
  // The picture right now if it's drawn; otherwise start drawing it and redraw the screen when it's in.
  function picture(c, look, kind) {
    const key = `${c}|${look.model ?? ''}|${look.accessory ?? ''}|${kind}`;
    if (!pictures.has(key)) {
      pictures.set(key, null);
      portrait(renderer, ROSTER[c], look, kind).then((url) => {
        pictures.set(key, url);
        if (url) render();
      });
    }
    return pictures.get(key);
  }

  // ---- Roster ----
  rosterEl.innerHTML = '';
  const tiles = [];
  for (let t = 0; t < tileCount; t++) {
    const c = tileChar(t);
    const ch = ROSTER[c];
    const tile = document.createElement('button');
    tile.className = `tile ${ch ? '' : 'random'}`;
    tile.style.setProperty('--char', ch ? hex(ch.color) : '#8a8fa8');
    tile.innerHTML = `
      <div class="tile-art">${ch ? `<span class="tile-initial">${ch.name[0]}</span><img alt="">` : '<span class="tile-initial">?</span>'}</div>
      <div class="tile-name"></div>
      <div class="tile-tokens"></div>
      <div class="tile-cursors"></div>`;
    tile.querySelector('.tile-name').textContent = ch ? ch.name : 'Random';
    tile.addEventListener('pointerenter', () => { hover = t; render(); });
    tile.addEventListener('pointerleave', () => { if (hover === t) hover = null; render(); });
    tile.addEventListener('click', (e) => {
      const coin = e.target.closest('.token');
      if (coin) {
        // Clicking someone's coin picks it up: now picking for them.
        mouseSlot = Number(coin.dataset.slot);
        render();
        return;
      }
      pick(mouseSlot, t);
    });
    rosterEl.appendChild(tile);
    tiles.push(tile);
  }

  // The mouse's coin follows the pointer over the portraits.
  rosterEl.addEventListener('pointermove', (e) => {
    hand.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 12}px)`;
  });
  rosterEl.addEventListener('pointerenter', () => hand.classList.remove('hidden'));
  rosterEl.addEventListener('pointerleave', () => hand.classList.add('hidden'));

  function pick(i, t) {
    const slot = slots[i];
    if (!slot) return;
    const c = tileChar(t);
    if (slot.char !== c) slot.outfit = 0;
    slot.char = c;
    cursors[i].tile = t;
    cursors[i].moved = false;
    if (slot.control === 'off') slot.control = i === 0 ? 'kb1' : 'cpu';
    render();
    const card = slotsEl.children[i];
    card?.classList.remove('picked');
    void card?.offsetWidth; // restart the pop animation
    card?.classList.add('picked');
    const ch = ROSTER[c];
    if (ch) voice.say(ch.id, 'select', { interrupt: true });
    // Picked for a CPU: the mouse goes back to picking for the (first) person.
    if (i === mouseSlot && slot.control === 'cpu' && slots.some(isHuman)) {
      mouseSlot = slots.findIndex(isHuman);
      render();
    }
  }

  // ---- Player cards ----
  function card(slot, i) {
    const el = document.createElement('div');
    const off = slot.control === 'off';
    // Who to show: what the mouse is over (if it's picking for this player),
    // or where their cursor is, else their pick.
    let shown = charTile(slot.char);
    let previewing = false;
    if (!off && i === mouseSlot && hover !== null) shown = hover;
    else if (!off && isHuman(slot) && cursors[i].moved && cursors[i].tile !== shown) shown = cursors[i].tile;
    previewing = shown !== charTile(slot.char);
    const c = tileChar(shown);
    const ch = ROSTER[c];
    el.className = `slot ${off ? 'off' : ''} ${i === mouseSlot ? 'mouse' : ''} ${previewing ? 'preview' : ''}`;
    el.style.setProperty('--slot', SLOT_COLORS[i]);
    el.style.setProperty('--char', ch ? hex(ch.color) : '#8a8fa8');
    const outfits = ch ? outfitsFor(ch) : [];
    slot.outfit = Math.max(0, Math.min(slot.outfit ?? 0, outfits.length - 1));
    slot.extra = Math.max(0, Math.min(slot.extra ?? 0, ACCESSORIES.length - 1));
    el.innerHTML = `
      <div class="slot-top">
        <span class="slot-tag">P${i + 1}</span>
        <select class="slot-control" aria-label="P${i + 1} controls">${CONTROL_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      </div>
      <div class="slot-art">${off ? '<span class="slot-join">+</span>' : ch ? '<img alt="">' : '<span class="slot-random">?</span>'}</div>
      <div class="slot-name"></div>
      <div class="slot-hint"></div>
      <div class="slot-look outfit" title="${ch ? `Outfits: any public/models/${ch.id}*.glb file` : ''}">
        <button class="prev" aria-label="Previous outfit">‹</button><span></span><button class="next" aria-label="Next outfit">›</button>
      </div>
      <div class="slot-look extra">
        <button class="prev" aria-label="Previous extra">‹</button><span></span><button class="next" aria-label="Next extra">›</button>
      </div>`;
    el.querySelector('.slot-name').textContent = off ? 'Off' : ch ? ch.name : 'Random';
    let hint = '';
    if (off) hint = 'Click to add a CPU';
    else if (previewing) hint = i === mouseSlot && hover !== null ? 'Click to pick' : `Press ${PICK_KEY[slot.control] ?? 'A'} to pick`;
    else if (i === mouseSlot) hint = '🖱 Picking with the mouse';
    else if (ch) hint = ch.tagline;
    else hint = 'Someone different every match';
    el.querySelector('.slot-hint').textContent = hint;
    if (!off && ch) {
      const url = picture(c, lookOf(slot, c), 'body');
      const img = el.querySelector('.slot-art img');
      if (url) img.src = url;
      else img.classList.add('loading');
    }
    const select = el.querySelector('select');
    select.value = slot.control;
    select.onchange = () => {
      slot.control = select.value;
      select.blur(); // so arrow keys move the cursor again instead of changing this
      cursors[i].moved = false;
      render();
    };
    // Clicking a card makes it the one the mouse picks for (an empty one joins as a CPU).
    el.addEventListener('click', (e) => {
      if (e.target.closest('select, button')) return;
      if (slot.control === 'off') slot.control = 'cpu';
      mouseSlot = i;
      render();
    });
    const looks = [
      ['.outfit', 'outfit', outfits, (o) => `👕 ${o.name}`],
      ['.extra', 'extra', ACCESSORIES, (a) => `🧢 ${a.name}`],
    ];
    for (const [sel, key, list, label] of looks) {
      const row = el.querySelector(sel);
      if (off || !list.length) {
        row.classList.add('gone');
        continue;
      }
      row.querySelector('span').textContent = label(list[slot[key]]);
      row.classList.toggle('single', list.length < 2 || previewing);
      const step = (d) => {
        slot[key] = (slot[key] + d + list.length) % list.length;
        render();
      };
      row.querySelector('.prev').onclick = () => step(-1);
      row.querySelector('.next').onclick = () => step(1);
    }
    return el;
  }

  function render() {
    slots.forEach((s, i) => { if (s.control === 'off' && mouseSlot === i && slots.some((x) => x.control !== 'off')) mouseSlot = slots.findIndex((x) => x.control !== 'off'); });
    // Faces on the portraits, coins where each player's pick is, cursors.
    tiles.forEach((tile, t) => {
      const c = tileChar(t);
      if (ROSTER[c]) {
        const url = picture(c, { model: ROSTER[c].model, accessory: null }, 'face');
        const img = tile.querySelector('img');
        if (url && img.getAttribute('src') !== url) img.src = url;
        tile.classList.toggle('ready', !!url);
      }
      const coins = slots
        .map((s, i) => (s.control !== 'off' && charTile(s.char) === t ? `<span class="token" data-slot="${i}" style="--slot:${SLOT_COLORS[i]}" title="P${i + 1}: click to pick for them">P${i + 1}</span>` : ''))
        .join('');
      tile.querySelector('.tile-tokens').innerHTML = coins;
      const marks = slots
        .map((s, i) => (isHuman(s) && cursors[i].moved && cursors[i].tile === t ? `<span style="--slot:${SLOT_COLORS[i]}">P${i + 1}</span>` : ''))
        .join('');
      tile.querySelector('.tile-cursors').innerHTML = marks;
      tile.classList.toggle('cursor', !!marks);
      tile.classList.toggle('hover', hover === t);
      tile.style.setProperty('--hover', SLOT_COLORS[mouseSlot]);
    });
    hand.textContent = `P${mouseSlot + 1}`;
    hand.style.setProperty('--slot', SLOT_COLORS[mouseSlot]);
    slotsEl.innerHTML = '';
    slots.forEach((s, i) => slotsEl.appendChild(card(s, i)));
    onChange();
  }

  // ---- Keyboard / gamepad cursors (called every frame while the menu is up) ----
  function poll() {
    let changed = false;
    slots.forEach((slot, i) => {
      if (!isHuman(slot)) return;
      if (controlOf[i] !== slot.control) {
        controllers[i] = createController(slot.control);
        controlOf[i] = slot.control;
      }
      const input = controllers[i]?.poll();
      if (!input) return;
      const cur = cursors[i];
      const dir = input.x > 0.5 ? 1 : input.x < -0.5 ? -1 : 0;
      const now = performance.now();
      // Step once on a press, then keep stepping while it's held.
      if (dir && (dir !== cur.dir || now >= cur.next)) {
        cur.tile = cur.moved ? (cur.tile + dir + tileCount) % tileCount : (charTile(slot.char) + dir + tileCount) % tileCount;
        cur.moved = true;
        cur.next = now + (dir !== cur.dir ? 320 : 130);
        changed = true;
      }
      cur.dir = dir;
      if (input.attack || (slot.control.startsWith('pad') && input.jump)) {
        pick(i, cur.moved ? cur.tile : charTile(slot.char));
        cur.moved = false;
        changed = false;
      }
      if (input.pause) onStart();
    });
    if (changed) render();
  }

  render();
  return { render, poll };
}

// The character a slot plays this match (Random rolls one).
export function resolveChar(slot) {
  return slot.char === RANDOM || !ROSTER[slot.char] ? Math.floor(Math.random() * ROSTER.length) : slot.char;
}
