# Sims Clone

A browser-based isometric life simulation game built with **Three.js** and vanilla ES6 modules. Inspired by The Sims 1.

## Quick Start

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:3000` (or 8080).

No build step needed — pure ES modules via importmap.

## Architecture

```
src/
├── core/         Game loop, event bus, orchestrator
├── world/        TileMap 16×16, 3D world builder, isometric camera
├── entities/     Sim (mesh + brain + needs), Furniture
├── ai/           A* pathfinder, Action system, Need-driven planner
├── ui/           Needs panel, UI manager
└── utils/        Logger
```

## Gameplay

- **Click on a tile** to move the Sim there.
- **8 needs** (hunger, energy, bladder, hygiene, social, fun, comfort, room) decay over time.
- When a need drops below **35%**, the AI planner autonomously sends the Sim to the correct furniture.
- **Speed controls** (1× / 2× / 5×) and **pause** in the bottom toolbar.

## Furniture

| Object  | Satisfies |
|---------|----------|
| Fridge  | Hunger   |
| Bed     | Energy   |
| Toilet  | Bladder  |
| Shower  | Hygiene  |
| Couch   | Comfort  |
| TV      | Fun      |

## Next Steps

- [ ] Multi-Sim support
- [ ] Door / room system
- [ ] Build mode (place furniture)
- [ ] Save / load (IndexedDB)
- [ ] Sim moods & speech bubbles
- [ ] Day/night cycle
