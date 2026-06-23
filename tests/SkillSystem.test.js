import { describe, it, expect, beforeEach } from 'vitest';
import { SkillSystem, SKILLS } from '../src/systems/SkillSystem.js';
import { bus } from '../src/core/EventBus.js';

// Minimal sim stub
const makeSim = (id = 's1') => ({ id, name: id });

describe('SkillSystem', () => {
  let sys;
  beforeEach(() => {
    sys = new SkillSystem();
  });

  it('register initialises all skills at 0', () => {
    const sim = makeSim();
    sys.register(sim);
    const skills = sys.getSkills(sim);
    for (const s of SKILLS) expect(skills[s]).toBe(0);
  });

  it('gain increases the named skill', () => {
    const sim = makeSim();
    sys.register(sim);
    sys.gain(sim, 'cooking', 1);
    expect(sys.getLevel(sim, 'cooking')).toBe(1);
  });

  it('gain clamps at 10', () => {
    const sim = makeSim();
    sys.register(sim);
    sys.gain(sim, 'logic', 99);
    expect(sys.getSkills(sim).logic).toBe(10);
  });

  it('getLevel floors the float value', () => {
    const sim = makeSim();
    sys.register(sim);
    sys.gain(sim, 'charisma', 1.7);
    expect(sys.getLevel(sim, 'charisma')).toBe(1);
  });

  it('emits skill:levelUp on integer milestone', () => {
    const sim = makeSim();
    sys.register(sim);
    const events = [];

    bus.on('skill:levelUp', e => events.push(e));
    sys.gain(sim, 'fitness', 1);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].skill).toBe('fitness');
  });

  it('does not re-emit the same level after decay', () => {
    const sim = makeSim();
    sys.register(sim);
    const events = [];

    bus.on('skill:levelUp', e => events.push(e));
    sys.gain(sim, 'creativity', 1);     // reaches level 1
    sys.update(1);                       // slight decay
    sys.gain(sim, 'creativity', 0.01);  // back above 1 — should NOT re-emit
    expect(events.filter(e => e.skill === 'creativity' && e.level === 1).length).toBe(1);
  });

  it('update decays skills over days', () => {
    const sim = makeSim();
    sys.register(sim);
    sys.gain(sim, 'handiness', 5);
    const before = sys.getSkills(sim).handiness;
    sys.update(100);
    expect(sys.getSkills(sim).handiness).toBeLessThan(before);
  });

  it('serialise/restore round-trips correctly', () => {
    const sim = makeSim();
    sys.register(sim);
    sys.gain(sim, 'cooking', 3);
    const data = sys.serialise();
    const sys2 = new SkillSystem();
    sys2.register(sim);
    sys2.restore(data);
    expect(sys2.getSkills(sim).cooking).toBeCloseTo(3, 1);
  });
});
