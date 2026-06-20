import { NeedDrivenPlanner } from '../ai/NeedDrivenPlanner.js';
import { ActionQueue }       from '../ai/ActionQueue.js';
import { IdleAction }        from '../ai/Action.js';
import { SocialAction }      from '../ai/SocialAction.js';

export class SimBrain {
  constructor(sim) {
    this._sim      = sim;
    this._planner  = new NeedDrivenPlanner(sim);
    this._queue    = new ActionQueue();
    this._socialCooldown = 0;
  }

  update(dt) {
    this._queue.update(dt);
    if (this._socialCooldown > 0) this._socialCooldown -= dt;

    if (this._queue.isEmpty()) {
      // 1. Physical needs first
      const actions = this._planner.plan();
      if (actions.length > 0) {
        this._sim.showBubble(this._planner.lastNeedLabel);
        this._queue.push(...actions);
        return;
      }
      // 2. Social need (seek another Sim if social < 40)
      if (this._sim.needs.get('social') < 40 && this._socialCooldown <= 0) {
        const target = this._findSocialTarget();
        if (target) {
          this._socialCooldown = 15;
          this._queue.push(new SocialAction(this._sim, target, this._sim._world));
          return;
        }
      }
      // 3. Idle
      this._queue.push(new IdleAction(this._sim, 3));
    }
  }

  _findSocialTarget() {
    const game = window._game;
    if (!game) return null;
    return game.sims.find(s => s.id !== this._sim.id) || null;
  }

  override(action) { this._queue.clear(); this._queue.push(action); }
  get busy() { return !this._queue.isEmpty(); }
}
