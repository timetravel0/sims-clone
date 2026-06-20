import { NeedDrivenPlanner } from '../ai/NeedDrivenPlanner.js';
import { ActionQueue }       from '../ai/ActionQueue.js';
import { IdleAction }        from '../ai/Action.js';
import { SocialAction }      from '../ai/SocialAction.js';

export class SimBrain {
  constructor(sim) {
    this._sim            = sim;
    this._planner        = new NeedDrivenPlanner(sim);
    this._queue          = new ActionQueue();
    this._socialCooldown = 0;
    this._lastMoodTier   = sim.mood.tier;
    this._playerOverride = false; // true while player-driven action is running
  }

  /**
   * override() — player (or drama engine) injects actions.
   * Accepts a single Action or an array of Actions.
   * Sets _playerOverride so AI won't interrupt immediately.
   */
  override(actions) {
    this._queue.clear();
    const list = Array.isArray(actions) ? actions : [actions];
    this._queue.push(...list);
    this._playerOverride = true;
  }

  update(dt) {
    this._queue.update(dt);
    if (this._socialCooldown > 0) this._socialCooldown -= dt;

    // Neurotic mood crash: interrupt only AI tasks, never player overrides
    const p = this._sim.personality;
    if (!this._playerOverride &&
        p.neurotic > 0.4 &&
        this._sim.mood.tier === 'miserable' &&
        this._lastMoodTier !== 'miserable') {
      this._queue.clear();
    }
    this._lastMoodTier = this._sim.mood.tier;

    // Once queue is empty, clear override flag
    if (this._queue.isEmpty()) this._playerOverride = false;
    if (!this._queue.isEmpty()) return;

    // --- AI planning (only when player hasn't taken over) ---
    // 1. Physical needs
    const actions = this._planner.plan();
    if (actions.length > 0) {
      this._sim.showBubble(this._planner.lastNeedLabel);
      this._queue.push(...actions);
      return;
    }

    // 2. Social need
    const threshold = 40 + p.outgoing * 20;
    if (this._sim.needs.get('social') < threshold && this._socialCooldown <= 0) {
      const target = this._findSocialTarget();
      if (target) {
        this._socialCooldown = p.outgoing > 0 ? 10 : 25;
        this._queue.push(new SocialAction(this._sim, target, this._sim._world));
        return;
      }
    }

    // 3. Idle
    this._queue.push(new IdleAction(this._sim, p.playful > 0.3 ? 1 : 3));
  }

  _findSocialTarget() {
    const game = window._game;
    if (!game) return null;
    const others = game.sims.filter(s => s.id !== this._sim.id);
    return others.length ? others[Math.floor(Math.random() * others.length)] : null;
  }

  get busy() { return !this._queue.isEmpty(); }
}
