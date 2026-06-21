/**
 * CareerSystem — Sprint 3
 *
 * Careers give Sims a job, skill progress, salary and a daily work schedule.
 * When a Sim is "at work" their needs decay at the normal rate but they
 * cannot take actions — the brain is locked until the shift ends.
 *
 * Careers:
 *   unemployed  / artist / scientist / chef / programmer / athlete
 *
 * Skills (per Sim): creativity, logic, cooking, fitness, charisma
 * Each skill grows while using the matching furniture (bookshelf→logic,
 * piano→creativity, …) at 0.5 pts/sec, max 10.
 */

import { bus } from '../core/EventBus.js';

export const CAREERS = [
  {
    id: 'unemployed', label: 'Unemployed', emoji: '🏠',
    salaryPerDay: 0, requiredSkill: null,
    shifts: [],
  },
  {
    id: 'artist', label: 'Artist', emoji: '🎨',
    salaryPerDay: 120, requiredSkill: { creativity: 3 },
    shifts: [{ start: 9, end: 15, days: [1,2,3,4,5] }],
    promotionBonus: { creativity: 5 },
  },
  {
    id: 'scientist', label: 'Scientist', emoji: '🔬',
    salaryPerDay: 200, requiredSkill: { logic: 4 },
    shifts: [{ start: 8, end: 16, days: [1,2,3,4,5] }],
    promotionBonus: { logic: 5 },
  },
  {
    id: 'chef', label: 'Chef', emoji: '👨‍🍳',
    salaryPerDay: 160, requiredSkill: { cooking: 3 },
    shifts: [{ start: 11, end: 20, days: [2,3,4,5,6] }],
    promotionBonus: { cooking: 5 },
  },
  {
    id: 'programmer', label: 'Programmer', emoji: '💻',
    salaryPerDay: 250, requiredSkill: { logic: 5 },
    shifts: [{ start: 9, end: 17, days: [1,2,3,4,5] }],
    promotionBonus: { logic: 6 },
  },
  {
    id: 'athlete', label: 'Athlete', emoji: '🏋️',
    salaryPerDay: 180, requiredSkill: { fitness: 5 },
    shifts: [{ start: 6, end: 10, days: [1,2,3,4,5,6] }],
    promotionBonus: { fitness: 6 },
  },
];

const SKILL_NAMES = ['creativity', 'logic', 'cooking', 'fitness', 'charisma'];

// Objects that teach skills (matched by ObjectRegistry id)
const OBJECT_SKILL_MAP = {
  piano:      'creativity',
  bookshelf:  'logic',
  desk:       'logic',
  stove:      'cooking',
  fridge:     'cooking',
  gym_equipment: 'fitness',
  bar:        'charisma',
  tv:         'charisma',
};

export class CareerSystem {
  constructor(game) {
    this._game = game;
    /** @type {Map<string, CareerState>} */
    this._state = new Map();

    for (const sim of game.sims) {
      this._state.set(sim.id, {
        careerId:    'unemployed',
        level:       1,        // 1-10
        simoleons:   500,      // starting money
        skills:      Object.fromEntries(SKILL_NAMES.map(s => [s, 0])),
        atWork:      false,
        daysPaid:    0,
        lastPayDay:  0,        // sim-hour of last pay
      });
    }

    // Listen for object-use events to award skill XP
    bus.on('sim:usingObject', ({ simId, objectId, dt }) => {
      this._awardSkill(simId, objectId, dt);
    });

    // Listen for life events from GodMode
    bus.on('life:event', ({ sim, type }) => {
      if (type === 'promoted')  this._promote(sim.id);
      if (type === 'fired')     this._fire(sim.id);
    });
  }

  // ── update ────────────────────────────────────────────────────────────────

  update(scaledDt) {
    const hour = this._game.clock.hour;
    const day  = Math.floor(this._game.dayNight?.totalDays ?? 0);

    for (const sim of this._game.sims) {
      const s = this._state.get(sim.id);
      if (!s) continue;
      const career = CAREERS.find(c => c.id === s.careerId);
      if (!career || career.shifts.length === 0) { s.atWork = false; continue; }

      const wasAtWork = s.atWork;
      s.atWork = career.shifts.some(sh => {
        const isWorkDay = sh.days.includes(day % 7);
        return isWorkDay && hour >= sh.start && hour < sh.end;
      });

      if (s.atWork && !wasAtWork) {
        this._onShiftStart(sim, career, s);
      }
      if (!s.atWork && wasAtWork) {
        this._onShiftEnd(sim, career, s);
      }
    }
  }

