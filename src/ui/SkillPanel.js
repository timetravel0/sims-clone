/**
 * SkillPanel — Sprint 4
 * HTML overlay panel showing all 6 skills for the selected Sim.
 * Updates on: sim:selected, skill:levelUp
 * DOM anchor: <div id="skill-panel"> (added to index.html in this sprint)
 */
import { bus }         from '../core/EventBus.js';
import { skillSystem, SKILLS } from '../systems/SkillSystem.js';

const SKILL_ICONS = {
  cooking:    '🍳',
  logic:      '🧩',
  charisma:   '💬',
  fitness:    '💪',
  creativity: '🎨',
  handiness:  '🔧',
};

const SKILL_COLORS = {
  cooking:    '#f97316',
  logic:      '#6366f1',
  charisma:   '#ec4899',
  fitness:    '#22c55e',
  creativity: '#eab308',
  handiness:  '#64748b',
};

export class SkillPanel {
  constructor(game) {
    this._game = game;
    this._el   = document.getElementById('skill-panel');
    this._sim  = game.selectedSim;

    bus.on('sim:selected', ({ sim }) => {
      this._sim = sim;
      this._render();
    });
    bus.on('skill:levelUp', ({ sim }) => {
      if (sim === this._sim) this._render();
    });

    this._render();
  }

  _render() {
    if (!this._el || !this._sim) return;
    const skills = skillSystem.getSkills(this._sim);

    const rows = SKILLS.map(s => {
      const val   = skills[s] ?? 0;
      const level = Math.floor(val);
      const frac  = val - level;
      const pct   = ((level + frac) / 10) * 100;
      const color = SKILL_COLORS[s];
      return `
        <div class="skill-row">
          <span class="skill-icon">${SKILL_ICONS[s]}</span>
          <span class="skill-name">${s}</span>
          <div class="skill-bar-track">
            <div class="skill-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div>
          </div>
          <span class="skill-level">${level}</span>
        </div>`;
    }).join('');

    this._el.innerHTML = `
      <div class="panel-header">
        <span>⚙ Skills — ${this._sim.name}</span>
        <button id="btn-skill-close" title="Close">✕</button>
      </div>
      <div class="skill-list">${rows}</div>`;

    document.getElementById('btn-skill-close')?.addEventListener('click', () => {
      this._el.style.display = 'none';
      document.getElementById('btn-skills')?.classList.remove('active');
    });
  }

  isOpen() {
    return this._el?.style.display === 'block';
  }
}
