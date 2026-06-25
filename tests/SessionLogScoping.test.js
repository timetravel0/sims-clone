import { describe, it, expect, beforeEach } from 'vitest';
import { SessionLogger } from '../src/systems/SessionLogger.js';

// The on-disk/log buffer must cover only the current game: a fresh app launch
// (new browser → empty sessionStorage) wipes the persisted log and starts a new
// session; an in-app reload (sessionStorage marker present) resumes the same one.
// (2026-06-25 — previously the buffer was resumed from localStorage unconditionally,
// mixing multiple games into one log file.)

function memStore() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}
const game = { tick: 0, clock: { hour: 8 }, sims: [], budgetSystem: { funds: 100 } };

beforeEach(() => {
  globalThis.localStorage = memStore();
  globalThis.sessionStorage = memStore();
});

describe('session log is scoped to the current game', () => {
  it('fresh launch starts empty; reload resumes; next launch wipes', () => {
    const l1 = new SessionLogger(game);          // fresh launch
    l1._push('story:entry', { text: 'hello' });  // 1 extra event
    expect(l1._events.length).toBe(2);           // session:start + story:entry

    const l2 = new SessionLogger(game);          // reload (marker still set)
    expect(l2._session).toBe(l1._session);       // same session id → same on-disk file
    expect(l2._events.some(e => e.p?.text === 'hello')).toBe(true); // resumed

    globalThis.sessionStorage = memStore();       // browser closed → new `npm run app`
    const l3 = new SessionLogger(game);          // fresh launch again
    expect(l3._session).not.toBe(l1._session);   // brand-new session
    expect(l3._events.length).toBe(1);           // only its own session:start
    expect(l3._events.some(e => e.p?.text === 'hello')).toBe(false); // old game gone
  });
});
