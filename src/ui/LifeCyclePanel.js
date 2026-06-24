/**
 * LifeCyclePanel — Sprint 3
 *
 * Shows:
 *  - Life stage badge + age
 *  - Career (name, level, simoleons)
 *  - Skills progress bars (5 skills)
 *  - Today's schedule as a timeline
 *  - Career picker
 *
 * Mounted to the #lifecycle-panel DOM element (appended to body by this class).
 */

import { bus }     from '../core/EventBus.js';
import { CAREERS } from '../systems/CareerSystem.js';
import { educationLabel } from '../config/familyRules.js';
import { describeLocation } from '../systems/LocationService.js';
import { pickTreatment } from '../config/treatments.js';

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const SKILL_LABELS = { creativity:'🎨 Creativity', logic:'🔬 Logic', cooking:'🍳 Cooking', fitness:'💪 Fitness', charisma:'💬 Charisma' };

export class LifeCyclePanel {
  constructor(game) {
    this._game = game;
    this._visible = false;
    this._el = this._buildDOM();
    document.body.appendChild(this._el);

    // Update whenever sim is selected or career/age data changes
    bus.on('sim:selected',       () => this._render());
    bus.on('lifecycle:stageChanged', () => this._render());
    bus.on('career:promoted',    () => this._render());
    bus.on('career:fired',       () => this._render());
    bus.on('career:changed',     () => this._render());
    bus.on('career:switched',    () => this._render());
    bus.on('career:skillGain',   () => this._render());
    bus.on('health:stateChanged',() => this._render());
    bus.on('family:childBorn',   () => this._render());
    bus.on('family:partnerChanged',() => this._render());
    bus.on('career:shiftEnd',    () => this._render());
    bus.on('goal:completed',          () => this._render());
    bus.on('household:goalProgress',  () => this._render());
    bus.on('household:goalCompleted', () => this._render());
    bus.on('daynight:update',    () => this._renderSchedule());
  }

  // ── DOM skeleton ──────────────────────────────────────────────────────────

  _buildDOM() {
    const el = document.createElement('div');
    el.id = 'lifecycle-panel';
    el.style.cssText = [
      'display:none',
      'position:fixed',
      'bottom:48px',
      'left:450px',
      'z-index:60',
      'width:280px',
      'background:rgba(14,13,11,0.93)',
      'backdrop-filter:blur(10px)',
      'border:1px solid rgba(255,255,255,0.1)',
      'border-radius:10px',
      'padding:14px 16px',
      'color:#ddd',
      'font-size:12px',
      'font-family:system-ui,sans-serif',
      'user-select:none',
    ].join(';');
    return el;
  }

  // ── render ────────────────────────────────────────────────────────────────

