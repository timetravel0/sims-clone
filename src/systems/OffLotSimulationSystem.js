import { bus } from '../core/EventBus.js';

const STATES = ['home', 'work', 'socializing', 'travelling', 'unavailable'];

export class OffLotSimulationSystem {
  constructor(game) {
    this._game = game;
    this._timer = 0;
    this._interval = 45;
  }

  update(dt) {
    this._timer += dt;
    if (this._timer < this._interval) return;
    this._timer = 0;
    for (const person of this._game.population?.offLotPeople?.() ?? []) this._updatePerson(person);
  }

  serialise() {
    return { timer: this._timer, interval: this._interval };
  }

  restore(data = {}) {
    this._timer = data.timer ?? 0;
    this._interval = data.interval ?? 45;
  }

  _updatePerson(person) {
    const prev = person.offLotState ?? 'home';
    const hour = this._game.clock?.hour ?? 12;
    let next = prev;
    if (hour >= 8 && hour <= 17 && ['coworker', 'service'].includes(person.role)) next = 'work';
    else if (Math.random() < 0.18) next = STATES[Math.floor(Math.random() * STATES.length)];
    else if (prev === 'work' && (hour < 8 || hour > 18)) next = 'home';
    if (next !== prev) {
      person.offLotState = next;
      bus.emit('offlot:stateChanged', { personId: person.id, personName: person.name, previous: prev, state: next });
    }

    if (Math.random() < 0.08) this._relationshipDrift(person);
    if (this._canVisit(person, hour) && Math.random() < 0.12) {
      const host = this._chooseHost(person.id);
      if (host) bus.emit('offlot:visitIntent', {
        personId: person.id,
        personName: person.name,
        hostId: host.id,
        hostName: host.name,
        reason: this._reasonFor(person, host),
        state: person.offLotState,
      });
    }
  }

  _relationshipDrift(person) {
    const host = this._chooseHost(person.id);
    const dyn = this._game.socialDynamics;
    if (!host || !dyn?._apply) return;
    const delta = Math.random() < 0.65 ? 1 : -1;
    dyn._apply(person.id, host.id, { familiarity: 1, affection: delta });
    bus.emit('offlot:relationshipDrift', { personId: person.id, personName: person.name, hostId: host.id, hostName: host.name, delta });
  }

  _canVisit(person, hour) {
    if (person.offLotState === 'unavailable' || person.offLotState === 'work') return false;
    const av = person.availability ?? { from: 8, to: 22 };
    return hour >= av.from && hour <= av.to;
  }

  _chooseHost(personId) {
    const household = this._game.sims.filter(s => !s._isVisitor && !s._atWork);
    if (household.length === 0) return null;
    const dyn = this._game.socialDynamics;
    return household.slice().sort((a, b) => (dyn?.affinity?.(b.id, personId) ?? 0) - (dyn?.affinity?.(a.id, personId) ?? 0))[0];
  }

  _reasonFor(person, host) {
    const rel = this._game.socialDynamics?.snapshot?.(person.id, host.id) ?? {};
    if ((rel.resentment ?? 0) > 18) return 'conflict_visit';
    if ((rel.attraction ?? 0) > 18) return 'romantic_visit';
    if (person.role === 'relative') return 'family_visit';
    if (person.role === 'friend') return 'invited_friend';
    return 'spontaneous_neighbor';
  }
}
