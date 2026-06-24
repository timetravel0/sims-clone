import { describe, it, expect, vi, afterEach } from 'vitest';
import { AutonomousShoppingSystem, craftCapFor, craftCost } from '../src/systems/AutonomousShoppingSystem.js';
import { skillSystem } from '../src/systems/SkillSystem.js';

// Regression (2026-06-24 logs/screenshot): a handy Sim crafted objects without
// bound (custom_object_147) until clutter blocked paths. Crafted objects cluster
// in the house core, so a GLOBAL free-tile gate never tripped. The robust fix is
// a hard COUNT cap (scaled to lot size), immune to where objects sit. Crafting
// also costs materials (charged to the household).

function fakeBudget(funds) {
  return { funds, debits: [], debit(a, r) { if (a > this.funds) return false; this.funds -= a; this.debits.push({ a, r }); return true; } };
}

function makeGame(craftedCount, onCreate, { tilemap = { width: 16, height: 16 }, funds = 10_000 } = {}) {
  const furniture = Array.from({ length: craftedCount }, (_, i) => ({ id: `custom_object_${i + 1}` }));
  return {
    tick: 0,
    budgetSystem: fakeBudget(funds),
    createCustomObject: (d) => { onCreate(); return { ...d, id: 'custom_object_new' }; },
    world: { furniture, tilemap, isCellAvailable: () => false, placeFurniture: () => true },
  };
}

describe('crafted-object count cap', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cap scales with lot size and never below 3', () => {
    expect(craftCapFor({ tilemap: { width: 16, height: 16 } })).toBe(4); // 256/64
    expect(craftCapFor({ tilemap: { width: 16, height: 28 } })).toBeGreaterThan(4); // bigger lot → more
    expect(craftCapFor({ tilemap: { width: 8, height: 8 } })).toBe(3);  // floor clamps to 3
  });

  it('does not craft once the cap is reached', () => {
    vi.spyOn(skillSystem, 'getLevel').mockReturnValue(8);
    vi.spyOn(Math, 'random').mockReturnValue(0); // pass the probability gate
    let created = 0;
    const sys = new AutonomousShoppingSystem(makeGame(4, () => created++), { craftCd: 0 });
    sys._maybeCraft({ sim: { id: 's', name: 'Bob', gx: 5, gz: 5 }, objectType: 'workbench' });
    expect(created).toBe(0); // at cap (4 on a 16×16 lot) → nothing crafted
  });

  it('crafts and charges materials when below the cap and affordable', () => {
    vi.spyOn(skillSystem, 'getLevel').mockReturnValue(8);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let created = 0;
    const game = makeGame(1, () => created++, { funds: 10_000 });
    const sys = new AutonomousShoppingSystem(game, { craftCd: 0 });
    sys._findPlacementFor = () => ({ gx: 5, gz: 5 }); // ensure placement succeeds
    sys._maybeCraft({ sim: { id: 's', name: 'Bob', gx: 5, gz: 5 }, objectType: 'workbench' });
    expect(created).toBe(1);                                   // proceeded
    expect(game.budgetSystem.debits.some(d => d.r === 'craft')).toBe(true); // charged
    expect(game.budgetSystem.funds).toBe(10_000 - craftCost(8)); // exact material cost
  });

  it('does not craft when the household cannot afford materials', () => {
    vi.spyOn(skillSystem, 'getLevel').mockReturnValue(8);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let created = 0;
    const game = makeGame(1, () => created++, { funds: 500 }); // below reserve + cost
    const sys = new AutonomousShoppingSystem(game, { craftCd: 0 });
    sys._findPlacementFor = () => ({ gx: 5, gz: 5 });
    sys._maybeCraft({ sim: { id: 's', name: 'Bob', gx: 5, gz: 5 }, objectType: 'workbench' });
    expect(created).toBe(0); // broke → no craft
  });
});
