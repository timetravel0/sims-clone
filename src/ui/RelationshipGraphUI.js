/**
 * RelationshipGraphUI — Sprint 6
 * Renders the social graph as an interactive SVG overlay.
 *
 * Nodes = Sims (circles with name initials).
 * Edges = relationships with colour and thickness by score:
 *   score >= 80   → gold  "Best Friends"
 *   score >= 50   → green "Friends"
 *   score >= 20   → blue  "Acquaintances"
 *   score >= 0    → grey  "Neutral"
 *   score < 0     → red   "Enemies"
 *
 * Romance edges are rendered with a dashed overlay.
 * Node layout: circular arrangement.
 * Hover: shows tooltip with score, relationship label, shared memories count.
 * Click node: selects that Sim in the game.
 *
 * DOM anchor: <div id="relationship-graph">
 */
import { bus } from '../core/EventBus.js';

const W = 340, H = 340;
const RADIUS = 120; // layout radius
const NODE_R = 22;

const EDGE_COLORS = [
  { min:  80, color: '#d4a017', label: 'Best Friends', width: 3 },
  { min:  50, color: '#4caf50', label: 'Friends',      width: 2.5 },
  { min:  20, color: '#2196f3', label: 'Acquaintances',width: 1.5 },
  { min:   0, color: '#9e9e9e', label: 'Neutral',      width: 1 },
  { min: -Infinity, color: '#e53935', label: 'Enemies',width: 2 },
];

function edgeStyle(score) {
  return EDGE_COLORS.find(e => score >= e.min) ?? EDGE_COLORS[EDGE_COLORS.length - 1];
}

export class RelationshipGraphUI {
  /**
   * @param {object} game
   * @param {RelationshipGraph} relGraph
   */
  constructor(game, relGraph) {
    this._game     = game;
    this._rg       = relGraph;
    this._el       = document.getElementById('relationship-graph');
    this._visible  = false;
    this._tooltip  = null;

    bus.on('relationship:changed', () => { if (this._visible) this._render(); });
    bus.on('romance:changed',      () => { if (this._visible) this._render(); });
  }

  show() { this._visible = true;  if (this._el) this._el.style.display = 'block'; this._render(); }
  hide() { this._visible = false; if (this._el) this._el.style.display = 'none'; }
  toggle() { this._visible ? this.hide() : this.show(); }

