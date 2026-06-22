import { NeedDrivenPlanner }  from '../ai/NeedDrivenPlanner.js';
import { UtilityAIPlanner }   from '../ai/UtilityAIPlanner.js';
import { ActionQueue }        from '../ai/ActionQueue.js';
import { IdleAction }         from '../ai/Action.js';
import { SocialAction }       from '../ai/SocialAction.js';
import { ExperientialBias }   from '../ai/ExperientialBias.js';
import { PersonalityDrift }   from '../ai/PersonalityDrift.js';
import { ContextualNoise }    from '../ai/ContextualNoise.js';
import { GoalSystem }         from '../ai/GoalSystem.js';
import { WellbeingAmbition }  from '../ai/WellbeingAmbition.js';
import { SocialLearning }     from '../ai/SocialLearning.js';
import { MemorySystem }       from '../ai/MemorySystem.js';
import { EmotionEngine }      from './EmotionEngine.js';

// Household bonding cooldown (game-minutes between deliberate "spend time with a
// housemate" actions). Measurement showed household social need stays ~86 (well
// supplied by visitors), so a loneliness floor never fired and housemates almost
// never interacted with EACH OTHER — which is exactly what romance (and then
// births) needs. So bonding is driven on a gentle timer, not by the satiated
// social need, and is biased toward the most compatible present housemate.
const BOND_COOLDOWN_MIN = 60;
const BOND_COOLDOWN_JITTER = 60;

export class SimBrain {
  constructor(sim) {
    this._sim            = sim;
    this._planner        = new NeedDrivenPlanner(sim);
    this._utilityPlanner = new UtilityAIPlanner(sim);
    this._queue          = new ActionQueue();
    this._socialCooldown = 0;
    this._bondCooldown   = Math.random() * BOND_COOLDOWN_MIN;  // stagger first bond
    this._lastMoodTier   = null;
    this._playerOverride = false;
    this._overrideTimer  = 0;

    // ── Adaptive AI subsystems ───────────────────────────────────────────────
    this.expBias      = new ExperientialBias(sim.id);
    this.drift        = new PersonalityDrift(sim.personality);
    this.ctxNoise     = new ContextualNoise(
      sim.id,
      () => window._game?.clock,
      () => this.emotions?.tier        // live tier from EmotionEngine
    );
    this.goalSystem   = new GoalSystem(sim);
    this.wellbeing    = new WellbeingAmbition(sim);
    this.socialLearn  = new SocialLearning(sim, this.expBias);

    // ── Memory & Emotion ─────────────────────────────────────────────────────
    this.memory   = new MemorySystem(
      sim.id,
      () => window._game?.tick ?? 0
    );
    this.emotions = new EmotionEngine(
      sim,
      sim.needs,
      sim.personality
    );

    // Wire UtilityAIPlanner to use all subsystems
    this._utilityPlanner.setBrain(this);
  }

  // ── Player override ──────────────────────────────────────────────────────

  override(actions) {
    this._queue.clear();
    const list = Array.isArray(actions) ? actions : [actions];
    this._queue.push(...list);
    this._playerOverride = true;
    this._overrideTimer  = 30;
  }

  // ── Main tick ────────────────────────────────────────────────────────────

