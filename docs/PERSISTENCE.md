# Persistence — from localStorage to SQLite

This document explains the persistence strategy for the simulation: why the current `localStorage` backend is a stop-gap, why SQLite is the right target for social-experiment data, why the live loop must stay in memory, and the initial relational schema.

It complements the `PersistenceAdapter` abstraction in `src/persistence/`. `SaveLoad` no longer talks to storage directly, so the backend can be swapped without touching the simulation model.

---

## Current status

There are now two concrete adapters:

| Adapter | File | Status | Use case |
|---|---|---|---|
| `LocalStorageAdapter` | `src/persistence/LocalStorageAdapter.js` | Default runtime backend | Browser/static web app. |
| `SQLiteAdapter` | `src/persistence/SQLiteAdapter.js` | Implemented, not wired by default | Tauri/desktop or SQLite WASM backend. |

`SQLiteAdapter` is no longer a throwing stub. It expects an injected SQL backend exposing:

```js
execute(sql, params?)
select(sql, params?)
```

This matches `tauri-plugin-sql` and can also be wrapped around a SQLite WASM implementation.

The browser build should continue to use `LocalStorageAdapter` until the boot and save-slot UI flows are made fully async. SQLite is naturally async; `localStorage` is sync.

---

## Why localStorage is insufficient

`localStorage` works for a few save slots but is the wrong tool for a research platform:

- Tiny and string-only: a long run with many social/visitor/wellbeing events and snapshots will outgrow it.
- Not queryable: analysis requires loading and scanning JSON in JavaScript.
- No relations or integrity: people, events, relationships and snapshots are independent blobs.
- Whole-blob writes: every save rewrites the whole slot string.
- Sandbox-bound: it is not a real user-facing database file.

## Why SQLite is useful for social experiments

The project is about observing simulated social dynamics. SQLite gives durable, queryable, comparable data:

- indexed queries over event logs, visitors, relationships and snapshots;
- append-only event capture;
- multiple runs side by side;
- reproducible snapshots;
- a local file that can be opened in external tools.

## Why the live loop must stay in memory

SQLite is for durable, between-frame data, not for every simulation tick. Needs, pathfinding, AI scoring, SocialDynamics drift and visitor lifecycle state should remain in JavaScript objects. Persistence is used for saves, snapshots, event append, configuration and later scenario loading.

---

## Recommended strategy

### Preferred: Tauri + SQLite

Wrap the app in Tauri and use `tauri-plugin-sql`. This gives a real local `.db` file. The JS side creates a backend connection and injects it into `SQLiteAdapter`:

```js
import Database from '@tauri-apps/plugin-sql';
import { SQLiteAdapter } from './src/persistence/SQLiteAdapter.js';

const db = await Database.load('sqlite:sims-clone.db');
const adapter = await new SQLiteAdapter({ db }).connect();
```

Then pass `adapter` to `SaveLoad` when making the runtime async-aware.

### Alternative: SQLite WASM

Use `@sqlite.org/sqlite-wasm` or `sql.js` with OPFS/IndexedDB persistence. This can remain browser-only, but the database still lives inside browser-managed storage rather than a normal user-facing file.

### Sync vs async note

`LocalStorageAdapter` is synchronous and keeps the current startup path simple. `SQLiteAdapter` is async. Swapping it into the actual game boot flow requires updating:

- `Game._boot()`;
- start-menu save scanning;
- `SaveSlotPanel` rendering;
- `SaveLoad.save/load/readSlot/slotList` call sites.

The adapter itself is ready; the UI/boot path still needs async wiring before SQLite becomes the default runtime backend.

---

## Implemented SQLiteAdapter behavior

`SQLiteAdapter` currently supports:

- `connect(dbOrFactory)`;
- `migrate()`;
- `saveSlot(slot, data)`;
- `readSlot(slot)`;
- `hasSlot(slot)`;
- `deleteSlot(slot)`;
- `listSlots()`;
- `appendEvent(runId, event)`;
- `saveSnapshot(runId, state)`;
- `loadSnapshot(runId, snapshotId)`;
- `listSnapshots(runId)`;
- `ensureRun(runId, data)`;
- `close()`.

Event rows are always inserted into `event_log`. Visitor events are additionally mirrored into `visitor_events` for easier visitor-specific queries.

---

## Initial schema

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  seed INTEGER,
  config_json TEXT
);

CREATE TABLE save_slots (
  slot INTEGER PRIMARY KEY,
  version INTEGER,
  household_name TEXT,
  sim_count INTEGER,
  sim_day INTEGER,
  timestamp INTEGER,
  updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lot_id TEXT
);

CREATE TABLE people (
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
);

CREATE TABLE relationship_state (
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
);

CREATE TABLE event_log (
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
);

CREATE TABLE visitor_events (
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
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  tick INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  state_json TEXT NOT NULL
);

CREATE TABLE object_defs (
  id TEXT PRIMARY KEY,
  category TEXT,
  config_json TEXT NOT NULL
);

CREATE TABLE interaction_defs (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL
);

CREATE TABLE scenario_defs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL
);
```

Indexes created by the adapter:

```sql
CREATE INDEX idx_event_log_run_tick ON event_log(run_id, tick);
CREATE INDEX idx_event_log_type ON event_log(event_type);
CREATE INDEX idx_event_log_actor_target ON event_log(actor_id, target_id);
CREATE INDEX idx_visitor_events_run_visitor ON visitor_events(run_id, visitor_id);
CREATE INDEX idx_snapshots_run_tick ON snapshots(run_id, tick);
```

### How the in-memory model maps to the schema

| In-memory runtime | Table |
|---|---|
| Save slots from `SaveLoad` | `save_slots` |
| `Game.serialise()` full state snapshots | `snapshots` |
| `experimentLogger` rows | `event_log` |
| `visitor:*` rows | `event_log` and `visitor_events` |
| `game.population` people records | `people`, later `households` |
| `socialDynamics` directional dims | `relationship_state`, future sync step |
| `ObjectRegistry` / `SKILL_BY_OBJECT` | `object_defs`, future config step |
| `INTERACTIONS` catalogue | `interaction_defs`, future config step |
| default scenario / population | `scenario_defs`, future config step |

### Config that will move to SQLite

Today these are still hardcoded in `Game.js`, `World.js` or system modules and should be extracted to `src/config/*` first, then become rows in the `*_defs` / `scenario_defs` tables:

- `SIM_DEFS`, `TRAIT_AXIS`;
- initial furniture and object definitions;
- starter careers;
- `INTERACTIONS` catalogue;
- autonomous shopping prices;
- future visitor types;
- base schedule/routine.

## Example analytical queries

```sql
-- All hostile social interactions in a run
SELECT tick, actor_id, target_id, interaction_type, relationship_after
FROM event_log
WHERE run_id = ?
  AND interaction_type IN ('argue', 'insult', 'confront', 'avoid')
ORDER BY tick;

-- Visit acceptance rate by host
SELECT host_id,
       AVG(CASE WHEN accepted = 1 THEN 1.0 ELSE 0.0 END) AS acceptance_rate,
       COUNT(*) AS visits
FROM visitor_events
WHERE run_id = ?
GROUP BY host_id
ORDER BY visits DESC;

-- Wellbeing telemetry stored in the generic event log
SELECT tick, payload_json
FROM event_log
WHERE run_id = ? AND event_type = 'wellbeing:evaluated'
ORDER BY tick;
```

## Next migration step

The next useful step is not adding more tables. It is making the boot/save UI async-safe so the runtime can actually use `SQLiteAdapter` instead of `LocalStorageAdapter` in a Tauri build.