  _render() {
    if (!this._el) return;
    const sims = this._game.sims ?? [];
    if (!sims.length) { this._el.innerHTML = '<p style="color:#aaa;padding:12px">No Sims loaded.</p>'; return; }

    const cx = W / 2, cy = H / 2;
    const positions = sims.map((sim, i) => {
      const angle = (2 * Math.PI * i / sims.length) - Math.PI / 2;
      return {
        sim,
        x: cx + RADIUS * Math.cos(angle),
        y: cy + RADIUS * Math.sin(angle),
      };
    });

    const posMap = new Map(positions.map(p => [p.sim.id, p]));

    // Build SVG
    let edgesSVG = '';
    let nodesSVG = '';

    // Edges
    for (let i = 0; i < sims.length; i++) {
      for (let j = i + 1; j < sims.length; j++) {
        const a = sims[i], b = sims[j];
        const score   = this._rg?.getScore?.(a.id, b.id) ?? 0;
        const romance = this._rg?.isRomantic?.(a.id, b.id) ?? false;
        if (Math.abs(score) < 1 && !romance) continue;

        const pa = posMap.get(a.id);
        const pb = posMap.get(b.id);
        const st = edgeStyle(score);

        edgesSVG += `<line
          x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}"
          x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}"
          stroke="${st.color}" stroke-width="${st.width}"
          stroke-opacity="0.7"
          data-a="${a.id}" data-b="${b.id}" data-score="${score}"
          class="rg-edge"/>`;

        if (romance) {
          edgesSVG += `<line
            x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}"
            x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}"
            stroke="#e91e63" stroke-width="1.5"
            stroke-dasharray="5,4" stroke-opacity="0.9"
            pointer-events="none"/>`;
        }
      }
    }

    // Nodes
    for (const { sim, x, y } of positions) {
      const col = `#${(sim.color ?? 0x4fc3f7).toString(16).padStart(6,'0')}`;
      const initial = (sim.name ?? '?')[0].toUpperCase();
      const selected = this._game.selectedSim?.id === sim.id;
      nodesSVG += `
        <g class="rg-node" data-simid="${sim.id}" style="cursor:pointer">
          ${ selected ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${NODE_R+4}" fill="none" stroke="#fff" stroke-width="2"/>` : '' }
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${NODE_R}"
            fill="${col}" stroke="#fff" stroke-width="1.5"/>
          <text x="${x.toFixed(1)}" y="${(y+1).toFixed(1)}"
            text-anchor="middle" dominant-baseline="middle"
            font-size="13" font-weight="bold" fill="#fff"
            pointer-events="none">${initial}</text>
          <text x="${x.toFixed(1)}" y="${(y + NODE_R + 12).toFixed(1)}"
            text-anchor="middle" font-size="10" fill="#ccc"
            pointer-events="none">${sim.name ?? sim.id}</text>
        </g>`;
    }

    this._el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #393836">
        <span style="font-weight:600;font-size:13px">🕸️ Relationships</span>
        <button id="rg-close" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:16px">✕</button>
      </div>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
           style="display:block;background:#1c1b19">
        <g id="rg-edges">${edgesSVG}</g>
        <g id="rg-nodes">${nodesSVG}</g>
      </svg>
      <div id="rg-legend" style="display:flex;gap:10px;flex-wrap:wrap;padding:8px 12px;font-size:10px;color:#aaa">
        ${ EDGE_COLORS.map(e => `<span><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="${e.color}" stroke-width="${e.width}"/></svg>${e.label}</span>`).join('') }
        <span><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#e91e63" stroke-width="1.5" stroke-dasharray="4,3"/></svg>Romance</span>
      </div>`;

    // Events
    document.getElementById('rg-close')?.addEventListener('click', () => this.hide());
    this._el.querySelectorAll('.rg-node').forEach(g => {
      g.addEventListener('click', () => {
        const simId = g.dataset.simid;
        const sim = this._game.sims?.find(s => s.id === simId);
        if (sim) bus.emit('sim:selected', { sim });
      });
      g.addEventListener('mouseenter', (e) => this._showTooltip(e, g.dataset.simid));
      g.addEventListener('mouseleave', () => this._hideTooltip());
    });
    this._el.querySelectorAll('.rg-edge').forEach(line => {
      line.addEventListener('mouseenter', (e) => this._showEdgeTooltip(e, line));
      line.addEventListener('mouseleave', () => this._hideTooltip());
    });
  }

  _showTooltip(e, simId) {
    const sim = this._game.sims?.find(s => s.id === simId);
    if (!sim) return;
    const state = this._game.careerSystem?.getState(simId);
    const careerLabel = state ? `${state.careerId} Lv${state.level}` : 'Unemployed';
    this._tooltip = this._makeTooltip(
      `<b>${sim.name}</b><br>Career: ${careerLabel}<br>Mood: ${sim.mood ?? '?'}`, e);
  }

  _showEdgeTooltip(e, line) {
    const score = parseFloat(line.dataset.score ?? 0);
    const st    = edgeStyle(score);
    this._tooltip = this._makeTooltip(`${st.label}<br>Score: ${score.toFixed(0)}`, e);
  }

  _makeTooltip(html, e) {
    this._hideTooltip();
    const div = document.createElement('div');
    div.id = 'rg-tooltip';
    div.style.cssText = 'position:fixed;background:#28251d;color:#cdccca;padding:6px 10px;border-radius:6px;font-size:11px;pointer-events:none;z-index:9999;border:1px solid #393836';
    div.innerHTML = html;
    div.style.left = (e.clientX + 12) + 'px';
    div.style.top  = (e.clientY - 20) + 'px';
    document.body.appendChild(div);
    return div;
  }

  _hideTooltip() {
    document.getElementById('rg-tooltip')?.remove();
    this._tooltip = null;
  }
}
