# Sims Clone — Technical Architecture

> Last updated: 2026-06-21

## Overview

Sims Clone è un motore di simulazione sociale scritto in **JavaScript ES2022 + Three.js**.
L'architettura è **modulare e disaccoppiata**: i sistemi comunicano tramite un `EventBus`
centralizzato e non si referenziano direttamente.

---

## Struttura delle directory

```
src/
├── core/
│   ├── Game.js               Orchestratore principale, scena Three.js, input
│   ├── GameLoop.js           Fixed timestep 60 UPS + render RAF
│   └── EventBus.js           Pub/Sub globale (bus.on / bus.emit / bus.off)
│
├── world/
│   ├── World.js              Costruzione scena da TileMap, gestione furniture
│   ├── TileMap.js            Griglia N×M, walkable flag, coordinate mondo↔griglia
│   └── IsometricCamera.js    OrthographicCamera isometrica con pan/zoom
│
├── entities/
│   ├── Sim.js                Entità personaggio: mesh, needs, brain, mood
│   ├── SimNeeds.js           8 bisogni con decay rate, getAll(), get(), set()
│   ├── SimBrain.js           Controller AI: orchestra tutti i subsistemi
│   ├── Personality.js        5 tratti Big-Five-style [-1, +1]
│   ├── Mood.js               Tier statico legacy (sostituito da EmotionEngine)
│   ├── EmotionEngine.js      Motore emozionale a 2 layer (baseline + spike)
│   ├── MemorySystem.js       Memoria episodica con salience decay
│   ├── SimEmotions.js        Helper UI per animazioni emozionali
│   └── Furniture.js          Oggetti interagibili con affordance list
│
├── ai/
│   ├── NeedDrivenPlanner.js  Planner di fallback basato su soglie bisogni
│   ├── UtilityAIPlanner.js   Scorer a 6 layer, softmax pick, setBrain() wiring
│   ├── ActionQueue.js        Lifecycle enter/update/exit per sequenze di azioni
│   ├── Action.js             WalkToAction, UseObjectAction, IdleAction
│   ├── SocialAction.js       Azione sociale con tipo (chat/hug/insult/…)
│   ├── Pathfinder.js         A* su griglia con walkable mask
│   ├── ExperientialBias.js   Reinforcement learning: TD-error per affordance
│   ├── PersonalityDrift.js   Tratti che evolvono per eventi (±0.3 max dal born)
│   ├── ContextualNoise.js    Rumore deterministico circadiano + mood-gate
│   ├── GoalSystem.js         Obiettivi a medio termine, max 3 attivi, boost scorer
│   ├── SocialLearning.js     Apprendimento osservazionale da altri Sim
│   └── NeedDrivenPlanner.js  (vedi sopra)
│
├── systems/
│   └── SocialManager.js      RelationshipGraph: familiarity, affinity, score
│
├── ui/
│   ├── UIManager.js          Gestione overlay HTML
│   └── NeedsPanel.js         Barre bisogni in tempo reale
│
└── utils/
    └── Logger.js             Logging centralizzato con livelli
```

---

## Flusso di esecuzione

```
GameLoop.tick(dt)
  └─ World.update(dt)
       └─ Sim.update(dt)  [per ogni Sim]
            ├─ SimNeeds.update(dt)       — decay bisogni
            ├─ SimBrain.update(dt)       — AI tick
            │    ├─ ActionQueue.update(dt)
            │    ├─ ExperientialBias.update(dt)
            │    ├─ EmotionEngine.update(dt)   ← NEW
            │    ├─ GoalSystem.update(dt)
            │    └─ planning pipeline:
            │         1. UtilityAIPlanner.plan()  (6-layer scorer)
            │         2. NeedDrivenPlanner.plan() (fallback fisico)
            │         3. SocialAction fallback
            │         4. IdleAction
            └─ Sim.updateMesh()         — animazioni Three.js
```

---

## Layer di scoring UtilityAIPlanner

