/**
 * CareerPanel — Sprint 6
 * Panel for viewing and changing a Sim's career.
 *
 * Shows:
 *   - Current job (career, level, performance bar)
 *   - Daily salary
 *   - Work hours
 *   - Required skill with current level
 *   - Available careers grid with cost/salary info
 *   - Quit Job button
 *
 * DOM anchor: <div id="career-panel">
 * Triggered by: clicking the briefcase icon in the Sim HUD.
 */
import { bus }          from '../core/EventBus.js';
import { CAREERS } from '../systems/CareerSystem.js';
import { budgetSystem } from '../systems/BudgetSystem.js';

const JOB_SEARCH_COST = 0;  // free to change jobs

export class CareerPanel {
  /**
   * @param {object} game
   */
  constructor(game) {
    this._game = game;
    this._el   = document.getElementById('career-panel');
    this._sim  = null;   // currently viewed Sim

    bus.on('sim:selected',   ({ sim }) => { this._sim = sim; if (this.isOpen()) this._render(); });
    bus.on('career:levelUp', () => { if (this.isOpen()) this._render(); });
    bus.on('career:salary',  () => { /* could flash salary */ });
  }

  open(sim = null) {
    if (sim) this._sim = sim;
    if (!this._sim) this._sim = this._game.sims?.[0];
    if (this._el) this._el.style.display = 'flex';
    this._render();
  }
  close()  { if (this._el) this._el.style.display = 'none'; }
  isOpen() { return this._el?.style.display === 'flex'; }

  _render() {
    if (!this._el || !this._sim) return;
    const sim   = this._sim;
    const system = this._game.careerSystem;
    const state = system?.getState(sim.id);
    const funds = budgetSystem.funds;

    const currentBlock = state ? (() => {
      const c    = CAREERS.find(c => c.id === state.careerId) ?? CAREERS[0];
      const sal  = c.salaryBase + (state.level - 1) * c.salaryPerLevel;
      const perf = state.performance;
      const firstShift = c.shifts?.[0];
      const ws = firstShift?.start ?? 0;
      const we = firstShift?.end ?? 0;
      const stress = state.stress ?? 0;
      const stressColor = stress >= 80 ? '#e57373' : stress >= 50 ? '#ffb74d' : '#81c784';
      return `
        <div class="cp-current">
          <div class="cp-career-name">${c.icon} ${c.label} — Level ${state.level} / ${c.levels}</div>
          <div class="cp-meta">Daily salary: <b>§${sal.toLocaleString()}</b> &bull; Hours: ${ws}:00-${we}:00 &bull; Skill: ${c.skillRequired ?? 'none'}</div>
          <div class="cp-perf-bar"><div class="cp-perf-fill" style="width:${perf}%"></div></div>
          <div class="cp-perf-label">Performance: ${perf}%</div>
          <div class="cp-perf-bar"><div class="cp-perf-fill" style="width:${stress}%;background:${stressColor}"></div></div>
          <div class="cp-perf-label">Work stress: ${stress}%</div>
          <button class="cp-quit-btn">Quit Job</button>
        </div>`;
    })() : '<div class="cp-unemployed">📋 Unemployed — choose a career below.</div>';

    const grid = CAREERS.map(c => {
      const active = state?.careerId === c.id;
      const salMin = c.salaryBase;
      const salMax = c.salaryBase + (c.levels - 1) * c.salaryPerLevel;
      const firstShift = c.shifts?.[0];
      return `
        <div class="cp-card${active ? ' active' : ''}" data-career="${c.id}">
          <div class="cp-card-icon">${c.icon}</div>
          <div class="cp-card-name">${c.label}</div>
          <div class="cp-card-sal">§${salMin.toLocaleString()}–§${salMax.toLocaleString()}/day</div>
          <div class="cp-card-hours">${firstShift ? `${firstShift.start}:00-${firstShift.end}:00` : 'No shifts'}</div>
          ${active ? '<div class="cp-badge">Current</div>' : `<button class="cp-join-btn" data-career="${c.id}">${state?.careerId === 'unemployed' ? 'Join' : 'Switch'}</button>`}
        </div>`;
    }).join('');

    this._el.innerHTML = `
      <div class="cp-modal">
        <div class="cp-header">
          <span>💼 Career — ${sim.name}</span>
          <span class="cp-funds">§${funds.toLocaleString()}</span>
          <button id="cp-close">✕</button>
        </div>
        <div class="cp-body">
          ${currentBlock}
          <h3 style="margin:12px 0 8px;font-size:13px;color:#7a7974">Available Careers</h3>
          <div class="cp-grid">${grid}</div>
        </div>
      </div>`;

    document.getElementById('cp-close')?.addEventListener('click', () => this.close());
    this._el.querySelector('.cp-quit-btn')?.addEventListener('click', () => {
      system?.quit(sim.id);
      this._render();
    });
    this._el.querySelectorAll('.cp-join-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state?.careerId && state.careerId !== 'unemployed') system?.switchCareer(sim.id, btn.dataset.career);
        else system?.assign(sim.id, btn.dataset.career);
        this._render();
      });
    });
  }
}
