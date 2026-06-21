import { bus } from '../core/EventBus.js';

/**
 * PersonalityDrift — slow trait evolution driven by life events.
 *
 * Each Sim's personality is no longer static: repeated experiences push
 * the five trait axes in directions consistent with the event.
 *
 * Design constraints:
 *  - Drift is SLOW: a single event moves a trait by at most 0.008.
 *  - Each trait is clamped within ±0.3 of its initial (born) value,
 *    preserving core identity while allowing realistic growth.
 *  - Drift events are asymmetric: traumas hit harder than successes
 *    (loss aversion coefficient 1.4).
 *
 * Trait rules (examples):
 *  social:conflict_repeated   → outgoing ↓, neurotic ↑
 *  social:bond_formed         → outgoing ↑, nice ↑
 *  career:promoted            → ambitious ↑, neurotic ↓
 *  career:fired               → neurotic ↑, ambitious ↓
 *  life:loner_extended        → outgoing ↓, playful ↓
 *  mood:ecstatic_sustained    → neurotic ↓, playful ↑
 *  mood:miserable_sustained   → neurotic ↑, ambitious ↓
 *  need:crisis_repeated       → neurotic ↑
 */

const STEP          = 0.008;   // base drift per event
const LOSS_AVERSION = 1.4;     // negative events move traits harder
const CAP           = 0.30;    // max drift from born value per axis

const RULES = [
  // [ eventName, traitDeltas, condition ]
  ['social:interaction', (d, ev) => {
    if (ev.delta > 10)  return { outgoing: +d, nice: +d * 0.5 };
    if (ev.delta < -10) return { outgoing: -d * LOSS_AVERSION, neurotic: +d * LOSS_AVERSION };
    return null;
  }],
  ['career:levelUp',   () => ({ ambitious: +STEP, neurotic: -STEP * 0.5 })],
  ['career:fired',     () => ({ neurotic: +STEP * LOSS_AVERSION, ambitious: -STEP })],
  ['sim:moodChanged',  (d, ev) => {
    if (ev.to === 'ecstatic')  return { neurotic: -d * 0.5, playful: +d * 0.5 };
    if (ev.to === 'miserable') return { neurotic: +d * LOSS_AVERSION, ambitious: -d };
    return null;
  }],
  ['need:crisis',      () => ({ neurotic: +STEP * LOSS_AVERSION })],
  ['life:loner',       () => ({ outgoing: -STEP, playful: -STEP * 0.5 })],
  ['romance:formed',   () => ({ outgoing: +STEP, nice: +STEP })],
  ['romance:broken',   () => ({ neurotic: +STEP * LOSS_AVERSION, nice: -STEP })],
];

export class PersonalityDrift {
  constructor(personality) {
    this._p    = personality;
    // Snapshot of born values for cap enforcement
    this._born = {
      outgoing:  personality.outgoing,
      neurotic:  personality.neurotic,
      playful:   personality.playful,
      nice:      personality.nice,
      ambitious: personality.ambitious,
    };
    this._listeners = [];
    this._registerListeners();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _registerListeners() {
    for (const [event, deltaFn] of RULES) {
      const handler = (ev) => {
        const deltas = deltaFn(STEP, ev);
        if (!deltas) return;
        this._apply(deltas);
      };
      bus.on(event, handler);
      this._listeners.push({ event, handler });
    }
  }

  _apply(deltas) {
    for (const [trait, delta] of Object.entries(deltas)) {
      if (!(trait in this._p)) continue;
      const born    = this._born[trait];
      const current = this._p[trait];
      const next    = current + delta;
      // Clamp: must stay within [-1,+1] AND within ±CAP of born
      const lo      = Math.max(-1, born - CAP);
      const hi      = Math.min( 1, born + CAP);
      this._p[trait] = Math.max(lo, Math.min(hi, next));
    }
    bus.emit('personality:drifted', { traits: this._p.serialise() });
  }

  /** Expose current drift from born values for UI/debug. */
  driftReport() {
    const out = {};
    for (const trait of Object.keys(this._born)) {
      out[trait] = +(this._p[trait] - this._born[trait]).toFixed(4);
    }
    return out;
  }

  serialise() { return { born: { ...this._born } }; }

  restore(data) {
    if (data?.born) Object.assign(this._born, data.born);
  }

  destroy() {
    for (const { event, handler } of this._listeners) bus.off(event, handler);
    this._listeners = [];
  }
}
