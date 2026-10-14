// Voicelines: drop audio files into voicelines/<character id>/ named after
// what should trigger them, and they play in game. No code changes needed:
// Vite finds every file in that folder when the game starts.
//
//   voicelines/draven/victory.mp3      plays on the victory screen
//   voicelines/draven/victory2.mp3     a second take: one is picked at random
//   voicelines/eli/nspecial.mp3        plays (sometimes) when he uses that move
//
// See voicelines/README.md for the full list of names.

const FILES = import.meta.glob('../voicelines/*/*.{mp3,ogg,wav,m4a,webm,aac}', {
  eager: true, query: '?url', import: 'default',
});

// { draven: { victory: [url, url], ko: [url] }, ... }
const LINES = {};
for (const [path, url] of Object.entries(FILES)) {
  const [, id, file] = path.match(/voicelines\/([^/]+)\/([^/]+)$/) ?? [];
  // "victory.mp3", "victory2.mp3", "victory-2.mp3", "Victory (3).mp3" -> "victory"
  const event = file?.replace(/\.[^.]+$/, '').replace(/[-_ ]*\(?\d+\)?$/, '').trim().toLowerCase();
  if (!id || !event) continue;
  ((LINES[id.toLowerCase()] ??= {})[event] ??= []).push(url);
}

let enabled = true;
try {
  enabled = localStorage.getItem('brawl.voices') !== 'off';
} catch { /* storage blocked: keep the default */ }

const speaking = new Map(); // character id -> the Audio playing now
const lastSaid = new Map(); // `${id}:${event}` -> time it last played

export const voice = {
  get enabled() { return enabled; },
  set enabled(on) {
    enabled = on;
    try { localStorage.setItem('brawl.voices', on ? 'on' : 'off'); } catch { /* ignore */ }
    if (!on) for (const a of speaking.values()) a.pause();
  },
  volume: 0.9,

  has(id, event) {
    return !!LINES[id]?.[event.toLowerCase()];
  },

  // chance: 0-1 odds of speaking; cooldown: seconds before this line can repeat;
  // interrupt: cut off whatever this character is saying (a KO, a win).
  say(id, event, { chance = 1, cooldown = 0, interrupt = false } = {}) {
    const urls = LINES[id]?.[event.toLowerCase()];
    if (!enabled || !urls || Math.random() > chance) return null;
    const key = `${id}:${event}`;
    const now = performance.now() / 1000;
    if (now - (lastSaid.get(key) ?? -1e9) < cooldown) return null;
    const current = speaking.get(id);
    if (current && !current.ended && !current.paused) {
      if (!interrupt) return null; // don't talk over yourself
      current.pause();
    }
    const audio = new Audio(urls[Math.floor(Math.random() * urls.length)]);
    audio.volume = this.volume;
    audio.play().catch(() => {}); // autoplay can be blocked until the first click
    speaking.set(id, audio);
    lastSaid.set(key, now);
    return audio;
  },

  stopAll() {
    for (const a of speaking.values()) a.pause();
    speaking.clear();
  },
};
