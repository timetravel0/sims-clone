import { bus }                from '../core/EventBus.js';
import { NEED_KEYS }          from '../entities/SimNeeds.js';

const NEED_LABEL = {
  hunger: 'Hunger', energy: 'Energy', bladder: 'Bladder',
  hygiene: 'Hygiene', social: 'Social', fun: 'Fun',
  comfort: 'Comfort', room: 'Room', autonomy: 'Autonomy',
  status: 'Status',
};
const NEED_EMOJI = {
  hunger:'🍔', energy:'😴', bladder:'🚽', hygiene:'🚿',
  social:'👋', fun:'🎮', comfort:'🛋️', room:'🌿',
  autonomy:'🧭', status:'🏅',
};

/**
 * SimStatusLog
 * — #sim-status  : what the selected Sim is currently doing (action label)
 * — #sim-missing : which need is most critical and at what %
 * — #story-log   : global story feed (left sidebar)
 */
export class SimStatusLog {
  constructor() {
    this._statusEl  = document.getElementById('sim-status');
    this._missingEl = document.getElementById('sim-missing');
    this._logEl     = document.getElementById('story-log');
    this._simId     = null;
    this._lastNeeds = {};

    // Close button for story panel
    const closeBtn = document.getElementById('btn-story-close');
    const panel    = document.getElementById('story-panel');
    const toolbar  = document.getElementById('btn-story');
    if (closeBtn && panel) {
      closeBtn.addEventListener('click', () => {
        panel.classList.add('hidden');
        if (toolbar) toolbar.classList.remove('active');
      });
    }
    // Re-open from toolbar button
    if (toolbar && panel) {
      toolbar.addEventListener('click', () => {
        const hidden = panel.classList.toggle('hidden');
        toolbar.classList.toggle('active', !hidden);
      });
    }

    // Track selected sim
    bus.on('sim:selected', ({ sim }) => { this._simId = sim.id; });

    // Update status + missing need whenever needs tick
    bus.on('simNeeds:update', ({ simId, values }) => {
      this._lastNeeds[simId] = values;
      if (simId === window._game?.selectedSim?.id) {
        this._renderMissing(values);
      }
    });

    // Current action label (emitted by ActionQueue)
    bus.on('sim:action', ({ simId, label }) => {
      if (simId !== window._game?.selectedSim?.id) return;
      if (this._statusEl) {
        this._statusEl.textContent = label ? `▶ ${label}` : '';
      }
    });

    // Story log entries — this feed is the HOUSEHOLD's story, so show an entry only
    // when it involves a household member. population.isHouseholdMember is authoritative
    // (covers off-lot family, who aren't in game.sims, and excludes neighbours/relatives
    // /coworkers). Entries that name specific people (any id field) are kept only if at
    // least one is household; entries with no subject id are household-level/ambient
    // (budget, weather, plans) and are kept. Fixes neighbour-only beats like
    // "Eli grows jealous of Dana" leaking into the family story.
    const isHHId = id => window._game?.population?.isHouseholdMember?.(id) ?? false;
    const isHH = sim => sim && (isHHId(sim.id) || (!sim._isVisitor && !window._game?.population));
    bus.on('story:entry', e => {
      const ids = [e.simId, e.idA, e.idB, e.personId, e.childId].filter(Boolean);
      if (ids.length && !ids.some(isHHId)) return; // about specific non-household people
      this._addEntry(e);
    });
    bus.on('social:interaction', e => {
      if (!isHH(e.simA) && !isHH(e.simB)) return;
      this._addEntry({
        text: `${e.nameA} → ${e.nameB}: ${e.type}${e.accepted === false ? ' rejected' : ''} (${e.score > 0 ? '+' : ''}${Math.round(e.score)})`,
        cat:  e.accepted === false || e.score < 0 ? 'drama' : 'positive',
      });
    });
    bus.on('sim:action', ({ simId, label }) => {
      if (!label) return;
      const sim = window._game?.sims?.find(s => s.id === simId);
      if (!isHH(sim)) return;
      this._addEntry({ text: `${sim.name}: ${label}`, cat: 'action' });
    });
    bus.on('mood:change', ({ simName, tier }) => {
      const sim = window._game?.sims?.find(s => s.name === simName);
      if (!isHH(sim)) return;
      this._addEntry({ text: `${simName} feels ${tier}`, cat: 'mood' });
    });
  }

  _renderMissing(values) {
    if (!this._missingEl) return;
    // Find the single most critical need
    let worstKey = null, worstVal = Infinity;
    for (const k of NEED_KEYS) {
      const v = values[k] ?? 100;
      if (v < worstVal) { worstVal = v; worstKey = k; }
    }
    if (worstKey && worstVal < 60) {
      const pct   = Math.round(worstVal);
      const emoji = NEED_EMOJI[worstKey] || '';
      const label = NEED_LABEL[worstKey] || worstKey;
      const color = worstVal < 25 ? '#ef9a9a' : worstVal < 45 ? '#ffcc80' : '#aaa';
      this._missingEl.style.color   = color;
      this._missingEl.textContent   = `${emoji} ${label}: ${pct}%`;
    } else {
      this._missingEl.textContent = '';
    }
  }

  _addEntry({ text, cat = 'neutral' }) {
    if (!this._logEl || !text) return;
    const hour = window._game?.clock?.hour ?? 0;
    const hh   = String(Math.floor(hour)).padStart(2,'0');
    const mm   = String(Math.round((hour % 1) * 60)).padStart(2,'0');

    const entry = document.createElement('div');
    entry.className = `log-entry cat-${cat}`;

    const dotColor = { drama:'#ef9a9a', positive:'#a5d6a7', mood:'#ffd54f',
                       gossip:'#ce93d8', action:'#80cbc4', need:'#ffcc80' }[cat] || '#555';
    entry.innerHTML = `
      <span class="log-dot" style="background:${dotColor}"></span>
      <span class="log-time">${hh}:${mm}</span>
      <span class="log-text">${text}</span>`;

    this._logEl.appendChild(entry);
    // Keep last 120 entries
    while (this._logEl.children.length > 120) this._logEl.removeChild(this._logEl.firstChild);
    // Auto-scroll to bottom
    this._logEl.scrollTop = this._logEl.scrollHeight;
  }
}
