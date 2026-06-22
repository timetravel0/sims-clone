import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { PersistenceAdapter } from './PersistenceAdapter.js';

/**
 * SqlJsAdapter — real SQLite in the browser (sql.js / WASM), persisted to OPFS.
 *
 * The DB lives in memory (sql.js) and is flushed to a single OPFS file as bytes.
 * Slot saves flush immediately; the high-frequency event log flushes throttled
 * (and on the next slot save) so logging stays cheap.
 *
 * ponytail: whole-DB export on flush — fine for snapshot-style saves. A hard
 * crash can lose up to ~2s of event_log rows. Upgrade to an incremental OPFS VFS
 * (official @sqlite.org/sqlite-wasm sahpool) only if that loss window matters.
 */
const DB_FILE = 'sims-clone.sqlite';
const FLUSH_MS = 2000;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS saves (
    slot      INTEGER PRIMARY KEY,
    household TEXT,
    timestamp INTEGER,
    data      TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS event_log (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    ts     INTEGER,
    event  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_event_run ON event_log(run_id);
  CREATE TABLE IF NOT EXISTS snapshots (
    id         TEXT PRIMARY KEY,
    run_id     TEXT,
    tick       INTEGER,
    created_at TEXT,
    state      TEXT NOT NULL
  );
`;

export class SqlJsAdapter extends PersistenceAdapter {
  constructor({ fileName = DB_FILE, slots = 3 } = {}) {
    super();
    this._fileName = fileName;
    this._slots = slots;
    this._db = null;
    this._dir = null;
    this._dirty = false;
    this._flushTimer = null;
  }

  /** True only where OPFS is available (Chrome and other Chromium browsers). */
  static available() {
    return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
  }

  async connect() {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    this._dir = await navigator.storage.getDirectory();
    const bytes = await this._readFile();
    this._db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this._db.run(SCHEMA);
    if (!bytes) await this._flush();   // materialise the file on first run
    return this;
  }

  // ── Slots ───────────────────────────────────────────────────────────────
  async saveSlot(slot, data) {
    this._db.run(
      'INSERT OR REPLACE INTO saves (slot, household, timestamp, data) VALUES (?,?,?,?)',
      [slot, data?.householdName ?? null, data?.timestamp ?? Date.now(), JSON.stringify(data)],
    );
    await this._flush();   // saves are durable immediately
    return true;
  }

  async readSlot(slot) {
    const row = this._one('SELECT data FROM saves WHERE slot=?', [slot]);
    if (!row) return null;
    try { return JSON.parse(row.data); } catch { return null; }
  }

  async hasSlot(slot) {
    return !!this._one('SELECT 1 AS x FROM saves WHERE slot=?', [slot]);
  }

  async deleteSlot(slot) {
    this._db.run('DELETE FROM saves WHERE slot=?', [slot]);
    await this._flush();
    return true;
  }

  /** Fixed slots 0..N-1 with data|null, matching LocalStorageAdapter's shape. */
  async listSlots() {
    const bySlot = new Map(
      this._all('SELECT slot, data FROM saves').map(r => [r.slot, r.data]),
    );
    return Array.from({ length: this._slots }, (_, slot) => {
      const raw = bySlot.get(slot);
      let data = null;
      if (raw) { try { data = JSON.parse(raw); } catch { data = null; } }
      return { slot, data };
    });
  }

  // ── Event log & snapshots (the point of using SQLite: queryable) ──────────
  async appendEvent(runId, event) {
    this._db.run('INSERT INTO event_log (run_id, ts, event) VALUES (?,?,?)',
      [runId, Date.now(), JSON.stringify(event)]);
    this._scheduleFlush();   // throttled — appendEvent is hot
    return true;
  }

  async saveSnapshot(runId, state) {
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this._db.run('INSERT INTO snapshots (id, run_id, tick, created_at, state) VALUES (?,?,?,?,?)',
      [id, runId, state?.tick ?? null, new Date().toISOString(), JSON.stringify(state)]);
    this._scheduleFlush();
    return id;
  }

  async loadSnapshot(runId, snapshotId) {
    const row = this._one('SELECT state FROM snapshots WHERE run_id=? AND id=?', [runId, snapshotId]);
    if (!row) return null;
    try { return JSON.parse(row.state); } catch { return null; }
  }

  // ── Internals ─────────────────────────────────────────────────────────────
  _one(sql, params = []) {
    const st = this._db.prepare(sql);
    try { st.bind(params); return st.step() ? st.getAsObject() : null; }
    finally { st.free(); }
  }

  _all(sql, params = []) {
    const st = this._db.prepare(sql);
    const out = [];
    try { st.bind(params); while (st.step()) out.push(st.getAsObject()); }
    finally { st.free(); }
    return out;
  }

  async _readFile() {
    try {
      const fh = await this._dir.getFileHandle(this._fileName);
      const buf = await (await fh.getFile()).arrayBuffer();
      return buf.byteLength ? new Uint8Array(buf) : null;
    } catch { return null; }   // file does not exist yet
  }

  _scheduleFlush() {
    this._dirty = true;
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      if (this._dirty) this._flush().catch(() => { /* best-effort */ });
    }, FLUSH_MS);
  }

  async _flush() {
    this._dirty = false;
    const data = this._db.export();
    const fh = await this._dir.getFileHandle(this._fileName, { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
  }
}
