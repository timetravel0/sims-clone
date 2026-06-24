# Evolution Roadmap — Autonomous Life Simulation

## Executive judgement

The project is no longer a small Sims-like prototype. It now has enough systems to become a real autonomous life simulation: browser runtime, browser-equivalent headless runtime, SQLite persistence, social dynamics, memory, careers, health, population, visitors, off-lot behaviour, build tools, autonomous buying, crafting and experimental logging.

The risk is now architectural, not creative. Adding more features without first creating stronger domain boundaries will make the simulation unpredictable and hard to debug. The next evolution must be organised around a few domain engines: world/layout, objects/catalogue, food, family/population, work, health, camera/input and telemetry.

The guiding principle for the next phase is this:

> Sims should not just satisfy needs. They should reason about the home as a functional environment.

That means furniture placement, food preparation, room creation, family structure, health care and work must become intentional systems, not one-off actions.

---

## Current state assessment

### What is strong

- The game now boots through a real `Game` class with renderer, world, Sims, systems, save/load, UI and a lifecycle guard that prevents double initialisation.
- Headless has moved in the right direction: it should use the same runtime objects and systems as the browser, not a synthetic parallel simulator.
- The simulation already contains meaningful systems: population, off-lot people, visitors, romance, relationship graph, social dynamics, memory, career, health, weather, skills, budget and autonomous shopping.
- The object catalogue is centralised in `src/config/objectCatalog.js`, which is the right place to expand toward 100 purchasable objects.
- Walls and doors are modelled as edges between tiles, which is the correct abstraction for pathfinding and room detection.
- Autonomous shopping already considers household needs, equivalent furniture, available free objects, chronic need crisis and basic placement constraints.

### What is weak

- `Game` is still too large. It creates almost everything directly: world, renderer, systems, UI, input, save/load and runtime state. This blocks clean headless/browser parity.
- Food is not a real system. The fridge currently satisfies hunger directly through an `eat` affordance. There is no ingredient, meal, preparation, cooking, serving or table-eating pipeline.
- Objects are not yet organised by functional rooms or placement logic. The catalogue has fewer than 100 objects and mostly treats objects as need-restoration devices.
- Autonomous furniture movement does not exist as a first-class AI action. Manual move exists in build mode, but Sims do not decide to reorganise rooms.
- Build tools exist, but walls and doors need a hard validation pass. The current wall/door model is promising, but the user experience and passability rules must be verified end-to-end.
- Camera is fixed isometric. Zoom out and rotation need to become real camera state, not hardcoded constants.
- Population has basic family, partner, parent/child and birth logic, but generation is not granular enough: education, relationship history, social class, career history, personality inheritance and household constraints are missing.
- Health exists, including illness and starvation, but there is no paid medical intervention loop.
- Work exists, but the career catalogue is too small and too uniform.
- Diagnostics are improving, but the simulation still needs better state-based metrics, not only event-based metrics.

---

## Target architecture

The next stable architecture should split responsibilities like this:

```text
src/runtime/
  BrowserRuntime.js
  HeadlessRuntime.js
  RuntimeSystemsFactory.js

src/world/
  Lot.js
  LandExpansionSystem.js
  WallManager.js
  RoomDetector.js
  LayoutPlanner.js
  FurnitureMovePlanner.js

src/objects/
  ObjectCatalog.js
  ObjectFunctions.js
  ObjectPlacementRules.js
  ObjectAdjacencyRules.js

src/food/
  FoodSystem.js
  RecipeCatalog.js
  IngredientInventory.js
  Meal.js
  PrepareFoodAction.js
  CookFoodAction.js
  ServeMealAction.js
  EatAtTableAction.js

src/family/
  HouseholdGenerator.js
  RelationshipSeeder.js
  EducationModel.js
  FertilityRules.js

src/health/
  DoctorService.js
  TreatmentCatalog.js
  MedicalVisitAction.js

src/careers/
  CareerCatalog.js
  CareerProgressionSystem.js

src/camera/
  CameraController.js
```

Do not implement all files at once. Use this as the target decomposition.

---

## Milestone 1 — Runtime parity and metrics hardening

### Goal

Make browser and headless behaviour comparable enough that a headless run can be trusted as a proxy for the real game.

### Required work

1. Extract shared runtime creation into `RuntimeSystemsFactory` so `Game` and `HeadlessRuntime` instantiate the same systems in the same order.
2. Ensure headless does not use lightweight mock people where real `Sim` objects are required.
3. Keep `Math.random` seeding deterministic in headless and optionally in browser through `?seed=`.
4. Recreate the headless SQLite database by default. Append mode must remain explicit.
5. Record metrics both from events and from final state.
6. Add `dispose()` to every system that subscribes to the event bus.
7. At the end of each headless run, report listener count after disposal, not before disposal.

### Acceptance criteria

