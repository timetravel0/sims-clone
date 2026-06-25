import { bus } from '../core/EventBus.js';

const STATES = ['home', 'work', 'socializing', 'travelling', 'unavailable'];
const MIN_STATE_TICKS = {
  home: 180,
  work: 360,
  socializing: 180,
  travelling: 90,
  unavailable: 240,
};

// Household outings: a Sim leaves the lot (hidden, like work) for a clear reason
// and returns after a while, possibly having had an accident while away.
const OUTING_LABEL = {
  meal_out: '🍽️ Eating out',
  trip: '🚶 On a trip',
  visit_friend: '👋 Visiting a friend',
  other: '🚪 Out',
};
const OUTING_STORY = {
  meal_out: 'went out for a meal.',
  trip: 'went out on a trip.',
  visit_friend: 'went to visit a friend.',
  other: 'stepped out for a while.',
};
const OUTING_REWARD = {
  // A meal out should actually fill a Sim, like a real cooked meal (CookMeal floors
  // hunger at ~75). At +35 they returned still half-hungry and slid straight back into
  // the starvation zone, so going out barely helped. restore() caps at 100.
  meal_out: { hunger: 75, fun: 12, social: 8 },
  trip: { fun: 22, social: 10, comfort: 6 },
  visit_friend: { social: 28, fun: 12 },
  other: { fun: 8 },
};

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
    for (const sim of this._householdSims()) this._updateOuting(sim);
  }

  _householdSims() {
    return (this._game.sims ?? []).filter(s =>
      !s._isVisitor && (this._game.population?.isHouseholdMember?.(s.id) ?? false));
  }

  _updateOuting(sim) {
    if (sim._atWork) return;
    const tick = this._game.tick ?? 0;
    if (sim._outing) {
      if (Math.random() < 0.03) {
        this._game.healthSystem?.reportIncident?.(
          sim.id, 0.2 + Math.random() * 0.5, 'outing_incident', { location: sim._outingReason });
      }
      if (tick >= (sim._outingUntilTick ?? 0)) this._endOuting(sim);
      return;
    }
    if (!this._canStartOuting(sim)) return;
    if (Math.random() < 0.10) this._startOuting(sim);
  }

  _canStartOuting(sim) {
    // At night Sims stay home and sleep — no new outings between 22:00 and 07:00.
    const hour = Math.floor(this._game.clock?.hour ?? 12);
    if (hour >= 22 || hour < 7) return false;
    const n = sim.needs?.getAll?.() ?? {};
    // Stay home to fix a critical need rather than wandering off.
    return (n.hunger ?? 100) >= 25 && (n.energy ?? 100) >= 25 && (n.bladder ?? 100) >= 25;
  }

  /** Public: start a specific outing for a sim (player-initiated, bypasses random check). */
  forceOuting(sim, reason) { this._startOuting(sim, reason); }

  _startOuting(sim, forcedReason = null) {
    const reasons = ['meal_out', 'trip', 'other'];
    if ((this._game.population?.offLotPeople?.()?.length ?? 0) > 0) reasons.push('visit_friend');
    const reason = forcedReason ?? reasons[Math.floor(Math.random() * reasons.length)];
    sim._outing = true;
    sim._outingReason = reason;
    sim._offLotReason = reason;
    sim._outingUntilTick = (this._game.tick ?? 0) + 600 + Math.floor(Math.random() * 600);
    sim.showBubble?.(OUTING_LABEL[reason], 3);
    bus.emit('offlot:stateChanged', {
      personId: sim.id, personName: sim.name, previous: 'home', state: 'outing', reason,
    });
    bus.emit('story:entry', {
      text: `${sim.name} ${OUTING_STORY[reason]}`, cat: 'family', category: 'family',
    });
  }

  _endOuting(sim) {
    const reason = sim._outingReason;
    sim._outing = false;
    sim._outingReason = null;
    sim._offLotReason = null;
    sim._outingUntilTick = 0;
    for (const [need, amt] of Object.entries(OUTING_REWARD[reason] ?? { fun: 10 })) {
      sim.needs?.restore?.(need, amt);
    }
    bus.emit('offlot:stateChanged', {
      personId: sim.id, personName: sim.name, previous: 'outing', state: 'home', reason: 'returned',
    });
    bus.emit('story:entry', {
      text: `${sim.name} came back home.`, cat: 'family', category: 'family',
    });
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
    const canTransition = this._canTransition(person);
    if (canTransition && hour >= 8 && hour <= 17 && ['coworker', 'service'].includes(person.role)) next = 'work';
    else if (canTransition && Math.random() < 0.10) next = STATES[Math.floor(Math.random() * STATES.length)];
    else if (canTransition && prev === 'work' && (hour < 8 || hour > 18)) next = 'home';
    if (next !== prev) {
      person.offLotState = next;
      person.offLotReason = this._reasonForState(person, next, hour);
      person.lastOffLotTransitionTick = this._game.tick ?? 0;
      person.offLotStateUntilTick = (this._game.tick ?? 0) + (MIN_STATE_TICKS[next] ?? 180);
      bus.emit('offlot:stateChanged', {
        personId: person.id,
        personName: person.name,
        previous: prev,
        state: next,
        reason: person.offLotReason,
      });
    }

    if (Math.random() < 0.08) this._relationshipDrift(person);
    if (Math.random() < 0.025) this._incident(person);
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

  _canTransition(person) {
    return (this._game.tick ?? 0) >= (person.offLotStateUntilTick ?? 0);
  }

  _relationshipDrift(person) {
    const host = this._chooseHost(person.id);
    const dyn = this._game.socialDynamics;
    if (!host || !dyn?._apply) return;
    const delta = Math.random() < 0.65 ? 1 : -1;
    dyn._apply(person.id, host.id, { familiarity: 1, affection: delta });
    bus.emit('offlot:relationshipDrift', { personId: person.id, personName: person.name, hostId: host.id, hostName: host.name, delta });
  }

  _incident(person) {
    const host = this._chooseHost(person.id);
    const severity = 0.2 + Math.random() * 0.6;
    const reason = person.offLotState === 'work' ? 'work_incident' : 'outing_incident';
    if (person.role !== 'household') {
      this._game.healthSystem?.reportIncident?.(person.id, severity, reason, { hostId: host?.id ?? null, hostName: host?.name ?? '' });
    }
  }

  _canVisit(person, hour) {
    if (person.offLotState === 'unavailable' || person.offLotState === 'work') return false;
    const av = person.availability ?? { from: 8, to: 22 };
    return hour >= av.from && hour <= av.to;
  }

  _chooseHost(personId) {
    const household = this._game.sims.filter(s => !s._isVisitor && !s._atWork && !s._outing);
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

  _reasonForState(person, state, hour) {
    if (state === 'work') return 'work';
    if (state === 'socializing') return 'outing';
    if (state === 'travelling') return hour < 12 ? 'meal_out' : 'outing';
    if (state === 'unavailable') return 'other';
    return person.offLotReason ?? 'outing';
  }
}
