import { describe, it, expect } from 'vitest';
import { CookMealAction } from '../src/ai/CookMealAction.js';
import { HealthSystem }   from '../src/systems/HealthSystem.js';
import { SimNeeds }       from '../src/entities/SimNeeds.js';

// Regression (2026-06-24 log): Sims cooked poor meals repeatedly yet stayed at
// hunger 0 and starved with a reachable fridge. Fixes: a satiety floor on a
// completed meal, and a starvation safety net while a fridge exists.

function hungrySim(id = 's', hunger = 0) {
  const needs = new SimNeeds({});
  needs.decay('hunger', 100 - hunger); // drop to target
  return { id, name: id, needs, _nutrition: 0.6 };
}

describe('CookMealAction satiety floor', () => {
  it('a completed poor meal lifts a starving cook to the satiety floor', () => {
    const sim = hungrySim('cook', 0);
    const world = { furniture: [{ id: 'fridge' }], soilKitchen() {}, kitchenHygiene: 100 };
    const a = new CookMealAction(sim, world);
    // simulate the pipeline state a low-skill, appliance-less cook reaches
    a._cookSkill = 0; a._appliance = null; a._prep = null; a._table = null;
    a._recipe = { id: 'sandwich', label: 'Sandwich', servings: 1 };
    a._finish();
    expect(sim.needs.get('hunger')).toBeGreaterThanOrEqual(75); // not stuck near 0
  });

  it('still tops up additively above the floor for an already-fed cook', () => {
    const sim = hungrySim('cook', 70);
    const world = { furniture: [{ id: 'fridge' }], soilKitchen() {}, kitchenHygiene: 100 };
    const a = new CookMealAction(sim, world);
    a._cookSkill = 0; a._appliance = null; a._prep = null; a._table = null;
    a._recipe = { id: 'sandwich', label: 'Sandwich', servings: 1 };
    a._finish();
    expect(sim.needs.get('hunger')).toBeGreaterThan(75); // 70 + poor gain (30) clamped at 100
  });
});

describe('HealthSystem starvation safety net', () => {
  function makeGame(furniture) {
    const sim = { id: 'p1', name: 'Chiara', needs: new SimNeeds({}), mesh: { visible: true } };
    sim.needs.decay('hunger', 100); // hunger 0
    const person = { id: 'p1', name: 'Chiara', dead: false, health: { state: 'healthy', severity: 0 }, _starveCycles: 24 };
    return {
      tick: 0, sims: [sim],
      world: { furniture },
      population: {
        allPeople: () => [person],
        getPerson: (id) => (id === 'p1' ? person : null),
        deactivatePerson() {},
      },
      _person: person, _sim: sim,
    };
  }

  it('does NOT kill a starving Sim when a fridge exists — feeds instead', () => {
    const g = makeGame([{ id: 'fridge' }]);
    const hs = new HealthSystem(g);
    let died = false;
    import('../src/core/EventBus.js').then(({ bus }) => bus.on('sim:died', () => { died = true; }));
    hs._updatePerson(g._person);            // pushes _starveCycles 24 → 25 (death threshold)
    expect(g._person.dead).toBe(false);     // survived
    expect(g._person._starveCycles).toBe(0); // reset by the emergency feed
    expect(g._sim.needs.get('hunger')).toBeGreaterThan(0);
  });

  it('kills the Sim only when there is no food source at all', () => {
    const g = makeGame([]); // no fridge anywhere
    const hs = new HealthSystem(g);
    hs._updatePerson(g._person);
    expect(g._person.dead).toBe(true);
  });
});