  update(dt) {
    // Override safety timer
    if (this._playerOverride) {
      this._overrideTimer -= dt;
      if (this._overrideTimer <= 0 || this._queue.isEmpty()) {
        this._playerOverride = false;
        this._overrideTimer  = 0;
      }
    }

    // Tick all subsystems
    this._queue.update(dt);
    if (this._socialCooldown > 0) this._socialCooldown -= dt;
    if (this._bondCooldown > 0)   this._bondCooldown -= dt;
    this.expBias.update(dt);
    this.emotions.update(dt);
    this.wellbeing.update(dt);

    const currentDay = window._game?.clock?.day ?? 0;
    this.goalSystem.update(dt, currentDay);
    this.ctxNoise.resetFrame();

    // Neurotic mood crash — interrupt AI tasks only
    const p = this._sim.personality;
    const tier = this.emotions.tier;
    if (!this._playerOverride &&
        p.neurotic > 0.4 &&
        tier === 'miserable' &&
        this._lastMoodTier !== 'miserable') {
      this._queue.clear();
    }
    this._lastMoodTier = tier;

    if (this._playerOverride)   return;
    if (!this._queue.isEmpty())  return;

    // ── AI planning ──────────────────────────────────────────────────────────

    // 1. Critical physical needs preempt everything autonomous.
    const criticalNeedActions = this._criticalNeedActions();
    if (criticalNeedActions.length > 0) {
      this._sim.showBubble(this._planner.lastNeedLabel);
      this._queue.push(...criticalNeedActions);
      return;
    }

    // 1b. Household bonding — periodically seek out a present housemate (biased to
    // the most compatible) to spend time together. SocialAction walks to them, so
    // this is what produces household-to-household co-location; the social need is
    // already well supplied by visitors, so this is timer-driven, not need-driven.
    // It's the keystone for romance → committed couples → births. Physical crises
    // (step 1) still take priority, and a cooldown keeps it from chasing.
    if (this._bondCooldown <= 0) {
      const companion = this._findCompanion();
      if (companion) {
        this._bondCooldown = BOND_COOLDOWN_MIN + Math.random() * BOND_COOLDOWN_JITTER;
        this._sim.showBubble('🫂');
        this._queue.push(new SocialAction(this._sim, companion, this._sim._world));
        return;
      }
    }

    // 2. Utility AI (history + goals + wellbeing + context + emotion-aware)
    const utilityActions = this._utilityPlanner.plan();
    if (utilityActions.length > 0) {
      this._sim.showBubble(this._utilityPlanner.lastDecision?.label || 'Act');
      this._queue.push(...utilityActions);
      return;
    }

    // 3. Physical needs fallback
    const needActions = this._planner.plan();
    if (needActions.length > 0) {
      this._sim.showBubble(this._planner.lastNeedLabel);
      this._queue.push(...needActions);
      return;
    }

    // 4. Social need fallback
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

    // 5. Idle
    const idleDur = p.playful > 0.3 ? 1.5 : 3.5;
    this._queue.push(new IdleAction(this._sim, idleDur));
  }

  _criticalNeedActions() {
    const needs = this._sim.needs.getAll();
    const priorities = [
      ['hunger', 16],
      ['bladder', 14],
      ['energy', 12],
    ].filter(([key, limit]) => (needs[key] ?? 100) < limit)
      .sort((a, b) => (needs[a[0]] ?? 100) - (needs[b[0]] ?? 100));
    if (priorities.length === 0) return [];
    return this._planner.planFor(priorities[0][0], { force: true });
  }

  /** A present, free housemate to bond with — biased toward the most compatible. */
  _findCompanion() {
    const game = window._game;
    if (!game) return null;
    const me = this._sim;
    const mates = game.sims.filter(s =>
      s.id !== me.id && !s._isVisitor && !s._atWork && !s._outing && (s.mesh?.visible ?? true) &&
      (game.population?.isHouseholdMember?.(s.id) ?? true)
    );
    if (mates.length === 0) return null;
    // Prefer the housemate this Sim is most compatible with (drives pair-formation
    // toward romance); compatibility is stable per pair, so a couple keeps choosing
    // each other. Falls back to any present mate when compatibility is unavailable.
    const graph = game.relationshipGraph;
    let best = mates[0], bestScore = -Infinity;
    for (const s of mates) {
      const compat = graph?.compatibility?.(me.id, s.id) ?? 0;
      if (compat > bestScore) { bestScore = compat; best = s; }
    }
    return best;
  }

  _findSocialTarget() {
    const game = window._game;
    if (!game) return null;
    const me = this._sim;
    // Only sims actually present on the lot and free (not at work / out / hidden):
    // walking toward someone who isn't here is wasted motion.
    const others = game.sims.filter(s =>
      s.id !== me.id && !s._atWork && !s._outing && (s.mesh?.visible ?? true)
    );
    if (others.length === 0) return null;
    // Nearest present companion — closing the smallest distance maximises the
    // chance the encounter actually happens before either re-plans.
    let best = null, bestD = Infinity;
    for (const s of others) {
      const d = Math.hypot((s.gx ?? 0) - me.gx, (s.gz ?? 0) - me.gz);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  get busy() { return !this._queue.isEmpty(); }

  // ── Serialisation ────────────────────────────────────────────────────────

  serialise() {
    return {
      expBias    : this.expBias.serialise(),
      drift      : this.drift.serialise(),
      goalSystem : this.goalSystem.serialise(),
      wellbeing  : this.wellbeing.serialise(),
      memory     : this.memory.serialise(),
      emotions   : this.emotions.serialise(),
    };
  }

  restore(data) {
    if (!data) return;
    if (data.expBias)    this.expBias.restore(data.expBias);
    if (data.drift)      this.drift.restore(data.drift);
    if (data.goalSystem) this.goalSystem.restore(data.goalSystem);
    if (data.wellbeing)  this.wellbeing.restore(data.wellbeing);
    if (data.memory)     this.memory.restore(data.memory);
    if (data.emotions)   this.emotions.restore(data.emotions);
  }

  destroy() {
    this.drift.destroy();
    this.wellbeing.destroy();
    this.socialLearn.destroy();
    this.emotions.destroy();
  }
}
