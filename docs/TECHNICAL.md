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
| Utility AI | Implemented | `SimBrain` preempts critical physical needs before Utility AI; `UtilityAIPlanner` scores object/social affordances and suppresses non-essential actions under hunger/bladder/energy crisis. |
| Smart Objects | Implemented | Furniture advertises actions through `getAffordancesFor(sim)`. |
| Object exclusivity | Implemented | Furniture reservation and `inUse` state prevent concurrent use. |
| Anti-overlap movement | Implemented | Tile reservations and occupancy checks prevent Sims from sharing a destination or occupied path cell; blocked walks reroute briefly and time out instead of freezing. Head-on deadlocks are broken by phase-through: a Sim blocked by another Sim's *body* for >0.6 s steps into the cell anyway (brief overlap), so two Sims meeting head-on swap cells instead of looping. |
| Social interactions | Implemented | Social actions include context, consent, acceptance/rejection payoff and event emission. |
| Social Dynamics 2.0 | Implemented | Directional 8-dimension relationships drive social affordances and dashboard explanations. |
| Population model | Implemented | `PopulationSystem` separates household, active Sims, active visitors and off-lot people. |
| Visitor lifecycle | Implemented | `VisitorSystem` schedules external visitors, doorbell, household responder selection, accept/reject/no-answer, visiting, hard timeout and return-home cleanup. |
| Off-lot simulation | Implemented, lightweight | External people change off-lot state with minimum state durations, drift relationships and can generate visit intent. Household Sims also take autonomous outings (meal out / trip / visit / other) with a logged reason and possible accidents. |
| Relationship graph | Implemented | Directed typed edges for friendship, rivalry, romance and kinship/family are active. |
| Romance/jealousy | Implemented | Positive interactions and compatibility can create romance; committed cohabiting partners trigger jealousy and penalise monogamy breaches. Committed Sims don't pursue flirts (UtilityAIPlanner penalty) and reject outside flirts ~92% of the time (`SocialAction`), the rare acceptance feeding jealousy. |
| Health/illness | Implemented | `HealthSystem` cycles healthy→ill→recovering→healthy and applies off-lot incident injuries via `reportIncident`. |
| Autonomous objects | Implemented | `AutonomousShoppingSystem` buys/places furniture by need pressure and lets a high-handiness Sim craft custom objects at the workbench. |
| Episodic memory | Implemented | Global memory and per-Sim autobiographical memory both exist and are persisted. |
| Narrative log | Implemented | `NarrativePlanner` emits story entries for relevant events. |
| God Mode | Implemented | Whisper, impose, bless, curse and life-event injection are active. |
| Life cycle | Implemented | `AgeSystem` tracks age and life stage; children grow from data records and are embodied as teens. |
| Career system | Implemented | `CareerSystem` tracks job, level, performance, salary, shifts, promotions, firing and player-driven job changes (`switchCareer`). All careers share one schedule (`WORK_WEEK` in `config/careers.js`): weekdays 0–4, 08:00–17:00; weekends off. |
| Schedule system | Partially implemented | `ScheduleSystem` tracks weekly routine slots; behavior integration is still partial. |
| Skill system | Partially implemented | Global `SkillSystem` and career-local skills both exist; they are not yet unified. |
| Weather system | Implemented, limited UI | `WeatherSystem` updates weather state and need deltas; no dedicated weather panel is mounted. |
| Mood engine | Implemented | `MoodEngine` computes additional mood labels and effects. |
| Experiment logger | Implemented | Logs social, visitor and off-lot events; CSV/JSON export and dashboard views are active. |
| Persistence adapter | Implemented | Browser runtime uses `SqlJsAdapter` on OPFS when available and falls back to `LocalStorageAdapter`. |
| Save/load | Implemented | Multi-slot panel is mounted; full game state is persisted through `Game.serialise()`. |
| Build mode | Implemented | Furniture, wall/door tools, room overlay and budget are wired into runtime. |
| Sim creator | Implemented | Mounted at startup when no save is selected. |
| Headless research mode | Implemented, separate model | `npm run headless` runs a pure JS social simulation without Three.js/DOM and writes SQLite batch output. |
| Family model | Implemented, births only | Household membership and autonomous reproduction (same household, mutual romance, opposite sex, non-blood) produce children as data members that grow into teen Sims. Death and inheritance are not implemented. |

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
| `src/config` | Extracted static definitions for scenarios, population, objects, interactions and careers. |
| `src/headless` | Pure JS headless simulation model used by the CLI batch runner. |

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