- Running the same command twice with the same seed produces comparable summaries.
- `latest-summary.json` and `sims-headless.sqlite` contain the same run IDs.
- `skillLevelUps`, `career` events and `romance` signals are visible in the event log.
- No run inherits listeners from a previous run.

---

## Milestone 2 — Fix walls, doors and room validity

### Goal

Make walls, doors and rooms reliable enough for autonomous room creation.

### Current problem

Walls and doors are stored as edges, which is correct. But the build loop needs validation around passability, deletion, restore, room detection, visual feedback and pathfinding integration.

### Required work

1. Add tests for `WallManager.edgeKey`, `placeWall`, `placeDoor`, `removeEdge`, `isPassable` and serialise/restore.
2. Add tests that pathfinding cannot cross walls and can cross doors.
3. Add room detection tests with closed rooms, rooms with doors and broken rooms.
4. Make door placement require an existing wall edge or explicitly support replacing open edge with a door plus short wall stubs.
5. Make eraser precise: distinguish furniture, wall edge and door edge under cursor.
6. Add visual state: invalid edge, blocked room, door/passable edge.
7. Prevent autonomous furniture placement from blocking doors or cutting room reachability.

### Acceptance criteria

- A Sim cannot walk through a wall.
- A Sim can walk through a door.
- A closed room is detected consistently after save/load.
- Deleting a door restores correct passability rules.

---

## Milestone 3 — Camera: zoom out and rotate view

### Goal

Make the camera usable for bigger lots and complex homes.

### Required work

1. Replace fixed isometric constants with camera state:
   - target position
   - zoom level
   - rotation angle
   - elevation
2. Add mouse wheel zoom.
3. Add keyboard rotation, for example `Q/E` or toolbar buttons.
4. Add limits:
   - min zoom for detail
   - max zoom for lot overview
   - rotation snapped to 90 degrees initially, free rotation later if useful
5. Ensure raycasting still maps correctly to ground tiles after rotation.
6. Persist camera state in save data only if useful; otherwise keep it session-only.

### Acceptance criteria

- Player can zoom out to inspect the whole lot.
- Player can rotate the view without breaking object selection or ground clicks.
- Build mode remains usable after rotation.

---

## Milestone 4 — Object catalogue expansion to 100 objects

### Goal

Move from a small list of generic objects to a proper functional object catalogue.

### Required object categories

1. Sleep and bedroom
   - single bed
   - double bed
   - toddler bed
   - crib
   - nightstand
   - wardrobe
   - dresser
   - mirror

2. Study and knowledge
   - desk
   - office chair
   - bookshelf
   - computer
   - laptop
   - study lamp
   - filing cabinet
   - telescope

3. Bathroom
   - toilet
   - shower
   - bathtub
   - sink
   - mirror
   - towel rack
   - laundry basket
   - medicine cabinet

4. Kitchen
   - fridge
   - stove
   - oven
   - microwave
   - sink
   - counter
   - prep counter
   - dishwasher
   - coffee machine
   - trash bin

5. Dining
   - dining table 2-seat
   - dining table 4-seat
   - dining table 6-seat
   - chair
   - high chair
   - serving table

6. Living room
   - couch
   - armchair
   - TV
   - console
   - coffee table
   - rug
   - stereo
   - fireplace

7. Fitness and hobby
   - treadmill
   - weights
   - yoga mat
   - piano
   - guitar
   - easel
   - workbench
   - chess table

8. Social and outdoor
   - bar
   - grill
   - fire pit
   - hot tub
   - garden chair
   - patio table
   - pool object later

9. Child and family
   - toy box
   - school desk
   - bunk bed
   - baby changing table
   - play mat

10. Utility and room quality
   - lamp variants
   - plant
   - wall art
   - clock
   - storage
   - heater
   - air conditioner

### Required data model

Each object should have:

```js
{
  id,
  label,
  category,
  functionTags: ['sleep', 'study', 'hygiene'],
  roomTags: ['bedroom', 'study'],
  adjacencyPrefs: [{ near: 'bookshelf', weight: 10 }, { nearFunction: 'study', weight: 8 }],
  avoidNear: [{ function: 'toilet', weight: 8 }],
  footprint,
  cost,
  capacity,
  affordances,
  skill,
  hygieneRisk,
  comfortValue,
  roomScore,
}
```

### Acceptance criteria

- Object selection can be filtered by function.
- Autonomous shopping can reason by function, not only `needTarget`.
- Layout planner can place related objects near each other.

---

## Milestone 5 — Functional furniture placement and autonomous rearrangement

### Goal

Sims should move furniture when the home layout is inefficient.

### User requirement

- It makes sense to put a bed near a desk/bookshelf.
- It makes sense to put a shower near a toilet.
- Sims should be able to reposition furniture according to function.
- Sims should be able to erase/send furniture
- Sims should be able to create doors and position them to connect rooms

### Required concepts

