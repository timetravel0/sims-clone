import { describe, it, expect, beforeEach } from 'vitest';
import { PopulationSystem } from '../src/systems/PopulationSystem.js';
import { FAMILY_RULES, EDUCATION, educationLabel } from '../src/config/familyRules.js';

// Minimal fake game: relationship graph + budget + furniture, no Three.js.
function makeGame({ funds = 20000, beds = 4, romance = 60, health = 'healthy' } = {}) {
  const scores = new Map();
  const key = (a, b, d) => `${a}|${b}|${d}`;
  const graph = {
    adjust: (a, b, d, amt) => scores.set(key(a, b, d), (scores.get(key(a, b, d)) ?? 0) + amt),
    score:  (a, b, d) => scores.get(key(a, b, d)) ?? 0,
    setPopulation() {},
  };
  return {
    sims: [],
    tick: 0,
    relationshipGraph: graph,
    budgetSystem: { funds },
    world: { furniture: Array.from({ length: beds }, (_, i) => ({ id: `bed_${i}` })) },
    _testRomance: romance,
    _testHealth: health,
  };
}

// Build a household of N adults as person records directly.
function seedHousehold(pop, n = 2) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const rec = pop.createPerson({ name: `H${i}`, role: 'household', gender: i % 2 ? '♀ Female' : '♂ Male' });
    ids.push(rec.id);
  }
  return ids;
}

describe('education model', () => {
  it('educationLabel maps levels to readable names', () => {
    expect(educationLabel(EDUCATION.university)).toBe('University');
    expect(educationLabel(EDUCATION.none)).toBe('None');
  });
});

describe('household structure seeding (M9)', () => {
  it('makes the first two members spouses and the third a sibling of the first', () => {
    const pop = new PopulationSystem(makeGame(), []);
    const ids = seedHousehold(pop, 3);
    pop.seedHouseholdStructure();
    const [a, b, c] = ids.map(id => pop.getPerson(id));
    expect(a.partnerId).toBe(b.id);
    expect(b.partnerId).toBe(a.id);
    expect(a.familyId).toBeTruthy();
    expect(c.familyId).toBe(a.familyId); // sibling shares family line
  });

  it('assigns varied education to founding adults', () => {
    const pop = new PopulationSystem(makeGame(), []);
    seedHousehold(pop, 3);
    pop.seedHouseholdStructure();
    const edus = pop.householdMembers().map(p => p.education);
    expect(new Set(edus).size).toBeGreaterThan(1);
  });

  it('does not overwrite an existing partner', () => {
    const pop = new PopulationSystem(makeGame(), []);
    const ids = seedHousehold(pop, 3);
    pop.setPartner(ids[0], ids[2]); // pre-existing pairing
    pop.seedHouseholdStructure();
    expect(pop.getPerson(ids[0]).partnerId).toBe(ids[2]);
  });
});

describe('birth constraints (M9)', () => {
  let pop, a, b;
  beforeEach(() => {
    pop = new PopulationSystem(makeGame(), []);
    const ids = seedHousehold(pop, 2);
    [a, b] = ids;
    pop.seedHouseholdStructure(); // spouses + romance seed (55)
  });

  it('healthy, wealthy, well-housed couple may reproduce', () => {
    expect(pop._birthBlockedReason(a, b)).toBeNull();
  });

  it('blocks when funds below the threshold', () => {
    pop._game.budgetSystem.funds = FAMILY_RULES.birthFundsThreshold - 1;
    expect(pop._birthBlockedReason(a, b)).toBe('not_affordable');
  });

  it('blocks when there is no bed capacity', () => {
    pop._game.world.furniture = []; // no beds
    expect(pop._birthBlockedReason(a, b)).toBe('no_room');
  });

  it('blocks at the per-couple child limit', () => {
    for (let i = 0; i < FAMILY_RULES.maxChildrenPerCouple; i++) {
      pop.createPerson({ name: `kid${i}`, role: 'household', parentIds: [a, b] });
    }
    expect(pop._birthBlockedReason(a, b)).toBe('child_limit');
  });

  it('blocks when a parent is unhealthy', () => {
    pop.getPerson(a).health.state = 'ill';
    expect(pop._birthBlockedReason(a, b)).toBe('poor_health');
  });
});

describe('family tree persistence (M9)', () => {
  it('education and parent/child links survive serialise/restore', () => {
    const pop = new PopulationSystem(makeGame(), []);
    const ids = seedHousehold(pop, 2);
    pop.seedHouseholdStructure();
    const child = pop.createChild(ids[0], ids[1], { name: 'Kid' });
    expect(child).toBeTruthy();

    const snap = pop.serialise();
    const pop2 = new PopulationSystem(makeGame(), []);
    pop2.restore(snap);

    const a2 = pop2.getPerson(ids[0]);
    const c2 = pop2.getPerson(child.id);
    expect(a2.education).toBe(pop.getPerson(ids[0]).education);
    expect(c2.parentIds).toContain(ids[0]);
    expect(a2.childIds).toContain(child.id);
  });
});

describe('rich family model (M9 rich)', () => {
  it('every person gets a fertility profile in range', () => {
    const pop = new PopulationSystem(makeGame(), []);
    const [id] = seedHousehold(pop, 1);
    const f = pop.getPerson(id).fertility;
    expect(f.desire).toBeGreaterThanOrEqual(0);
    expect(f.desire).toBeLessThanOrEqual(1);
    expect(f.fecundity).toBeGreaterThanOrEqual(0);
    expect(f.fecundity).toBeLessThanOrEqual(1);
  });

  it('setPartner and createChild append to the relationship history', () => {
    const pop = new PopulationSystem(makeGame(), []);
    const ids = seedHousehold(pop, 2);
    pop.seedHouseholdStructure(); // partners both
    const a = pop.getPerson(ids[0]);
    expect(a.relationshipHistory.some(e => e.type === 'partnered')).toBe(true);
    pop.createChild(ids[0], ids[1], { name: 'Kid' });
    expect(a.relationshipHistory.some(e => e.type === 'child_born')).toBe(true);
  });

  it('allowAutonomousBirths=false suppresses reproduction', () => {
    const pop = new PopulationSystem(makeGame(), []);
    seedHousehold(pop, 2);
    pop.seedHouseholdStructure();
    const before = pop.householdMembers().length;
    FAMILY_RULES.allowAutonomousBirths = false;
    try {
      for (let i = 0; i < 50; i++) pop._considerBirths();
    } finally {
      FAMILY_RULES.allowAutonomousBirths = true;
    }
    expect(pop.householdMembers().length).toBe(before);
  });

  it('fertility and history survive serialise/restore', () => {
    const pop = new PopulationSystem(makeGame(), []);
    const ids = seedHousehold(pop, 2);
    pop.seedHouseholdStructure();
    const snap = pop.serialise();
    const pop2 = new PopulationSystem(makeGame(), []);
    pop2.restore(snap);
    const a2 = pop2.getPerson(ids[0]);
    expect(a2.fertility).toEqual(pop.getPerson(ids[0]).fertility);
    expect(a2.relationshipHistory.length).toBeGreaterThan(0);
  });
});
