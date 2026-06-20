import { WalkToAction, UseObjectAction } from './Action.js';
import { Logger } from '../utils/Logger.js';

/**
 * Translates the Sim's most critical need into a [WalkTo → UseObject] action pair.
 */
export class NeedDrivenPlanner {
  constructor(sim) {
    this._sim = sim;
  }

  plan() {
    const need = this._sim.needs.mostCritical(35);
    if (!need) return [];

    const furniture = this._sim._world.getFurnitureFor(need);
    if (!furniture) {
      Logger.warn(`[Planner] No furniture found for need: ${need}`);
      return [];
    }

    Logger.info(`[Planner] Need "${need}" critical → heading to ${furniture.id}`);

    // Walk to cell adjacent to furniture if furniture cell is blocked
    const tx = furniture.gx;
    const tz = furniture.gz + 1; // one cell south

    return [
      new WalkToAction(this._sim, this._sim._world, tx, tz),
      new UseObjectAction(this._sim, furniture, 6),
    ];
  }
}
