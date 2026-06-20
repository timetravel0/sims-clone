import { bus } from '../core/EventBus.js';

export const NEED_KEYS = ['hunger', 'energy', 'bladder', 'hygiene', 'social', 'fun', 'comfort', 'room'];

const DECAY_RATE = {
  hunger: 1.5, energy: 1.2, bladder: 2.0,
  hygiene: 0.8, social: 0.6, fun: 1.0, comfort: 0.9, room: 0.3,
};

export class SimNeeds {
  constructor(simId) {
    this._simId = simId;
    this._values = {};
    for (const k of NEED_KEYS) this._values[k] = 80;
  }
  get(key) { return this._values[key]; }
  set(key, val) { this._values[key] = Math.min(100, Math.max(0, val)); }
  restore(key, amount) { this.set(key, this._values[key] + amount); }
  mostCritical(threshold = 40) {
    let worst = null, worstVal = threshold;
    for (const k of NEED_KEYS) {
      if (this._values[k] < worstVal) { worst = k; worstVal = this._values[k]; }
    }
    return worst;
  }
  update(dt) {
    for (const k of NEED_KEYS) this._values[k] = Math.max(0, this._values[k] - DECAY_RATE[k] * dt);
    bus.emit('simNeeds:update', { simId: this._simId, values: { ...this._values } });
  }
  snapshot() { return { ...this._values }; }
}
