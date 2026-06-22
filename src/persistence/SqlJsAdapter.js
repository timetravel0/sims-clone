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
 * Important: OPFS is not a normal visible file in the project folder. Chrome
 * stores it inside the browser profile's Origin Private File System. Use
 * diagnostics()/exportBytes() when you need proof or export. When available,
 * File System Access API can switch the same in-memory DB to a user-selected
 * visible .sqlite file.
 */
const DB_FILE = 'sims-clone.sqlite';
// Throttled flush window. Each flush serializes the WHOLE DB and rewrites the
// OPFS/file. Slot saves still flush immediately (durability); only the hot,
// best-effort event/snapshot log uses this window, so a longer one slashes
// flush overhead. A crash loses at most this much analytics, never a slot save.
const FLUSH_MS = 30000;
// Bound the event log so the file (and every flush) cannot grow without limit.
// Matches the in-memory dashboard buffer cap; SQLite reuses freed pages, so the
// file plateaus instead of growing forever.
const EVENT_LOG_CAP = 20000;
const REL_SNAPSHOT_CAP = 20000;
const PRUNE_EVERY = 2000;   // run retention every N appended events
const HANDLE_DB = 'sims-clone-file-handles';
const HANDLE_STORE = 'handles';
const SQLITE_HANDLE_KEY = 'sqlite-file';

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
    tick   INTEGER,
    sim_day INTEGER,
    sim_hour REAL,
    event_type TEXT,
    actor_id TEXT,
    target_id TEXT,
    interaction_type TEXT,
    accepted INTEGER,
    relationship_before REAL,
    relationship_after REAL,
    event  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_event_run ON event_log(run_id);
  CREATE INDEX IF NOT EXISTS idx_event_run_tick ON event_log(run_id, tick);
  CREATE INDEX IF NOT EXISTS idx_event_type ON event_log(event_type);
  CREATE INDEX IF NOT EXISTS idx_event_actor_target ON event_log(actor_id, target_id);
  CREATE TABLE IF NOT EXISTS relationship_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    tick INTEGER,
    from_id TEXT,
    to_id TEXT,
    affinity REAL,
    dims TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rel_snap_run_tick ON relationship_snapshots(run_id, tick);
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
    this.backend = 'sql.js-opfs';
    this.sqlite = true;
    this._fileName = fileName;
    this._slots = slots;
    this._db = null;
    this._dir = null;
    this._fileHandle = null;
    this._serverUrl = null;
    this._serverFilePath = null;
    this._dirty = false;
    this._flushTimer = null;
    this._lastFlushAt = null;
    this._eventsSincePrune = 0;
  }

  /** True when SQLite can persist to OPFS or to a user-selected filesystem file. */
  static available() {
    return this.opfsAvailable() || this.fileAccessAvailable();
  }

  static opfsAvailable() {
    return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
  }

  static fileAccessAvailable() {
    return typeof window !== 'undefined' &&
      typeof window.showSaveFilePicker === 'function' &&
      typeof window.showOpenFilePicker === 'function';
  }

  async connect() {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    const localServer = await this._tryConnectLocalServer(SQL);
    if (localServer) return this;
    const restored = await this._tryConnectRememberedFile(SQL);
    if (restored) return this;
    if (SqlJsAdapter.opfsAvailable()) {
      this._dir = await navigator.storage.getDirectory();
      const bytes = await this._readFile();
      this._db = bytes ? new SQL.Database(bytes) : new SQL.Database();
      this.backend = 'sql.js-opfs';
    } else {
      this._db = new SQL.Database();
      this.backend = 'sql.js-memory';
    }
    this._initSchema();
    if (this._dir) await this._flush();   // materialise/migrate OPFS when available
    return this;
  }

  canUseFilesystemFile() {
    return SqlJsAdapter.fileAccessAvailable();
  }

  async chooseFilesystemFile() {
    if (!SqlJsAdapter.fileAccessAvailable()) throw new Error('File System Access API unavailable');
    const [handle] = await window.showOpenFilePicker({
      id: 'sims-clone-sqlite-open',
      multiple: false,
      types: [{ description: 'SQLite database', accept: { 'application/x-sqlite3': ['.sqlite', '.db'] } }],
    });
    await this._connectFileHandle(handle);
    await this._persistFileHandle(handle);
    await this._flush();
    return this.diagnostics();
  }

  async saveAsFilesystemFile() {
    if (!SqlJsAdapter.fileAccessAvailable()) throw new Error('File System Access API unavailable');
    const handle = await window.showSaveFilePicker({
      id: 'sims-clone-sqlite-save',
      suggestedName: this._fileName,
      types: [{ description: 'SQLite database', accept: { 'application/x-sqlite3': ['.sqlite', '.db'] } }],
    });
    this._fileHandle = handle;
    this.backend = 'sql.js-file';
    this._dir = null;
    await this._persistFileHandle(handle);
    await this._flush();
    return this.diagnostics();
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
    this._db.run(`INSERT INTO event_log
      (run_id, ts, tick, sim_day, sim_hour, event_type, actor_id, target_id, interaction_type, accepted, relationship_before, relationship_after, event)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        runId,
        Date.now(),
        event.tick ?? null,
        event.simDay ?? null,
        event.simHour ?? null,
        event.type ?? null,
        event.actorId ?? event.visitorId ?? event.personId ?? null,
        event.targetId ?? event.hostId ?? null,
        event.interactionType ?? null,
        event.accepted == null ? null : (event.accepted ? 1 : 0),
        event.relationshipBefore === '' ? null : event.relationshipBefore ?? null,
        event.relationshipAfter === '' ? null : event.relationshipAfter ?? null,
        JSON.stringify(event),
      ]);
    if (++this._eventsSincePrune >= PRUNE_EVERY) {
      this._eventsSincePrune = 0;
      this._enforceRetention(false);
    }
    this._scheduleFlush();   // throttled — appendEvent is hot
    return true;
  }

  async queryEvents(runId, filters = {}) {
    const where = ['run_id=?'];
    const params = [runId];
    if (filters.type) { where.push('event_type=?'); params.push(filters.type); }
    if (filters.typePrefix) { where.push('event_type LIKE ?'); params.push(`${filters.typePrefix}%`); }
    if (filters.actorId) { where.push('actor_id=?'); params.push(filters.actorId); }
    if (filters.targetId) { where.push('target_id=?'); params.push(filters.targetId); }
    if (filters.tickFrom != null) { where.push('tick>=?'); params.push(filters.tickFrom); }
    if (filters.tickTo != null) { where.push('tick<=?'); params.push(filters.tickTo); }
    const limit = Math.max(1, Math.min(50000, filters.limit ?? 5000));
    return this._all(`SELECT event FROM event_log WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${limit}`, params)
      .map(r => { try { return JSON.parse(r.event); } catch { return null; } })
      .filter(Boolean);
  }

  async listRunIds() {
    return this._all('SELECT DISTINCT run_id FROM event_log WHERE run_id IS NOT NULL ORDER BY run_id')
      .map(r => r.run_id);
  }

  async compareRuns(runIds = []) {
    return runIds.map(runId => {
      const total = this._one('SELECT COUNT(*) AS n FROM event_log WHERE run_id=?', [runId])?.n ?? 0;
      const social = this._one("SELECT COUNT(*) AS n FROM event_log WHERE run_id=? AND event_type='social:interaction'", [runId])?.n ?? 0;
      const negative = this._one(`SELECT COUNT(*) AS n FROM event_log
        WHERE run_id=? AND interaction_type IN ('argue','insult','confront','avoid','reject_flirt')`, [runId])?.n ?? 0;
      const visits = this._one("SELECT COUNT(*) AS n FROM event_log WHERE run_id=? AND event_type='visitor:visitEnded'", [runId])?.n ?? 0;
      const acceptedVisits = this._all("SELECT event FROM event_log WHERE run_id=? AND event_type='visitor:visitEnded'", [runId])
        .filter(r => { try { const e = JSON.parse(r.event); return e.accepted || e.outcome === 'accepted'; } catch { return false; } }).length;
      return {
        runId,
        events: total,
        socialInteractions: social,
        conflictRate: social ? +(negative / social).toFixed(3) : 0,
        totalVisits: visits,
        visitAcceptanceRate: visits ? +(acceptedVisits / visits).toFixed(3) : 0,
      };
    });
  }

  async saveRelationshipSnapshot(runId, tick, rows = []) {
    this._db.run('BEGIN');
    try {
      for (const row of rows) {
        this._db.run(
          'INSERT INTO relationship_snapshots (run_id, tick, from_id, to_id, affinity, dims) VALUES (?,?,?,?,?,?)',
          [runId, tick, row.fromId, row.toId, row.affinity ?? null, JSON.stringify(row.dims ?? {})],
        );
      }
      this._db.run('COMMIT');
    } catch (err) {
      this._db.run('ROLLBACK');
      throw err;
    }
    this._scheduleFlush();
    return true;
  }

  async queryRelationshipSnapshots(runId, filters = {}) {
    const where = ['run_id=?'];
    const params = [runId];
    if (filters.fromId) { where.push('from_id=?'); params.push(filters.fromId); }
    if (filters.toId) { where.push('to_id=?'); params.push(filters.toId); }
    if (filters.tickFrom != null) { where.push('tick>=?'); params.push(filters.tickFrom); }
    if (filters.tickTo != null) { where.push('tick<=?'); params.push(filters.tickTo); }
    return this._all(`SELECT * FROM relationship_snapshots WHERE ${where.join(' AND ')} ORDER BY tick`, params)
      .map(r => ({ ...r, dims: JSON.parse(r.dims || '{}') }));
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

  async diagnostics() {
    if (this._dirty) await this._flush();
    const saves = this._all('SELECT slot, household, timestamp, length(data) AS bytes FROM saves ORDER BY slot');
    const events = this._one('SELECT COUNT(*) AS count FROM event_log')?.count ?? 0;
    const relationshipSnapshots = this._one('SELECT COUNT(*) AS count FROM relationship_snapshots')?.count ?? 0;
    const snapshots = this._one('SELECT COUNT(*) AS count FROM snapshots')?.count ?? 0;
    let fileBytes = null;
    try {
      if (this._serverUrl) {
        const info = await this._serverInfo();
        fileBytes = info.bytes ?? null;
      } else if (this._fileHandle) fileBytes = (await this._fileHandle.getFile()).size;
      else {
        const fh = await this._dir.getFileHandle(this._fileName);
        fileBytes = (await fh.getFile()).size;
      }
    } catch { /* ignore */ }
    return {
      backend: this.backend,
      sqlite: true,
      storage: this._serverUrl ? 'filesystem' : (this._fileHandle ? 'filesystem' : (this._dir ? 'OPFS' : 'memory')),
      visibleInProjectFolder: !!(this._serverUrl || this._fileHandle),
      fileName: this._serverFilePath ?? this._fileHandle?.name ?? this._fileName,
      fileBytes,
      lastFlushAt: this._lastFlushAt,
      saves,
      events,
      relationshipSnapshots,
      snapshots,
    };
  }

  async exportBytes() {
    if (this._dirty) await this._flush();
    return this._db.export();
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

  async _readFileHandle(handle) {
    const file = await handle.getFile();
    const buf = await file.arrayBuffer();
    return buf.byteLength ? new Uint8Array(buf) : null;
  }

  async _tryConnectLocalServer(SQL) {
    const url = 'http://127.0.0.1:1421';
    try {
      const health = await fetch(`${url}/health`, { cache: 'no-store' });
      if (!health.ok) return false;
      const info = await health.json();
      const resp = await fetch(`${url}/db`, { cache: 'no-store' });
      const bytes = resp.status === 204 ? null : new Uint8Array(await resp.arrayBuffer());
      this._db = bytes?.byteLength ? new SQL.Database(bytes) : new SQL.Database();
      this._serverUrl = url;
      this._serverFilePath = info.path ?? 'sims-clone.sqlite';
      this.backend = 'sql.js-filesystem-server';
      this._initSchema();
      await this._flush();
      return true;
    } catch {
      return false;
    }
  }

  async _serverInfo() {
    if (!this._serverUrl) return {};
    try {
      const resp = await fetch(`${this._serverUrl}/info`, { cache: 'no-store' });
      return resp.ok ? await resp.json() : {};
    } catch {
      return {};
    }
  }

  async _connectFileHandle(handle) {
    const permission = await this._ensureFilePermission(handle);
    if (!permission) throw new Error('Permission denied for SQLite file');
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    const bytes = await this._readFileHandle(handle);
    this._db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this._fileHandle = handle;
    this._dir = null;
    this.backend = 'sql.js-file';
    this._initSchema();
  }

  async _tryConnectRememberedFile(SQL) {
    if (!SqlJsAdapter.fileAccessAvailable()) return false;
    const handle = await this._loadPersistedFileHandle();
    if (!handle) return false;
    const granted = await this._ensureFilePermission(handle, { prompt: false });
    if (!granted) return false;
    const bytes = await this._readFileHandle(handle);
    this._db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this._fileHandle = handle;
    this.backend = 'sql.js-file';
    this._initSchema();
    await this._flush();
    return true;
  }

  async _ensureFilePermission(handle, { prompt = true } = {}) {
    const opts = { mode: 'readwrite' };
    if (await handle.queryPermission?.(opts) === 'granted') return true;
    if (!prompt) return false;
    return await handle.requestPermission?.(opts) === 'granted';
  }

  _handleDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async _persistFileHandle(handle) {
    const db = await this._handleDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, 'readwrite');
        tx.objectStore(HANDLE_STORE).put(handle, SQLITE_HANDLE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async _loadPersistedFileHandle() {
    if (typeof indexedDB === 'undefined') return null;
    const db = await this._handleDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, 'readonly');
        const req = tx.objectStore(HANDLE_STORE).get(SQLITE_HANDLE_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    } finally {
      db.close();
    }
  }

  _initSchema() {
    this._db.run(SCHEMA);
    this._migrateEventLog();
    this._enforceRetention(true);   // prune + reclaim once on connect (cleans old bloat)
  }

  /** Bound the event log / relationship snapshots to their caps. */
  _enforceRetention(vacuum = false) {
    this._db.run('DELETE FROM event_log WHERE id <= (SELECT MAX(id) FROM event_log) - ?', [EVENT_LOG_CAP]);
    this._db.run('DELETE FROM relationship_snapshots WHERE id <= (SELECT MAX(id) FROM relationship_snapshots) - ?', [REL_SNAPSHOT_CAP]);
    if (vacuum) { try { this._db.run('VACUUM'); } catch { /* best-effort reclaim */ } }
  }

  _migrateEventLog() {
    const cols = new Set(this._all('PRAGMA table_info(event_log)').map(r => r.name));
    const add = (name, type) => {
      if (!cols.has(name)) this._db.run(`ALTER TABLE event_log ADD COLUMN ${name} ${type}`);
    };
    add('tick', 'INTEGER');
    add('sim_day', 'INTEGER');
    add('sim_hour', 'REAL');
    add('event_type', 'TEXT');
    add('actor_id', 'TEXT');
    add('target_id', 'TEXT');
    add('interaction_type', 'TEXT');
    add('accepted', 'INTEGER');
    add('relationship_before', 'REAL');
    add('relationship_after', 'REAL');
  }

  _scheduleFlush() {
    this._dirty = true;
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      if (this._dirty) this._flush().catch(err => console.error('[SqlJsAdapter] flush failed', err));
    }, FLUSH_MS);
  }

  async _flush() {
    this._dirty = false;
    if (!this._serverUrl && !this._fileHandle && !this._dir) {
      this._lastFlushAt = new Date().toISOString();
      return;
    }
    const data = this._db.export();
    if (this._serverUrl) {
      const resp = await fetch(`${this._serverUrl}/db`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: data,
      });
      if (!resp.ok) throw new Error(`Filesystem SQLite flush failed: ${resp.status}`);
      this._lastFlushAt = new Date().toISOString();
      return;
    }
    const fh = this._fileHandle ?? await this._dir.getFileHandle(this._fileName, { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
    this._lastFlushAt = new Date().toISOString();
  }
}
