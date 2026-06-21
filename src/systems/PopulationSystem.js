import { bus } from '../core/EventBus.js';

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

const DEFAULT_EXTERNALS = [
  { name: 'Dana', color: 0xba68c8, role: 'neighbor', traits: { outgoing: 0.6, nice: 0.4 } },
  { name: 'Eli',  color: 0x4db6ac, role: 'friend',   traits: { playful: 0.7, nice: 0.5 } },
  { name: 'Mara', color: 0xffb74d, role: 'relative',  traits: { nice: 0.8, neurotic: 0.3 } },
  { name: 'Vic',  color: 0x90a4ae, role: 'coworker', traits: { ambitious: 0.7, outgoing: -0.2 } },
];

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
      id: def.id ?? `p_${++_pid}`,
      name: def.name ?? 'Person',
      color: def.color ?? 0xcccccc,
      traits: { ...(def.traits ?? {}) },
      role: def.role ?? 'stranger',
      householdId: def.householdId ?? null,
      homeLotId: def.homeLotId ?? null,
      availability: def.availability ?? { from: 8, to: 22 },
      relationshipSeeds: def.relationshipSeeds ?? null,
      offLotState: def.offLotState ?? 'home',
      lastSeenAt: def.lastSeenAt ?? null,
      createdAt: def.createdAt ?? (this._game?.tick ?? 0),
      activeSimId: def.activeSimId ?? null,
    };
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
  }

  // ── Public API ───────────────────────────────────────────────────────────

  createPerson(def)         { const r = this._person({ role: 'household', ...def }); bus.emit('population:created', { person: r }); return r; }
  createExternalPerson(def) { const r = this._person({ role: def.role ?? 'neighbor', ...def }); bus.emit('population:created', { person: r }); return r; }

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
    rec.lastSeenAt = this._game?.tick ?? 0;
    this._active.add(personId);
    bus.emit('population:activated', { personId, simId: sim.id });
    return sim;
  }

  /** De-render an active visitor (household members are never deactivated). */
  deactivatePerson(personId) {
    const rec = this._people.get(personId);
    if (!rec || !this._active.has(personId) || rec.role === 'household') return;
    const sim = this._game?.sims?.find(s => s.id === rec.activeSimId);
    if (sim) this._game._despawnSim?.(sim);
    rec.activeSimId = null;
    rec.offLotState = 'home';
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
  }
}