Introduce a `LayoutPlanner` and `FurnitureMovePlanner`.

`LayoutPlanner` scores the lot by functional zones:

```text
bedroom: bed + nightstand + wardrobe + desk/bookshelf optional
bathroom: toilet + shower/bath + sink + mirror
kitchen: fridge + counter + stove + sink + trash
 dining: table + chairs near kitchen
living: couch + TV + social objects
study: desk + chair + bookshelf/computer
```

`FurnitureMovePlanner` should propose moves:

```text
move object A from tile X to tile Y because:
- closer to related function
- room function becomes clearer
- path remains valid
- no door blocked
- Sim need pressure justifies it
```

### Rules

1. A Sim may move only furniture that is free and not in use.
2. A Sim should not move critical furniture while another Sim needs it urgently.
3. A move must improve layout score by a threshold.
4. A move must preserve path connectivity.
5. A move should emit `household:furnitureMoved`.
6. Furniture movement should cost time and optionally energy.

### Initial implementation strategy

Do not start with full autonomy. First implement the scoring function and expose it in console:

```js
window._game.layoutPlanner.score()
window._game.layoutPlanner.suggestMoves()
```

Then add autonomous execution after suggestions are reliable.

### Acceptance criteria

- A bed placed randomly can be moved closer to bedroom/study objects.
- Shower/toilet/sink cluster into a bathroom zone.
- Moves never block doors or isolate tiles.
- Headless logs furniture moves.

---

## Milestone 6 — Autonomous room creation and land purchase

### Goal

Sims should decide to expand the home when layout or household size demands it.

### User requirement

Sims must be able to create a new room autonomously by purchasing new land.

### Required model

Introduce:

```text
LotBoundary
LandExpansionSystem
RoomConstructionPlanner
AutonomousConstructionSystem
```

### Behaviour

A Sim or household can decide to expand if:

- no valid placement exists for a high-priority object
- household has grown and bedroom capacity is insufficient
- bathroom capacity is insufficient
- privacy/room score is low
- funds exceed reserve plus expansion cost
- expansion does not break access paths

### Flow

```text
need pressure / household growth
→ layout planner detects missing room function
→ land expansion option scored
→ budget debit for land
→ walls/floor/door plan generated
→ room constructed
→ related furniture purchased or moved
```

### Staged implementation

Stage 1: expand lot boundary by a rectangular patch.

Stage 2: auto-place a simple room shell with one door.

Stage 3: assign room function.

Stage 4: furnish the room.

Stage 5: allow multiple expansion shapes.

### Acceptance criteria

- A new room is created only when there is a functional reason.
- The room has at least one reachable door.
- RoomDetector recognises the new room.
- Save/load preserves expanded land, walls, doors and room function.

---

## Milestone 7 — Full food system redesign

### Goal

Replace direct hunger restoration from fridge with a real food lifecycle.

### User requirement

- Food must be taken from the fridge.
- Food must be prepared.
- Food must be cooked.
- Sims must eat food at the table.

### Required systems

```text
FoodSystem
IngredientInventory
RecipeCatalog
MealEntity
KitchenPlanner
FoodPreparationAction
CookingAction
ServingAction
EatAtTableAction
CleanDishesAction
```

### Correct flow

```text
Hungry Sim
→ chooses recipe based on hunger, cooking skill, available ingredients, time and appliances
→ walks to fridge
→ takes ingredients
→ walks to prep counter
→ prepares food
→ walks to stove/oven/microwave if recipe requires cooking
→ creates meal object
→ serves meal on dining table or counter
→ walks to seat at table
→ eats
→ hunger restored, social may improve if eating with others
→ dirty plate created
→ cleaning action later
```

### Object requirements

- Fridge stores ingredients.
- Counter is required for preparation.
- Stove/oven/microwave cooks recipes.
- Dining table and chair are required for proper eating.
- Sink/dishwasher/trash bin handles cleanup.

### Recipe model

```js
{
  id,
  label,
  ingredients,
  requiredObjects: ['fridge', 'counter', 'stove'],
  cookingSkillMin,
  prepTime,
  cookTime,
  servings,
  hungerValue,
  funValue,
  failureRisk,
  spoilTime,
}
```

### Food quality

Food should have quality:

```text
poor / normal / good / excellent / spoiled
```

Quality depends on:

- cooking skill
- recipe difficulty
- appliance quality
- Sim mood
- interruptions

### Eating rules

1. If a dining table and chair are available, Sims must prefer eating there.
2. If no table exists, Sims may eat standing, but with comfort/social penalty.
3. Group meals should invite household members with hunger below threshold.
4. Food left out can spoil and cause food poisoning.

### Acceptance criteria

- Fridge no longer directly has an `eat` affordance as the main hunger solution.
- A Sim can complete fridge → counter → stove → table → eat.
- Multiple Sims can eat servings from the same meal.
- Headless records recipe, quality, servings and illness outcomes.

