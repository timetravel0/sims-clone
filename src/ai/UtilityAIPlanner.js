import { WalkToAction, UseObjectAction } from './Action.js';
import { SocialAction }                  from './SocialAction.js';
import { socialManager }                 from '../systems/SocialManager.js';
import { INTERACTIONS }                  from '../systems/SocialDynamicsSystem.js';

const VIEW_RADIUS = 8;
const TOP_K       = 5;   // wider pick pool: history can rescue lower-ranked affordances
const SOCIAL_ENERGY_MIN = 12;

// Need-pressure utility per interaction type (drives base scoring).
const SOCIAL_UTILITY = {
  chat:        { social: 24, energy: -5 },
  joke:        { social: 20, fun: 10, energy: -4 },
  compliment:  { social: 18, status: 8, energy: -4 },
  hug:         { social: 30, comfort: 10, energy: -4 },
  argue:       { status: 8, social: -8, autonomy: 5, energy: -6 },
  insult:      { status: 16, social: -8, autonomy: 5, energy: -6 },
  apologize:   { social: 14, status: -4, energy: -4 },
  forgive:     { social: 16, comfort: 6, energy: -4 },
  confront:    { status: 10, autonomy: 8, social: -4, energy: -6 },
  avoid:       { autonomy: 10, social: -4, energy: -2 },
  ask_help:    { social: 12, energy: -3 },
  offer_help:  { social: 16, status: 8, energy: -5 },
  comfort:     { social: 16, comfort: 8, energy: -5 },
  gossip:      { social: 18, fun: 8, energy: -4 },
  flirt:       { social: 18, fun: 10, energy: -4 },
};
const POSITIVE_SOCIAL = new Set(['chat', 'joke', 'compliment', 'hug', 'apologize', 'forgive', 'comfort', 'offer_help', 'ask_help', 'gossip', 'flirt']);
const NEGATIVE_SOCIAL = new Set(['argue', 'insult', 'confront', 'avoid']);

/**
 * NEED_TRAIT_WEIGHT — personality modulation on utility.
 * Now reads from the (potentially drifted) personality live.
 */
const NEED_TRAIT_WEIGHT = {
  social:   sim => 1 + sim.personality.outgoing  * 0.45,
  status:   sim => 1 + sim.personality.ambitious * 0.25 + sim.personality.nice * 0.15,
  autonomy: sim => 1 - sim.personality.outgoing  * 0.15 + sim.personality.ambitious * 0.2,
  fun:      sim => 1 + sim.personality.playful   * 0.35,
  energy:   sim => 1,
  comfort:  sim => 1,
  hunger:   sim => 1,
  bladder:  sim => 1,
  hygiene:  sim => 1,
  room:     sim => 1,
};

export class UtilityAIPlanner {
  constructor(sim) {
    this._sim   = sim;
    this._brain = null;   // injected by SimBrain.setBrain()
    this.lastDecision = null;
  }

  /** Called by SimBrain after construction to avoid circular dependency. */
  setBrain(brain) { this._brain = brain; }

