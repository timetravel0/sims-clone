# Sims Clone — Technical Reference

Last updated: Sprint 3 — Life Cycle, Career, Schedule and LifeCyclePanel.

## Runtime Architecture

The project is a browser-only Three.js application using vanilla ES modules. There is no bundler or build step: `index.html` loads `src/main.js` through an import map.

`src/core/Game.js` is the composition root. It owns renderer, scene, world, camera, Sims, UI, save/load and all simulation systems:

**Existing systems (pre-Sprint 3)**
- `MemorySystem`
- `NarrativePlanner`
- `SocialManager`
- `RelationshipGraph`
- `RomanceSystem`
- `GodMode`
- `ExperimentLogger`
- `BuildMode`

**Added in Sprint 3**
- `AgeSystem` — tracks simulated age, fires life-stage transitions
- `CareerSystem` — shifts, salary, skill gain, promotions/firing
- `ScheduleSystem` — personality-driven weekly routine
- `LifeCyclePanel` — HTML overlay panel, owned by Game and updated each tick

Three.js is the view layer. The core simulation state lives in entities and systems.

## Main Folders

| Folder | Purpose |
|---|---|
| `src/core` | Game orchestration, loop, event bus and life-event bus |
| `src/world` | Grid, pathing context, doors, camera, build placement and reservations |
| `src/entities` | Sims, needs, mood, personality, emotions and furniture |
| `src/ai` | Utility planner, legacy need planner, action FSM, movement, object use and social actions |
| `src/systems` | Memory, narrative, social state, God Mode, object catalog, relationship graph, romance, experiment logging, **AgeSystem, CareerSystem, ScheduleSystem** |
| `src/ui` | Panels, context menu, needs, relations, graph, God Mode, build mode, story log, **LifeCyclePanel** |

## Simulation Loop

`GameLoop` provides fixed simulation updates and render callbacks.

```text
Game._update(dt)
  scaled = dt * clock.speed
  dayNight.update(scaled)
  sims.forEach(sim.update(scaled))
  memorySystem.update(scaled)
  experimentLogger.update(scaled)
  narrativePlanner.update(scaled)
  world.update(scaled)
  _lifecyclePanel.update(scaled)      ← Sprint 3
```

`_lifecyclePanel.update(scaled)` internally ticks `AgeSystem`, `CareerSystem` and `ScheduleSystem`, then calls `render()` if the panel is open.

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
| `lifecycle:stageChanged` | `AgeSystem` | Life stage transition ← Sprint 3 |
| `career:skillGain` | `CareerSystem` | Skill value increased ← Sprint 3 |

## Sim Model

Each `Sim` contains:

- grid/render position: `gx`, `gz`, `worldX`, `worldZ`
- `Personality`
- `SimNeeds`
- `SimEmotions`
- `Mood`
- `SimBrain`
- `_needMult` — life-stage decay multiplier, written by `AgeSystem` ← Sprint 3
- `_atWork` — boolean flag set by `CareerSystem` during shifts ← Sprint 3
- Three.js mesh

`Sim.update(dt)` advances movement, needs, emotions, mood, brain, speech bubbles and selection-ring color.

## Needs

Need values are clamped to `[0, 100]`. From Sprint 3, `SimNeeds` reads `sim._needMult` and multiplies every decay rate by that factor.

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

## Personality

`Personality` stores five normalized axes in `[-1, +1]`: `outgoing`, `neurotic`, `playful`, `nice`, `ambitious`.

Traits affect need decay, Utility AI scoring, social action type selection, social acceptance, mood penalties, God Mode whisper acceptance, romance compatibility and — from Sprint 3 — schedule slot generation and career scoring.

## Life Cycle Systems (Sprint 3)

### AgeSystem — `src/systems/AgeSystem.js`

```text
AgeSystem.update(dt)
  accumulate simulated seconds
  every 24 simulated hours: age++
  if age crosses stage threshold:
    update sim._needMult
    emit lifecycle:stageChanged
    append story:entry
```

Stage thresholds (default, in simulated days):

```js
{ baby: 0, child: 4, teen: 13, youngAdult: 18, adult: 30, elder: 60 }
```

`needMult` per stage: `baby 1.4 / child 1.3 / teen 1.2 / youngAdult 1.0 / adult 0.9 / elder 1.1`.

### CareerSystem — `src/systems/CareerSystem.js`

Career definitions are plain objects:
```js
{
  id: 'programmer',
  label: 'Programmer',
  skillReq: { logic: 2 },
  shifts: [{ day: 1, start: 9, end: 17 }, ...],  // day 0 = Mon
  salaryBase: 200,
  salaryPerLevel: 80
}
```

On each `update(dt)` call:
1. check if the current in-game weekday/hour falls in an active shift;
2. set `sim._atWork = true` and block `SimBrain.update()`;
3. on shift end: pay `salaryBase + level * salaryPerLevel`, raise `status` need, increment `daysWorked`;
4. every 5 `daysWorked`: promote (up to Lv.10);
5. listen for `life:event` `{ type: 'promoted' | 'fired' }` from God Mode.

Skill gain via object use:
```js
const SKILL_MAP = { bookshelf: 'logic', piano: 'creativity', treadmill: 'fitness', ... };
```
When a `UseObjectAction` completes, `CareerSystem` checks the map and increments the matching skill.

### ScheduleSystem — `src/systems/ScheduleSystem.js`

Generates a weekly schedule for each Sim on construction and regenerates when personality changes.

