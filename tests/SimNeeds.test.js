import { describe, it, expect, beforeEach } from 'vitest';
import { SimNeeds } from '../src/entities/SimNeeds.js';

const neutralPersonality = {
  neurotic: 0, playful: 0, outgoing: 0, nice: 0, ambitious: 0,
};

describe('SimNeeds', () => {
  let needs;
  beforeEach(() => {
    needs = new SimNeeds(neutralPersonality);
  });

  it('initialises all needs at 100', () => {
    const all = needs.getAll();
    for (const v of Object.values(all)) expect(v).toBe(100);
  });

  it('restore clamps at 100', () => {
    needs.restore('hunger', 50);
    expect(needs.get('hunger')).toBe(100);
  });

  it('decay clamps at 0', () => {
    needs.decay('energy', 200);
    expect(needs.get('energy')).toBe(0);
  });

  it('delta positive delegates to restore', () => {
    needs.decay('fun', 30);
    needs.delta('fun', 20);
    expect(needs.get('fun')).toBeCloseTo(90, 0);
  });

  it('delta negative delegates to decay', () => {
    needs.delta('social', -10);
    expect(needs.get('social')).toBe(90);
  });

  it('update reduces needs over time', () => {
    needs.update(100);
    const all = needs.getAll();
    for (const v of Object.values(all)) expect(v).toBeLessThan(100);
  });

  it('neurotic personality increases social/fun/hygiene decay', () => {
    const neuroticP = { ...neutralPersonality, neurotic: 1 };
    const neuroticNeeds = new SimNeeds(neuroticP);
    needs.update(100);
    neuroticNeeds.update(100);
    expect(neuroticNeeds.get('social')).toBeLessThan(needs.get('social'));
    expect(neuroticNeeds.get('fun')).toBeLessThan(needs.get('fun'));
  });

  it('mostCritical returns null when all above threshold', () => {
    expect(needs.mostCritical(35)).toBeNull();
  });

  it('mostCritical returns most depleted need below threshold', () => {
    needs.decay('hunger', 75);
    needs.decay('energy', 60);
    expect(needs.mostCritical(35)).toBe('hunger');
  });
});
