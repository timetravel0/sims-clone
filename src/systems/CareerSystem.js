/**
 * CareerSystem
 * ------------
 * Manages careers, daily shifts, salary, skill gain and promotions.
 *
 * Emits:
 *   career:promoted   { sim, career, oldLevel, newLevel, salary }
 *   career:fired      { sim, career }
 *   career:skillGain  { sim, skill, value }
 *   story:entry       { text, category }
 *
 * Listens:
 *   life:event        { sim, type: 'promoted' | 'fired' }
 */

import { bus } from '../core/EventBus.js';

// ── career definitions ────────────────────────────────────────────
// day: 0 = Mon … 4 = Fri, 5 = Sat, 6 = Sun
export const CAREERS = [
  {
    id: 'unemployed', label: 'Unemployed',
    skillReq: {},
    shifts: [],
    salaryBase: 0, salaryPerLevel: 0,
  },
  {
    id: 'artist', label: 'Artist',
    skillReq: { creativity: 2 },
    shifts: [{ day: 1, start: 10, end: 16 }, { day: 3, start: 10, end: 16 }, { day: 5, start: 11, end: 15 }],
    salaryBase: 120, salaryPerLevel: 40,
  },
  {
    id: 'scientist', label: 'Scientist',
    skillReq: { logic: 2 },
    shifts: [{ day: 0, start: 9, end: 17 }, { day: 2, start: 9, end: 17 }, { day: 4, start: 9, end: 17 }],
    salaryBase: 180, salaryPerLevel: 60,
  },
  {
    id: 'chef', label: 'Chef',
    skillReq: { cooking: 2 },
    shifts: [{ day: 0, start: 11, end: 21 }, { day: 2, start: 11, end: 21 }, { day: 4, start: 11, end: 21 }, { day: 5, start: 11, end: 21 }],
    salaryBase: 150, salaryPerLevel: 50,
  },
  {
    id: 'programmer', label: 'Programmer',
    skillReq: { logic: 2 },
    shifts: [{ day: 0, start: 9, end: 17 }, { day: 1, start: 9, end: 17 }, { day: 2, start: 9, end: 17 }, { day: 3, start: 9, end: 17 }, { day: 4, start: 9, end: 17 }],
    salaryBase: 200, salaryPerLevel: 80,
  },
  {
    id: 'athlete', label: 'Athlete',
    skillReq: { fitness: 2 },
    shifts: [{ day: 0, start: 8, end: 14 }, { day: 2, start: 8, end: 14 }, { day: 4, start: 8, end: 14 }],
    salaryBase: 160, salaryPerLevel: 55,
  },
];

// furniture type → skill gained
const SKILL_MAP = {
  bookshelf  : 'logic',
  piano      : 'creativity',
  desk       : 'logic',
  treadmill  : 'fitness',
  easel      : 'creativity',
  kitchen    : 'cooking',
  fridge     : 'cooking',
};

const SKILL_GAIN_PER_USE = 0.2;  // per completed UseObjectAction
const MAX_SKILL          = 10;
const MAX_LEVEL          = 10;
const DAYS_PER_PROMOTION = 5;

export class CareerSystem {
  /**
   * @param {Sim[]}   sims
   * @param {object}  clock   game clock { hour, weekday, simSeconds }
   */
  constructor(sims, clock) {
    this._sims  = sims;
    this._clock = clock;

    // Per-sim state  { simId -> SimCareerData }
    this._data = new Map();
    for (const sim of sims) this._initSim(sim);

    // Listen for God Mode life events
    bus.on('life:event', ({ sim, type }) => {
      if (!sim) return;
      if (type === 'promoted') this._promote(sim, 'god');
      if (type === 'fired')    this._fire(sim);
    });

    // Listen for UseObjectAction completions to award skill gain
    bus.on('sim:objectUsed', ({ sim, objectType }) => {
      const skill = SKILL_MAP[objectType];
      if (skill) this._gainSkill(sim, skill);
    });
  }

  // ── public ──────────────────────────────────────────────────────

  update(dt) {
    const { hour, weekday } = this._clock;

    for (const sim of this._sims) {
      const d = this._data.get(sim.id);
      if (!d) continue;

      const career = CAREERS.find(c => c.id === d.careerId);
      if (!career || career.shifts.length === 0) {
        sim._atWork = false;
        continue;
      }

      const inShift = career.shifts.some(
        s => s.day === weekday && hour >= s.start && hour < s.end
      );

      if (inShift && !sim._atWork) {
        // shift start
        sim._atWork = true;
        d._shiftStarted = true;
      }

      if (!inShift && sim._atWork) {
        // shift end
        sim._atWork = false;
        if (d._shiftStarted) {
          d._shiftStarted = false;
          this._endShift(sim, d, career);
        }
      }
    }
  }

