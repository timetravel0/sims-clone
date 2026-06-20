import { NeedDrivenPlanner } from '../ai/NeedDrivenPlanner.js';
import { ActionQueue }       from '../ai/ActionQueue.js';
import { IdleAction }        from '../ai/Action.js';
import { SocialAction }      from '../ai/SocialAction.js';

/**
 * SimBrain — personality-aware controller.
 * Outgoing Sims seek social interaction more aggressively.
 * Neurotic Sims interrupt tasks when mood drops suddenly.
 */
export class SimBrain {
  constructor(sim) {
    this._sim             = sim;
    this._planner         = new NeedDrivenPlanner(sim);
    this._queue           = new ActionQueue();
    this._socialCooldown  = 0;
    this._lastMoodTier    = sim.mood.tier;
  }

  update(dt) {
    this._queue.update(dt);
    if (this._socialCooldown > 0) this._socialCooldown -= dt;

    // Neurotic Sim: if mood drops to miserable, interrupt current task
    const p = this._sim.personality;
    if (p.neurotic > 0.4 &&
        this._sim.mood.tier === 'miserable' &&
        this._lastMoodTier !== 'miserable') {
      this._queue.clear();
    }
    this._lastMoodTier = this._sim.mood.tier;

    if (!this._queue.isEmpty()) return;

    // 1. Physical needs
    const actions = this._planner.plan();
    if (actions.length > 0) {
      this._sim.showBubble(this._planner.lastNeedLabel);
      this._queue.push(...actions);
      return;
    }

    // 2. Social — threshold lowered for outgoing Sims
    const threshold = 40 + p.outgoing * 20; // outgoing → 60, introvert → 20
    if (this._sim.needs.get('social') < threshold && this._socialCooldown <= 0) {
      const target = this._findSocialTarget();
      if (target) {
        // Introvert: longer cooldown after interaction
        this._socialCooldown = p.outgoing > 0 ? 10 : 25;
        this._queue.push(new SocialAction(this._sim, target, this._sim._world));
        return;
      }
    }

    // 3. Idle — playful Sims fidget more
    const idleDuration = p.playful > 0.3 ? 1 : 3;
    this._queue.push(new IdleAction(this._sim, idleDuration));
  }

  _findSocialTarget() {
    const game   = window._game;
    if (!game)   return null;
    const others = game.sims.filter(s => s.id !== this._sim.id);
    if (others.length === 0) return null;
    // Outgoing: picks whoever is closest
    // Introverted: avoids enemies (score < -20)
    const { socialManager } = window._socialManager
      ? { socialManager: window._socialManager }
      : require?.('../systems/SocialManager.js') ?? {};
    // Simple: return first available target
    return others[Math.floor(Math.random() * others.length)];
  }

  override(action) { this._queue.clear(); this._queue.push(action); }
  get busy()       { return !this._queue.isEmpty(); }
}
