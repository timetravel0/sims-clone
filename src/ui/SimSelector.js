/**
 * Horizontal Sim portrait strip at top-left.
 * Click a portrait to select that Sim. Tooltips show live location/activity
 * (WP6 / M10) so the household roster answers "where is everyone?" at a glance.
 *
 * The strip rebuilds whenever the household roster changes (a child grows up,
 * a partner moves in, or someone dies) so every controllable Sim has an icon —
 * not just the founders present at construction (2026-06-24 report).
 */
import { locationSummary } from '../systems/LocationService.js';
import { bus } from '../core/EventBus.js';

export class SimSelector {
  constructor(sims) {
    this._sims = sims;
    this._buttons = [];
    this._frame = 0;
    this._el = document.getElementById('sim-selector');
    if (!this._el) return;
    this._rebuild();
    // Roster changes → refresh the icons.
    bus.on('sim:spawned',   () => this._rebuild());
    bus.on('sim:despawned', () => this._rebuild());
    bus.on('sim:died',      () => this._rebuild());
    bus.on('population:activated', () => this._rebuild());
  }

  /** (Re)build one portrait per currently controllable household Sim. */
  _rebuild() {
    if (!this._el) return;
    const sims = (window._game?.sims ?? this._sims).filter(s => !s._isVisitor);
    this._el.innerHTML = '';
    this._buttons = [];
    this._roster = sims;
    sims.forEach((sim) => {
      const btn = document.createElement('button');
      btn.className = 'sim-portrait';
      btn.style.background = `#${sim.color.toString(16).padStart(6, '0')}33`;
      btn.style.borderColor = `#${sim.color.toString(16).padStart(6, '0')}`;
      btn.textContent = sim.name.slice(0, 2).toUpperCase();
      btn.title = sim.name;
      btn.addEventListener('click', () => this._selectById(sim.id));
      this._el.appendChild(btn);
      this._buttons.push(btn);
    });
  }

  _selectById(id) {
    const idx = (window._game?.sims ?? []).findIndex(s => s.id === id);
    if (idx >= 0) window._game?.selectSimByIndex?.(idx);
  }

  /** Refresh tooltips with live location (throttled — titles only, no layout). */
  update() {
    if (!this._el) return;
    if (this._frame++ % 30 !== 0) return; // ~twice a second at 60fps
    const game = window._game;
    const ctx = { roomDetector: game?.roomDetector, world: game?.world };
    (this._roster ?? []).forEach((sim, i) => {
      const btn = this._buttons[i];
      if (btn) btn.title = `${sim.name} — ${locationSummary(sim, ctx)}`;
    });
  }
}