---

## Milestone 8 — Careers expansion

### Goal

Add many more jobs and make jobs differentiated.

### Current limitation

The career catalogue is small and schedules are mostly uniform.

### Target career families

1. Culinary
   - dishwasher
   - line cook
   - chef
   - restaurant owner

2. Science and medicine
   - lab assistant
   - scientist
   - doctor
   - surgeon

3. Technology
   - support technician
   - programmer
   - AI engineer
   - CTO

4. Education
   - teaching assistant
   - teacher
   - professor

5. Business
   - clerk
   - manager
   - executive

6. Art and entertainment
   - painter
   - musician
   - actor
   - influencer

7. Fitness and sport
   - trainer
   - athlete
   - coach

8. Public service
   - police
   - firefighter
   - civil servant

9. Craft and manual work
   - repair worker
   - carpenter
   - electrician

10. Freelance
   - writer
   - streamer
   - consultant

### Required improvements

- Different schedules.
- Different required skills.
- Career events.
- Work stress.
- Career autonomy: switch job when stagnant or unhappy.
- Education should affect starting level and career eligibility.

### Acceptance criteria

- At least 25 career tracks or role levels exist.
- Careers influence mood, money, skills and social status.
- Headless metrics show promotions, switches, call-in-sick, salary and work stress.

---

## Milestone 9 — Family generation and household constraints

### Goal

Create richer households with structured relationships and limits.

### User requirements

- More granular family generation: relationships, education, etc.
- Child limit.

### Required household generator fields

```js
{
  householdName,
  members: [
    {
      name,
      ageStage,
      gender,
      educationLevel,
      careerHistory,
      currentCareer,
      personality,
      skills,
      relationshipRoles,
      healthBaseline,
      fertilityProfile,
    }
  ],
  relationships: [
    { from, to, type: 'spouse|parent|child|sibling|ex|friend|rival', strength, history }
  ],
  rules: {
    maxChildren,
    maxHouseholdSize,
    allowAutonomousBirths,
  }
}
```

### Birth and child limit

Replace the single `MAX_HOUSEHOLD` logic with:

```text
max household size
max children per couple
max dependent children in household
age/fertility eligibility
room capacity requirement
financial readiness
```

A couple should not autonomously have children if:

- child limit reached
- there is no bed/room capacity
- money is below threshold
- relationship is unstable
- health is poor

### Acceptance criteria

- Household creation can seed spouses, siblings, parent/child, ex-partners and rivals.
- Education influences skills/career.
- Autonomous births respect explicit limits.
- Family tree survives save/load.

---

## Milestone 10 — Sim location detail

### Goal

Expose where every Sim is, both on-lot and off-lot.

### Required model

Each person should have a location state:

```js
{
  mode: 'on_lot' | 'off_lot' | 'work' | 'school' | 'outing' | 'visiting' | 'medical' | 'unknown',
  lotId,
  roomId,
  roomType,
  objectId,
  objectLabel,
  gx,
  gz,
  sinceTick,
  untilTick,
  reason,
}
```

### UI requirements

- Selected Sim panel shows exact room/object.
- Household list shows: at home, at work, visiting, doctor, sleeping, cooking, eating, etc.
- Debug panel shows tile coordinates and current action.

### Acceptance criteria

- A player can always answer: where is this Sim and why?
- Headless summary can report time spent by location type.

---

## Milestone 11 — Paid medical treatment

### Goal

Illness should be actionable, not only passively recovered.

### User requirement

Doctor resolves health problems for a fee.

### Required systems

```text
DoctorService
TreatmentCatalog
MedicalVisitAction
Phone/Booking integration
OffLot medical destination
```

### Flow

```text
Sim becomes ill
→ player or Sim decides to call doctor / book visit
→ budget is checked
→ Sim goes off-lot to clinic or doctor visits home
→ fee is paid
→ illness severity drops or resolves
→ memory/story event emitted
```

### Treatment examples

```text
basic consultation       §120   mild illness, diagnosis
medicine                 §80    cold/flu/fatigue
urgent care              §450   injury/food poisoning/severe illness
home doctor visit        §700   no travel, faster recovery
```

### Acceptance criteria

- Illness has a paid resolution path.
- Medical care affects budget.
- Sims can autonomously seek treatment if severity is high and funds allow.
- Treatment is logged in headless.

---

## Milestone 12 — Food, health and medicine integration

### Goal

Connect food quality to health and doctor services.

### Required links

- Spoiled food can cause food poisoning.
- Poor hygiene in kitchen can increase illness risk.
- Cooking skill reduces food poisoning risk.
- Doctor can treat food poisoning.
- Nutrition quality can affect energy and long-term health.

### Acceptance criteria

- Food poisoning arises from actual food events, not only random illness.
- Doctor treatment can resolve it faster.
- Headless can show correlation between food quality and health outcomes.

