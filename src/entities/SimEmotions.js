import { bus }          from '../core/EventBus.js';

/**
 * SimEmotions — secondary emotional layer on top of Mood.
 *
 * Primary emotions (in Mood.js) are need-driven averages.
 * Secondary emotions emerge from memory clusters + personality + social context.
 *
 * Active emotions are transient states with:
 *   - type    : 'joy'|'jealousy'|'grief'|'pride'|'excitement'|'anger'|'loneliness'|'hope'
 *   - intensity: 0.0–1.0 (fades each tick)
 *   - moodDelta: how much it shifts the Mood score
 *
 * Only the highest-intensity emotion is "dominant" at any moment.
 * The dominant emotion is shown in the UI and influences brain decisions.
 */

export const EMOTION_DEF = {
  joy:        { emoji: '😄', color: '#ffd54f', moodDelta:  15, label: 'Joy'        },
  jealousy:   { emoji: '😒', color: '#ce93d8', moodDelta: -20, label: 'Jealousy'   },
  grief:      { emoji: '😢', color: '#90caf9', moodDelta: -25, label: 'Grief'      },
  pride:      { emoji: '😤', color: '#a5d6a7', moodDelta:  10, label: 'Pride'      },
  excitement: { emoji: '🤩', color: '#ffcc80', moodDelta:  20, label: 'Excitement' },
  anger:      { emoji: '😠', color: '#ef9a9a', moodDelta: -18, label: 'Anger'      },
  loneliness: { emoji: '🌧️', color: '#80cbc4', moodDelta: -12, label: 'Loneliness' },
  hope:       { emoji: '🌱', color: '#c8e6c9', moodDelta:   8, label: 'Hope'       },
};

const DECAY_RATE = 0.03; // intensity units/second — emotion lasts ~33s at full intensity

export class SimEmotions {
  constructor(sim) {
    this._sim    = sim;
    this._active = new Map(); // type → { intensity, moodDelta }
  }

  /**
   * Trigger an emotion.
   * If the same type is already active, intensity is refreshed (max).
   */
  trigger(type, intensity = 0.8) {
    const def = EMOTION_DEF[type];
    if (!def) return;
    const prev = this._active.get(type)?.intensity ?? 0;
    this._active.set(type, {
      intensity:  Math.min(1, Math.max(prev, intensity)),
      moodDelta:  def.moodDelta,
    });
    bus.emit('emotion:triggered', {
      simId:     this._sim.id,
      simName:   this._sim.name,
      type,
      intensity,
      def,
    });
  }

  /** Dominant emotion (highest intensity active one) */
  get dominant() {
    let best = null;
    for (const [type, state] of this._active) {
      if (!best || state.intensity > best.intensity) best = { type, ...state, def: EMOTION_DEF[type] };
    }
    return best; // null if no active emotions
  }

  /**
   * Combined mood delta from all active emotions.
   * Used by Mood.recalculate to add emotional layer.
   */
  get moodBonus() {
    let total = 0;
    for (const [, state] of this._active) {
      total += state.moodDelta * state.intensity;
    }
    return total;
  }

  update(dt) {
    for (const [type, state] of this._active) {
      state.intensity -= DECAY_RATE * dt;
      if (state.intensity <= 0) this._active.delete(type);
    }
    this._evaluateMemoryEmotions();
  }

  /**
   * Derive emotions from recent memories.
   * Called each tick — only triggers if a memory cluster is strong enough.
   */
  _evaluateMemoryEmotions() {
    const p    = this._sim.personality;
    const mems = this._sim.brain?.memory?.topN?.(1) ?? [];
    if (mems.length === 0) return;

    // Most intense recent memory
    const top = mems[0];
    if (top.intensity < 0.3) return; // too faded to matter

    if (top.type === 'social') {
      if (top.valence > 0.5 && top.intensity > 0.5) {
        this.trigger(p.playful > 0 ? 'joy' : 'hope', top.intensity * 0.6);
      } else if (top.valence < -0.4 && top.intensity > 0.5) {
        this.trigger(p.neurotic > 0.3 ? 'anger' : 'grief', top.intensity * 0.5);
      }
    }

    if (top.type === 'need_crisis') {
      this.trigger('loneliness', top.intensity * 0.4);
    }

    if (top.type === 'mood_peak') {
      if (top.valence > 0) this.trigger('pride', top.intensity * 0.5);
      else                 this.trigger('grief', top.intensity * 0.5);
    }

    // Jealousy: when this Sim has a positive memory with X,
    // and sees X interacting positively with someone else
    // (triggered externally via SimEmotions.trigger('jealousy'))
  }

  serialise() {
    const out = {};
    for (const [type, state] of this._active) out[type] = { intensity: state.intensity };
    return out;
  }

  restore(data) {
    this._active.clear();
    for (const [type, state] of Object.entries(data || {})) {
      this._active.set(type, { intensity: state.intensity, moodDelta: EMOTION_DEF[type]?.moodDelta ?? 0 });
    }
  }
}
