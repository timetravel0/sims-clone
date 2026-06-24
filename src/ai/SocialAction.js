import { Action }            from './Action.js';
import { socialManager }       from '../systems/SocialManager.js';
import { skillSystem }         from '../systems/SkillSystem.js';
import { INTERACTIONS }        from '../systems/SocialDynamicsSystem.js';
import { Logger }              from '../utils/Logger.js';
import { bus }                 from '../core/EventBus.js';
import { GameContext }         from '../core/GameContext.js';
import cfg                     from '../config/gameConfig.js';

let _eventCounter = 0;

// Need payoff applied to the initiator on a successful interaction; the target
// receives TARGET_SHARE of the positive social payoff.
const NEED_PAYOFF = {
  chat:        { social: 18 },
  joke:        { social: 14, fun: 8 },
  compliment:  { social: 16, status: 6 },
  hug:         { social: 20, comfort: 6 },
  argue:       { social: -4, fun: -3 },
  insult:      { status: -8, social: -6 },
  apologize:   { social: 8, status: -3 },
  forgive:     { social: 10, comfort: 6 },
  confront:    { status: 5, social: -3, fun: -4 },
  avoid:       { social: -2 },
  ask_help:    { social: 8 },
  offer_help:  { social: 10, status: 6 },
  comfort:     { social: 12, comfort: 8 },
  gossip:      { social: 14, fun: 6 },
  flirt:       { social: 16, fun: 8 },
  reject_flirt:{ social: -6, status: -4 },
};
const TARGET_SHARE = 0.55;
const CHARISMA_TYPES = new Set(['chat', 'joke', 'compliment', 'gossip', 'flirt', 'comfort', 'apologize']);

export class SocialAction extends Action {
  constructor(simA, simB, world, type = null, affordance = null) {
    super(affordance?.label || `Social(${simA.name}->${simB.name})`);
    this._sim = simA;
    this._simA = simA;
    this._simB = simB;
    this._world = world;
    this._affordance = affordance;
    this._type = type || this._pickType();
    this._phase = 'walk';
    this._timer = 0;
  }

  enter() {
    const tx = this._simB.gx;
    const tz = Math.min(this._simB.gz + 1, this._world?.tilemap?.height ? this._world.tilemap.height - 1 : 14);
    this._simA.walkTo(tx, tz);
  }

  update(dt) {
    if (this._phase === 'walk') {
      if (!this._simA.isMoving) {
        this._phase = 'interact';
        this._timer = this._affordance?.duration ?? INTERACTIONS[this._type]?.duration ?? 2.5;
        this._doInteract();
      }
      return;
    }
    if (this._phase === 'interact') {
      this._timer -= dt;
      if (this._timer <= 0) this.done = true;
    }
  }

  // ── Context-aware type selection ────────────────────────────────────────────

