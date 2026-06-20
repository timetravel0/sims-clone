# Sims Clone — Technical Reference

> Last updated: Sprint 1 — Memory System & Secondary Emotions

---

## Architecture Overview

```
sims-clone/
├── index.html                  Entry point, CSS design system, DOM scaffold
├── src/
│   ├── main.js                 Bootstrap: instantiates Game
│   ├── core/
│   │   ├── Game.js             Orchestrator: scene, loop, input, systems
│   │   ├── GameLoop.js         Fixed-timestep loop (60 UPS, uncapped render)
│   │   └── EventBus.js         Pub/Sub decoupling (bus.on / bus.emit)
│   ├── world/
│   │   ├── World.js            Scene construction, furniture placement, DoorManager
│   │   ├── TileMap.js          16×16 grid — FLOOR/WALL/FURNITURE/DOOR tile types
│   │   ├── IsometricCamera.js  OrthographicCamera, pan/zoom, focusOn()
│   │   └── DoorManager.js      Animated doors, path resolution
│   ├── entities/
│   │   ├── Sim.js              Entity root: mesh, needs, mood, emotions, brain
│   │   ├── SimNeeds.js         8-axis need model with personality-modulated decay
│   │   ├── SimEmotions.js      Secondary emotions: joy/jealousy/grief/pride/…
│   │   ├── Mood.js             Primary mood tier (need average + emotion bonus)
│   │   ├── Personality.js      5-trait model: outgoing/neurotic/playful/nice/ambitious
│   │   └── SimBrain.js         AI controller: planner → action queue → override
│   ├── ai/
│   │   ├── NeedDrivenPlanner.js  Selects critical need → target furniture (memory-biased)
│   │   ├── ActionQueue.js        FIFO FSM: enter/update/exit lifecycle
│   │   ├── Action.js             WalkToAction, UseObjectAction, IdleAction
│   │   ├── SocialAction.js       Personality-aware social interactions
│   │   └── Pathfinder.js         A* on TileMap grid
│   ├── systems/
│   │   ├── MemorySystem.js     Episodic memory store (per-Sim, intensity decay)
│   │   ├── NarrativePlanner.js Story beat generator (emergent narrative events)
│   │   └── SocialManager.js    Relationship graph: score ±100, interact(), relationsOf()
│   ├── ui/
│   │   ├── UIManager.js        Instantiates all panels, wires bus events
│   │   ├── NeedsPanel.js       Right panel: need bars, mood, traits
│   │   ├── SimStatusLog.js     #sim-status (action) + #sim-missing (need) + story feed
│   │   ├── SimSelector.js      Portrait strip (top-left)
│   │   ├── RelationshipPanel.js  ♥ panel: sorted rel rows with score
│   │   ├── ClockDisplay.js     Clock display (top-right toolbar)
│   │   ├── BuildPanel.js       Furniture placement UI
│   │   └── SpeechBubble.js     DOM bubbles anchored to Sim world position
│   └── utils/
│       └── Logger.js           Centralised log (info/warn/error)
└── docs/
    ├── TECHNICAL.md            ← this file
    └── FUNCTIONAL.md           User-facing feature documentation
```

---

## Core Systems

### Game Loop (`core/GameLoop.js`)

Fixed-timestep update at **60 UPS** with uncapped render. The update callback receives `dt` in **real seconds**; all game logic multiplies by `clock.speed` (1×/2×/5×) to get `scaledDt`.

```
real dt → Game._update(dt)
  scaledDt = dt × clock.speed
  sims.forEach(s => s.update(scaledDt))
  memorySystem.update(scaledDt)
  narrativePlanner.update(scaledDt)
  world.update(scaledDt)
```

### Event Bus (`core/EventBus.js`)

Lightweight pub/sub. All cross-system communication flows through `bus.emit()` / `bus.on()`. No direct references between systems.

**Key events:**

| Event | Payload | Producer | Consumers |
|---|---|---|---|
| `sim:selected` | `{ sim }` | Game | UIManager, RelationshipPanel, SimStatusLog |
| `simNeeds:update` | `{ simId, values }` | SimNeeds | NeedsPanel, SimStatusLog |
| `sim:moodChanged` | `{ simId, name, from, to, tier }` | Mood | MemorySystem, NarrativePlanner, SimStatusLog |
| `social:interaction` | `{ idA, idB, nameA, nameB, type, score, delta }` | SocialAction | SocialManager, MemorySystem, NarrativePlanner, RelationshipPanel |
| `emotion:triggered` | `{ simId, simName, type, intensity, def }` | SimEmotions | NarrativePlanner, SimStatusLog |
| `memory:recorded` | `{ simId, memory }` | MemorySystem | NarrativePlanner |
| `need:crisis` | `{ simId, need, value }` | NeedDrivenPlanner | MemorySystem, SimStatusLog |
| `story:entry` | `{ text, cat }` | NarrativePlanner, various | SimStatusLog (story log) |
| `sim:action` | `{ simId, label }` | ActionQueue | SimStatusLog |
| `daynight:update` | `{ hour }` | Game | ClockDisplay |

---

## Entity Model — Sim

```
Sim
├── id, name, color
├── gx, gz, worldX, worldZ     — grid and interpolated world position
├── personality : Personality  — 5 trait axes [-1, +1]
├── needs       : SimNeeds     — 8 axes [0, 100], decay each tick
├── emotions    : SimEmotions  — transient secondary emotions [0, 1]
├── mood        : Mood         — composite score + tier (5 levels)
├── brain       : SimBrain     — AI controller
└── mesh        : THREE.Group  — body + head + selection ring
```

