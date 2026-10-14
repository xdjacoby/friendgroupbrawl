import * as THREE from 'three';
import { Game } from './game.js';
import { STEP } from './fighter.js';
import { ROSTER, SLOT_COLORS } from './roster.js';
import { createController, consumeKey, endInputFrame, CONTROL_HELP } from './input.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const $ = (id) => document.getElementById(id);
const screens = { menu: $('menu'), pause: $('pause'), results: $('results') };
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

const slots = [
  { control: 'kb1', char: 0 },
  { control: 'cpu', char: 1 },
  { control: 'off', char: 2 },
  { control: 'off', char: 3 },
];

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
      <div class="slot-tagline"></div>`;
    card.querySelector('.slot-name').textContent = c.name;
    card.querySelector('.slot-tagline').textContent = c.tagline;
    const select = card.querySelector('select');
    select.value = slot.control;
    select.onchange = () => { slot.control = select.value; renderSlots(); };
    const cycle = (d) => { slot.char = (slot.char + d + ROSTER.length) % ROSTER.length; renderSlots(); };
    card.querySelector('.prev').onclick = () => cycle(-1);
    card.querySelector('.next').onclick = () => cycle(1);
    wrap.appendChild(card);
  });
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
let paused = false;
let lastSetup = null;

function startMatch(setup = buildSetup()) {
  lastSetup = setup;
  game?.dispose();
  game = new Game({
    renderer,
    stocks: setup.stocks,
    players: setup.players.map((p) => ({ ...p, controller: createController(p.control) })),
    onEnd: showResults,
  });
  game.showHitboxes = $('show-hitboxes').checked;
  resize();
  paused = false;
  show(null);
}

function buildSetup() {
  return {
    stocks: Number($('stocks').value),
    players: slots
      .map((s, i) => ({ slot: i, control: s.control, character: ROSTER[s.char] }))
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
  show('results');
}

function toMenu() {
  game?.dispose();
  game = null;
  renderSlots();
  show('menu');
}

function setPaused(p) {
  if (!game || game.ended) return;
  paused = p;
  show(p ? 'pause' : null);
}

$('start').onclick = () => startMatch();
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
}
window.addEventListener('resize', resize);

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (game) {
    const padPause = [...(navigator.getGamepads?.() ?? [])].some((p) => p?.buttons[9]?.pressed);
    if (consumeKey('Escape') || (padPause && !frame.padPauseHeld)) setPaused(!paused);
    frame.padPauseHeld = padPause;
    if (consumeKey('Backquote')) game.showHitboxes = $('show-hitboxes').checked = !game.showHitboxes;

    if (!paused && !game.ended) {
      acc += dt;
      while (acc >= STEP) {
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
show('menu');
resize();
requestAnimationFrame(frame);

// Handy for tweaking from the browser console.
window.brawl = { get game() { return game; }, ROSTER };
