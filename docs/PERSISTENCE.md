# Persistence — from localStorage to SQLite

This document explains the persistence strategy for the simulation: why the
current `localStorage` backend is a stop-gap, why SQLite is the right target for
social-experiment data, why the live loop must stay in memory, and the initial
relational schema.

It complements the `PersistenceAdapter` abstraction (see
`src/persistence/`): `SaveLoad` no longer talks to storage directly, so the
backend can be swapped without touching the simulation.

---

## Why localStorage is insufficient

`localStorage` is what ships today (`LocalStorageAdapter`). It works for a few
save slots but is the wrong tool for a *research platform*:

- **Tiny & string-only** — ~5 MB per origin, values are strings. A long run
  (thousands of social/visitor events, snapshots, growing population) blows
  past that quickly.
- **Not queryable** — you cannot ask "all rejected visits by host X" or "the
  resentment timeline between A and B" without loading and scanning everything
  in JS. Analysis is O(n) hand-rolled filtering.
- **No relations / integrity** — people, relationships, events and snapshots
  are independent JSON blobs; there are no joins, indexes or foreign keys.
- **Single writer, whole-blob writes** — every save rewrites the entire slot
  string; there is no append, no incremental event log.
- **Sandbox-bound** — it is not a real file the user can inspect, back up,
  diff between runs, or open in another tool.

## Why SQLite is useful for social experiments

The whole point of the project is *observing simulated social dynamics*. That
means durable, queryable, comparable data:

- **Indexed queries** over the event log, relationship state and visitor
  events — acceptance rates per host, conflict timelines, network size, etc.
- **Append-only event log** that grows cheaply during a run.
- **Snapshots** at chosen ticks for reproducibility and "what-if" branching.
- **Multiple runs** side by side (the `runs` table), each with its own seed and
  config, so experiments are comparable.
- **A real local file** (`.db`) that can be backed up, shared, and analysed
  with any SQLite tool or notebook.

## Why the live loop must stay in memory

SQLite is for **durable, between-frame data** — NOT a per-frame datastore.

- The simulation tick (needs, pathfinding, AI, SocialDynamics drift) runs many
  times per second on in-memory objects (`game.sims`, `socialDynamics`, etc.).
  Querying a database every frame would be orders of magnitude too slow and
  would couple the loop to I/O latency.
- Persistence is used for: **snapshots**, **configuration**, **population**,
  **relationships**, **event logs**, and **scenarios** — things written
  occasionally (save, autosave, event append) and read at load/analysis time.
- The `PersistenceAdapter` contract is intentionally coarse-grained
  (`saveSlot`, `appendEvent`, `saveSnapshot`, …) to keep the hot loop out of
  storage entirely.

---

## Recommended strategy

### Preferred: Tauri + SQLite (real local file)

Wrap the existing static web app in [Tauri](https://tauri.app) and use
`tauri-plugin-sql`. JS calls the plugin; data lives in a genuine local
`.db` file.

- **Pros** — a real file the user owns: backup, inspect, diff, share, analyse
  in external tools. Best fit for a research platform.
- **Cons** — requires the Tauri desktop shell (a build step for the desktop
  app); the pure-web deployment would still use localStorage.

Implementation sketch: add a `TauriSQLiteAdapter` (replacing the stub
`SQLiteAdapter`) whose methods run parameterised SQL via the plugin against the
schema below.

### Alternative: SQLite WASM (browser-only)

Use [`@sqlite.org/sqlite-wasm`](https://sqlite.org/wasm) (or `sql.js`) persisted
via **OPFS** (or IndexedDB), staying a static site.

- **Pros** — no desktop shell; remains a web app; loadable from an ESM CDN, so
  no bundler is required (consistent with the project's constraints).
- **Cons** — storage is still inside the browser sandbox (OPFS), not a
  user-facing file; OPFS support varies by browser.

Both paths implement the same `PersistenceAdapter` interface, so `SaveLoad` and
the rest of the game are unaffected by the choice.

### Sync vs async note

`LocalStorageAdapter` is synchronous (localStorage is sync), which lets the
current synchronous call sites (`Game._boot`, `SaveSlotPanel`) read slots
directly. A SQLite adapter is genuinely **async**. Swapping it in therefore
requires making those few call sites `await` the adapter (boot slot scan, slot
list rendering). This is the only migration work on the app side; the contract
and `SaveLoad` already assume an async-compatible adapter.

---

## Initial schema

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  seed INTEGER,
  config_json TEXT
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

### How the in-memory model maps to the schema

| In-memory (runtime) | Table |
|---|---|
| `game.population` people records | `people`, `households` |
| `socialDynamics` directional dims | `relationship_state` (one row per `from→to`) |
| `experimentLogger` social rows | `event_log` |
| `experimentLogger` visitor rows (Task 8) | `visitor_events` |
| `Game.serialise()` full state | `snapshots.state_json` |
| `ObjectRegistry` / `SKILL_BY_OBJECT` | `object_defs` |
| `INTERACTIONS` catalogue | `interaction_defs` |
| default scenario / population (Task 12) | `scenario_defs` |

### Config that will move to SQLite (see Task 12)

Today these are hardcoded in `Game.js` / `World.js` / system modules and will be
extracted to `src/config/*` first, then become rows in the `*_defs` /
`scenario_defs` tables:

- `SIM_DEFS`, `TRAIT_AXIS` (Game.js)
- initial furniture (World.js) and `object_defs`
- starter careers (Game.js)
- the `INTERACTIONS` catalogue (SocialDynamicsSystem)
- future visitor types
- base schedule/routine

The `PersistenceAdapter` already exposes `appendEvent` / `saveSnapshot` /
`loadSnapshot` so the event-log and snapshot tables can be populated without
further interface changes once a SQLite adapter is wired.