  _pickType() {
    const game = GameContext.game;
    const dyn  = game?.socialDynamics;
    const a = this._simA, b = this._simB, p = a.personality;
    const ctx = this._miniContext();
    const ab = dyn?.snapshot(a.id, b.id) ?? this._zeroDims();
    const ba = dyn?.snapshot(b.id, a.id) ?? this._zeroDims();

    const cand = [];
    const add = (type, weight) => {
      if (weight <= 0) return;
      if (dyn?.onCooldown(a.id, b.id, type)) return;
      if (dyn && !dyn.meetsRequirements(a.id, b.id, type, ctx)) return;
      cand.push({ type, weight });
    };

    // Grudge / conflict
    add('apologize', ba.resentment >= 10 ? 40 + Math.max(0, p.nice) * 30 : 0);
    add('forgive',   ab.resentment >= 10 ? 22 + Math.max(0, p.nice) * 28 : 0);
    add('confront',  ab.resentment >= 12 ? 22 + Math.max(0, -p.nice) * 25 + Math.max(0, p.neurotic) * 15 : 0);
    add('insult',    (ab.resentment >= 20 && p.nice < -0.2) ? 18 : 0);
    add('avoid',     (ab.resentment >= 15 || ab.fear >= 20) ? 16 : 0);
    add('argue',     (p.nice < -0.2 || (p.neurotic > 0.4 && ab.resentment > 3)) ? 10 + Math.max(0, p.neurotic) * 12 : 0);
    // Care
    add('comfort',   ctx.targetMoodLow ? 30 + Math.max(0, p.nice) * 22 + ab.affection * 0.2 : 0);
    add('offer_help',ctx.targetNeedLow ? 24 + Math.max(0, p.nice) * 18 : 0);
    add('ask_help',  ctx.actorNeedLow  ? 18 + ab.trust * 0.2 : 0);
    // Romance
    add('flirt',     (ctx.compatible || ab.attraction >= 4) ? 14 + ab.attraction * 0.5 + Math.max(0, p.outgoing) * 14 : 0);
    // Affiliative defaults
    add('chat', 12);
    add('joke', p.playful > 0 ? 12 + p.playful * 12 : 4);
    add('compliment', p.nice > 0 ? 10 + p.nice * 12 : 3);
    add('hug', (ab.affection >= 10 || ab.familiarity >= 25) ? 8 + ab.affection * 0.2 : 0);
    add('gossip', 8 + ab.familiarity * 0.1);

    if (cand.length === 0) return 'chat';   // everything on cooldown → fall back
    return this._weightedPick(cand);
  }

  _weightedPick(cand) {
    const total = cand.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    for (const c of cand) { r -= c.weight; if (r <= 0) return c.type; }
    return cand[cand.length - 1].type;
  }

  // ── Resolution ──────────────────────────────────────────────────────────────

  _doInteract() {
    const game = GameContext.game;
    const dyn  = game?.socialDynamics;
    const a = this._simA, b = this._simB;
    const def = INTERACTIONS[this._type] ?? INTERACTIONS.chat;

    const ctx = this._buildContext();
    const before = socialManager.score(a.id, b.id);
    const relBefore = dyn ? Math.round(dyn.affinity(a.id, b.id)) : before;

    // Acceptance — consent-gated interactions can be refused
    let accepted = true;
    if (def.needsConsent) {
      const base = this._baseAcceptance();
      const mod  = dyn?.acceptanceModifier(b.id, a.id, this._type, ctx) ?? 0;
      accepted = (base + mod) >= 0;
      // Monogamy: a committed Sim rebuffs flirts from anyone but their partner,
      // regardless of built-up attraction. Not absolute — a small chance an
      // intense spark slips through, which then trips jealousy (drama, not
      // cheating-by-default). ponytail: 0.08 escape rate is a tuning knob.
      if (accepted && this._type === 'flirt') {
        const partner = game?.population?.getPartner?.(b.id);
        if (partner && partner.id !== a.id && Math.random() > 0.08) accepted = false;
      }
    }

    let score, delta;
    if (!accepted) {
      score = socialManager.applyOutcome(a.id, b.id, -4, 2, `reject_${this._type}`);
      delta = score - before;
      this._changeNeed(a, 'status', -8);
      this._changeNeed(a, 'social', -5);
      this._changeNeed(b, 'autonomy', 5);
      a.showBubble(`${def.emoji}?`, 2);
      b.showBubble('No', 2);
      Logger.info(`[Social] ${a.name} -> ${b.name}: ${this._type} REJECTED`);
    } else {
      score = socialManager.interact(a.id, b.id, this._type);
      delta = score - before;
      this._applyPayoff();
      if (CHARISMA_TYPES.has(this._type)) {
        skillSystem.gain(a, 'charisma', this._type === 'joke' ? 0.15 : 0.1);
      }
      a.showBubble(`${def.emoji} ${def.label}`, 2.5);
      b.showBubble(def.valence >= 0 ? 'OK' : '!', 2);
      Logger.info(`[Social] ${a.name} -> ${b.name}: ${this._type} (score ${score})`);
    }

    // Apply the relationship effect NOW (before measuring relAfter) so the log
    // is temporally correct; the event carries socialDynamicsApplied so the
    // SocialDynamicsSystem listener won't apply it a second time.
    if (dyn) {
      dyn.applyInteraction(a.id, b.id, this._type, accepted);
      dyn.markCooldown(a.id, b.id, this._type);
    }
    const relAfter = dyn ? Math.round(dyn.affinity(a.id, b.id)) : score;
    const dominantMotive = dyn?.dominantMotive(a.id, b.id, ctx) ?? 'curiosity';
    this._emitInteraction({ score, delta, accepted, ctx, relBefore, relAfter, dominantMotive });
  }

