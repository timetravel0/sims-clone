import { socialManager } from '../systems/SocialManager.js';
import { bus }           from '../core/EventBus.js';

/**
 * RelationshipPanel — shows relationship scores for the selected Sim.
 * Toggled by clicking the ♥ button in the toolbar.
 *
 * Fix: listens to 'social:interaction' (emitted by SocialAction._doInteract)
 * instead of the old 'social:update' which was never fired.
 */
export class RelationshipPanel {
  constructor() {
    this._el      = document.getElementById('rel-panel');
    this._simId   = null;
    this._simName = '';

    bus.on('sim:selected', ({ sim }) => {
      this._simId   = sim.id;
      this._simName = sim.name;
      this.refresh();
    });

    // 'social:interaction' is what SocialAction actually emits
    bus.on('social:interaction', () => this.refresh());
  }

  refresh() {
    if (!this._el || !this._simId) return;
    const rels  = socialManager.relationsOf(this._simId);
    const sims  = window._game?.sims || [];
    const nameOf = id => sims.find(s => s.id === id)?.name || id;

    let html = `<h3>${this._simName} — Relations</h3>`;

    if (rels.length === 0) {
      html += `<p class="rel-empty">No interactions yet</p>`;
    } else {
      // Sort: best friends first, enemies last
      const sorted = [...rels].sort((a, b) => b.score - a.score);
      for (const { other, score } of sorted) {
        const label  = score > 60 ? 'BFF ❤️' : score > 30 ? 'Friend 😊'
                     : score < -30 ? 'Enemy 😠' : score < -10 ? 'Tense 😕' : 'Neutral';
        const barW   = Math.min(100, Math.abs(score));
        const barC   = score >= 0 ? '#4caf50' : '#ef5350';
        const lColor = score > 30 ? '#a5d6a7' : score < -10 ? '#ef9a9a' : '#aaa';
        html += `
          <div class="rel-row">
            <span class="rel-name" title="${nameOf(other)}">${nameOf(other)}</span>
            <div class="rel-bar-wrap">
              <div class="rel-bar" style="width:${barW}%;background:${barC}"></div>
            </div>
            <span class="rel-score">${score > 0 ? '+' : ''}${Math.round(score)}</span>
            <span class="rel-label" style="color:${lColor}">${label}</span>
          </div>`;
      }
    }
    this._el.innerHTML = html;
  }
}
