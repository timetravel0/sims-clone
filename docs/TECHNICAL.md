# Sims Clone - Technical Reference

This document describes the current implementation state of the codebase. The runtime source of truth is `src/core/Game.js`: a module is considered active only if it is instantiated or called from the main game flow.

## Architecture

The project is a browser-based Three.js application using vanilla ES modules. There is no bundler step: `index.html` loads `src/main.js` through an import map.

The main composition root is `src/core/Game.js`. It creates the renderer, scene, world, camera, Sims, toolbar bindings, UI panels, persistence and simulation systems.

Three.js is used as the view layer. The simulation state lives in entities and systems, with shared communication through `src/core/EventBus.js`.

## Runtime Status

| Area | Status | Notes |
|---|---|---|
| Isometric rendering | Implemented | Three.js scene, camera, world grid and furniture rendering are active. |
| Sims and needs | Implemented | Sims have needs, personality, mood, emotions, brain and action queue. |
| Utility AI | Implemented | `UtilityAIPlanner` scores affordances from objects and other Sims. |
| Smart Objects | Implemented | Furniture advertises actions through `getAffordancesFor(sim)`. |
| Object exclusivity | Implemented | Furniture reservation and `inUse` state prevent concurrent use. |
| Anti-overlap movement | Implemented | Tile reservations and occupancy checks prevent Sims from sharing a destination or occupied path cell. |
| Social interactions | Implemented | Social actions include consent, acceptance/rejection payoff and event emission. |
| Relationship graph | Implemented | Directed typed edges for friendship, rivalry, romance and kinship/family are active. |
| Romance/jealousy | Implemented | Positive interactions and compatibility can create romance; jealousy can be triggered. |
| Episodic memory | Implemented | `MemorySystem` records social, need, mood, God Mode and life events. |
| Narrative log | Implemented | `NarrativePlanner` emits story entries for relevant events. |
| God Mode | Implemented | Whisper, impose, bless, curse and life-event injection are active. |
| Life cycle | Implemented | `AgeSystem` tracks age and life stage. |
| Career system | Implemented | `CareerSystem` tracks job, level, performance, salary, shifts, promotions and firing. |
| Schedule system | Partially implemented | `ScheduleSystem` tracks weekly routine slots; behavioral hooks are optional and not fully wired to the current Sim brain. |
| Skill system | Partially implemented | Global `SkillSystem` and career-local skills both exist; they are not yet unified. |
| Weather system | Implemented, limited UI | `WeatherSystem` updates weather state and need deltas; no dedicated weather panel is mounted. |
| Mood engine | Implemented | `MoodEngine` computes additional mood labels and effects. |
| Experiment logger | Implemented, console only | Structured data export exists from `window._game.experimentLogger`; no frontend panel is mounted. |
| Save/load | Partially implemented | Toolbar save/load works on the default slot; advanced slot UI exists but is not mounted. |
| Build mode | Implemented | Basic object placement is mounted. |
| Walls/rooms/budget build flow | Present, not active | `WallManager`, `RoomDetector`, `RoomOverlay`, `BudgetSystem`, `CataloguePanel` and `BuildModeWalls` exist but are not wired into `Game`. |
| Sim creator | Present, not active | `SimCreator` exists but is not mounted. |
| Headless research mode | Missing | The logic still depends on browser/runtime composition and has no CLI runner. |
| Family/household model | Missing | Kinship edge type exists, but no full family, household, birth/death or inheritance system exists. |

## Main Folders

| Folder | Responsibility |
|---|---|
| `src/core` | Game orchestration, loop, event bus, life-event bus and clock helpers. |
| `src/world` | World grid, pathing, doors, day/night cycle, build placement, walls and room utilities. |
| `src/entities` | Sims, furniture, needs, mood, personality and emotions. |
| `src/ai` | Utility AI, action FSM, walking, object usage and social actions. |
| `src/systems` | Social state, memories, narrative, God Mode, careers, aging, schedules, skills, weather, romance, persistence and logging. |
| `src/ui` | Runtime panels and additional UI components, some mounted and some currently dormant. |

## Runtime Loop

`GameLoop` drives fixed simulation updates and render callbacks. `Game._update(dt)` currently performs:

```text
scaled = dt * clock.speed
dayNight.update(scaled)
clock.hour = dayNight.time * 24
clock.weekday = floor(dayNight.totalDays) % 7
sims.forEach(sim.update(scaled))
memorySystem.update(scaled)
experimentLogger.update(scaled)
narrativePlanner.update(scaled)
world.update(scaled)
ageSystem.update(scaled)
careerSystem.update(scaled)
scheduleSystem.update(scaled)
weatherSystem.update(scaled)
weather need effects are applied
moodEngine computes labels
skillSystem.update(scaled)
emoteRenderer.update(scaled)
```

