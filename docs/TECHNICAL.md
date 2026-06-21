# Sims Clone - Technical Reference

Last updated: implementation through Sprint 4 plus Utility AI, Smart Objects and experiment logging.

## Runtime Architecture

The project is a browser-only Three.js application using vanilla ES modules. There is no bundler or build step: `index.html` loads `src/main.js` through an import map.

`src/core/Game.js` is the composition root. It owns renderer, scene, world, camera, Sims, UI, save/load and the simulation systems:

- `MemorySystem`
- `NarrativePlanner`
- `SocialManager`
- `RelationshipGraph`
- `RomanceSystem`
- `GodMode`
- `ExperimentLogger`
- `BuildMode`

Three.js is the view layer. The core simulation state lives in entities and systems: Sims, needs, mood, emotions, relationships, object reservations and event logs.

## Main Folders

| Folder | Purpose |
|---|---|
| `src/core` | Game orchestration, loop, event bus and life-event bus |
| `src/world` | Grid, pathing context, doors, camera, build placement and reservations |
| `src/entities` | Sims, needs, mood, personality, emotions and furniture |
| `src/ai` | Utility planner, legacy need planner, action FSM, movement, object use and social actions |
| `src/systems` | Memory, narrative, social state, God Mode, object catalog, relationship graph, romance and experiment logging |
| `src/ui` | Panels, context menu, needs, relations, graph, God Mode, build mode and story log |

## Simulation Loop

`GameLoop` provides fixed simulation updates and render callbacks:

```text
Game._update(dt)
  scaled = dt * clock.speed
  dayNight.update(scaled)
  sims.forEach(sim.update(scaled))
  memorySystem.update(scaled)
  experimentLogger.update(scaled)
  narrativePlanner.update(scaled)
  world.update(scaled)
```

`clock.speed` supports `1x`, `2x` and `5x`. `clock.paused` stops simulation updates while rendering remains active.

## Event Bus

`src/core/EventBus.js` is the shared pub/sub channel.

| Event | Producer | Notes |
|---|---|---|
| `sim:selected` | `Game` | Selected Sim changed |
| `simNeeds:update` | `SimNeeds` | Full needs vector for one Sim |
| `sim:moodChanged` | `Mood` | Mood tier/score changed |
| `sim:action` | `ActionQueue` | Current action label |
| `social:update` | `SocialManager` | Pair score/familiarity changed |
| `social:interaction` | `SocialAction` | Attempt result: success or rejection |
| `emotion:triggered` | `SimEmotions` | Secondary emotion appeared |
| `memory:recorded` | `MemorySystem` | Episodic memory stored |
| `need:crisis` | `MemorySystem` bridge | Need dropped into crisis range |
| `life:event` | `LifeEventBus` / `GodMode` | Injected narrative event |
| `god:action` | `GodMode` | Whisper/impose/bless/curse/life event |
| `relationship:graphChanged` | `RelationshipGraph` | Directed edge changed |
| `relationship:romance` | systems | Adds romance weight |
| `relationship:rivalry` | systems | Adds rivalry weight |
| `daynight:update` | `DayNightCycle` | Clock UI update |
| `story:entry` | systems | Human-readable story log entry |

`ExperimentLogger` subscribes to the research-relevant events and stores normalized rows for JSON/CSV export.

## Sim Model

Each `Sim` contains:

- grid/render position: `gx`, `gz`, `worldX`, `worldZ`
- `Personality`
- `SimNeeds`
- `SimEmotions`
- `Mood`
- `SimBrain`
- Three.js mesh

`Sim.update(dt)` advances movement, needs, emotions, mood, brain, speech bubbles and selection-ring color.

## Needs

Need values are clamped to `[0, 100]`.

| Need | Meaning |
|---|---|
| `hunger` | Food drive |
| `energy` | Sleep/rest drive |
| `bladder` | Toilet drive |
| `hygiene` | Cleanliness drive |
| `social` | Affiliation drive |
| `fun` | Play/recreation drive |
| `comfort` | Physical comfort drive |
| `room` | Environment satisfaction |
| `autonomy` | Agency/self-directed activity drive |
| `status` | Approval/prestige drive |

Personality modifies decay. Outgoing Sims lose `social` faster, playful Sims protect `fun`, nice Sims protect `status`, neurotic Sims are more fragile under social/autonomy pressure, and ambitious Sims decay many needs more slowly while suffering stronger low-need mood penalties.

## Personality

`Personality` stores five normalized axes in `[-1, +1]`:

