import { bus } from '../core/EventBus.js';
import { nameOf } from './nameOf.js';

const COLORS = {
  friendship: '#66bb6a',
  rivalry: '#ef5350',
  romance: '#ec6aa6',
  kinship: '#90caf9',
};
const LABELS = {
  friendship: 'Friend',
  rivalry: 'Rival',
  romance: 'Romance',
  kinship: 'Family',
};

export class GraphPanel {
  constructor(game) {
    this._game = game;
    this._el = document.getElementById('graph-panel');
    this._btn = document.getElementById('btn-graph');
    if (!this._el) return;
    this._btn?.addEventListener('click', () => this.toggle());
    bus.on('relationship:graphChanged', () => this.refresh());
    bus.on('social:interaction', () => this.refresh());
    bus.on('sim:selected', () => this.refresh());
    this.refresh();
  }

  toggle() {
    const visible = this._el.style.display === 'block';
    this._el.style.display = visible ? 'none' : 'block';
    this._btn?.classList.toggle('active', !visible);
    if (!visible) this.refresh();
  }

  refresh() {
    if (!this._el) return;
    const sims = this._game.sims;
    const edges = this._game.relationshipGraph.strongest(null, 6);
    const pos = this._positions(sims);
    const lines = edges
      .filter(edge => pos[edge.from] && pos[edge.to])
      .map(edge => this._edgeSvg(edge, pos))
      .join('');
    const nodes = sims.map(sim => this._nodeSvg(sim, pos[sim.id])).join('');
    const rows = edges.slice(0, 10).map(edge => this._row(edge)).join('') ||
      '<p class="graph-empty">No graph edges yet</p>';
    this._el.innerHTML = `
      <h3>Social Graph</h3>
      <svg class="graph-svg" viewBox="0 0 220 150" aria-hidden="true">
        ${lines}
        ${nodes}
      </svg>
      <div class="graph-legend">
        ${Object.entries(COLORS).map(([type, color]) =>
          `<span><i style="background:${color}"></i>${LABELS[type]}</span>`
        ).join('')}
      </div>
      <div class="graph-list">${rows}</div>
    `;
  }

  _positions(sims) {
    const cx = 110, cy = 72, r = 48;
    const out = {};
    sims.forEach((sim, i) => {
      const a = -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(1, sims.length);
      out[sim.id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
    return out;
  }

  _edgeSvg(edge, pos) {
    const a = pos[edge.from], b = pos[edge.to];
    const color = COLORS[edge.type] || '#aaa';
    const width = 1 + edge.strength / 28;
    const opacity = 0.25 + Math.min(0.65, edge.strength / 120);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ox = (-dy / len) * 4;
    const oy = (dx / len) * 4;
    return `<line x1="${a.x + ox}" y1="${a.y + oy}" x2="${b.x + ox}" y2="${b.y + oy}"
      stroke="${color}" stroke-width="${width.toFixed(1)}" stroke-opacity="${opacity.toFixed(2)}" />`;
  }

  _nodeSvg(sim, p) {
    const selected = this._game.selectedSim?.id === sim.id;
    const color = `#${sim.color.toString(16).padStart(6, '0')}`;
    return `
      <circle cx="${p.x}" cy="${p.y}" r="${selected ? 13 : 11}" fill="${color}" fill-opacity="0.45" stroke="${color}" stroke-width="2" />
      <text x="${p.x}" y="${p.y + 3}" text-anchor="middle">${sim.name.slice(0, 2).toUpperCase()}</text>`;
  }

  _row(edge) {
    const from = this._name(edge.from);
    const to = this._name(edge.to);
    const color = COLORS[edge.type] || '#aaa';
    return `
      <div class="graph-row">
        <span class="graph-type" style="color:${color}">${LABELS[edge.type] || edge.type}</span>
        <span class="graph-names">${from} → ${to}</span>
        <span class="graph-score">${Math.round(edge.strength)}</span>
      </div>`;
  }

  _name(id) {
    return nameOf(id, this._game);
  }
}
