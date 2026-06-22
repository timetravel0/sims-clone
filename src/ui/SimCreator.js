/**
 * SimCreator — Sprint 6
 * Character creation screen shown at first launch (no save in slot 0).
 * Creates 1-4 Sims before starting the game.
 *
 * Steps:
 *   1. Household name
 *   2. For each Sim: name, gender, skintone, hair colour, starting trait x2
 *   3. Confirm → emits simcreator:done { householdName, simDefs }
 *
 * simDef: { name, gender, skintone, hairColor, traits: string[] }
 *
 * DOM anchor: <div id="sim-creator">
 */
import { bus } from '../core/EventBus.js';

const SKIN_TONES  = ['#f1c27d','#e0ac69','#c68642','#8d5524','#4a2912'];
const HAIR_COLORS = ['#1a1008','#6b3a2a','#b5651d','#d4a017','#e8d5b7','#c0392b','#8e44ad','#2980b9','#7f8c8d'];
const ALL_TRAITS  = [
  'Neat','Outgoing','Active','Playful','Nice',
  'Sloppy','Shy','Lazy','Serious','Grouchy',
  'Creative','Logical','Foodie','Bookworm','Romantic',
];
const GENDERS = ['♂ Male','♀ Female','⚧ Other'];

export class SimCreator {
  constructor() {
    this._el          = document.getElementById('sim-creator');
    this._household   = 'The Household';
    this._simDefs     = [this._blankSim()];
    this._editIndex   = 0;
    this._step        = 'household';  // 'household' | 'sims' | 'confirm'
    this._error       = '';
    this._render();
  }

  _blankSim() {
    return { name: 'Sim', gender: '♂ Male', skintone: SKIN_TONES[0],
             hairColor: HAIR_COLORS[0], traits: [] };
  }

  show() { if (this._el) this._el.style.display = 'flex'; this._render(); }
  hide() { if (this._el) this._el.style.display = 'none'; }

  _render() {
    if (!this._el) return;
    this._el.innerHTML = this._buildHTML();
    this._bindEvents();
  }

  _buildHTML() {
    return `
      <div class="sc-modal">
        <div class="sc-header">Create a Household</div>
        <div class="sc-steps">
          <span class="sc-step${this._step==='household'?' active':''}">1 Household</span>
          <span class="sc-sep">›</span>
          <span class="sc-step${this._step==='sims'?' active':''}">2 Sims</span>
          <span class="sc-sep">›</span>
          <span class="sc-step${this._step==='confirm'?' active':''}">3 Confirm</span>
        </div>
        ${this._error ? `<div style="margin:10px 22px 0;padding:8px 10px;border-radius:7px;background:rgba(180,40,40,.18);color:#ffb4b4;font-size:12px">${this._escape(this._error)}</div>` : ''}
        <div class="sc-body">${this._buildBody()}</div>
        <div class="sc-footer">${this._buildFooter()}</div>
      </div>`;
  }

  _buildBody() {
    if (this._step === 'household') {
      return `
        <label class="sc-label">Household Name</label>
        <input id="sc-household" class="sc-input" value="${this._escape(this._household)}" maxlength="32"/>
        <p style="color:#7a7974;font-size:12px;margin-top:8px">Name your family or group.</p>`;
    }
    if (this._step === 'sims') {
      const sim = this._simDefs[this._editIndex];
      const traitCells = ALL_TRAITS.map(t => {
        const sel = sim.traits.includes(t);
        const disabled = !sel && sim.traits.length >= 2;
        return `<button class="sc-trait${sel?' selected':''}${disabled?' disabled':''}" data-trait="${t}">${t}</button>`;
      }).join('');
      const skinCells = SKIN_TONES.map(c =>
        `<button class="sc-swatch${sim.skintone===c?' active':''}" data-type="skin" data-val="${c}" style="background:${c}"></button>`).join('');
      const hairCells = HAIR_COLORS.map(c =>
        `<button class="sc-swatch${sim.hairColor===c?' active':''}" data-type="hair" data-val="${c}" style="background:${c}"></button>`).join('');
      const tabs = this._simDefs.map((s,i) =>
        `<button class="sc-simtab${i===this._editIndex?' active':''}" data-idx="${i}">${this._escape(s.name)}</button>`).join('');

      return `
        <div class="sc-simtabs">${tabs}
          ${ this._simDefs.length < 4 ? '<button id="sc-addsim">➕ Add Sim</button>' : '' }
          ${ this._simDefs.length > 1 ? `<button id="sc-remsim" data-idx="${this._editIndex}">− Remove</button>` : '' }
        </div>
        <div class="sc-form">
          <label class="sc-label">Name</label>
          <input id="sc-simname" class="sc-input" value="${this._escape(sim.name)}" maxlength="20"/>
          <label class="sc-label">Gender</label>
          <div class="sc-radio-row">
            ${GENDERS.map(g => `<button class="sc-radio${sim.gender===g?' active':''}" data-gender="${g}">${g}</button>`).join('')}
          </div>
          <label class="sc-label">Skin Tone</label>
          <div class="sc-swatches">${skinCells}</div>
          <label class="sc-label">Hair Colour</label>
          <div class="sc-swatches">${hairCells}</div>
          <label class="sc-label">Traits (pick 2)</label>
          <div class="sc-traits">${traitCells}</div>
        </div>`;
    }
    if (this._step === 'confirm') {
      const cards = this._simDefs.map(s => `
        <div class="sc-confirm-card">
          <div class="sc-avatar" style="background:${s.skintone};border:3px solid ${s.hairColor}"></div>
          <div><b>${this._escape(s.name)}</b> — ${s.gender.replace(/[^ -]/g,'').trim()}</div>
          <div style="font-size:11px;color:#7a7974">${this._escape(s.traits.join(', ') || 'No traits')}</div>
        </div>`).join('');
      return `
        <div style="text-align:center;margin-bottom:12px">
          <b style="font-size:16px">${this._escape(this._household)}</b>
          <p style="color:#7a7974;font-size:12px;margin-top:4px">${this._simDefs.length} Sim${this._simDefs.length>1?'s':''}</p>
        </div>
        <div class="sc-confirm-grid">${cards}</div>`;
    }
    return '';
  }

