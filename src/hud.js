import { SLOT_COLORS } from './roster.js';

// In-match overlay: one card per fighter with damage % and stocks.
export class Hud {
  constructor(fighters) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.cards = fighters.map((f) => {
      const card = document.createElement('div');
      card.className = 'hud-card';
      card.style.setProperty('--slot', SLOT_COLORS[f.slot]);
      card.innerHTML = `
        <div class="hud-tag">P${f.slot + 1}</div>
        <div class="hud-percent">0%</div>
        <div class="hud-name"></div>
        <div class="hud-stocks"></div>
        <div class="hud-extra"></div>`;
      card.querySelector('.hud-name').textContent = f.character.name;
      this.el.appendChild(card);
      return {
        f, card, last: {},
        percent: card.querySelector('.hud-percent'),
        stocks: card.querySelector('.hud-stocks'),
        extra: card.querySelector('.hud-extra'),
      };
    });
    document.body.appendChild(this.el);
  }

  update() {
    for (const c of this.cards) {
      const { f } = c;
      const pct = Math.floor(f.percent);
      if (c.last.pct !== pct || c.last.dead !== f.dead) {
        c.percent.textContent = f.dead ? '—' : `${pct}%`;
        // White -> yellow -> red as damage climbs
        const t = Math.min(1, pct / 150);
        c.percent.style.color = f.dead ? '#667' : `hsl(${55 - 55 * t}, 100%, ${100 - 45 * Math.min(1, t * 1.6)}%)`;
        if (pct > (c.last.pct ?? 0)) {
          c.percent.classList.remove('bump');
          void c.percent.offsetWidth;
          c.percent.classList.add('bump');
        }
      }
      if (c.last.stocks !== f.stocks) {
        c.stocks.innerHTML = '<span></span>'.repeat(Math.max(0, f.stocks));
        c.card.classList.toggle('out', f.stocks <= 0);
      }
      // Character-specific status, e.g. Jacoby's microscope and snack stacks.
      const extra = f.character.hud?.(f) ?? '';
      if (c.last.extra !== extra) c.extra.textContent = extra;
      c.last = { pct, dead: f.dead, stocks: f.stocks, extra };
    }
  }

  dispose() {
    this.el.remove();
  }
}
