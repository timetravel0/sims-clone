import { bus } from '../core/EventBus.js';

/**
 * MemorySystem (per-Sim, autobiographical) — one instance lives on each
 * SimBrain as `brain.memory` and is persisted via Sim.serialise()/restore().
 * It is the rich, salience-weighted memory a Sim has of its OWN experiences.
 *
 * NOT to be confused with the global cross-Sim store in
 * src/systems/MemorySystem.js (exposed as game.memorySystem), which indexes
 * every Sim's memories centrally for GoalSystem avoidance, UI and experiments.
 * Both listen to the same bus events on purpose: the global one answers
 * "what does X feel about Y" cheaply; this one answers "what do *I* remember".
 *
 * Stores a bounded queue of MemoryEntry objects for each Sim.
 * Memories influence:
 *  - ExperientialBias (recalled outcome colours future decisions)
 *  - GoalSystem (avoidance goals generated from negative memories)
 *  - DialogueSystem (future: conditional dialogue branches)
 *  - EmotionEngine (current: flashback spikes on re-encounter)
 *
 * ── Memory anatomy ──────────────────────────────────────────────────────────
 *  {
 *    id          : string      — unique event id
 *    tick        : number      — game tick when the event occurred
 *    day         : number      — in-game day
 *    type        : MemoryType  — category string (see MEMORY_TYPES)
 *    actors      : string[]    — sim IDs involved (index 0 = subject)
 *    objectId    : string?     — furniture type or item id (if any)
 *    valence     : number      — emotional sign: [-1, +1]
 *    intensity   : number      — strength: [0, 1]
 *    description : string      — human-readable label
 *    recalled    : number      — times retrieved (boosts salience)
 *    salience    : number      — computed: intensity * recency * recallBoost
 *  }
 *
 * ── Capacity & forgetting ───────────────────────────────────────────────────
 *  Max CAPACITY memories per Sim. When full, the entry with lowest salience
 *  is evicted (importance-weighted forgetting, not pure FIFO).
 *
 * ── Salience formula ────────────────────────────────────────────────────────
 *  salience = intensity * recencyFactor(age) * (1 + 0.15 * recalled)
 *  recencyFactor = e^(-age / HALF_LIFE_TICKS)
 *  HALF_LIFE_TICKS = 3600  (~1 in-game day at 60 UPS × speed)
 *
 * ── Cross-Sim bias ──────────────────────────────────────────────────────────
 *  biasWith(idA, idB) returns the net valence of memories idA has about idB,
 *  weighted by salience. Used by GoalSystem for avoidance goals.
 */

export const MEMORY_TYPES = {
  SOCIAL_POSITIVE : 'social_positive',   // compliment, hug, joke
  SOCIAL_NEGATIVE : 'social_negative',   // insult, fight, rejection
  OBJECT_PLEASANT : 'object_pleasant',   // used object, good outcome
  OBJECT_UNPLEASANT: 'object_unpleasant',// used object, bad outcome
  CAREER_SUCCESS  : 'career_success',    // promotion, skill up
  CAREER_FAILURE  : 'career_failure',    // fired, demoted
  LIFE_POSITIVE   : 'life_positive',     // romance formed, goal achieved
  LIFE_NEGATIVE   : 'life_negative',     // romance broken, goal failed
  MOOD_PEAK       : 'mood_peak',         // ecstatic moment
  MOOD_TROUGH     : 'mood_trough',       // miserable moment
};

const CAPACITY        = 40;
const HALF_LIFE_TICKS = 3600;
const RECALL_BOOST    = 0.15;

