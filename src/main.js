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
import { createSelect, resolveChar, RANDOM, CONTROL_OPTIONS } from './select.js';
import { loadCampus } from './campus.js';

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

// The resolution range for what's on screen. The victory screen is a light
// scene seen up close, so it never inherits whatever Auto dropped to in a
// heavy match (that made everyone look blurry): it renders at least at
// screen resolution, and above it when there's room (smoother edges and
// skin on the scanned models).
function ratioRange() {
  const q = QUALITY[quality];
  const dpr = window.devicePixelRatio || 1;
  if (victory) {
    const native = Math.max(1, dpr);
    const top = quality === 'fast' ? native : Math.min(2, native * 1.5);
    return { top, min: native };
  }
  return { top: quality === 'fast' ? q.max : Math.min(dpr, q.max), min: q.min };
}

function applyQuality() {
  pixelRatio = ratioRange().top;
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = QUALITY[quality].shadows;
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
  if (quality !== 'auto' || paused || !(victory || (game && !game.ended))) return;
  const { top, min } = ratioRange();
  if (perf.fps < 50 && pixelRatio > min) {
    pixelRatio = Math.max(min, pixelRatio - 0.15);
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
  if (name !== 'menu') $('hand-token').classList.add('hidden'); // the select screen's mouse coin
};

// ---- Menu / character select (see select.js) ----

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
  if (!ROSTER[s.char] && s.char !== RANDOM) s.char = 0;
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

const select = createSelect({
  slots,
  renderer,
  onChange: () => { saveSlots(); updateHint(); },
  onStart: () => startFromMenu(),
});

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
  game = new Game({
    renderer,
    stage: setup.stage,
    stocks: setup.stocks,
    players: setup.players.map((p) => ({ ...p, controller: createController(p.control) })),
    onEnd: showResults,
  });
  game.showHitboxes = $('show-hitboxes').checked;
  applyQuality(); // back to full sharpness; Auto lowers it again if the match runs slow
  paused = false;
  frame.padPauseHeld = true; // a Start press that began the match doesn't also pause it
  show(null);
  const someone = game.fighters[Math.floor(Math.random() * game.fighters.length)];
  voice.say(someone.character.id, 'intro');
}

function buildSetup() {
  return {
    stage: STAGES[stageIndex].id,
    stocks: Number($('stocks').value),
    players: slots
      .filter((s) => s.control !== 'off')
      .map((s) => {
        const c = resolveChar(s); // Random rolls here
        const outfit = c === s.char ? s.outfit : 0;
        return {
          slot: slots.indexOf(s), control: s.control, character: ROSTER[c],
          look: { model: outfitsFor(ROSTER[c])[outfit]?.model, accessory: ACCESSORIES[s.extra]?.id ?? null },
        };
      }),
  };
}

function showResults(ranked) {
  const winner = ranked[0];
  $('winner').textContent = `${winner.character.name} wins!`;
  screens.results.style.setProperty('--win', SLOT_COLORS[winner.slot]);
  $('standings').innerHTML = '<tr><th></th><th>Player</th><th>KOs</th><th>Falls</th></tr>' +
    ranked.map((f, i) => `<tr><td>${i + 1}</td><td style="color:${SLOT_COLORS[f.slot]}">P${f.slot + 1} · ${f.character.name}</td><td>${f.koCount}</td><td>${f.falls}</td></tr>`).join('');
  game.ended = true;
  game.hud.el.remove();
  // The match stays around (for Rematch) but the victory scene takes over the
  // screen. A match on the campus keeps its time of day.
  victory = new VictoryScene({ renderer, ranked, time: game.stageView.timeOfDay });
  const flash = document.createElement('div');
  flash.className = 'screen-flash';
  flash.style.background = '#fff';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());
  $('quote').textContent = victory.quote ? `"${victory.quote}"` : '';
  applyQuality();
  show('results');
  voice.say(winner.character.id, 'victory', { interrupt: true });
}

function toMenu() {
  game?.dispose();
  victory?.dispose();
  game = null;
  victory = null;
  voice.stopAll();
  select.render();
  show('menu');
}

function setPaused(p) {
  if (!game || game.ended) return;
  paused = p;
  show(p ? 'pause' : null);
}

// Canvas text (bubbles, pop-ups) is drawn once and reused: make sure the fonts are in first.
function startFromMenu() {
  if ($('start').disabled || game || victory) return;
  fontsReady.then(() => startMatch());
}
$('start').onclick = startFromMenu;
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
    // Menu: keyboard and gamepad players move their cursors; Enter starts.
    if (!screens.menu.classList.contains('hidden')) {
      select.poll();
      const typing = document.activeElement?.closest?.('select, button, input');
      if (consumeKey('Enter') && !typing) startFromMenu();
    }
    endInputFrame();
  }
  requestAnimationFrame(frame);
}

renderStage();
show('menu');
applyQuality();
updateFps();
requestAnimationFrame(frame);

// Build the campus (the victory screen's backdrop, and the SUNY Canton stage)
// while the menu is up, and send its big ground texture to the GPU, so the
// first victory doesn't stutter.
setTimeout(() => loadCampus().then((campus) => campus && renderer.initTexture(campus.ground)), 1200);

// Handy for tweaking from the browser console.
window.brawl = { get game() { return game; }, get victory() { return victory; }, ROSTER, showResults, slots, startMatch, buildSetup, renderer };
