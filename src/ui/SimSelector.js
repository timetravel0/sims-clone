/**
 * Horizontal Sim portrait strip at top-left.
 * Click a portrait to select that Sim.
 */
export class SimSelector {
  constructor(sims) {
    this._sims = sims;
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
    });
  }
}