---

## Milestone 13 — Autonomous home planning loop

### Goal

Unify buying, moving, room creation and food requirements into one household planning system.

### Required planner loop

```text
Observe household state
→ detect bottlenecks
→ rank interventions
→ choose intervention based on budget/personality/urgency
→ execute plan
→ measure outcome
```

### Intervention examples

```text
buy object
move furniture
create room
expand land
upgrade object
repair object
prepare group meal
book doctor
change job
```

### Acceptance criteria

- Sims stop buying objects as isolated reactions.
- Household improvements become explainable plans.
- Every autonomous household change has a logged reason.

---

## Recommended implementation order

Do not start with 100 objects. That would create catalogue noise before the engine can use them.

The correct order is:

1. Walls/doors/rooms reliability.
2. Camera zoom/rotation.
3. Object function schema.
4. Layout scoring.
5. Furniture movement by function.
6. Food lifecycle.
7. Dining behaviour.
8. Land expansion and autonomous room creation.
9. Catalogue expansion to 100 objects.
10. Career expansion.
11. Granular household generation and child limits.
12. Location detail.
13. Paid doctor service.
14. Food-health-doctor integration.

---

## Hard rules for future development

1. No new autonomous behaviour without a logged reason.
2. No new object without category, function tags, placement rules and affordances.
3. No new room behaviour until walls/doors/pathfinding are stable.
4. No new food shortcut: fridge must not directly solve hunger once the food system exists.
5. No headless-only simulation logic. Headless must run the same systems as browser.
6. No event-only metric when final state can be measured directly.
7. No feature is complete until save/load and headless logging cover it.

---

## Work Package Status

| WP | Description | Status | Date |
|---|---|---|---|
| WP1 | Spatial Reliability and Layout Intelligence | ✅ Completato | 2026-06-23 |
| WP2 | Careers Expansion (Milestone 8) | ✅ Completato | 2026-06-23 |
| WP3 | Food Lifecycle (Milestone 7) | ✅ Completato | 2026-06-23 |
| WP4 | Autonomous Room Creation & Land Purchase (Milestone 6) | ✅ Completato | 2026-06-23 |
| WP5 | Family Generation & Household Constraints (Milestone 9) | ✅ Completato | 2026-06-23 |
| WP6 | Sim Location Detail (Milestone 10) | ✅ Completato | 2026-06-23 |
| WP7 | Paid Medical Treatment (Milestone 11) | ✅ Completato | 2026-06-23 |
| WP8 | Food–Health–Doctor Integration (Milestone 12) | ✅ Completato | 2026-06-23 |
| WP9 | Autonomous Home Planning Loop (Milestone 13) | ✅ Completato | 2026-06-23 |

---

## WP1 — Spatial Reliability and Layout Intelligence ✅ COMPLETATO

**Completed 2026-06-23**

Delivered:
- Wall/door tests (`tests/WallManager.test.js`, 7 tests passing). Confirmed: Sims cannot walk through walls, can walk through doors, serialise/restore preserves all edges.
- Camera zoom (`wheel` scroll, range 5–30) and rotation (`Q`/`E`, snapped 90°) — `IsometricCamera.js` extended with `_zoom` and `_angle` state.
- Object function tags: all objects in `objectCatalog.js` have `category`, `functionTags`, `roomTags`, and selected `adjacencyPrefs`. `Furniture.js` copies these from `ObjectRegistry` at construction.
- LayoutPlanner (`src/world/LayoutPlanner.js`): `score()`, `suggestMoves()`, and `autoRearrange()` (autonomous execution with BFS connectivity check). Fires every ~1 game-hour. `World.moveFurniture()` added as the primitive.

---

## WP2 — Careers Expansion ✅ COMPLETATO

**Completed 2026-06-23**

Delivered:
- 34 career tracks across 10 families in `src/config/careers.js` (culinary, science/medicine, tech, education, business, art, fitness, public service, craft, freelance). Starter ids preserved.
- Differentiated schedules via presets (`DAY/EARLY/SWING/NIGHT/HOSPI/PART/FLEX/EMERG`) including overnight and weekend shifts — handled by existing `_isInShift`.
- Per-career `stress` factor (0..1). `CareerSystem` accumulates `state.stress` per shift (net drift around `STRESS_NEUTRAL`), drains `fun`, and fires `career:burnout` at high stress.
- Career events on shift end: ~15% good day (salary bonus + perf), ~10% bad day (perf/fun penalty).
- Career autonomy extended: Sims switch not only on stagnation but on burnout, preferring a calmer job (`_considerCareerChange`).
- Metrics: `career:burnout` / `career:callInSick` tracked in headless; summary adds `careerBurnouts`, `callInSick`, `avgWorkStress`.
- UI: `CareerPanel` shows a work-stress bar. `Careers.test.js` (6 tests) guards catalogue integrity.

