/**
 * CareerSystem — Sprint 6
 * Tracks each Sim's job, level, and work schedule.
 *
 * Careers (each with 10 levels):
 *   culinary, tech, military, music, athlete, business, criminal, science
 *
 * Each career has:
 *   - dailySalary   (paid on clock:dayChanged when Sim is employed)
 *   - workHours     [startHour, endHour]  (in-game hours)
 *   - skillRequired string (from SkillSystem)
 *   - moodBonus     (if mood is 'happy' or above, +1 performance per day)
 *
 * Sim career state:
 *   { careerId, level, performance, daysWorked, daysOff }
 *   performance: 0-100, increases with skill + mood, decreases with missed days
 *   level up at performance >= 100, level down at performance <= 0
 *
 * Emits:
 *   career:levelUp    { simId, careerId, newLevel }
 *   career:levelDown  { simId, careerId, newLevel }
 *   career:salary     { simId, amount }   — also forwarded to BudgetSystem via bus
 *   career:atWork     { simId }           — Sim should be at desk/away
 *   career:offWork    { simId }           — Sim returns
 *
 * Serialisable.
 */
import { bus } from '../core/EventBus.js';

export const CAREERS = {
  culinary:  { label: 'Culinary',   levels: 10, salaryBase: 180, salaryStep: 60,  workHours: [9, 17],  skillRequired: 'cooking',    icon: '👨‍🍳' },
  tech:      { label: 'Tech',       levels: 10, salaryBase: 250, salaryStep: 80,  workHours: [8, 16],  skillRequired: 'logic',      icon: '💻' },
  military:  { label: 'Military',   levels: 10, salaryBase: 200, salaryStep: 70,  workHours: [6, 14],  skillRequired: 'fitness',    icon: '🦖' },
  music:     { label: 'Music',      levels: 10, salaryBase: 150, salaryStep: 50,  workHours: [16, 23], skillRequired: 'creativity', icon: '🎵' },
  athlete:   { label: 'Athlete',    levels: 10, salaryBase: 220, salaryStep: 75,  workHours: [7, 15],  skillRequired: 'fitness',    icon: '🏆' },
  business:  { label: 'Business',   levels: 10, salaryBase: 300, salaryStep: 100, workHours: [9, 18],  skillRequired: 'charisma',   icon: '💼' },
  criminal:  { label: 'Criminal',   levels: 10, salaryBase: 350, salaryStep: 120, workHours: [20, 3],  skillRequired: 'stealth',    icon: '💀' },
  science:   { label: 'Science',    levels: 10, salaryBase: 280, salaryStep: 90,  workHours: [9, 17],  skillRequired: 'logic',      icon: '🧬' },
};

export class CareerSystem {
  constructor() {
    /** @type {Map<string, {careerId:string, level:number, performance:number, daysWorked:number, atWork:boolean}>} */
    this._sims = new Map();

    // Clock hooks
    bus.on('clock:hourChanged', ({ hour, day }) => this._onHour(hour, day));
    bus.on('clock:dayChanged',  ({ day })        => this._onDay(day));
  }

  // ── Assignment ──────────────────────────────────────────────────────────

  assign(simId, careerId) {
    if (!CAREERS[careerId]) throw new Error('Unknown career: ' + careerId);
    this._sims.set(simId, {
      careerId, level: 1, performance: 50,
      daysWorked: 0, atWork: false,
    });
    bus.emit('career:assigned', { simId, careerId });
  }

  quit(simId) {
    this._sims.delete(simId);
    bus.emit('career:quit', { simId });
  }

  getState(simId) { return this._sims.get(simId) ?? null; }

  // ── Salary ────────────────────────────────────────────────────────────────

  _salaryFor(careerId, level) {
    const c = CAREERS[careerId];
    return c.salaryBase + (level - 1) * c.salaryStep;
  }

  // ── Clock callbacks ────────────────────────────────────────────────────────

  _onHour(hour) {
    for (const [simId, state] of this._sims) {
      const c = CAREERS[state.careerId];
      const [start, end] = c.workHours;
      // Handle overnight careers (criminal: 20-3)
      const isWorkHour = start < end
        ? hour >= start && hour < end
        : hour >= start || hour < end;

      if (isWorkHour && !state.atWork) {
        state.atWork = true;
        bus.emit('career:atWork', { simId });
      } else if (!isWorkHour && state.atWork) {
        state.atWork = false;
        bus.emit('career:offWork', { simId });
      }
    }
  }

  _onDay() {
    for (const [simId, state] of this._sims) {
      // Pay salary
      const amount = this._salaryFor(state.careerId, state.level);
      bus.emit('career:salary', { simId, amount });
      // also forward to BudgetSystem
      bus.emit('budget:credit', { amount, reason: 'salary' });

      // Performance update (simplified: +5 per worked day, -10 if missed)
      state.daysWorked++;
      state.performance = Math.max(0, Math.min(100, state.performance + 5));

      // Level transitions
      if (state.performance >= 100 && state.level < CAREERS[state.careerId].levels) {
        state.level++;
        state.performance = 0;
        bus.emit('career:levelUp', { simId, careerId: state.careerId, newLevel: state.level });
      } else if (state.performance <= 0 && state.level > 1) {
        state.level--;
        state.performance = 50;
        bus.emit('career:levelDown', { simId, careerId: state.careerId, newLevel: state.level });
      }
    }
  }

  // ── Serialise ─────────────────────────────────────────────────────────────

  serialise() {
    const out = {};
    for (const [id, state] of this._sims) out[id] = { ...state };
    return out;
  }

  restore(data) {
    if (!data) return;
    this._sims.clear();
    for (const [id, state] of Object.entries(data)) {
      this._sims.set(id, { ...state });
    }
  }
}

export const careerSystem = new CareerSystem();
