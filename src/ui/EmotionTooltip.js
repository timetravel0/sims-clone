import { EMOTION_DEF } from '../entities/SimEmotions.js';
import { bus }         from '../core/EventBus.js';

/**
 * EmotionTooltip — rich hover tooltip shown when the player hovers
 * an EmotionBadge.
 *
 * Content:
 *  - Sim name + mood tier
 *  - All active emotions with individual intensity bars
 *  - Top 3 most salient memories (if MemorySystem available)
 *  - Active goals (if GoalSystem available)
 *
 * Positioning: follows the badge element, flips side if near screen edge.
 * Dismissed on mouseleave or after 6s of no interaction.
 */

const TIER_LABEL = {
  miserable:'😞 Miserable', sad:'😐 Sad', neutral:'😶 Neutral',
  happy:'🙂 Happy', ecstatic:'🤩 Ecstatic',
};

export class EmotionTooltip {
  constructor(sims) {
    this._sims   = sims;
    this._panel  = this._createPanel();
    this._timer  = null;
    this._bound  = null; // currently bound simId
    this._registerBus();
    this._injectCSS();
  }

  // ── Public ────────────────────────────────────────────────────────────────

  /** Attach hover listeners to all existing badges in the DOM. */
  bindBadges() {
    document.querySelectorAll('.emotion-badge').forEach(el => {
      const simId = el.dataset.simId;
      if (!simId) return;
      el.addEventListener('mouseenter', () => this._show(simId, el));
      el.addEventListener('mouseleave', () => this._hide());
    });
  }

  addSim(sim) {
    // Called after EmotionBadge.addSim — re-bind all badges
    setTimeout(() => this.bindBadges(), 50);
  }

  destroy() { this._panel.remove(); }

  // ── Private ───────────────────────────────────────────────────────────────

  _show(simId, anchorEl) {
    const sim = this._sims.find(s => s.id === simId);
    if (!sim) return;
    this._bound = simId;
    clearTimeout(this._timer);

    this._panel.innerHTML = this._buildHTML(sim);
    this._panel.style.display = 'block';

    // Position: right of badge by default, flip left if near right edge
    const rect  = anchorEl.getBoundingClientRect();
    const pw    = 220;
    const left  = rect.right + 8 + pw > window.innerWidth
      ? rect.left - pw - 8
      : rect.right + 8;
    const top   = Math.min(rect.top, window.innerHeight - 260);
    this._panel.style.left = `${left}px`;
    this._panel.style.top  = `${top}px`;

    // Auto-dismiss
    this._timer = setTimeout(() => this._hide(), 6000);
  }

  _hide() {
    clearTimeout(this._timer);
    this._panel.style.display = 'none';
    this._bound = null;
  }

  _buildHTML(sim) {
    const tier    = sim.brain?.emotions?.tier ?? sim.mood?.tier ?? 'neutral';
    const tierLbl = TIER_LABEL[tier] ?? tier;

    // Active emotions
    const dom     = sim.emotions;
    let emotionRows = '';
    if (dom?._active?.size > 0) {
      for (const [type, state] of dom._active) {
        const def  = EMOTION_DEF[type] ?? { emoji:'❓', label: type, color:'#aaa' };
        const pct  = Math.round(state.intensity * 100);
        emotionRows += `
          <div class="et-row">
            <span class="et-emoji">${def.emoji}</span>
            <span class="et-name">${def.label}</span>
            <div class="et-bar-wrap">
              <div class="et-bar" style="width:${pct}%;background:${def.color}"></div>
            </div>
            <span class="et-pct">${pct}%</span>
          </div>`;
      }
    } else {
      emotionRows = '<div class="et-empty">No active emotions</div>';
    }

    // Memories (top 3)
    let memRows = '';
    const memory = sim.brain?.memory;
    if (memory) {
      const mems = memory.topN(3);
      for (const m of mems) {
        const valColor = m.valence >= 0 ? '#a5d6a7' : '#ef9a9a';
        const salPct   = Math.round(m.salience * 100);
        memRows += `
          <div class="et-mem">
            <span class="et-mem-val" style="color:${valColor}">${m.valence >= 0 ? '+' : ''}${m.valence.toFixed(2)}</span>
            <span class="et-mem-desc">${m.description}</span>
            <span class="et-mem-sal">(sal ${salPct}%)</span>
          </div>`;
      }
      if (mems.length === 0) memRows = '<div class="et-empty">No memories yet</div>';
    }

    // Goals
    let goalRows = '';
    const goals = sim.brain?.goalSystem?.activeGoals() ?? [];
    for (const g of goals) {
      goalRows += `<div class="et-goal">🎯 ${g.label} <span class="et-goal-w">(w ${g.weight.toFixed(2)})</span></div>`;
    }
    if (goalRows === '') goalRows = '<div class="et-empty">No active goals</div>';

    return `
      <div class="et-header">
        <span class="et-simname">${sim.name}</span>
        <span class="et-tier">${tierLbl}</span>
      </div>
      <div class="et-section-title">Emotions</div>
      ${emotionRows}
      <div class="et-section-title">Recent memories</div>
      ${memRows}
      <div class="et-section-title">Active goals</div>
      ${goalRows}
    `;
  }

  _createPanel() {
    let p = document.getElementById('emotion-tooltip');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'emotion-tooltip';
    Object.assign(p.style, {
      position      : 'fixed',
      display       : 'none',
      zIndex        : '200',
      width         : '220px',
      pointerEvents : 'none',
    });
    document.body.appendChild(p);
    return p;
  }

  _injectCSS() {
    if (document.getElementById('emotion-tooltip-css')) return;
    const s = document.createElement('style');
    s.id = 'emotion-tooltip-css';
    s.textContent = `
      #emotion-tooltip {
        background: rgba(12,12,18,0.94);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 10px;
        padding: 10px 12px;
        font-family: system-ui, sans-serif;
        font-size: 11px;
        color: #ddd;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 24px #000a;
        line-height: 1.4;
      }
      .et-header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px; }
      .et-simname { font-size:13px; font-weight:700; color:#fff; }
      .et-tier    { font-size:10px; color:#bbb; }
      .et-section-title {
        font-size:9px; font-weight:700; letter-spacing:0.08em;
        text-transform:uppercase; color:#888;
        margin: 8px 0 4px;
        border-top: 1px solid rgba(255,255,255,0.07);
        padding-top: 6px;
      }
      .et-row { display:flex; align-items:center; gap:5px; margin-bottom:4px; }
      .et-emoji { font-size:14px; width:18px; text-align:center; }
      .et-name  { width:80px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#eee; }
      .et-bar-wrap { flex:1; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden; }
      .et-bar  { height:100%; border-radius:3px; transition:width 0.3s ease; }
      .et-pct  { width:28px; text-align:right; color:#aaa; font-size:10px; }
      .et-mem  { display:flex; gap:4px; align-items:baseline; margin-bottom:3px; flex-wrap:wrap; }
      .et-mem-val  { font-weight:700; font-size:10px; flex-shrink:0; }
      .et-mem-desc { color:#ccc; font-size:10px; flex:1; }
      .et-mem-sal  { color:#888; font-size:9px; flex-shrink:0; }
      .et-goal { margin-bottom:3px; color:#c8e6c9; font-size:10px; }
      .et-goal-w { color:#888; }
      .et-empty { color:#666; font-style:italic; font-size:10px; }
    `;
    document.head.appendChild(s);
  }

  _registerBus() {
    // Re-bind when a new Sim is added
    bus.on('sim:spawned', () => setTimeout(() => this.bindBadges(), 100));
  }
}
