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
    this._lastMoodTier   = null;
    this._playerOverride = false;
    this._overrideTimer  = 0; // safety timeout so override never locks AI forever
  }

  /**
   * Inject player-driven actions.
   * Sets a safety timer: if the queue is still running after 30s, release override.
   */
  override(actions) {
    this._queue.clear();
    const list = Array.isArray(actions) ? actions : [actions];
    this._queue.push(...list);
    this._playerOverride = true;
    this._overrideTimer  = 30; // seconds
  }

  update(dt) {
    // Tick override safety timer
    if (this._playerOverride) {
      this._overrideTimer -= dt;
      if (this._overrideTimer <= 0 || this._queue.isEmpty()) {
        this._playerOverride = false;
        this._overrideTimer  = 0;
      }
    }

    // Advance current action queue
    this._queue.update(dt);
    if (this._socialCooldown > 0) this._socialCooldown -= dt;

    // Neurotic mood crash: only interrupt AI tasks, never player override
    const p = this._sim.personality;
    if (!this._playerOverride &&
        p.neurotic > 0.4 &&
        this._sim.mood.tier === 'miserable' &&
        this._lastMoodTier !== 'miserable') {
      this._queue.clear();
    }
    this._lastMoodTier = this._sim.mood?.tier ?? null;

    // While player override is active, don't plan
    if (this._playerOverride) return;

    // Queue is busy with AI actions — wait
    if (!this._queue.isEmpty()) return;

    // ── AI planning ──────────────────────────────────────────────────────────

    // 1. Physical / primary needs (hunger, energy, bladder, hygiene, comfort…)
    const needActions = this._planner.plan();
    if (needActions.length > 0) {
      this._sim.showBubble(this._planner.lastNeedLabel);
      this._queue.push(...needActions);
      return;
    }

    // 2. Social need (only when physical needs are satisfied)
    const socialVal   = this._sim.needs.get('social');
    const threshold   = 40 + p.outgoing * 20;
    if (socialVal < threshold && this._socialCooldown <= 0) {
      const target = this._findSocialTarget();
      if (target) {
        this._socialCooldown = p.outgoing > 0 ? 10 : 25;
        this._queue.push(new SocialAction(this._sim, target, this._sim._world));
        return;
      }
    }

    // 3. Idle — short for playful sims, longer for introverts
    const idleDur = p.playful > 0.3 ? 1.5 : 3.5;
    this._queue.push(new IdleAction(this._sim, idleDur));
  }

  _findSocialTarget() {
    const game = window._game;
    if (!game) return null;
    const others = game.sims.filter(s => s.id !== this._sim.id);
    return others.length ? others[Math.floor(Math.random() * others.length)] : null;
  }

  get busy() { return !this._queue.isEmpty(); }
}
