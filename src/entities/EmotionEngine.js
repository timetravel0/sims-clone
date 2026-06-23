import { bus } from '../core/EventBus.js';
import cfg from '../config/gameConfig.js';

/**
 * EmotionEngine — two-layer emotion model for a single Sim.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *
 *  Layer 1 — Baseline mood (slow)
 *    Derived from SimNeeds average + personality neurotic/playful traits.
 *    Updates every BASE_UPDATE_INTERVAL sim-seconds.
 *    Maps to a MoodTier: miserable | sad | neutral | happy | ecstatic
 *
 *  Layer 2 — Momentary emotion (fast, spiky)
 *    Triggered by bus events (social interaction, object use, life events).
 *    Each spike has: type, intensity, duration, decayRate.
 *    Multiple spikes stack and decay independently.
 *    The net spike biases the displayed mood tier by up to ±2 steps.
 *
 *  Combined tier = clamp(baselineTier + netSpikeBias, 0, 4)
 *
 * ── Emotion types ────────────────────────────────────────────────────────────
 *  joy, anger, sadness, fear, surprise, embarrassment, love, pride, guilt
 *  Each maps to a mood-tier delta and an animation hint.
 *
 * ── Personality modulation ───────────────────────────────────────────────────
 *  neurotic  → spikes hit harder (+30% intensity), decay slower
 *  playful   → joy spikes hit harder, anger spikes softer
 *  nice      → guilt/embarrassment spikes hit harder
 *  outgoing  → social spikes hit harder
 *
 * ── Output ───────────────────────────────────────────────────────────────────
 *  .tier        → MoodTier string (for ContextualNoise, UtilityAIPlanner)
 *  .emotion     → dominant momentary emotion type (for animations)
 *  .moodValue   → 0-100 numeric (for UI progress bar)
 */

export const MOOD_TIERS = ['miserable','sad','neutral','happy','ecstatic'];

export const EMOTION_TYPES = {
  JOY           : 'joy',
  ANGER         : 'anger',
  SADNESS       : 'sadness',
  FEAR          : 'fear',
  SURPRISE      : 'surprise',
  EMBARRASSMENT : 'embarrassment',
  LOVE          : 'love',
  PRIDE         : 'pride',
  GUILT         : 'guilt',
};

const EMOTION_TIER_DELTA = cfg.emotionTierDelta;

const BASE_UPDATE_INTERVAL = 5;  // sim-seconds between baseline recalculations

