import { bus } from '../core/EventBus.js';
import cfg from '../config/gameConfig.js';

export const NEED_KEYS = [
  'hunger', 'energy', 'bladder', 'hygiene',
  'social', 'fun', 'comfort', 'room', 'autonomy', 'status',
];

export class SimNeeds {
  constructor(personality) {
    this._personality = personality;
    this._values = {};
    for (const k of NEED_KEYS) this._values[k] = 100;
    // Personality-only decay factors (cached). The per-need BASE rate and the
    // global scale are read LIVE from cfg in update(), so the God/Admin page can
    // retune needDecay/decayScale and it takes effect immediately on every Sim.
    this._persMult = this._computePersMult();
    this._emit = null;
  }

  _computePersMult() {
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
      m[k] = mult;
    }
    return m;
  }

  update(dt) {
    const base = cfg.needDecay ?? {};
    const scale = cfg.decayScale ?? 0.16667;
    // Decay constants are calibrated to a 1440-unit game-day (the original fixed day
    // length). dayDurationSec is now tunable for real-time play (default 86400); since
    // decay is applied per accumulated dt and a game-day now spans dayDurationSec units,
    // a longer day makes needs drain proportionally faster per game-day. Normalise to
    // the 1440 reference so decay-per-game-day is invariant — without this, sims at the
    // 86400 default starve to death within game-minutes even with full funds and food.
    const dayNorm = 1440 / (cfg.time?.dayDurationSec ?? 1440);
    for (const k of NEED_KEYS) {
      const rate = Math.max(0.3, (base[k] ?? 1) * this._persMult[k]);
      this._values[k] = Math.max(0, this._values[k] - rate * scale * dt * dayNorm);
    }
    if (this._emit) this._emit(this._values);
  }

  get(key)          { return this._values[key] ?? 0; }
  getAll()          { return { ...this._values }; }
  restore(key, amt) { this._values[key] = Math.min(100, (this._values[key] ?? 0) + amt); }
  decay(key, amt)   { this._values[key] = Math.max(0,   (this._values[key] ?? 0) - amt); }
  delta(key, amt)   { amt >= 0 ? this.restore(key, amt) : this.decay(key, Math.abs(amt)); }
  raise(key, amt)   { this.restore(key, amt); }
  drop(key, amt)    { this.decay(key, amt); }

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