The toolbar supports pause plus `1x`, `2x` and `5x` simulation speed.

## Active UI

The main runtime mounts or binds these frontend surfaces:

| UI | Entry point | Status |
|---|---|---|
| Needs/status panels | `UIManager` | Active. |
| Sim selector | `UIManager` | Active. |
| Story log | `UIManager` / toolbar | Active. |
| Relations panel | `UIManager` / toolbar | Active. |
| Graph panel | `GraphPanel` / toolbar | Active. |
| God panel | `GodPanel` / toolbar | Active. |
| Build panel | `BuildMode` / toolbar | Active. |
| Life panel | `LifeCyclePanel` / toolbar | Active; shows age, life stage, career and schedule. |
| Basic save/load | toolbar | Active for default save/load flow. |
| Skill panel | `SkillPanel` | Instantiated only if `#skill-panel` exists; the current `index.html` does not expose a toolbar button or anchor. |

Additional UI classes exist but are not mounted in `Game`: `CareerPanel`, `SaveSlotPanel`, `RelationshipGraphUI`, `RoomOverlay`, `SimCreator`, `CataloguePanel`, `BuildModeToolbar`, `NeighborhoodMap` and `LifePanel`.

## Sims

Each `Sim` contains:

- grid and world position;
- Three.js mesh and visual state;
- `Personality`;
- `SimNeeds`;
- `SimEmotions`;
- `Mood`;
- `SimBrain`;
- `ActionQueue`.

The active need set includes:

- `hunger`;
- `energy`;
- `bladder`;
- `hygiene`;
- `social`;
- `fun`;
- `comfort`;
- `room`;
- `autonomy`;
- `status`.

Personality traits are normalized values and influence decay, planning, social behavior, romance and God Mode acceptance:

- `outgoing`;
- `neurotic`;
- `playful`;
- `nice`;
- `ambitious`.

## Utility AI and Smart Objects

The primary decision system is `src/ai/UtilityAIPlanner.js`.

When a Sim is idle, the planner:

1. collects nearby affordances from furniture and other Sims;
2. filters unavailable actions;
3. scores each action using missing needs, advertised utility, distance and personality weights;
4. chooses among high-scoring candidates;
5. enqueues concrete actions.

Furniture affordances are declared by object definitions in `src/systems/ObjectRegistry.js` and exposed by `src/entities/Furniture.js`.

Other Sims also broadcast social affordances such as greeting, chatting, complimenting and insulting.

`NeedDrivenPlanner` remains as legacy fallback behavior for critical need routing.

## Actions and Reservations

The active action FSM is `ActionQueue`.

| Action | Responsibility |
|---|---|
| `WalkToAction` | Moves a Sim through the grid while respecting occupied and reserved cells. |
| `UseObjectAction` | Reserves and uses a furniture object exclusively, applies affordance utility and emits object-use events. |
| `SocialAction` | Moves near a target Sim, requests interaction consent and resolves success or rejection. |
| `IdleAction` | Waits briefly. |

World-level rules currently enforced:

- one reserved destination cell per Sim;
- no movement into occupied or reserved path cells;
- no placement on occupied or reserved build cells;
- one reserved user per furniture object;
- one active user per furniture object.

## Social Engine

There are two active relationship layers:

| Layer | File | Role |
|---|---|---|
| Scalar social state | `src/systems/SocialManager.js` | Pair score, familiarity and interaction log. |
| Directed social graph | `src/systems/RelationshipGraph.js` | Typed directional edges for friendship, rivalry, romance and family/kinship. |

`SocialAction` resolves interaction consent from target energy, relationship score, familiarity and personality. Accepted interactions apply mutual payoffs. Rejections penalize the initiator, restore target autonomy and update relationship state.

`RomanceSystem` derives attraction from compatibility and repeated positive interactions. It also listens for third-party positive interactions that can trigger jealousy.

## Memory, Emotions and Narrative

`MemorySystem` records episodic memories with type, valence, intensity, simulated time and event payload. It listens to social events, need crises, mood peaks, life events and God Mode actions.

`SimEmotions` tracks secondary emotions with decay. Active emotions influence mood and visible state.

`NarrativePlanner` turns important simulation events into human-readable `story:entry` items.

## Life, Career and Schedule

`AgeSystem` is active and assigns each Sim a life stage from simulated age:

- baby;
- child;
- teen;
- youngAdult;
- adult;
- elder.

`CareerSystem` is active and supports:

- unemployed state;
- career assignment;
- levels;
- performance;
- days worked;
- salary;
- shift start/end;
- promotion;
- firing;
- career-specific skill requirements;
- life events for promotion/firing;
- save/load serialization.

Current careers include artist, scientist, chef, programmer and athlete.

