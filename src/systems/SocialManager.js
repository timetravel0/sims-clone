import { bus } from '../core/EventBus.js';

/**
 * SocialManager — tracks relationship scores between all Sim pairs.
 * Score: -100 (enemies) to +100 (best friends), starts at 0.
 * Emits 'social:update' after every interaction.
 */
export class SocialManager {
  constructor() {
    this._relations = new Map(); // 'id1:id2' → { score, log }
  }

  _key(a, b) {
    return [a, b].sort().join(':');
  }

  getRelation(idA, idB) {
    const k = this._key(idA, idB);
    if (!this._relations.has(k)) this._relations.set(k, { score: 0, log: [] });
    return this._relations.get(k);
  }

  score(idA, idB) { return this.getRelation(idA, idB).score; }

  /**
   * Record a social interaction between two Sims.
   * type: 'chat' | 'joke' | 'argue' | 'compliment' | 'hug'
   */
  interact(idA, idB, type) {
    const delta = INTERACTION_DELTA[type] ?? 2;
    const rel   = this.getRelation(idA, idB);
    rel.score   = Math.max(-100, Math.min(100, rel.score + delta));
    rel.log.push({ type, delta, ts: Date.now() });
    if (rel.log.length > 20) rel.log.shift();
    bus.emit('social:update', { idA, idB, type, score: rel.score, delta });
    return rel.score;
  }

  /** Snapshot for save/load */
  serialise() {
    const out = {};
    for (const [k, v] of this._relations) out[k] = { score: v.score };
    return out;
  }

  restore(data) {
    for (const [k, v] of Object.entries(data)) {
      this._relations.set(k, { score: v.score, log: [] });
    }
  }

  /** All relations involving a simId */
  relationsOf(simId) {
    const out = [];
    for (const [k, v] of this._relations) {
      if (k.includes(simId)) {
        const [a, b] = k.split(':');
        out.push({ other: a === simId ? b : a, score: v.score });
      }
    }
    return out;
  }
}

const INTERACTION_DELTA = {
  chat:       5,
  joke:       8,
  compliment: 10,
  hug:        15,
  argue:     -12,
  insult:    -20,
};

export const socialManager = new SocialManager();