  _buildFooter() {
    const prev = this._step !== 'household'
      ? '<button id="sc-back" class="sc-btn-sec">← Back</button>' : '';
    const next = this._step === 'confirm'
      ? '<button id="sc-start" class="sc-btn-pri">🎲 Start Game</button>'
      : '<button id="sc-next" class="sc-btn-pri">Next →</button>';
    return `<div class="sc-footer-inner">${prev}${next}</div>`;
  }

  _bindEvents() {
    // Household step
    document.getElementById('sc-household')?.addEventListener('input', e => {
      this._household = e.target.value || 'The Household';
    });
    // Navigation
    document.getElementById('sc-next')?.addEventListener('click', () => this._advance());
    document.getElementById('sc-back')?.addEventListener('click', () => this._back());
    document.getElementById('sc-start')?.addEventListener('click', () => this._finish());
    // Sim tabs
    this._el.querySelectorAll('.sc-simtab').forEach(b =>
      b.addEventListener('click', () => { this._editIndex = +b.dataset.idx; this._render(); }));
    document.getElementById('sc-addsim')?.addEventListener('click', () => {
      this._simDefs.push(this._blankSim());
      this._editIndex = this._simDefs.length - 1;
      this._render();
    });
    document.getElementById('sc-remsim')?.addEventListener('click', () => {
      this._simDefs.splice(this._editIndex, 1);
      this._editIndex = Math.max(0, this._editIndex - 1);
      this._render();
    });
    // Sim form
    document.getElementById('sc-simname')?.addEventListener('input', e => {
      this._simDefs[this._editIndex].name = e.target.value || 'Sim';
      this._el.querySelectorAll('.sc-simtab')[this._editIndex]?.textContent !== undefined &&
        (this._el.querySelectorAll('.sc-simtab')[this._editIndex].textContent = e.target.value || 'Sim');
    });
    this._el.querySelectorAll('[data-gender]').forEach(b =>
      b.addEventListener('click', () => { this._simDefs[this._editIndex].gender = b.dataset.gender; this._render(); }));
    this._el.querySelectorAll('.sc-swatch').forEach(b =>
      b.addEventListener('click', () => {
        if (b.dataset.type === 'skin') this._simDefs[this._editIndex].skintone  = b.dataset.val;
        else                          this._simDefs[this._editIndex].hairColor = b.dataset.val;
        this._render();
      }));
    this._el.querySelectorAll('.sc-trait').forEach(b => {
      if (b.classList.contains('disabled')) return;
      b.addEventListener('click', () => {
        const sim = this._simDefs[this._editIndex];
        const t   = b.dataset.trait;
        if (sim.traits.includes(t)) sim.traits = sim.traits.filter(x => x !== t);
        else if (sim.traits.length < 2) sim.traits.push(t);
        this._render();
      });
    });
  }

  _advance() {
    this._error = '';
    if (this._step === 'household') this._step = 'sims';
    else if (this._step === 'sims') this._step = 'confirm';
    this._render();
  }
  _back() {
    this._error = '';
    if (this._step === 'sims') this._step = 'household';
    else if (this._step === 'confirm') this._step = 'sims';
    this._render();
  }
  _finish() {
    try {
      bus.emit('simcreator:done', {
        householdName: this._household,
        simDefs: this._simDefs,
      });
      this.hide();
    } catch (err) {
      console.error('[SimCreator] failed to start game', err);
      this._error = err?.message ?? String(err);
      this._render();
    }
  }

  _escape(text) {
    return String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
}
