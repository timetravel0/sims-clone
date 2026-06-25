import { describe, it, expect, beforeEach } from 'vitest';
import { SessionLogger } from '../src/systems/SessionLogger.js';

// The Story feed (and on-disk log) is the HOUSEHOLD's story: an entry that names
// specific people is kept only if ≥1 is a household member; entries with no subject id
// are ambient/household-level and kept. Fixes neighbour-only beats like
// "Eli grows jealous of Dana" leaking in. The on-disk filter is SessionLogger._isHHEvent;
// the live SimStatusLog feed mirrors the same rule. (2026-06-25)
function memStore() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const HH = new Set(['sim_1', 'sim_2']);
const game = {
  tick: 0, clock: { hour: 8 }, sims: [], budgetSystem: { funds: 0 },
  population: { isHouseholdMember: id => HH.has(id) },
};

beforeEach(() => { globalThis.localStorage = memStore(); globalThis.sessionStorage = memStore(); });

describe('story entries are scoped to the household', () => {
  const log = () => new SessionLogger(game);

  it('drops a neighbour-only beat (all subjects non-household)', () => {
    expect(log()._isHHEvent('story:entry', { idA: 'p_ext1', idB: 'p_ext2' })).toBe(false);
  });
  it('keeps a beat that involves a household member', () => {
    expect(log()._isHHEvent('story:entry', { idA: 'p_ext1', idB: 'sim_2' })).toBe(true);
    expect(log()._isHHEvent('story:entry', { simId: 'sim_1' })).toBe(true);
  });
  it('keeps ambient entries with no subject id', () => {
    expect(log()._isHHEvent('story:entry', { text: 'The budget changed' })).toBe(true);
  });
});
