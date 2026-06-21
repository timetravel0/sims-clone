import { bus } from '../core/EventBus.js';

export const NEED_KEYS = [
  'hunger', 'energy', 'bladder', 'hygiene',
  'social', 'fun', 'comfort', 'room', 'autonomy', 'status',
];

const BASE_DECAY = {
  hunger:  3.0,
  energy:  2.5,
  bladder: 4.0,
  hygiene: 2.0,
  social:  2.5,
  fun:     2.2,
  comfort: 1.8,
  room:    0.5,
  autonomy: 1.2,
  status:   1.0,
};

export class SimNeeds {
  constructor(personality) {
    this._personality = personality;
    this._values = {};
    for (const k of NEED_KEYS) this._values[k] = 100;
    this._decayMults = this._computeDecay();
    this._emit = null;
  }

  _computeDecay() {
    const p = this._personality;
    const m = {};
    for (const k of NEED_KEYS) {
      let mult = 1.0;
      if (p.neurotic  > 0 && ['social','fun','hygiene'].includes(k)) mult += p.neurotic  * 0.4;
      if (p.neurotic  > 0 && ['autonomy','status'].includes(k)) mult += p.neurotic * 0.25;
      if (p.playful   > 0 && k === 'fun')    mult -= p.playful   * 0.25;
      if (p.outgoing  > 0 && k === 'social') mult += p.outgoing  * 0.3;
      if (p.nice      > 0 && k === 'status') mult -= p.nice      * 0.2;
      if (p.ambitious > 0) mult -= p.ambitious * 0.1;
      m[k] = Math.max(0.3, BASE_DECAY[k] * mult);
    }
    return m;
  }

  update(dt) {
    for (const k of NEED_KEYS) {
      this._values[k] = Math.max(0, this._values[k] - this._decayMults[k] * dt);
    }
    if (this._emit) this._emit(this._values);
  }

  get(key)          { return this._values[key] ?? 0; }
  getAll()          { return { ...this._values }; }
  restore(key, amt) { this._values[key] = Math.min(100, (this._values[key] ?? 0) + amt); }
  decay(key, amt)   { this._values[key] = Math.max(0,   (this._values[key] ?? 0) - amt); }

  /**
   * Returns the KEY of the most critical need below `threshold`.
   * Returns null if all needs are above threshold.
   */
  mostCritical(threshold = 35) {
    let worstKey = null;
    let worstVal = threshold; // only pick needs strictly below threshold
    for (const k of NEED_KEYS) {
      if (this._values[k] < worstVal) {
        worstVal = this._values[k];
        worstKey = k;
      }
    }
    return worstKey; // null when nothing is critical
  }

  serialise()         { return { ...this._values }; }
  restore_state(data) { Object.assign(this._values, data); }
}
