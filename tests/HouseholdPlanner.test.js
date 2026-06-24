import { describe, it, expect, beforeEach } from 'vitest';
import { HouseholdPlanner } from '../src/systems/HouseholdPlanner.js';

// Fake sim with needs.
function sim(id, needs = {}, ambitious = 0) {
  const base = { hunger: 100, energy: 100, bladder: 100, hygiene: 100, fun: 100, social: 100, comfort: 100 };
  const vals = { ...base, ...needs };
  return { id, _isVisitor: false, personality: { ambitious }, needs: { get: k => vals[k] } };
}

function makeGame({ funds = 20000, sims = [], ill = [], needReason = null, layoutIssues = 0 } = {}) {
  const calls = [];
  return {
    calls,
    clock: { day: 5 },
    budgetSystem: { funds },
    sims,
    population: { householdMembers: () => ill },
    doctor: { book: id => calls.push(['book', id]) },
    construction: { _needReason: () => needReason, build: r => calls.push(['build', r]) },
    autonomousShopping: { _considerPurchase: () => calls.push(['buy']) },
    layoutPlanner: { score: () => ({ issues: Array(layoutIssues).fill('x') }), autoRearrange: () => calls.push(['rearrange']) },
    world: {
      kitchenHygiene: 100,
      furniture: [{ id: 'sink', functionTags: ['wash'] }],
      washDishes: () => calls.push(['wash']),
    },
  };
}

describe('HouseholdPlanner', () => {
  it('observe() reports funds, illnesses and need pressures', () => {
    const g = makeGame({ sims: [sim('a', { hunger: 20 })] });
    const obs = new HouseholdPlanner(g).observe();
    expect(obs.funds).toBe(20000);
    expect(obs.pressures.hunger).toBeCloseTo(0.8, 1);
  });

  it('ranks treating a severe illness above routine needs', () => {
    const g = makeGame({
      sims: [sim('a', { hunger: 55 })],
      ill: [{ id: 'a', name: 'Al', health: { state: 'ill', severity: 0.9 }, dead: false }],
    });
    const ranked = new HouseholdPlanner(g).rank();
    expect(ranked[0].type).toBe('treat_illness');
  });

  it('plan() executes the top intervention and logs it', () => {
    const g = makeGame({
      ill: [{ id: 'a', name: 'Al', health: { state: 'ill', severity: 0.8 }, dead: false }],
    });
    const top = new HouseholdPlanner(g).plan();
    expect(top.type).toBe('treat_illness');
    expect(g.calls).toContainEqual(['book', 'a']);
  });

  it('proposes building a room when needed and affordable', () => {
    const g = makeGame({ needReason: 'bedroom', funds: 20000 });
    const ranked = new HouseholdPlanner(g).rank();
    expect(ranked.some(c => c.type === 'build_room')).toBe(true);
  });

  it('does not propose building when funds are below the reserve', () => {
    const g = makeGame({ needReason: 'bedroom', funds: 1000 });
    const ranked = new HouseholdPlanner(g).rank();
    expect(ranked.some(c => c.type === 'build_room')).toBe(false);
  });

  it('buys for the most pressured need', () => {
    const g = makeGame({ sims: [sim('a', { fun: 10 })] });
    const top = new HouseholdPlanner(g).plan();
    expect(top.type).toBe('buy_object');
    expect(g.calls).toContainEqual(['buy']);
  });

  it('schedules kitchen cleaning when hygiene is low and a sink exists', () => {
    const g = makeGame({ sims: [sim('a')] });
    g.world.kitchenHygiene = 30;
    const ranked = new HouseholdPlanner(g).rank();
    const clean = ranked.find(c => c.type === 'clean_kitchen');
    expect(clean).toBeTruthy();
    clean.exec();
    expect(g.calls).toContainEqual(['wash']);
  });

  it('does nothing when no bottleneck crosses the urgency floor', () => {
    const g = makeGame({ sims: [sim('a')] }); // all needs full, no illness
    expect(new HouseholdPlanner(g).plan()).toBeNull();
  });

  it('serialise/restore round-trips the plan counter', () => {
    const g = makeGame({ ill: [{ id: 'a', name: 'Al', health: { state: 'ill', severity: 0.8 }, dead: false }] });
    const p = new HouseholdPlanner(g);
    p.plan();
    const p2 = new HouseholdPlanner(makeGame());
    p2.restore(p.serialise());
    expect(p2.plansMade).toBe(1);
  });
});
