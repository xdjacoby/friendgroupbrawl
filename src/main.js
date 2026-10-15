import { fontsReady } from './fonts.js';
import * as THREE from 'three';
import { Game } from './game.js';
import { STEP } from './fighter.js';
import { ROSTER, SLOT_COLORS } from './roster.js';
import { createController, consumeKey, endInputFrame, CONTROL_HELP } from './input.js';
import { VictoryScene } from './victory.js';
import { voice } from './voice.js';
import { outfitsFor, ACCESSORIES } from './cosmetics.js';
import { STAGES } from './stages.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// ---- Graphics quality ----
// Auto starts at up to 1.5x resolution on sharp screens and steps it down
// (to 0.6x at worst) whenever the frame rate dips below ~50, back up when
// there's room. High always renders at full sharpness; Fast renders at a
// lower resolution with no shadows.
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const QUALITY = {
  auto: { max: 1.5, min: 0.6, shadows: true },
  high: { max: 2, min: 2, shadows: true },
  fast: { max: 0.8, min: 0.8, shadows: false },
};
let quality = QUALITY[store.get('brawl.quality', 'auto')] ? store.get('brawl.quality', 'auto') : 'auto';
let pixelRatio = 1;

function applyQuality() {
  const q = QUALITY[quality];
  pixelRatio = Math.min(window.devicePixelRatio, q.max);
  if (quality === 'fast') pixelRatio = q.max;
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = q.shadows;
  resize();
}

// Frame-time watcher for Auto: averages a second of frames, then nudges the resolution.
const perf = { frames: 0, time: 0, calm: 0, fps: 0 };
function trackFrame(dt) {
  perf.frames++;
  perf.time += dt;
  if (perf.time < 1) return;
  perf.fps = perf.frames / perf.time;
  perf.frames = perf.time = 0;
  $('fps').textContent = `${Math.round(perf.fps)} fps · ${pixelRatio.toFixed(2)}x`;
  const q = QUALITY[quality];
  if (quality !== 'auto' || paused || !game || game.ended) return;
  const top = Math.min(window.devicePixelRatio, q.max);
  if (perf.fps < 50 && pixelRatio > q.min) {
    pixelRatio = Math.max(q.min, pixelRatio - 0.15);
    perf.calm = 0;
  } else if (perf.fps > 58 && pixelRatio < top && ++perf.calm >= 4) {
    pixelRatio = Math.min(top, pixelRatio + 0.1);
    perf.calm = 0;
  } else {
    return;
  }
  renderer.setPixelRatio(pixelRatio);
  resize();
}

const $ = (id) => document.getElementById(id);
const screens = { menu: $('menu'), pause: $('pause'), results: $('results') };
$('quality').value = quality;
$('quality').onchange = () => {
  quality = $('quality').value;
  store.set('brawl.quality', quality);
  applyQuality();
};
$('voices').checked = voice.enabled;
$('voices').onchange = () => { voice.enabled = $('voices').checked; };
$('show-fps').checked = store.get('brawl.fps', 'off') === 'on';
const updateFps = () => {
  $('fps').classList.toggle('hidden', !$('show-fps').checked);
  store.set('brawl.fps', $('show-fps').checked ? 'on' : 'off');
};
$('show-fps').onchange = updateFps;
const show = (name) => {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
};

// ---- Menu / character select ----

const CONTROL_OPTIONS = [
  ['off', 'Off'],
  ['kb1', 'Keyboard (WASD)'],
  ['kb2', 'Keyboard (Arrows)'],
  ['pad0', 'Gamepad 1'],
  ['pad1', 'Gamepad 2'],
  ['pad2', 'Gamepad 3'],
  ['pad3', 'Gamepad 4'],
  ['cpu', 'CPU'],
];

// Each player's pick: who's playing it, the character, and their cosmetics
// (outfit and extra, as list positions). Remembered between visits.
const slots = [
  { control: 'kb1', char: 0, outfit: 0, extra: 0 },
  { control: 'cpu', char: 1, outfit: 0, extra: 0 },
  { control: 'off', char: 2, outfit: 0, extra: 0 },
  { control: 'off', char: 3, outfit: 0, extra: 0 },
];
try {
  const saved = JSON.parse(store.get('brawl.slots', 'null'));
  if (Array.isArray(saved)) saved.slice(0, 4).forEach((s, i) => Object.assign(slots[i], s));
} catch { /* bad save: keep the defaults */ }
for (const s of slots) {
  if (!ROSTER[s.char]) s.char = 0;
  if (!CONTROL_OPTIONS.some(([v]) => v === s.control)) s.control = 'off';
}
const saveSlots = () => store.set('brawl.slots', JSON.stringify(slots));

