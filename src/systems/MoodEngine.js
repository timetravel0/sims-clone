/**
 * MoodEngine — Sprint 4
 * Computes the current Mood of a Sim as a weighted sum of:
 *   1. Needs satisfaction (weighted by need importance)
 *   2. Active weather modifier
 *   3. Recent memory valence (from MemorySystem)
 *   4. Skill mastery bonus
 *   5. Relationship happiness bonus
 *
 * Mood ∈ [-1, +1]. Five named buckets:
 *   ecstatic (>0.7), happy (0.3–0.7), neutral (-0.3–0.3),
 *   sad (-0.7– -0.3), miserable (<-0.7)
 *
 * Emits: mood:changed { sim, prev, next } when bucket changes.
 */
import { bus }           from '../core/EventBus.js';
import { weatherSystem } from './WeatherSystem.js';
import { skillSystem }   from './SkillSystem.js';

const NEED_WEIGHTS = {
  hunger:   0.25,
  energy:   0.20,
  bladder:  0.15,
  hygiene:  0.10,
  social:   0.10,
  fun:      0.10,
  comfort:  0.05,
  room:     0.05,
};

function bucket(v) {
  if (v >  0.7) return 'ecstatic';
  if (v >  0.3) return 'happy';
  if (v > -0.3) return 'neutral';
  if (v > -0.7) return 'sad';
  return 'miserable';
}

export class MoodEngine {
  constructor() {
    /** @type {Map<string, string>} simId → last bucket */
    this._lastBucket = new Map();
  }

  /**
   * Compute mood score for sim.
   * @param {object} sim — must have .needs.all(), .id, .memories?
   * @returns {number} mood in [-1,+1]
   */
  compute(sim) {
    // 1. Need satisfaction (each need 0–100 → normalised -1..+1)
    let needScore = 0;
    const needs = sim.needs?.all ? sim.needs.all() : {};
    for (const [name, weight] of Object.entries(NEED_WEIGHTS)) {
      const val = needs[name] ?? 50;
      needScore += ((val / 100) * 2 - 1) * weight;
    }

    // 2. Weather modifier (sum deltas, scale to [-0.15, +0.15])
    const deltas = weatherSystem.getMoodDeltas();
    let weatherMod = 0;
    for (const v of Object.values(deltas)) weatherMod += v;
    weatherMod = Math.max(-0.15, Math.min(0.15, weatherMod));

    // 3. Memory valence (average recent memories' valence if available)
    let memMod = 0;
    if (sim.memories?.recent) {
      const recent = sim.memories.recent(5); // last 5 memories
      if (recent.length > 0) {
        const avg = recent.reduce((s, m) => s + (m.valence ?? 0), 0) / recent.length;
        memMod = avg * 0.1; // scale
      }
    }

    // 4. Skill mastery bonus (+0.01 per skill level above 5)
    let skillBonus = 0;
    const skills = skillSystem.getSkills(sim);
    for (const v of Object.values(skills)) {
      if (v > 5) skillBonus += (v - 5) * 0.01;
    }
    skillBonus = Math.min(0.1, skillBonus);

    const total = needScore + weatherMod + memMod + skillBonus;
    const clamped = Math.max(-1, Math.min(1, total));

    // Emit on bucket change
    const prev = this._lastBucket.get(sim.id) ?? 'neutral';
    const next = bucket(clamped);
    if (prev !== next) {
      this._lastBucket.set(sim.id, next);
      bus.emit('mood:changed', { sim, prev, next });
    }

    return clamped;
  }

  getMoodLabel(sim) {
    return this._lastBucket.get(sim.id) ?? 'neutral';
  }
}

export const moodEngine = new MoodEngine();
