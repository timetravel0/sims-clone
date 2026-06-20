import { NeedDrivenPlanner } from '../ai/NeedDrivenPlanner.js';
import { ActionQueue } from '../ai/ActionQueue.js';
import { IdleAction } from '../ai/Action.js';
import { Logger } from '../utils/Logger.js';

export class SimBrain {
  constructor(sim) {
    this._sim = sim;
    this._planner = new NeedDrivenPlanner(sim);
    this._queue   = new ActionQueue();
  }
  update(dt) {
    this._queue.update(dt);
    if (this._queue.isEmpty()) {
      const actions = this._planner.plan();
      if (actions.length > 0) {
        this._sim.showBubble(this._planner.lastNeedLabel);
        this._queue.push(...actions);
      } else {
        this._queue.push(new IdleAction(this._sim, 3));
      }
    }
  }
  override(action) { this._queue.clear(); this._queue.push(action); }
  get busy() { return !this._queue.isEmpty(); }
}
