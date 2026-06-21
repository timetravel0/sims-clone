import { bus } from '../core/EventBus.js';

export const MOOD_TIER = {
  ecstatic:  { min: 75,   label: 'Ecstatic',  emoji: '🌟', color: '#ffd54f' },
  happy:     { min: 35,   label: 'Happy',      emoji: '😊', color: '#a5d6a7' },
  neutral:   { min: -10,  label: 'Neutral',    emoji: '😐', color: '#aaa'    },
  sad:       { min: -40,  label: 'Sad',        emoji: '😢', color: '#90caf9' },
  miserable: { min: -101, label: 'Miserable',  emoji: '😫', color: '#ef9a9a' },
};

const TIERS = Object.entries(MOOD_TIER).sort((a, b) => b[1].min - a[1].min);

export class Mood {
  constructor(sim) {
    this._sim  = sim;
    this.score = 0;
    this._tier = 'neutral';
  }

  /**
   * @param {object} needsValues
   * @param {Personality} personality
   * @param {number} [emotionBonus=0]  — from SimEmotions.moodBonus (Sprint 1)
   */
  recalculate(needsValues, personality, emotionBonus = 0) {
    const vals = Object.values(needsValues);
    const avg  = vals.reduce((s, v) => s + v, 0) / vals.length;
    let score  = (avg - 50) * 1.5;
    if (personality.neurotic   > 0 && score < 0) score *= 1 + personality.neurotic  * 0.5;
    if (personality.ambitious  > 0 && score < 0) score *= 1 + personality.ambitious * 0.3;
    // Apply secondary emotion bonus (clamped so emotions can't dominate entirely)
    score += Math.max(-25, Math.min(25, emotionBonus));
    this.score = Math.max(-100, Math.min(100, score));
    this._checkTierChange(personality);
  }

  _checkTierChange(personality) {
    const newTier = TIERS.find(([, t]) => this.score >= t.min)?.[0] ?? 'miserable';
    if (newTier !== this._tier) {
      const old = this._tier;
      this._tier = newTier;
      bus.emit('sim:moodChanged', {
        simId: this._sim.id,
        simName: this._sim.name,
        name:  this._sim.name,
        from:  old,
        to:    newTier,
        tier:  MOOD_TIER[newTier],
        personality: personality.describe(),
      });
    }
  }

  get tier()  { return this._tier; }
  get info()  { return MOOD_TIER[this._tier]; }
  get label() { return this.info.label; }
  get emoji() { return this.info.emoji; }

  serialise()  { return { score: this.score, tier: this._tier }; }
  restore(d)   { this.score = d.score; this._tier = d.tier; }
}
