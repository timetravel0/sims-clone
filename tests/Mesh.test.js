import { describe, it, expect } from 'vitest';
import { FurnitureMeshFactory } from '../src/entities/FurnitureMeshFactory.js';

// Regression (2026-06-24): new catalog objects and crafted objects rendered as a
// plain fallback cube (a 1-child group). Every catalog id and every craft type
// must now build a distinct, multi-part silhouette.

const CATALOG = ['bed','fridge','toilet','couch','tv','shower','bookshelf','desk',
  'piano','treadmill','workbench','counter','stove','sink','dining_table','bar',
  'chess','lamp','phone','fire_pit','hot_tub'];

describe('FurnitureMeshFactory shapes', () => {
  it('every catalog object has its own multi-part mesh (not the cube)', () => {
    for (const id of CATALOG) {
      const g = FurnitureMeshFactory.build(id, 0x999999);
      expect(g.children.length, `${id} should not be the fallback cube`).toBeGreaterThan(1);
    }
  });

  it('crafted objects get a shape per need type', () => {
    for (const need of ['fun', 'comfort', 'room', 'energy']) {
      const g = FurnitureMeshFactory.build('custom_object_42', 0x8d6e63, need);
      expect(g.children.length, `craft ${need} should not be the fallback cube`).toBeGreaterThan(1);
    }
  });

  it('a truly unknown object with no need still falls back to the cube', () => {
    const g = FurnitureMeshFactory.build('mystery', 0x999999);
    expect(g.children.length).toBe(1);
  });
});