Slot structure:
```js
{ type: 'sleep' | 'eat' | 'fun' | 'social' | 'study' | 'work',
  days: [0,1,2,3,4],   // Mon–Fri = 0–4, Sat = 5, Sun = 6
  startHour: 23,
  endHour: 7 }
```

On `update(dt)`, the active slot is resolved and forwarded to `SimBrain`:
- object slots → `brain.suggestFurniture(targetType, priority)`;
- social slots → `brain.suggestSocial(priority)`.

The brain accepts suggestions only when idle or when the incoming priority exceeds the current action priority.

## LifeCyclePanel — `src/ui/LifeCyclePanel.js`

`LifeCyclePanel` mounts into `#lifecycle-panel` (created by `index.html`).

Public API used by `Game`:

```js
panel.update(dt)          // tick internal systems + conditional render
panel.render()            // force a full DOM re-render
panel.isOpen()            // true when #lifecycle-panel is visible
panel.serialise()         // returns plain object for save/load
panel.restore(state)      // restores AgeSystem + CareerSystem state
```

`render()` writes the following HTML into `#lifecycle-panel`:
- stage badge (`.lc-stage-badge` + `.lc-stage-dot` with inline colour);
- career row (`.lc-career-row`);
- work status (`.lc-at-work`);
- skills section (`.lc-skill-row` × 5);
- career dropdown (`#lc-career-select`) with inline requirement check;
- daily timeline (`.lc-timeline` with 24 `.lc-tick` divs, class reflecting slot type and current hour);
- timeline labels (`0h`, `6h`, `12h`, `18h`, `23h`).

CSS classes are defined in `index.html` under the `/* Life Cycle panel */` block.

## SimBrain additions (Sprint 3)

| Method | Signature | Purpose |
|---|---|---|
| `canInterrupt(priority)` | `(number) → boolean` | Returns true if the incoming priority beats the active action's priority |
| `suggestFurniture(type, priority)` | `(string, number) → void` | Schedule-driven object suggestion |
| `suggestSocial(priority)` | `(number) → void` | Schedule-driven social suggestion |

The `_atWork` guard is checked at the top of `SimBrain.update()`: if `true`, all autonomous planning is skipped.

## Toolbar Binding (Game._bindToolbar)

The `📋 Life` button added in Sprint 3:

```js
q('btn-lifecycle')?.addEventListener('click', () => {
  const opening = el.style.display === 'none' || el.style.display === '';
  el.style.display = opening ? 'block' : 'none';
  q('btn-lifecycle')?.classList.toggle('active', opening);
  if (opening) this._lifecyclePanel?.render();
});
```

When opening, `render()` is called immediately so the panel is never blank on first click.

`_selectSim()` also calls `this._lifecyclePanel?.render()` when the panel is open, keeping career/stage data in sync with the selected Sim.

## Utility AI and Smart Objects

The primary AI path is `src/ai/UtilityAIPlanner.js`.

When a Sim is idle, `SimBrain` asks the planner to:

1. collect nearby affordances from furniture and other Sims;
2. discard unavailable actions;
3. score each action against the Sim's missing needs and personality weights;
4. choose randomly among the top candidates;
5. enqueue concrete actions.

Furniture implements `getAffordancesFor(sim)` in `src/entities/Furniture.js`. Built-in affordances are declared in `src/systems/ObjectRegistry.js`.

Social affordances: `greet`, `chat`, `compliment`, `insult`.

`NeedDrivenPlanner` remains as a fallback for legacy critical-need routing.

## Actions

| Action | Responsibility |
|---|---|
| `WalkToAction` | Path to a valid, reserved destination cell |
| `UseObjectAction` | Exclusive use of a furniture object; applies affordance utility over time |
| `SocialAction` | Approach another Sim, request interaction, resolve acceptance/rejection |
| `IdleAction` | Short wait |

## Social Engine

`SocialManager` stores `{ score, familiarity, log }` per pair.
`RelationshipGraph` stores directed typed edges: friendship, rivalry, romance, kinship.
`RomanceSystem` adds romantic attraction and can trigger jealousy.

## Reservation and Collision Rules

`World` owns runtime exclusivity: one destination cell per Sim (`_cellReservations`), one intended user per object (`furniture.reservedBy`), one active user per object (`furniture.inUse`).

## Memory, Mood and Narrative

`MemorySystem` records episodic memories. Memories have type, valence, intensity, simulated time and event-specific data. They decay over time.

`SimEmotions` tracks secondary emotions with decay. Mood combines average needs, personality penalties and active emotion bonus.

`NarrativePlanner` converts significant state changes into `story:entry` items.

## God Mode

`GodMode` supports whisper, impose, bless, curse and life events.
`promoted` and `fired` life events are now intercepted by `CareerSystem` in addition to generating story entries.

## Experiment Logger

`src/systems/ExperimentLogger.js` records normalized rows with tick, simulated hour, event type and payload fields.

```js
game.experimentLogger.events
game.experimentLogger.toJSON()
game.experimentLogger.toCSV()
game.experimentLogger.downloadJSON()
game.experimentLogger.downloadCSV()
game.experimentLogger.clear()
```

## Save/Load

`Game.serialise()` stores:

- clock and day/night time;
- Sims;
- memories;
- scalar social state;
- relationship graph;
- romance state;
- experiment log;
- `lifecycle` — age, career level, skills, simoleons per Sim ← Sprint 3.

`Game.restore(state)` restores all the above and calls `_lifecyclePanel.restore(state.lifecycle)` to rebuild age/career state.
