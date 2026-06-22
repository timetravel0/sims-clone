import { bus } from '../core/EventBus.js';
import { DEFAULT_EXTERNALS } from '../config/defaultPopulation.js';

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

export class PopulationSystem {
  constructor(game, initialHousehold = []) {
    this._game = game;
    this._people = new Map();   // personId → record
    this._active = new Set();   // personIds currently rendered on the lot

    for (const sim of initialHousehold) this._registerHouseholdSim(sim);
    if (this.offLotPeople().length === 0) this._seedExternals();
  }

  // ── Construction helpers ─────────────────────────────────────────────────

  _person(def) {
    const rec = {
      id: def.id ?? nextPersonId(),
      name: def.name ?? 'Person',
      color: def.color ?? 0xcccccc,
      traits: { ...(def.traits ?? {}) },
      role: def.role ?? 'stranger',
      householdId: def.householdId ?? null,
      homeLotId: def.homeLotId ?? null,
      availability: def.availability ?? { from: 8, to: 22 },
      relationshipSeeds: def.relationshipSeeds ?? null,
      offLotState: def.offLotState ?? 'home',
      offLotStateUntilTick: def.offLotStateUntilTick ?? 0,
      lastOffLotTransitionTick: def.lastOffLotTransitionTick ?? 0,
      lastSeenAt: def.lastSeenAt ?? null,
      createdAt: def.createdAt ?? (this._game?.tick ?? 0),
      activeSimId: def.activeSimId ?? null,
    };
    syncCounterFromPersonId(rec.id);
    this._people.set(rec.id, rec);
    return rec;
  }

  _registerHouseholdSim(sim) {
    const rec = this._person({
      id: sim.id, name: sim.name, color: sim.color,
      traits: sim.personality?.serialise?.() ?? {},
      role: 'household', householdId: 'home', homeLotId: 'home', offLotState: 'home',
    });
    rec.activeSimId = sim.id;
    this._active.add(rec.id);
    return rec;
  }

  _seedExternals() {
    for (const def of DEFAULT_EXTERNALS) this.createExternalPerson(def);
    this.applyRelationshipSeeds();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  createPerson(def)         { const r = this._person({ role: 'household', ...def }); bus.emit('population:created', { person: r }); return r; }
  createExternalPerson(def) { const r = this._person({ role: def.role ?? 'neighbor', ...def }); bus.emit('population:created', { person: r }); return r; }
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
      { id: rec.id, name: rec.name, color: rec.color, traits: rec.traits, visitor: rec.role !== 'household' },
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
