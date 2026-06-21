# Rust Backend Roadmap

This document tracks the long-term migration from a browser-only JavaScript simulation into a desktop/research platform with a Rust backend, a leaner frontend, and SQLite-backed persistence.

The goal is not to rewrite everything in Rust blindly. The goal is to move the parts that benefit from strong typing, durability, background processing, file-system access, reproducible experiments and performance out of the HTML/JS UI layer.

## Current state

The project currently has:

- a static web frontend driven by `index.html` and ES modules under `src/`;
- a Tauri shell under `src-tauri/`;
- SQLite persistence through `SQLiteAdapter` and `tauri-plugin-sql`;
- async-safe save/load boot flow;
- simulation logic still mostly in JavaScript;
- a very large `index.html` that mixes HTML structure, CSS and app shell concerns.

This is acceptable for rapid prototyping but not for the next stage.

## Why a Rust backend exists

Rust should own the durable and system-level responsibilities that are awkward, fragile or unsafe in browser JavaScript.

### 1. Real local persistence

SQLite should be a real local database file in desktop mode, not a browser sandbox workaround.

Rust/Tauri gives the app controlled access to:

- SQLite database files;
- backup/export/import paths;
- filesystem permissions;
- safer migrations;
- platform-specific storage directories.

JavaScript should request persistence operations; Rust should enforce the storage boundary.

### 2. Reproducible experiment runs

This project is becoming more than a game prototype. It is becoming a social simulation platform.

Rust can eventually manage:

- experiment run creation;
- run metadata;
- seeds;
- scenario loading;
- snapshot scheduling;
- bulk event ingestion;
- export to JSON/CSV/SQLite bundles;
- validation of scenario files.

### 3. Headless simulation

A research platform needs runs without rendering.

Rust can eventually expose a headless engine path that runs simulations without Three.js, UI panels or DOM dependencies.

That enables:

- faster-than-real-time batch runs;
- repeated experiments with different seeds;
- regression tests on social dynamics;
- comparison between scenario variants;
- CI-friendly simulation tests.

This is the biggest strategic reason for Rust.

### 4. Safer domain model

Core concepts such as people, households, relationships, events, snapshots, object definitions and scenario definitions need strong schemas.

Rust is better suited for enforcing:

- typed IDs;
- schema versioning;
- migration boundaries;
- data validation;
- event contracts;
- reproducible state transitions.

JavaScript is excellent for iteration and UI, but the domain model will become too large to keep loose forever.

### 5. Performance and background work

Rust can handle heavier work without blocking the UI:

- analytics over large event logs;
- relationship graph aggregation;
- visitor/social metric computation;
- save compression/export;
- batch scenario execution;
- future pathfinding or simulation submodules if needed.

Do not move performance-sensitive code to Rust just because it is Rust. Move it when profiling or architecture justifies it.

## What Rust should not own yet

Rust should not own rendering, panels, CSS, build UI, or most immediate gameplay interaction.

Keep these in frontend code:

- Three.js rendering;
- DOM panels;
- click/hover interactions;
- build mode UI;
- dashboard UI;
- visual overlays;
- animation and camera control.

Rust should expose commands/services. The frontend should remain the presentation layer.

## Will this simplify the HTML?

Not directly.

A Rust backend does not automatically make `index.html` smaller. The HTML is large because it currently mixes:

- static DOM anchors;
- inline CSS;
- modal layouts;
- toolbar definitions;
- panel styles;
- app shell structure.

The correct simplification is a frontend refactor, not moving markup into Rust.

The frontend should be split into:

```text
src/styles/base.css
src/styles/toolbar.css
src/styles/panels.css
src/styles/start-menu.css
src/styles/sim-creator.css
src/styles/build-mode.css
src/styles/dashboard.css
```

and possibly:

```text
src/ui/templates/AppShell.js
src/ui/templates/ToolbarTemplate.js
src/ui/templates/PanelAnchors.js
```

The target is:

```html
<body>
  <div id="app"></div>
  <script type="module" src="./src/main.js"></script>
</body>
```

or a slightly more explicit shell with only stable anchors.

Rust helps by removing persistence/configuration/business concerns from the frontend, but CSS/HTML cleanup is its own migration stream.

## Target architecture

Long-term shape:

```text
Frontend JS / Three.js
  - rendering
  - panels
  - input
  - visual simulation playback
  - dashboard visualization

Rust Tauri backend
  - SQLite lifecycle
  - migrations
  - repositories
  - scenario validation
  - import/export
  - experiment runner
  - headless simulation services

SQLite
  - runs
  - save slots
  - snapshots
  - events
  - people
  - households
  - relationships
  - object definitions
  - interaction definitions
  - scenarios
```

## Migration streams

### Stream A — Tauri and SQLite hardening

Status: started.

Already done:

- minimal Tauri shell;
- `tauri-plugin-sql` registered;
- `SQLiteAdapter` implemented;
- async-safe save/load path;
- automatic SQLite enablement in Tauri runtime.

Next actions:

1. Run `npm install`.
2. Run `npm run tauri:dev`.
3. Fix any Tauri v2/plugin permission/version issues.
4. Confirm DB creation.
5. Confirm save/load through SQLite.
6. Confirm event append into `event_log`.
7. Add a simple DB diagnostics panel or console helper.

