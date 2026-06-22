# Persistence — from localStorage to SQLite

This document explains the persistence strategy for the simulation: why `localStorage` is only a fallback, why SQLite is the right backend for social-experiment data, why the live loop must stay in memory, and how the implemented adapters fit together.

It complements the `PersistenceAdapter` abstraction in `src/persistence/`. `SaveLoad` no longer talks to storage directly, so the backend can be swapped without touching the simulation model.

---

## Current status

There are two concrete adapters:

| Adapter | File | Status | Use case |
|---|---|---|---|
| `SqlJsAdapter` | `src/persistence/SqlJsAdapter.js` | Default runtime backend | Real SQLite in the browser (sql.js / WASM) persisted to OPFS. |
| `LocalStorageAdapter` | `src/persistence/LocalStorageAdapter.js` | Fallback | Browsers without OPFS. |

`SqlJsAdapter` runs SQLite compiled to WebAssembly (the `sql.js` package). The
database lives in memory and is flushed to a single OPFS file
(`sims-clone.sqlite`) as bytes. There is no native/Rust backend.

The runtime is async-safe for boot/save UI:

- `SaveLoad.save/readSlot/load/slotList/deleteSlot/hasSlot` are async;
- `Game._boot()` awaits slot reads and slot scans;
- the start menu awaits slot loads;
- `SaveSlotPanel` renders async slot lists and handles save/load/delete with `await`;
- `main.js` initialises a connected `SqlJsAdapter` when OPFS is available.

If OPFS is unavailable the game falls back to `LocalStorageAdapter`.

---

## Browser runtime (sql.js + OPFS)

The app is a web app served by Vite and opened in Chrome via the `npm run app`
launcher (see `scripts/launch.mjs` and `docs/PLATFORM_ROADMAP.md`). There is no
desktop shell.

Frontend boot is handled in `src/main.js`:

```js
const persistenceAdapter = await resolvePersistenceAdapter();
new Game(container, { persistenceAdapter });
```

`resolvePersistenceAdapter()` dynamically imports `SqlJsAdapter`; if
`navigator.storage.getDirectory` (OPFS) is available it loads the WASM build,
opens/creates the OPFS file `sims-clone.sqlite`, and returns the connected
adapter. Otherwise it returns `null` and `SaveLoad` uses `LocalStorageAdapter`.

Flush policy: slot saves and deletes flush the whole DB to OPFS immediately; the
high-frequency `event_log` is flushed throttled (and on the next slot save) so
logging stays cheap. A hard crash can lose at most ~2s of `event_log` rows.

---

## Run commands

Install dependencies:

```bash
npm install
```

Run the app (Vite + Chrome app window):

```bash
npm run app
```

Or just the dev server, then open the printed URL in Chrome yourself:

```bash
npm run dev
```

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

## Implemented SqlJsAdapter behavior

`SqlJsAdapter` currently implements:

- `connect()` — load WASM, open the OPFS file, create tables;
- `saveSlot(slot, data)` / `readSlot(slot)` / `hasSlot(slot)` / `deleteSlot(slot)` / `listSlots()`;
- `appendEvent(runId, event)`;
- `saveSnapshot(runId, state)` / `loadSnapshot(runId, snapshotId)`.

It creates a focused subset of the target schema below: `saves` (slot blobs),
`event_log` (one row per logged event, indexed by `run_id`) and `snapshots`.
The remaining tables (`people`, `relationship_state`, `visitor_events`,
`*_defs`, …) are the design target; today the full game state is still stored
as a JSON blob inside the `saves` row, while the event log is already queryable
row by row.

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

Grow `SqlJsAdapter` from the current `saves` / `event_log` / `snapshots` subset toward the target schema, and move configuration data (`ObjectRegistry`, interactions, starter careers, scenario definitions) into `src/config/*` and then into SQLite-backed definition tables. A future distributable desktop build would wrap this same web app in Electron (which bundles Chromium, so WebGL works); Tauri/WKWebView was dropped because it lacks reliable WebGL on the target hardware — see `docs/PLATFORM_ROADMAP.md`.
