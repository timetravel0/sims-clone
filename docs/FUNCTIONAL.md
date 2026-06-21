# Sims Clone - Functional Guide

This document describes what is currently playable or observable from the frontend, what exists only as backend/runtime logic, and what is still missing.

## Current Experience

Sims Clone is a browser-based isometric life simulation. You observe and influence autonomous Sims with needs, personalities, moods, memories, relationships, careers, aging and a directed social graph.

The current household contains:

- Alice;
- Bob;
- Cleo.

You can select Sims in the world or from the selector UI. The toolbar exposes simulation speed, story, relations, graph, God Mode, build, life, save and load.

## Available In The Frontend

| Feature | Frontend access | Status |
|---|---|---|
| Isometric world | Main scene | Available. |
| Sim selection | Sim selector and world click | Available. |
| Needs | Needs/status panel | Available. |
| Mood/status | Status UI and visual feedback | Available. |
| Autonomous behavior | Runs automatically | Available. |
| Smart object use | Context actions and AI | Available. |
| Object exclusivity | Runtime behavior | Available. |
| Anti-overlap movement | Runtime behavior | Available. |
| Social interactions | Autonomous and context-driven | Available. |
| Pair relations | `Relations` button | Available. |
| Social graph | `Graph` button | Available. |
| Story log | `Story` button | Available. |
| God Mode | `God` button | Available. |
| Build mode | `Build` button | Available for basic object placement. |
| Life/career/schedule view | `Life` button | Available. |
| Save/load | `Save` and `Load` buttons | Available for the default save flow. |

## Needs And Autonomy

Each Sim has needs from `0` to `100`:

- hunger;
- energy;
- bladder;
- hygiene;
- social;
- fun;
- comfort;
- room;
- autonomy;
- status.

Needs decay over time. When idle, a Sim evaluates nearby objects and other Sims, then chooses the action with the best expected utility.

Examples:

| Need pressure | Typical response |
|---|---|
| Low hunger | Use food-related furniture. |
| Low energy | Sleep, rest or use an energy affordance. |
| Low social | Seek interaction with another Sim. |
| Low fun | Use entertainment objects. |
| Low autonomy | Prefer individual activities or resist imposed control. |
| Low status | Prefer high-status actions or positive social feedback. |

## Smart Objects

Objects advertise what they can do for a Sim. Sims do not need hard-coded behavior for every object; they score advertised affordances.

Examples:

| Object type | Example action | Effect |
|---|---|---|
| Bed | Sleep | Restores energy. |
| Bookshelf | Read | Restores autonomy/fun/status. |
| Desk | Study | Supports autonomy/status and career-related growth. |
| TV | Watch | Restores fun and sometimes social value. |
| Piano | Play | Restores fun/status and can support artistic growth. |

Only one Sim can reserve and use a given object at a time.

## Movement And Collision

Sims cannot overlap.

The simulation enforces:

- one reserved destination tile per Sim;
- no walking into occupied or reserved cells;
- no standing on the same tile as another Sim;
- one active user per furniture object;
- build placement rejection on occupied or reserved cells.

If two Sims want the same object, the first valid reservation wins and the other Sim must choose a different action or retry later.

## Social System

Sims can greet, chat, compliment or insult each other. Social actions are not guaranteed to succeed.

When a Sim initiates a social action:

1. the initiator walks near the target;
2. the target evaluates whether to accept;
3. acceptance depends on energy, familiarity, relationship score and personality;
4. success gives social payoff and updates relationships;
5. rejection penalizes the initiator and can improve the target's autonomy.

Each pair tracks:

| Value | Range | Meaning |
|---|---:|---|
| Score | `-100` to `100` | Affinity, from hostile to close. |
| Familiarity | `0` to `100` | How much they know each other. |

## Social Graph

The `Graph` panel shows directed relationships. Direction matters: Alice can like Bob more than Bob likes Alice.

Supported edge types:

- friendship;
- rivalry;
- romance;
- family/kinship.

Friendship, rivalry and romance can emerge from repeated interactions. The family/kinship edge type exists, but a complete family system is not implemented yet.

## Romance And Jealousy

Romance can emerge from personality compatibility and repeated positive interactions.

Jealousy can appear when a Sim with romantic attachment observes the romantic target having a positive interaction with someone else.

This is implemented as simulation behavior and story events, not as a full dating, partnership or household system.

## Memory, Emotions And Story

Sims record episodic memories for important events:

- social successes;
- social rejections;
- need crises;
- mood peaks;
- God Mode actions;
- life events;
- career events.

Secondary emotions can appear and decay over time, including joy, hope, pride, excitement, anger, grief, loneliness and jealousy.

The `Story` panel shows human-readable events from the simulation.

