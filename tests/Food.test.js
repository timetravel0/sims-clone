import { describe, it, expect } from 'vitest';
import { RECIPES, pickRecipe } from '../src/config/recipes.js';
import { OBJECT_DEFS }         from '../src/config/objectCatalog.js';
import { QUALITY_SCORE, poisoningChance, updateNutrition } from '../src/ai/CookMealAction.js';
import { HealthSystem }        from '../src/systems/HealthSystem.js';

describe('recipe catalogue', () => {
  it('a novice (skill 0) gets a no-skill recipe', () => {
    expect(pickRecipe(0).skillMin).toBe(0);
  });

  it('higher skill unlocks richer recipes with more servings', () => {
    const novice = pickRecipe(0);
    const expert = pickRecipe(10);
    expect(expert.skillMin).toBeGreaterThan(novice.skillMin);
    expect(expert.servings).toBeGreaterThanOrEqual(novice.servings);
  });

  it('pickRecipe never returns undefined and respects skillMin', () => {
    for (let s = 0; s <= 10; s++) {
      const r = pickRecipe(s);
      expect(r).toBeTruthy();
      expect(s).toBeGreaterThanOrEqual(r.skillMin);
    }
  });

  it('every recipe has at least one serving', () => {
    for (const r of RECIPES) expect(r.servings).toBeGreaterThanOrEqual(1);
  });
});

describe('kitchen objects (WP3)', () => {
  const byId = Object.fromEntries(OBJECT_DEFS.map(o => [o.id, o]));

  it('fridge is a cook station, not a direct eat affordance', () => {
    expect(byId.fridge.functionTags).toContain('cook');
    const verbs = (byId.fridge.affordances ?? []).map(a => a.verb);
    expect(verbs).not.toContain('eat');
  });

  it('stove provides a cook station and counter a prep station', () => {
    expect(byId.stove.functionTags).toContain('cook');
    expect(byId.counter.functionTags).toContain('prep');
  });

  it('dining table is an eat station', () => {
    expect(byId.dining_table.functionTags).toContain('eat');
  });
});

describe('food → health integration (M12)', () => {
  it('poisoning risk worsens with poor quality and improves with cooking skill', () => {
    expect(poisoningChance('excellent', 0)).toBe(0);
    expect(poisoningChance('poor', 0)).toBeGreaterThan(poisoningChance('normal', 0));
    expect(poisoningChance('poor', 0)).toBeGreaterThan(poisoningChance('poor', 8));
    expect(poisoningChance('poor', 12)).toBe(0); // a master cook handles food safely
  });

  it('quality scores are ordered poor < normal < good < excellent', () => {
    expect(QUALITY_SCORE.poor).toBeLessThan(QUALITY_SCORE.normal);
    expect(QUALITY_SCORE.normal).toBeLessThan(QUALITY_SCORE.good);
    expect(QUALITY_SCORE.good).toBeLessThan(QUALITY_SCORE.excellent);
  });

  it('nutrition is a rolling average moving toward the latest meal', () => {
    const sim = {};
    const after = updateNutrition(sim, 1.0); // excellent
    expect(after).toBeGreaterThan(0.6);      // rose from the 0.6 default
    expect(sim._nutrition).toBe(after);
  });

  it('poor nutrition raises illness chance vs good nutrition', () => {
    const hs = new HealthSystem({ _weather: { current: 'clear' } });
    const needs = { getAll: () => ({ hygiene: 70, energy: 70, hunger: 70 }) };
    const wellFed = hs._illnessChance({}, { needs, _nutrition: 1.0 });
    const malnourished = hs._illnessChance({}, { needs, _nutrition: 0.0 });
    expect(malnourished).toBeGreaterThan(wellFed);
  });
});
