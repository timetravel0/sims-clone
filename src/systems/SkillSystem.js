/**
 * SkillSystem — Sprint 4
 * Tracks 6 skills per Sim: cooking, logic, charisma, fitness, creativity, handiness.
 * Skills grow 0-10 via object use. Each integer milestone emits skill:levelUp.
 * Skills decay very slowly when unused (0.001/day). Serialisable.
 */
import { bus } from '../core/EventBus.js';

export const SKILLS = ['cooking', 'logic', 'charisma', 'fitness', 'creativity', 'handiness'];

// Which furniture id (furniture.id, emitted as objectType on sim:objectUsed)
// advances which skill. Keys MUST match real ObjectRegistry ids.
export const OBJECT_SKILL_MAP = {
  bookshelf:    'logic',
  desk:         'logic',
  chess:        'logic',
  treadmill:    'fitness',
  hot_tub:      'fitness',
  piano:        'creativity',
  bar:          'charisma',
  couch:        'charisma',
  tv:           'charisma',
  fire_pit:     'charisma',
  dining_table: 'charisma',
  fridge:       'cooking',
};

const GAIN_PER_USE  = 0.25;   // XP per object interaction tick
const DECAY_RATE    = 0.001;  // per simulated day

export class SkillSystem {
  constructor() {
    /** @type {Map<string, Record<string, number>>} simId → skills */
    this._data = new Map();
    this._tickAccum = 0;
    // Using an object grows the matching skill (book/desk/piano/etc as XP vector).
    bus.on('sim:objectUsed', ({ sim, objectType }) => {
      if (sim && objectType) this.gainFromObject(sim, objectType);
    });
  }

  /** Call once per Sim on creation */
  register(sim) {
    if (this._data.has(sim.id)) return;
    const skills = {};
    for (const s of SKILLS) skills[s] = 0;
    this._data.set(sim.id, skills);
  }

  /** Called by UseObjectAction when a Sim finishes interacting */
  gainFromObject(sim, furnitureTag) {
    const skillName = OBJECT_SKILL_MAP[furnitureTag];
    if (!skillName) return;
    this._gain(sim, skillName, GAIN_PER_USE);
  }

  /** Direct gain (God Mode, career rewards) */
  gain(sim, skillName, amount = GAIN_PER_USE) {
    this._gain(sim, skillName, amount);
  }

  _gain(sim, skillName, amount) {
    const skills = this._data.get(sim.id);
    if (!skills || !(skillName in skills)) return;
    const prev  = skills[skillName];
    const next  = Math.min(10, prev + amount);
    skills[skillName] = next;
    // Emit on integer milestone
    if (Math.floor(next) > Math.floor(prev)) {
      bus.emit('skill:levelUp', {
        sim,
        skill: skillName,
        level: Math.floor(next),
      });
    }
  }

  /** Slow decay — call every game tick */
  update(dtDays) {
    for (const [, skills] of this._data) {
      for (const s of SKILLS) {
        skills[s] = Math.max(0, skills[s] - DECAY_RATE * dtDays);
      }
    }
  }

  getSkills(sim) {
    return { ...(this._data.get(sim.id) ?? {}) };
  }

  getLevel(sim, skillName) {
    return Math.floor(this._data.get(sim.id)?.[skillName] ?? 0);
  }

  // ---------- serialise / restore ----------
  serialise() {
    const out = {};
    for (const [id, skills] of this._data) out[id] = { ...skills };
    return out;
  }

  restore(data) {
    if (!data) return;
    for (const [id, skills] of Object.entries(data)) {
      this._data.set(id, { ...skills });
    }
  }
}

export const skillSystem = new SkillSystem();
