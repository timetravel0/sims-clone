/**
 * SkillSystem — Sprint 4
 * Tracks 6 skills per Sim: cooking, logic, charisma, fitness, creativity, handiness.
 * Skills grow 0-10 via object use. Each integer milestone emits skill:levelUp
 * once per Sim/skill/level, even if slow decay later nudges the value below the
 * same integer boundary.
 */
import { bus } from '../core/EventBus.js';
import { ObjectRegistry, SKILL_BY_OBJECT } from './ObjectRegistry.js';

export const SKILLS = ['cooking', 'logic', 'charisma', 'fitness', 'creativity', 'handiness'];

// Object→skill mapping lives in ObjectRegistry (single source of truth).
export const OBJECT_SKILL_MAP = SKILL_BY_OBJECT;

const GAIN_PER_USE  = 0.25;   // XP per object interaction tick
const DECAY_RATE    = 0.001;  // per simulated day

export class SkillSystem {
  constructor() {
    /** @type {Map<string, Record<string, number>>} simId → skills */
    this._data = new Map();
    /** @type {Map<string, Record<string, number>>} simId → highest emitted integer level per skill */
    this._emittedLevels = new Map();
    this._tickAccum = 0;
    this._unsubscribeObjectUsed = null;
    this.bindBus();
  }

  bindBus() {
    this._unsubscribeObjectUsed?.();
    this._unsubscribeObjectUsed = bus.on('sim:objectUsed', ({ sim, objectType }) => {
      if (sim && objectType) this.gainFromObject(sim, objectType);
    });
  }

  /** Call once per Sim on creation */
  register(sim) {
    if (this._data.has(sim.id)) return;
    const skills = this._blankSkills();
    this._data.set(sim.id, skills);
    this._emittedLevels.set(sim.id, this._levelsFrom(skills));
  }

  /** Called by UseObjectAction when a Sim finishes interacting */
  gainFromObject(sim, furnitureTag) {
    const skillName = ObjectRegistry.get(furnitureTag)?.skill ?? OBJECT_SKILL_MAP[furnitureTag];
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
    const prev = skills[skillName];
    const next = Math.min(10, prev + amount);
    skills[skillName] = next;

    const reached = Math.floor(next);
    const emitted = this._emittedLevels.get(sim.id) ?? this._levelsFrom(skills);
    this._emittedLevels.set(sim.id, emitted);

    // Emit each integer milestone once. Without this, tiny skill decay can move a
    // maxed skill from 10.000 to 9.999 and every future use re-emits Lv.10.
    if (reached > Math.floor(prev) && reached > (emitted[skillName] ?? 0)) {
      emitted[skillName] = reached;
      bus.emit('skill:levelUp', {
        sim,
        skill: skillName,
        level: reached,
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
    this._data.clear();
    this._emittedLevels.clear();
    for (const [id, skills] of Object.entries(data)) {
      const normalized = this._blankSkills(skills);
      this._data.set(id, normalized);
      this._emittedLevels.set(id, this._levelsFrom(normalized));
    }
  }

  _blankSkills(overrides = {}) {
    const skills = {};
    for (const s of SKILLS) skills[s] = Number(overrides[s] ?? 0);
    return skills;
  }

  _levelsFrom(skills = {}) {
    const levels = {};
    for (const s of SKILLS) levels[s] = Math.floor(skills[s] ?? 0);
    return levels;
  }
}

export const skillSystem = new SkillSystem();
