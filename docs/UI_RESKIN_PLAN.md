# UI Reskin — Hearthside-style HUD (Implementation Plan)

> Status: planned, not yet implemented. Reference: "Hearthside Stories" screenshot.

## Context

Make the in-game UI resemble the reference screenshot: a clean **top header bar** (logo + LIVE-MODE
pill + money on the left; clock/weather + tool icons on the right), a **left vertical avatar rail**
with circular Sim portraits and a "+" button, and a rich **bottom dock** combining the selected-Sim
card, a 2-column needs grid with numeric values, an ACTION QUEUE card, transport (play/pause/speed)
controls, and a LIVE/BUILD toggle. Plus floating **name tags** above each Sim.

Today the HUD is: a horizontal portrait strip (`#sim-selector`, top-left), a vertical needs panel
(`#needs-panel`, top-right), and one bottom `#toolbar` packed with ~14 text buttons + speed + clock.
All data the new layout needs already exists (`budgetSystem.funds`, `clock.weekday/hour`,
`weatherSystem.current`, `Sim.currentAction`, `careerSystem.getInfo`, personality traits). This is
overwhelmingly an HTML-restructure + CSS task with small JS edits; **button IDs are preserved so the
existing `Game._bindToolbar` wiring keeps working unchanged.**

Decisions (confirmed with user):
- Legacy feature buttons → **slim always-visible icon strip** in the header (not collapsed to a menu).
- Floating Sim **name labels** → **yes**.

## Approach

Restructure `index.html` into three framing regions, add one new stylesheet, and make targeted edits
to four UI modules. Reuse the existing `EmotionBadge` screen-projection pattern for name labels.

### 1. `index.html` — restructure (markup containers only, no logic)
- **`#topbar`** (new header): left group = logo SVG + title + `• LIVE MODE` pill + `#topbar-funds`;
  right group = `#clock` (moved here) + **`#tool-strip`** holding the existing feature buttons
  (`btn-story, btn-rel, btn-graph, btn-god, btn-skills, btn-lifecycle, btn-party, btn-lab,
  btn-export-log, btn-save, btn-load`) — **same IDs, just relocated** — + a settings `⚙` button.
- **`#sim-dock`** (new bottom bar) replaces `#needs-panel` + the old `#toolbar`:
  - `.dock-sim-card`: avatar circle, `#sim-name`, mood line (`#sim-mood` + green status dot),
    role/career, trait chips (`#sim-traits`).
  - `#needs-bars`: kept ID, restyled as a 2-col grid (label · bar · value) — see NeedsPanel.
  - `.dock-action-queue`: "ACTION QUEUE" header + current-action card.
  - `.dock-transport`: `btn-pause`, `btn-1x/3x/5x` (moved from old toolbar) + LIVE/BUILD segmented
    control (reuses `btn-build`).
- Keep `#sim-selector` element (restyled to vertical rail via CSS); keep all other panels untouched.
- Add `<link rel="stylesheet" href="/src/styles/hud.css" />` **last** so it overrides older rules.

### 2. `src/styles/hud.css` (NEW)
All new styling: `#topbar` (flex header, blur, dark-blue tint per reference), `#tool-strip` small
icon buttons, `#sim-selector` as a left-edge vertical centered column of circular portraits +
`.rail-add` "+" button + `.sim-portrait.selected` ring, `#sim-dock` grid layout, `.dock-sim-card`,
needs grid, `.dock-action-queue` card, `.dock-transport`, `.mode-toggle` segmented control, and
`.sim-name-label` pill. Old `#needs-panel`/`#toolbar` rules become dead (elements removed); leave
them or trim — not required for correctness.

### 3. `src/ui/NeedsPanel.js`
Render into the dock card + grid: friendly need labels via a `LABELS` map (room→Environment,
autonomy→Mental wellness, others title-cased) and a numeric value per bar (`value` span, rounded).
Add helpers `setMood(label)` (text + colored dot) and `setRole(text)`. Keep `setSimName`/`setTraits`
(traits rendered as chips). Bar fill colour logic unchanged.

