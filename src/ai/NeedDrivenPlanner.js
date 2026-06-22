import { WalkToAction, UseObjectAction } from './Action.js';
import { memorySystem }                  from '../systems/MemorySystem.js';
import { Logger }                        from '../utils/Logger.js';
import { bus }                           from '../core/EventBus.js';

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

const CRISIS_THRESHOLD = 15;
const CRISIS_COOLDOWN_TICKS = 180;

export class NeedDrivenPlanner {
  constructor(sim) {
    this._sim = sim;
    this.lastNeedLabel = '';
    this._lastCrisisTickByNeed = new Map();
  }

  plan() {
    // Find the most urgent need below its threshold
    const { key: worstKey, value: worstVal } = this._mostUrgentNeed();
    if (!worstKey) return [];

    return this.planFor(worstKey);
  }

  planFor(needKey, opts = {}) {
    if (!needKey) return [];
    const value = this._sim.needs.get(needKey);
    if (!opts.force && value >= (THRESHOLD[needKey] ?? 100)) return [];

    if (value < CRISIS_THRESHOLD) this._emitCrisis(needKey, value);

    // Find furniture — with memory bias:
    // If this Sim has a negative memory associated with a piece of furniture
    // (e.g., broke down there), try alternate furniture for the same need.
    const furniture = this._chooseFurniture(needKey);
    if (!furniture) { Logger.warn(`[Planner] No furniture for: ${needKey}`); return []; }
    if (!this._sim._world.reserveFurniture(furniture, this._sim)) {
      Logger.warn(`[Planner] Furniture busy for: ${needKey}`);
      return [];
    }

    this.lastNeedLabel = NEED_EMOJI[needKey] || needKey;
    Logger.info(`[Planner] "${needKey}" (${Math.round(value)}) → ${furniture.id}`);

    const targetGz = furniture.gz + 1 < 16 ? furniture.gz + 1 : furniture.gz - 1;
    return [
      new WalkToAction(this._sim, this._sim._world, furniture.gx, targetGz),
      new UseObjectAction(this._sim, furniture, 6),
    ];
  }

  _mostUrgentNeed() {
    let worstKey = null;
    let worstVal = Infinity;
    const vals = this._sim.needs.getAll();
    for (const [key, threshold] of Object.entries(THRESHOLD)) {
      const val = vals[key] ?? 100;
      if (val < threshold && val < worstVal) { worstVal = val; worstKey = key; }
    }
    return { key: worstKey, value: worstVal };
  }

  _emitCrisis(need, value) {
    const tick = globalThis.window?._game?.tick ?? 0;
    const key = `${this._sim.id}:${need}`;
    const last = this._lastCrisisTickByNeed.get(key) ?? -Infinity;
    if (tick - last < CRISIS_COOLDOWN_TICKS) return;
    this._lastCrisisTickByNeed.set(key, tick);
    bus.emit('need:crisis', {
      simId: this._sim.id,
      simName: this._sim.name,
      need,
      value,
    });
  }

  /**
   * Choose furniture for a need, biased by memory.
   * If the Sim has a negative memory involving the primary furniture for this need,
   * penalise it and prefer an alternative if one exists.
   */
  _chooseFurniture(needKey) {
    const candidates = this._sim._world.furniture.filter(f =>
      f.needTarget === needKey &&
      !f.inUse &&
      (!f.reservedBy || f.reservedBy === this._sim.id)
    );
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
