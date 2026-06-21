/**
 * AgeSystem — Sprint 3
 *
 * Tracks simulated age for every Sim. Age advances with in-game time.
 * Life stages trigger trait modifiers, need-decay changes and story events.
 *
 * Stage durations (in sim-years):
 *   Child       0–7
 *   Teen        7–18
 *   YoungAdult 18–35
 *   Adult      35–60
 *   Elder      60+
 *
 * Sims start as YoungAdult (21 yrs) by default.
 */

import { bus } from '../core/EventBus.js';

export const LIFE_STAGES = [
  { id: 'child',      label: 'Child',       minAge: 0,  color: '#64b5f6', needMult: 1.3,  moodMult: 0.9 },
  { id: 'teen',       label: 'Teen',        minAge: 7,  color: '#81c784', needMult: 1.2,  moodMult: 1.0 },
  { id: 'youngadult', label: 'Young Adult', minAge: 18, color: '#fff176', needMult: 1.0,  moodMult: 1.0 },
  { id: 'adult',      label: 'Adult',       minAge: 35, color: '#ffb74d', needMult: 0.95, moodMult: 1.05 },
  { id: 'elder',      label: 'Elder',       minAge: 60, color: '#ce93d8', needMult: 1.15, moodMult: 1.1 },
];

const HOURS_PER_DAY = 24;

export class AgeSystem {
  constructor(game) {
    this._game = game;
    this._state = new Map();   // simId → { ageDays, stage, birthdayHour }
    this._lastHour = game.clock.hour;

    for (const sim of game.sims) {
      this._state.set(sim.id, {
        ageDays:     21 * 365,
        stage:       LIFE_STAGES[2],
        birthdayHour: 0,
      });
      this._applyStageModifiers(sim, LIFE_STAGES[2]);
    }
  }

  update(_scaledDt) {
    const currentHour = this._game.clock.hour;
    let dh = currentHour - this._lastHour;
    if (dh < 0) dh += HOURS_PER_DAY;
    if (dh <= 0) return;
    this._lastHour = currentHour;

    for (const sim of this._game.sims) {
      const s = this._state.get(sim.id);
      if (!s) continue;
      s.birthdayHour += dh;
      if (s.birthdayHour >= HOURS_PER_DAY) {
        s.ageDays += Math.floor(s.birthdayHour / HOURS_PER_DAY);
        s.birthdayHour %= HOURS_PER_DAY;
        this._checkStageTransition(sim, s);
      }
    }
  }

  _checkStageTransition(sim, s) {
    const ageYears = s.ageDays / 365;
    const newStage = [...LIFE_STAGES].reverse().find(st => ageYears >= st.minAge);
    if (newStage && newStage.id !== s.stage.id) {
      const old = s.stage;
      s.stage = newStage;
      this._applyStageModifiers(sim, newStage);
      bus.emit('lifecycle:stageChanged', { sim, from: old, to: newStage });
      bus.emit('story:entry', { text: `🎂 ${sim.name} has become a ${newStage.label}!`, cat: 'life' });
    }
  }

  _applyStageModifiers(sim, stage) {
    sim._ageStage = stage;
    sim._needMult = stage.needMult;
  }

  getInfo(simId) {
    const s = this._state.get(simId);
    if (!s) return null;
    return { ageDays: s.ageDays, ageYears: Math.floor(s.ageDays / 365), stage: s.stage };
  }

  setAge(simId, years) {
    const s = this._state.get(simId);
    const sim = this._game.sims.find(x => x.id === simId);
    if (!s || !sim) return;
    s.ageDays = years * 365;
    s.birthdayHour = 0;
    this._checkStageTransition(sim, s);
  }

  serialise() {
    const out = {};
    for (const [id, s] of this._state) {
      out[id] = { ageDays: s.ageDays, stageId: s.stage.id, birthdayHour: s.birthdayHour };
    }
    return out;
  }

  restore(data) {
    for (const sim of this._game.sims) {
      const d = data?.[sim.id];
      if (!d) continue;
      const s = this._state.get(sim.id);
      if (!s) continue;
      s.ageDays = d.ageDays ?? s.ageDays;
      s.birthdayHour = d.birthdayHour ?? 0;
      const stage = LIFE_STAGES.find(st => st.id === d.stageId) ?? LIFE_STAGES[2];
      s.stage = stage;
      this._applyStageModifiers(sim, stage);
    }
  }
}
