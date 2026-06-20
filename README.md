# Sims Clone

A browser-based isometric life simulation game built with **Three.js** and vanilla ES6 modules.

## Quick Start

```bash
git clone https://github.com/timetravel0/sims-clone.git
cd sims-clone
npx serve .
# open http://localhost:3000
```

No build step. Pure ES modules via importmap.

## Features

| Feature | Details |
|---|---|
| **Multi-Sim** | 3 Sims (Alex, Sam, Jo) — click a portrait or a Sim to select |
| **Build Mode** | 🔨 button opens furniture catalog; click tiles to place |
| **Save / Load** | IndexedDB slot 1 — 💾 / 📂 buttons |
| **Day/Night Cycle** | 4-minute in-game day; sunrise/sunset sky + star particles |
| **Speech Bubbles** | Sim shows need emoji when AI planner kicks in |
| **8 Needs** | hunger, energy, bladder, hygiene, social, fun, comfort, room |
| **A\* Pathfinding** | Click any floor tile to move selected Sim |

## Architecture

```
src/
├── core/         Game, GameLoop, EventBus
├── world/        TileMap, World, IsometricCamera, DayNightCycle, BuildMode
├── entities/     Sim, SimNeeds, SimBrain, Furniture
├── ai/           Pathfinder, Action, ActionQueue, NeedDrivenPlanner
├── systems/      SaveLoad (IndexedDB)
├── ui/           UIManager, NeedsPanel, SimSelector, ClockDisplay, BuildPanel, SpeechBubble
└── utils/        Logger
```

## Controls

- **Click floor tile** → move selected Sim
- **Click Sim mesh** → select that Sim
- **Click portrait** (top-left) → select Sim
- **🔨 Build** → toggle build mode, click catalog item then tile to place
- **💾 Save / 📂 Load** → persist/restore to IndexedDB slot 1
- **1× 2× 5×** → simulation speed
- **⏸ Pause** → freeze simulation

## Next Steps

- [ ] Doors & room system
- [ ] Sim moods (composite of needs → single mood score)
- [ ] Social interactions between Sims
- [ ] Wall painting & floor tiling in build mode
- [ ] Multiple save slots UI