// ---- Stage select ----
let stageIndex = Math.max(0, STAGES.findIndex((s) => s.id === store.get('brawl.stage', STAGES[0].id)));
function renderStage() {
  const s = STAGES[stageIndex];
  $('stage-name').textContent = s.name;
  $('stage-thumb').style.background = s.thumb ?? '#333';
  store.set('brawl.stage', s.id);
}
const stepStage = (d) => {
  stageIndex = (stageIndex + d + STAGES.length) % STAGES.length;
  renderStage();
};
$('stage-prev').onclick = () => stepStage(-1);
$('stage-next').onclick = () => stepStage(1);
$('stage-thumb').onclick = () => stepStage(1);

function renderSlots() {
  const wrap = $('slots');
  wrap.innerHTML = '';
  slots.forEach((slot, i) => {
    const c = ROSTER[slot.char];
    const card = document.createElement('div');
    card.className = `slot ${slot.control === 'off' ? 'off' : ''}`;
    card.style.setProperty('--slot', SLOT_COLORS[i]);
    card.style.setProperty('--char', `#${c.color.toString(16).padStart(6, '0')}`);
    card.innerHTML = `
      <div class="slot-head">P${i + 1}</div>
      <select class="slot-control">${CONTROL_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <div class="slot-char">
        <button class="prev" aria-label="Previous character">◀</button>
        <div class="swatch"></div>
        <button class="next" aria-label="Next character">▶</button>
      </div>
      <div class="slot-name"></div>
      <div class="slot-tagline"></div>
      <div class="slot-look outfit" title="Outfits: any public/models/${c.id}*.glb file">
        <button class="prev" aria-label="Previous outfit">‹</button><span></span><button class="next" aria-label="Next outfit">›</button>
      </div>
      <div class="slot-look extra">
        <button class="prev" aria-label="Previous extra">‹</button><span></span><button class="next" aria-label="Next extra">›</button>
      </div>`;
    card.querySelector('.slot-name').textContent = c.name;
    card.querySelector('.slot-tagline').textContent = c.tagline;
    const select = card.querySelector('select');
    select.value = slot.control;
    select.onchange = () => { slot.control = select.value; renderSlots(); };
    const cycle = (d) => {
      slot.char = (slot.char + d + ROSTER.length) % ROSTER.length;
      slot.outfit = 0;
      renderSlots();
      voice.say(ROSTER[slot.char].id, 'select', { interrupt: true });
    };
    card.querySelector('.slot-char .prev').onclick = () => cycle(-1);
    card.querySelector('.slot-char .next').onclick = () => cycle(1);
    // Cosmetics: outfit (other models of them) and an extra (hat, shades...).
    const outfits = outfitsFor(c);
    slot.outfit = Math.min(slot.outfit ?? 0, outfits.length - 1);
    slot.extra = Math.min(slot.extra ?? 0, ACCESSORIES.length - 1);
    const looks = [
      ['.outfit', 'outfit', outfits, (o) => `👕 ${o.name}`],
      ['.extra', 'extra', ACCESSORIES, (a) => `🧢 ${a.name}`],
    ];
    for (const [sel, key, list, label] of looks) {
      const row = card.querySelector(sel);
      row.querySelector('span').textContent = label(list[slot[key]]);
      row.classList.toggle('single', list.length < 2);
      const step = (d) => {
        slot[key] = (slot[key] + d + list.length) % list.length;
        renderSlots();
      };
      row.querySelector('.prev').onclick = () => step(-1);
      row.querySelector('.next').onclick = () => step(1);
    }
    wrap.appendChild(card);
  });
  saveSlots();
  updateHint();
}

function updateHint() {
  const active = slots.filter((s) => s.control !== 'off');
  const pads = [...(navigator.getGamepads?.() ?? [])].filter(Boolean).length;
  const dup = active.filter((s) => s.control !== 'cpu').map((s) => s.control);
  let msg = `${pads} gamepad${pads === 1 ? '' : 's'} detected (press a button on a pad if it's not showing).`;
  if (active.length < 2) msg = 'Turn on at least 2 players (add a CPU to practice solo).';
  else if (new Set(dup).size !== dup.length) msg = 'Two players are sharing the same controls.';
  $('menu-hint').textContent = msg;
  $('start').disabled = active.length < 2;
}

