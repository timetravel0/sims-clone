import { WalkToAction, UseObjectAction } from './Action.js';
import { SocialAction }                  from './SocialAction.js';
import { socialManager }                 from '../systems/SocialManager.js';
import { INTERACTIONS }                  from '../systems/SocialDynamicsSystem.js';
import { GameContext }                   from '../core/GameContext.js';

const VIEW_RADIUS = 8;
const TOP_K       = 5;
const SOCIAL_ENERGY_MIN = 12;

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
    this._brain = null;
    this.lastDecision = null;
  }

  setBrain(brain) { this._brain = brain; }

  plan() {
    const affordances = this._collectAffordances()
      .filter(a => this._passesRequirements(a))
      .map(a    => ({ ...a, score: this._score(a) }))
      .filter(a => a.score > 1)
      .sort((a, b) => b.score - a.score);

    if (affordances.length === 0) return [];

    const pool    = affordances.slice(0, TOP_K);
    const minS    = pool[pool.length - 1].score;
    const weights = pool.map(a => Math.exp(a.score - minS));
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
    // Usa GameContext invece di window._game
    for (const other of GameContext.sims(this._sim.id)) {
      if (this._distanceTo(other) > VIEW_RADIUS) continue;
      out.push(...this._socialAffordances(other));
    }
    return out;
  }

  _socialAffordances(target) {
    const dyn   = GameContext.socialDynamics;
    const actor = this._sim;
    if (target._atWork) return [];
    if (actor.needs.get('energy') < SOCIAL_ENERGY_MIN) return [];
    if (!dyn) return this._legacySocialAffordances(target);

    const ctx = this._socialContext(target);
    const ab  = dyn.snapshot(actor.id, target.id);
    const rel = socialManager.getRelation(actor.id, target.id);
    const out = [];
    for (const [type, def] of Object.entries(INTERACTIONS)) {
      if (type === 'reject_flirt') continue;
      if (dyn.onCooldown(actor.id, target.id, type)) continue;
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

  _legacySocialAffordances(target) {
    const rel = socialManager.getRelation(this._sim.id, target.id);
    return [
      { targetType: 'sim', target, verb: 'chat',       label: `Chat with ${target.name}`,  utility: { social: 24, status: 4, energy: -5 }, duration: 4, requirements: { familiarityMin: 10 } },
      { targetType: 'sim', target, verb: 'compliment', label: `Compliment ${target.name}`, utility: { social: 18, status: 8, energy: -4 }, duration: 4, requirements: { affinityMin: -10 } },
      { targetType: 'sim', target, verb: 'insult',     label: `Insult ${target.name}`,     utility: { status: 16, social: -8, autonomy: 5, energy: -6 }, duration: 3, requirements: { affinityMax: -20 } },
      { targetType: 'sim', target, verb: 'hug',        label: `Hug ${target.name}`,        utility: { social: 30, comfort: 10, energy: -4 }, duration: 4, requirements: { affinityMin: 40 } },
    ].map(a => ({ ...a, relation: rel }));
  }

  _socialContext(target) {
    const a = this._sim, b = target;
    const label = (b._moodLabel ?? '').toLowerCase();
    return {
      actorNeedLow:  a.needs.get('social') < 30 || a.needs.get('fun') < 22,
      targetNeedLow: b.needs.get('social') < 30 || b.needs.get('comfort') < 25,
      targetMoodLow: /miser|sad|low|down/.test(label) || b.needs.get('comfort') < 25 || b.needs.get('fun') < 20,
      compatible:    (GameContext.relationshipGraph?.compatibility?.(a.id, b.id) ?? 0) >= 0.5,
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

    for (const [need, utility] of Object.entries(affordance.utility || {})) {
      const current     = needs[need] ?? 50;
      const pressure    = utility >= 0 ? 100 - current : current;
      const traitWeight = NEED_TRAIT_WEIGHT[need]?.(this._sim) ?? 1;
      score += (pressure / 100) * utility * traitWeight;
    }
    score += this._criticalNeedAdjustment(affordance, needs);

    if (affordance.targetType === 'sim' && affordance.relation) {
      score += affordance.relation.familiarity * 0.05;
      score += affordance.relation.score       * 0.03;
    }

    if (affordance.targetType === 'sim' && affordance.verb) {
      const dyn = GameContext.socialDynamics;
      if (dyn) {
        const ab      = affordance.dyn ?? dyn.snapshot(this._sim.id, affordance.target.id);
        const ba      = dyn.snapshot(affordance.target.id, this._sim.id);
        const affinity = dyn.affinity(this._sim.id, affordance.target.id);
        const verb    = affordance.verb;
        if (POSITIVE_SOCIAL.has(verb)) score += affinity * 0.06 + ab.affection * 0.08 + ab.trust * 0.05;
        if (NEGATIVE_SOCIAL.has(verb)) score += ab.resentment * 0.16 - ab.affection * 0.04;
        if (verb === 'flirt') {
          score += ab.attraction * 0.25 + ab.affection * 0.05;
          const partner = GameContext.population?.getPartner?.(this._sim.id);
          if (partner && partner.id !== affordance.target.id) score -= 40;
        }
        if (verb === 'apologize') score += ba.resentment * 0.18;
        if (verb === 'forgive')   score += ab.resentment * 0.16;
        if (verb === 'confront')  score += ab.resentment * 0.12;
        if (verb === 'comfort')   score += ab.affection  * 0.08;
        if (verb === 'avoid')     score += (ab.resentment + ab.fear) * 0.10;
        score -= ab.fear * 0.04;
      }
    }

    if (this._brain?.wellbeing) {
      score += this._brain.wellbeing.boost(affordance);
    }

    score -= this._distanceTo(affordance.target) * 0.35;

    if (this._brain?.expBias) {
      score += this._brain.expBias.get(affordance) * 1.8;
    }

    if (this._brain?.goalSystem) {
      score += this._brain.goalSystem.boost(affordance);
    }

    if (this._brain?.ctxNoise) {
      score += this._brain.ctxNoise.sample(affordance, 4.0);
    } else {
      score += Math.random() * 2.5;
    }

    // Orario notturno: usa GameContext.hour invece di window._game
    const hour = GameContext.hour;
    if (hour >= 22 || hour < 7) {
      if (affordance.verb === 'sleep') score += 80;
      else if ((affordance.utility?.energy ?? 0) < 0) score -= 30;
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

  _criticalNeedAdjustment(affordance, needs) {
    const utility = affordance.utility ?? {};
    let penalty = 0;
    // ponytail: thresholds raised vs the old 14-18 so Sims head off to
    // eat/pee/sleep BEFORE the need craters (bladder/hunger/energy were the top 3
    // crisis sources). Kept moderate: 32/30/26 choked socialisation because the
    // single contended bathroom kept needs low, so the social penalty fired
    // constantly. 26/24/20 still pre-empts crises but leaves a sociable window.
    if ((needs.hunger ?? 100) < 26 && (utility.hunger ?? 0) <= 0) penalty -= 90;
    if ((needs.bladder ?? 100) < 24 && (utility.bladder ?? 0) <= 0) penalty -= 95;
    if ((needs.energy ?? 100) < 20 && (utility.energy ?? 0) <= 0) penalty -= 75;
    if ((needs.energy ?? 100) < 14 && (utility.energy ?? 0) < 0) penalty -= 35;
    if (affordance.targetType === 'sim' && penalty < 0) {
      const allowed = new Set(['ask_help', 'comfort', 'avoid']);
      if (!allowed.has(affordance.verb)) penalty -= 20;
    }
    return penalty;
  }

  _distanceTo(target) {
    const dx = (target.gx ?? target.worldX) - this._sim.gx;
    const dz = (target.gz ?? target.worldZ) - this._sim.gz;
    return Math.abs(dx) + Math.abs(dz);
  }
}
