# Sims Clone — Functional Guide

> Last updated: Sprint 1 — Memory System & Secondary Emotions

---

## What is Sims Clone?

Sims Clone is a browser-based life simulation game inspired by The Sims. Players observe and influence the lives of autonomous characters (**Sims**) who have personalities, needs, memories, and relationships. The game runs entirely in the browser with no installation.

---

## The Sims

Each Sim is an individual with a unique combination of traits, needs, and history.

### Personalities

Every Sim has five personality axes, each ranging from –1 (strong negative) to +1 (strong positive):

| Trait | High (+) | Low (–) | Effects |
|---|---|---|---|
| **Outgoing** | Extrovert | Introvert | Initiates social interactions more often; social need decays faster |
| **Neurotic** | Anxious | Laid-back | All needs decay faster; mood swings more extreme; prone to anger/grief |
| **Playful** | Fun-loving | Serious | Prefers fun objects; tells jokes; fun need decays slower |
| **Nice** | Kind | Mean | Chooses compliments/hugs; avoids arguments |
| **Ambitious** | Driven | Lazy | Needs decay slightly slower; unsatisfied needs cause sharper mood penalty |

### The 8 Needs

Needs range from 0 (critical) to 100 (fully satisfied). They decay over time and must be satisfied by using the right furniture.

| Need | Satisfied by | Critical below |
|---|---|---|
| 🍔 Hunger | Fridge | 40 |
| 😴 Energy | Bed | 35 |
| 🚽 Bladder | Toilet | 50 |
| 🚿 Hygiene | Shower | 30 |
| 👋 Social | Interactions with other Sims | 35 |
| 🎮 Fun | TV, social play | 30 |
| 🛋️ Comfort | Couch | 25 |
| 🌿 Room | (ambient, slow) | 20 |

When a need drops below its critical threshold, the Sim's AI **automatically** plans a route to the appropriate furniture and satisfies it — without player input.

### Mood

Mood is a composite score calculated from the average of all needs, amplified by personality, and now modulated by **secondary emotions**. There are five mood tiers:

| Tier | Score | Emoji |
|---|---|---|
| Ecstatic | ≥ 75 | 🌟 |
| Happy | ≥ 35 | 😊 |
| Neutral | ≥ –10 | 😐 |
| Sad | ≥ –40 | 😢 |
| Miserable | < –40 | 😫 |

The **selection ring** under each Sim changes colour to reflect the dominant active emotion (if any), falling back to the mood tier colour.

---

## Sprint 1 — Memory & Emotions

### Episodic Memory

Sims now remember significant events. Each memory has:
- **Intensity** (0–1): how vivid it is. Fades over time.
- **Valence** (–1 to +1): whether it was positive or negative.
- **Type**: social interaction, need crisis, mood peak, life event, god action.

**Behavioural effects of memory:**
- A Sim with positive memories of another will be warmer in social interactions.
- A Sim who experienced a crisis near a piece of furniture will slightly prefer alternatives.
- Strong memories (intensity > 0.75) generate story log entries.
- Memories persist through save/load.

### Secondary Emotions

On top of the base mood, Sims can experience transient secondary emotions that last ~30 seconds:

| Emotion | Trigger | Mood effect |
|---|---|---|
| 😄 Joy | Positive social memory cluster | +15 |
| 😒 Jealousy | Watching partner interact positively with others | –20 |
| 😢 Grief | Negative social memory + neurotic personality | –25 |
| 😤 Pride | Recovering from a mood peak | +10 |
| 🤩 Excitement | Life events (Sprint 2) | +20 |
| 😠 Anger | Strong negative social memory, neurotic | –18 |
| 🌧️ Loneliness | Extended social need crisis | –12 |
| 🌱 Hope | Positive social memory, serious personality | +8 |

The dominant active emotion is shown in the **selection ring colour** and logged in the Story panel.

---

## Relationships

Relationship scores between pairs of Sims range from –100 (enemies) to +100 (best friends). Scores are updated by every social interaction.

| Score range | Label |
|---|---|---|---|
| > 60 | BFF ❤️ |
| > 30 | Friend 😊 |
| –10 to 30 | Neutral |
| –30 to –10 | Tense 😕 |
| < –30 | Enemy 😠 |

Interaction types and their score effects:

| Type | Score Δ |
|---|---|
| Hug | +15 |
| Compliment | +10 |
| Joke | +8 |
| Chat | +5 |
| Argue | –12 |
| Insult | –20 |

---

## The Story Log

The **Story Log** (left sidebar, always visible) records significant events as they happen:

- 🟢 **Positive** (green) — friendships, mood peaks, recoveries
- 🔴 **Drama** (red) — arguments, crises, mood crashes
- 🟡 **Mood** (yellow) — emotional shifts, comebacks
- 🟣 **Gossip** (purple) — jealousy, social drama
- 🩵 **Action** (teal) — what a Sim is currently doing
- 🟠 **Need** (orange) — critical need alerts

Close the log with the **✕** button; re-open with **📖 Story** in the toolbar.

---

## The Interface

### Needs Panel (top-right)
- **Sim name** and mood emoji
- **Personality traits** (italic tags)
- **Current action** (▶ label, teal)
- **Most critical need** with percentage and colour-coded urgency
- **8 need bars** with live colour (green → orange → red)

### Sim Portraits (top-left)
Click a portrait to select that Sim. The ring around the portrait reflects their current colour.

### ♥ Relations Panel
Click the ♥ button in the toolbar to toggle. Shows all relationship scores for the selected Sim, sorted best to worst, with score number and label.

### 🔨 Build Panel
Click to open the furniture catalogue. Select an item, then click a floor tile to place it.

### ⏸ Controls
| Button | Action |
|---|---|
| ⏸ Pause / ▶ Resume | Freeze/unfreeze time |
| 1× / 2× / 5× | Set simulation speed |
| 💾 Save | Save game to browser storage |
| 📂 Load | Restore last save |

---

## Controls

| Input | Action |
|---|---|
| **Left-click** on ground | Move selected Sim to tile |
| **Left-click** on Sim | Select that Sim |
| **Right-click** on Sim/object | Open context menu (actions) |

---

## Roadmap

| Sprint | Feature | Status |
|---|---|---|
| 0 | Core scaffold, needs, AI, world | ✅ Done |
| 1 | Memory system, secondary emotions, narrative planner | ✅ Done |
| 2 | God Mode (Whisper/Impose/Curse/Bless/Life Events) | 🔜 Next |
| 3 | Life cycle (aging, careers, schedules) | 📋 Planned |
| 4 | Social graph (romance, jealousy, family) | 📋 Planned |