  /** Base acceptance from energy / familiarity / personality (dynamics layered on top). */
  _baseAcceptance() {
    const rel = socialManager.getRelation(this._simB.id, this._simA.id);
    const dynRel = GameContext.socialDynamics?.snapshot?.(this._simB.id, this._simA.id) ?? {};
    const p = this._simB.personality;
    const energy = this._simB.needs.get('energy');
    const sa = cfg.socialAcceptance;
    let score = 0;
    score += (energy - sa.energyCenter) * sa.energyWeight;
    score += rel.familiarity * sa.familiarityWeight;
    score += (p.nice     - 0.5) * sa.niceWeight;
    score += (p.outgoing - 0.5) * sa.outgoingWeight;
    score -= Math.max(0, p.neurotic) * sa.neuroticPenalty;
    if (energy < sa.lowEnergyThreshold) score -= sa.lowEnergyPenalty;
    if ((dynRel.familiarity ?? rel.familiarity ?? 0) < sa.strangerFamiliarityThreshold && ['chat', 'joke', 'compliment', 'hug'].includes(this._type)) score -= sa.strangerPenalty;
    if (this._type === 'flirt') score -= (dynRel.attraction ?? 0) < sa.flirtLowAttractionThreshold ? sa.flirtLowAttractionPenalty : sa.flirtHighAttractionPenalty;
    if (this._type === 'ask_help' && (dynRel.trust ?? 0) < 10) score -= sa.lowTrustAskHelpPenalty;
    if ((dynRel.resentment ?? 0) > sa.highResentmentThreshold && !['apologize', 'forgive', 'confront', 'avoid'].includes(this._type)) score -= sa.highResentmentPenalty;
    return score;
  }

  _applyPayoff() {
    const payoff = NEED_PAYOFF[this._type] ?? { social: 12 };
    for (const [need, amount] of Object.entries(payoff)) {
      this._changeNeed(this._simA, need, amount);
      if (amount > 0 && need === 'social') this._changeNeed(this._simB, need, amount * TARGET_SHARE);
      else if (amount > 0 && (need === 'fun' || need === 'comfort')) this._changeNeed(this._simB, need, amount * 0.4);
    }
    if (this._affordance?.utility) this._applyUtility(this._simB, this._affordance.utility, 0.5);
  }

  _applyUtility(sim, utility, multiplier = 1) {
    for (const [need, amount] of Object.entries(utility || {})) this._changeNeed(sim, need, amount * multiplier);
  }

  _changeNeed(sim, need, amount) {
    if (typeof sim.needs.delta === 'function') sim.needs.delta(need, amount);
    else if (amount >= 0) sim.needs.restore(need, amount);
    else sim.needs.decay(need, Math.abs(amount));
  }

  // ── Interaction context ─────────────────────────────────────────────────────

  /** Lightweight context used at construction time (requirements + type pick). */
  _miniContext() {
    const game = GameContext.game;
    const a = this._simA, b = this._simB;
    const targetMoodLow = this._isMoodLow(b);
    return {
      actorNeeds:   a.needs.getAll?.() ?? {},
      targetNeeds:  b.needs.getAll?.() ?? {},
      actorNeedLow:  (a.needs.get('social') < 30) || (a.needs.get('fun') < 22),
      targetNeedLow: (b.needs.get('social') < 30) || (b.needs.get('comfort') < 25),
      targetMoodLow,
      compatible: (game?.relationshipGraph?.compatibility?.(a.id, b.id) ?? 0) >= 0.5,
    };
  }

