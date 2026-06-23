import { describe, it, expect, beforeEach } from 'vitest';
import { SocialDynamicsSystem } from '../src/systems/SocialDynamicsSystem.js';

const makeSims = () => [
  { id: 'a', name: 'Alice', personality: { nice: 0.5, outgoing: 0.3, neurotic: 0, playful: 0, ambitious: 0 } },
  { id: 'b', name: 'Bob',   personality: { nice: 0.3, outgoing: 0.5, neurotic: 0, playful: 0, ambitious: 0 } },
];

describe('SocialDynamicsSystem', () => {
  let sys;
  beforeEach(() => {
    sys = new SocialDynamicsSystem(makeSims());
  });

  it('snapshot returns zeroed dimensions initially', () => {
    const snap = sys.snapshot('a', 'b');
    expect(snap.familiarity).toBe(0);
    expect(snap.affection).toBe(0);
    expect(snap.resentment).toBe(0);
  });

  it('applyInteraction for chat increases familiarity and affection', () => {
    sys.applyInteraction('a', 'b', 'chat', true);
    const snap = sys.snapshot('a', 'b');
    expect(snap.familiarity).toBeGreaterThan(0);
    expect(snap.affection).toBeGreaterThan(0);
  });

  it('applyInteraction for insult increases resentment', () => {
    sys.applyInteraction('a', 'b', 'insult', true);
    const snap = sys.snapshot('b', 'a');
    expect(snap.resentment).toBeGreaterThan(0);
  });

  it('affinity is positive after multiple positive interactions', () => {
    for (let i = 0; i < 5; i++) sys.applyInteraction('a', 'b', 'chat', true);
    expect(sys.affinity('a', 'b')).toBeGreaterThan(0);
  });

  it('onCooldown is true immediately after interaction', () => {
    sys.markCooldown('a', 'b', 'chat');
    expect(sys.onCooldown('a', 'b', 'chat')).toBe(true);
  });

  it('onCooldown expires after enough time passes', () => {
    sys.markCooldown('a', 'b', 'chat');
    sys.update(9999); // advance far past any cooldown
    expect(sys.onCooldown('a', 'b', 'chat')).toBe(false);
  });

  it('drift reduces all dims toward 0 over time', () => {
    sys.applyInteraction('a', 'b', 'chat', true);
    const before = sys.snapshot('a', 'b').familiarity;
    sys.update(100000);
    const after = sys.snapshot('a', 'b').familiarity;
    expect(after).toBeLessThan(before);
  });

  it('serialise/restore preserves relationship data', () => {
    sys.applyInteraction('a', 'b', 'hug', true);
    const data = sys.serialise();
    const sys2 = new SocialDynamicsSystem(makeSims());
    sys2.restore(data);
    expect(sys2.snapshot('a', 'b').affection).toBeGreaterThan(0);
  });
});
