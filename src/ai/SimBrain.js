/**
 * SimBrain — updated for Sprint 3
 *
 * Added:
 *  - canInterrupt(priority)  — used by ScheduleSystem
 *  - suggestFurniture(f, label) — schedule-driven furniture suggestion
 *  - suggestSocial(target, type, label) — schedule-driven social suggestion
 *  - _atWork guard (career locks the brain)
 */

import { NeedDrivenPlanner } from './NeedDrivenPlanner.js';
import { UtilityAIPlanner }  from './UtilityAIPlanner.js';
import { ActionQueue }       from './ActionQueue.js';
import { SocialAction }      from './SocialAction.js';
import { WalkToAction, UseObjectAction, IdleAction } from './Action.js';
import { bus } from '../core/EventBus.js';

const IDLE_AFTER = 4;          // seconds idle before replanning
const OVERRIDE_TIMEOUT = 30;   // max seconds for an override
const SCHEDULE_MIN_PRIORITY = 5;

export class SimBrain {
  constructor(sim) {
    this._sim          = sim;
    this._queue        = new ActionQueue(sim);
    this._planner      = new NeedDrivenPlanner(sim);
    this._utilityAI    = new UtilityAIPlanner(sim);
    this._idleTimer    = 0;
    this._overrideTimer = 0;
    this._isOverride   = false;
    this._schedulePriority = 0;
  }

  // ── public ────────────────────────────────────────────────────────────────

  override(actions) {
    this._queue.clear();
    for (const a of actions) this._queue.push(a);
    this._isOverride   = true;
    this._overrideTimer = 0;
    this._idleTimer    = 0;
    this._schedulePriority = 0;
  }

  /**
   * Can the ScheduleSystem interrupt the current activity?
   * Returns true only when the queue is idle or the incoming priority
   * is higher than the current schedule priority.
   */
  canInterrupt(priority) {
    if (this._sim._atWork) return false;
    if (this._queue.isEmpty()) return true;
    return priority > this._schedulePriority;
  }

  suggestFurniture(furniture, label) {
    if (this._sim._atWork) return;
    const world = this._sim._world;
    if (!world.reserveFurniture(furniture, this._sim)) return;
    const targetGz = furniture.gz + 1 < world.tilemap.height ? furniture.gz + 1 : furniture.gz - 1;
    this.override([
      new WalkToAction(this._sim, world, furniture.gx, targetGz),
      new UseObjectAction(this._sim, furniture, furniture.useDuration ?? 5),
    ]);
    this._schedulePriority = SCHEDULE_MIN_PRIORITY;
    bus.emit('sim:action', { simId: this._sim.id, label });
  }

  suggestSocial(target, type, label) {
    if (this._sim._atWork) return;
    this.override([new SocialAction(this._sim, target, this._sim._world, type)]);
    this._schedulePriority = SCHEDULE_MIN_PRIORITY;
    bus.emit('sim:action', { simId: this._sim.id, label });
  }

  update(dt) {
    // Career work-lock: Sim is at work — just tick the queue without replanning
    if (this._sim._atWork) {
      this._queue.update(dt);
      return;
    }

    // Override timeout safety
    if (this._isOverride) {
      this._overrideTimer += dt;
      if (this._overrideTimer >= OVERRIDE_TIMEOUT) {
        this._isOverride = false;
        this._queue.clear();
      }
    }

    this._queue.update(dt);

    if (this._queue.isEmpty()) {
      this._isOverride = false;
      this._schedulePriority = 0;
      this._idleTimer += dt;
      if (this._idleTimer >= IDLE_AFTER) {
        this._idleTimer = 0;
        this._plan();
      }
    } else {
      this._idleTimer = 0;
    }
  }

  // ── planning ──────────────────────────────────────────────────────────────

  _plan() {
    // 1. Utility AI (primary)
    const utilityActions = this._utilityAI.plan();
    if (utilityActions.length > 0) {
      for (const a of utilityActions) this._queue.push(a);
      return;
    }
    // 2. Legacy critical-need planner (fallback)
    const criticalActions = this._planner.plan();
    if (criticalActions.length > 0) {
      for (const a of criticalActions) this._queue.push(a);
      return;
    }
    // 3. Idle
    this._queue.push(new IdleAction(2 + Math.random() * 2));
  }
}