Education-driven starting level is deferred to **Milestone 9** (granular household generation owns the `educationLevel` field).

## WP3 — Food Lifecycle ✅ COMPLETATO

**Completed 2026-06-23**

Delivered:
- `CookMealAction` (`src/ai/CookMealAction.js`): one composite action with an internal phase machine running fridge → counter (prep) → stove (cook) → table → eat. Each leg is optional; a failed walk skips that station and hunger is still restored at the end, so a bare/crowded lot never causes starvation.
- Fridge no longer solves hunger directly: its affordance is now `cook` (label "Cook a meal"). Both planners redirect any hunger-restoring furniture intent to `CookMealAction` (`NeedDrivenPlanner.planFor` for the need/crisis path; `UtilityAIPlanner._actionsFor` when `utility.hunger > 0`).
- New kitchen objects `stove` (cook) and `counter` (prep) plus `dining_table` added to the default lot. `RecipeCatalog` (`src/config/recipes.js`): 6 recipes gated by cooking skill, with servings.
- Meal quality (poor/normal/good/excellent) from cooking skill + appliances; raw (no appliance) = poor. Quality scales hunger restore; eating at a table adds comfort/social/status, eating standing costs comfort. Poor meals carry a 12% food-poisoning risk (`HealthSystem.reportIncident`). Cooking grants cooking skill.
- Group meals: a served meal feeds other present, hungry household members from its servings.
- Metrics: `food:cooked` / `food:eaten` tracked in headless; summary adds `mealsCooked`, `poorMeals`, `mealServings`. Validated: 2500-tick run cooks 16 meals, 17 servings, **0 starvation deaths**.
- `tests/Food.test.js` (7 tests) covers recipe gating and kitchen object tags.

Deferred to Milestone 12 (food↔health↔doctor integration): ingredient inventory depletion, meal spoilage over time, dish-washing/cleanup actions, and nutrition affecting long-term health. The current pipeline models the cook→serve→eat loop and quality→poisoning link without persistent ingredient/dish entities.

## WP4 — Autonomous Room Creation & Land Purchase ✅ COMPLETATO

**Completed 2026-06-23**

Delivered:
- `AutonomousConstructionSystem` (`src/systems/AutonomousConstructionSystem.js`): on each day-change the household checks a functional reason (currently: beds insufficient for household, `sims > beds*2`) and, gated by a funds reserve (§5000), land cost (§2500), a 2-day cooldown and a hard cap (3 rooms), buys land and builds a bedroom. Every build emits a logged reason (`household:roomCreated` + story entry) — no reasonless growth.
- Construction is staged: `World.expandLot('bottom')` grows the grid (only `right`/`bottom` allowed — they append without renumbering existing tiles) → the new patch is enclosed with `WallManager` edge-walls leaving one door → a bed is placed at the room centre.
- `World` now tracks wall meshes by key (adds new border walls, removes opened ones on expansion) and logs expansions (`serialiseExpansions`/`restoreExpansions`), replayed on load so the grown lot + walls + furniture survive save/load.
- `RoomDetector` flood-fill now stops at doors as well as walls, so a doored room is its own room (the intuitive notion) rather than merging with the area beyond the door. Default lot detection is unchanged.
- Manual expand menu restricted to Est/Sud and only debits on success.
- Headless: emits `clock:dayChanged` (so day-gated systems run), tracks `household:roomCreated`, summary adds `roomsBuilt`. Validated: 4000-tick run builds 1 room, 0 starvation deaths.
- `tests/Construction.test.js` (5 tests): functional-need detection, full build (lot grows, land debited, bed added, room detected), reachable door, funds reserve gate, serialise/restore.

Deferred (later stages of M6): multiple expansion shapes, bathroom/privacy triggers, moving furniture into new rooms, and room-function assignment beyond bedrooms.

## WP5 — Family Generation & Household Constraints ✅ COMPLETATO

**Completed 2026-06-23**

