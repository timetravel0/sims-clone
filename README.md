# Sims Clone — Prototype

Prototipo completo browser-based ispirato a The Sims, costruito con JavaScript ES modules + Three.js.

## Cosa include

- Rendering 3D isometrico con camera ortografica e pan
- Popolazione iniziale di 3 Sim selezionabili
- Tilemap 20x20 con mobili interagibili
- Sim AI autonoma need-driven
- Pathfinding A*
- Oggetti con effetti reali sui bisogni
- HUD completo: orologio, roster Sim, media needs, pannello bisogni, event log
- Save/Load JSON
- Time progression giornaliera
- Spawning dinamico di nuovi Sim

## Avvio

```bash
npx serve .
# oppure
python3 -m http.server 8080
```
Aprire `index.html` nel browser.

## Gameplay

- Clic su un Sim per selezionarlo
- Clic su una tile per comandare il movimento
- I Sim autonomi soddisfano i bisogni (frigo, letto, toilette, doccia, divano, scrivania)
- Pausa, velocità (1x/2x/5x), save JSON, load JSON

## Struttura

```
sims-clone/
├── index.html
├── src/
│   ├── main.js
│   ├── core/
│   │   ├── Game.js          # Orchestratore
│   │   ├── GameLoop.js      # Fixed timestep 60 UPS
│   │   └── EventBus.js      # Pub/Sub
│   ├── world/
│   │   ├── World.js         # Scena + tempo + furniture registry
│   │   ├── TileMap.js       # Griglia 2D
│   │   └── IsometricCamera.js
│   ├── entities/
│   │   ├── Sim.js           # Entità personaggio
│   │   ├── SimNeeds.js      # 8 bisogni con decay
│   │   ├── SimBrain.js      # Controller AI
│   │   └── Furniture.js     # Oggetti interagibili
│   ├── ai/
│   │   ├── Pathfinder.js    # A* su griglia
│   │   ├── Action.js        # WalkTo, UseObject, Idle
│   │   ├── ActionQueue.js   # Lifecycle azioni
│   │   └── NeedDrivenPlanner.js
│   ├── ui/
│   │   ├── UIManager.js
│   │   └── NeedsPanel.js
│   └── utils/
│       └── Logger.js
```

## Roadmap

- [ ] Build mode: piazzamento mobili in-game
- [ ] Social layer: interazioni Sim-to-Sim
- [ ] House system: pareti e porte
- [ ] TypeScript + ECS refactor
- [ ] Test automatici Playwright
