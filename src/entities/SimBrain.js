import { NeedDrivenPlanner }  from '../ai/NeedDrivenPlanner.js';
import { UtilityAIPlanner }   from '../ai/UtilityAIPlanner.js';
import { ActionQueue }        from '../ai/ActionQueue.js';
import { IdleAction }         from '../ai/Action.js';
import { SocialAction }       from '../ai/SocialAction.js';
import { ExperientialBias }   from '../ai/ExperientialBias.js';
import { PersonalityDrift }   from '../ai/PersonalityDrift.js';
import { ContextualNoise }    from '../ai/ContextualNoise.js';
import { GoalSystem }         from '../ai/GoalSystem.js';
import { SocialLearning }     from '../ai/SocialLearning.js';

export class SimBrain {
  constructor(sim) {
    this._sim            = sim;
    this._planner        = new NeedDrivenPlanner(sim);
    this._utilityPlanner = new UtilityAIPlanner(sim);
    this._queue          = new ActionQueue();
    this._socialCooldown = 0;
    this._lastMoodTier   = null;
    this._playerOverride = false;
    this._overrideTimer  = 0;

    // ── Adaptive AI subsystems ──────────────────────────────────────────────
    this.expBias      = new ExperientialBias(sim.id);
    this.drift        = new PersonalityDrift(sim.personality);
    this.ctxNoise     = new ContextualNoise(
      sim.id,
      () => window._game?.clock,
      () => sim.mood?.tier
    );
    this.goalSystem   = new GoalSystem(sim);
    this.socialLearn  = new SocialLearning(sim, this.expBias);

    // Wire UtilityAIPlanner to use the new subsystems
    this._utilityPlanner.setBrain(this);
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
    this._overrideTimer  = 30;
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

    // Tick adaptive subsystems
    this.expBias.update(dt);
    const currentDay = window._game?.clock?.day ?? 0;
    this.goalSystem.update(dt, currentDay);
    this.ctxNoise.resetFrame();

    // Neurotic mood crash: only interrupt AI tasks, never player override
    const p = this._sim.personality;
    if (!this._playerOverride &&
        p.neurotic > 0.4 &&
        this._sim.mood.tier === 'miserable' &&
        this._lastMoodTier !== 'miserable') {
      this._queue.clear();
    }
    this._lastMoodTier = this._sim.mood?.tier ?? null;

    if (this._playerOverride)   return;
    if (!this._queue.isEmpty())  return;

    // ── AI planning ──────────────────────────────────────────────────────────

    // 1. Utility AI (now history-aware + goal-driven + contextual)
    const utilityActions = this._utilityPlanner.plan();
    if (utilityActions.length > 0) {
      this._sim.showBubble(this._utilityPlanner.lastDecision?.label || 'Act');
      this._queue.push(...utilityActions);
      return;
    }

    // 2. Legacy physical / primary needs fallback
    const needActions = this._planner.plan();
    if (needActions.length > 0) {
      this._sim.showBubble(this._planner.lastNeedLabel);
      this._queue.push(...needActions);
      return;
    }

    // 3. Legacy social need fallback
    const socialVal  = this._sim.needs.get('social');
    const threshold  = 40 + p.outgoing * 20;
    if (socialVal < threshold && this._socialCooldown <= 0) {
      const target = this._findSocialTarget();
      if (target) {
        this._socialCooldown = p.outgoing > 0 ? 10 : 25;
        this._queue.push(new SocialAction(this._sim, target, this._sim._world));
        return;
      }
    }

    // 4. Idle — short for playful sims, longer for introverts
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

  // ── Serialisation ─────────────────────────────────────────────────────────

  serialise() {
    return {
      expBias:    this.expBias.serialise(),
      drift:      this.drift.serialise(),
      goalSystem: this.goalSystem.serialise(),
    };
  }

  restore(data) {
    if (!data) return;
    if (data.expBias)    this.expBias.restore(data.expBias);
    if (data.drift)      this.drift.restore(data.drift);
    if (data.goalSystem) this.goalSystem.restore(data.goalSystem);
  }

  destroy() {
    this.drift.destroy();
    this.socialLearn.destroy();
  }
}
