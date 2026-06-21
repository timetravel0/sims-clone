/**
 * LifeCycle — simulated aging, life stages and birthday events.
 *
 * Stages:  child (0-17) → young_adult (18-34) → adult (35-59) → elder (60+)
 *
 * Age advances each time the sim accumulates DAYS_PER_YEAR simulated days.
 * On birthday emits 'lifecycle:birthday'.
 * On stage change emits 'lifecycle:stageChange' and adjusts SimNeeds decay.
 */
import { bus } from '../core/EventBus.js';

export const LIFE_STAGES = {
  child:       { min: 0,  max: 17,  label: 'Child',       emoji: '🧒', decayMult: 0.7  },
  young_adult: { min: 18, max: 34,  label: 'Young Adult',  emoji: '🧑', decayMult: 1.0  },
  adult:       { min: 35, max: 59,  label: 'Adult',        emoji: '👩', decayMult: 1.1  },
  elder:       { min: 60, max: 120, label: 'Elder',        emoji: '🧓', decayMult: 0.9  },
};

// 1 simulated year = this many in-game days
const DAYS_PER_YEAR = 7;

export class SimLifeCycle {
  /** @param {import('../entities/Sim.js').Sim} sim */
  constructor(sim, initialAge = 25) {
    this._sim       = sim;
    this.age        = initialAge;
    this._dayAccum  = 0;
    this._stage     = this._computeStage(initialAge);
    this._applyDecayMult();
  }

  get stage()     { return this._stage; }
  get stageInfo() { return LIFE_STAGES[this._stage]; }

  /**
   * @param {number} dt          scaled dt (seconds)
   * @param {number} dayLength   real seconds per simulated day (from SimCalendar)
   */
  update(dt, dayLength = 120) {
    this._dayAccum += dt / dayLength;
    if (this._dayAccum >= DAYS_PER_YEAR) {
      this._dayAccum -= DAYS_PER_YEAR;
      this._birthday();
    }
  }

  _birthday() {
    this.age += 1;
    bus.emit('lifecycle:birthday', { simId: this._sim.id, simName: this._sim.name, age: this.age });
    bus.emit('story:entry', { text: `🎂 ${this._sim.name} turns ${this.age}!` });
    const newStage = this._computeStage(this.age);
    if (newStage !== this._stage) {
      const old = this._stage;
      this._stage = newStage;
      this._applyDecayMult();
      bus.emit('lifecycle:stageChange', {
        simId: this._sim.id, simName: this._sim.name,
        from: old, to: newStage, stageInfo: LIFE_STAGES[newStage],
      });
      bus.emit('story:entry', { text: `✨ ${this._sim.name} enters the ${LIFE_STAGES[newStage].label} stage of life.` });
    }
  }

  _computeStage(age) {
    for (const [key, s] of Object.entries(LIFE_STAGES)) {
      if (age >= s.min && age <= s.max) return key;
    }
    return 'elder';
  }

  _applyDecayMult() {
    const mult = LIFE_STAGES[this._stage].decayMult;
    if (this._sim.needs?.setDecayMultiplier) this._sim.needs.setDecayMultiplier(mult);
  }

  serialise()  { return { age: this.age, stage: this._stage, dayAccum: this._dayAccum }; }
  restore(d) {
    if (!d) return;
    this.age       = d.age      ?? this.age;
    this._stage    = d.stage    ?? this._stage;
    this._dayAccum = d.dayAccum ?? 0;
    this._applyDecayMult();
  }
}
