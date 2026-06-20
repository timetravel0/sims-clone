import { Action } from './Action.js';
import { socialManager } from '../systems/SocialManager.js';
import { Logger } from '../utils/Logger.js';
import { bus } from '../core/EventBus.js';

const INTERACTION_TYPES = ['chat', 'joke', 'compliment', 'hug', 'argue'];

/**
 * SocialAction — Sim A walks near Sim B, then interacts.
 * Satisfies the 'social' need for both participants.
 */
export class SocialAction extends Action {
  constructor(simA, simB, world, type) {
    super(`Social(${simA.name}→${simB.name}:${type})`);
    this._simA  = simA;
    this._simB  = simB;
    this._world = world;
    this._type  = type || this._pickType(simA.id, simB.id);
    this._phase = 'walk'; // 'walk' | 'interact' | 'done'
    this._timer = 0;
    this._walkDone = false;
  }

  _pickType(idA, idB) {
    const score = socialManager.score(idA, idB);
    if (score > 50) return 'hug';
    if (score > 20) return 'compliment';
    if (score < -20) return 'argue';
    return INTERACTION_TYPES[Math.floor(Math.random() * 3)];
  }

  enter() {
    // Walk to cell adjacent to simB
    const tx = this._simB.gx;
    const tz = this._simB.gz + 1;
    this._simA.walkTo(tx, tz);
  }

  update(dt) {
    if (this._phase === 'walk') {
      if (!this._simA.isMoving) {
        this._phase = 'interact';
        this._timer = 2.5; // seconds of interaction
        this._doInteract();
      }
      return;
    }
    if (this._phase === 'interact') {
      this._timer -= dt;
      if (this._timer <= 0) { this.done = true; }
    }
  }

  _doInteract() {
    const score = socialManager.interact(this._simA.id, this._simB.id, this._type);
    const delta = score;
    // Both Sims gain social points
    const gain = 20;
    this._simA.needs.restore('social', gain);
    this._simB.needs.restore('social', gain / 2);
    // Speech bubbles
    const emoji = EMOJI[this._type] || '💬';
    this._simA.showBubble(`${emoji} ${this._type}`, 2.5);
    this._simB.showBubble(score >= 0 ? '😊' : '😠', 2);
    Logger.info(`[Social] ${this._simA.name} → ${this._simB.name}: ${this._type} (score ${score})`);
    bus.emit('social:interaction', {
      nameA: this._simA.name, nameB: this._simB.name,
      type: this._type, score
    });
  }
}

const EMOJI = {
  chat: '💬', joke: '😄', compliment: '🌟',
  hug: '🤗', argue: '😤', insult: '😡',
};
