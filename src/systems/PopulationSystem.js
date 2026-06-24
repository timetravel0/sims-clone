import { bus } from '../core/EventBus.js';
import { DEFAULT_EXTERNALS } from '../config/defaultPopulation.js';
import { FAMILY_RULES, EDUCATION, defaultFertility } from '../config/familyRules.js';

/**
 * PopulationSystem — separates the *people* who exist in the world from the
 * *Sims* currently rendered/simulated on the lot.
 *
 *   Population    — every person that exists (household + external).
 *   Household     — people who live in the house (role:'household').
 *   Active Sims   — people instantiated as real Sims on the lot (game.sims).
 *   Visitors      — external people temporarily active on the lot.
 *   Off-lot       — external people that exist but aren't rendered.
 *
 * Activating a person spawns a real Sim (mesh+needs+brain) via game._spawnSim;
 * deactivating de-renders it via game._despawnSim but KEEPS the person record,
 * so identity, relationships (SocialDynamics/RelationshipGraph keyed by id) and
 * memories survive. game.sims stays the authoritative "active" array.
 *
 * Serialisable via serialise()/restore().
 */

let _pid = 0;

function nextPersonId() {
  if (globalThis.crypto?.randomUUID) return `p_${globalThis.crypto.randomUUID()}`;
  return `p_${++_pid}`;
}

function syncCounterFromPersonId(id) {
  const m = /^p_(\d+)$/.exec(String(id ?? ''));
  if (m) _pid = Math.max(_pid, Number(m[1]));
}

function uniqueIds(list = []) {
  return [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];
}

