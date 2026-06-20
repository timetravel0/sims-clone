import { Action }        from './Action.js';
import { socialManager } from '../systems/SocialManager.js';
import { Logger }        from '../utils/Logger.js';
import { bus }           from '../core/EventBus.js';

/**
 * SocialAction — personality-aware interaction between two Sims.
 * Type selection is biased by the initiator's traits:
 *   playful → joke over compliment
 *   nice    → avoids argue/insult
 *   mean    → argue/insult more likely
 *   outgoing→ initiates even with strangers
 */
const TYPES_POSITIVE = ['chat', 'joke', 'compliment', 'hug'];
const TYPES_NEGATIVE = ['argue', 'insult'];

export class SocialAction extends Action {
  constructor(simA, simB, world, type) {
    super(`Social(${simA.name}→${simB.name})`);
    this._simA  = simA;
    this._simB  = simB;
    this._world = world;
    this._type  = type || this._pickType();
    this._phase = 'walk';
    this._timer = 0;
  }

  _pickType() {
    const p     = this._simA.personality;
    const score = socialManager.score(this._simA.id, this._simB.id);

    // Mean Sim that dislikes target → negative
    if (p.nice < -0.4 && score < -10 && Math.random() < 0.6) {
      return p.neurotic > 0 ? 'insult' : 'argue';
    }
    // High score + playful → joke or hug
    if (score > 50) {
      if (p.playful > 0.3) return Math.random() < 0.5 ? 'joke' : 'hug';
      return 'compliment';
    }
    // Default pool weighted by personality
    const pool = [];
    pool.push('chat', 'chat'); // always possible
    if (p.playful > 0)  pool.push('joke');
    if (p.nice   > 0)   pool.push('compliment');
    if (score    > 20)  pool.push('hug');
    if (p.nice   < -0.2 && Math.random() < 0.3) pool.push('argue');
    return pool[Math.floor(Math.random() * pool.length)];
  }

  enter() {
    const tx = this._simB.gx;
    const tz = Math.min(this._simB.gz + 1, 14);
    this._simA.walkTo(tx, tz);
  }

  update(dt) {
    if (this._phase === 'walk') {
      if (!this._simA.isMoving) {
        this._phase = 'interact';
        this._timer = 2.5;
        this._doInteract();
      }
      return;
    }
    if (this._phase === 'interact') {
      this._timer -= dt;
      if (this._timer <= 0) this.done = true;
    }
  }

  _doInteract() {
    const score = socialManager.interact(this._simA.id, this._simB.id, this._type);
    const gain  = this._type === 'hug' ? 30 : this._type === 'argue' ? -5 : 20;
    this._simA.needs.restore('social', Math.abs(gain));
    this._simB.needs.restore('social', Math.abs(gain) / 2);
    const emoji = EMOJI[this._type] || '💬';
    this._simA.showBubble(`${emoji} ${this._type}`, 2.5);
    this._simB.showBubble(score >= 0 ? '😊' : '😤', 2);
    Logger.info(`[Social] ${this._simA.name} → ${this._simB.name}: ${this._type} (score ${score})`);
    bus.emit('social:interaction', {
      nameA: this._simA.name, nameB: this._simB.name,
      type: this._type, score,
    });
  }
}

const EMOJI = {
  chat: '💬', joke: '😄', compliment: '🌟',
  hug: '🤗', argue: '😠', insult: '😡',
};