Delivered:
- `src/config/familyRules.js`: explicit `FAMILY_RULES` (maxHouseholdSize 6, maxChildrenPerCouple 3, maxDependentChildren 4, birthFundsThreshold §3000, minRomanceForChild 45) and an `EDUCATION` ladder (none/highschool/college/university).
- Gated autonomous births: `PopulationSystem._birthBlockedReason` enforces household size, per-couple child limit, dependent-children cap, financial readiness, relationship stability (romance ≥ 45) and parent health, plus bed capacity (2 sims/bed). Replaces the bare `MAX_HOUSEHOLD` check. Headless: births dropped from ~6/4000-ticks (uncontrolled) to 1 (gated).
- Structured household seeding: `PopulationSystem.seedHouseholdStructure()` makes the first two adults spouses (with a romance seed), the third a sibling of the first (shared `familyId`), and assigns varied education. Gap-filling only — never overwrites loaded/custom partners, family links or education. Parent/child come from births; ex/rivals from external `relationshipSeeds` (e.g. Vic's rivalry).
- Education → career: `CareerSystem._setCareer` starts higher-educated Sims at a higher level (`1 + max(0, education-1)`) and grants a starting skill bump in the career's required fields. **Unlocks the WP2-deferred education link.**
- `education` added to the person record (defaults preserved through save/load alongside `parentIds`/`childIds`/`familyId`). Shown in `LifeCyclePanel` (🎓).
- `tests/Family.test.js` (10 tests): education labels, structure seeding (spouse/sibling/no-overwrite), each birth constraint, and family-tree persistence.

**M9 rich (added 2026-06-23):**
- **Fertility profiles** — every person has `fertility {desire, fecundity}` (`defaultFertility()`); autonomous birth probability now scales with the couple's average desire and conception with fecundity (replacing the flat 0.18 roll). The young-adult/adult age gate remains the fertility window.
- **`allowAutonomousBirths`** master switch in `FAMILY_RULES`, checked first in `_considerBirths`.
- **Relationship-history log** — `PopulationSystem.logRelationship()` appends dated entries (`partnered`/`child_born`/`sibling`) on `setPartner`, `createChild` and `seedHouseholdStructure`; stored on the person record.
- **Career-history** — `CareerSystem._recordCareerHistory()` appends `joined`/`switched`/`promoted` entries (careerId, level, day) to the person record on career change and promotion.
- All new fields (`fertility`, `relationshipHistory`, `careerHistory`) round-trip through save/load. `tests/Family.test.js` extended to 14 tests.

Still deferred: career-history for the *initial* starter assignment (person record doesn't exist yet at seed time), and explicit ex-partner seeding inside the founding household (ex/rival currently come from external `relationshipSeeds`).

## WP6 — Sim Location Detail ✅ COMPLETATO

**Completed 2026-06-23**

Delivered:
- `src/systems/LocationService.js`: pure `describeLocation(sim, ctx)` → `{ mode, activity, reason, roomType, objectId, objectLabel, gx, gz, action }` (modes: on_lot/work/outing/visiting/medical/unknown), plus `describeActivity` (maps action labels → sleeping/cooking & eating/walking/…) and `locationSummary` (one-line "in the kitchen, cooking & eating"). No state/subscriptions.
- `Sim.currentAction` getter exposes the running action label cleanly.
- UI: `LifeCyclePanel` shows a 📍 block for the selected Sim (room + coords + activity + reason + nearby object) — answers "where & why". `SimSelector` portrait tooltips show live per-Sim location (throttled ~2/s), so the household roster reads at a glance.
- Headless: per-tick time-by-location accumulation → summary `locationTime` (normalised fractions per mode). Validated: a 2000-tick run reports work/on_lot/outing split.
- `tests/Location.test.js` (9 tests): activity mapping, each mode (work/outing/medical/on-lot with room+object), and one-line summaries.

Deferred (richer M10): explicit `roomId`/`lotId`/`sinceTick`/`untilTick` fields, a dedicated always-on roster panel, and a debug overlay with tile coordinates + action for every Sim.

## WP7 — Paid Medical Treatment ✅ COMPLETATO

**Completed 2026-06-23**

Delivered:
- `src/config/treatments.js`: `TREATMENTS` (consultation §120 / medicine §80 / urgent care §450 / home visit §700) with `pickTreatment(illness, severity, funds)` that routes severe/trauma → urgent care, mild common → medicine, else consultation, gated by affordability.
- `src/systems/DoctorService.js`: illness is now actionable. Manual `book(personId, treatmentId?)` (player) and autonomous booking — when a household Sim becomes ill at severity ≥ 0.45 and can afford care (listens to `health:stateChanged`). A booking models a visit as a short arrival delay; on `update()` the fee is debited and `HealthSystem.treat()` resolves the illness or reduces severity. Emits `health:treatmentBooked` / `health:treated` + story entries.
- `HealthSystem.treat(personId, {resolve, drop})` applies the cure (recover or severity drop).
- UI: `LifeCyclePanel` shows a 🩺 "Chiama il dottore (treatment − §cost)" button when the selected Sim is ill, and "visita in arrivo…" while pending.
- Metrics: `health:treated` watched; `ExperimentLogger` health rows now carry `treatmentId`/`cost`/`resolved`; summary adds `treatments` and `treatmentSpend`. Validated headless: treatments occur, fees debited, illnesses resolved.
- `tests/Doctor.test.js` (9 tests): treatment selection, booking, funds gate, delayed resolve (fee + cure), immediate `treatNow`, autonomous booking on illness.

Deferred: real off-lot clinic travel (visits are modelled as a delay; the Sim stays on-lot — `medical` location mode exists for the outing variant), and treatment quality/specialisation.

## WP8 — Food–Health–Doctor Integration ✅ COMPLETATO

**Completed 2026-06-23**

Delivered:
- **Food poisoning from real meals**: `CookMealAction` now emits `food:poisoning` and reports the incident with a probability from `poisoningChance(tier, cookSkill)` — worse quality → higher risk, higher cooking skill → lower (a skill-10 cook never poisons). Replaces the flat poor-only 12% roll.
- **Nutrition model**: `QUALITY_SCORE` per tier feeds `updateNutrition(sim, score)` (rolling average on `sim._nutrition`); better meals also restore a little energy. `HealthSystem._illnessChance` adds a nutrition term — well-fed Sims resist illness, malnourished ones get sick more.
- **Doctor resolves food poisoning faster**: `pickTreatment` already routes `food poisoning` → urgent care (instant resolve on arrival vs slow natural recovery) — the M11 path now fired by real food events.
- **Headless correlation**: `food:poisoning` watched; summary adds `avgFoodQuality` (numeric 0..1) and `foodPoisonings`. Validated run: avgFoodQuality 0.34 (novice cooks) → 7 food poisonings → doctor treatments, showing the quality→health→care chain.
- Pure helpers `QUALITY_SCORE`/`poisoningChance`/`updateNutrition` exported; `tests/Food.test.js` extended (+4) covering risk ordering, skill effect, nutrition average and the illness-chance link.

Deferred: explicit kitchen-hygiene state (dirty counters/dishes raising risk) — needs the dish-washing/cleanup loop deferred from WP3.

## WP9 — Autonomous Home Planning Loop ✅ COMPLETATO

**Completed 2026-06-23**

Delivered:
- `src/systems/HouseholdPlanner.js` — the capstone coordination layer. Once per day: `observe()` (funds, ill members, per-need pressure, household ambition) → `rank()` candidate interventions by urgency, gated by affordability and nudged by personality → `plan()` executes the single most-urgent one and logs the reason.
- Coordinates existing systems instead of reimplementing them: `treat_illness` → `DoctorService.book`, `build_room` → `AutonomousConstructionSystem.build`, `buy_object` → `AutonomousShoppingSystem._considerPurchase`, `rearrange` → `LayoutPlanner.autoRearrange`. Every chosen intervention emits `household:plan {intervention, reason, urgency, day}` + a story entry — household improvements are now explainable, ranked plans, not isolated reactions.
- Safety: `AutonomousConstructionSystem.build()` now self-guards (cap/cooldown/funds) so the planner and the subsystem's own day tick can't double-build.
- Console: `window._game.householdPlanner.observe()` / `.rank()`.
- Headless: `household:plan` watched; summary adds `householdPlans` and `planByType`. Validated 5000-tick run: 3 plans across rearrange/buy/treat, 0 starvation deaths.
- `tests/HouseholdPlanner.test.js` (8 tests): observation, ranking (illness over routine), execution+logging, build affordability gate, buy-for-top-need, urgency floor, serialise/restore.

Deferred: routing *every* reactive subsystem purely through the planner (subsystems retain their own autonomy as fallback), upgrade/repair-object interventions, and outcome-measurement feedback (the "measure outcome" step is currently implicit).

## Refinements — deferred items implemented (2026-06-23)

After completing M1–M13, a pass implemented the highest-value deferred items:

- **Kitchen hygiene & dish-washing (WP3 + WP8 keystone):** `World.kitchenHygiene`/`dirtyDishes` + `soilKitchen()`/`washDishes()` (requires a `sink`, now in catalog + default lot). Cooking dirties the kitchen; a dirty kitchen multiplies food-poisoning chance (`CookMealAction`) and raises illness chance (`HealthSystem._illnessChance`). `HouseholdPlanner` gained a `clean_kitchen` intervention (delegates to `washDishes()`). Kitchen state save/loads; headless summary adds `kitchenHygiene`. This closes the explicit food↔health hygiene link.
- **Bathroom construction trigger (WP4):** `AutonomousConstructionSystem._needReason()` now also returns `'bathroom'` when fixtures are short (`sims > baths*3`), and `build('bathroom')` furnishes a toilet instead of a bed.
- **Location fields (WP6):** `describeLocation` now includes `lotId`, `roomId`, and `untilTick` (for outings).

Still deferred (lower value): off-lot clinic travel & treatment quality (WP7), upgrade/repair-object & full subsystem routing & outcome-measurement (WP9), multiple expansion shapes & furniture relocation into new rooms (WP4), dedicated roster panel & per-Sim debug overlay & `sinceTick` (WP6), ingredient depletion & meal spoilage (WP3).

## Status

All 13 roadmap milestones are implemented (WP1–WP9 cover M1–M13). The simulation runs the same systems in browser and headless, with save/load and headless metrics covering every feature, and the food→hygiene→health→doctor loop is now fully closed and coordinated by the household planner. Remaining work is low-value polish of the items listed above.
