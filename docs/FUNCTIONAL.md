# Sims Clone — Functional Guide

Last updated: Sprint 3 — Life Cycle, Career, Schedule and LifeCyclePanel.

## What It Is

Sims Clone is a browser-based isometric life simulation. You observe and influence autonomous Sims with needs, personalities, moods, memories, emotions, relationships, an emergent social graph and now a full life-cycle simulation with ageing, careers and daily routines.

The simulation follows a Sims-style model:

- Sims evaluate their internal state.
- Objects and other Sims advertise possible actions.
- Utility AI chooses the most useful available action.
- Social interactions can succeed or be rejected.
- A daily schedule suggests activities based on personality.
- Career shifts temporarily suspend autonomous planning.
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
- directed typed social graph edges;
- life stage and age in simulated days;
- career, level and simoleons;
- five skills;
- a generated daily schedule.

## Needs

Needs range from `0` to `100` and decay over time. From Sprint 3, the decay rate is multiplied by `needMult` — a per-stage modifier that makes children and teenagers decay needs faster and adults more slowly.

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
| Ambitious | Driven | More status/autonomy weighting, slower general decay, stronger schedule adherence |

God Mode can permanently bless or curse traits.

## Life Stages

`AgeSystem` tracks each Sim's age in simulated days. Every 24 in-game hours counts as one day. Reaching a threshold triggers a stage transition.

| Stage | Colour | `needMult` | Age range (default thresholds) |
|---|---|---:|---|
| Baby | blue | 1.4 | 0 – 3 days |
| Child | green | 1.3 | 4 – 12 days |
| Teen | yellow | 1.2 | 13 – 17 days |
| Young Adult | teal | 1.0 | 18 – 29 days |
| Adult | orange | 0.9 | 30 – 59 days |
| Elder | red | 1.1 | 60+ days |

Stage transitions are logged in the Story Log with the event category `lifecycle:stageChanged`.

## Careers

`CareerSystem` manages six careers:

| Career | Skill requirement |
|---|---|
| Unemployed | None |
| Artist | creativity |
| Scientist | logic |
| Chef | cooking |
| Programmer | logic |
| Athlete | fitness |

Each career has weekly shifts, a per-level salary and promotion rules.

- During a shift, `sim._atWork = true` and the Sim's brain is blocked from autonomous planning.
- Salary is paid and `need:status` is raised at the end of each shift.
- A Sim is automatically promoted every 5 days worked (maximum level 10).
- Using skill-related objects (bookshelf → logic, piano → creativity) emits `career:skillGain` and raises the corresponding skill.
- God Mode life events `promoted` and `fired` override the normal promotion cycle.

Change a Sim's career from the **Life Cycle panel** via the career dropdown. The panel validates the required skill level before accepting the change.

## Daily Schedule

`ScheduleSystem` generates a weekly routine for each Sim based on personality:

| Slot | Days | Condition |
|---|---|---|
| Sleep | Every day | 23:00 – 07:00 |
| Breakfast | Every day | 07:00 – 08:00 |
| Lunch | Every day | 12:00 – 13:00 |
| Dinner | Every day | 18:00 – 19:00 |
| Fun | Mon – Fri afternoon | `playful > 0.3` |
| Social | Weekend | `outgoing > 0.3` |
| Study | Mon – Fri evening | `ambitious > 0.3` |

When an active slot matches the current in-game hour, `SimBrain` receives a suggestion via `suggestFurniture()` or `suggestSocial()`. The brain only accepts the suggestion if it is free or the slot priority is higher than the current action.

## Life Cycle Panel

Open `📋 Life` from the toolbar to see the selected Sim's life state.

The panel shows:

- **Stage badge** — colour-coded stage name and age in simulated days.
- **Career row** — career name, current level (`Lv.X`) and simoleons balance.
- **Work status** — `🏢 At Work` or `🏠 Home`.
- **Skills** — five bars (cooking, logic, creativity, fitness, charisma) with numeric values.
- **Career dropdown** — change career; the panel shows an inline warning if the required skill is not met.
- **Daily timeline** — 24 tick-bars colour-coded by slot type (sleep / work / fun / eat), with the current hour highlighted in teal.

The panel re-renders automatically every time:
- `📋 Life` is clicked;
- the selected Sim changes;
- `_lifecyclePanel.update()` is called in the game loop (throttled).

## Smart Objects and Affordances

Furniture is not passive. Each object advertises actions and expected effects.

Examples:

| Object | Advertised action | Utility |
|---|---|---|
| Bed | Sleep | Energy, autonomy |
| Bookshelf | Read | Autonomy, fun, status, logic skill |
| Desk | Study | Autonomy, status, fun, energy cost |
| TV | Watch TV | Fun, social, autonomy |
| Bar | Show Off | Social, status, fun, energy cost |
| Piano | Play Piano | Fun, status, autonomy, creativity skill |

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

Edge types: friendship, rivalry, romance, family/kinship.

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

Secondary emotions include joy, hope, pride, excitement, anger, grief, loneliness and jealousy.

Sims record episodic memories for social events, crises, mood peaks, God Mode actions and life events. Memories fade over time and can bias later choices.

## God Mode

Open `God` from the toolbar.

| Power | Effect |
|---|---|
| Whisper | Suggest an action; the Sim may refuse |
| Impose | Force an action with autonomy/mood cost |
| Bless | Permanently raise a trait |
| Curse | Permanently lower a trait |
| Life Event | Inject promoted, fired, heartbreak or windfall |

`promoted` and `fired` are now also handled by `CareerSystem`, which updates level, salary and the Story Log accordingly.

## Story Log

The Story Log records:

- actions;
- accepted and rejected social interactions;
- arguments and positive interactions;
- BFF/rival announcements;
- romantic sparks and jealousy;
- mood changes;
- need crises;
- God Mode actions;
- life stage transitions (`lifecycle:stageChanged`);
- career promotions and firings.

## Experiment Data

The simulation records structured events through `ExperimentLogger`.

From the browser console:

```js
window._game.experimentLogger.toJSON()
window._game.experimentLogger.toCSV()
window._game.experimentLogger.downloadJSON()
window._game.experimentLogger.downloadCSV()
```

## Movement and Exclusivity

Sims cannot overlap. The world enforces one reserved destination tile per Sim, no walking into occupied/reserved path cells, one reserved user per object and one active user per object.

## Save and Load

Save/load preserves:

- clock and day/night state;
- Sim positions, needs, mood, emotions and personality;
- memories;
- relationship score and familiarity;
- directed social graph;
- romance state;
- experiment log;
- life cycle state (age, career level, skills, simoleons) — added Sprint 3.

## Build Mode

Open `Build`, choose an object and click a valid floor tile. Placement is rejected when the target cell is blocked, occupied, reserved or otherwise invalid.