export class MemorySystem {
  /**
   * @param {string} simId
   * @param {Function} getTick — () => currentTick (injected, no coupling)
   */
  constructor(simId, getTick) {
    this._simId   = simId;
    this._getTick = getTick ?? (() => 0);
    this._memories = [];  // MemoryEntry[]
    this._registerListeners();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Store a new episodic memory.
   * @param {object} entry — partial MemoryEntry; id/tick/salience auto-filled
   */
  record(entry) {
    const tick = this._getTick();
    const mem = {
      id          : `m_${tick}_${Math.random().toString(36).slice(2,7)}`,
      tick,
      day         : entry.day         ?? 0,
      type        : entry.type        ?? MEMORY_TYPES.LIFE_POSITIVE,
      actors      : entry.actors      ?? [],
      objectId    : entry.objectId    ?? null,
      valence     : Math.max(-1, Math.min(1, entry.valence   ?? 0)),
      intensity   : Math.max( 0, Math.min(1, entry.intensity ?? 0.5)),
      description : entry.description ?? '',
      recalled    : 0,
      salience    : 0,
    };
    mem.salience = this._salience(mem, tick);

    if (this._memories.length >= CAPACITY) this._evictLowest();
    this._memories.push(mem);
    bus.emit('memory:recorded', { simId: this._simId, memory: mem });
    return mem;
  }

  /**
   * Retrieve memories, optionally filtered.
   * @param {object} filter — { type?, actorId?, minValence?, minIntensity?, limit? }
   * @returns MemoryEntry[] sorted by salience desc
   */
  query(filter = {}) {
    const tick = this._getTick();
    return this._memories
      .filter(m => {
        if (filter.type       && m.type !== filter.type)               return false;
        if (filter.actorId    && !m.actors.includes(filter.actorId))   return false;
        if (filter.minValence !== undefined && m.valence < filter.minValence) return false;
        if (filter.minIntensity !== undefined && m.intensity < filter.minIntensity) return false;
        return true;
      })
      .map(m => ({ ...m, salience: this._salience(m, tick) }))
      .sort((a, b) => b.salience - a.salience)
      .slice(0, filter.limit ?? CAPACITY);
  }

  /** Most salient N memories (all types). */
  topN(n = 5) {
    return this.query({ limit: n });
  }

  /**
   * Net valence of memories involving another Sim (for GoalSystem / avoidance).
   * Returns a number in [-1, +1].
   */
  biasWith(otherId) {
    const relevant = this.query({ actorId: otherId });
    if (relevant.length === 0) return 0;
    const weightedSum = relevant.reduce((s, m) => s + m.valence * m.salience, 0);
    const totalWeight = relevant.reduce((s, m) => s + m.salience, 0);
    return totalWeight > 0 ? Math.max(-1, Math.min(1, weightedSum / totalWeight)) : 0;
  }

  /** Mark a memory as recalled (boosts salience). */
  recall(memoryId) {
    const m = this._memories.find(m => m.id === memoryId);
    if (m) { m.recalled++; m.salience = this._salience(m, this._getTick()); }
  }

  /** Recompute salience for all memories (call periodically, not every tick). */
  recomputeSalience() {
    const tick = this._getTick();
    for (const m of this._memories) m.salience = this._salience(m, tick);
  }

  get count() { return this._memories.length; }

  serialise()  { return this._memories.map(m => ({ ...m })); }
  restore(arr) { this._memories = (arr ?? []).map(m => ({ ...m })); }

  // ── Private ─────────────────────────────────────────────────────────────────

  _salience(m, tick) {
    const age     = Math.max(0, tick - m.tick);
    const recency = Math.exp(-age / HALF_LIFE_TICKS);
    return m.intensity * recency * (1 + RECALL_BOOST * m.recalled);
  }

  _evictLowest() {
    let minIdx = 0, minSal = Infinity;
    const tick = this._getTick();
    for (let i = 0; i < this._memories.length; i++) {
      const s = this._salience(this._memories[i], tick);
      if (s < minSal) { minSal = s; minIdx = i; }
    }
    this._memories.splice(minIdx, 1);
  }

  _registerListeners() {
    // Auto-record from global bus events — Sim just needs a MemorySystem instance
    const self = this;

    bus.on('social:interaction', ({ idA, idB, delta, type, score }) => {
      if (idA !== self._simId) return;
      const isPositive = (delta ?? 0) >= 0;
      self.record({
        type     : isPositive ? MEMORY_TYPES.SOCIAL_POSITIVE : MEMORY_TYPES.SOCIAL_NEGATIVE,
        actors   : [idB],
        valence  : Math.max(-1, Math.min(1, (delta ?? 0) / 30)),
        intensity: Math.min(1, Math.abs(delta ?? 0) / 30),
        description: `${type ?? 'interaction'} with sim:${idB} (Δ${delta ?? 0})`,
      });
    });

    bus.on('object:used', ({ actorId, furnitureType, moodDelta }) => {
      if (actorId !== self._simId) return;
      const isPositive = (moodDelta ?? 0) >= 0;
      self.record({
        type     : isPositive ? MEMORY_TYPES.OBJECT_PLEASANT : MEMORY_TYPES.OBJECT_UNPLEASANT,
        objectId : furnitureType,
        valence  : Math.max(-1, Math.min(1, (moodDelta ?? 0) / 20)),
        intensity: Math.min(1, Math.abs(moodDelta ?? 0) / 20),
        description: `used ${furnitureType} (moodΔ${moodDelta ?? 0})`,
      });
    });

    bus.on('career:levelUp', ({ simId }) => {
      if (simId !== self._simId) return;
      self.record({
        type: MEMORY_TYPES.CAREER_SUCCESS,
        valence: 0.8, intensity: 0.7,
        description: 'Got a promotion',
      });
    });

    bus.on('goal:completed', ({ simId, goal }) => {
      if (simId !== self._simId) return;
      self.record({
        type: MEMORY_TYPES.LIFE_POSITIVE,
        valence: 0.7, intensity: 0.6,
        description: `Achieved goal: ${goal.label}`,
      });
    });

    bus.on('goal:failed', ({ simId, goal }) => {
      if (simId !== self._simId) return;
      self.record({
        type: MEMORY_TYPES.LIFE_NEGATIVE,
        valence: -0.6, intensity: 0.5,
        description: `Failed goal: ${goal.label}`,
      });
    });

    bus.on('romance:formed', ({ idA }) => {
      if (idA !== self._simId) return;
      self.record({
        type: MEMORY_TYPES.LIFE_POSITIVE,
        valence: 1.0, intensity: 0.9,
        description: 'Formed a romantic bond',
      });
    });

    bus.on('romance:broken', ({ idA }) => {
      if (idA !== self._simId) return;
      self.record({
        type: MEMORY_TYPES.LIFE_NEGATIVE,
        valence: -1.0, intensity: 0.9,
        description: 'Romantic bond broken',
      });
    });
  }
}
