import { describe, it, expect, beforeEach } from 'vitest';
import { World }       from '../src/world/World.js';
import { HealthSystem } from '../src/systems/HealthSystem.js';

class FakeScene { add() {} remove() {} }

describe('kitchen hygiene & dish-washing (WP3/WP8)', () => {
  let world;
  beforeEach(() => { world = new World(new FakeScene()); });

  it('cooking soils the kitchen (dishes up, hygiene down)', () => {
    expect(world.kitchenHygiene).toBe(100);
    world.soilKitchen(2);
    expect(world.dirtyDishes).toBe(2);
    expect(world.kitchenHygiene).toBe(88);
  });

  it('washing requires a sink and restores hygiene', () => {
    world.soilKitchen(3);
    expect(world.furniture.some(f => f.functionTags?.includes('wash'))).toBe(true); // default lot has a sink
    expect(world.washDishes()).toBe(true);
    expect(world.dirtyDishes).toBe(0);
    expect(world.kitchenHygiene).toBe(100);
  });

  it('cannot wash without a sink', () => {
    world.furniture = world.furniture.filter(f => f.id !== 'sink');
    world.soilKitchen(1);
    expect(world.washDishes()).toBe(false);
  });

  it('kitchen state survives serialise/restore', () => {
    world.soilKitchen(2);
    const snap = world.serialiseKitchen();
    const w2 = new World(new FakeScene());
    w2.restoreKitchen(snap);
    expect(w2.kitchenHygiene).toBe(88);
    expect(w2.dirtyDishes).toBe(2);
  });

  it('a dirty kitchen raises illness chance', () => {
    const needs = { getAll: () => ({ hygiene: 70, energy: 70, hunger: 70 }) };
    const clean = new HealthSystem({ world: { kitchenHygiene: 100 } })._illnessChance({}, { needs });
    const dirty = new HealthSystem({ world: { kitchenHygiene: 0 } })._illnessChance({}, { needs });
    expect(dirty).toBeGreaterThan(clean);
  });
});
