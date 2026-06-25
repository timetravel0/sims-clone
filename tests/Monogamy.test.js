import { describe, it, expect } from 'vitest';
import { RelationshipGraph } from '../src/systems/RelationshipGraph.js';

// One relationship at a time (2026-06-25): a partnered Sim must not grow romance
// with anyone other than their partner. Enforced centrally in adjust().

function popWith(partners) {
  return { getPerson: (id) => ({ id, partnerId: partners[id] ?? null }) };
}

describe('romance exclusivity', () => {
  it('blocks positive romance from a partnered Sim toward a non-partner', () => {
    const g = new RelationshipGraph([], popWith({ a: 'b', b: 'a' }));
    g.adjust('a', 'c', 'romance', 30);
    expect(g.score('a', 'c', 'romance')).toBe(0);
  });

  it('allows romance growth with the actual partner', () => {
    const g = new RelationshipGraph([], popWith({ a: 'b', b: 'a' }));
    g.adjust('a', 'b', 'romance', 30);
    expect(g.score('a', 'b', 'romance')).toBeGreaterThan(0);
  });

  it('allows romance for a single (unpartnered) Sim', () => {
    const g = new RelationshipGraph([], popWith({}));
    g.adjust('a', 'c', 'romance', 30);
    expect(g.score('a', 'c', 'romance')).toBeGreaterThan(0);
  });

  it('still lets romance sour (negative) toward a non-partner', () => {
    const g = new RelationshipGraph([], popWith({ a: 'b', b: 'a' }));
    g.adjust('a', 'c', 'romance', 40);   // blocked → 0
    g.adjust('a', 'c', 'romance', -10);  // negative allowed, clamps at 0 floor
    expect(g.score('a', 'c', 'romance')).toBe(0);
  });
});