const BABY_NAMES_M = ['Leo', 'Max', 'Noah', 'Theo', 'Eli', 'Sam', 'Kai'];
const BABY_NAMES_F = ['Mia', 'Nora', 'Ivy', 'Zoe', 'Ada', 'Lia', 'Rae'];
function babyName(gender) {
  const pool = String(gender ?? '').toLowerCase().match(/female|♀/) ? BABY_NAMES_F : BABY_NAMES_M;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ponytail: child growth time is decoupled from AgeSystem (whose 86400 s/day
// scale makes aging effectively never fire in a session). Upgrade path: tie to
// AgeSystem once its day-scale is reconciled with DayNightCycle.
const CHILD_GROW_SECONDS = 3000;  // scaled-time before a newborn appears as a teen (~500 ticks)
const BIRTH_CHECK_SECONDS = 60;   // how often reproduction is evaluated
const MAX_HOUSEHOLD = FAMILY_RULES.maxHouseholdSize;
const BIRTH_COOLDOWN_SECONDS = 7200; // ~1200 ticks between births (was 200 — too frequent)

export class PopulationSystem {
  constructor(game, initialHousehold = []) {
    this._game = game;
    this._people = new Map();   // personId → record
    this._active = new Set();   // personIds currently rendered on the lot
    this._birthTimer = 0;
    this._birthCooldown = new Map(); // "aId:bId" → scaled-seconds remaining

    for (const sim of initialHousehold) this._registerHouseholdSim(sim);
    if (this.offLotPeople().length === 0) this._seedExternals();
    this.seedHouseholdStructure();
  }

  /**
   * Seed a structured starting household (M9): the first two adults become
   * spouses, the third becomes a sibling of the first, and everyone gets an
   * education level. Only fills gaps — never overwrites an existing partner,
   * family link or education (so loaded saves and custom households are safe).
   */
  seedHouseholdStructure() {
    const members = this.householdMembers();
    if (members.length < 2) return;
    const [a, b, c] = members;

    // Spouses: a ↔ b (only if both single). Seed graph romance so they qualify
    // for autonomous children once they've spent time together.
    if (a && b && !a.partnerId && !b.partnerId) {
      this.setPartner(a.id, b.id);
      const graph = this._game?.relationshipGraph;
      if (graph?.adjust) {
        graph.adjust(a.id, b.id, 'romance', 55);
        graph.adjust(b.id, a.id, 'romance', 55);
      }
    }

    // Sibling: c shares a's family line (blood relation → no romance, +family bonus).
    if (c && a) {
      const famId = a.familyId ?? `fam_${a.id}`;
      a.familyId = famId;
      if (!c.familyId) {
        c.familyId = famId;
        this.logRelationship(a.id, 'sibling', { withId: c.id, withName: c.name });
        this.logRelationship(c.id, 'sibling', { withId: a.id, withName: a.name });
      }
    }

    // Education: vary across the founding adults (deterministic by index).
    const ladder = [EDUCATION.university, EDUCATION.college, EDUCATION.highschool];
    members.forEach((p, i) => {
      if (p.education == null || p.education === EDUCATION.highschool) {
        p.education = ladder[i % ladder.length];
      }
    });
  }

  // ── Construction helpers ─────────────────────────────────────────────────

  _person(def) {
    const householdId = def.householdId ?? (def.role === 'household' ? 'home' : null);
    const rec = {
      id: def.id ?? nextPersonId(),
      name: def.name ?? 'Person',
      color: def.color ?? 0xcccccc,
      traits: { ...(def.traits ?? {}) },
      gender: def.gender ?? def.sex ?? null,
      health: {
        state: def.health?.state ?? def.healthState ?? 'healthy',
        illness: def.health?.illness ?? def.illness ?? null,
        severity: def.health?.severity ?? def.severity ?? 0,
        startedAtTick: def.health?.startedAtTick ?? def.illnessStartedTick ?? null,
        recoverAtTick: def.health?.recoverAtTick ?? def.recoverAtTick ?? null,
        incidentAtTick: def.health?.incidentAtTick ?? def.incidentAtTick ?? null,
      },
      role: def.role ?? 'stranger',
      householdId,
      homeLotId: def.homeLotId ?? null,
      availability: def.availability ?? { from: 8, to: 22 },
      relationshipSeeds: def.relationshipSeeds ?? null,
      offLotState: def.offLotState ?? 'home',
      offLotReason: def.offLotReason ?? null,
      offLotDestination: def.offLotDestination ?? null,
      offLotStateUntilTick: def.offLotStateUntilTick ?? 0,
      lastOffLotTransitionTick: def.lastOffLotTransitionTick ?? 0,
      lastSeenAt: def.lastSeenAt ?? null,
      partnerId: def.partnerId ?? null,
      parentIds: uniqueIds(def.parentIds),
      childIds: uniqueIds(def.childIds),
      familyId: def.familyId ?? null,
      monogamous: def.monogamous ?? true,
      education: def.education ?? EDUCATION.highschool,
      fertility: def.fertility ?? defaultFertility(),
      careerHistory: Array.isArray(def.careerHistory) ? [...def.careerHistory] : [],
      relationshipHistory: Array.isArray(def.relationshipHistory) ? [...def.relationshipHistory] : [],
      createdAt: def.createdAt ?? (this._game?.tick ?? 0),
      activeSimId: def.activeSimId ?? null,
      // Unborn children exist as data only (embodied:false) and grow until they
      // appear on the lot as a teen. Everyone else is embodied from the start.
      embodied: def.embodied ?? true,
      ageSeconds: def.ageSeconds ?? 0,
    };
    syncCounterFromPersonId(rec.id);
    this._people.set(rec.id, rec);
    return rec;
  }

  _registerHouseholdSim(sim) {
    return this.adoptHouseholdSim(sim, {
      id: sim.id,
      name: sim.name,
      color: sim.color,
      traits: sim.personality?.serialise?.() ?? {},
      gender: sim.gender ?? null,
    });
  }

  _seedExternals() {
    for (const def of DEFAULT_EXTERNALS) this.createExternalPerson(def);
    this.applyRelationshipSeeds();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  createPerson(def)         { const r = this._person({ role: 'household', ...def }); bus.emit('population:created', { person: r }); return r; }
  createExternalPerson(def) { const r = this._person({ role: def.role ?? 'neighbor', ...def }); bus.emit('population:created', { person: r }); return r; }

  adoptHouseholdSim(sim, def = {}) {
    const rec = this._people.get(sim.id) ?? this._person({
      id: sim.id,
      name: sim.name,
      color: sim.color,
      traits: sim.personality?.serialise?.() ?? {},
      gender: sim.gender ?? def.gender ?? null,
      role: 'household',
      householdId: def.householdId ?? 'home',
      homeLotId: def.homeLotId ?? 'home',
      offLotState: def.offLotState ?? 'home',
      partnerId: def.partnerId ?? null,
      parentIds: def.parentIds ?? [],
      childIds: def.childIds ?? [],
      familyId: def.familyId ?? null,
    });
    rec.name = def.name ?? sim.name ?? rec.name;
    rec.color = def.color ?? sim.color ?? rec.color;
    rec.traits = { ...(def.traits ?? sim.personality?.serialise?.() ?? rec.traits) };
    rec.gender = def.gender ?? sim.gender ?? rec.gender ?? null;
    rec.role = 'household';
    rec.householdId = def.householdId ?? rec.householdId ?? 'home';
    rec.homeLotId = def.homeLotId ?? rec.homeLotId ?? 'home';
    rec.familyId = def.familyId ?? rec.familyId ?? null;
    rec.activeSimId = sim.id;
    this._active.add(rec.id);
    bus.emit('population:created', { person: rec });
    return rec;
  }

  createChild(parentAId, parentBId, def = {}) {
    const parentA = this.getPerson(parentAId);
    const parentB = this.getPerson(parentBId);
    if (!this.canHaveChild(parentAId, parentBId)) return null;
    const householdId = parentA?.householdId ?? parentB?.householdId ?? 'home';
    const gender = def.gender ?? (Math.random() < 0.5 ? '♂ Male' : '♀ Female');
    const child = this._person({
      ...def,
      name: def.name ?? babyName(gender),
      role: 'household',
      householdId,
      homeLotId: householdId,
      familyId: def.familyId ?? parentA?.familyId ?? parentB?.familyId ?? null,
      parentIds: [parentAId, parentBId],
      childIds: [],
      partnerId: null,
      monogamous: true,
      offLotState: 'home',
      gender,
    });

    if (parentA) parentA.childIds = uniqueIds([...(parentA.childIds ?? []), child.id]);
    if (parentB) parentB.childIds = uniqueIds([...(parentB.childIds ?? []), child.id]);
    this.logRelationship(parentAId, 'child_born', { childId: child.id, childName: child.name });
    this.logRelationship(parentBId, 'child_born', { childId: child.id, childName: child.name });

    // Born as data only — no Sim is spawned. The child grows in the background
    // (PopulationSystem.update) and is embodied on the lot once it reaches teen.
    child.embodied = false;
    child.ageSeconds = 0;
    child.color = def.color ?? parentA?.color ?? parentB?.color ?? child.color;
    child.traits = { ...(def.traits ?? child.traits ?? {}) };

    bus.emit('family:childBorn', {
      childId: child.id,
      childName: child.name,
      parentAId,
      parentBId,
      householdId,
      gender: child.gender,
    });
    bus.emit('story:entry', {
      text: `${child.name} was born to ${parentA?.name ?? parentAId} and ${parentB?.name ?? parentBId}.`,
      cat: 'family',
      category: 'family',
    });
    return child;
  }

  // ── Family lifecycle tick ─────────────────────────────────────────────────

  /** Grows unborn children and lets committed couples conceive autonomously. */
  update(dt) {
    if (!(dt > 0)) return;
    this._growChildren(dt);
    for (const [k, left] of this._birthCooldown) {
      const next = left - dt;
      if (next <= 0) this._birthCooldown.delete(k); else this._birthCooldown.set(k, next);
    }
    this._birthTimer += dt;
    if (this._birthTimer < BIRTH_CHECK_SECONDS) return;
    this._birthTimer = 0;
    this._considerBirths();
  }

  _growChildren(dt) {
    for (const person of this.allPeople()) {
      if (person.embodied !== false) continue;
      person.ageSeconds = (person.ageSeconds ?? 0) + dt;
      if (person.ageSeconds >= CHILD_GROW_SECONDS) this._embodyChild(person);
    }
  }

  _embodyChild(person) {
    person.embodied = true;
    const parentSim = this._game?.sims?.find(s => person.parentIds?.includes(s.id) && !s._atWork && !s._outing);
    // ponytail: use randomAvailableCell — parent+1 often lands in furniture
    const spawnCell = this._game?.world?.randomAvailableCell?.({}) ?? null;
    const gx = spawnCell?.x ?? null;
    const gz = spawnCell?.z ?? null;
    const sim = this._game?._spawnSim?.({
      id: person.id, name: person.name, color: person.color, traits: person.traits, gender: person.gender,
    }, gx, gz);
    if (!sim) return;
    this.adoptHouseholdSim(sim, {
      id: person.id, name: person.name, color: person.color, traits: person.traits, gender: person.gender,
      householdId: person.householdId, homeLotId: person.homeLotId, familyId: person.familyId,
      parentIds: person.parentIds,
    });
    this._game?.ageSystem?.registerAt?.(sim, 13); // appears as a teen, ages onward
    bus.emit('story:entry', {
      simId: person.id,
      text: `${person.name} grew up and joined the household as a teen.`,
      cat: 'family', category: 'family',
    });
  }

  _considerBirths() {
    if (!FAMILY_RULES.allowAutonomousBirths) return;
    if (this.householdMembers().length >= MAX_HOUSEHOLD) return;
    for (const [aId, bId] of this._committedHouseholdCouples()) {
      const key = [aId, bId].sort().join(':');
      if (this._birthCooldown.has(key)) continue;
      if (!this.canHaveChild(aId, bId)) continue;
      if (this._birthBlockedReason(aId, bId)) continue;
      // Birth probability is driven by the couple's fertility profile (desire),
      // and conception by their fecundity — both 0..1, defaulting to ~0.18 base.
      const a = this.getPerson(aId), b = this.getPerson(bId);
      const desire = ((a?.fertility?.desire ?? 0.5) + (b?.fertility?.desire ?? 0.5)) / 2;
      const fecundity = ((a?.fertility?.fecundity ?? 0.7) + (b?.fertility?.fecundity ?? 0.7)) / 2;
      if (Math.random() < 0.28 * desire && Math.random() < fecundity) {
        this.createChild(aId, bId);
        this._birthCooldown.set(key, BIRTH_COOLDOWN_SECONDS);
        if (this.householdMembers().length >= MAX_HOUSEHOLD) return;
      }
    }
  }

  /** Append a dated entry to a person's relationship-history log (M9 rich). */
  logRelationship(personId, type, detail = {}) {
    const person = this.getPerson(personId);
    if (!person) return;
    person.relationshipHistory.push({ type, day: this._game?.clock?.day ?? 0, ...detail });
  }

  /**
   * Explicit household constraints on autonomous births (M9). Returns a reason
   * string when a birth is blocked, or null when the couple may reproduce.
   */
  _birthBlockedReason(aId, bId) {
    const r = FAMILY_RULES;
    if (this.householdMembers().length >= r.maxHouseholdSize) return 'household_full';
    if (this._childrenOf(aId, bId).length >= r.maxChildrenPerCouple) return 'child_limit';
    if (this._dependentChildren().length >= r.maxDependentChildren) return 'too_many_dependents';
    if ((this._game?.budgetSystem?.funds ?? 0) < r.birthFundsThreshold) return 'not_affordable';
    const graph = this._game?.relationshipGraph;
    if (graph?.score) {
      const romance = Math.max(graph.score(aId, bId, 'romance'), graph.score(bId, aId, 'romance'));
      if (romance < r.minRomanceForChild) return 'unstable_relationship';
    }
    if (!this._bothHealthy(aId, bId)) return 'poor_health';
    if (!this._hasBedCapacity()) return 'no_room';
    return null;
  }

  /** Children whose parents are exactly this couple. */
  _childrenOf(aId, bId) {
    return this.allPeople().filter(p =>
      p.parentIds?.includes(aId) && p.parentIds?.includes(bId));
  }

  /** Household child records (born to household parents, any age). */
  _dependentChildren() {
    return this.householdMembers().filter(p => (p.parentIds?.length ?? 0) > 0);
  }

  _bothHealthy(aId, bId) {
    const ok = id => (this.getPerson(id)?.health?.state ?? 'healthy') === 'healthy';
    return ok(aId) && ok(bId);
  }

  /** A new child needs sleeping capacity: 2 sims per bed. */
  _hasBedCapacity() {
    const beds = (this._game?.world?.furniture ?? []).filter(f => /bed/.test(f.id)).length;
    return beds * 2 > this.householdMembers().length;
  }

  _committedHouseholdCouples() {
    const seen = new Set();
    const out = [];
    for (const p of this.householdMembers()) {
      const q = p.partnerId;
      if (!q) continue;
      const key = [p.id, q].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([p.id, q]);
    }
    return out;
  }

  setPartner(personId, partnerId) {
    const a = this.getPerson(personId);
    const b = this.getPerson(partnerId);
    if (!a || !b || a.id === b.id) return false;
    if (a.partnerId === b.id && b.partnerId === a.id) return true;
    const oldA = a.partnerId ?? null;
    const oldB = b.partnerId ?? null;
    if (oldA && this.getPerson(oldA)?.partnerId === a.id) this.getPerson(oldA).partnerId = null;
    if (oldB && this.getPerson(oldB)?.partnerId === b.id) this.getPerson(oldB).partnerId = null;
    a.partnerId = b.id;
    b.partnerId = a.id;
    a.monogamous = b.monogamous = true;
    this.logRelationship(a.id, 'partnered', { withId: b.id, withName: b.name });
    this.logRelationship(b.id, 'partnered', { withId: a.id, withName: a.name });
    bus.emit('family:partnerChanged', {
      personId: a.id,
      partnerId: b.id,
      oldPartnerIdA: oldA,
      oldPartnerIdB: oldB,
    });
    return true;
  }

  clearPartner(personId) {
    const person = this.getPerson(personId);
    if (!person) return false;
    const partner = this.getPerson(person.partnerId);
    const oldPartnerId = person.partnerId ?? null;
    person.partnerId = null;
    if (partner?.partnerId === person.id) partner.partnerId = null;
    bus.emit('family:partnerChanged', { personId: person.id, partnerId: null, oldPartnerId });
    return true;
  }

  getPartner(personId) {
    return this.getPerson(this.getPerson(personId)?.partnerId ?? null);
  }

  sameHousehold(aId, bId) {
    const a = this.getPerson(aId);
    const b = this.getPerson(bId);
    return !!a && !!b && !!a.householdId && a.householdId === b.householdId;
  }

  isFamily(aId, bId) {
    const a = this.getPerson(aId);
    const b = this.getPerson(bId);
    if (!a || !b || a.id === b.id) return false;
    if (a.parentIds.includes(b.id) || b.parentIds.includes(a.id)) return true;
    if (a.parentIds.some(id => b.parentIds.includes(id))) return true;
    return a.familyId != null && a.familyId === b.familyId;
  }

  canHaveChild(parentAId, parentBId) {
    const a = this.getPerson(parentAId);
    const b = this.getPerson(parentBId);
    if (!a || !b || a.id === b.id) return false;
    if (!this.sameHousehold(a.id, b.id)) return false;
    if (!a.partnerId || a.partnerId !== b.id || b.partnerId !== a.id) return false;
    if (!this._romanceStrongEnough(a.id, b.id)) return false;
    if (this.isFamily(a.id, b.id)) return false;
    if (!this._compatibleAgesForChild(a.id, b.id)) return false;
    if (!this._compatibleSexForChild(a, b)) return false;
    return true;
  }

  _compatibleSexForChild(a, b) {
    const sa = this._sexOf(a);
    const sb = this._sexOf(b);
    if (!sa || !sb) return true;
    return sa !== sb;
  }

  _sexOf(person) {
    const gender = String(person?.gender ?? '').toLowerCase();
    if (gender.includes('female') || gender.includes('♀')) return 'female';
    if (gender.includes('male') || gender.includes('♂')) return 'male';
    return null;
  }

  _compatibleAgesForChild(aId, bId) {
    const age = this._game?.ageSystem;
    if (!age?.getInfo) return true;
    const a = age.getInfo(aId);
    const b = age.getInfo(bId);
    // Normalise to letters-only so the stage id 'youngAdult' matches regardless
    // of label spacing ('Young Adult'). Without this, young adults — the default
    // starting stage for every Sim — never qualified and births were impossible.
    const allowed = info => ['youngadult', 'adult'].includes(
      String(info?.stage?.id ?? info?.stage?.label ?? '').toLowerCase().replace(/[^a-z]/g, '')
    );
    return !!a && !!b && allowed(a) && allowed(b);
  }

  _romanceStrongEnough(aId, bId) {
    const graph = this._game?.relationshipGraph;
    if (!graph?.score) return true;
    return Math.max(graph.score(aId, bId, 'romance'), graph.score(bId, aId, 'romance')) >= 35;
  }

  setOuting(personId, { state = 'outing', reason = 'outing', destination = null, untilTick = null } = {}) {
    const person = this.getPerson(personId);
    if (!person) return null;
    const prev = person.offLotState ?? 'home';
    person.offLotState = state;
    person.offLotReason = reason;
    person.offLotDestination = destination;
    person.offLotStateUntilTick = untilTick ?? person.offLotStateUntilTick ?? 0;
    person.lastOffLotTransitionTick = this._game?.tick ?? 0;
    person.lastSeenAt = this._game?.tick ?? 0;
    bus.emit('offlot:stateChanged', {
      personId: person.id,
      personName: person.name,
      previous: prev,
      state,
      reason,
      destination,
    });
    return person;
  }

  setHealthState(personId, nextState, meta = {}) {
    const person = this.getPerson(personId);
    if (!person) return null;
    const prev = person.health?.state ?? 'healthy';
    person.health = {
      ...(person.health ?? {}),
      state: nextState,
      illness: meta.illness ?? person.health?.illness ?? null,
      severity: meta.severity ?? person.health?.severity ?? 0,
      startedAtTick: meta.startedAtTick ?? person.health?.startedAtTick ?? null,
      recoverAtTick: meta.recoverAtTick ?? person.health?.recoverAtTick ?? null,
      incidentAtTick: meta.incidentAtTick ?? person.health?.incidentAtTick ?? null,
    };
    if (prev !== nextState) {
      const eventType = nextState === 'healthy' ? 'health:recover' : 'health:ill';
      bus.emit(eventType, {
        personId: person.id,
        personName: person.name,
        previous: prev,
        state: nextState,
        illness: person.health.illness,
        severity: person.health.severity,
        ...meta,
      });
      bus.emit('health:stateChanged', {
        personId: person.id,
        personName: person.name,
        previous: prev,
        state: nextState,
        illness: person.health.illness,
        severity: person.health.severity,
        ...meta,
      });
    }
    return person.health;
  }
  applyRelationshipSeeds() {
    const dyn = this._game?.socialDynamics;
    if (!dyn?._apply) return;
    const household = this.householdMembers();
    for (const person of this.allPeople()) {
      for (const seed of person.relationshipSeeds ?? []) {
        const target = seed.personId
          ? this.getPerson(seed.personId)
          : household[seed.householdIndex ?? 0];
        if (!target?.id || target.id === person.id) continue;
        if (seed.ab && this._seedableRelation(dyn, person.id, target.id)) dyn._apply(person.id, target.id, seed.ab);
        if (seed.ba && this._seedableRelation(dyn, target.id, person.id)) dyn._apply(target.id, person.id, seed.ba);
      }
    }
  }

  _seedableRelation(dyn, from, to) {
    const dims = dyn.snapshot?.(from, to) ?? {};
    return Object.values(dims).reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0) < 1;
  }

  allPeople()        { return [...this._people.values()]; }
  householdMembers() { return this.allPeople().filter(p => p.role === 'household'); }
  offLotPeople()     { return this.allPeople().filter(p => p.role !== 'household' && !this._active.has(p.id)); }
  activeVisitors()   { return this.allPeople().filter(p => p.role !== 'household' && this._active.has(p.id)); }
  getPerson(id)      { return this._people.get(id) ?? null; }
  isHouseholdMember(id) { return this._people.get(id)?.role === 'household'; }
  isVisitor(id)      { return this._active.has(id) && this._people.get(id)?.role !== 'household'; }

  /** Instantiate an off-lot person as a real Sim on the lot. */
  activatePerson(personId, spawnPoint = null) {
    const rec = this._people.get(personId);
    if (!rec || this._active.has(personId)) return null;
    const sim = this._game._spawnSim?.(
      { id: rec.id, name: rec.name, color: rec.color, traits: rec.traits, gender: rec.gender, visitor: rec.role !== 'household' },
      spawnPoint?.gx, spawnPoint?.gz,
    );
    if (!sim) return null;
    rec.activeSimId = sim.id;
    rec.offLotState = 'visiting';
    rec.lastOffLotTransitionTick = this._game?.tick ?? 0;
    rec.offLotStateUntilTick = (this._game?.tick ?? 0) + 90;
    rec.lastSeenAt = this._game?.tick ?? 0;
    this._active.add(personId);
    bus.emit('population:activated', { personId, simId: sim.id });
    return sim;
  }

  /** De-render an active visitor (household members are never deactivated). */
  deactivatePerson(personId) {
    const rec = this._people.get(personId);
    if (!rec || !this._active.has(personId) || rec.role === 'household') return;
    const sim = this._game?.sims?.find(s => s.id === rec.activeSimId || s.id === rec.id);
    if (sim) this._game._despawnSim?.(sim);
    rec.activeSimId = null;
    rec.offLotState = 'home';
    rec.lastOffLotTransitionTick = this._game?.tick ?? 0;
    rec.offLotStateUntilTick = (this._game?.tick ?? 0) + 90;
    rec.lastSeenAt = this._game?.tick ?? 0;
    this._active.delete(personId);
    bus.emit('population:deactivated', { personId });
  }

  // ── Serialisation ───────────────────────────────────────────────────────

  serialise() {
    return {
      people: this.allPeople().map(p => ({ ...p, traits: { ...p.traits } })),
      // Only household activity is reconstructed automatically; active visitors
      // are reconciled to off-lot on load (see Game.restore / VisitorSystem).
      active: [...this._active].filter(id => this._people.get(id)?.role === 'household'),
    };
  }

  restore(data = {}) {
    this._people.clear();
    this._active.clear();
    for (const p of data.people ?? []) this._person(p);
    this._backfillDefaultSeeds();
    // Re-activate household members that are present in the live roster.
    for (const sim of this._game?.sims ?? []) {
      const rec = this._people.get(sim.id);
      if (rec && rec.role === 'household') { rec.activeSimId = sim.id; this._active.add(sim.id); }
    }
    // Any person flagged active-but-not-in-roster is treated as off-lot.
    for (const p of this.allPeople()) {
      if (this._active.has(p.id)) continue;
      if (p.role !== 'household') { p.activeSimId = null; if (p.offLotState === 'visiting') p.offLotState = 'home'; }
    }
    this.applyRelationshipSeeds();
  }

  _backfillDefaultSeeds() {
    const defaults = new Map(DEFAULT_EXTERNALS.map(d => [d.name, d]));
    for (const person of this.allPeople()) {
      if (person.relationshipSeeds || !defaults.has(person.name)) continue;
      person.relationshipSeeds = defaults.get(person.name).relationshipSeeds ?? null;
    }
  }
}
