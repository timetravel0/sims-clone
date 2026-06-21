/**
 * LifePanel — fixed overlay (top-right) showing:
 *   • Sim name, age, life stage
 *   • Career track, level, salary, at-work indicator
 *   • Skill bars (primary skills highlighted)
 *   • Calendar: week, day, weekend flag, last event
 *
 * Toggled via toolbar button #btn-life.
 */
import { bus } from '../core/EventBus.js';

export class LifePanel {
  constructor(game) {
    this._game = game;
    this._sim  = game.selectedSim;
    this._el   = this._build();
    document.body.appendChild(this._el);
    this._subscribe();
    this.refresh();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'life-panel';
    el.style.cssText = [
      'position:fixed','top:60px','right:10px',
      'width:240px','background:rgba(20,18,14,0.93)',
      'border:1px solid #444','border-radius:8px',
      'padding:12px','color:#e8e6e0','font-size:12px',
      'font-family:monospace','z-index:200',
      'display:none','user-select:none',
    ].join(';');
    el.innerHTML = '<div id="lp-content"></div>';
    return el;
  }

  show(on) { this._el.style.display = on ? 'block' : 'none'; }
  toggle() { this.show(this._el.style.display === 'none'); }

  _subscribe() {
    bus.on('sim:selected',          ({ sim }) => { this._sim = sim; this.refresh(); });
    bus.on('lifecycle:birthday',    () => this.refresh());
    bus.on('lifecycle:stageChange', () => this.refresh());
    bus.on('career:promotion',      () => this.refresh());
    bus.on('career:skillTrained',   () => this.refresh());
    bus.on('career:trackChanged',   () => this.refresh());
    bus.on('calendar:newDay',       () => this.refresh());
    bus.on('calendar:event',        ({ label }) => {
      const node = document.getElementById('lp-cal-event');
      if (node) { node.textContent = `📅 ${label}`; setTimeout(() => { if (node) node.textContent = ''; }, 4000); }
    });
  }

  refresh() {
    const content = document.getElementById('lp-content');
    if (!content || !this._sim) return;
    const sim      = this._sim;
    const lc       = sim.lifeCycle;
    const career   = sim.career;
    const calendar = this._game.calendar;
    if (!lc || !career || !calendar) return;

    const si = lc.stageInfo;
    const ti = career.trackInfo;
    const skillBars = Object.entries(career.skills).map(([name, val]) => {
      const primary = ti.skills.includes(name);
      return `<div style="margin:2px 0">
        <span style="color:${primary ? '#ffd54f' : '#777'}">${name}</span>
        <div style="background:#333;border-radius:3px;height:5px;margin-top:2px">
          <div style="background:${primary ? '#ffd54f' : '#555'};width:${val}%;height:100%;border-radius:3px"></div>
        </div></div>`;
    }).join('');

    content.innerHTML = `
      <div style="font-weight:bold;font-size:13px;margin-bottom:8px;color:#ffd54f">
        ${si.emoji} ${sim.name}
      </div>
      <div style="margin-bottom:6px">
        <span style="color:#aaa">Age:</span> ${lc.age}
        &nbsp;<span style="background:#333;padding:1px 5px;border-radius:3px">${si.label}</span>
      </div>
      <hr style="border-color:#333;margin:6px 0">
      <div style="margin-bottom:4px;color:#a5d6a7">💼 Career</div>
      <div><span style="color:#aaa">Track:</span> ${ti.emoji} ${ti.label}</div>
      <div><span style="color:#aaa">Level:</span> ${career.level}/10</div>
      <div><span style="color:#aaa">Salary:</span> §${career.salary}/day</div>
      ${career.atWork ? '<div style="color:#ef9a9a">⏳ At work…</div>' : ''}
      <div style="margin-top:6px;color:#90caf9">🎯 Skills</div>
      ${skillBars}
      <hr style="border-color:#333;margin:6px 0">
      <div style="color:#ce93d8">📅 Calendar</div>
      <div>Week ${calendar.week} — ${calendar.dayName}</div>
      ${calendar.isWeekend ? '<div style="color:#ffd54f">🎊 Weekend!</div>' : ''}
      <div id="lp-cal-event" style="color:#4fc3f7;min-height:16px"></div>
    `;
  }
}
