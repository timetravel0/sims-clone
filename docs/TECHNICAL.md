# Sims Clone - Technical Reference

This document describes the current implementation state of the codebase. The runtime source of truth is `src/core/Game.js`: a module is considered active only if it is instantiated or called from the main game flow.

## Architecture

The project is a browser-based Three.js application using vanilla ES modules. There is no bundler step: `index.html` loads `src/main.js` through an import map.

`src/core/Game.js` is the composition root. It creates the renderer, scene, world, camera, Sims, UI panels, persistence, social systems, population/visitor systems and the simulation loop. Three.js remains the view layer; simulation state lives in entities and systems, with shared communication through `src/core/EventBus.js`.

## Runtime Status

| Area | Status | Notes |
|---|---|---|
| Isometric rendering | Implemented | Three.js scene, camera, world grid and furniture rendering are active. |
| Sims and needs | Implemented | Sims have needs, personality, mood, emotions, brain and action queue. |
| Utility AI | Implemented | `UtilityAIPlanner` scores affordances from objects and from the `SocialDynamicsSystem.INTERACTIONS` catalogue. |
| Smart Objects | Implemented | Furniture advertises actions through `getAffordancesFor(sim)`. |
| Object exclusivity | Implemented | Furniture reservation and `inUse` state prevent concurrent use. |
| Anti-overlap movement | Implemented | Tile reservations and occupancy checks prevent Sims from sharing a destination or occupied path cell. |
| Social interactions | Implemented | Social actions include context, consent, acceptance/rejection payoff and event emission. |
| Social Dynamics 2.0 | Implemented | Directional 8-dimension relationships drive social affordances and dashboard explanations. |
| Population model | Implemented | `PopulationSystem` separates household, active Sims, active visitors and off-lot people. |
| Visitor lifecycle | Implemented | `VisitorSystem` schedules external visitors, doorbell, accept/reject/no-answer, visiting and return-home flow. |
| Off-lot simulation | Implemented, lightweight | External people change off-lot state, drift relationships and can generate visit intent. |
| Relationship graph | Implemented | Directed typed edges for friendship, rivalry, romance and kinship/family are active. |
| Romance/jealousy | Implemented | Positive interactions and compatibility can create romance; jealousy can be triggered. |
| Episodic memory | Implemented | Global memory and per-Sim autobiographical memory both exist and are persisted. |
| Narrative log | Implemented | `NarrativePlanner` emits story entries for relevant events. |
| God Mode | Implemented | Whisper, impose, bless, curse and life-event injection are active. |
| Life cycle | Implemented | `AgeSystem` tracks age and life stage. |
| Career system | Implemented | `CareerSystem` tracks job, level, performance, salary, shifts, promotions and firing. |
| Schedule system | Partially implemented | `ScheduleSystem` tracks weekly routine slots; behavior integration is still partial. |
| Skill system | Partially implemented | Global `SkillSystem` and career-local skills both exist; they are not yet unified. |
| Weather system | Implemented, limited UI | `WeatherSystem` updates weather state and need deltas; no dedicated weather panel is mounted. |
| Mood engine | Implemented | `MoodEngine` computes additional mood labels and effects. |
| Experiment logger | Implemented | Logs social, visitor and off-lot events; CSV/JSON export and dashboard views are active. |
| Persistence adapter | Implemented | `SaveLoad` uses `LocalStorageAdapter` by default; SQLite is stubbed/documented for a future backend. |
| Save/load | Implemented | Multi-slot panel is mounted; full game state is persisted through `Game.serialise()`. |
| Build mode | Implemented | Furniture, wall/door tools, room overlay and budget are wired into runtime. |
| Sim creator | Implemented | Mounted at startup when no save is selected. |
| Headless research mode | Missing | The logic still depends on browser/runtime composition and has no CLI runner. |
| Family model | Partial | Household membership exists; deeper family, birth/death and inheritance rules are not implemented. |

## Main Folders

| Folder | Responsibility |
|---|---|
| `src/core` | Game orchestration, loop, event bus, life-event bus and clock helpers. |
| `src/world` | World grid, pathing, doors, day/night cycle, build placement, walls and room utilities. |
| `src/entities` | Sims, furniture, needs, mood, personality and emotions. |
| `src/ai` | Utility AI, action FSM, walking, object usage, visitor actions and social actions. |
| `src/systems` | Social state, population, visitors, memories, narrative, God Mode, careers, aging, schedules, skills, weather, romance, persistence and logging. |
| `src/ui` | Runtime panels and dashboards. |
| `src/styles` | Extracted CSS, one file per concern (see "Frontend shell"). |
| `src/persistence` | Storage adapter abstraction, sql.js/OPFS backend and localStorage fallback. |

## Runtime Loop

