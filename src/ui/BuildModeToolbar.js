/**
 * BuildModeToolbar — Sprint 5
 * HTML toolbar for Build Mode sub-tools.
 * Shown/hidden when buildMode.active changes (buildMode:changed event).
 *
 * Buttons: Furniture | Wall | Door | Eraser | Exit Build Mode
 * Also shows current §budget and weather state.
 *
 * DOM anchor: <div id="build-toolbar">
 */
import { bus }          from '../core/EventBus.js';
import { budgetSystem } from '../systems/BudgetSystem.js';
import { weatherSystem } from '../systems/WeatherSystem.js';

const TOOL_BUTTONS = [
  { id: 'furniture', label: '🛋 Furniture', title: 'Place furniture' },
  { id: 'wall',      label: '🧱 Wall',      title: 'Draw walls (§250/seg)' },
  { id: 'door',      label: '🚪 Door',      title: 'Place door (§500)' },
  { id: 'eraser',    label: '🧹 Erase',     title: 'Remove wall or door' },
];

export class BuildModeToolbar {
  /**
   * @param {object}         game
   * @param {BuildModeWalls} buildWalls
   */
  constructor(game, buildWalls) {
    this._game = game;
    this._bw   = buildWalls;
    this._el   = document.getElementById('build-toolbar');
    if (!this._el) return;

    bus.on('buildMode:changed',  ({ active }) => {
      this._el.style.display = active ? 'flex' : 'none';
    });
    bus.on('buildMode:toolChanged', ({ tool }) => this._highlightTool(tool));
    bus.on('budget:changed',     () => this._updateFunds());
    bus.on('weather:changed',    () => this._updateWeather());
    bus.on('weather:lightUpdate',() => {})  // no-op, avoid spam

    this._render();
  }

  _render() {
    if (!this._el) return;
    const funds   = budgetSystem.funds;
    const weather = weatherSystem.current;
    const wIcon   = { sunny:'☀️', cloudy:'⛅', rainy:'🌧️', stormy:'⛈️', foggy:'🌫️' }[weather] ?? '☀️';

    this._el.innerHTML = `
      <span class="bt-weather" title="Weather">${wIcon} ${weather}</span>
      <span class="bt-funds">§${funds.toLocaleString()}</span>
      ${TOOL_BUTTONS.map(b => `
        <button class="bt-btn" data-tool="${b.id}" title="${b.title}">${b.label}</button>
      `).join('')}
      <button class="bt-btn bt-exit" id="bt-exit" title="Exit Build Mode">✕ Exit</button>
    `;

    TOOL_BUTTONS.forEach(b => {
      this._el.querySelector(`[data-tool="${b.id}"]`)?.addEventListener('click', () => {
        this._bw?.setTool(b.id);
        if (b.id === 'furniture') {
          // Open catalogue for furniture selection
          this._game._cataloguePanel?.open();
        }
      });
    });

    document.getElementById('bt-exit')?.addEventListener('click', () => {
      this._game.buildMode?.setActive(false);
      this._bw?.setTool('furniture');
    });
  }

  _highlightTool(tool) {
    this._el?.querySelectorAll('.bt-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
  }

  _updateFunds() {
    const el = this._el?.querySelector('.bt-funds');
    if (el) el.textContent = `§${budgetSystem.funds.toLocaleString()}`;
  }

  _updateWeather() {
    const weather = weatherSystem.current;
    const wIcon   = { sunny:'☀️', cloudy:'⛅', rainy:'🌧️', stormy:'⛈️', foggy:'🌫️' }[weather] ?? '☀️';
    const el = this._el?.querySelector('.bt-weather');
    if (el) el.textContent = `${wIcon} ${weather}`;
  }
}
