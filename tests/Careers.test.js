import { describe, it, expect } from 'vitest';
import { CAREERS } from '../src/config/careers.js';
import { SKILLS }  from '../src/systems/SkillSystem.js';

const employed = CAREERS.filter(c => c.id !== 'unemployed');

describe('career catalogue', () => {
  it('has at least 25 employable tracks', () => {
    expect(employed.length).toBeGreaterThanOrEqual(25);
  });

  it('ids are unique', () => {
    const ids = CAREERS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('starter career ids still exist', () => {
    for (const id of ['scientist', 'chef', 'artist', 'programmer', 'athlete']) {
      expect(CAREERS.some(c => c.id === id)).toBe(true);
    }
  });

  it('every required skill is a real skill', () => {
    for (const c of employed) {
      for (const skill of Object.keys(c.skillReq ?? {})) {
        expect(SKILLS).toContain(skill);
      }
    }
  });

  it('every track has shifts, positive pay and a 0..1 stress factor', () => {
    for (const c of employed) {
      expect(c.shifts.length).toBeGreaterThan(0);
      expect(c.salaryBase).toBeGreaterThan(0);
      expect(c.stress).toBeGreaterThanOrEqual(0);
      expect(c.stress).toBeLessThanOrEqual(1);
    }
  });

  it('schedules are differentiated (more than one distinct shift pattern)', () => {
    const patterns = new Set(employed.map(c => JSON.stringify(c.shifts)));
    expect(patterns.size).toBeGreaterThan(1);
  });
});
