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
    // Always show slots 0-2; also include any extra slots already saved
    const found = new Set([0, 1, 2]);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(SAVE_PREFIX)) {
        const n = Number(k.slice(SAVE_PREFIX.length));
        if (!isNaN(n)) found.add(n);
      }
    }
    return [...found].sort((a, b) => a - b).map(slot => ({ slot, data: this.readSlot(slot) }));
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

  queryEvents(runId, filters = {}) {
    const rows = this._eventsFor(runId);
    return rows.filter(e => this._matchesEvent(e, filters));
  }

  listRunIds() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(EVENTS_PREFIX)) out.push(k.slice(EVENTS_PREFIX.length));
    }
    return out.sort();
  }

  compareRuns(runIds = []) {
    return runIds.map(runId => {
      const rows = this._eventsFor(runId);
      const visits = rows.filter(e => e.type === 'visitor:visitEnded');
      const social = rows.filter(e => e.type === 'social:interaction');
      const acceptedVisits = visits.filter(e => e.accepted || e.outcome === 'accepted').length;
      const negative = social.filter(e => ['argue', 'insult', 'confront', 'avoid', 'reject_flirt'].includes(e.interactionType)).length;
      return {
        runId,
        events: rows.length,
        socialInteractions: social.length,
        conflictRate: social.length ? +(negative / social.length).toFixed(3) : 0,
        totalVisits: visits.length,
        visitAcceptanceRate: visits.length ? +(acceptedVisits / visits.length).toFixed(3) : 0,
      };
    });
  }

  saveRelationshipSnapshot(runId, tick, rows = []) {
    const k = `${SNAP_PREFIX}${runId}_relationships`;
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { arr = []; }
    arr.push({ tick, rows });
    if (arr.length > 1000) arr = arr.slice(-1000);
    localStorage.setItem(k, JSON.stringify(arr));
    return true;
  }

  queryRelationshipSnapshots(runId, filters = {}) {
    const k = `${SNAP_PREFIX}${runId}_relationships`;
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { arr = []; }
    return arr.filter(s =>
      (filters.tickFrom == null || s.tick >= filters.tickFrom) &&
      (filters.tickTo == null || s.tick <= filters.tickTo)
    );
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

  _eventsFor(runId) {
    try { return JSON.parse(localStorage.getItem(`${EVENTS_PREFIX}${runId}`) || '[]'); }
    catch { return []; }
  }

  _matchesEvent(e, filters) {
    if (filters.type && e.type !== filters.type) return false;
    if (filters.typePrefix && !e.type?.startsWith?.(filters.typePrefix)) return false;
    if (filters.actorId && e.actorId !== filters.actorId) return false;
    if (filters.targetId && e.targetId !== filters.targetId) return false;
    if (filters.tickFrom != null && e.tick < filters.tickFrom) return false;
    if (filters.tickTo != null && e.tick > filters.tickTo) return false;
    return true;
  }
}
