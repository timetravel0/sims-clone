/**
 * ContextualNoise — replaces flat Math.random() in the AI scorer.
 *
 * Produces a deterministic-but-varied noise value in [0, 1] that depends on:
 *  1. Sim seed (stable per individual)
 *  2. In-game hour (circadian rhythm — Sims are more social in the evening)
 *  3. Current mood tier (miserable Sims undervalue social affordances)
 *  4. Affordance type (objects vs. social interactions have different noise profiles)
 *
 * The result is NOT truly random — the same Sim in the same hour with the same
 * mood will produce a consistent noise band, making behaviour *predictable within
 * a character* while still being diverse across Sims and across time.
 *
 * Uses a simple hash-based pseudo-noise function (no external dependencies).
 */

const MOOD_NOISE_MOD = {
  ecstatic:  1.4,
  happy:     1.1,
  neutral:   1.0,
  sad:       0.7,
  miserable: 0.4,
};

// Dominant emotion → { social multiplier, object multiplier }
// fear/anger dampen social drive; joy amplifies it; sadness → slight object comfort-seeking
const EMOTION_NOISE_MOD = {
  joy:     { social: 1.3, object: 1.1 },
  love:    { social: 1.4, object: 1.0 },
  anger:   { social: 0.75, object: 0.9 },
  fear:    { social: 0.55, object: 1.0 },
  sadness: { social: 0.65, object: 1.15 },
};

// Hour-of-day social energy curve (0–23)
const HOUR_SOCIAL_CURVE = [
  0.3, 0.2, 0.15, 0.1, 0.1, 0.2,   // 0-5  (night / early morning)
  0.4, 0.6, 0.75, 0.85, 0.9, 0.95, // 6-11 (morning rise)
  1.0, 0.95, 0.9, 0.85, 0.9, 1.0,  // 12-17 (afternoon)
  1.1, 1.15, 1.2, 1.1, 0.8, 0.5,   // 18-23 (evening peak → wind-down)
];

// Night-owl shift for neurotic Sims (neurotic > 0.4): peak social 2h later, morning lower
const HOUR_SOCIAL_CURVE_NEUROTIC = [
  0.5, 0.35, 0.2, 0.1, 0.1, 0.15,  // 0-5  (still up late, but fading)
  0.2, 0.35, 0.55, 0.7, 0.8, 0.88, // 6-11 (slow morning rise)
  0.95, 0.9, 0.88, 0.85, 0.9, 1.0, // 12-17 (afternoon)
  1.05, 1.15, 1.25, 1.2, 1.0, 0.7, // 18-23 (peak shifted later)
];

export class ContextualNoise {
  /**
   * @param {string|number} simSeed    — stable per-Sim identifier
   * @param {Function}      getClock  — () => { hour: number }
   * @param {Function}      getMood   — () => string tier
   * @param {Function}      getEmotion — () => string|null dominant emotion type
   * @param {number}        neurotic  — personality neurotic trait [-1,+1]
   */
  constructor(simSeed, getClock, getMood, getEmotion = null, neurotic = 0) {
    this._seed       = this._hashStr(String(simSeed));
    this._getClock   = getClock;
    this._getMood    = getMood;
    this._getEmotion = getEmotion;
    this._nightOwl   = neurotic > 0.4;
    this._frame      = 0;
  }

  /**
   * Sample noise for a specific affordance.
   * Returns a value in [0, noiseMagnitude] that gets ADDED to the utility score.
   * @param {object} affordance
   * @param {number} noiseMagnitude  — max noise contribution (default 4.0)
   */
  sample(affordance, noiseMagnitude = 4.0) {
    this._frame++;
    const hour      = this._getClock()?.hour ?? 12;
    const moodTier  = this._getMood() ?? 'neutral';
    const isSocial  = affordance?.targetType === 'sim';

    // Base pseudo-random value (0–1) seeded by sim + affordance key + frame
    const affordKey = `${affordance?.verb}:${affordance?.target?.id ?? 'obj'}`;
    const raw       = this._noise(this._seed, this._hashStr(affordKey), this._frame);

    // Circadian modulation — neurotic Sims use a night-owl curve
    const curve     = this._nightOwl ? HOUR_SOCIAL_CURVE_NEUROTIC : HOUR_SOCIAL_CURVE;
    const circadian = curve[hour] ?? 1.0;
    const typeBoost = isSocial ? circadian : 1.0;

    // Mood modulation
    const moodMod   = MOOD_NOISE_MOD[moodTier] ?? 1.0;

    // Dominant emotion modulation (joy opens up, fear/anger closes down)
    const emotion   = this._getEmotion?.() ?? null;
    const emoMods   = EMOTION_NOISE_MOD[emotion] ?? null;
    const emoMod    = emoMods ? (isSocial ? emoMods.social : emoMods.object) : 1.0;

    return raw * noiseMagnitude * typeBoost * moodMod * emoMod;
  }

  /** Deterministic noise: maps (a, b, c) integers → [0, 1]. */
  _noise(a, b, c) {
    let h = (a ^ (b << 13) ^ (c * 1664525 + 1013904223)) >>> 0;
    h ^= (h >>> 16);
    h  = (h * 0x45d9f3b) >>> 0;
    h ^= (h >>> 16);
    return (h >>> 0) / 0xffffffff;
  }

  _hashStr(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
  }

  resetFrame() { this._frame = 0; }
}