export class EmotionEngine {
  /**
   * @param {object} sim         — the owning Sim
   * @param {object} needs       — SimNeeds instance
   * @param {object} personality — Personality instance
   */
  constructor(sim, needs, personality) {
    this._sim         = sim;
    this._needs       = needs;
    this._p           = personality;

    this._baselineTier  = 2;   // neutral
    this._baseTimer     = 0;
    this._spikes        = [];  // ActiveSpike[]
    this._prevTier      = 2;

    this._handlers = [];
    this._registerListeners();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Combined mood tier string. */
  get tier() { return MOOD_TIERS[this._combinedTierIdx()]; }

  /** Dominant momentary emotion (highest intensity spike) or null. */
  get emotion() {
    if (this._spikes.length === 0) return null;
    const top = this._spikes.reduce((a, b) => a.intensity > b.intensity ? a : b);
    return top.type;
  }

  /** 0-100 numeric mood value for UI. */
  get moodValue() {
    const tierBase  = this._combinedTierIdx() * 25;
    const spikeBonus = this._netSpikeValue() * 5;
    return Math.max(0, Math.min(100, tierBase + spikeBonus));
  }

  /** Active spikes (for debug / UI tooltip). */
  get spikes() { return [...this._spikes]; }

  /**
   * Inject an emotion spike.
   * @param {string} type      — EMOTION_TYPES value
   * @param {number} intensity — 0.0–1.0
   * @param {number} duration  — sim-seconds the spike lasts
   */
  spike(type, intensity, duration = 8) {
    const mod = this._personalityMod(type);
    const finalIntensity = Math.min(1, intensity * mod);
    this._spikes.push({
      type,
      intensity : finalIntensity,
      remaining : duration,
      decayRate : finalIntensity / duration,
    });
    bus.emit('emotion:spike',     { simId: this._sim.id, type, intensity: finalIntensity });
    bus.emit('emotion:triggered', {
      simId:    this._sim.id,
      simName:  this._sim.name,
      type,
      intensity: finalIntensity,
      def: { label: type.charAt(0).toUpperCase() + type.slice(1),
             emoji: '', moodDelta: EMOTION_TIER_DELTA[type] ?? 0 },
    });
  }

  /** Tick: decay spikes + periodically update baseline. */
  update(dt) {
    // Decay active spikes
    this._spikes = this._spikes
      .map(s => ({ ...s,
        remaining : s.remaining - dt,
        intensity : Math.max(0, s.intensity - s.decayRate * dt),
      }))
      .filter(s => s.remaining > 0 && s.intensity > 0.01);

    // Baseline recalculation
    this._baseTimer -= dt;
    if (this._baseTimer <= 0) {
      this._baseTimer = BASE_UPDATE_INTERVAL;
      this._recalcBaseline();
    }

    // Emit tier change event
    const current = this._combinedTierIdx();
    if (current !== this._prevTier) {
      bus.emit('sim:moodChanged', {
        simId : this._sim.id,
        from  : MOOD_TIERS[this._prevTier],
        to    : MOOD_TIERS[current],
      });
      this._prevTier = current;
    }
  }

  serialise() {
    return {
      baselineTier : this._baselineTier,
      spikes       : this._spikes.map(s => ({ ...s })),
    };
  }

  restore(data) {
    if (!data) return;
    this._baselineTier = data.baselineTier ?? 2;
    this._spikes       = (data.spikes ?? []).map(s => ({ ...s }));
    this._prevTier     = this._combinedTierIdx();
  }

  destroy() {
    for (const { event, handler } of this._handlers) bus.off(event, handler);
    this._handlers = [];
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _combinedTierIdx() {
    const bias = this._netSpikeValue();
    return Math.max(0, Math.min(4, Math.round(this._baselineTier + bias)));
  }

  /** Net tier bias from all active spikes [-2, +2]. */
  _netSpikeValue() {
    if (this._spikes.length === 0) return 0;
    let net = 0;
    for (const s of this._spikes) {
      net += EMOTION_TIER_DELTA[s.type] * s.intensity;
    }
    return Math.max(-2, Math.min(2, net));
  }

  _recalcBaseline() {
    // Average of all needs (0-100) → map to 0-4 tier
    const all   = this._needs.getAll();
    const vals  = Object.values(all);
    const avg   = vals.reduce((s, v) => s + v, 0) / vals.length;

    // Neurotic Sims have a depressed baseline
    const neuroticPenalty = Math.max(0, this._p.neurotic) * 15;
    // Playful Sims have a lifted baseline
    const playfulBonus    = Math.max(0, this._p.playful)  * 10;

    const adjusted = Math.max(0, Math.min(100, avg - neuroticPenalty + playfulBonus));

    // Map 0-100 → tier index 0-4
    this._baselineTier = Math.min(4, Math.floor(adjusted / 20));
  }

  _personalityMod(emotionType) {
    const p = this._p;
    switch (emotionType) {
      case EMOTION_TYPES.JOY          : return 1 + Math.max(0, p.playful)   * 0.4;
      case EMOTION_TYPES.ANGER        : return 1 + Math.max(0, p.neurotic)  * 0.5 - Math.max(0, p.nice) * 0.2;
      case EMOTION_TYPES.SADNESS      : return 1 + Math.max(0, p.neurotic)  * 0.4;
      case EMOTION_TYPES.FEAR         : return 1 + Math.max(0, p.neurotic)  * 0.6;
      case EMOTION_TYPES.LOVE         : return 1 + Math.max(0, p.outgoing)  * 0.3;
      case EMOTION_TYPES.PRIDE        : return 1 + Math.max(0, p.ambitious) * 0.4;
      case EMOTION_TYPES.GUILT        : return 1 + Math.max(0, p.nice)      * 0.5;
      case EMOTION_TYPES.EMBARRASSMENT: return 1 + Math.max(0, p.neurotic)  * 0.3;
      default: return 1;
    }
  }

  _registerListeners() {
    const self = this;

    const on = (event, handler) => {
      bus.on(event, handler);
      self._handlers.push({ event, handler });
    };

    on('social:interaction', ({ idA, delta, type }) => {
      if (idA !== self._sim.id) return;
      if ((delta ?? 0) > 8) {
        self.spike(EMOTION_TYPES.JOY, Math.min(1, delta / 30), 10);
        if (type === 'hug' || type === 'kiss')
          self.spike(EMOTION_TYPES.LOVE, Math.min(1, delta / 25), 15);
      } else if ((delta ?? 0) < -8) {
        self.spike(EMOTION_TYPES.ANGER, Math.min(1, -delta / 30), 12);
        if (type === 'insult')
          self.spike(EMOTION_TYPES.EMBARRASSMENT, 0.5, 8);
      }
    });

    on('object:used', ({ actorId, moodDelta }) => {
      if (actorId !== self._sim.id) return;
      if ((moodDelta ?? 0) > 5)  self.spike(EMOTION_TYPES.JOY,     Math.min(1, moodDelta / 20), 6);
      if ((moodDelta ?? 0) < -5) self.spike(EMOTION_TYPES.SADNESS, Math.min(1, -moodDelta / 20), 6);
    });

    on('career:levelUp', ({ simId }) => {
      if (simId !== self._sim.id) return;
      self.spike(EMOTION_TYPES.PRIDE, 0.9, 20);
      self.spike(EMOTION_TYPES.JOY,   0.7, 15);
    });

    on('career:fired', ({ simId }) => {
      if (simId !== self._sim.id) return;
      self.spike(EMOTION_TYPES.SADNESS, 0.8, 25);
      self.spike(EMOTION_TYPES.FEAR,    0.5, 15);
    });

    on('goal:completed', ({ simId }) => {
      if (simId !== self._sim.id) return;
      self.spike(EMOTION_TYPES.PRIDE, 0.7, 12);
      self.spike(EMOTION_TYPES.JOY,   0.6, 10);
    });

    on('goal:failed', ({ simId }) => {
      if (simId !== self._sim.id) return;
      self.spike(EMOTION_TYPES.SADNESS, 0.6, 15);
      self.spike(EMOTION_TYPES.GUILT,   0.4, 10);
    });

    on('romance:formed', ({ idA }) => {
      if (idA !== self._sim.id) return;
      self.spike(EMOTION_TYPES.LOVE, 1.0, 30);
      self.spike(EMOTION_TYPES.JOY,  0.9, 20);
    });

    on('romance:broken', ({ idA }) => {
      if (idA !== self._sim.id) return;
      self.spike(EMOTION_TYPES.SADNESS, 1.0, 40);
      self.spike(EMOTION_TYPES.ANGER,   0.5, 20);
    });

    // Flashback: re-encountering a Sim with strong negative memories triggers fear/anger
    on('sim:encountered', ({ observerId, subjectId, memorySystem }) => {
      if (observerId !== self._sim.id) return;
      if (!memorySystem) return;
      const bias = memorySystem.biasWith(subjectId);
      if (bias < -0.5) self.spike(EMOTION_TYPES.FEAR,  Math.min(1, -bias * 0.8), 10);
      if (bias > 0.6)  self.spike(EMOTION_TYPES.LOVE,  Math.min(1,  bias * 0.6),  8);
    });
  }
}
