import { bus } from '../core/EventBus.js';

/**
 * SocialManager — tracks relationship scores between all Sim pairs.
 * Score: -100 (enemies) to +100 (best friends), starts at 0.
 * Emits 'social:update' after every interaction.
 */
export class SocialManager {
  constructor() {
    this._relations = new Map(); // 'id1:id2' → { score, familiarity, log }
  }

  _key(a, b) {
    return [a, b].sort().join(':');
  }

  getRelation(idA, idB) {
    const k = this._key(idA, idB);
    if (!this._relations.has(k)) this._relations.set(k, { score: 0, familiarity: 0, log: [] });
    return this._relations.get(k);
  }

  score(idA, idB) { return this.getRelation(idA, idB).score; }
  familiarity(idA, idB) { return this.getRelation(idA, idB).familiarity; }

  /**
   * Record a social interaction between two Sims.
   * type: 'chat' | 'joke' | 'argue' | 'compliment' | 'hug'
   */
  interact(idA, idB, type) {
    const delta = INTERACTION_DELTA[type] ?? 2;
    const rel   = this.getRelation(idA, idB);
    rel.score   = Math.max(-100, Math.min(100, rel.score + delta));
    rel.familiarity = Math.min(100, rel.familiarity + (FAMILIARITY_GAIN[type] ?? 3));
    rel.log.push({ type, delta, ts: Date.now() });
    if (rel.log.length > 20) rel.log.shift();
    bus.emit('social:update', { idA, idB, type, score: rel.score, delta, familiarity: rel.familiarity });
    return rel.score;
  }

  applyOutcome(idA, idB, delta, familiarityGain = 2, type = 'outcome') {
    const rel = this.getRelation(idA, idB);
    rel.score = Math.max(-100, Math.min(100, rel.score + delta));
    rel.familiarity = Math.min(100, rel.familiarity + familiarityGain);
    rel.log.push({ type, delta, ts: Date.now() });
    if (rel.log.length > 20) rel.log.shift();
    bus.emit('social:update', { idA, idB, type, score: rel.score, delta, familiarity: rel.familiarity });
    return rel.score;
  }

  /** Snapshot for save/load */
  serialise() {
    const out = {};
    for (const [k, v] of this._relations) out[k] = { score: v.score, familiarity: v.familiarity ?? 0 };
    return out;
  }

  restore(data) {
    for (const [k, v] of Object.entries(data)) {
      this._relations.set(k, { score: v.score, familiarity: v.familiarity ?? 0, log: [] });
    }
  }

  /** All relations involving a simId */
  relationsOf(simId) {
    const out = [];
    for (const [k, v] of this._relations) {
      if (k.includes(simId)) {
        const [a, b] = k.split(':');
        out.push({ other: a === simId ? b : a, score: v.score, familiarity: v.familiarity ?? 0 });
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

const FAMILIARITY_GAIN = {
  chat:       6,
  joke:       5,
  compliment: 5,
  hug:        7,
  argue:      4,
  insult:     3,
};

export const socialManager = new SocialManager();
