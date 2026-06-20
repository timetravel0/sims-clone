import { socialManager } from '../systems/SocialManager.js';
import { bus } from '../core/EventBus.js';

/**
 * RelationshipPanel — shows relationship scores for the selected Sim.
 * Toggled by clicking the ♥ button in the toolbar.
 */
export class RelationshipPanel {
  constructor() {
    this._el = document.getElementById('rel-panel');
    this._simId = null;

    bus.on('sim:selected', ({ sim }) => {
      this._simId = sim.id;
      this._simName = sim.name;
      this.refresh();
    });

    bus.on('social:update', () => this.refresh());
  }

  refresh() {
    if (!this._el || !this._simId) return;
    const rels = socialManager.relationsOf(this._simId);
    const sims = window._game?.sims || [];
    const nameOf = id => sims.find(s => s.id === id)?.name || id;

    let html = `<h3>${this._simName || 'Sim'} — Relationships</h3>`;
    if (rels.length === 0) {
      html += `<p class="rel-empty">No interactions yet</p>`;
    } else {
      for (const { other, score } of rels) {
        const label = score > 50 ? 'BFF' : score > 20 ? 'Friend' : score < -20 ? 'Enemy' : 'Neutral';
        const color = score > 20 ? '#a5d6a7' : score < -20 ? '#ef9a9a' : '#aaa';
        const barW  = Math.abs(score);
        const barC  = score >= 0 ? '#4caf50' : '#ef5350';
        html += `
          <div class="rel-row">
            <span class="rel-name">${nameOf(other)}</span>
            <div class="rel-bar-wrap">
              <div class="rel-bar" style="width:${barW}%;background:${barC}"></div>
            </div>
            <span class="rel-label" style="color:${color}">${label}</span>
          </div>`;
      }
    }
    this._el.innerHTML = html;
  }
}
