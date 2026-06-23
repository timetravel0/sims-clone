import { describe, it, expect, beforeEach } from 'vitest';
import { GoalSystem } from '../src/ai/GoalSystem.js';

const makeSim = (id = 's1') => ({
  id,
  name: id,
  personality: { nice: 0.5, outgoing: 0.3, neurotic: 0, playful: 0, ambitious: 0.5 },
  needs: { getAll: () => ({}), get: () => 60 },
  brain: null,
});

describe('GoalSystem — _matchScore via boost()', () => {
  let sys;
  beforeEach(() => {
    sys = new GoalSystem(makeSim());
  });

  it('avoid_sim: penalises positive interactions with the target', () => {
    sys._goals.push({ type: 'avoid_sim', status: 'active', weight: 1, targetId: 'enemy' });
    const aff = { targetType: 'sim', target: { id: 'enemy' }, verb: 'chat' };
    expect(sys.boost(aff)).toBeLessThan(0);
  });

  it('avoid_sim: gives bonus to the avoid verb with the target', () => {
    sys._goals.push({ type: 'avoid_sim', status: 'active', weight: 1, targetId: 'enemy' });
    const aff = { targetType: 'sim', target: { id: 'enemy' }, verb: 'avoid' };
    expect(sys.boost(aff)).toBeGreaterThan(0);
  });

  it('avoid_sim: no effect on interactions with OTHER sims', () => {
    sys._goals.push({ type: 'avoid_sim', status: 'active', weight: 1, targetId: 'enemy' });
    const aff = { targetType: 'sim', target: { id: 'friend' }, verb: 'chat' };
    expect(sys.boost(aff)).toBe(0);
  });

  it('career_advance: gives bonus to skillGain affordances', () => {
    sys._goals.push({ type: 'career_advance', status: 'active', weight: 1 });
    expect(sys.boost({ skillGain: true })).toBeGreaterThan(0);
    expect(sys.boost({ skillGain: false })).toBe(0);
  });

  it('inactive goals are ignored in boost()', () => {
    sys._goals.push({ type: 'avoid_sim', status: 'failed', weight: 1, targetId: 'enemy' });
    const aff = { targetType: 'sim', target: { id: 'enemy' }, verb: 'chat' };
    expect(sys.boost(aff)).toBe(0);
  });

  it('goal expires when deadline passes', () => {
    sys._goals.push({ type: 'be_happy', status: 'active', weight: 0.5, deadline: 5, label: 'Be happy' });
    sys.update(1, 10); // currentDay > deadline
    expect(sys._goals[0].status).toBe('failed');
  });

  it('serialise/restore preserves goals', () => {
    sys._goals.push({ type: 'rest', status: 'active', weight: 0.8, deadline: 99, label: 'Rest' });
    const data = sys.serialise();
    const sys2 = new GoalSystem(makeSim('s2'));
    sys2.restore(data);
    expect(sys2.activeGoals().length).toBe(1);
    expect(sys2.activeGoals()[0].type).toBe('rest');
  });
});
