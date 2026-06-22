/**
 * SaveLoad — serialises/deserialises the whole game via Game.serialise().
 *
 * Storage is delegated to a PersistenceAdapter (default LocalStorageAdapter);
 * SaveLoad itself no longer touches localStorage. Swap the adapter to change
 * backend (e.g. SQLite) — see docs/TECHNICAL.md.
 *
 * Save format version: 2. Slots: 0..2 (slot 0 reserved for auto-save).
 * Loading reloads the page (pending flag in sessionStorage) so the Sim roster
 * is rebuilt cleanly from the save — see Game._boot / Game._startFromSave.
 *
 * Emits: save:completed, save:failed, load:failed, save:deleted.
 */
import { bus } from '../core/EventBus.js';
import { LocalStorageAdapter } from '../persistence/LocalStorageAdapter.js';

const SAVE_VERSION = 2;
const SLOTS = 3;

export class SaveLoad {
  /**
   * @param {object} game     Game instance (root reference)
   * @param {PersistenceAdapter} [adapter]  storage backend (default localStorage)
   */
  constructor(game, adapter = new LocalStorageAdapter(SLOTS)) {
    this._game = game;
    this._adapter = adapter;
    this._autoSaveTimer = null;
  }

  get adapter() { return this._adapter; }

  async backendInfo() {
    if (typeof this._adapter.diagnostics === 'function') return this._adapter.diagnostics();
    return {
      backend: this._adapter.constructor?.name ?? 'unknown',
      sqlite: false,
    };
  }

  // ── Save ────────────────────────────────────────────────────────────────

  async save(slot = 0) {
    try {
      const g = this._game;
      const timestamp = Date.now();
      const data = {
        _version:      SAVE_VERSION,
        slot,
        timestamp,
        householdName: g.householdName ?? 'The Household',
        state:         g.serialise(),
      };
      await this._adapter.saveSlot(slot, data);
      bus.emit('save:completed', { slot, timestamp });
      return true;
    } catch (err) {
      console.error('[SaveLoad] save failed', err);
      bus.emit('save:failed', { slot, error: err.message });
      return false;
    }
  }

  // ── Load ────────────────────────────────────────────────────────────────

  /** Parse a slot's save data (with version check). Returns the data or null. */
  async readSlot(slot) {
    const data = await this._adapter.readSlot(slot);
    if (!data) return null;
    if (!data._version || data._version < SAVE_VERSION) return null;
    return data;
  }

  /**
   * Load a slot by reloading the page and rebuilding the game from the saved
   * roster on boot (Game._boot reads the pending-load flag). sessionStorage is
   * used only for the reload handshake (not a data store).
   */
  async load(slot = 0) {
    if (!await this.hasSlot(slot)) {
      bus.emit('load:failed', { slot, error: 'empty slot' });
      return false;
    }
    try { sessionStorage.setItem('simsclone_pending_load', String(slot)); } catch { /* ignore */ }
    location.reload();
    return true;
  }

  // ── Slot metadata ─────────────────────────────────────────────────────────

  /** Returns array of { slot, empty, householdName, timestamp, simCount, day }. */
  async slotList() {
    const slots = await this._adapter.listSlots();
    return slots.map(({ slot, data }) => {
      if (!data) return { slot, empty: true };
      const sims = data.state?.sims;
      return {
        slot,
        empty:         false,
        householdName: data.householdName ?? '?',
        timestamp:     data.timestamp ?? 0,
        simCount:      Array.isArray(sims) ? sims.length : 0,
        day:           (data.state?.clock?.day ?? data.state?.clock?.weekday ?? 0) + 1,
      };
    });
  }

  async deleteSlot(slot) {
    await this._adapter.deleteSlot(slot);
    bus.emit('save:deleted', { slot });
    return true;
  }

  async hasSlot(slot) { return !!await this._adapter.hasSlot(slot); }

  // ── Auto-save ───────────────────────────────────────────────────────────

  /** Auto-save every N real-time minutes to slot 0 (reserved). */
  startAutoSave(intervalMinutes = 5, { immediate = true } = {}) {
    this.stopAutoSave();
    if (immediate) {
      void this.save(0).then(ok => {
        if (ok) console.debug('[SaveLoad] initial auto-save slot 0');
      });
    }
    this._autoSaveTimer = setInterval(() => {
      void this.save(0).then(ok => {
        if (ok) console.debug('[SaveLoad] auto-save slot 0');
      });
    }, intervalMinutes * 60 * 1000);
  }

  stopAutoSave() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }
}