  plan() {
    const affordances = this._collectAffordances()
      .filter(a => this._passesRequirements(a))
      .map(a    => ({ ...a, score: this._score(a) }))
      .filter(a => a.score > 1)
      .sort((a, b) => b.score - a.score);

    if (affordances.length === 0) return [];

    // ── Softmax-style weighted pick from TOP_K ─────────────────────────────
    // Replaces flat random: high-scored affordances are more likely,
    // but lower ones still have a chance (non-determinism preserved).
    const pool    = affordances.slice(0, TOP_K);
    const minS    = pool[pool.length - 1].score;
    const weights = pool.map(a => Math.exp(a.score - minS)); // exp-normalised
    const total   = weights.reduce((s, w) => s + w, 0);
    let   r       = Math.random() * total;
    let   chosen  = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosen = pool[i]; break; }
    }

    this.lastDecision = chosen;
    return this._actionsFor(chosen);
  }

  _collectAffordances() {
    const out   = [];
    const world = this._sim._world;
    for (const furniture of world.furniture) {
      if (this._distanceTo(furniture) > VIEW_RADIUS) continue;
      out.push(...furniture.getAffordancesFor(this._sim));
    }
    for (const other of globalThis.window?._game?.sims || []) {
      if (other.id === this._sim.id) continue;
      if (this._distanceTo(other) > VIEW_RADIUS) continue;
      out.push(...this._socialAffordances(other));
    }
    return out;
  }

  /**
   * Social affordances are generated from the SocialDynamicsSystem INTERACTIONS
   * catalogue when available (so the new relational model actually drives
   * behaviour), filtered by cooldown, requirements, energy and target presence.
   * Falls back to a small legacy list only when socialDynamics is absent.
   */
  _socialAffordances(target) {
    const game = globalThis.window?._game;
    const dyn  = game?.socialDynamics;
    const actor = this._sim;
    if (target._atWork) return [];                              // not on the lot
    if (actor.needs.get('energy') < SOCIAL_ENERGY_MIN) return []; // too tired
    if (!dyn) return this._legacySocialAffordances(target);

    const ctx = this._socialContext(target);
    const ab  = dyn.snapshot(actor.id, target.id);
    const rel = socialManager.getRelation(actor.id, target.id);
    const out = [];
    for (const [type, def] of Object.entries(INTERACTIONS)) {
      if (type === 'reject_flirt') continue;                   // response-only
      if (dyn.onCooldown(actor.id, target.id, type)) continue; // no spam
      if (!dyn.meetsRequirements(actor.id, target.id, type, ctx)) continue;
      out.push({
        targetType: 'sim', target, verb: type,
        label: `${def.label} ${target.name}`,
        utility: SOCIAL_UTILITY[type] ?? { social: 16, energy: -4 },
        duration: def.duration ?? 4,
        interactionDef: def,
        requirements: {},
        relation: rel,
        dyn: ab,
      });
    }
    return out;
  }

  /** Legacy hardcoded social affordances — only used if socialDynamics absent. */
  _legacySocialAffordances(target) {
    const rel = socialManager.getRelation(this._sim.id, target.id);
    return [
      { targetType: 'sim', target, verb: 'chat',       label: `Chat with ${target.name}`,  utility: { social: 24, status: 4, energy: -5 }, duration: 4, requirements: { familiarityMin: 10 } },
      { targetType: 'sim', target, verb: 'compliment', label: `Compliment ${target.name}`, utility: { social: 18, status: 8, energy: -4 }, duration: 4, requirements: { affinityMin: -10 } },
      { targetType: 'sim', target, verb: 'insult',     label: `Insult ${target.name}`,     utility: { status: 16, social: -8, autonomy: 5, energy: -6 }, duration: 3, requirements: { affinityMax: -20 } },
      { targetType: 'sim', target, verb: 'hug',        label: `Hug ${target.name}`,        utility: { social: 30, comfort: 10, energy: -4 }, duration: 4, requirements: { affinityMin: 40 } },
    ].map(a => ({ ...a, relation: rel }));
  }

  /** Lightweight context for INTERACTIONS.requires(). */
  _socialContext(target) {
    const a = this._sim, b = target, game = globalThis.window?._game;
    const label = (b._moodLabel ?? '').toLowerCase();
    return {
      actorNeedLow:  a.needs.get('social') < 30 || a.needs.get('fun') < 22,
      targetNeedLow: b.needs.get('social') < 30 || b.needs.get('comfort') < 25,
      targetMoodLow: /miser|sad|low|down/.test(label) || b.needs.get('comfort') < 25 || b.needs.get('fun') < 20,
      compatible:    (game?.relationshipGraph?.compatibility?.(a.id, b.id) ?? 0) >= 0.5,
    };
  }

  _passesRequirements(affordance) {
    const req = affordance.requirements || {};
    if (this._sim.needs.get('energy') <= (req.energyMin ?? 5)) return false;
    const rel = affordance.relation;
    if (rel) {
      if (req.familiarityMin !== undefined && rel.familiarity < req.familiarityMin) return false;
      if (req.affinityMin    !== undefined && rel.score       < req.affinityMin)    return false;
      if (req.affinityMax    !== undefined && rel.score       > req.affinityMax)    return false;
    }
    return true;
  }

  _score(affordance) {
    const needs = this._sim.needs.getAll();
    let score   = 0;

    // ── 1. Base utility × need pressure × personality trait weight ─────────
    for (const [need, utility] of Object.entries(affordance.utility || {})) {
      const current     = needs[need] ?? 50;
      const pressure    = utility >= 0 ? 100 - current : current;
      const traitWeight = NEED_TRAIT_WEIGHT[need]?.(this._sim) ?? 1;
      score += (pressure / 100) * utility * traitWeight;
    }

    // ── 2. Social relationship bonus ────────────────────────────────────────
    if (affordance.targetType === 'sim' && affordance.relation) {
      score += affordance.relation.familiarity * 0.05;
      score += affordance.relation.score       * 0.03;
    }

    // ── 2b. Social Core 2.0 — directional dimensions drive the choice ───────
    if (affordance.targetType === 'sim' && affordance.verb) {
      const dyn = globalThis.window?._game?.socialDynamics;
      if (dyn) {
        const ab = affordance.dyn ?? dyn.snapshot(this._sim.id, affordance.target.id);
        const ba = dyn.snapshot(affordance.target.id, this._sim.id);
        const affinity = dyn.affinity(this._sim.id, affordance.target.id);
        const verb = affordance.verb;
        if (POSITIVE_SOCIAL.has(verb)) score += affinity * 0.06 + ab.affection * 0.08 + ab.trust * 0.05;
        if (NEGATIVE_SOCIAL.has(verb)) score += ab.resentment * 0.16 - ab.affection * 0.04;
        if (verb === 'flirt')     score += ab.attraction * 0.25 + ab.affection * 0.05;
        if (verb === 'apologize') score += ba.resentment * 0.18;   // they resent me → I apologise
        if (verb === 'forgive')   score += ab.resentment * 0.16;   // I resent them → I forgive
        if (verb === 'confront')  score += ab.resentment * 0.12;
        if (verb === 'comfort')   score += ab.affection  * 0.08;
        if (verb === 'avoid')     score += (ab.resentment + ab.fear) * 0.10;
        score -= ab.fear * 0.04;                                   // fear suppresses approach
      }
    }

    // ── 3. Distance penalty ─────────────────────────────────────────────────
    score -= this._distanceTo(affordance.target) * 0.35;

    // ── 4. ExperientialBias — learned from history ──────────────────────────
    if (this._brain?.expBias) {
      score += this._brain.expBias.get(affordance) * 1.8;
    }

    // ── 5. GoalSystem boost — medium-term objectives ────────────────────────
    if (this._brain?.goalSystem) {
      score += this._brain.goalSystem.boost(affordance);
    }

    // ── 6. ContextualNoise — circadian + mood-modulated variance ────────────
    if (this._brain?.ctxNoise) {
      score += this._brain.ctxNoise.sample(affordance, 4.0);
    } else {
      score += Math.random() * 2.5; // fallback if brain not yet wired
    }

    return score;
  }

  _actionsFor(affordance) {
    if (affordance.targetType === 'sim') {
      const type = affordance.verb === 'greet' ? 'chat' : affordance.verb;
      return [new SocialAction(this._sim, affordance.target, this._sim._world, type, affordance)];
    }
    const furniture = affordance.target;
    if (!this._sim._world.reserveFurniture(furniture, this._sim)) return [];
    const targetGz = furniture.gz + 1 < this._sim._world.tilemap.height
      ? furniture.gz + 1 : furniture.gz - 1;
    return [
      new WalkToAction(this._sim, this._sim._world, furniture.gx, targetGz),
      new UseObjectAction(this._sim, furniture, affordance.duration ?? 5, affordance),
    ];
  }

  _distanceTo(target) {
    return Math.abs((target.gx ?? 0) - this._sim.gx) + Math.abs((target.gz ?? 0) - this._sim.gz);
  }
}
