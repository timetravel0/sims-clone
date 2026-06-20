import { NeedDrivenPlanner } from '../ai/NeedDrivenPlanner.js';
import { ActionQueue } from '../ai/ActionQueue.js';
import { IdleAction } from '../ai/Action.js';
import { Logger } from '../utils/Logger.js';

export class SimBrain {
  constructor(sim) {
    this._sim = sim;
    this._planner = new NeedDrivenPlanner(sim);
    this._queue = new ActionQueue();
  }

  /** Called each tick */
  update(dt) {
    this._queue.update(dt);

    // If idle and a need is critical, plan
    if (this._queue.isEmpty()) {
      const actions = this._planner.plan();
      if (actions.length > 0) {
        Logger.info(`[Brain] Planning ${actions.length} action(s) for need: ${actions[0].label}`);
        this._queue.push(...actions);
      } else {
        this._queue.push(new IdleAction(this._sim, 3));
      }
    }
  }

  /** Force a walk-to action (player click) */
  override(action) {
    this._queue.clear();
    this._queue.push(action);
  }

  get busy() { return !this._queue.isEmpty(); }
}
