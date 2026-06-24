/**
 * Horizontal Sim portrait strip at top-left.
 * Click a portrait to select that Sim. Tooltips show live location/activity
 * (WP6 / M10) so the household roster answers "where is everyone?" at a glance.
 */
import { locationSummary } from '../systems/LocationService.js';

export class SimSelector {
  constructor(sims) {
    this._sims = sims;
    this._buttons = [];
    this._frame = 0;
    this._el = document.getElementById('sim-selector');
    if (!this._el) return;
    sims.forEach((sim, i) => {
      const btn = document.createElement('button');
      btn.className = 'sim-portrait';
      btn.style.background = `#${sim.color.toString(16).padStart(6,'0')}33`;
      btn.style.borderColor = `#${sim.color.toString(16).padStart(6,'0')}`;
      btn.textContent = sim.name.slice(0, 2).toUpperCase();
      btn.title = sim.name;
      btn.addEventListener('click', () => window._game?.selectSimByIndex(i));
      this._el.appendChild(btn);
      this._buttons.push(btn);
    });
  }

  /** Refresh tooltips with live location (throttled — titles only, no layout). */
  update() {
    if (!this._el) return;
    if (this._frame++ % 30 !== 0) return; // ~twice a second at 60fps
    const game = window._game;
    const ctx = { roomDetector: game?.roomDetector, world: game?.world };
    this._sims.forEach((sim, i) => {
      const btn = this._buttons[i];
      if (btn) btn.title = `${sim.name} — ${locationSummary(sim, ctx)}`;
    });
  }
}
