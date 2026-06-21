import { bus } from '../core/EventBus.js';

/**
 * ExperientialBias — lightweight per-Sim reinforcement learning.
 *
 * Maintains a bias score per affordance key (verb:targetId or verb:furnitureType).
 * After every completed action the actual need deltas are compared to the expected
 * utility; the difference drives a small weight update (temporal-difference style).
 *
 * Key formula:
 *   bias(t+1) = bias(t) + α * (actualGain - expectedGain)
 *
 * α (learning rate) = 0.08 — slow enough to avoid noise overfitting.
 * Bias is clamped to [-15, +15] so it can never fully override need pressure.
 *
 * Serialisable for SaveLoad.
 */

const ALPHA       = 0.08;   // learning rate
const DECAY       = 0.002;  // passive decay per sim-second toward 0
const BIAS_MAX    = 15;
const BIAS_MIN    = -15;

export class ExperientialBias {
  constructor(simId) {
    this._simId  = simId;
    this._table  = new Map(); // affordanceKey → bias
    this._registerListeners();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Return bias for an affordance object. */
  get(affordance) {
    return this._table.get(this._key(affordance)) ?? 0;
  }

  /**
   * Called by UseObjectAction / SocialAction on completion.
   * @param {object} affordance  — the affordance that was executed
   * @param {object} needsBefore — snapshot of needs before action
   * @param {object} needsAfter  — snapshot of needs after action
   */
  recordOutcome(affordance, needsBefore, needsAfter) {
    const key      = this._key(affordance);
    const current  = this._table.get(key) ?? 0;

    // Actual gain: sum of positive need deltas weighted by urgency
    let actualGain = 0;
    for (const [need, after] of Object.entries(needsAfter)) {
      const before  = needsBefore[need] ?? after;
      const delta   = after - before;
      const urgency = (100 - before) / 100; // higher when need was low
      actualGain   += delta * urgency;
    }

    // Expected gain: sum of declared utility values
    let expectedGain = 0;
    for (const [, v] of Object.entries(affordance.utility || {})) {
      if (v > 0) expectedGain += v;
    }

    const error = actualGain - expectedGain;
    const updated = Math.max(BIAS_MIN, Math.min(BIAS_MAX, current + ALPHA * error));
    this._table.set(key, updated);

    bus.emit('bias:updated', { simId: this._simId, key, bias: updated, error });
  }

  /** Passive decay — call every game tick. */
  update(dt) {
    for (const [key, val] of this._table) {
      if (Math.abs(val) < 0.01) { this._table.delete(key); continue; }
      const decayed = val > 0
        ? Math.max(0, val - DECAY * dt)
        : Math.min(0, val + DECAY * dt);
      this._table.set(key, decayed);
    }
  }

  /** Top-N most biased affordance keys (for debugging / UI). */
  topPositive(n = 5) {
    return [...this._table.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }

  topNegative(n = 5) {
    return [...this._table.entries()]
      .filter(([, v]) => v < 0)
      .sort((a, b) => a[1] - b[1])
      .slice(0, n);
  }

  serialise()          { return Object.fromEntries(this._table); }
  restore(data)        { this._table = new Map(Object.entries(data).map(([k, v]) => [k, Number(v)])); }

  // ── Private ───────────────────────────────────────────────────────────────

  _key(affordance) {
    if (!affordance) return 'unknown';
    const targetId = affordance.target?.id ?? affordance.target?.type ?? 'env';
    return `${affordance.verb ?? affordance.action}:${targetId}`;
  }

  _registerListeners() {
    // SocialAction fires 'social:interaction' on completion — listen and
    // auto-record outcome using the valence as a proxy for actual gain.
    bus.on('social:interaction', ({ idA, delta, verb, targetId }) => {
      if (idA !== this._simId) return;
      const key     = `${verb ?? 'chat'}:${targetId}`;
      const current = this._table.get(key) ?? 0;
      // Map delta [-30,+30] → [-5,+5] gain signal
      const signal  = Math.max(-5, Math.min(5, delta / 6));
      const updated = Math.max(BIAS_MIN, Math.min(BIAS_MAX, current + ALPHA * signal * 10));
      this._table.set(key, updated);
    });
  }
}