`ScheduleSystem` is active as a weekly routine tracker. It computes current routine slots such as sleep, meals, work, study, fun and social time. Its direct behavior integration is partial because it calls optional Sim brain hooks that are not fully implemented in the active `SimBrain`.

## Skills

There are currently two skill models:

| Model | File | Status |
|---|---|---|
| Global skills | `src/systems/SkillSystem.js` | Registered for each Sim and updated over time; social actions can increase charisma. |
| Career-local skills | `src/systems/CareerSystem.js` | Used for career requirements and progression; object-use events can increase relevant career skills. |

This duplication is intentional for now but should be unified. A single skill source should feed mood, UI, career requirements and experiment exports.

The `SkillPanel` component exists, but the current HTML does not provide the required `#skill-panel` anchor or `#btn-skills` toolbar button, so skills are not reliably available from the frontend.

## Weather and Mood

`WeatherSystem` is active. It changes weather state, can affect lighting and applies need deltas to Sims.

`MoodEngine` is active and computes additional mood labels from needs, weather, room and skill context. The older `Mood` entity still exists, so mood behavior is split between entity-local mood and system-level mood labels.

No dedicated weather panel is mounted.

## God Mode

`GodMode` is active and supports:

- whisper: suggest an action that can be refused;
- impose: force an action with autonomy/mood cost;
- bless: raise a trait;
- curse: lower a trait;
- life event: inject promoted, fired, heartbreak or windfall.

God actions emit events, create memories/emotions and are included in persistence through the simulation state.

## Experiment Logger

`src/systems/ExperimentLogger.js` is active and records normalized event rows for research use.

Console access:

```js
window._game.experimentLogger.events
window._game.experimentLogger.toJSON()
window._game.experimentLogger.toCSV()
window._game.experimentLogger.downloadJSON()
window._game.experimentLogger.downloadCSV()
window._game.experimentLogger.clear()
```

There is no mounted UI panel for logger inspection or export.

## Save and Load

`SaveLoad` is active through the toolbar's save/load buttons. The current toolbar path saves and loads the default slot.

Persisted areas include:

- Sims;
- needs, mood, emotions and personality;
- social state;
- relationship graph;
- romance state;
- memories;
- experiment log;
- age state;
- career state;
- weather state;
- skill state.

Important caveat: `SaveLoad` already contains optional fields for budget, game clock, walls and rooms, but `Game` does not instantiate `budgetSystem`, `gameClock`, `wallManager` or `roomDetector`. Those fields remain empty unless the corresponding systems are wired into the main runtime.

`SaveSlotPanel` exists but is not mounted.

## Present But Not Active

These modules are present in source but are not currently part of the main playable runtime:

| Module | Intended role | Missing integration |
|---|---|---|
| `src/core/GameClock.js` | Richer calendar/clock model | `Game` still uses its own simple `clock` plus `DayNightCycle`. |
| `src/systems/BudgetSystem.js` | Household funds | Not attached to `Game`; only used by dormant build UI classes. |
| `src/world/WallManager.js` | Wall/door edge model | Not instantiated. |
| `src/world/BuildModeWalls.js` | Wall/door placement tool | Not mounted. |
| `src/world/RoomDetector.js` | Enclosed-room detection | Not instantiated. |
| `src/ui/RoomOverlay.js` | Room visualization | Not mounted. |
| `src/ui/CataloguePanel.js` | Advanced build catalogue | Not mounted. |
| `src/ui/BuildModeToolbar.js` | Budget/weather-aware build toolbar | Not mounted. |
| `src/ui/SaveSlotPanel.js` | Multi-slot save UI | Not mounted. |
| `src/ui/CareerPanel.js` | Dedicated career UI | Superseded in practice by `LifeCyclePanel`; not mounted. |
| `src/ui/SimCreator.js` | Runtime Sim creation | Not mounted. |
| `src/ui/NeighborhoodMap.js` | Map/neighborhood UI | Not mounted. |
| `src/systems/SoundSystem.js` | UI and event sounds | Not instantiated. |
| `src/systems/DramaEngine.js` | Additional drama generation | Not instantiated. |
| `src/systems/LifeCycle.js` | Alternative life-cycle model | Not used by `Game`; `AgeSystem` is active instead. |
| `src/systems/SimCalendar.js` | Calendar events | Not wired into the active clock/schedule loop. |

## Missing Work

The main missing or incomplete technical work is:

- unified skill model shared by career, mood, UI and logs;
- full schedule-to-action integration in the active `SimBrain`;
- frontend access for skills, weather, memories, experiment logger, multi-slot saves and Sim creation;
- full budget/build economy in the mounted build mode;
- wall placement, doors as build objects, room detection and room mood bonuses in runtime;
- family/household simulation beyond graph edge types;
- true headless mode for fast-forward experiments;
- deterministic seeded experiments;
- automated tests for AI planning, collision/reservation, social graph, careers, save/load and schedule behavior.
