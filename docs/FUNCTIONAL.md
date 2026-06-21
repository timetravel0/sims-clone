# Sims Clone - Functional Guide

Last updated: implementation through Sprint 4 plus Utility AI, Smart Objects and experiment logging.

## What It Is

Sims Clone is a browser-based isometric life simulation. You observe and influence autonomous Sims with needs, personalities, moods, memories, emotions, relationships and an emergent social graph.

The simulation now follows a Sims-style model:

- Sims evaluate their internal state.
- Objects and other Sims advertise possible actions.
- Utility AI chooses the most useful available action.
- Social interactions can succeed or be rejected.
- Significant events are logged for later analysis.

## Current Sims

The household contains:

- Alice
- Bob
- Cleo

Click a Sim in the world or a portrait in the top-left corner to select them.

Each Sim has:

- ten needs;
- five personality traits;
- mood tier;
- secondary emotions;
- episodic memories;
- scalar relationship score and familiarity;
- directed typed social graph edges.

## Needs

Needs range from `0` to `100` and decay over time.

| Need | Meaning | Restored by examples |
|---|---|---|
| Hunger | Food | Fridge, dining |
| Energy | Rest | Bed, coffee-like energy affordances |
| Bladder | Toilet | Toilet |
| Hygiene | Cleanliness | Shower |
| Social | Affiliation | Chat, jokes, gathering objects |
| Fun | Recreation | TV, chess, piano, jokes |
| Comfort | Physical ease | Couch, hot tub |
| Room | Environment | Decorative/room affordances |
| Autonomy | Self-directed agency | Reading, studying, refusing unwanted actions |
| Status | Approval/prestige | Compliments, performance, high-status objects |

When needs become low, Sims seek nearby affordances that advertise useful payoffs.

## Personality

Traits range from `-1` to `+1`.

| Trait | High value means | Functional effect |
|---|---|---|
| Outgoing | Extrovert | Higher social pressure and more social acceptance |
| Neurotic | Anxious/reactive | Stronger negative swings and lower social tolerance |
| Playful | Fun-seeking | More fun-seeking and joking |
| Nice | Cooperative | More compliments/hugs, fewer hostile choices, slower status loss |
| Ambitious | Driven | More status/autonomy weighting and slower general decay |

God Mode can permanently bless or curse traits.

## Smart Objects and Affordances

Furniture is not passive. Each object advertises actions and expected effects.

Examples:

| Object | Advertised action | Utility |
|---|---|---|
| Bed | Sleep | Energy, autonomy |
| Bookshelf | Read | Autonomy, fun, status |
| Desk | Study | Autonomy, status, fun, energy cost |
| TV | Watch TV | Fun, social, autonomy |
| Bar | Show Off | Social, status, fun, energy cost |
| Piano | Play Piano | Fun, status, autonomy |

Sims score these options from current need pressure, personality and distance.

## Social Interactions

Other Sims also act as Smart Objects. They advertise social possibilities such as:

- greet;
- chat;
- compliment;
- insult.

Every pair has:

- `score`: affinity from `-100` to `+100`;
- `familiarity`: how much the pair has interacted, from `0` to `100`.

Familiarity increases even when the interaction is negative. Some actions require enough familiarity or a compatible score.

When Sim A initiates an action toward Sim B:

1. A walks near B.
2. B evaluates whether to accept using energy, score, familiarity and personality.
3. If accepted, both Sims receive the interaction payoff.
4. If rejected, A loses social/status value and B regains autonomy.
5. The event is recorded in the Story Log and Experiment Logger.

## Relationship Layers

There are two relationship views.

### Pair Score

The `Relations` panel shows scalar relationship scores and familiarity for the selected Sim.

Typical score labels:

| Score | Label |
|---:|---|
| `> 60` | BFF |
| `> 30` | Friend |
| `-10` to `30` | Neutral |
| `-30` to `-10` | Tense |
| `< -30` | Enemy |

### Social Graph

Open `Graph` to see directed relationships. Alice can feel differently about Bob than Bob feels about Alice.

Edge types:

- friendship;
- rivalry;
- romance;
- family/kinship.

Romance emerges from compatibility and repeated positive interaction. Jealousy can appear when a Sim with romantic attachment sees their romantic interest interact positively with someone else.

## Mood, Emotions and Memory

Mood is calculated from needs, personality and active emotions.

Mood tiers:

| Tier | Score |
|---|---:|
| Ecstatic | `>= 75` |
| Happy | `>= 35` |
| Neutral | `>= -10` |
| Sad | `>= -40` |
| Miserable | `< -40` |

Secondary emotions include:

- joy;
- hope;
- pride;
- excitement;
- anger;
- grief;
- loneliness;
- jealousy.

Sims record episodic memories for social events, crises, mood peaks, God Mode actions and life events. Memories fade over time and can bias later choices.

## God Mode

Open `God` from the toolbar.

Available powers:

| Power | Effect |
|---|---|
| Whisper | Suggest an action; the Sim may refuse |
| Impose | Force an action with autonomy/mood cost |
| Bless | Permanently raise a trait |
| Curse | Permanently lower a trait |
| Life Event | Inject promoted, fired, heartbreak or windfall |

God Mode creates memories and story events, and its effects are saved.

## Story Log

The Story Log records important visible events:

- actions;
- accepted and rejected social interactions;
- arguments and positive interactions;
- BFF/rival announcements;
- romantic sparks and jealousy;
- mood changes;
- need crises;
- God Mode actions;
- life event ripples.

Use the Story button or close button to toggle it.

## Experiment Data

The simulation records structured events through `ExperimentLogger`.

From the browser console:

```js
window._game.experimentLogger.toJSON()
window._game.experimentLogger.toCSV()
window._game.experimentLogger.downloadJSON()
window._game.experimentLogger.downloadCSV()
```

Rows include simulation tick, simulated hour, event type and event-specific fields such as actor, target, action type, score delta, familiarity and acceptance result.

## Movement and Exclusivity

Sims cannot overlap.

The world enforces:

- one reserved destination tile per Sim;
- no walking into occupied/reserved path cells;
- one reserved user per object;
- one active user per object.

If two Sims want the same object, only the first reservation succeeds. The other Sim replans.

Build Mode also refuses occupied or reserved cells.

## Save and Load

Save/load preserves:

- clock and day/night state;
- Sim positions, needs, mood, emotions and personality;
- memories;
- relationship score and familiarity;
- directed social graph;
- romance state;
- experiment log.

## Build Mode

Open `Build`, choose an object and click a valid floor tile.

Placement is rejected when the target cell is blocked, occupied, reserved or otherwise invalid.
