/**
 * ScheduleSystem
 * --------------
 * Generates a weekly routine for each Sim and activates schedule
 * slots based on the current in-game hour/weekday.
 *
 * Emits:
 *   schedule:slotChanged  { sim, slot }   slot = { type, label } | null
 *
 * Calls on SimBrain (when available):
 *   brain.suggestFurniture(type, priority)
 *   brain.suggestSocial(priority)
 */

import { bus } from '../core/EventBus.js';

// Priority levels passed to SimBrain
const PRIORITY = { schedule: 2, crisis: 10 };

// Slot definitions
// days: 0=Mon … 4=Fri, 5=Sat, 6=Sun  (-1 = every day)
const SLOT_TEMPLATES = [
  { type: 'sleep',  label: 'Sleeping',   days: -1,        startHour: 23, endHour: 7,  furniture: 'bed',   condition: null },
  { type: 'eat',    label: 'Breakfast',  days: -1,        startHour:  7, endHour: 8,  furniture: 'fridge',condition: null },
  { type: 'eat',    label: 'Lunch',      days: -1,        startHour: 12, endHour: 13, furniture: 'fridge',condition: null },
  { type: 'eat',    label: 'Dinner',     days: -1,        startHour: 18, endHour: 19, furniture: 'fridge',condition: null },
  { type: 'fun',    label: 'Fun time',   days: [0,1,2,3,4], startHour: 15, endHour: 18, furniture: 'tv',  condition: p => p.playful > 0.3 },
  { type: 'social', label: 'Socialising',days: [5,6],     startHour: 14, endHour: 20, furniture: null,    condition: p => p.outgoing > 0.3 },
  { type: 'study',  label: 'Studying',   days: [0,1,2,3,4],startHour: 19, endHour: 22, furniture: 'bookshelf', condition: p => p.ambitious > 0.3 },
];

export class ScheduleSystem {
  /**
   * @param {Sim[]}  sims
   * @param {object} clock  { hour: number, weekday: number }
   */
  constructor(sims, clock) {
    this._sims  = sims;
    this._clock = clock;

    // Per-sim active slot cache  { simId -> slotTemplate | null }
    this._active = new Map();
    for (const sim of sims) {
      this._active.set(sim.id, null);
    }
  }

  // ── public ──────────────────────────────────────────────────────

  update(_dt) {
    const { hour, weekday } = this._clock;

    for (const sim of this._sims) {
      if (sim._atWork) {
        this._setActive(sim, null);
        continue;
      }

      const slot = this._resolveSlot(sim, hour, weekday);
      const prev = this._active.get(sim.id);

      // Only act on transitions or sustained active slot once per update
      if (slot !== prev) {
        this._setActive(sim, slot);
      }

      if (slot && sim.brain) {
        if (slot.furniture) {
          sim.brain.suggestFurniture?.(slot.furniture, PRIORITY.schedule);
        } else if (slot.type === 'social') {
          sim.brain.suggestSocial?.(PRIORITY.schedule);
        }
      }
    }
  }

  /** Returns the active schedule slot for a sim, or null. */
  getSlot(sim) {
    return this._active.get(sim.id) ?? null;
  }

  // ── private ──────────────────────────────────────────────────────

  _resolveSlot(sim, hour, weekday) {
    const p = sim.personality ?? {};
    for (const tpl of SLOT_TEMPLATES) {
      // condition guard
      if (tpl.condition && !tpl.condition(p)) continue;

      // day guard  (-1 = every day)
      if (tpl.days !== -1 && !tpl.days.includes(weekday)) continue;

      // hour guard (handles overnight wrap, e.g. 23–7)
      const active = tpl.startHour < tpl.endHour
        ? hour >= tpl.startHour && hour < tpl.endHour
        : hour >= tpl.startHour || hour < tpl.endHour;

      if (active) return tpl;
    }
    return null;
  }

  _setActive(sim, slot) {
    this._active.set(sim.id, slot);
    bus.emit('schedule:slotChanged', { sim, slot });
  }
}
