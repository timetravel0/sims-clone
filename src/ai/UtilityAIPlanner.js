import { WalkToAction, UseObjectAction } from './Action.js';
import { SocialAction } from './SocialAction.js';
import { socialManager } from '../systems/SocialManager.js';

const VIEW_RADIUS = 8;
const TOP_K = 3;

const NEED_TRAIT_WEIGHT = {
  social: sim => 1 + sim.personality.outgoing * 0.45,
  status: sim => 1 + sim.personality.ambitious * 0.25 + sim.personality.nice * 0.15,
  autonomy: sim => 1 - sim.personality.outgoing * 0.15 + sim.personality.ambitious * 0.2,
  fun: sim => 1 + sim.personality.playful * 0.35,
  energy: sim => 1,
  comfort: sim => 1,
  hunger: sim => 1,
  bladder: sim => 1,
  hygiene: sim => 1,
  room: sim => 1,
};

export class UtilityAIPlanner {
  constructor(sim) {
    this._sim = sim;
    this.lastDecision = null;
  }

  plan() {
    const affordances = this._collectAffordances()
      .filter(a => this._passesRequirements(a))
      .map(a => ({ ...a, score: this._score(a) }))
      .filter(a => a.score > 1)
      .sort((a, b) => b.score - a.score);

    if (affordances.length === 0) return [];
    const pickPool = affordances.slice(0, TOP_K);
    const chosen = pickPool[Math.floor(Math.random() * pickPool.length)];
    this.lastDecision = chosen;
    return this._actionsFor(chosen);
  }

  _collectAffordances() {
    const out = [];
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

  _socialAffordances(target) {
    const rel = socialManager.getRelation(this._sim.id, target.id);
    return [
      {
        targetType: 'sim',
        target,
        verb: 'greet',
        label: `Greet ${target.name}`,
        utility: { social: 12, status: 2, energy: -3 },
        duration: 3,
        requirements: {},
      },
      {
        targetType: 'sim',
        target,
        verb: 'chat',
        label: `Chat with ${target.name}`,
        utility: { social: 24, status: 4, energy: -5 },
        duration: 4,
        requirements: { familiarityMin: 10 },
      },
      {
        targetType: 'sim',
        target,
        verb: 'compliment',
        label: `Compliment ${target.name}`,
        utility: { social: 18, status: 8, energy: -4 },
        duration: 4,
        requirements: { affinityMin: -10 },
      },
      {
        targetType: 'sim',
        target,
        verb: 'insult',
        label: `Insult ${target.name}`,
        utility: { status: 16, social: -8, autonomy: 5, energy: -6 },
        duration: 3,
        requirements: { affinityMax: -20 },
      },
    ].map(a => ({ ...a, relation: rel }));
  }

  _passesRequirements(affordance) {
    const req = affordance.requirements || {};
    if (this._sim.needs.get('energy') <= (req.energyMin ?? 5)) return false;
    const rel = affordance.relation;
    if (rel) {
      if (req.familiarityMin !== undefined && rel.familiarity < req.familiarityMin) return false;
      if (req.affinityMin !== undefined && rel.score < req.affinityMin) return false;
      if (req.affinityMax !== undefined && rel.score > req.affinityMax) return false;
    }
    return true;
  }

  _score(affordance) {
    const needs = this._sim.needs.getAll();
    let score = 0;
    for (const [need, utility] of Object.entries(affordance.utility || {})) {
      const current = needs[need] ?? 50;
      const pressure = utility >= 0 ? 100 - current : current;
      const traitWeight = NEED_TRAIT_WEIGHT[need]?.(this._sim) ?? 1;
      score += (pressure / 100) * utility * traitWeight;
    }
    if (affordance.targetType === 'sim' && affordance.relation) {
      score += affordance.relation.familiarity * 0.05;
      score += affordance.relation.score * 0.03;
    }
    const distancePenalty = this._distanceTo(affordance.target) * 0.35;
    return score - distancePenalty + Math.random() * 2.5;
  }

  _actionsFor(affordance) {
    if (affordance.targetType === 'sim') {
      const type = affordance.verb === 'greet' ? 'chat' : affordance.verb;
      return [new SocialAction(this._sim, affordance.target, this._sim._world, type, affordance)];
    }
    const furniture = affordance.target;
    if (!this._sim._world.reserveFurniture(furniture, this._sim)) return [];
    const targetGz = furniture.gz + 1 < this._sim._world.tilemap.height ? furniture.gz + 1 : furniture.gz - 1;
    return [
      new WalkToAction(this._sim, this._sim._world, furniture.gx, targetGz),
      new UseObjectAction(this._sim, furniture, affordance.duration ?? 5, affordance),
    ];
  }

  _distanceTo(target) {
    return Math.abs((target.gx ?? 0) - this._sim.gx) + Math.abs((target.gz ?? 0) - this._sim.gz);
  }
}
