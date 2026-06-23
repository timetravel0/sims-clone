import { bus }          from '../core/EventBus.js';
import { memorySystem } from '../systems/MemorySystem.js';

const TYPE_COLORS = {
  social:     '#4fc3f7',
  mood_peak:  '#ffb74d',
  need_crisis:'#ef5350',
  life_event: '#81c784',
  god_action: '#ce93d8',
};

export class MemoryInspectorPanel {
  constructor() {
    this._el  = null;
    this._sim = null;
    this._build();
    bus.on('sim:selected', ({ sim }) => { this._sim = sim; if (this._visible()) this._render(); });
    document.addEventListener('keydown', e => { if (e.key === 'M' || e.key === 'm') this._toggle(); });
  }

  _visible() { return this._el?.style.display !== 'none'; }

  _toggle() {
    if (this._visible()) { this._el.style.display = 'none'; return; }
    this._el.style.display = 'flex';
    this._render();
  }

  _build() {
    this._el = document.createElement('div');
    Object.assign(this._el.style, {
      display: 'none', position: 'fixed', top: '60px', right: '10px',
      width: '300px', maxHeight: '70vh', background: 'rgba(15,20,40,0.96)',
      border: '1px solid #1a4a7a', borderRadius: '8px', zIndex: '150',
      flexDirection: 'column', fontFamily: 'monospace', fontSize: '11px', color: '#ddd',
    });
    document.body.appendChild(this._el);
  }

  _render() {
    if (!this._sim) { this._el.innerHTML = '<div style="padding:12px;color:#888">Nessun Sim selezionato</div>'; return; }

    const mems = memorySystem.of(this._sim.id);
    const brainMems = this._sim.brain?.memory?.topN?.(20) ?? [];
    const all = [...mems, ...brainMems].slice(0, 30);

    let html = `
      <div style="padding:10px 12px;border-bottom:1px solid #1a4a7a;display:flex;align-items:center;justify-content:space-between">
        <span style="color:#e94560;font-weight:bold">🧠 Memorie — ${this._sim.name}</span>
        <span style="cursor:pointer;color:#888" onclick="this.closest('[style]').style.display='none'">✕</span>
      </div>
      <div style="overflow-y:auto;padding:8px">`;

    if (all.length === 0) {
      html += '<div style="color:#666;padding:8px">Nessuna memoria registrata</div>';
    } else {
      for (const m of all) {
        const col   = TYPE_COLORS[m.type] ?? '#aaa';
        const pct   = Math.round((m.intensity ?? 0) * 100);
        const actor = m.data?.otherName ?? m.data?.otherId ?? '';
        html += `
          <div style="margin-bottom:8px;padding:6px 8px;background:rgba(255,255,255,0.04);border-radius:4px;border-left:3px solid ${col}">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="color:${col}">${m.type}</span>
              ${actor ? `<span style="color:#888">${actor}</span>` : ''}
            </div>
            <div style="background:rgba(255,255,255,0.08);border-radius:2px;height:4px">
              <div style="width:${pct}%;height:100%;background:${col};border-radius:2px;transition:width .3s"></div>
            </div>
            <div style="color:#555;font-size:10px;margin-top:3px">${pct}% intensità</div>
          </div>`;
      }
    }

    html += '</div>';
    this._el.innerHTML = html;
  }
}
