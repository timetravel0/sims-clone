/**
 * SocialAction — Sprint 4
 * An Action that moves Sim A next to Sim B, then executes a social interaction.
 *
 * Supported interactions:
 *   chat     — small +social for both, slight +charisma XP
 *   joke     — +fun for both if charisma >= 3, else −social for B
 *   hug      — +social +comfort for both, requires relationship >= 30
 *   argue    — −social for both, −relationship; higher neurotic → more likely
 *   compliment — +social +relationship for B; tiny +charisma XP for A
 *
 * On completion emits: social:interaction { simA, simB, type, outcome }
 */
import { WalkToAction }  from './Action.js';
import { skillSystem }   from '../systems/SkillSystem.js';
import { bus }           from '../core/EventBus.js';
const TYPES_POSITIVE = ['chat', 'joke', 'compliment', 'hug'];
const TYPES_NEGATIVE = ['argue', 'insult'];

export class SocialAction extends Action {
  constructor(simA, simB, world, type, affordance = null) {
    super(affordance?.label || `Social(${simA.name}→${simB.name})`);
    this._sim   = simA;
    this._simA  = simA;
    this._simB  = simB;
    this._world = world;
    this._type  = type || this._pickType();
    this._affordance = affordance;
    this._phase = 'walk';
    this._timer = 0;
  }

const INTERACTION_DEFS = {
  chat: {
    duration: 8,
    execute(a, b, rel) {
      a.needs.delta('social',  8);
      b.needs.delta('social',  6);
      skillSystem.gain(a, 'charisma', 0.1);
      return { success: true, relDelta: 3 };
    },
  },
  joke: {
    duration: 6,
    execute(a, b, rel) {
      const charisma = skillSystem.getLevel(a, 'charisma');
      if (charisma >= 3) {
        a.needs.delta('fun', 10);
        b.needs.delta('fun', 12);
        skillSystem.gain(a, 'charisma', 0.15);
        return { success: true, relDelta: 5 };
      }
      // Failed joke
      b.needs.delta('social', -5);
      return { success: false, relDelta: -3 };
    },
  },
  hug: {
    duration: 5,
    execute(a, b, rel) {
      if (rel < 30) return { success: false, relDelta: 0 };
      a.needs.delta('social',  12);
      b.needs.delta('social',  12);
      a.needs.delta('comfort',  5);
      b.needs.delta('comfort',  5);
      return { success: true, relDelta: 8 };
    },
  },
  argue: {
    duration: 10,
    execute(a, b, rel) {
      a.needs.delta('social', -8);
      b.needs.delta('social', -8);
      a.needs.delta('fun',    -5);
      b.needs.delta('fun',    -5);
      return { success: true, relDelta: -12 };
    },
  },
  compliment: {
    duration: 4,
    execute(a, b, rel) {
      b.needs.delta('social', 10);
      skillSystem.gain(a, 'charisma', 0.1);
      return { success: true, relDelta: 6 };
    },
  },
};

export class SocialAction {
  /**
   * @param {object} simA       — the actor Sim
   * @param {object} simB       — the target Sim
   * @param {string} type       — one of the INTERACTION_DEFS keys
   * @param {object} world      — World reference for pathfinding
   * @param {object} relGraph   — RelationshipGraph reference
   */
  constructor(simA, simB, type, world, relGraph) {
    this.simA     = simA;
    this.simB     = simB;
    this.type     = type in INTERACTION_DEFS ? type : 'chat';
    this.world    = world;
    this.relGraph = relGraph;
    this._phase   = 'walk';   // 'walk' | 'interact' | 'done'
    this._walkAction = null;
    this._timer      = 0;
    this.done        = false;
  }

  enter() {
    // Walk to a tile adjacent to simB
    const tx = this.simB.gridX + 1;
    const tz = this.simB.gridZ;
    this._walkAction = new WalkToAction(this.simA, this.world, tx, tz);
    this._walkAction.enter();
    this._phase = 'walk';
  }