  // ── shift lifecycle ───────────────────────────────────────────────────────

  _onShiftStart(sim, career, s) {
    sim._atWork = true;   // SimBrain checks this flag
    sim.showBubble(`${career.emoji} Work!`, 3);
    bus.emit('story:entry', { text: `💼 ${sim.name} left for work (${career.label}).`, cat: 'life' });
    bus.emit('career:shiftStart', { sim, career });
  }

  _onShiftEnd(sim, career, s) {
    sim._atWork = false;
    s.simoleons += career.salaryPerDay * (s.level * 0.2 + 0.8);
    s.daysPaid++;
    sim.showBubble('💰 Paid!', 3);
    sim.needs.restore('status', 15);
    bus.emit('story:entry', { text: `💰 ${sim.name} got paid (${career.label} Lv.${s.level}).`, cat: 'life' });
    bus.emit('career:shiftEnd', { sim, career, simoleons: s.simoleons });
    // Auto-promotion: every 5 days paid, if level < 10
    if (s.daysPaid % 5 === 0 && s.level < 10) this._promote(sim.id);
  }

  // ── skill XP ──────────────────────────────────────────────────────────────

  _awardSkill(simId, objectId, dt) {
    const skill = OBJECT_SKILL_MAP[objectId];
    if (!skill) return;
    const s = this._state.get(simId);
    if (!s) return;
    const gain = 0.5 * dt;
    s.skills[skill] = Math.min(10, (s.skills[skill] ?? 0) + gain);
    bus.emit('career:skillGain', { simId, skill, value: s.skills[skill] });
  }

  // ── career management ─────────────────────────────────────────────────────

  joinCareer(simId, careerId) {
    const s = this._state.get(simId);
    if (!s) return false;
    const career = CAREERS.find(c => c.id === careerId);
    if (!career) return false;
    // Check skill requirements
    if (career.requiredSkill) {
      for (const [skill, min] of Object.entries(career.requiredSkill)) {
        if ((s.skills[skill] ?? 0) < min) {
          bus.emit('story:entry', { text: `❌ ${careerId} requires ${skill} ≥ ${min}.`, cat: 'life' });
          return false;
        }
      }
    }
    const prev = s.careerId;
    s.careerId = careerId;
    s.level = 1;
    const sim = this._game.sims.find(x => x.id === simId);
    bus.emit('story:entry', { text: `📋 ${sim?.name} joined career: ${career.label}.`, cat: 'life' });
    bus.emit('career:changed', { simId, from: prev, to: careerId });
    return true;
  }

  _promote(simId) {
    const s = this._state.get(simId);
    if (!s || s.level >= 10) return;
    s.level = Math.min(10, s.level + 1);
    const sim = this._game.sims.find(x => x.id === simId);
    const career = CAREERS.find(c => c.id === s.careerId);
    sim?.needs.restore('status', 20);
    bus.emit('story:entry', { text: `🚀 ${sim?.name} was promoted to ${career?.label} Lv.${s.level}!`, cat: 'life' });
    bus.emit('career:promoted', { simId, level: s.level });
  }

  _fire(simId) {
    const s = this._state.get(simId);
    if (!s) return;
    const prev = s.careerId;
    s.careerId = 'unemployed';
    s.level = 1;
    const sim = this._game.sims.find(x => x.id === simId);
    sim?._atWork && (sim._atWork = false);
    sim?.needs.decay('status', 25);
    bus.emit('story:entry', { text: `🔥 ${sim?.name} was fired from ${prev}!`, cat: 'life' });
    bus.emit('career:fired', { simId, prev });
  }

  // ── public getters ────────────────────────────────────────────────────────

  getInfo(simId) {
    const s = this._state.get(simId);
    if (!s) return null;
    const career = CAREERS.find(c => c.id === s.careerId);
    return { ...s, career };
  }

  // ── serialise / restore ───────────────────────────────────────────────────

  serialise() {
    const out = {};
    for (const [id, s] of this._state) out[id] = { ...s };
    return out;
  }

  restore(data) {
    for (const sim of this._game.sims) {
      const d = data?.[sim.id];
      if (!d) continue;
      const s = this._state.get(sim.id);
      if (!s) continue;
      Object.assign(s, d);
      sim._atWork = s.atWork;
    }
  }
}