  /** Full synthetic context published with the interaction event. */
  _buildContext() {
    const game = GameContext.game;
    const a = this._simA, b = this._simB;
    const witnesses = (game?.sims ?? [])
      .filter(s => s !== a && s !== b && !s._atWork && !s._outing && this._near(s, b, 4))
      .map(s => s.id);
    const recent = (game?.memorySystem?.with?.(a.id, b.id) ?? [])
      .slice(0, 3).map(m => m.type ?? m.data?.type ?? 'memory');
    return {
      ...this._miniContext(),
      initiatorId: a.id,
      targetId:    b.id,
      type:        this._type,
      location:    this._locationLabel(b),
      witnesses,
      isPublic:    witnesses.length > 0,
      actorMood:   a._moodLabel ?? a.mood?.info?.tier ?? 'neutral',
      targetMood:  b._moodLabel ?? b.mood?.info?.tier ?? 'neutral',
      recentMemories: recent,
      activeGoal:  a.brain?.goalSystem?.activeGoals?.()[0]?.type ?? null,
      timeOfDay:   Math.floor(game?.clock?.hour ?? 0),
      relSnapshot: game?.socialDynamics?.snapshot?.(a.id, b.id) ?? null,
    };
  }

  _isMoodLow(sim) {
    const label = (sim._moodLabel ?? sim.mood?.info?.tier ?? '').toLowerCase();
    if (['miserable', 'sad', 'low', 'down'].some(t => label.includes(t))) return true;
    return (sim.needs.get('comfort') < 25) || (sim.needs.get('fun') < 20);
  }

  _near(s, target, radius) {
    return Math.hypot((s.worldX ?? s.gx) - (target.worldX ?? target.gx),
                      (s.worldZ ?? s.gz) - (target.worldZ ?? target.gz)) <= radius;
  }

  _locationLabel(sim) {
    const game = GameContext.game;
    const furn = (game?.world?.furniture ?? []).find(f => Math.abs(f.gx - sim.gx) <= 1 && Math.abs(f.gz - sim.gz) <= 1);
    if (furn) return furn.id;
    const room = game?.roomDetector?.roomAt?.(sim.gx, sim.gz);
    if (room) return room.type;
    return `tile(${sim.gx},${sim.gz})`;
  }

  _zeroDims() {
    return { trust: 0, affection: 0, respect: 0, attraction: 0, resentment: 0, fear: 0, familiarity: 0, dependency: 0 };
  }

  // ── Event emission ───────────────────────────────────────────────────────────

  _emitInteraction({ score, delta, accepted, ctx, relBefore, relAfter, dominantMotive }) {
    const a = this._simA, b = this._simB;
    const rel = socialManager.getRelation(a.id, b.id);
    bus.emit('social:interaction', {
      eventId: `e_${++_eventCounter}`,
      idA: a.id, idB: b.id,
      nameA: a.name, nameB: b.name,
      simA: a, simB: b,
      type: this._type,
      result: accepted ? 'success' : 'rejected',
      accepted,
      outcome: { success: accepted, relDelta: delta },
      score, delta,
      familiarity: rel.familiarity ?? 0,
      // ── synthetic context (Social Core 2.0) ──
      location: ctx.location,
      isPublic: ctx.isPublic,
      witnesses: ctx.witnesses,
      dominantMotive,
      activeGoal: ctx.activeGoal,
      relationshipBefore: relBefore,
      relationshipAfter: relAfter,
      socialDynamicsApplied: true,
      context: ctx,
    });
  }
}

if (typeof window !== 'undefined') {
  window._socialActionClasses = { SocialAction };
}
