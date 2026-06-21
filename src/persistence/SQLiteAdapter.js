import { PersistenceAdapter } from './PersistenceAdapter.js';

/**
 * SQLiteAdapter — STUB. Not wired by default; the browser runtime keeps using
 * LocalStorageAdapter. Instantiating and using this adapter without configuring
 * a backend throws (loudly) — it never silently breaks the running game.
 *
 * Why SQLite (see docs/PERSISTENCE.md):
 *   localStorage is a ~5MB string KV store, not queryable, not relational, and
 *   awkward for long social-experiment runs (event logs, snapshots, population,
 *   relationship history). SQLite gives indexed, queryable, durable storage.
 *
 * Two implementation paths (pick one when you actually need file persistence):
 *
 *   1. SQLite WASM (browser-only, no desktop shell)
 *      - Use @sqlite.org/sqlite-wasm or sql.js, persisted via OPFS/IndexedDB.
 *      - Pros: stays a static web app, no bundler strictly required (ESM CDN).
 *      - Cons: storage is still inside the browser sandbox (not a real file).
 *
 *   2. Tauri + tauri-plugin-sql (real local .db file)
 *      - Wrap the app in Tauri; call the SQL plugin from JS.
 *      - Pros: a genuine local SQLite file the user can inspect/backup/share.
 *      - Cons: requires the Tauri shell (desktop build), not pure web.
 *
 * Schema lives in docs/PERSISTENCE.md (runs, households, people,
 * relationship_state, event_log, visitor_events, snapshots, *_defs).
 *
 * IMPORTANT: the live simulation loop must stay in memory. This adapter is for
 * snapshots, configuration, population, relationships, event logs and scenarios
 * — NOT a per-frame datastore.
 */
const NOT_CONFIGURED = 'SQLiteAdapter is a stub — configure SQLite WASM or Tauri SQL first (see docs/PERSISTENCE.md)';

export class SQLiteAdapter extends PersistenceAdapter {
  constructor(opts = {}) {
    super();
    this._opts = opts;
    this.ready = false;   // becomes true once a real backend is attached
    console.warn('[SQLiteAdapter] stub instantiated — using it will throw until a backend is configured.');
  }

  /** Hook for a future backend (sqlite-wasm handle or Tauri SQL connection). */
  async connect() { throw new Error(NOT_CONFIGURED); }

  async saveSlot()      { throw new Error(NOT_CONFIGURED); }
  async readSlot()      { throw new Error(NOT_CONFIGURED); }
  async hasSlot()       { throw new Error(NOT_CONFIGURED); }
  async deleteSlot()    { throw new Error(NOT_CONFIGURED); }
  async listSlots()     { throw new Error(NOT_CONFIGURED); }
  async appendEvent()   { throw new Error(NOT_CONFIGURED); }
  async saveSnapshot()  { throw new Error(NOT_CONFIGURED); }
  async loadSnapshot()  { throw new Error(NOT_CONFIGURED); }
}
