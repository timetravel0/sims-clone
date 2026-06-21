import { WalkToAction, UseObjectAction } from './Action.js';
import { memorySystem }                  from '../systems/MemorySystem.js';
import { Logger }                        from '../utils/Logger.js';

const NEED_EMOJI = {
  hunger:  '🍔 Hungry',
  energy:  '😴 Sleepy',
  bladder: '🚽 Need WC',
  hygiene: '🚿 Dirty',
  social:  '👋 Lonely',
  fun:     '🎮 Bored',
  comfort: '🛋️ Tired',
  room:    '🌿 Stuffy',
};

// Per-need urgency threshold: act when need drops below this value
const THRESHOLD = {
  hunger:  40,
  energy:  35,
  bladder: 50,
  hygiene: 30,
  social:  35,
  fun:     30,
  comfort: 25,
  room:    20,
};

export class NeedDrivenPlanner {
  constructor(sim) {
    this._sim = sim;
    this.lastNeedLabel = '';
  }

  plan() {
    // Find the most urgent need below its threshold
    let worstKey = null;
    let worstVal = Infinity;
    const vals = this._sim.needs.getAll();
    for (const [key, threshold] of Object.entries(THRESHOLD)) {
      const val = vals[key] ?? 100;
      if (val < threshold && val < worstVal) { worstVal = val; worstKey = key; }
    }
    if (!worstKey) return [];

    // Emit need:crisis when critically low
    if (worstVal < 15) {
      const { bus } = await import('../core/EventBus.js').catch(() => ({ bus: null }));
      // Use synchronous path instead
      this._emitCrisis(worstKey, worstVal);
    }

    // Find furniture — with memory bias:
    // If this Sim has a negative memory associated with a piece of furniture
    // (e.g., broke down there), try alternate furniture for the same need.
    const furniture = this._chooseFurniture(worstKey);
    if (!furniture) { Logger.warn(`[Planner] No furniture for: ${worstKey}`); return []; }

    this.lastNeedLabel = NEED_EMOJI[worstKey] || worstKey;
    Logger.info(`[Planner] "${worstKey}" (${Math.round(worstVal)}) → ${furniture.id}`);

    const targetGz = furniture.gz + 1 < 16 ? furniture.gz + 1 : furniture.gz - 1;
    return [
      new WalkToAction(this._sim, this._sim._world, furniture.gx, targetGz),
      new UseObjectAction(this._sim, furniture, 6),
    ];
  }

  _emitCrisis(need, value) {
    // Dynamically import-safe crisis emit using a stored bus reference
    if (!this._bus) {
      // Lazy-load synchronously from already-loaded module cache
      try { this._bus = require('../core/EventBus.js')?.bus; } catch(e) {}
    }
    // Fallback: fire via custom event so MemorySystem picks it up
    window.dispatchEvent(new CustomEvent('sim:need:crisis', {
      detail: { simId: this._sim.id, need, value }
    }));
  }

  /**
   * Choose furniture for a need, biased by memory.
   * If the Sim has a negative memory involving the primary furniture for this need,
   * penalise it and prefer an alternative if one exists.
   */
  _chooseFurniture(needKey) {
    const candidates = this._sim._world.furniture.filter(f => f.needTarget === needKey);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Score each candidate: start at 1.0, subtract negative memory intensity
    let best = null, bestScore = -Infinity;
    for (const f of candidates) {
      const memScore = memorySystem.biasWith(this._sim.id, `furniture:${f.id}`);
      const score    = 1.0 + memScore; // +1 for no memory, < 1 for bad memories
      if (score > bestScore) { bestScore = score; best = f; }
    }
    return best;
  }
}
