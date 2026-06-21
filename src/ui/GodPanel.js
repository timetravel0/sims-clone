import { bus } from '../core/EventBus.js';

const INTENTS = [
  ['eat', 'Eat'],
  ['rest', 'Rest'],
  ['clean', 'Clean'],
  ['have_fun', 'Fun'],
  ['comfort', 'Comfort'],
  ['socialize', 'Socialize'],
  ['argue', 'Argue'],
];
const TRAITS = [
  ['outgoing', 'Outgoing'],
  ['neurotic', 'Neurotic'],
  ['playful', 'Playful'],
  ['nice', 'Nice'],
  ['ambitious', 'Ambitious'],
];
const EVENTS = [
  ['promoted', 'Promoted'],
  ['fired', 'Fired'],
  ['heartbreak', 'Heartbreak'],
  ['windfall', 'Windfall'],
];

export class GodPanel {
  constructor(game) {
    this._game = game;
    this._el = document.getElementById('god-panel');
    this._btn = document.getElementById('btn-god');
    if (!this._el) return;
    this._render();
    this._bind();
    bus.on('sim:selected', ({ sim }) => this._setSim(sim));
    this._setSim(game.selectedSim);
  }

  _render() {
    this._el.innerHTML = `
      <h3>God Mode</h3>
      <div class="god-target" id="god-target">Sim</div>
      <label>Intent</label>
      <select id="god-intent">${INTENTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <div class="god-row">
        <button id="god-whisper">Whisper</button>
        <button id="god-impose">Impose</button>
      </div>
      <label>Trait</label>
      <select id="god-trait">${TRAITS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <div class="god-row">
        <button id="god-bless">Bless</button>
        <button id="god-curse">Curse</button>
      </div>
      <label>Life Event</label>
      <select id="god-event">${EVENTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <button id="god-life">Inject Event</button>
    `;
  }

  _bind() {
    this._btn?.addEventListener('click', () => this.toggle());
    this._el.querySelector('#god-whisper')?.addEventListener('click', () => {
      this._game.godMode.whisper(this._game.selectedSim, this._value('god-intent'));
    });
    this._el.querySelector('#god-impose')?.addEventListener('click', () => {
      this._game.godMode.impose(this._game.selectedSim, this._value('god-intent'));
    });
    this._el.querySelector('#god-bless')?.addEventListener('click', () => {
      this._game.godMode.bless(this._game.selectedSim, this._value('god-trait'));
    });
    this._el.querySelector('#god-curse')?.addEventListener('click', () => {
      this._game.godMode.curse(this._game.selectedSim, this._value('god-trait'));
    });
    this._el.querySelector('#god-life')?.addEventListener('click', () => {
      this._game.godMode.lifeEvent(this._game.selectedSim, this._value('god-event'));
    });
  }

  _value(id) {
    return this._el.querySelector(`#${id}`)?.value;
  }

  _setSim(sim) {
    const target = this._el?.querySelector('#god-target');
    if (target && sim) target.textContent = sim.name;
  }

  toggle() {
    const visible = this._el.style.display === 'block';
    this._el.style.display = visible ? 'none' : 'block';
    this._btn?.classList.toggle('active', !visible);
  }
}
