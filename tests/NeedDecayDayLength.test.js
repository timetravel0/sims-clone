import { describe, it, expect } from 'vitest';
import { SimNeeds } from '../src/entities/SimNeeds.js';
import cfg from '../src/config/gameConfig.js';

// Regression (2026-06-25): need decay must be invariant to dayDurationSec. The
// real-time feature made the game-day tunable (default 86400). Decay is applied
// per accumulated dt and a game-day spans dayDurationSec units, so without
// normalisation a 60× longer day drained needs 60× faster per game-day → Daniele
// starved to death within game-minutes despite §2M and constant cooking.
function hungerDropOverOneDay(dayDurationSec) {
  cfg.time = { ...(cfg.time ?? {}), dayDurationSec };
  const n = new SimNeeds({}); // neutral personality
  const start = n.get('hunger');
  // advance exactly one game-day's worth of dt in 1-unit steps
  for (let acc = 0; acc < dayDurationSec; acc++) n.update(1);
  return start - n.get('hunger');
}

describe('need decay is invariant to day length', () => {
  it('drains the same per game-day at 1440 and 86400', () => {
    const short = hungerDropOverOneDay(1440);
    const long  = hungerDropOverOneDay(86400);
    // identical decay budget per game-day (allow tiny float drift)
    expect(Math.abs(short - long)).toBeLessThan(1e-6);
    // and it's a sane amount — not the ~60× runaway that starved sims
    expect(long).toBeGreaterThan(0);
  });
});