### SimNeeds decay rates (base, per second)

| Need | Rate | Personality modifier |
|---|---|---|
| hunger | 3.0 | –0.1×ambitious |
| energy | 2.5 | –0.1×ambitious |
| bladder | 4.0 | — |
| hygiene | 2.0 | +0.4×neurotic |
| social | 2.5 | +0.4×neurotic, +0.3×outgoing |
| fun | 2.2 | +0.4×neurotic, –0.25×playful |
| comfort | 1.8 | — |
| room | 0.5 | — |

### Mood calculation

```
base  = (avg_needs – 50) × 1.5
penalty modifiers: ×(1 + neurotic×0.5) if negative, ×(1 + ambitious×0.3) if negative
emotion_bonus = SimEmotions.moodBonus   clamped ±25
final = clamp(base + emotion_bonus, –100, +100)
```

Tier thresholds: `ecstatic ≥ 75`, `happy ≥ 35`, `neutral ≥ –10`, `sad ≥ –40`, `miserable < –40`.

---

## Sprint 1 — Memory System & Secondary Emotions

### MemorySystem (`systems/MemorySystem.js`)

Singleton (`memorySystem`). Stores up to **60 memories per Sim**, sorted by intensity. Memories fade at their `decayRate` (intensity units/second). At intensity = 0 they are pruned.

**Memory schema:**
```ts
{
  id        : number
  simId     : string
  type      : 'social' | 'need_crisis' | 'mood_peak' | 'life_event' | 'god_action'
  data      : object          // type-specific payload
  intensity : number          // 0.0–1.0
  valence   : number          // –1.0 (negative) to +1.0 (positive)
  gameTime  : number          // clock.hour when recorded
  decayRate : number          // default 0.002/s ≈ 8min to fade
}
```

**Auto-recording triggers:**
- `social:interaction` → memory for both participants (initiator full intensity, receiver ×0.6)
- `sim:moodChanged` → ecstatic/miserable = 0.9 intensity
- `sim:need:crisis` (DOM custom event from NeedDrivenPlanner) → intensity = `1 – value/15`

**Key API:**
```js
memorySystem.record(simId, type, data, intensity, valence, decayRate)
memorySystem.of(simId)              // all memories sorted by intensity
memorySystem.with(simId, otherId)   // memories involving another Sim
memorySystem.biasWith(simId, otherId) // [-1,+1] weighted valence toward other
```

### SimEmotions (`entities/SimEmotions.js`)

Secondary emotions are **transient** (decay at 0.03/s ≈ 33s at full). The dominant emotion overrides the Mood ring colour on the Sim mesh.

**Emotion catalogue:**

| Type | Emoji | Mood Δ | Triggered by |
|---|---|---|---|
| joy | 😄 | +15 | Positive social memory cluster |
| jealousy | 😒 | –20 | External trigger (Sprint 2: Romance) |
| grief | 😢 | –25 | Negative social + personality neurotic |
| pride | 😤 | +10 | Positive mood peak memory |
| excitement | 🤩 | +20 | External (life events, Sprint 2) |
| anger | 😠 | –18 | Negative social memory, neurotic |
| loneliness | 🌧️ | –12 | Need crisis (social type) |
| hope | 🌱 | +8 | Positive social memory, non-playful |

**Mood bonus:** sum of `(moodDelta × intensity)` for all active emotions, clamped ±25.

### NarrativePlanner (`systems/NarrativePlanner.js`)

Converts raw bus events into human-readable story entries (`story:entry`). Detects emergent beats:
- **BFF announcement** (score > 60, hug interaction) — fires once per pair
- **Rival announcement** (score < –30, insult) — fires once per pair
- **Loner** (social < 20 for > 60 sim-seconds)
- **Comeback** (miserable → happy/neutral mood change)
- **Mood crash** (→ miserable)
- **Strong emotions** (intensity ≥ 0.6 only)

---

## AI Architecture

```
SimBrain.update(dt)
  ├─ tick override safety timer (30s max)
  ├─ advance ActionQueue
  └─ if queue empty & no override:
       1. NeedDrivenPlanner.plan()   → physical needs
       2. SocialAction               → social need (if physical OK)
       3. IdleAction                 → rest
```

### NeedDrivenPlanner (memory-biased)

Per-need thresholds trigger planning. If multiple furniture pieces satisfy the same need, they are scored by `1.0 + memorySystem.biasWith(simId, 'furniture:id')` — Sims prefer furniture with positive (or no) memories.

---

## Persistence

Save/load via `localStorage`. Payload:
```json
{
  "clock":    { "hour": 14.5, "speed": 1, "paused": false },
  "sims":     [ { "id", "name", "color", "gx", "gz", "needs", "mood", "emotions", "personality" } ],
  "memories": { "sim_1": [ ...Memory[] ], "sim_2": [ ... ] }
}
```

---

## Planned — Sprint 2: God Mode

- `src/systems/GodMode.js` — Whisper / Impose / Curse / Bless / Life Event
- `src/ui/GodPanel.js` — floating action panel
- `src/core/LifeEventBus.js` — narrative event propagation

## Planned — Sprint 3: Life Cycle

- `src/systems/AgeSystem.js` — aging, life stages
- `src/systems/CareerSystem.js` — skills, jobs, salary
- `src/systems/ScheduleSystem.js` — weekly routine auto-planning

## Planned — Sprint 4: Social Graph

- `src/systems/RelationshipGraph.js` — typed directed graph (friendship/rivalry/love/kin)
- `src/systems/RomanceSystem.js` — attraction, jealousy triggers
- `src/ui/GraphPanel.js` — node/edge visualisation
