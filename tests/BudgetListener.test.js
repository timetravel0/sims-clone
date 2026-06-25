import { describe, it, expect } from 'vitest';
import { bus } from '../src/core/EventBus.js';
import { budgetSystem } from '../src/systems/BudgetSystem.js';

// Regression (2026-06-25): budgetSystem's career:salary listener must survive
// bus.clear(). HeadlessRuntime.dispose() calls bus.clear() between runs; when the
// listener used a plain bus.on() it was wiped after run 1, so every later run
// earned no income → bankruptcy → starvation/cook-loop, corrupting all analysis
// past the first run. onPersistent() keeps it alive across clear().
describe('budget salary listener survives bus.clear()', () => {
  it('credits salary even after the bus is cleared', () => {
    bus.clear();                       // simulate a between-run teardown
    budgetSystem.reset();
    const before = budgetSystem.funds;
    bus.emit('career:salary', { amount: 250 });
    expect(budgetSystem.funds).toBe(before + 250);
  });
});