  _render() {
    if (!this._visible) return;
    const sim = this._game.selectedSim;
    if (!sim) { this._el.innerHTML = '<p style="color:#666">No Sim selected</p>'; return; }

    const age    = this._game.ageSystem?.getInfo(sim.id);
    const career = this._game.careerSystem?.getInfo(sim.id);

    let html = '';

    // ── Header ──
    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">`;
    html += `<h3 style="color:#eee;font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin:0">📋 Life Cycle</h3>`;
    html += `<button id="lcp-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:14px;padding:0">✕</button>`;
    html += `</div>`;

    // ── Life stage ──
    if (age) {
      const stageColor = age.stage.color;
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">`;
      html += `<span style="background:${stageColor};color:#111;font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px">${age.stage.label}</span>`;
      html += `<span style="color:#aaa">${age.ageYears} years old</span>`;
      const edu = this._game.population?.getPerson?.(sim.id)?.education ?? 0;
      html += `<span style="color:#9fa8da" title="Education level">🎓 ${educationLabel(edu)}</span>`;
      html += `</div>`;
    }

    // ── Location ("where & why") ──
    const loc = describeLocation(sim, { roomDetector: this._game.roomDetector, world: this._game.world });
    const whereLabel = loc.mode === 'on_lot'
      ? `${loc.roomType}${loc.gx != null ? ` (${loc.gx},${loc.gz})` : ''}`
      : loc.mode;
    html += `<div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:8px 10px;margin-bottom:10px">`;
    html += `<div style="color:#80cbc4;font-weight:700">📍 ${whereLabel}</div>`;
    html += `<div style="color:#aaa">${loc.activity}${loc.reason ? ` · ${loc.reason}` : ''}</div>`;
    if (loc.objectLabel) html += `<div style="color:#888;font-size:11px">near ${loc.objectLabel}</div>`;
    html += `</div>`;

    // ── Career ──
    if (career) {
      const c = career.career;
      const person = this._game.population?.getPerson?.(sim.id);
      html += `<div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:8px 10px;margin-bottom:10px">`;
      html += `<div style="display:flex;justify-content:space-between;align-items:center">`;
      html += `<span style="color:#eee;font-weight:700">${c.emoji} ${c.label}</span>`;
      html += `<span style="color:#ffd580">Lv.${career.level}</span>`;
      html += `</div>`;
      html += `<div style="display:flex;justify-content:space-between;margin-top:4px;color:#aaa">`;
      html += `<span>💰 §${Math.floor(career.simoleons).toLocaleString()}</span>`;
      html += career.atWork ? `<span style="color:#81c784">▶ At Work</span>` : `<span style="color:#888">🏠 Home</span>`;
      html += `</div>`;
      if (person?.health) {
        const hp = person.health.state === 'healthy' ? 'Healthy' : `${person.health.state} · ${person.health.illness ?? 'unknown'}`;
        html += `<div style="margin-top:4px;color:${person.health.state === 'healthy' ? '#9ccc65' : '#ffab91'}">Health: ${hp}</div>`;
        if (person.health.state !== 'healthy') {
          const tr = pickTreatment(person.health.illness ?? '', person.health.severity ?? 0, this._game.budgetSystem?.funds ?? 0);
          const booked = this._game.doctor?._pending?.has?.(sim.id);
          html += booked
            ? `<div style="margin-top:4px;color:#80cbc4">🩺 Visita medica in arrivo…</div>`
            : `<button id="lcp-doctor" style="margin-top:6px;background:#2a4a5a;border:1px solid #3a6a7a;color:#cde;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px">🩺 Chiama il dottore${tr ? ` (${tr.label} −§${tr.cost})` : ' (fondi insufficienti)'}</button>`;
        }
      }
      if (person) {
        const partner = this._game.population?.getPerson?.(person.partnerId)?.name ?? '—';
        const kids = (person.childIds ?? []).length;
        html += `<div style="margin-top:4px;color:#aaa">Family: partner ${partner} · children ${kids}</div>`;
      }
      html += `</div>`;

      // Household goal
      const hg = this._game.householdGoalSystem?.progress;
      if (hg) {
        const pct = Math.round((hg.days / hg.target) * 100);
        html += `<div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:8px 10px;margin-bottom:10px">`;
        html += `<div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Obiettivo Famiglia</div>`;
        html += `<div style="font-size:10px;color:#aaa;margin-bottom:4px">Benessere ≥${hg.score}% · ${hg.days}/${hg.target} giorni${hg.status === 'completed' ? ' ✓' : ''}</div>`;
        html += `<div style="height:5px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">`;
        html += `<div style="width:${pct}%;height:100%;background:#f0c040;border-radius:3px;transition:width .3s"></div>`;
        html += `</div></div>`;
      }

      // Skills
      html += `<div style="margin-bottom:10px">`;
      html += `<div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Skills</div>`;
      for (const [key, label] of Object.entries(SKILL_LABELS)) {
        const val = career.skills?.[key] ?? 0;
        const pct = (val / 10) * 100;
        html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">`;
        html += `<span style="width:90px;color:#bbb;font-size:10px">${label}</span>`;
        html += `<div style="flex:1;height:5px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">`;
        html += `<div style="width:${pct}%;height:100%;background:#4fc3f7;border-radius:3px;transition:width .3s"></div>`;
        html += `</div>`;
        html += `<span style="width:22px;text-align:right;color:#777;font-size:10px">${val.toFixed(1)}</span>`;
        html += `</div>`;
      }
      html += `</div>`;

      // Active goals with progress
      const goals = sim.brain?.goalSystem?.activeGoals?.() ?? [];
      if (goals.length > 0) {
        html += `<div style="margin-bottom:10px">`;
        html += `<div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Goals</div>`;
        for (const g of goals) {
          const pct = Math.round((g.progress ?? 0) * 100);
          const bar = `<div style="flex:1;height:5px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:#ffd580;border-radius:3px;transition:width .3s"></div></div>`;
          html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">`;
          html += `<span style="width:110px;color:#bbb;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.label ?? g.type}</span>`;
          html += bar;
          html += `<span style="width:28px;text-align:right;color:#777;font-size:10px">${pct}%</span>`;
          html += `</div>`;
        }
        html += `</div>`;
      }

      // Career picker
      html += `<div style="margin-bottom:10px">`;
      html += `<div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Change Career</div>`;
      html += `<select id="lcp-career-select" style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#eee;padding:4px 8px;font-size:11px">`;
      for (const c of CAREERS) {
        const selected = c.id === career.careerId ? 'selected' : '';
        const req = c.requiredSkill ? Object.entries(c.requiredSkill).map(([k,v])=>`${k}≥${v}`).join(' ') : '';
        html += `<option value="${c.id}" ${selected}>${c.emoji} ${c.label}${req?' ('+req+')':''}  §${c.salaryPerDay}/day</option>`;
      }
      html += `</select>`;
      html += `</div>`;
    }

    // ── Schedule ──
    html += `<div id="lcp-schedule"></div>`;

    this._el.innerHTML = html;

    // Bind close
    this._el.querySelector('#lcp-close')?.addEventListener('click', () => this.toggle());

    // Bind career picker
    this._el.querySelector('#lcp-career-select')?.addEventListener('change', e => {
      const sim = this._game.selectedSim;
      if (sim) this._game.careerSystem?.switchCareer(sim.id, e.target.value);
    });

    // Bind doctor call
    this._el.querySelector('#lcp-doctor')?.addEventListener('click', () => {
      const sim = this._game.selectedSim;
      if (sim) { this._game.doctor?.book(sim.id); this._render(); }
    });

    this._renderSchedule();
  }

