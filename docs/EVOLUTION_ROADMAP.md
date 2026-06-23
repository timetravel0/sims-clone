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
7. Heavy furniture may require higher fitness/handiness or multiple Sims later.

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

## Immediate next work package

The next concrete development package should be:

```text
WP1 — Spatial Reliability and Layout Intelligence
```

Scope:

- Wall/door tests and bug fixes.
- Camera zoom and rotation.
- Object function tags.
- LayoutPlanner score-only mode.
- FurnitureMovePlanner suggestion-only mode.
- Headless metrics for layout score and blocked paths.

Only after WP1 should the project move to autonomous room creation or full food simulation.

This is the most important sequencing decision: if spatial reliability is not solved first, autonomous rooms, food routing and furniture rearrangement will all be unstable.
