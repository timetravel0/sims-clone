import { bus } from '../core/EventBus.js';
import { memorySystem } from './MemorySystem.js';

const POSITIVE = new Set(['chat', 'joke', 'compliment', 'hug']);
const ROMANTIC = new Set(['flirt', 'hug', 'compliment']);

export class RomanceSystem {
  constructor(sims, graph, population = null) {
    this._sims = sims;
    this._graph = graph;
    this._population = population;
    this._announced = new Set();
    this._register();
  }

  setPopulation(population) {
    this._population = population;
  }

  _register() {
    bus.on('social:interaction', event => this._onSocial(event));
  }

  _isHH(id) { return window._game?.population?.isHouseholdMember?.(id) ?? false; }

  _onSocial(event) {
    const { idA, idB, nameA, nameB, type, delta, accepted } = event;
    if (!idA || !idB) return;
    if (!this._isHH(idA) && !this._isHH(idB)) return; // suppress if no household member involved

    const isWarm = POSITIVE.has(type) && (delta ?? 0) > 0;
    const isRomantic = ROMANTIC.has(type) && accepted !== false;
    if (!isWarm && !isRomantic) return;

    const compatibility = this._graph.compatibility(idA, idB);
    const existing = Math.max(
      this._graph.score(idA, idB, 'romance'),
      this._graph.score(idB, idA, 'romance')
    );

    if (isRomantic && compatibility > 0.45) {
      const amount = type === 'flirt' ? 8 : type === 'hug' ? 5 : 3;
      this._graph.adjust(idA, idB, 'romance', amount * compatibility);
      this._graph.adjust(idB, idA, 'romance', amount * compatibility * 0.85);
    }

    if (isWarm && compatibility > 0.58 && existing > 18) {
      const amount = type === 'hug' ? 10 : 5;
      this._graph.adjust(idA, idB, 'romance', amount);
      this._graph.adjust(idB, idA, 'romance', amount * 0.8);
    }

    this._announceRomance(idA, idB, nameA, nameB);
    this._maybeCommitPair(idA, idB);

    if (this._monogamyBreach(idA, idB, type)) {
      this._penaliseBreach(idA, idB, type);
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
    const directWatchers = new Set();
    const partnerA = this._population?.getPartner?.(idA);
    const partnerB = this._population?.getPartner?.(idB);
    if (partnerA?.id && partnerA.id !== idB) directWatchers.add(partnerA.id);
    if (partnerB?.id && partnerB.id !== idA) directWatchers.add(partnerB.id);

    for (const watcherId of directWatchers) {
      const watcher = this._sims.find(s => s.id === watcherId) ?? this._gameSim(watcherId);
      if (!watcher) continue;
      const targetId = watcherId === partnerA?.id ? idA : idB;
      const targetName = watcherId === partnerA?.id ? nameA : nameB;
      const jealousy = Math.min(1, 0.55 + Math.max(0, watcher.personality?.neurotic ?? 0) * 0.25);
      watcher.emotions.trigger('jealousy', jealousy);
      memorySystem.record(watcher.id, 'social', {
        otherId: targetId,
        otherName: targetName,
        type: `jealous_${type}`,
      }, jealousy, -0.7, 0.002);
      this._graph.adjust(watcher.id, targetId, 'rivalry', 8 + jealousy * 10);
      bus.emit('story:entry', { text: `${watcher.name} grows jealous of ${targetName}`, cat: 'gossip' });
    }

    for (const watcher of this._sims) {
      if (watcher.id === idA || watcher.id === idB) continue;
      if (directWatchers.has(watcher.id)) continue;
      const towardA = this._graph.score(watcher.id, idA, 'romance');
      const towardB = this._graph.score(watcher.id, idB, 'romance');
      const targetId = towardA >= towardB ? idA : idB;
      const targetName = towardA >= towardB ? nameA : nameB;
      const partnerPull = Math.max(towardA, towardB);
      if (partnerPull < 35) continue;
      const jealousy = Math.min(1, 0.45 + partnerPull / 140 + Math.max(0, watcher.personality?.neurotic ?? 0) * 0.25);
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

  _monogamyBreach(idA, idB, type) {
    if (type !== 'flirt') return false;
    const aPartner = this._population?.getPerson?.(idA)?.partnerId ?? null;
    const bPartner = this._population?.getPerson?.(idB)?.partnerId ?? null;
    return (aPartner && aPartner !== idB) || (bPartner && bPartner !== idA);
  }

  _penaliseBreach(idA, idB, type) {
    const penalty = type === 'flirt' ? 8 : 4;
    this._graph.adjust(idA, idB, 'romance', -penalty);
    this._graph.adjust(idB, idA, 'romance', -penalty * 0.8);
    this._graph.adjust(idA, idB, 'rivalry', penalty * 0.7);
    this._graph.adjust(idB, idA, 'rivalry', penalty * 0.7);
    bus.emit('story:entry', {
      text: `${this._name(idA)} and ${this._name(idB)} strain a committed bond.`,
      cat: 'drama',
      category: 'drama',
    });
  }

  _maybeCommitPair(idA, idB) {
    if (this._population?.sameHousehold?.(idA, idB)) {
      if (this._population.getPerson?.(idA)?.partnerId && this._population.getPerson?.(idA)?.partnerId !== idB) return;
      if (this._population.getPerson?.(idB)?.partnerId && this._population.getPerson?.(idB)?.partnerId !== idA) return;
      const a = this._graph.score(idA, idB, 'romance');
      const b = this._graph.score(idB, idA, 'romance');
      if (a >= 35 && b >= 35) this._population.setPartner?.(idA, idB);
      return;
    }
    // Cross-household: propose move-in if romance is high enough
    const aH = this._population?.isHouseholdMember?.(idA);
    const bH = this._population?.isHouseholdMember?.(idB);
    if (!aH && !bH) return;
    const [hId, vId] = aH ? [idA, idB] : [idB, idA];
    if (this._graph.score(hId, vId, 'romance') < 50 || this._graph.score(vId, hId, 'romance') < 50) return;
    const key = `${[hId, vId].sort().join(':')}:movein`;
    if (this._announced.has(key)) return;
    this._announced.add(key);
    bus.emit('romance:moveInProposal', {
      householdId: hId, householdName: this._name(hId),
      visitorId:   vId, visitorName:   this._name(vId),
    });
  }

  _gameSim(id) {
    return globalThis.window?._game?.sims?.find?.(s => s.id === id) ?? null;
  }

  _name(id) {
    return this._sims.find(s => s.id === id)?.name
      ?? globalThis.window?._game?.population?.getPerson?.(id)?.name
      ?? id;
  }

  serialise() {
    return { announced: [...this._announced] };
  }

  restore(data = {}) {
    this._announced = new Set(data.announced || []);
  }
}
