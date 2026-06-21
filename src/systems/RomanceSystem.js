import { bus } from '../core/EventBus.js';
import { memorySystem } from './MemorySystem.js';

const POSITIVE = new Set(['chat', 'joke', 'compliment', 'hug']);

export class RomanceSystem {
  constructor(sims, graph) {
    this._sims = sims;
    this._graph = graph;
    this._announced = new Set();
    this._register();
  }

  _register() {
    bus.on('social:interaction', event => this._onSocial(event));
  }

  _onSocial(event) {
    const { idA, idB, nameA, nameB, type, delta } = event;
    if (!idA || !idB || !POSITIVE.has(type) || (delta ?? 0) <= 0) return;

    const compatibility = this._graph.compatibility(idA, idB);
    const existing = Math.max(
      this._graph.score(idA, idB, 'romance'),
      this._graph.score(idB, idA, 'romance')
    );
    if (compatibility > 0.58 && existing > 18) {
      const amount = type === 'hug' ? 10 : 5;
      this._graph.adjust(idA, idB, 'romance', amount);
      this._graph.adjust(idB, idA, 'romance', amount * 0.8);
      this._announceRomance(idA, idB, nameA, nameB);
    }

    this._triggerJealousy(event);
  }

  _announceRomance(idA, idB, nameA, nameB) {
    const key = [idA, idB].sort().join(':');
    if (this._announced.has(key)) return;
    const a = this._graph.score(idA, idB, 'romance');
    const b = this._graph.score(idB, idA, 'romance');
    if (a < 35 || b < 25) return;
    this._announced.add(key);
    bus.emit('story:entry', { text: `${nameA} and ${nameB} feel a romantic spark`, cat: 'gossip' });
  }

  _triggerJealousy({ idA, idB, nameA, nameB, type }) {
    for (const watcher of this._sims) {
      if (watcher.id === idA || watcher.id === idB) continue;
      const towardA = this._graph.score(watcher.id, idA, 'romance');
      const towardB = this._graph.score(watcher.id, idB, 'romance');
      const targetId = towardA >= towardB ? idA : idB;
      const targetName = towardA >= towardB ? nameA : nameB;
      const partnerPull = Math.max(towardA, towardB);
      if (partnerPull < 35) continue;
      const jealousy = Math.min(1, 0.45 + partnerPull / 140 + Math.max(0, watcher.personality.neurotic) * 0.25);
      watcher.emotions.trigger('jealousy', jealousy);
      memorySystem.record(watcher.id, 'social', {
        otherId: targetId,
        otherName: targetName,
        type: `jealous_${type}`,
      }, jealousy, -0.65, 0.001);
      this._graph.adjust(watcher.id, targetId, 'rivalry', 4 + jealousy * 8);
      bus.emit('story:entry', { text: `${watcher.name} grows jealous of ${targetName}`, cat: 'gossip' });
      break;
    }
  }

  serialise() {
    return { announced: [...this._announced] };
  }

  restore(data = {}) {
    this._announced = new Set(data.announced || []);
  }
}
