import { describe, it, expect, beforeEach } from 'vitest';
import { DoctorService } from '../src/systems/DoctorService.js';
import { pickTreatment, TREATMENT_BY_ID } from '../src/config/treatments.js';

// Fake game: a person with health, a budget, a health system with treat(), a tick.
function makeGame({ funds = 20000, illness = 'flu', severity = 0.6, household = true } = {}) {
  const person = { id: 'p1', name: 'Pat', dead: false, health: { state: 'ill', illness, severity } };
  const budget = {
    _f: funds, get funds() { return this._f; },
    debit(a) { if (a > this._f) return false; this._f -= a; return true; },
  };
  const health = {
    treat(id, { resolve = true, drop = 0.4 } = {}) {
      if (person.health.state === 'healthy') return false;
      if (resolve) { person.health = { state: 'healthy', illness: null, severity: 0 }; return true; }
      person.health.severity = Math.max(0, person.health.severity - drop);
      return true;
    },
  };
  return {
    tick: 0,
    budgetSystem: budget,
    healthSystem: health,
    population: {
      isHouseholdMember: () => household,
      getPerson: (id) => (id === 'p1' ? person : null),
    },
    _person: person,
  };
}

describe('treatment selection', () => {
  it('routes severe/trauma illnesses to urgent care', () => {
    expect(pickTreatment('food poisoning', 0.6, 20000).id).toBe('urgent_care');
    expect(pickTreatment('cold', 0.9, 20000).id).toBe('urgent_care'); // high severity
  });
  it('uses cheap medicine for mild common illnesses', () => {
    expect(pickTreatment('cold', 0.3, 20000).id).toBe('medicine');
  });
  it('falls back to consultation otherwise', () => {
    expect(pickTreatment('mystery', 0.3, 20000).id).toBe('consultation');
  });
  it('returns null when nothing is affordable', () => {
    expect(pickTreatment('cold', 0.3, 10)).toBeNull();
  });
});

describe('DoctorService', () => {
  let game, doc;
  beforeEach(() => { game = makeGame(); doc = new DoctorService(game); });

  it('books a treatment for an ill household member', () => {
    const id = doc.book('p1');
    expect(id).toBeTruthy();
    expect(doc._pending.has('p1')).toBe(true);
  });

  it('does not book when funds are insufficient', () => {
    game.budgetSystem._f = 10;
    expect(doc.book('p1')).toBeNull();
  });

  it('resolves after the arrival delay: debits fee and cures', () => {
    const startFunds = game.budgetSystem.funds;
    const id = doc.book('p1');
    const cost = TREATMENT_BY_ID.get(id).cost;
    game.tick = 100; // past dueTick
    doc.update();
    expect(game._person.health.state).toBe('healthy');
    expect(game.budgetSystem.funds).toBe(startFunds - cost);
    expect(doc._pending.has('p1')).toBe(false);
  });

  it('treatNow resolves immediately', () => {
    doc.treatNow('p1', 'home_visit');
    expect(game._person.health.state).toBe('healthy');
  });

  it('auto-books when a household member becomes ill above threshold', () => {
    // Re-init to attach the bus listener freshly, then emit an illness event.
    const g = makeGame({ severity: 0.7 });
    const d = new DoctorService(g);
    // Simulate HealthSystem emitting state change
    // (DoctorService listens to 'health:stateChanged')
    // eslint-disable-next-line no-undef
    return import('../src/core/EventBus.js').then(({ bus }) => {
      bus.emit('health:stateChanged', { personId: 'p1', state: 'ill', severity: 0.7, illness: 'flu' });
      expect(d._pending.has('p1')).toBe(true);
      d.dispose();
    });
  });
});
