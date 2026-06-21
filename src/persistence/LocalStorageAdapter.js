import { PersistenceAdapter } from './PersistenceAdapter.js';

/**
 * LocalStorageAdapter — default browser backend. The ONLY place that touches
 * window.localStorage. Replicates the previous SaveLoad behaviour exactly:
 * save blobs live under "simsclone_save_v2_<slot>".
 *
 * Methods are synchronous (localStorage is sync) but return plain values, so
 * they are also `await`-compatible for code written against the async contract.
 */
const SAVE_PREFIX   = 'simsclone_save_v2_';
const EVENTS_PREFIX = 'simsclone_events_';
const SNAP_PREFIX   = 'simsclone_snapshot_';
const MAX_EVENTS    = 50000;

export class LocalStorageAdapter extends PersistenceAdapter {
  constructor(slots = 3) {
    super();
    this._slots = slots;
  }

  _key(slot) { return `${SAVE_PREFIX}${slot}`; }

  saveSlot(slot, data) {
    localStorage.setItem(this._key(slot), JSON.stringify(data));
    return true;
  }

  readSlot(slot) {
    const raw = localStorage.getItem(this._key(slot));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  hasSlot(slot) { return localStorage.getItem(this._key(slot)) != null; }

  deleteSlot(slot) { localStorage.removeItem(this._key(slot)); return true; }

  listSlots() {
    return Array.from({ length: this._slots }, (_, slot) => ({ slot, data: this.readSlot(slot) }));
  }

  // ── Event log & snapshots (for experiments / future SQLite parity) ──────────

  appendEvent(runId, event) {
    const k = `${EVENTS_PREFIX}${runId}`;
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { arr = []; }
    arr.push(event);
    if (arr.length > MAX_EVENTS) arr = arr.slice(-MAX_EVENTS);
    localStorage.setItem(k, JSON.stringify(arr));
    return true;
  }

  saveSnapshot(runId, state) {
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const rec = { id, runId, tick: state?.tick ?? null, createdAt: new Date().toISOString(), state };
    localStorage.setItem(`${SNAP_PREFIX}${runId}_${id}`, JSON.stringify(rec));
    return id;
  }

  loadSnapshot(runId, snapshotId) {
    const raw = localStorage.getItem(`${SNAP_PREFIX}${runId}_${snapshotId}`);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
}