`GameLoop` drives fixed simulation updates and render callbacks. `Game._update(dt)` currently performs:

```text
scaled = dt * clock.speed
dayNight.update(scaled)
clock.hour / day / weekday update
visible non-work Sims update
memorySystem.update(scaled)
experimentLogger.update(scaled)
narrativePlanner.update(scaled)
world.update(scaled)
ageSystem.update(scaled)
careerSystem.update(scaled)
scheduleSystem.update(scaled)
partySystem.update(scaled)
socialDynamics.update(scaled)
offLotSimulation.update(scaled)
visitorSystem.update(scaled)
weatherSystem.update(scaled)
weather/room need effects are applied
moodEngine computes labels
skillSystem.update(scaled / 86400)
emoteRenderer.update(scaled)
```

The toolbar supports pause plus `1x`, `2x` and `5x` simulation speed.

## Active UI

| UI | Entry point | Status |
|---|---|---|
| Needs/status panels | `UIManager` | Active. |
| Sim selector | `UIManager` | Active. |
| Story log | `UIManager` / toolbar | Active. |
| Relations panel | `UIManager` / toolbar | Active. |
| Graph panel | `GraphPanel` / toolbar | Active. |
| God panel | `GodPanel` / toolbar | Active. |
| Build panel | `BuildMode` + `BuildModeWalls` / toolbar | Active. |
| Room overlay | `RoomOverlay` / toolbar | Active. |
| Life panel | `LifeCyclePanel` / toolbar | Active; shows age, life stage, career and schedule. |
| Skill panel | `SkillPanel` / toolbar | Active. |
| Save slots | `SaveSlotPanel` / toolbar | Active. |
| Sim creator | `SimCreator` | Active in startup flow. |
| Experiment dashboard | `dashboard.html` via 🧪 Lab | Active; opens separate window and falls back to inline panel. |

## Frontend shell

`index.html` is a minimal shell: stable DOM anchors, the stylesheet links, the
Three.js import map, and `main.js`. It contains no inline CSS. Styles live in
`src/styles/`, one file per concern, linked in this order:

| File | Covers |
|---|---|
| `base.css` | Reset, document/body, `#canvas-container`, speech bubbles, hint, drama/lifecycle toasts. |
| `toolbar.css` | `#toolbar` and `#clock`. |
| `panels.css` | Needs, sim portraits, story log, relations, build catalogue, god, graph, lifecycle, skill, save-slot modal. |
| `build-mode.css` | `#build-tools`, `#bt-funds`, `#room-overlay`. |
| `sim-creator.css` | `#sim-creator` onboarding modal. |
| `start-menu.css` | `#start-menu` launch screen. |
| `dashboard.css` | `#experiment-panel` inline dashboard. |

**UI anchor contract.** UI managers attach to these stable IDs (do not rename
without updating the corresponding manager): `#canvas-container`, `#sim-selector`,
`#bubbles`, `#drama-toast`, `#lifecycle-toast`, `#needs-panel` (+ `#sim-name`,
`#sim-mood`, `#sim-traits`, `#sim-status`, `#sim-missing`, `#needs-bars`),
`#story-panel`/`#story-log`/`#btn-story-close`, `#rel-panel`, `#god-panel`,
`#graph-panel`, `#skill-panel`, `#save-slot-panel`, `#sim-creator`, `#start-menu`,
`#experiment-panel`, `#build-panel`/`#build-tools`/`#build-catalog`,
`#room-overlay`, `#hint`, `#toolbar` (+ the `#btn-*` buttons), `#clock`.

## Social Simulation Core 2.0

There are three active social layers:

| Layer | File | Role |
|---|---|---|
| Scalar score/familiarity | `src/systems/SocialManager.js` | Legacy pair score and familiarity. |
| Typed directed edges | `src/systems/RelationshipGraph.js` | Friendship, rivalry, romance and kinship. |
| Directional dimensions | `src/systems/SocialDynamicsSystem.js` | High-resolution 8-dimension relationship model. |

`SocialDynamicsSystem` stores directional relations `from → to` with these dimensions: `trust, affection, respect, attraction, resentment, fear, familiarity, dependency`.

The exported `INTERACTIONS` catalogue is the single source of truth for social acts. `UtilityAIPlanner` now generates social affordances from this catalogue, filtering by cooldown, requirements, energy and target presence. `SocialAction` applies SocialDynamics effects before logging `relationshipAfter`, then emits `socialDynamicsApplied: true` so the listener does not double-apply the same interaction.

Interaction cooldowns are serialised with the relationship dimensions. This preserves short-term anti-spam state across save/load and avoids unrealistic repeated apologies, confrontations or flirting immediately after loading.

## Population, Visitors and Off-lot People

`PopulationSystem` separates persistent people from active rendered Sims:

