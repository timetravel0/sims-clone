# Wellbeing Ambition

Every Sim now has a baseline ambition to be satisfied and happy. If the Sim lives with others, that ambition extends to the household: family members' low wellbeing can influence the Sim's choices.

This is not a single hard-coded goal. It is a continuous motivational layer that nudges the Utility AI toward actions that improve personal or household wellbeing.

## Runtime model

File: `src/ai/WellbeingAmbition.js`

Each `SimBrain` owns one instance:

```js
this.wellbeing = new WellbeingAmbition(sim);
```

It is updated every brain tick, persisted with the brain state, and restored through save/load.

## What it measures

For the Sim itself:

- core needs: hunger, energy, bladder, hygiene, comfort, fun, social, room;
- low-need penalties;
- mood label bonus/penalty.

For the family:

- average wellbeing of other household members currently available on the lot;
- strongest need pressures across the household;
- whether the Sim actually has family members to care about.

## Personality influence

Family concern is not identical for all Sims.

- nice Sims care more about household wellbeing;
- outgoing Sims care somewhat more about social/family interaction;
- low-nice Sims care less;
- neurotic Sims react more strongly to their own low wellbeing.

This creates different behavior patterns: a nice/outgoing Sim is more likely to comfort or help; an ambitious Sim can still pursue career/skill/status; a neurotic Sim may prioritize self-stabilization.

## Planner effect

`UtilityAIPlanner` calls:

```js
this._brain.wellbeing.boost(affordance)
```

The boost favors:

- self-care through useful furniture actions;
- comfort/help/social warmth toward household members;
- apology/forgiveness to repair household tension;
- home-improving actions when family needs are low.

It penalizes hostile actions toward household members such as insult, argue, confront and avoid.

## Observable goals

`GoalSystem` now generates two baseline goal types:

- `be_happy` — personal satisfaction and happiness;
- `support_family` — help the household feel better, only if the Sim is not alone.

These goals are visible through the existing goal system and affect scoring like other goals.

## Events

The system emits periodic telemetry:

```text
wellbeing:evaluated
```

`ExperimentLogger` records:

- selfScore;
- familyScore;
- ownDrive;
- familyDrive;
- dominant motivation (`self` or `family`);
- mood.

Use:

```js
window._game.experimentLogger.wellbeingTimeline()
window._game.experimentLogger.wellbeingTimeline(simId)
```

## Current limitations

This is a first practical model, not yet a full psychology model. Missing work:

- household disagreement over priorities;
- explicit family roles such as caregiver, rebel, dependent, provider;
- long-term life satisfaction beyond current needs/mood;
- memories of sacrifice, gratitude and resentment;
- family-level goals such as saving money, renovating, hosting guests or helping a child;
- stronger links between purchase decisions and household wellbeing.

The next important step is to make family support socially consequential: if Alice repeatedly helps Bob, Bob should remember it, trust her more, and maybe reciprocate later.
