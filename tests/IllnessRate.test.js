import { describe, it, expect } from 'vitest';
import { HealthSystem } from '../src/systems/HealthSystem.js';

// Regression (2026-06-25 investigation): founders were ill 25-55% of the time.
// _illnessChance is rolled every ~28 ticks (~51×/game-day), so the per-cycle
// probability must stay small or Sims get re-infected within a cycle of
// recovering. Even a perfectly healthy Sim was at 0.0175/cycle ≈ 60%/day.
// Target: a well-kept Sim is rarely ill; only sustained neglect raises it.

function hs(kitchenHygiene = 100, weather = 'clear') {
  return new HealthSystem({ tick: 0, _weather: { current: weather }, world: { kitchenHygiene } });
}
function simWith(needs, nutrition = 0.8) {
  return { _nutrition: nutrition, needs: { getAll: () => needs } };
}
const FULL = { hygiene: 100, energy: 100, hunger: 100 };
const CYCLES_PER_DAY = 51; // ~1440 ticks/day ÷ 28-tick health cycle

describe('illness chance calibration', () => {
  it('a well-kept Sim is very rarely ill (< ~10%/day)', () => {
    const c = hs()._illnessChance({}, simWith(FULL, 1.0));
    expect(c).toBeLessThan(0.002);                 // per cycle
    expect(c * CYCLES_PER_DAY).toBeLessThan(0.1);  // per game-day
  });

  it('default nutrition does not by itself make a clean, fed Sim sickly', () => {
    const c = hs()._illnessChance({}, simWith(FULL, 0.6)); // default _nutrition
    expect(c * CYCLES_PER_DAY).toBeLessThan(0.2);
  });

  it('sustained total neglect raises risk but stays capped and bounded', () => {
    const c = hs(0, 'rain')._illnessChance({}, simWith({ hygiene: 0, energy: 0, hunger: 0 }, 0));
    expect(c).toBeLessThanOrEqual(0.02);           // hard cap
    expect(c).toBeGreaterThan(0.01);               // neglect still matters
  });

  it('neglect is meaningfully riskier than good care', () => {
    const good = hs()._illnessChance({}, simWith(FULL, 1.0));
    const bad  = hs()._illnessChance({}, simWith({ hygiene: 10, energy: 10, hunger: 10 }, 0.3));
    expect(bad).toBeGreaterThan(good * 4);
  });
});