$('control-list').innerHTML = Object.entries({
  'Keyboard (WASD)': CONTROL_HELP.kb1,
  'Keyboard (Arrows)': CONTROL_HELP.kb2,
  Gamepad: CONTROL_HELP.gamepad,
}).map(([k, v]) => `<li><b>${k}:</b> ${v}</li>`).join('');

window.addEventListener('gamepadconnected', updateHint);
window.addEventListener('gamepaddisconnected', updateHint);

// ---- Match flow ----

let game = null;
let victory = null;
let paused = false;
let lastSetup = null;

function startMatch(setup = buildSetup()) {
  lastSetup = setup;
  game?.dispose();
  victory?.dispose();
  victory = null;
  voice.stopAll();
  renderer.shadowMap.enabled = QUALITY[quality].shadows;
  game = new Game({
    renderer,
    stage: setup.stage,
    stocks: setup.stocks,
    players: setup.players.map((p) => ({ ...p, controller: createController(p.control) })),
    onEnd: showResults,
  });
  game.showHitboxes = $('show-hitboxes').checked;
  resize();
  paused = false;
  show(null);
  const someone = game.fighters[Math.floor(Math.random() * game.fighters.length)];
  voice.say(someone.character.id, 'intro');
}

function buildSetup() {
  return {
    stage: STAGES[stageIndex].id,
    stocks: Number($('stocks').value),
    players: slots
      .map((s, i) => ({
        slot: i, control: s.control, character: ROSTER[s.char],
        look: { model: outfitsFor(ROSTER[s.char])[s.outfit]?.model, accessory: ACCESSORIES[s.extra]?.id ?? null },
      }))
      .filter((p) => p.control !== 'off'),
  };
}

function showResults(ranked) {
  const winner = ranked[0];
  $('winner').textContent = `${winner.character.name} wins!`;
  $('winner').style.color = SLOT_COLORS[winner.slot];
  $('standings').innerHTML = '<tr><th></th><th>Player</th><th>KOs</th><th>Falls</th></tr>' +
    ranked.map((f, i) => `<tr><td>${i + 1}</td><td style="color:${SLOT_COLORS[f.slot]}">P${f.slot + 1} · ${f.character.name}</td><td>${f.koCount}</td><td>${f.falls}</td></tr>`).join('');
  game.ended = true;
  game.hud.el.remove();
  // The match stays around (for Rematch) but the victory scene takes over the screen.
  victory = new VictoryScene({ renderer, ranked });
  $('quote').textContent = victory.quote ? `"${victory.quote}"` : '';
  resize();
  show('results');
  voice.say(winner.character.id, 'victory', { interrupt: true });
}

function toMenu() {
  game?.dispose();
  victory?.dispose();
  game = null;
  victory = null;
  voice.stopAll();
  renderSlots();
  show('menu');
}

function setPaused(p) {
  if (!game || game.ended) return;
  paused = p;
  show(p ? 'pause' : null);
}

// Canvas text (bubbles, pop-ups) is drawn once and reused: make sure the fonts are in first.
$('start').onclick = () => fontsReady.then(() => startMatch());
$('rematch').onclick = () => startMatch(lastSetup);
$('to-menu').onclick = toMenu;
$('resume').onclick = () => setPaused(false);
$('quit').onclick = toMenu;

// ---- Loop ----

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  game?.resize(w, h);
  victory?.resize(w, h);
}
window.addEventListener('resize', resize);

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  trackFrame(dt);

  if (victory) {
    victory.render(dt);
    endInputFrame();
  } else if (game) {
    const padPause = [...(navigator.getGamepads?.() ?? [])].some((p) => p?.buttons[9]?.pressed);
    if (consumeKey('Escape') || (padPause && !frame.padPauseHeld)) setPaused(!paused);
    frame.padPauseHeld = padPause;
    if (consumeKey('Backquote')) game.showHitboxes = $('show-hitboxes').checked = !game.showHitboxes;

    if (!paused && !game.ended) {
      acc += dt;
      while (acc >= STEP && !game.ended) {
        game.step();
        endInputFrame();
        acc -= STEP;
      }
    } else {
      acc = 0;
      endInputFrame();
    }
    if (game) game.render(paused ? 0 : dt);
  } else {
    endInputFrame();
  }
  requestAnimationFrame(frame);
}

renderSlots();
renderStage();
show('menu');
applyQuality();
updateFps();
requestAnimationFrame(frame);

// Handy for tweaking from the browser console.
window.brawl = { get game() { return game; }, get victory() { return victory; }, ROSTER, showResults, slots, startMatch, buildSetup };
