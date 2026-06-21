import { PersistenceAdapter } from './PersistenceAdapter.js';

const DEFAULT_SLOTS = 3;
const SCHEMA_VERSION = 1;

function nowIso() { return new Date().toISOString(); }
function json(value) { return JSON.stringify(value ?? null); }
function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
function id(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`; }
function boolInt(v) { return v == null ? null : (v ? 1 : 0); }
function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

/**
 * SQLiteAdapter
 *
 * Real SQLite-backed PersistenceAdapter, but intentionally NOT wired by default.
 * The browser build should keep using LocalStorageAdapter. Use this adapter from
 * a desktop shell (recommended: Tauri + tauri-plugin-sql) or from a SQLite WASM
 * wrapper by injecting an object with:
 *
 *   execute(sql, params?) -> Promise<any>
 *   select(sql, params?)  -> Promise<Array<object>>
 *
 * This keeps the simulation loop in memory while persisting durable data:
 * save slots, event rows and snapshots.
 */
export class SQLiteAdapter extends PersistenceAdapter {
  constructor(opts = {}) {
    super();
    this._db = opts.db ?? null;
    this._slots = opts.slots ?? DEFAULT_SLOTS;
    this._runId = opts.runId ?? 'default_run';
    this._autoMigrate = opts.autoMigrate !== false;
    this._logger = opts.logger ?? console;
    this.ready = false;
  }

  /** Attach or create the SQL backend and optionally migrate schema. */
  async connect(dbOrFactory = null) {
    if (dbOrFactory) this._db = typeof dbOrFactory === 'function' ? await dbOrFactory() : dbOrFactory;
    this._assertDb();
    if (this._autoMigrate) await this.migrate();
    this.ready = true;
    return this;
  }

  /** Create/upgrade the minimum schema this adapter needs. Safe to call often. */
  async migrate() {
    this._assertDb();
    await this._execute('PRAGMA foreign_keys = ON');
    await this._execute(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    await this._execute(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        seed INTEGER,
        config_json TEXT
      )
    `);
    await this._execute(`
      CREATE TABLE IF NOT EXISTS save_slots (
        slot INTEGER PRIMARY KEY,
        version INTEGER,
        household_name TEXT,
        sim_count INTEGER,
        sim_day INTEGER,
        timestamp INTEGER,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      )
    `);
    await this._execute(`
      CREATE TABLE IF NOT EXISTS households (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        lot_id TEXT
      )
    `);
    await this._execute(`
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color INTEGER,
        role TEXT NOT NULL,
        household_id TEXT,
        home_lot_id TEXT,
        traits_json TEXT NOT NULL,
        availability_json TEXT,
        offlot_state TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await this._execute(`
      CREATE TABLE IF NOT EXISTS relationship_state (
        run_id TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        trust REAL DEFAULT 0,
        affection REAL DEFAULT 0,
        respect REAL DEFAULT 0,
        attraction REAL DEFAULT 0,
        resentment REAL DEFAULT 0,
        fear REAL DEFAULT 0,
        familiarity REAL DEFAULT 0,
        dependency REAL DEFAULT 0,
        updated_tick INTEGER,
        PRIMARY KEY (run_id, from_id, to_id)
      )
    `);
    await this._execute(`
      CREATE TABLE IF NOT EXISTS event_log (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        tick INTEGER NOT NULL,
        sim_day INTEGER,
        sim_hour REAL,
        event_type TEXT NOT NULL,
        actor_id TEXT,
        target_id TEXT,
        interaction_type TEXT,
        accepted INTEGER,
        location TEXT,
        is_public INTEGER,
        dominant_motive TEXT,
        active_goal TEXT,
        relationship_before REAL,
        relationship_after REAL,
        payload_json TEXT
      )
    `);
    await this._execute(`
      CREATE TABLE IF NOT EXISTS visitor_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        visitor_id TEXT NOT NULL,
        host_id TEXT,
        reason TEXT,
        state TEXT NOT NULL,
        accepted INTEGER,
        arrived_tick INTEGER,
        entered_tick INTEGER,
        left_tick INTEGER,
        outcome TEXT,
        payload_json TEXT
      )
    `);
    await this._execute(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        tick INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        state_json TEXT NOT NULL
      )
    `);
    await this._execute(`
      CREATE TABLE IF NOT EXISTS object_defs (
        id TEXT PRIMARY KEY,
        category TEXT,
        config_json TEXT NOT NULL
      )
    `);
    await this._execute(`
      CREATE TABLE IF NOT EXISTS interaction_defs (
        id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL
      )
    `);
    await this._execute(`
      CREATE TABLE IF NOT EXISTS scenario_defs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config_json TEXT NOT NULL
      )
    `);
    await this._execute('CREATE INDEX IF NOT EXISTS idx_event_log_run_tick ON event_log(run_id, tick)');
    await this._execute('CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type)');
    await this._execute('CREATE INDEX IF NOT EXISTS idx_event_log_actor_target ON event_log(actor_id, target_id)');
    await this._execute('CREATE INDEX IF NOT EXISTS idx_visitor_events_run_visitor ON visitor_events(run_id, visitor_id)');
    await this._execute('CREATE INDEX IF NOT EXISTS idx_snapshots_run_tick ON snapshots(run_id, tick)');
    await this._execute(
      'INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)',
      ['schema_version', String(SCHEMA_VERSION)]
    );
    return true;
  }

  async ensureRun(runId = this._runId, data = {}) {
    this._assertReady();
    await this._execute(
      `INSERT OR IGNORE INTO runs(id, name, started_at, seed, config_json)
       VALUES (?, ?, ?, ?, ?)`,
      [runId, data.name ?? runId, data.startedAt ?? nowIso(), data.seed ?? null, json(data.config ?? {})]
    );
    return runId;
  }

  async saveSlot(slot, data) {
    this._assertReady();
    await this._execute(
      `INSERT INTO save_slots(slot, version, household_name, sim_count, sim_day, timestamp, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slot) DO UPDATE SET
         version = excluded.version,
         household_name = excluded.household_name,
         sim_count = excluded.sim_count,
         sim_day = excluded.sim_day,
         timestamp = excluded.timestamp,
         updated_at = excluded.updated_at,
         data_json = excluded.data_json`,
      [
        slot,
        data?._version ?? null,
        data?.householdName ?? null,
        Array.isArray(data?.state?.sims) ? data.state.sims.length : null,
        data?.state?.clock?.day ?? data?.state?.clock?.weekday ?? null,
        data?.timestamp ?? Date.now(),
        nowIso(),
        json(data),
      ]
    );
    return true;
  }

  async readSlot(slot) {
    this._assertReady();
    const rows = await this._select('SELECT data_json FROM save_slots WHERE slot = ? LIMIT 1', [slot]);
    return rows.length ? parseJson(rows[0].data_json, null) : null;
  }

  async hasSlot(slot) {
    this._assertReady();
    const rows = await this._select('SELECT 1 AS found FROM save_slots WHERE slot = ? LIMIT 1', [slot]);
    return rows.length > 0;
  }

  async deleteSlot(slot) {
    this._assertReady();
    await this._execute('DELETE FROM save_slots WHERE slot = ?', [slot]);
    return true;
  }

  async listSlots() {
    this._assertReady();
    const rows = await this._select('SELECT slot, data_json FROM save_slots ORDER BY slot');
    const bySlot = new Map(rows.map(r => [Number(r.slot), parseJson(r.data_json, null)]));
    return Array.from({ length: this._slots }, (_, slot) => ({ slot, data: bySlot.get(slot) ?? null }));
  }

  async appendEvent(runId, event) {
    this._assertReady();
    const rid = runId || this._runId;
    await this.ensureRun(rid);
    const eventId = event.eventId || id('e');
    await this._execute(
      `INSERT INTO event_log(
        id, run_id, tick, sim_day, sim_hour, event_type,
        actor_id, target_id, interaction_type, accepted, location, is_public,
        dominant_motive, active_goal, relationship_before, relationship_after, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        rid,
        numOrNull(event.tick) ?? 0,
        numOrNull(event.simDay),
        numOrNull(event.simHour),
        event.type ?? event.event_type ?? 'unknown',
        event.actorId ?? event.simId ?? event.buyerId ?? null,
        event.targetId ?? event.visitorId ?? null,
        event.interactionType ?? null,
        boolInt(event.accepted),
        event.location ?? null,
        boolInt(event.isPublic),
        event.dominantMotive ?? event.dominant ?? null,
        event.activeGoal ?? null,
        numOrNull(event.relationshipBefore),
        numOrNull(event.relationshipAfter),
        json(event),
      ]
    );
    if (String(event.type ?? '').startsWith('visitor:')) await this._appendVisitorEvent(rid, eventId, event);
    return eventId;
  }

  async saveSnapshot(runId, state) {
    this._assertReady();
    const rid = runId || this._runId;
    await this.ensureRun(rid);
    const snapshotId = id('s');
    await this._execute(
      'INSERT INTO snapshots(id, run_id, tick, created_at, state_json) VALUES (?, ?, ?, ?, ?)',
      [snapshotId, rid, numOrNull(state?.tick) ?? 0, nowIso(), json(state)]
    );
    return snapshotId;
  }

  async loadSnapshot(runId, snapshotId) {
    this._assertReady();
    const rows = await this._select(
      'SELECT id, run_id, tick, created_at, state_json FROM snapshots WHERE run_id = ? AND id = ? LIMIT 1',
      [runId || this._runId, snapshotId]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      id: row.id,
      runId: row.run_id,
      tick: row.tick,
      createdAt: row.created_at,
      state: parseJson(row.state_json, null),
    };
  }

  async listSnapshots(runId = this._runId) {
    this._assertReady();
    return this._select(
      'SELECT id, run_id, tick, created_at FROM snapshots WHERE run_id = ? ORDER BY tick, created_at',
      [runId]
    );
  }

  async close() {
    if (this._db?.close) await this._db.close();
    this.ready = false;
  }

  async _appendVisitorEvent(runId, eventId, event) {
    await this._execute(
      `INSERT OR REPLACE INTO visitor_events(
        id, run_id, visitor_id, host_id, reason, state, accepted,
        arrived_tick, entered_tick, left_tick, outcome, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        runId,
        event.visitorId ?? event.personId ?? '',
        event.hostId ?? null,
        event.reason ?? null,
        event.state ?? event.type ?? '',
        boolInt(event.accepted),
        numOrNull(event.arrivedTick ?? event.arrivalTick),
        numOrNull(event.enteredTick),
        numOrNull(event.leftTick ?? event.actualLeftTick),
        event.outcome ?? null,
        json(event),
      ]
    );
  }

  _assertDb() {
    if (!this._db) throw new Error('SQLiteAdapter requires a backend. Pass { db } or call connect(db).');
  }

  _assertReady() {
    this._assertDb();
    if (!this.ready) throw new Error('SQLiteAdapter is not connected. Call await adapter.connect(db) before use.');
  }

  async _execute(sql, params = []) {
    this._assertDb();
    if (typeof this._db.execute === 'function') return this._db.execute(sql, params);
    if (typeof this._db.run === 'function') return this._db.run(sql, params);
    if (typeof this._db.exec === 'function' && params.length === 0) return this._db.exec(sql);
    throw new Error('SQLite backend must expose execute(sql, params) or run(sql, params).');
  }

  async _select(sql, params = []) {
    this._assertDb();
    if (typeof this._db.select === 'function') return this._db.select(sql, params);
    if (typeof this._db.all === 'function') return this._db.all(sql, params);
    if (typeof this._db.prepare === 'function') {
      const stmt = this._db.prepare(sql);
      try {
        if (typeof stmt.all === 'function') return stmt.all(params);
        const rows = [];
        if (typeof stmt.bind === 'function') stmt.bind(params);
        while (stmt.step?.()) rows.push(stmt.getAsObject?.() ?? stmt.get?.());
        return rows;
      } finally {
        stmt.free?.();
      }
    }
    throw new Error('SQLite backend must expose select(sql, params), all(sql, params), or prepare(sql).');
  }
}