  /** Change a Sim's career. Returns false if skill requirement not met. */
  setCareer(sim, careerId) {
    const career = CAREERS.find(c => c.id === careerId);
    if (!career) return false;

    const d = this._data.get(sim.id);
    if (!d) return false;

    // Validate skill requirement
    for (const [skill, min] of Object.entries(career.skillReq)) {
      if ((d.skills[skill] ?? 0) < min) return false;
    }

    d.careerId    = careerId;
    d.level       = 1;
    d.daysWorked  = 0;
    sim._atWork   = false;
    return true;
  }

  getCareerData(sim) {
    return this._data.get(sim.id);
  }

  // ── serialise / restore ─────────────────────────────────────────

  serialise() {
    const out = {};
    for (const [id, d] of this._data) {
      out[id] = {
        careerId   : d.careerId,
        level      : d.level,
        daysWorked : d.daysWorked,
        simoleons  : d.simoleons,
        skills     : { ...d.skills },
      };
    }
    return out;
  }

  restore(state) {
    if (!state) return;
    for (const sim of this._sims) {
      const saved = state[sim.id];
      if (!saved) continue;
      const d = this._data.get(sim.id);
      if (!d) continue;
      d.careerId   = saved.careerId  ?? 'unemployed';
      d.level      = saved.level     ?? 1;
      d.daysWorked = saved.daysWorked ?? 0;
      d.simoleons  = saved.simoleons  ?? 0;
      d.skills     = { ...saved.skills };
    }
  }

  // ── private ──────────────────────────────────────────────────────

  _initSim(sim) {
    sim._atWork = false;
    this._data.set(sim.id, {
      careerId     : 'unemployed',
      level        : 1,
      daysWorked   : 0,
      simoleons    : 0,
      _shiftStarted: false,
      skills       : { cooking: 0, logic: 0, creativity: 0, fitness: 0, charisma: 0 },
    });
  }

  _endShift(sim, d, career) {
    const salary = career.salaryBase + d.level * career.salaryPerLevel;
    d.simoleons += salary;
    d.daysWorked++;

    // Raise status need as reward
    sim.needs?.raise?.('status', 15);

    // Promotion check
    if (d.daysWorked % DAYS_PER_PROMOTION === 0 && d.level < MAX_LEVEL) {
      this._promote(sim, career.id);
    }

    bus.emit('story:entry', {
      text: `${sim.name} finished a shift as ${career.label} and earned §${salary}.`,
      category: 'positive',
    });
  }

  _promote(sim, source) {
    const d = this._data.get(sim.id);
    if (!d || d.level >= MAX_LEVEL) return;

    const career   = CAREERS.find(c => c.id === d.careerId) ?? CAREERS[0];
    const oldLevel = d.level;
    d.level++;
    const salary   = career.salaryBase + d.level * career.salaryPerLevel;

    bus.emit('career:promoted', { sim, career: career.label, oldLevel, newLevel: d.level, salary });
    bus.emit('story:entry', {
      text: `${sim.name} was promoted to ${career.label} Lv.${d.level}!`,
      category: 'positive',
    });
  }

  _fire(sim) {
    const d = this._data.get(sim.id);
    if (!d) return;

    const career = CAREERS.find(c => c.id === d.careerId) ?? CAREERS[0];
    const label  = career.label;

    d.careerId   = 'unemployed';
    d.level      = 1;
    d.daysWorked = 0;
    sim._atWork  = false;

    sim.needs?.drop?.('status', 20);

    bus.emit('career:fired', { sim, career: label });
    bus.emit('story:entry', {
      text: `${sim.name} was fired from ${label}.`,
      category: 'drama',
    });
  }

  _gainSkill(sim, skill) {
    const d = this._data.get(sim.id);
    if (!d) return;

    const prev = d.skills[skill] ?? 0;
    if (prev >= MAX_SKILL) return;

    const next = Math.min(MAX_SKILL, prev + SKILL_GAIN_PER_USE);
    d.skills[skill] = next;

    bus.emit('career:skillGain', { sim, skill, value: next });
  }
}