**Affinity balance (headless-tuned).** `affinity()` includes a small `familiarity * 0.1` term: without it, repeated positive contact built familiarity but left net affinity at 0, so relationships never warmed. The generic `DEFAULT_REJECT` was softened (`resentment 1, affection -1`; was `4 / -3`) and `SocialAction._baseAcceptance` gained a `+10` baseline (cold-start acceptance ~47% → ~60-65%). Together these make the expected value of a social attempt positive even at coin-flip acceptance (≈ +1.5 per accepted chat vs ≈ −1.4 per rejection), so relationships drift upward with contact and warm pairs accelerate. With faithful (sub-stepped) headless movement the dominant limiter on relationships turned out to be **opportunity**, not payoff: household Sims are at work 08:00–17:00 and then disperse across scattered furniture, so they rarely co-located while both free, and their social need was anyway well supplied by visitors (~86/100). Household-to-household contact was ~1 interaction/run, so romance never started.

**Household bonding drive** (`SimBrain`): a timer-gated step (between critical-need preemption and the utility planner) periodically sends a Sim to bond with a present housemate — `_findCompanion()` picks the most *compatible* present, non-visitor household member, and `SocialAction` walks to them. It is driven by `BOND_COOLDOWN_MIN`/`_JITTER` (≈1–2 game-hours), not by the satiated social need, because measurement showed the need rarely drops. This produced the co-location romance needs: in 20×5000-tick seeds, household-to-household interactions rose from ~20 to ~1010, flirts from 0 to ~120, committed couples from 0 to ~20, and strongest relationship edges from ~5 to ~33. (Note: seeded-PRNG runs can't be compared one-to-one across code changes — any change in `Math.random()` call count reshuffles the stream — so judge by aggregate distributions across seeds.)

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

Visits are time-gated: `VisitorSystem._visitsAllowedNow()` allows scheduling only on weekends (`weekday >= 5`, since careers work days 0–4) or on weekday evenings (`hour >= 18`), and never before 08:00 or from 22:00 on; `scheduleVisit` enforces this (an `opts.force` bypass exists for scripted visits). `_nightCurfew()` sends guests home from 23:00 and hard-removes anyone still present between 00:00 and 06:00, so the lot is empty overnight. In the same window household Sims don't start outings (`OffLotSimulationSystem._canStartOuting`) and `UtilityAIPlanner` adds a strong sleep bias (critical needs still preempt it).

The door responder is selected from available household Sims, not fixed to the initially requested host. The selected responder is logged as `respondingHostId`/`hostId` for the visit. Active visits have a hard timeout and always deactivate the external person on forced end, preventing saved `offLotState: visiting` records from staying active forever. Visitor need decay is slower than household decay while they are guests; low hunger, bladder or energy pushes them to leave instead of producing household-level crisis loops.

`OffLotSimulationSystem` updates external people periodically, changing `offLotState`, applying lightweight relationship drift and emitting `offlot:visitIntent` events that can schedule visits. Each person carries `offLotStateUntilTick` and `lastOffLotTransitionTick`; state transitions are blocked until the minimum duration for the current state expires, reducing home/work/socializing churn.

Default external people can define `relationshipSeeds` in `src/config/defaultPopulation.js`. `PopulationSystem.applyRelationshipSeeds()` applies these only to neutral relations, so new games and old neutral saves receive an initial outside network without compounding values on every load.

## Family lifecycle, household outings, health and crafting

**Reproduction & children.** `PopulationSystem.update(dt)` (driven from `Game._update`) periodically scans committed household couples and calls `createChild(aId, bId)` when `canHaveChild` holds: same `householdId`, mutual `partnerId`, romance ≥ 35, opposite sex (`_sexOf`) and not blood-related (`isFamily`). A birth is data-only — the child record carries `embodied:false` and `ageSeconds`; **no Sim is spawned**. `_growChildren` accumulates `ageSeconds` and `_embodyChild` spawns the Sim (via `Game._spawnSim` + `adoptHouseholdSim`) once it reaches `CHILD_GROW_SECONDS`, registering it with `AgeSystem.registerAt(sim, 13)` so it appears as a teen and keeps aging. `embodied`/`ageSeconds` are persisted through `_person`. Guards: `MAX_HOUSEHOLD` cap and a per-couple `BIRTH_COOLDOWN_SECONDS`. `CHILD_GROW_SECONDS` is deliberately decoupled from `AgeSystem`'s 86400 s/day scale (a `ponytail:` tuning knob). `_compatibleAgesForChild` allows `youngAdult` and `adult` stages: it normalises the stage to letters-only before matching, because the `AgeSystem` stage **id** is camelCase `youngAdult` while the check previously compared against `'young adult'` (with a space) — a mismatch that silently made births impossible for the default population (everyone starts as `youngAdult`). Headless confirms births now occur (~46 across 18/20 seeds once the bonding drive supplies couples).

**Household outings.** `OffLotSimulationSystem` also iterates household Sims. A Sim can autonomously start an outing (`meal_out`, `trip`, `visit_friend`, `other`) unless a need is critical; it sets `sim._outing`, `sim._outingReason`/`_offLotReason` and `_outingUntilTick`, and emits a story entry naming the reason. `Game._update` treats `sim._atWork || sim._outing` as off-lot (hidden via `_sendToWork`, needs frozen, not selectable). On return the Sim recovers needs by outing type. Work departures also set `sim._offLotReason='work'` and log a reason (`CareerSystem._startShift`). While off-lot a Sim may have an accident → `HealthSystem.reportIncident`. Filters that skip hidden Sims (raycast, social witnesses, visitor door responder, family scoring, autonomous placement) all exclude `_outing` as well as `_atWork`.

**Health.** `HealthSystem` (constructed in `Game`, ticked in `_update`) moves a person through `healthy → ill → recovering → healthy` with chance driven by hygiene/energy/hunger/weather, and exposes `reportIncident(personId, severity, cause, details)` used by off-lot accidents.

**Autonomous crafting.** `AutonomousShoppingSystem` subscribes to `sim:objectUsed`; when a household Sim finishes at the `workbench` with handiness ≥ 3, `_maybeCraft` builds a custom object via `Game.createCustomObject` (→ `ObjectRegistry.registerCustom`) whose `needTarget`/`restoreRate`/utility scale with handiness, places it with the same placement validation as purchases, and is gated by a craft cooldown. Custom objects persist via `serialiseCustom`/`restoreCustom`.

**Chronic-contention buying.** `AutonomousShoppingSystem`'s `_needsAdditionalInstance` only sees an *instantaneous* snapshot ("is an equivalent object free right now?"), which misses bursty contention — a single toilet/bed serving the household looks free at most random check instants yet drives most need crises. The system now subscribes to `need:crisis` and accumulates a decaying per-need pressure (`CRISIS_DECAY`, `CRISIS_THRESHOLD`). A need under chronic crisis both bypasses the instantaneous gate (`_servesChronicCrisis`) and adds a strong score bonus (`_crisisBonus`), so the household buys a second toilet/bed/fridge instead of letting the same need crater repeatedly. Crisis pressure is serialised. Need-crisis preemption was also tuned in `UtilityAIPlanner._criticalNeedAdjustment`: thresholds raised from 14-18 to 20-26 so Sims leave to eat/pee/sleep before a need craters (not after). Combined headless effect: `need:crisis` events roughly halved (~1119 → ~530 over 20×5000-tick seeds), with every run now provisioning a second bathroom/bed.

## Persistence

`SaveLoad` delegates storage to a `PersistenceAdapter`. The app default is `src/persistence/SqlJsAdapter.js` — real SQLite compiled to WebAssembly (sql.js). Under `npm run app`, `scripts/launch.mjs` also starts a local filesystem persistence endpoint that writes `.data/sims-clone.sqlite` automatically. When that endpoint is unavailable, the adapter can persist to browser-private OPFS or a user-selected `.sqlite`/`.db` file via Chrome File System Access API. If sql.js fails entirely it falls back to `src/persistence/LocalStorageAdapter.js`, the only backend that touches `localStorage`.

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

`ExperimentLogger` keeps the in-memory log and also performs a best-effort append to the active persistence adapter when available. `SqlJsAdapter` stores normalized event columns plus the full JSON payload; `LocalStorageAdapter` keeps compatible JSON arrays. Every few simulated minutes, `ExperimentLogger` persists directional relationship snapshots so long runs can be queried without reconstructing every relationship from events.

**Persistence cost controls.** High-churn AI/debug events (`sim:action`, `relationship:graphChanged`, `wellbeing:evaluated`) are kept only in the in-memory dashboard buffer and **not** written to SQLite (`SKIP_PERSIST` in `ExperimentLogger`) — in real saves they were ~87% of rows and ~80% of event-log bytes. `SqlJsAdapter` bounds storage and flush cost three ways: (1) each flush serializes the whole DB, so the hot event/snapshot log flushes on a long throttle (`FLUSH_MS`, 30 s) while slot saves still flush immediately; (2) `event_log` and `relationship_snapshots` are capped (`EVENT_LOG_CAP`/`REL_SNAPSHOT_CAP`) by id-based pruning every `PRUNE_EVERY` appends, so the file plateaus instead of growing without limit; (3) `_initSchema` prunes and `VACUUM`s once on connect to reclaim space from earlier bloat. (Measured: an existing 42.5 MB / 68k-event DB drops to 18.7 MB / 20k events on first connect.)

Legacy social payloads are normalized as `social:legacy`; payload fields named `type` can no longer overwrite the logger's canonical event type. This keeps SQLite `event_type` stable for dashboards and post-run analysis.

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
window._game.experimentLogger.simulationHealthMetrics()
await window._game.experimentLogger.queryPersistedEvents({ type: 'social:interaction' })
await window._game.experimentLogger.persistedRunComparison()
await window._game.experimentLogger.persistedRelationshipSnapshots()
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

## Headless Batch Runs

`npm run headless` runs the pure JS model in `src/headless/HeadlessRuntime.js`
(the CLI entry point in `scripts/headless.mjs`).
It does not instantiate `Game`, Three.js, DOM UI or pathfinding meshes. It uses
the same extracted population and interaction configuration, emits social and
visitor experiment rows, stores periodic relationship snapshots, and writes a
SQLite file through `sql.js`.

```bash
npm run headless -- --runs=5 --ticks=5000 --seed=42 --out=headless-runs
```

Outputs:

- `headless-runs/sims-headless.sqlite`;
- `headless-runs/latest-summary.json`.

**Faithful movement (sub-stepping).** `run()` counts game-minutes (`ticks`), but advances each one through `SUBSTEPS` (=20) browser-sized frames of `SUBSTEP_DT` (=0.05s), mirroring `GameLoop`'s 20 Hz fixed timestep. Previously the loop took one `dt=1` step per game-minute, which teleported Sims ~3.5 cells/step and made co-location (hence social interaction counts) an artifact; sub-stepping makes movement, path-block timers and the brain's decision cadence behave exactly as in the browser, so social/idle/deadlock metrics are now trustworthy. Linear per-`dt` integrations (need decay, relationship drift, cooldowns) are unaffected since `20 × 0.05 == 1.0`. Cost: ~1.8 s per 1000 game-minutes per run.

Sub-stepping surfaced (and fixed) a latent bug that affects the browser too: `UseObjectAction` required *orthogonal* adjacency (Manhattan ≤ 1), but `WalkToAction` falls back to the nearest free cell when its target side is taken — often a *diagonal* neighbour. The use was then rejected, the Sim re-planned the same object, and span in a walk→fail→replan loop (slow at `dt=1`, a fast infinite spin under fine timesteps — and a real glitch in the browser). The adjacency test is now Chebyshev (any of the 8 surrounding cells).

**Run isolation caveat.** `HeadlessRuntime` builds fresh per-run instances of most systems, but a few module singletons (`budgetSystem`, `skillSystem`, `socialManager`, `memorySystem`) persist across the run loop even though `bus.clear()` is called between runs. `budgetSystem.reset()` is now called per run in the constructor — without it, autonomous purchases drained the shared balance after ~4 runs and the rest of the batch could buy nothing, masking the auto-shopping behaviour. The remaining singletons still carry state across runs (skills/scalar-score/memories accumulate); treat cross-run skill/affinity aggregates with that in mind.

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
