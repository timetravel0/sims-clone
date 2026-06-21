/**
 * ScheduleSystem — Sprint 3
 *
 * Every Sim has a weekly routine of "slots". Each slot is a preferred
 * activity for a block of hours on a given day-of-week.
 * When the clock enters a slot the system queues a suggestion into SimBrain.
 * The brain accepts it only when no critical needs override it.
 *
 * Slots are generated automatically from personality + career but can be
 * overridden at runtime.
 *
 * Day index: 0 = Sunday, 1 = Monday … 6 = Saturday
 */

import { bus } from '../core/EventBus.js';
import { IdleAction } from '../ai/Action.js';

const SCHEDULE_TICK = 0.5;   // check every 0.5 sim-seconds

export class ScheduleSystem {
  constructor(game) {
    this._game = game;
    /** @type {Map<string, ScheduleEntry[]>} */
    this._schedules = new Map();
    this._timer = 0;
    this._lastSlot = new Map();  // simId → last activated slot id

    for (const sim of game.sims) {
      this._schedules.set(sim.id, this._buildDefault(sim));
    }
  }

  // ── default schedule generator ────────────────────────────────────────────

  _buildDefault(sim) {
    const p = sim.personality;
    const slots = [];

    // Everyone sleeps
    for (let day = 0; day < 7; day++) {
      slots.push({
        id: `sleep_${day}`,
        day,
        startHour: 23,
        endHour: 7,
        activityId: 'bed',
        label: 'Sleep',
        priority: 10,
      });
    }

    // Meals
    for (let day = 0; day < 7; day++) {
      slots.push({ id: `breakfast_${day}`, day, startHour: 7, endHour: 9,   activityId: 'fridge', label: 'Breakfast', priority: 8 });
      slots.push({ id: `lunch_${day}`,     day, startHour: 12, endHour: 13, activityId: 'fridge', label: 'Lunch',     priority: 8 });
      slots.push({ id: `dinner_${day}`,    day, startHour: 19, endHour: 21, activityId: 'fridge', label: 'Dinner',    priority: 8 });
    }

    // Personality-driven leisure
    if (p.playful > 0.3) {
      for (let day = 0; day < 7; day++) {
        slots.push({ id: `fun_${day}`, day, startHour: 15, endHour: 18, activityId: 'tv', label: 'Fun time', priority: 4 });
      }
    }
    if (p.outgoing > 0.3) {
      // Weekend socialise
      slots.push({ id: 'social_sat', day: 6, startHour: 14, endHour: 17, activityId: null, label: 'Socialise', priority: 5 });
      slots.push({ id: 'social_sun', day: 0, startHour: 14, endHour: 17, activityId: null, label: 'Socialise', priority: 5 });
    }
    if (p.ambitious > 0.3) {
      for (let day = 1; day <= 5; day++) {
        slots.push({ id: `study_${day}`, day, startHour: 20, endHour: 22, activityId: 'bookshelf', label: 'Study', priority: 6 });
      }
    }

    return slots;
  }

  // ── update ────────────────────────────────────────────────────────────────

  update(scaledDt) {
    this._timer += scaledDt;
    if (this._timer < SCHEDULE_TICK) return;
    this._timer = 0;

    const hour = this._game.clock.hour;
    const day  = Math.floor(this._game.dayNight?.totalDays ?? 0) % 7;

    for (const sim of this._game.sims) {
      if (sim._atWork) continue;       // career takes priority
      const slots = this._schedules.get(sim.id) ?? [];
      const active = slots.find(sl => this._slotActive(sl, day, hour));
      if (!active) continue;
      if (this._lastSlot.get(sim.id) === active.id) continue;
      this._lastSlot.set(sim.id, active.id);
      this._activateSlot(sim, active);
    }
  }

  _slotActive(slot, day, hour) {
    if (slot.day !== day) return false;
    if (slot.startHour < slot.endHour) {
      return hour >= slot.startHour && hour < slot.endHour;
    }
    // Overnight slot (e.g. sleep 23-7)
    return hour >= slot.startHour || hour < slot.endHour;
  }

  _activateSlot(sim, slot) {
    // Skip if brain is busy with something higher-priority
    if (!sim.brain.canInterrupt(slot.priority)) return;

    if (slot.activityId) {
      // Find furniture of matching type in world
      const furniture = this._game.world.furniture.find(
        f => f.id === slot.activityId && !f.inUse && !f.reservedBy
      );
      if (furniture) {
        sim.brain.suggestFurniture(furniture, slot.label);
        bus.emit('schedule:activated', { simId: sim.id, slot });
        return;
      }
    }
    // Social suggestion: find an idle Sim nearby
    if (slot.label === 'Socialise') {
      const others = this._game.sims.filter(s => s.id !== sim.id && !s._atWork);
      if (others.length > 0) {
        const target = others[Math.floor(Math.random() * others.length)];
        sim.brain.suggestSocial(target, 'chat', slot.label);
        bus.emit('schedule:activated', { simId: sim.id, slot });
      }
    }
  }

  // ── public API ────────────────────────────────────────────────────────────

  getSchedule(simId) { return this._schedules.get(simId) ?? []; }

  addSlot(simId, slot) {
    const slots = this._schedules.get(simId);
    if (slots) slots.push(slot);
  }

  removeSlot(simId, slotId) {
    const slots = this._schedules.get(simId);
    if (slots) {
      const idx = slots.findIndex(s => s.id === slotId);
      if (idx !== -1) slots.splice(idx, 1);
    }
  }

  // ── serialise / restore ───────────────────────────────────────────────────

  serialise() {
    const out = {};
    for (const [id, slots] of this._schedules) out[id] = slots;
    return out;
  }

  restore(data) {
    if (!data) return;
    for (const [id, slots] of Object.entries(data)) {
      this._schedules.set(id, slots);
    }
  }
}
