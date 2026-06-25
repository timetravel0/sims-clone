import { describe, it, expect, vi, afterEach } from 'vitest';
import { UtilityAIPlanner } from '../src/ai/UtilityAIPlanner.js';
import { GameContext } from '../src/core/GameContext.js';

// "Evil" inclination (2026-06-25): a low-`nice` Sim should score hostile social
// interactions higher than a kind Sim, so they actually lash out.

const DIMS = { trust: 0, affection: 0, respect: 0, attraction: 0, resentment: 0, fear: 0, familiarity: 0, dependency: 0 };

function makeSim(nice) {
  return {
    id: 's' + nice, gx: 5, gz: 5,
    personality: { nice, neurotic: 0, outgoing: 0, playful: 0, ambitious: 0 },
    needs: { getAll: () => ({ social: 50, fun: 50 }), get: () => 50 },
    _world: {}, _brain: null,
  };
}

function scoreArgue(sim) {
  const p = new UtilityAIPlanner(sim);
  return p._score({
    targetType: 'sim', verb: 'argue', target: { id: 't', gx: 5, gz: 5 }, utility: { social: -8 },
  });
}

describe('evil inclination → hostile scoring', () => {
  afterEach(() => { vi.restoreAllMocks(); GameContext.set(null); });

  it('a mean Sim scores arguing higher than a kind Sim', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // identical noise for both
    GameContext.set({
      clock: { hour: 12 },
      socialDynamics: { snapshot: () => ({ ...DIMS }), affinity: () => 0 },
    });
    const meanScore = scoreArgue(makeSim(-0.8));
    const kindScore = scoreArgue(makeSim(0.8));
    expect(meanScore).toBeGreaterThan(kindScore);
  });
});
