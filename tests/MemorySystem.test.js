import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySystem } from '../src/systems/MemorySystem.js';

describe('MemorySystem', () => {
  let sys;
  beforeEach(() => {
    sys = new MemorySystem();
  });

  it('record stores memory and retrieves it with of()', () => {
    sys.record('s1', 'social', { otherId: 's2' }, 0.8, 1);
    const mems = sys.of('s1');
    expect(mems.length).toBe(1);
    expect(mems[0].type).toBe('social');
    expect(mems[0].intensity).toBeCloseTo(0.8);
  });

  it('intensity is clamped to [0, 1]', () => {
    sys.record('s1', 'mood_peak', {}, 5, 1);
    expect(sys.of('s1')[0].intensity).toBe(1);
    sys.record('s1', 'need_crisis', {}, -2, -1);
    const all = sys.of('s1');
    expect(all.find(m => m.type === 'need_crisis').intensity).toBe(0);
  });

  it('of() returns memories sorted by intensity descending', () => {
    sys.record('s1', 'social', {}, 0.3, 1);
    sys.record('s1', 'social', {}, 0.9, 1);
    sys.record('s1', 'social', {}, 0.5, 1);
    const sorted = sys.of('s1').map(m => m.intensity);
    expect(sorted[0]).toBeGreaterThanOrEqual(sorted[1]);
    expect(sorted[1]).toBeGreaterThanOrEqual(sorted[2]);
  });

  it('capacity evicts lowest-intensity records when over 60', () => {
    for (let i = 0; i < 65; i++) sys.record('s1', 'social', {}, i / 65, 1);
    expect(sys.of('s1').length).toBe(60);
    // lowest intensity (earliest added) should be evicted
    expect(sys.of('s1').every(m => m.intensity > 0)).toBe(true);
  });

  it('biasWith returns positive for positive social memories', () => {
    sys.record('s1', 'social', { otherId: 's2' }, 0.9, 1);
    expect(sys.biasWith('s1', 's2')).toBeGreaterThan(0);
  });

  it('biasWith returns negative for negative social memories', () => {
    sys.record('s1', 'social', { otherId: 's2' }, 0.9, -1);
    expect(sys.biasWith('s1', 's2')).toBeLessThan(0);
  });

  it('update decays memory intensity over time', () => {
    sys.record('s1', 'social', {}, 0.8, 1, 0.01);
    sys.update(10);
    expect(sys.of('s1')[0].intensity).toBeLessThan(0.8);
  });

  it('serialise/restore preserves all memories', () => {
    sys.record('s1', 'life_event', { event: 'born' }, 1, 1, 0.001);
    const data = sys.serialise();
    const sys2 = new MemorySystem();
    sys2.restore(data);
    expect(sys2.of('s1').length).toBe(1);
    expect(sys2.of('s1')[0].data.event).toBe('born');
  });
});
