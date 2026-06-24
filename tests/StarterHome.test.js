import { describe, it, expect } from 'vitest';
import { DEFAULT_HOUSE_FURNITURE } from '../src/config/defaultScenario.js';
import { SKILL_BY_OBJECT, OBJECT_DEFS } from '../src/config/objectCatalog.js';
import { SKILLS } from '../src/systems/SkillSystem.js';

const ids = DEFAULT_HOUSE_FURNITURE.map(f => f.id);
const validIds = new Set(OBJECT_DEFS.map(o => o.id));

describe('starter home is minimal-but-complete', () => {
  it('every default object exists in the catalogue', () => {
    for (const id of ids) expect(validIds.has(id)).toBe(true);
  });

  it('covers every restorable need with a dedicated object', () => {
    const needs = ['energy', 'hunger', 'bladder', 'hygiene', 'comfort', 'fun', 'room'];
    for (const need of needs) {
      expect(DEFAULT_HOUSE_FURNITURE.some(f => f.needTarget === need)).toBe(true);
    }
  });

  it('equips the full food lifecycle (storage → prep → cook → wash → eat)', () => {
    for (const id of ['fridge', 'counter', 'stove', 'sink', 'dining_table']) {
      expect(ids).toContain(id);
    }
  });

  it('provides a source for every skill', () => {
    const trained = new Set(ids.map(id => SKILL_BY_OBJECT[id]).filter(Boolean));
    for (const skill of SKILLS) expect(trained.has(skill)).toBe(true);
  });

  it('places at most one object per tile (no overlaps)', () => {
    const cells = DEFAULT_HOUSE_FURNITURE.map(f => `${f.gx},${f.gz}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('keeps all objects inside the lot interior (not on the border)', () => {
    for (const f of DEFAULT_HOUSE_FURNITURE) {
      expect(f.gx).toBeGreaterThanOrEqual(1);
      expect(f.gx).toBeLessThanOrEqual(14);
      expect(f.gz).toBeGreaterThanOrEqual(1);
      expect(f.gz).toBeLessThanOrEqual(14);
    }
  });
});
