# Autonomous Household Shopping

This feature lets household Sims buy and place furniture without direct player input. The goal is to make the house evolve like a lived-in environment rather than a static player-authored layout.

## Design intent

Autonomous shopping is deliberately conservative. Sims do not decorate randomly. A purchase is considered only when the household has enough funds, at least one household Sim is available, there is free space on the lot, and an object has a plausible utility for current household needs.

The system models a simple version of real-life domestic decision-making:

- low needs create pressure;
- the household budget creates constraints;
- object duplicates are penalized;
- recent purchases are cooled down;
- Sim personality influences preferences;
- the selected Sim becomes the buyer and the event is logged.

## Runtime system

File: `src/systems/AutonomousShoppingSystem.js`

`Game` owns one instance:

```js
this.autonomousShopping = new AutonomousShoppingSystem(this);
```

It is updated every simulation tick:

```js
this.autonomousShopping.update(scaled);
```

It is also persisted by `Game.serialise()` / `Game.restore()`.

## Decision model

Every check interval, the system ranks objects from `ObjectRegistry.all()` using:

- household need pressure;
- object affordance utility;
- social/skill relevance;
- object cost;
- duplicate count;
- recent-purchase cooldown;
- available placement space;
- buyer personality.

Examples:

- low hunger increases the chance of buying food-related objects;
- low fun/social increases the chance of social or entertainment furniture;
- ambitious Sims are more likely to buy skill/status objects;
- playful Sims are more attracted to TV, piano, bar, hot tub, fire pit;
- neurotic Sims prefer comfort/safety/room-improving objects.

## Placement

The system first tries to place the object near the buyer, then near related existing furniture, then scans the lot for a valid free tile.

Placement uses the same `world.placeFurniture()` path as manual build mode, so furniture is added to the same world state and persists with saves.

## Budget

Costs are currently defined in `AutonomousShoppingSystem` as a first-pass local price table. Future work should move object prices into `ObjectRegistry` / SQLite object definitions.

The household keeps a reserve so autonomous purchases do not drain all funds.

## Events

Successful purchases emit:

```text
household:purchase
```

Failed attempts emit:

```text
household:purchaseFailed
```

`ExperimentLogger` records these events and writes them through the persistence adapter on a best-effort basis.

## Current limitations

This is the first playable version, not a full consumer-behaviour simulation. Missing work:

- object prices should move into `ObjectRegistry`;
- purchases should eventually create memories and relationship effects;
- expensive purchases could require household disagreement/approval;
- Sims should be able to sell, replace, upgrade and rearrange objects;
- long-term goals should influence purchases more strongly;
- visitors should react to new/expensive objects;
- purchases should feed reputation/status and gossip.

The next major improvement should be household decision-making: one Sim wants a piano, another thinks it is too expensive, and the relationship/budget tension becomes part of the simulation.