  update(dt) {
    if (this._phase === 'walk') {
      this._walkAction.update(dt);
      if (this._walkAction.done) {
        this._phase = 'interact';
        this._timer = 0;
      }
      return;
    }

    if (this._phase === 'interact') {
      const def = INTERACTION_DEFS[this.type];
      this._timer += dt;
      if (this._timer >= def.duration) {
        const rel = this.relGraph?.getScore(this.simA.id, this.simB.id) ?? 0;
        const outcome = def.execute(this.simA, this.simB, rel);
        // Update relationship graph
        if (this.relGraph && outcome.relDelta !== 0) {
          this.relGraph.adjustScore(this.simA.id, this.simB.id, outcome.relDelta);
        }
        bus.emit('social:interaction', {
          simA: this.simA,
          simB: this.simB,
          type: this.type,
          outcome,
        });
        this._phase = 'done';
        this.done   = true;
      }
    }
  }

  exit() {
    this._walkAction?.exit?.();
  }
}
  _doInteract() {
    const before = socialManager.score(this._simA.id, this._simB.id);
    const accepted = this._acceptanceScore() >= 0;
    if (!accepted) {
      const score = socialManager.applyOutcome(this._simA.id, this._simB.id, -10, 2, `reject_${this._type}`);
      this._simA.needs.decay('status', 10);
      this._simA.needs.decay('social', 5);
      this._simB.needs.restore('autonomy', 5);
      this._simA.showBubble('No', 2);
      this._simB.showBubble('No', 2);
      Logger.info(`[Social] ${this._simA.name} -> ${this._simB.name}: ${this._type} rejected`);
      this._emitInteraction(score, score - before, false);
      return;
    }

    const score = socialManager.interact(this._simA.id, this._simB.id, this._type);
    const delta = score - before;
    if (this._affordance?.utility) {
      this._applyUtility(this._simA, this._affordance.utility, 1);
      this._applyUtility(this._simB, this._affordance.utility, this._type === 'insult' ? 0.35 : 0.55);
    } else {
      const gain = this._type === 'hug' ? 30 : this._type === 'argue' ? -5 : 20;
      this._simA.needs.restore('social', Math.abs(gain));
      this._simB.needs.restore('social', Math.abs(gain) / 2);
    }
    const emoji = EMOJI[this._type] || '💬';
    this._simA.showBubble(`${emoji} ${this._type}`, 2.5);
    this._simB.showBubble(score >= 0 ? '😊' : '😤', 2);
    Logger.info(`[Social] ${this._simA.name} -> ${this._simB.name}: ${this._type} (score ${score})`);
    this._emitInteraction(score, delta, true);
  }

  _acceptanceScore() {
    const rel = socialManager.getRelation(this._simB.id, this._simA.id);
    const p = this._simB.personality;
    const energy = this._simB.needs.get('energy');
    let score = 0;
    score += (energy - 20) * 0.8;
    score += rel.score * 0.55;
    score += rel.familiarity * 0.25;
    score += p.nice * 18;
    score += p.outgoing * 12;
    score -= Math.max(0, p.neurotic) * 10;
    if (TYPES_NEGATIVE.includes(this._type)) score -= 35;
    if (this._type === 'hug' && rel.familiarity < 25) score -= 25;
    return score;
  }

  _applyUtility(sim, utility, multiplier = 1) {
    for (const [need, amount] of Object.entries(utility || {})) {
      const value = amount * multiplier;
      if (value >= 0) sim.needs.restore(need, value);
      else sim.needs.decay(need, Math.abs(value));
    }
  }

  _emitInteraction(score, delta, accepted) {
    const rel = socialManager.getRelation(this._simA.id, this._simB.id);
    bus.emit('social:interaction', {
      idA: this._simA.id,
      idB: this._simB.id,
      nameA: this._simA.name, nameB: this._simB.name,
      type: this._type,
      result: accepted ? 'success' : 'rejected',
      accepted,
      score,
      delta,
      familiarity: rel.familiarity ?? 0,
    });
  }
}

const EMOJI = {
  chat: '💬', joke: '😄', compliment: '🌟',
  hug: '🤗', argue: '😠', insult: '😡',
};

if (typeof window !== 'undefined') {
  window._socialActionClasses = { SocialAction };
}
