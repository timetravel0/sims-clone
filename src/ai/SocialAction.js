import { Action }        from './Action.js';
import { socialManager } from '../systems/SocialManager.js';
import { skillSystem }   from '../systems/SkillSystem.js';
import { Logger }        from '../utils/Logger.js';
import { bus }           from '../core/EventBus.js';

const TYPES_NEGATIVE = ['argue', 'insult'];

export class SocialAction extends Action {
  constructor(simA, simB, world, type = null, affordance = null) {
    super(affordance?.label || `Social(${simA.name}->${simB.name})`);
    this._sim = simA;
    this._simA = simA;
    this._simB = simB;
    this._world = world;
    this._type = type || this._pickType();
    this._affordance = affordance;
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
        this._timer = this._affordance?.duration ?? INTERACTION_DURATION[this._type] ?? 2.5;
        this._doInteract();
      }
      return;
    }

    if (this._phase === 'interact') {
      this._timer -= dt;
      if (this._timer <= 0) this.done = true;
    }
  }

  _pickType() {
    const p = this._simA.personality;
    const score = socialManager.score(this._simA.id, this._simB.id);

    if (p.nice < -0.4 && score < -10 && Math.random() < 0.6) {
      return p.neurotic > 0 ? 'insult' : 'argue';
    }
    if (score > 50) {
      if (p.playful > 0.3) return Math.random() < 0.5 ? 'joke' : 'hug';
      return 'compliment';
    }

    const pool = ['chat', 'chat'];
    if (p.playful > 0) pool.push('joke');
    if (p.nice > 0) pool.push('compliment');
    if (score > 20) pool.push('hug');
    if (p.nice < -0.2 && Math.random() < 0.3) pool.push('argue');
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _doInteract() {
    const before = socialManager.score(this._simA.id, this._simB.id);
    const accepted = this._acceptanceScore() >= 0;

    if (!accepted) {
      const score = socialManager.applyOutcome(this._simA.id, this._simB.id, -10, 2, `reject_${this._type}`);
      this._changeNeed(this._simA, 'status', -10);
      this._changeNeed(this._simA, 'social', -5);
      this._changeNeed(this._simB, 'autonomy', 5);
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
      this._applyDefaultPayoff();
    }

    if (['chat', 'joke', 'compliment'].includes(this._type)) {
      skillSystem.gain(this._simA, 'charisma', this._type === 'joke' ? 0.15 : 0.1);
    }

    const emoji = EMOJI[this._type] || '...';
    this._simA.showBubble(`${emoji} ${this._type}`, 2.5);
    this._simB.showBubble(score >= 0 ? 'OK' : 'No', 2);
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

  _applyDefaultPayoff() {
    const gain = this._type === 'hug' ? 30 : this._type === 'argue' ? -5 : 20;
    this._changeNeed(this._simA, 'social', Math.abs(gain));
    this._changeNeed(this._simB, 'social', Math.abs(gain) / 2);
    if (this._type === 'joke') {
      this._changeNeed(this._simA, 'fun', 8);
      this._changeNeed(this._simB, 'fun', skillSystem.getLevel(this._simA, 'charisma') >= 3 ? 10 : 3);
    }
    if (this._type === 'hug') {
      this._changeNeed(this._simA, 'comfort', 5);
      this._changeNeed(this._simB, 'comfort', 5);
    }
  }

  _applyUtility(sim, utility, multiplier = 1) {
    for (const [need, amount] of Object.entries(utility || {})) {
      this._changeNeed(sim, need, amount * multiplier);
    }
  }

  _changeNeed(sim, need, amount) {
    if (typeof sim.needs.delta === 'function') {
      sim.needs.delta(need, amount);
    } else if (amount >= 0) {
      sim.needs.restore(need, amount);
    } else {
      sim.needs.decay(need, Math.abs(amount));
    }
  }

  _emitInteraction(score, delta, accepted) {
    const rel = socialManager.getRelation(this._simA.id, this._simB.id);
    bus.emit('social:interaction', {
      idA: this._simA.id,
      idB: this._simB.id,
      nameA: this._simA.name,
      nameB: this._simB.name,
      simA: this._simA,
      simB: this._simB,
      type: this._type,
      result: accepted ? 'success' : 'rejected',
      accepted,
      outcome: { success: accepted, relDelta: delta },
      score,
      delta,
      familiarity: rel.familiarity ?? 0,
    });
  }
}

const INTERACTION_DURATION = {
  chat: 4,
  joke: 4,
  compliment: 4,
  hug: 5,
  argue: 5,
  insult: 3,
};

const EMOJI = {
  chat: '...',
  joke: 'ha',
  compliment: '+',
  hug: 'hug',
  argue: '!',
  insult: '!!',
};

if (typeof window !== 'undefined') {
  window._socialActionClasses = { SocialAction };
}
