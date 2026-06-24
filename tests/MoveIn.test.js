import { describe, it, expect } from 'vitest';
import { PopulationSystem } from '../src/systems/PopulationSystem.js';
import { RomanceSystem }    from '../src/systems/RomanceSystem.js';
import { FAMILY_RULES }     from '../src/config/familyRules.js';
import { bus } from '../src/core/EventBus.js';

// Regression (2026-06-24 log): 3 move-in proposals fired but none completed, so a
// romantic partner never became family. Fixes: a canonical adoptIntoHousehold()
// join, and a high-romance auto-accept in RomanceSystem.

describe('PopulationSystem.adoptIntoHousehold (canonical join)', () => {
  it('makes a visitor a household member + partner and announces it once', () => {
    const pop = new PopulationSystem({}, []);
    pop.createPerson({ id: 'sim_2', name: 'Chiara' });      // household
    pop.createExternalPerson({ id: 'eli', name: 'Eli' });   // outsider
    expect(pop.isHouseholdMember('eli')).toBe(false);

    let joins = 0, partnerChanged = false;
    const off1 = bus.on('household:memberJoined', e => { if (e.personId === 'eli') joins++; });
    const off2 = bus.on('family:partnerChanged', () => { partnerChanged = true; });

    expect(pop.adoptIntoHousehold('eli', 'sim_2')).toBe(true);
    expect(pop.isHouseholdMember('eli')).toBe(true);
    expect(pop.getPartner('eli')?.id).toBe('sim_2');
    expect(pop.getPartner('sim_2')?.id).toBe('eli');
    expect(joins).toBe(1);
    expect(partnerChanged).toBe(true);

    pop.adoptIntoHousehold('eli', 'sim_2'); // idempotent — no second announcement
    expect(joins).toBe(1);
    off1(); off2();
  });
});

describe('RomanceSystem cross-household move-in', () => {
  // fake graph: romance score lookup by direction
  const graph = (scores) => ({
    score: (a, b) => scores[`${a}>${b}`] ?? 0,
    compatibility: () => 1, adjust() {},
  });
  // fake population: 'hh' is the household member, room controlled by member count
  const population = (members, onAdopt) => ({
    sameHousehold: () => false,
    isHouseholdMember: (id) => id === 'hh',
    householdMembers: () => Array.from({ length: members }, (_, i) => ({ id: 'm' + i })),
    adoptIntoHousehold: (v, h) => onAdopt?.(v, h),
  });

  function capture(eventType, fn) {
    let payload = null;
    const off = bus.on(eventType, e => { payload = e; });
    fn(); off();
    return payload;
  }

  it('auto-accepts when both deeply in love and the house has room', () => {
    let adopted = null;
    const rs = new RomanceSystem([], graph({ 'hh>vis': 80, 'vis>hh': 78 }),
      population(2, (v, h) => { adopted = { v, h }; }));
    const accepted = capture('romance:moveInAccepted', () => rs._maybeCommitPair('hh', 'vis'));
    expect(accepted?.visitorId).toBe('vis');
    expect(adopted).toEqual({ v: 'vis', h: 'hh' });
  });

  it('waits (no move-in, no prompt) at moderate romance', () => {
    let adopted = false;
    const rs = new RomanceSystem([], graph({ 'hh>vis': 60, 'vis>hh': 60 }),
      population(2, () => { adopted = true; }));
    const accepted = capture('romance:moveInAccepted', () => rs._maybeCommitPair('hh', 'vis'));
    expect(adopted).toBe(false);   // not deeply in love yet → they wait
    expect(accepted).toBe(null);   // fully autonomous: no proposal/prompt either
  });

  it('does not move in when the household is full, even deeply in love', () => {
    let adopted = false;
    const rs = new RomanceSystem([], graph({ 'hh>vis': 90, 'vis>hh': 90 }),
      population(FAMILY_RULES.maxHouseholdSize, () => { adopted = true; }));
    const accepted = capture('romance:moveInAccepted', () => rs._maybeCommitPair('hh', 'vis'));
    expect(adopted).toBe(false);   // no room → no autonomous join
    expect(accepted).toBe(null);   // and no prompt
  });
});
