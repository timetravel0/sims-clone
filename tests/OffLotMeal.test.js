import { describe, it, expect } from 'vitest';
import { OffLotSimulationSystem } from '../src/systems/OffLotSimulationSystem.js';
import { SimNeeds } from '../src/entities/SimNeeds.js';

// A meal out must substantially feed a Sim (2026-06-25). At +35 they returned still
// half-hungry and slid back into the starvation zone; a real meal fills toward full.
function makeSim() {
  const needs = new SimNeeds({});
  needs.decay('hunger', 80); // hunger 100 → 20
  return { id: 's', name: 'S', needs, showBubble() {} };
}

describe('meal out fills the Sim', () => {
  it('restores hunger well past half (≈full), not a token amount', () => {
    const sim = makeSim();
    const game = { sims: [sim], tick: 0, clock: { hour: 12 },
      population: { offLotPeople: () => [], isHouseholdMember: () => true } };
    const sys = new OffLotSimulationSystem(game);
    sys.forceOuting(sim, 'meal_out');
    sys._endOuting(sim);
    expect(sim.needs.get('hunger')).toBeGreaterThanOrEqual(90); // 20 + 75, capped 100
  });
});
