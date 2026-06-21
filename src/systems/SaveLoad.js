/**
 * SaveLoad — Sprint 6 (full rewrite)
 * Serialises/deserialises the entire game state to/from JSON.
 *
 * Save format version: 2
 * Storage: localStorage key "simsclone_save_v2_<slot>"
 * Slots: 0..2  (3 save slots)
 *
 * What is saved:
 *   - metadata  : slot, version, timestamp, household name, screenshot thumbnail
 *   - budget    : BudgetSystem funds
 *   - clock     : GameClock in-game day/hour/speed
 *   - sims      : array of Sim serialised state (needs, skills, career, traits, position)
 *   - world     : TileMap walkability overrides
 *   - walls     : WallManager edges
 *   - furniture : World placed-furniture list
 *   - careers   : CareerSystem per-sim state
 *   - relationships: RelationshipGraph edges
 *   - memories  : MemorySystem per-sim memories
 *   - rooms     : RoomDetector room list (cached, recomputed on load)
 *
 * Emits:
 *   save:completed  { slot, timestamp }
 *   save:failed     { slot, error }
 *   load:completed  { slot }
 *   load:failed     { slot, error }
 *   save:deleted    { slot }
 */
import { bus } from '../core/EventBus.js';

const SAVE_VERSION = 2;
const SLOT_KEY = (slot) => `simsclone_save_v2_${slot}`;
const SLOTS = 3;

export class SaveLoad {
  /** @param {object} game  Game instance (root reference) */
  constructor(game) {
    this._game = game;
  }

  // ── Save ────────────────────────────────────────────────────────────────

  save(slot = 0) {
    try {
      const g = this._game;
      const timestamp = Date.now();
      // Delegate the full game state to Game.serialise() (single source of truth);
      // this wrapper only adds slot metadata. ponytail: don't duplicate the field list.
      const data = {
        _version:      SAVE_VERSION,
        slot,
        timestamp,
        householdName: g.householdName ?? 'The Household',
        state:         g.serialise(),
      };
      const json = JSON.stringify(data);
      localStorage.setItem(SLOT_KEY(slot), json);
      bus.emit('save:completed', { slot, timestamp });
      return true;
    } catch (err) {
      console.error('[SaveLoad] save failed', err);
      bus.emit('save:failed', { slot, error: err.message });
      return false;
    }
  }

  // ── Load ────────────────────────────────────────────────────────────────

  load(slot = 0) {
    try {
      const raw = localStorage.getItem(SLOT_KEY(slot));
      if (!raw) throw new Error('No save data in slot ' + slot);
      const data = JSON.parse(raw);
      if (!data._version || data._version < SAVE_VERSION) {
        throw new Error(`Save version mismatch: expected ${SAVE_VERSION}, got ${data._version}`);
      }
      const g = this._game;
      g.householdName = data.householdName;
      g.restore(data.state);
      // Recompute rooms after walls are restored
      g.roomDetector?.analyse();
      bus.emit('load:completed', { slot });
      return true;
    } catch (err) {
      console.error('[SaveLoad] load failed', err);
      bus.emit('load:failed', { slot, error: err.message });
      return false;
    }
  }

  // ── Slot metadata ─────────────────────────────────────────────────────────

  /** Returns array of { slot, empty, householdName, timestamp, simCount } */
  slotList() {
    return Array.from({ length: SLOTS }, (_, slot) => {
      const raw = localStorage.getItem(SLOT_KEY(slot));
      if (!raw) return { slot, empty: true };
      try {
        const d = JSON.parse(raw);
        const sims = d.state?.sims;
        return {
          slot,
          empty:         false,
          householdName: d.householdName ?? '?',
          timestamp:     d.timestamp ?? 0,
          simCount:      Array.isArray(sims) ? sims.length : 0,
          day:           (d.state?.clock?.weekday ?? 0) + 1,
        };
      } catch { return { slot, empty: true }; }
    });
  }

  deleteSlot(slot) {
    localStorage.removeItem(SLOT_KEY(slot));
    bus.emit('save:deleted', { slot });
  }

  hasSlot(slot) {
    return !!localStorage.getItem(SLOT_KEY(slot));
  }

  // ── Auto-save ───────────────────────────────────────────────────────────

  /** Auto-save every N real-time minutes to slot 0 (reserved). */
  startAutoSave(intervalMinutes = 5) {
    this.stopAutoSave();
    this._autoSaveTimer = setInterval(() => {
      this.save(0);
      console.debug('[SaveLoad] auto-save slot 0');
    }, intervalMinutes * 60 * 1000);
  }

  stopAutoSave() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }
}
