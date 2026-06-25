import { describe, it, expect } from 'vitest';
import { nameOf } from '../src/ui/nameOf.js';

// Off-lot people (relatives/neighbours) live only in the population registry, not in
// game.sims (on-lot spawns). Resolving against sims alone showed their raw p_<uuid> id
// in the UI (e.g. the relative Mara → "p_362b9430-…"). population must win. (2026-06-25)
describe('nameOf id→name resolution', () => {
  const game = {
    sims: [{ id: 'sim_1', name: 'SimM' }],
    population: { getPerson: id => (id === 'p_mara' ? { name: 'Mara' } : null) },
  };

  it('resolves an off-lot person (only in population) to its name, not the id', () => {
    expect(nameOf('p_mara', game)).toBe('Mara');
  });
  it('falls back to on-lot sims when not in population', () => {
    expect(nameOf('sim_1', game)).toBe('SimM');
  });
  it('falls back to the raw id only when truly unknown', () => {
    expect(nameOf('p_ghost', game)).toBe('p_ghost');
  });
});
