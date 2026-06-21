import { WalkToAction, UseObjectAction } from './Action.js';
import { SocialAction }                  from './SocialAction.js';
import { socialManager }                 from '../systems/SocialManager.js';

const VIEW_RADIUS = 8;
const TOP_K       = 5;   // wider pick pool: history can rescue lower-ranked affordances

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

  _socialAffordances(target) {
    const rel = socialManager.getRelation(this._sim.id, target.id);
    return [
      {
        targetType: 'sim', target, verb: 'greet',
        label: `Greet ${target.name}`,
        utility: { social: 12, status: 2, energy: -3 },
        duration: 3, requirements: {},
      },
      {
        targetType: 'sim', target, verb: 'chat',
        label: `Chat with ${target.name}`,
        utility: { social: 24, status: 4, energy: -5 },
        duration: 4, requirements: { familiarityMin: 10 },
      },
      {
        targetType: 'sim', target, verb: 'compliment',
        label: `Compliment ${target.name}`,
        utility: { social: 18, status: 8, energy: -4 },
        duration: 4, requirements: { affinityMin: -10 },
      },
      {
        targetType: 'sim', target, verb: 'insult',
        label: `Insult ${target.name}`,
        utility: { status: 16, social: -8, autonomy: 5, energy: -6 },
        duration: 3, requirements: { affinityMax: -20 },
      },
      {
        targetType: 'sim', target, verb: 'hug',
        label: `Hug ${target.name}`,
        utility: { social: 30, comfort: 10, energy: -4 },
        duration: 4, requirements: { affinityMin: 40 },
      },
    ].map(a => ({ ...a, relation: rel }));
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