```text
Population    = every person that exists
Household     = people who live in the current home
Active Sims   = people currently instantiated/rendered in game.sims
Visitors      = external people temporarily active on the lot
Off-lot       = external people that exist but are not rendered
```

A person activated as a visitor becomes a real `Sim`; when they leave, `PopulationSystem.deactivatePerson()` removes the mesh and active Sim but keeps the person record, relationships and memories keyed by the persistent id.

`Sim` now protects identity consistency: if an id is adopted after construction, the Sim brain is rebuilt so per-Sim systems such as memory, experience bias and goals bind to the correct persistent id rather than a temporary `sim_*` id.

`VisitorSystem` manages this lifecycle:

```text
off_lot → arriving → ringing_doorbell → waiting_response
→ invited_in | rejected | no_answer
→ visiting → leaving → returned_home
```

Visitor decisions consider relationship affinity, trust, affection, resentment, fear, hour, host energy, personality and visit reason. Door/entry points are semantically tied to doors, but because the current map has no real outside strip, visitors spawn and navigate via the nearest walkable porch/inside point and return home virtually after leaving.

`OffLotSimulationSystem` updates external people periodically, changing `offLotState`, applying lightweight relationship drift and emitting `offlot:visitIntent` events that can schedule visits.

## Persistence

`SaveLoad` delegates storage to a `PersistenceAdapter`. The default backend is `src/persistence/SqlJsAdapter.js` — real SQLite compiled to WebAssembly (sql.js), persisted to an OPFS file. Where OPFS is unavailable it falls back to `src/persistence/LocalStorageAdapter.js`, the only backend that touches `localStorage`. See `docs/PERSISTENCE.md`.

`Game.serialise()` persists:

- clock/day-night state;
- household Sims and their brain state;
- furniture;
- global memories;
- legacy social state;
- relationship graph;
- SocialDynamics dimensions and cooldowns;
- population;
- visitor history/state;
- off-lot simulation state;
- romance;
- experiment log;
- age/career/weather/skills;
- budget and walls.

`ExperimentLogger` keeps the in-memory log and also performs a best-effort append to the active persistence adapter when available. With `LocalStorageAdapter` this creates an append-style browser event log; a future SQLite adapter can map the same calls to `event_log` and `visitor_events`.

## Experiment Logger and Dashboard

`ExperimentLogger` records normalized rows for:

- `social:interaction`;
- `visitor:*` lifecycle events;
- `offlot:*` events;
- mood, emotion, life, God, relationship, need and action events.

Useful helpers:

```js
window._game.experimentLogger.summaryBySim()
window._game.experimentLogger.summaryByPair()
window._game.experimentLogger.relationshipTimeline([a, b])
window._game.experimentLogger.summaryByVisitor()
window._game.experimentLogger.summaryByVisitReason()
window._game.experimentLogger.externalSocialityMetrics()
window._game.experimentLogger.downloadCSV()
window._game.experimentLogger.downloadJSON()
```

The 🧪 Lab button opens `dashboard.html`, which displays overview metrics, Sims, Visitors, Relationships and Events. Relationship views include household and off-lot people when they exist in `PopulationSystem`.

## How to run a social experiment manually

Open the browser console; the game is exposed as `window._game`:

```js
const g = window._game;

// Inspect directional relationship state
g.socialDynamics.explainRelation(g.sims[0].id, g.sims[1].id);
g.socialDynamics.get(g.sims[0].id, g.sims[1].id);

// Inspect population and visitors
g.population.allPeople();
g.population.householdMembers();
g.population.offLotPeople();
g.population.activeVisitors();
g.visitorSystem.activeVisits();
g.visitorSystem.history();

// Schedule a visit from the first off-lot person
const visitor = g.population.offLotPeople()[0];
g.visitorSystem.scheduleVisit(visitor.id, g.sims[0].id, 'spontaneous_neighbor');

// Aggregate and export
g.experimentLogger.externalSocialityMetrics();
g.experimentLogger.downloadCSV();
g.experimentLogger.downloadJSON();
```

Tip: save to a manual slot, run an intervention, then load to compare. `socialDynamics`, population, visitor history, brain memory and goals are preserved.

## Missing Work

The main missing or incomplete technical work is:

- true outside/neighborhood map instead of virtual outside entry points;
- richer off-lot causality and scheduled invitations;
- reputation and gossip propagation beyond one-off relationship drift;
- unified skill model shared by career, mood, UI and logs;
- full schedule-to-action integration in the active `SimBrain`;
- dedicated weather and memory inspection UI;
- family simulation beyond household membership and graph edge types;
- true headless mode for fast-forward experiments;
- deterministic seeded experiments;
- automated tests for identity, visitor lifecycle, AI planning, collision/reservation, social graph, careers, save/load and schedule behavior.
