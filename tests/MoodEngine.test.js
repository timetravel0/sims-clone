import { describe, it, expect } from 'vitest';
import { MoodEngine } from '../src/systems/MoodEngine.js';
import { SimNeeds } from '../src/entities/SimNeeds.js';

// Regression guard: MoodEngine reads sim.needs.getAll(). It previously called
// sim.needs.all() — which does not exist — so needScore was always 0 and every
// Sim read "neutral" forever (99.8% of headless wellbeing evals). These tests
// fail if the accessor name drifts again or the need→mood mapping goes flat.

function fakeSim(id) {
  const needs = new SimNeeds({});           // all needs start at 100
  return { id, needs };
}

describe('MoodEngine reacts to needs', () => {
  const engine = new MoodEngine();

  it('SimNeeds exposes getAll(), not all() — the contract MoodEngine depends on', () => {
    const n = new SimNeeds({});
    expect(typeof n.getAll).toBe('function');
    expect(n.all).toBeUndefined();
  });

  it('full needs → strongly positive mood (happy/ecstatic)', () => {
    const sim = fakeSim('s_full');
    expect(engine.compute(sim)).toBeGreaterThan(0.3);
  });

  it('drained needs → strongly negative mood (sad/miserable)', () => {
    const sim = fakeSim('s_empty');
    for (const k of Object.keys(sim.needs.getAll())) sim.needs.decay(k, 100);
    expect(engine.compute(sim)).toBeLessThan(-0.3);
  });

  it('mood tracks the need gradient (more needs met ⇒ higher mood)', () => {
    const low = fakeSim('s_low');
    for (const k of Object.keys(low.needs.getAll())) low.needs.decay(k, 70); // ~30
    const high = fakeSim('s_high'); // ~100
    expect(engine.compute(high)).toBeGreaterThan(engine.compute(low));
  });
});
