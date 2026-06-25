import { describe, it, expect } from 'vitest';
import { CareerSystem } from '../src/systems/CareerSystem.js';

// Teens (and younger) can't hold a job (2026-06-25). Gate lives in _setCareer,
// so it covers assign/setCareer/switchCareer for founders and the creator.

function sys(stage) {
  const sim = { id: 's', name: 'S', personality: {}, _atWork: false };
  const game = { ageSystem: { getStage: () => stage } };
  return { cs: new CareerSystem([sim], { hour: 9, weekday: 0 }, game), sim };
}

describe('teen work gate', () => {
  it('a teen cannot be assigned a job', () => {
    const { cs } = sys('teen');
    expect(cs.assign('s', 'chef')).toBe(false);
    expect(cs.getInfo('s').careerId).toBe('unemployed');
  });

  it('a child cannot be assigned a job', () => {
    const { cs } = sys('child');
    expect(cs.switchCareer('s', 'chef')).toBe(false);
  });

  it('a young adult can be assigned a job', () => {
    const { cs } = sys('youngAdult');
    expect(cs.assign('s', 'chef')).toBe(true);
    expect(cs.getInfo('s').careerId).toBe('chef');
  });

  it('teens can still be set to unemployed (no-op allowed)', () => {
    const { cs } = sys('teen');
    expect(cs.assign('s', 'unemployed')).toBe(true);
  });
});