  _renderSchedule() {
    const el = this._el.querySelector('#lcp-schedule');
    if (!el) return;
    const sim = this._game.selectedSim;
    if (!sim) return;

    const day   = Math.floor(this._game.dayNight?.totalDays ?? 0) % 7;
    const hour  = this._game.clock.hour;
    const slots = this._game.scheduleSystem?.getSchedule(sim.id) ?? [];
    const todaySlots = slots.filter(s => s.day === day).sort((a,b) => a.startHour - b.startHour);

    let html = `<div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Today's Schedule (${DAY_LABELS[day]})</div>`;
    if (todaySlots.length === 0) {
      html += `<p style="color:#555;font-size:11px">No scheduled activities</p>`;
    } else {
      html += `<div style="display:flex;flex-direction:column;gap:4px;max-height:120px;overflow:auto">`;
      for (const s of todaySlots) {
        const active = hour >= s.startHour && (s.endHour > s.startHour ? hour < s.endHour : (hour >= s.startHour || hour < s.endHour));
        const bg = active ? 'rgba(79,195,247,0.15)' : 'rgba(255,255,255,0.04)';
        const border = active ? '1px solid rgba(79,195,247,0.4)' : '1px solid rgba(255,255,255,0.07)';
        html += `<div style="display:grid;grid-template-columns:55px 1fr;align-items:center;gap:6px;padding:3px 7px;border-radius:5px;background:${bg};border:${border}">`;
        html += `<span style="color:#777;font-size:10px">${s.startHour}:00–${s.endHour}:00</span>`;
        html += `<span style="color:${active?'#4fc3f7':'#aaa'};font-size:11px">${s.label}</span>`;
        html += `</div>`;
      }
      html += `</div>`;
    }
    el.innerHTML = html;
  }

  // ── toggle ────────────────────────────────────────────────────────────────

  toggle() {
    this._visible = !this._visible;
    this._el.style.display = this._visible ? 'block' : 'none';
    if (this._visible) this._render();
  }

  show()  { this._visible = true;  this._el.style.display = 'block';  this._render(); }
  hide()  { this._visible = false; this._el.style.display = 'none'; }
}