Acceptance criteria:

- browser mode still works with `LocalStorageAdapter`;
- Tauri mode starts without manual bootstrap;
- save slots persist in SQLite;
- `event_log` receives runtime events;
- no UI freeze during normal save/event append.

### Stream B — HTML/CSS decomposition

Status: not started.

Goal: reduce `index.html` to a small app shell.

Steps:

1. Move inline CSS into `src/styles/*.css`.
2. Import CSS from the entrypoint or link files from HTML.
3. Split modal/panel DOM anchors into a generated shell.
4. Keep stable IDs required by existing UI managers.
5. Remove duplicated styling and hardcoded inline styles where practical.

Acceptance criteria:

- `index.html` contains minimal structure only;
- no behavior changes;
- all existing panels still mount;
- browser and Tauri builds render identically.

### Stream C — Configuration extraction

Status: not started.

Goal: move hardcoded definitions out of runtime code.

Candidates:

- initial Sim definitions;
- trait mapping;
- starter careers;
- object catalog;
- autonomous shopping prices;
- interaction definitions;
- visitor archetypes;
- default scenarios.

Steps:

1. Create `src/config/` modules as the first intermediate step.
2. Replace hardcoded constants with imported config.
3. Persist/load definitions from SQLite later.
4. Add schema validation before definitions enter the simulation.

Acceptance criteria:

- no core system owns large static config blocks;
- definitions can be versioned;
- future scenario editor can reuse the same definitions.

### Stream D — Rust repositories and commands

Status: not started.

Goal: move persistence operations from frontend SQL calls into Rust commands.

Candidate commands:

```text
save_slot(slot, data)
read_slot(slot)
list_slots()
delete_slot(slot)
append_event(run_id, event)
save_snapshot(run_id, state)
load_snapshot(run_id, snapshot_id)
list_snapshots(run_id)
export_run(run_id, path)
import_run(path)
```

Why this matters:

- JavaScript should not know SQL details forever;
- Rust can enforce migrations and validation;
- Tauri permissions become narrower and safer;
- future non-SQL storage changes become easier.

Acceptance criteria:

- frontend calls backend commands, not SQL plugin directly;
- SQL schema is hidden behind Rust repositories;
- command payloads are typed and versioned;
- adapter remains useful as a frontend abstraction.

### Stream E — Event and analytics pipeline

Status: partially started.

Goal: make experiment analysis first-class.

Steps:

1. Normalize event payload fields.
2. Add typed event categories.
3. Store relationship snapshots periodically.
4. Add query helpers for dashboards.
5. Add export to CSV/JSON.
6. Add run comparison utilities.

Acceptance criteria:

- dashboards no longer need to scan only in-memory logs;
- long runs remain queryable;
- social/visitor/wellbeing metrics can be reconstructed from DB.

### Stream F — Headless simulation path

Status: future.

Goal: run experiments without UI.

This is complex and should not be started until the domain model is cleaner.

Steps:

1. Isolate pure simulation state from rendering objects.
2. Separate action planning from Three.js entities.
3. Define serializable simulation state structs.
4. Build a JS headless runner first.
5. Port stable parts to Rust only after behavior is understood.

Acceptance criteria:

- a simulation can run without DOM and without Three.js;
- results are persisted to SQLite;
- multiple seeds/scenarios can run in batch;
- CI can execute regression experiments.

## Proposed milestone plan

### Milestone 1 — Make current Tauri build actually run

Focus: zero architecture fantasy, just executable desktop app.

Tasks:

- install dependencies;
- run Tauri dev;
- fix plugin/version/capability errors;
- validate SQLite file creation;
- test save/load/delete/autosave;
- test event logging.

### Milestone 2 — Clean app shell

Focus: reduce `index.html` complexity.

Tasks:

- extract CSS;
- keep only stable DOM anchors;
- remove large inline style block;
- document UI anchor contract.

### Milestone 3 — Rust persistence boundary

Focus: stop exposing SQL directly to frontend.

Tasks:

- implement Rust commands;
- move SQL statements to Rust repositories;
- keep JS `PersistenceAdapter` but make it call Tauri commands;
- keep `LocalStorageAdapter` for browser.

### Milestone 4 — Config/scenario model

Focus: data-driven simulation definitions.

Tasks:

- extract JS config modules;
- define schema for object/interactions/scenarios;
- seed SQLite definition tables;
- load definitions through repository layer.

### Milestone 5 — Headless experiments

Focus: research platform.

Tasks:

- isolate simulation state;
- remove hidden DOM/window dependencies from core systems;
- add headless runner;
- persist batch run outputs;
- add comparison reports.

## Non-goals for now

Do not do these yet:

- rewrite the whole simulation in Rust;
- move Three.js rendering to Rust;
- build a custom UI framework;
- make SQLite the only persistence backend;
- remove the browser/static mode;
- over-normalize every runtime object into relational tables.

## Immediate next action

Run:

```bash
npm install
npm run tauri:dev
```

Then fix concrete build/runtime errors. After that, start Milestone 2: extract the giant inline CSS and simplify `index.html`.