There is currently no dedicated frontend panel that lists all raw memories for a selected Sim.

## God Mode

The `God` panel is available from the toolbar.

| Power | Behavior |
|---|---|
| Whisper | Suggests an action; the Sim can refuse. |
| Impose | Forces an action and costs autonomy/mood. |
| Bless | Raises a trait. |
| Curse | Lowers a trait. |
| Life Event | Injects promoted, fired, heartbreak or windfall. |

God Mode actions create events and memories.

## Life Cycle

The life-cycle system is active and visible through the `Life` panel.

Each Sim has a simulated age and life stage:

- baby;
- child;
- teen;
- young adult;
- adult;
- elder.

The current implementation tracks aging and life-stage transitions. It does not yet implement birth, death, inheritance, marriage, adoption or household membership.

## Career

Career functionality is implemented and surfaced mainly through the `Life` panel.

The system tracks:

- selected career;
- career level;
- performance;
- work days;
- salary;
- shift start/end;
- promotions;
- firing;
- career-related skills.

Available careers include:

- artist;
- scientist;
- chef;
- programmer;
- athlete.

The dedicated `CareerPanel` component exists in the source code but is not mounted in the current frontend. In practice, career information is accessed from the `Life` panel.

## Schedule

The schedule system is active and visible in the `Life` panel.

It defines weekly routine slots such as:

- sleep;
- meals;
- work;
- study;
- fun;
- social time.

Current limitation: the schedule is mostly a state/routine layer. Some direct behavior hooks are still partial, so not every routine slot reliably forces a matching Sim action.

## Skills

Skill logic exists, but frontend exposure is incomplete.

Implemented logic:

- Sims are registered in a global skill system;
- social interactions can increase charisma;
- career logic tracks career-local skills;
- object use can increase relevant career skills;
- skill state can be serialized.

Current limitations:

- the global skill system and career skill map are separate;
- the skill UI component exists, but the current HTML does not expose the required panel/button;
- skills are therefore not reliably inspectable from the frontend.

## Weather

Weather logic is active. It can change environmental state, influence lighting and apply need deltas.

Current limitation: there is no mounted weather panel, so weather is mostly visible indirectly through mood/need effects and scene changes.

## Experiment Data

The experiment logger is active and records structured events suitable for later analysis.

From the browser console:

```js
window._game.experimentLogger.toJSON()
window._game.experimentLogger.toCSV()
window._game.experimentLogger.downloadJSON()
window._game.experimentLogger.downloadCSV()
```

Current limitation: there is no frontend export panel for the experiment logger.

## Save And Load

The toolbar save/load buttons are active.

The saved state includes:

- Sims;
- needs and personality;
- mood/emotions;
- memories;
- social relations;
- relationship graph;
- romance state;
- age state;
- career state;
- weather state;
- skills;
- experiment log.

Current limitations:

- the multi-slot save panel exists in source but is not mounted;
- budget, wall and room fields exist in the save schema but are empty in the current runtime because those systems are not wired into `Game`.

## Build Mode

The `Build` button opens the current build flow for placing objects.

Implemented:

- basic furniture placement;
- rejection of invalid, blocked, occupied or reserved cells.

Present but not active in the main frontend:

- budget-aware catalogue;
- wall placement;
- door placement as build objects;
- room detection;
- room overlay;
- room mood bonuses from detected enclosed rooms.

## Present But Not Available From The Frontend

These pieces exist in the codebase but are not currently reachable in the playable UI:

| Feature | Current state |
|---|---|
| Skill panel | Component exists; missing current DOM anchor/button. |
| Dedicated career panel | Component exists; career is shown through `Life` instead. |
| Multi-slot save panel | Component exists; toolbar uses default save/load. |
| Sim creator | Component exists; not mounted. |
| Room overlay | Component exists; not mounted. |
| Advanced build catalogue | Component exists; not mounted. |
| Budget display/economy | System exists; not connected to `Game`. |
| Wall/door build flow | Systems exist; not connected to `Game`. |
| Raw memory browser | Not implemented. |
| Experiment logger panel | Not implemented. |
| Weather panel | Not implemented. |

## Missing Functional Areas

The major missing product features are:

- full family and household simulation;
- birth, death, marriage, adoption and inheritance;
- complete career frontend with job history and skill requirements shown everywhere;
- unified skill UI and unified skill model;
- direct control and visualization of schedules;
- memory browser per Sim;
- experiment dashboard with filters and exports;
- weather panel and weather history;
- budget economy integrated with build mode;
- wall, room and floor-plan gameplay;
- Sim creation and editing from the frontend;
- headless fast-forward mode for scientific experiments;
- seeded deterministic experiment runs;
- automated regression tests for gameplay rules.
