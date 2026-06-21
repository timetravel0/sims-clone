/**
 * CareerPanel — centered modal to assign / change a Sim's career track.
 * Opened via toolbar button #btn-career.
 */
import { bus } from '../core/EventBus.js';
import { CAREER_TRACKS } from '../systems/CareerSystem.js';

export class CareerPanel {
  constructor(game) {
    this._game = game;
    this._sim  = game.selectedSim;
    this._el   = this._build();
    document.body.appendChild(this._el);
    bus.on('sim:selected', ({ sim }) => { this._sim = sim; });
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'career-panel';
    el.style.cssText = [
      'position:fixed','top:50%','left:50%',
      'transform:translate(-50%,-50%)',
      'background:rgba(20,18,14,0.97)',
      'border:1px solid #555','border-radius:10px',
      'padding:20px','color:#e8e6e0','font-size:13px',
      'font-family:monospace','z-index:500',
      'display:none','min-width:280px','max-height:80vh','overflow-y:auto',
    ].join(';');
    return el;
  }

  open() {
    const sim = this._sim;
    if (!sim) return;
    this._el.innerHTML = `
      <div style="font-weight:bold;font-size:15px;margin-bottom:12px;color:#ffd54f">
        💼 Assign Career — ${sim.name}
      </div>
      ${Object.entries(CAREER_TRACKS).map(([key, t]) => `
        <div class="career-opt" data-track="${key}" style="
          cursor:pointer;padding:8px;margin:4px 0;border-radius:6px;
          background:${sim.career?.track === key ? '#1e2e1e' : '#1e1d1a'};
          border:1px solid ${sim.career?.track === key ? '#4caf50' : '#333'};
        ">
          <span style="font-size:16px">${t.emoji}</span>
          <strong style="margin-left:6px">${t.label}</strong>
          <span style="color:#888;font-size:11px;margin-left:8px">§${t.salaryBase}/day</span>
          <div style="color:#90caf9;font-size:11px;margin-top:2px">
            Skills: ${t.skills.length ? t.skills.join(', ') : 'none'}
          </div>
        </div>
      `).join('')}
      <button id="cp-close" style="
        margin-top:12px;padding:6px 16px;
        background:#333;border:1px solid #555;border-radius:5px;
        color:#e8e6e0;cursor:pointer;font-family:monospace;
      ">Close</button>
    `;
    this._el.style.display = 'block';
    this._el.querySelectorAll('.career-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        sim.career?.changeTrack(opt.dataset.track);
        this.close();
        bus.emit('story:entry', { text: `💼 ${sim.name} starts a new career as ${CAREER_TRACKS[opt.dataset.track].label}.` });
      });
    });
    document.getElementById('cp-close')?.addEventListener('click', () => this.close());
  }

  close()  { this._el.style.display = 'none'; }
  toggle() { this._el.style.display === 'none' ? this.open() : this.close(); }
}
