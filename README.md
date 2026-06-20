# Sims Clone

Browser-based isometric life sim — **Three.js** + vanilla ES6 modules. No build step.

## Quick Start

```bash
git clone https://github.com/timetravel0/sims-clone.git
cd sims-clone
npx serve .
# open http://localhost:3000
```

## Features

| Feature | Details |
|---|---|
| **Multi-Sim** | 3 Sims (Alex, Sam, Jo) — click portrait or mesh to select |
| **8 Needs** | hunger, energy, bladder, hygiene, social, fun, comfort, room |
| **AI Planner** | Autonomous need satisfaction + social seeking |
| **Doors** | Animated swing doors; auto-open when path crosses them |
| **Social Interactions** | chat, joke, compliment, hug, argue — affect relationship score |
| **Relationship Panel** | ♥ button shows Friend/Enemy scores per Sim |
| **Object Registry** | Central catalog; register custom objects in 5 lines |
| **Build Mode** | 🔨 button — place any registered object on the grid |
| **Day/Night Cycle** | 4-min day; sunrise/sunset sky, star particles, sun arc |
| **Speech Bubbles** | Need emoji + social action shown above Sim head |
| **Save / Load** | IndexedDB slot 1 persists needs, positions, relationships |

## Adding a Custom Object

```js
import { ObjectRegistry } from './src/systems/ObjectRegistry.js';
import { bus } from './src/core/EventBus.js';

ObjectRegistry.register({
  id:          'hot_spring',
  label:       'Hot Spring',
  color:       0x00acc1,
  needTarget:  'comfort',
  restoreRate: 40,
  onUse: (sim) => {
    sim.needs.restore('hygiene', 8);
    sim.needs.restore('social',  4);
  }
});

// Notify BuildPanel to refresh its catalog
bus.emit('registry:updated', {});
```

The object immediately appears in Build Mode — no other changes needed.

## Architecture

```
src/
├── core/         Game, GameLoop, EventBus
├── world/        TileMap, World, IsometricCamera, DayNightCycle, BuildMode
│                 Door, DoorManager
├── entities/     Sim, SimNeeds, SimBrain, Furniture
├── ai/           Pathfinder, Action, ActionQueue, NeedDrivenPlanner, SocialAction
├── systems/      SaveLoad, SocialManager, ObjectRegistry
├── ui/           UIManager, NeedsPanel, SimSelector, ClockDisplay
│                 BuildPanel, RelationshipPanel, SpeechBubble, ClockDisplay
└── utils/        Logger
```

## Controls

| Input | Action |
|---|---|
| Click floor tile | Move selected Sim |
| Click Sim | Select Sim |
| Click portrait (top-left) | Select Sim |
| 🔨 Build | Toggle build mode |
| ♥ Relations | Toggle relationship panel |
| 💾 Save / 📂 Load | IndexedDB slot 1 |
| 1× 2× 5× | Simulation speed |
| ⏸ Pause | Freeze simulation |
