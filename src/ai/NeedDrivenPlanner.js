import { WalkToAction, UseObjectAction } from './Action.js';
import { Logger } from '../utils/Logger.js';

const NEED_EMOJI = {
  hunger:  '🍔 Hungry',
  energy:  '😴 Sleepy',
  bladder: '🚽 Need WC',
  hygiene: '🚿 Dirty',
  social:  '👋 Lonely',
  fun:     '🎮 Bored',
  comfort: '🛋 Tired',
  room:    '🌿 Stuffy',
};

// Per-need urgency threshold: act when need drops below this value
const THRESHOLD = {
  hunger:  40,
  energy:  35,
  bladder: 50, // bladder is fast — react earlier
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

  /**
   * Returns an action list if a physical need is critical, [] otherwise.
   * Uses per-need thresholds so bladder/hunger react earlier than fun/room.
   */
  plan() {
    // Find the most urgent need that has crossed its personal threshold
    let worstKey = null;
    let worstVal = Infinity;

    const vals = this._sim.needs.getAll();
    for (const [key, threshold] of Object.entries(THRESHOLD)) {
      const val = vals[key] ?? 100;
      if (val < threshold && val < worstVal) {
        worstVal = val;
        worstKey = key;
      }
    }

    if (!worstKey) return []; // all needs satisfied

    // Find closest furniture that satisfies this need
    const furniture = this._sim._world.getFurnitureFor(worstKey);
    if (!furniture) {
      Logger.warn(`[Planner] No furniture for need: ${worstKey}`);
      return [];
    }

    this.lastNeedLabel = NEED_EMOJI[worstKey] || worstKey;
    Logger.info(`[Planner] "${worstKey}" (${Math.round(worstVal)}) → ${furniture.id}`);

    // Walk to tile adjacent to furniture, then use it
    const targetGz = furniture.gz + 1 < 16 ? furniture.gz + 1 : furniture.gz - 1;
    return [
      new WalkToAction(this._sim, this._sim._world, furniture.gx, targetGz),
      new UseObjectAction(this._sim, furniture, 6),
    ];
  }
}