| # | Layer | Formula | Peso |
|---|---|---|---|
| 1 | Need pressure × utility | `(100-need)/100 × utility × traitWeight` | dominante |
| 2 | Relationship bonus | `familiarity×0.05 + score×0.03` | +0–15 |
| 3 | Distance penalty | `-dist × 0.35` | −0–5 |
| 4 | ExperientialBias | `bias × 1.8` | ±27 max |
| 5 | GoalSystem boost | `matchScore × weight × 8` | +0–8 |
| 6 | ContextualNoise | `noise(seed,hour,mood) × 4` | +0–4 |

Selezione finale: **softmax sui TOP_K** (non random piatto).

---

## MemorySystem

- Capacità: 40 entries per Sim
- Eviction: lowest salience (non FIFO)
- Salience: `intensity × e^(-age/3600) × (1 + 0.15×recalled)`
- API: `record()`, `query(filter)`, `topN(n)`, `biasWith(otherId)`, `recall(id)`
- Auto-popola da bus: `social:interaction`, `object:used`, `career:levelUp`, `goal:*`, `romance:*`

---

## EmotionEngine

- **Layer 1 (baseline)**: media bisogni → tier 0–4, modulata da neurotic/playful
- **Layer 2 (spike)**: eventi bus → spike con type/intensity/duration/decayRate
- **Combined tier**: `clamp(baseline + netSpikeBias, 0, 4)`
- Emotion types: joy, anger, sadness, fear, surprise, embarrassment, love, pride, guilt
- Personalità modula l'intensità di ogni tipo (neurotic→anger/sadness harder, nice→guilt harder)
- Emette `sim:moodChanged` al cambio di tier

---

## EventBus — eventi principali

| Evento | Payload | Emesso da |
|---|---|---|
| `social:interaction` | `{idA, idB, delta, type, score}` | SocialAction |
| `object:used` | `{actorId, furnitureType, moodDelta}` | UseObjectAction |
| `sim:moodChanged` | `{simId, from, to}` | EmotionEngine |
| `sim:encountered` | `{observerId, subjectId, memorySystem}` | Sim (proximity) |
| `emotion:spike` | `{simId, type, intensity}` | EmotionEngine |
| `memory:recorded` | `{simId, memory}` | MemorySystem |
| `goal:created` | `{simId, goal}` | GoalSystem |
| `goal:completed` | `{simId, goal}` | GoalSystem |
| `goal:failed` | `{simId, goal}` | GoalSystem |
| `career:levelUp` | `{simId}` | CareerSystem |
| `career:fired` | `{simId}` | CareerSystem |
| `romance:formed` | `{idA, idB}` | SocialManager |
| `romance:broken` | `{idA}` | SocialManager |
| `bias:updated` | `{simId, key, bias, error}` | ExperientialBias |
| `personality:drifted` | `{traits}` | PersonalityDrift |
| `story:entry` | `{text, cat}` | GoalSystem / vari |
| `life:event` | `{simId, type, valence}` | vari sistemi |

---

## Serializzazione / Save-Load

Ogni subsistema espone `serialise()` e `restore(data)`.
`SimBrain.serialise()` aggrega:

```js
{
  expBias    : { [affordanceKey]: number },
  drift      : { born: { outgoing, neurotic, playful, nice, ambitious } },
  goalSystem : Goal[],
  memory     : MemoryEntry[],
  emotions   : { baselineTier, spikes[] }
}
```

---

## Dipendenze esterne

| Libreria | Versione | Uso |
|---|---|---|
| Three.js | r165 | Rendering 3D, camera, luci |
| (nessuna altra) | — | Tutto il resto è vanilla ES2022 |

---

## Prossimi passi pianificati

- [ ] GOAP Planner (pianificazione multi-step)
- [ ] DialogueSystem (conversazioni strutturate a stati)
- [ ] SkillSystem (progressione competenze da uso oggetti)
- [ ] CareerSystem (lavoro, promozioni, licenziamenti)
- [ ] SaveLoad (JSON serialisation completa su localStorage)
- [ ] Routine scheduling (agenda giornaliera)