- `outgoing`
- `neurotic`
- `playful`
- `nice`
- `ambitious`

Traits affect need decay, Utility AI scoring, social action type selection, social acceptance, mood penalties, God Mode whisper acceptance and romance compatibility.

## Utility AI and Smart Objects

The primary AI path is `src/ai/UtilityAIPlanner.js`.

When a Sim is idle, `SimBrain` asks the planner to:

1. collect nearby affordances from furniture and other Sims;
2. discard unavailable actions;
3. score each action against the Sim's missing needs and personality weights;
4. choose randomly among the top candidates;
5. enqueue concrete actions.

Furniture implements `getAffordancesFor(sim)` in `src/entities/Furniture.js`. Built-in affordances are declared in `src/systems/ObjectRegistry.js`, for example:

```js
{ verb: 'read', utility: { autonomy: 25, fun: 12, status: 4 }, duration: 6 }
```

Other Sims also broadcast social affordances:

- `greet`
- `chat`
- `compliment`
- `insult`

Social affordances use relationship `score` and `familiarity` as requirements and scoring context.

`NeedDrivenPlanner` remains as a fallback for legacy critical-need routing.

## Actions

| Action | Responsibility |
|---|---|
| `WalkToAction` | Path to a valid, reserved destination cell |
| `UseObjectAction` | Exclusive use of a furniture object; applies affordance utility over time |
| `SocialAction` | Approach another Sim, request interaction, resolve acceptance/rejection and emit social events |
| `IdleAction` | Short wait |

`ActionQueue` is a FIFO FSM. It emits `sim:action` when actions begin and releases resources on `clear()`/`exit()`.

## Social Engine

There are two relationship layers:

- `SocialManager`: pair-level scalar relationship state.
- `RelationshipGraph`: directed typed social edges.

`SocialManager` stores:

```js
{ score: -100..100, familiarity: 0..100, log: [] }
```

Positive and negative interactions change score. Every interaction also increases familiarity. Rejections use `applyOutcome()`.

`SocialAction` now resolves interaction consent:

1. initiator walks near target;
2. target evaluates acceptance from energy, affinity, familiarity and personality;
3. success applies advertised utility/payoff and emits `social:interaction` with `accepted: true`;
4. rejection lowers initiator status/social, restores target autonomy, updates relationship state and emits `accepted: false`.

The directed graph converts observed interactions into typed edges:

- friendship;
- rivalry;
- romance;
- kinship/family.

`RomanceSystem` adds romantic attraction from compatible personalities and repeated positive interactions. It can trigger jealousy when a romantic attachment observes a positive interaction with a third Sim.

## Reservation and Collision Rules

`World` owns runtime exclusivity:

- `_cellReservations`: one destination cell per Sim.
- `furniture.reservedBy`: one intended user per object.
- `furniture.inUse`: object currently in use.

Rules enforced by planners/actions/build mode:

- Sims cannot reserve the same destination tile.
- Sims wait before entering an occupied or reserved path tile.
- Sims cannot stand on top of each other.
- Furniture cannot be used by two Sims at once.
- Build Mode rejects occupied or reserved cells.

## Memory, Mood and Narrative

`MemorySystem` records episodic memories from social events, need crises, mood peaks, life events and God Mode actions. Memories have type, valence, intensity, simulated time and event-specific data. They decay over time and bias future planning.

`SimEmotions` tracks secondary emotions with decay. Mood combines average needs, personality penalties and active emotion bonus.

`NarrativePlanner` converts significant state changes into `story:entry` items for the Story Log.

## God Mode

`GodMode` supports:

- `whisper`: suggest an action; the Sim may refuse;
- `impose`: force an action with autonomy/mood cost;
- `bless`;
- `curse`;
- `life event`: promoted, fired, heartbreak, windfall.

God actions emit events, create memories/emotions and participate in save/load.

## Experiment Logger

`src/systems/ExperimentLogger.js` provides a research data stream.

It records normalized rows with:

- `tick`
- simulated hour
- event type
- event payload fields

Available methods:

```js
game.experimentLogger.events
game.experimentLogger.toJSON()
game.experimentLogger.toCSV()
game.experimentLogger.downloadJSON()
game.experimentLogger.downloadCSV()
game.experimentLogger.clear()
```

The logger state is persisted in save/load as `experimentLog`.

## Save/Load

`Game.serialise()` stores:

- clock and day/night time;
- Sims;
- memories;
- scalar social state;
- relationship graph;
- romance state;
- experiment log.

`Game.restore(state)` restores these systems and re-emits selection state for UI synchronization.
