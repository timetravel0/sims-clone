import { bus } from '../core/EventBus.js';

const EDGE_TYPES = ['friendship', 'rivalry', 'romance', 'kinship'];
const POSITIVE = new Set(['chat', 'joke', 'compliment', 'hug', 'apologize', 'forgive', 'comfort', 'offer_help', 'ask_help', 'gossip', 'flirt']);
const NEGATIVE = new Set(['argue', 'insult', 'confront', 'avoid', 'reject_flirt']);

function trait(person, key) {
  const value = person?.personality?.[key];
  return Number.isFinite(value) ? value : 0;
}

export class RelationshipGraph {
  constructor(sims = [], population = null) {
    this._sims = sims;
    this._population = population;
    this._edges = new Map();
    this._register();
  }

  setPopulation(population) {
    this._population = population;
  }

  _register() {
    bus.on('social:interaction', event => this.applySocial(event));
    bus.on('relationship:romance', ({ idA, idB, amount = 8 }) => {
      this.adjust(idA, idB, 'romance', amount);
    });
    bus.on('relationship:rivalry', ({ idA, idB, amount = 8 }) => {
      this.adjust(idA, idB, 'rivalry', amount);
    });
  }

  _key(from, to, type) { return `${from}->${to}:${type}`; }

  _edge(from, to, type) {
    const key = this._key(from, to, type);
    if (!this._edges.has(key)) {
      this._edges.set(key, { from, to, type, strength: 0, events: 0, updatedAt: Date.now() });
    }
    return this._edges.get(key);
  }

  applySocial({ idA, idB, type, delta }) {
    if (!idA || !idB) return;
    const amount = Math.max(2, Math.min(18, Math.abs(delta ?? 4)));
    if (POSITIVE.has(type)) {
      this.adjust(idA, idB, 'friendship', amount);
      this.adjust(idB, idA, 'friendship', amount * 0.7);
      this.adjust(idA, idB, 'rivalry', -amount * 0.45);
      this.adjust(idB, idA, 'rivalry', -amount * 0.35);
      const romanceGain = this.compatibility(idA, idB) * (type === 'flirt' ? 10 : type === 'hug' ? 8 : 3);
      if (romanceGain > 1.5) {
        this.adjust(idA, idB, 'romance', romanceGain);
        this.adjust(idB, idA, 'romance', romanceGain * 0.85);
      }
    }
    if (NEGATIVE.has(type)) {
      this.adjust(idA, idB, 'rivalry', amount);
      this.adjust(idB, idA, 'rivalry', amount * 0.75);
      this.adjust(idA, idB, 'friendship', -amount * 0.6);
      this.adjust(idB, idA, 'friendship', -amount * 0.45);
      this.adjust(idA, idB, 'romance', -amount * 0.5);
      this.adjust(idB, idA, 'romance', -amount * 0.5);
    }
  }

  adjust(from, to, type, amount) {
    if (!from || !to || from === to || !EDGE_TYPES.includes(type)) return null;
    // One relationship at a time: a partnered Sim grows romance ONLY with their
    // own partner. Positive romance toward anyone else is blocked (souring it,
    // amount < 0, is always allowed). Keeps Sims from being "in love" with many.
    if (type === 'romance' && amount > 0 && this._population) {
      const fromP = this._population.getPerson?.(from)?.partnerId;
      const toP   = this._population.getPerson?.(to)?.partnerId;
      if ((fromP && fromP !== to) || (toP && toP !== from)) return null;
    }
    const edge = this._edge(from, to, type);
    edge.strength = Math.max(0, Math.min(100, edge.strength + amount));
    edge.events += 1;
    edge.updatedAt = Date.now();
    bus.emit('relationship:graphChanged', { edge: { ...edge } });
    return edge;
  }

  strongest(type = null, threshold = 1) {
    return [...this._edges.values()]
      .filter(edge => (!type || edge.type === type) && edge.strength >= threshold)
      .sort((a, b) => b.strength - a.strength)
      .map(edge => ({ ...edge }));
  }

  edgesOf(simId) {
    return [...this._edges.values()]
      .filter(edge => edge.from === simId || edge.to === simId)
      .sort((a, b) => b.strength - a.strength)
      .map(edge => ({ ...edge }));
  }

  score(from, to, type) {
    return this._edges.get(this._key(from, to, type))?.strength ?? 0;
  }

  compatibility(idA, idB) {
    const a = this._sim(idA), b = this._sim(idB);
    if (!a || !b) return 0;
    const warmth = (trait(a, 'nice') + trait(b, 'nice') + 2) / 4;
    const sharedFun = 1 - Math.min(1, Math.abs(trait(a, 'playful') - trait(b, 'playful')) / 2);
    const socialFit = 1 - Math.min(1, Math.abs(trait(a, 'outgoing') - trait(b, 'outgoing')) / 2);
    const volatility = Math.max(0, (trait(a, 'neurotic') + trait(b, 'neurotic')) / 4);
    return Math.max(0, Math.min(1, warmth * 0.35 + sharedFun * 0.35 + socialFit * 0.25 - volatility * 0.2));
  }

  _sim(id) {
    const sim = this._sims.find(entry => entry.id === id);
    if (sim) return sim;
    const person = this._population?.getPerson?.(id) ?? null;
    if (!person) return null;
    return {
      ...person,
      personality: person.personality ?? person.traits ?? {},
    };
  }

  serialise() {
    return this.strongest(null, 0);
  }

  restore(data = []) {
    this._edges.clear();
    for (const edge of data) {
      if (!edge.from || !edge.to || !edge.type) continue;
      this._edges.set(this._key(edge.from, edge.to, edge.type), {
        from: edge.from,
        to: edge.to,
        type: edge.type,
        strength: Math.max(0, Math.min(100, edge.strength ?? 0)),
        events: edge.events ?? 0,
        updatedAt: edge.updatedAt ?? Date.now(),
      });
    }
    bus.emit('relationship:graphChanged', {});
  }
}