### 4. `src/ui/SimSelector.js`
Vertical rail: append a `.rail-add` "+" button after portraits that opens the Sim creator
(`new SimCreator().show()` — `show()` exists at `SimCreator.js:43`; store the instance on `_game`
to avoid duplicates). Add a selection highlight by listening to `sim:selected` and toggling
`.selected` on the matching portrait.

### 5. `src/ui/ClockDisplay.js`
Render `"Mon 08:00 21°C"`: weekday name from `window._game.clock.weekday` (0–6 → Mon…Sun),
zero-padded 24h hour, and a temperature derived from `weatherSystem.current` via a small state→°C
map (no real temperature model exists — `// ponytail:` synthesize from weather state). Keep the
day/night colour tint.

### 6. `src/ui/SimNameLabel.js` (NEW)
A lightweight overlay modeled on `EmotionBadge` (`src/ui/EmotionBadge.js:39-70`): one always-visible
`.sim-name-label` pill per Sim, positioned by projecting the Sim head position to screen coords each
frame, offset slightly higher than the emotion badge so they don't overlap. Methods:
`addSim/removeSim/update/destroy`.

### 7. `src/ui/UIManager.js`
- Instantiate `SimNameLabel(sims, camera, renderer)`; `addSim/removeSim` on `sim:spawned/despawned`;
  call `.update()` in `updateOverlays()`.
- On `sim:selected`, also set dock mood/role (`panel.setMood`, `panel.setRole` using
  `_game.careerSystem?.getInfo(sim.id)` + `sim._moodLabel`).
- In `updateOverlays()` (throttled), refresh the action-queue card from
  `_game.selectedSim?.currentAction` (`Sim.currentAction` exists at `Sim.js:54`).

### 8. `src/core/Game.js` (minimal)
- `renderFunds` also updates `#topbar-funds` (one extra line; keep `#bt-funds` for build panel).
- LIVE/BUILD segmented control reuses the existing `btn-build` handler in `BuildPanel.js`; add an
  active-state sync for the LIVE half on `buildMode:changed`. No other rewiring — relocated buttons
  keep their IDs and existing listeners.

### Need-label display map (cosmetic only; underlying `NEED_KEYS` unchanged)
hunger→Hunger, energy→Energy, bladder→Bladder, hygiene→Hygiene, social→Social, fun→Fun,
comfort→Comfort, room→Environment, autonomy→Mental wellness, status→Status.

## Files
| File | Change |
|---|---|
| `index.html` | restructure into `#topbar` / `#sim-dock`, relocate buttons (same IDs), link `hud.css` |
| `src/styles/hud.css` | **new** — all reskin styling |
| `src/ui/NeedsPanel.js` | dock card + labeled/numeric needs grid + mood/role/chips |
| `src/ui/SimSelector.js` | vertical rail, "+" add button, selection highlight |
| `src/ui/ClockDisplay.js` | "Wkd HH:MM ·°C" with weather |
| `src/ui/SimNameLabel.js` | **new** — floating name tags (reuses EmotionBadge projection) |
| `src/ui/UIManager.js` | wire name labels, action-queue card, dock mood/role |
| `src/core/Game.js` | topbar funds line + LIVE/BUILD active sync (minimal) |

## Verification
- **Visual (browser):** `npm run dev`, open the game. Confirm: header shows logo/LIVE/funds left and
  clock+weather+tool-strip right; left rail is a vertical circular-portrait column with a working "+"
  (opens Sim creator) and a selection ring; bottom dock shows the selected Sim card (avatar, name,
  mood+dot, role, trait chips), a 2-col needs grid with numbers, an ACTION QUEUE card reflecting the
  Sim's current action, transport controls, and a LIVE/BUILD toggle. Floating name tags track each
  Sim as the camera moves/zooms. Each tool-strip icon still opens its panel (Story, Relations, Save…).
- **Functional regression:** select different Sims (needs/mood/role update), toggle BUILD (catalog
  appears, funds reflect purchases), change speed and pause.
- **Tests:** `npx vitest run` stays green (UI is not unit-tested; this just confirms no broken
  imports). Headless is unaffected (it never loads the DOM HUD).
