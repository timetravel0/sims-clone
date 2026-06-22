# Platform Roadmap

This document replaces the former *Rust Backend Roadmap*. The project no longer
targets a Rust/Tauri backend. It is a web app that runs in Chrome, with real
SQLite persistence achieved in the browser. This file records that decision and
the JavaScript-only roadmap that follows from it.

## Why Tauri/Rust was dropped

Tauri on macOS can only use the system WebView (WKWebView = WebKit). On the
target hardware (a 2015 Intel Iris 6100 Mac), WebKit's Metal-backed WebGL fails:
the WebGL context is lost immediately (`CONTEXT_LOST_WEBGL`), so the Three.js
scene never renders. Safari shows the same failure; Chrome works because it
ships its own GPU stack (ANGLE) with robust fallbacks.

Tauri exposes no option to use a Chromium engine on macOS, so the desktop shell
was a dead end for this machine. The Rust backend's goals (durable persistence,
queryable experiment data, reproducible/headless runs) are all reachable from
JavaScript at the current scope, so the Rust layer was removed rather than
worked around.

## Chosen runtime

- **Web app** served by Vite (`npm run dev`, port 1420).
- **Desktop-like launch**: `npm run app` → `scripts/launch.mjs` starts Vite and
  opens a chromeless Chrome `--app` window with a dedicated profile
  (`.chrome-app/`). It feels like a standalone app and uses the engine that
  renders correctly here.
- **No native shell, no Rust, no `src-tauri/`.**

## Persistence

Real SQLite in the browser, no native backend:

- **`SqlJsAdapter`** (`src/persistence/SqlJsAdapter.js`) — SQLite compiled to
  WebAssembly (`sql.js`), persisted to a single OPFS file `sims-clone.sqlite`.
  Slot saves flush immediately; the high-frequency `event_log` flushes throttled.
- **`LocalStorageAdapter`** — fallback for browsers without OPFS.

Both implement the same `PersistenceAdapter` contract, so `SaveLoad` and the
simulation are unaware of the backend. Details and the target schema live in
`docs/PERSISTENCE.md`.

## If a distributable desktop app is needed later

Wrap this same web app in **Electron**, which bundles its own Chromium — so
WebGL works regardless of the host's WebKit — and produces a signed `.app`/`.dmg`
independent of the user's installed Chrome. This is the only desktop-shell path
that keeps the 3D scene working on hardware where WebKit's WebGL is broken.

## Roadmap streams (JavaScript-only)

### Stream A — HTML/CSS decomposition

`index.html` is large because it mixes DOM anchors, inline CSS, modal layouts and
the app shell. Target: extract CSS into `src/styles/*.css`, keep only stable DOM
anchors in the HTML, and document the UI anchor contract. No behavior change; all
panels must still mount.

### Stream B — Configuration extraction

Move hardcoded definitions out of runtime code into `src/config/*`, then into
SQLite definition tables (`object_defs`, `interaction_defs`, `scenario_defs`):

- `SIM_DEFS`, trait mapping, starter careers;
- furniture/object catalog;
- `INTERACTIONS` catalogue;
- autonomous shopping prices;
- visitor archetypes and default scenario/population.

Goal: no core system owns large static config blocks; definitions become
versioned and reusable by a future scenario editor.

### Stream C — Event & analytics pipeline

Already partially in place: `event_log` is written through `SqlJsAdapter`.
Next: normalize event payload fields, store periodic relationship snapshots, add
query helpers for dashboards, and add CSV/JSON export and run comparison. Goal:
dashboards query the DB instead of scanning only in-memory logs, so long runs
stay analyzable.

### Stream D — Headless simulation (pure JS)

A research platform needs runs without rendering. Isolate pure simulation state
from Three.js entities and DOM/`window` dependencies, define serializable state,
and build a JS headless runner that persists batch outputs to SQLite. This
enables faster-than-real-time batch runs, multiple seeds/scenarios, and
CI-friendly regression tests on social dynamics. No Rust required.

## Non-goals

- Reintroducing Tauri or a Rust backend.
- Moving Three.js rendering or UI out of the frontend.
- Building a custom UI framework.
- Over-normalizing every runtime object into relational tables.
- Making SQLite the only backend (keep the `localStorage` fallback).
