# Sims-clone — Tre Nuove Funzionalità

## Contesto

Tre espansioni parallele richieste:
1. **Espansione lotto** — il lotto 16×16 limita la dimensione della casa; il giocatore può acquistare terreno extra (§1500) che allarga la griglia in una direzione scelta
2. **Trasloco per amore** — un visitatore con romance ≥ 50 (entrambe le direzioni) con un Sim del nucleo può chiedere di unirsi alla famiglia; il giocatore accetta/rifiuta
3. **Obiettivo condiviso** — tutti i Sim del nucleo devono mantenere benessere medio ≥ 60% per 3 giorni consecutivi; completamento dà §500

---

## Feature 1 — Espansione lotto acquistabile

### `src/world/TileMap.js` — aggiungere `expand(direction, tiles = 8)`

Modifica `_grid` in-place, aggiorna `this.width`/`this.height`. Layout `_grid[z][x]`.

```js
expand(direction, tiles = 8) {
  if (direction === 'right') {
    const newW = this.width + tiles;
    // Old right perimeter column becomes interior (except top/bottom rows)
    for (let z = 1; z < this.height - 1; z++) this._grid[z][this.width - 1] = TILE.FLOOR;
    // Extend each row with new tiles; last column is perimeter WALL
    for (let z = 0; z < this.height; z++)
      for (let x = this.width; x < newW; x++)
        this._grid[z].push((z === 0 || z === this.height-1 || x === newW-1) ? TILE.WALL : TILE.FLOOR);
    this.width = newW;
  } else if (direction === 'bottom') {
    const newH = this.height + tiles;
    for (let x = 1; x < this.width - 1; x++) this._grid[this.height - 1][x] = TILE.FLOOR;
    for (let z = this.height; z < newH; z++) {
      const isEdge = z === newH - 1;
      this._grid.push(Array.from({ length: this.width }, (_, x) =>
        (isEdge || x === 0 || x === this.width - 1) ? TILE.WALL : TILE.FLOOR));
    }
    this.height = newH;
  }
  // 'left' / 'top' follow symmetric logic (unshift columns/rows)
}
```

### `src/world/World.js` — aggiungere `expandLot(direction, tiles = 8)`

```js
expandLot(direction, tiles = 8) {
  const oldW = this.tilemap.width, oldH = this.tilemap.height;
  this.tilemap.expand(direction, tiles);
  const geo = new THREE.BoxGeometry(1, 0.1, 1);
  for (let z = 0; z < this.tilemap.height; z++) {
    for (let x = 0; x < this.tilemap.width; x++) {
      if (this.tilemap.get(x, z) !== TILE.FLOOR) continue;
      if (this.groundMeshes.some(m => m.position.x === x && m.position.z === z)) continue;
      const mesh = new THREE.Mesh(geo, this._floorMat);
      mesh.position.set(x, -0.05, z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.groundMeshes.push(mesh);
    }
  }
  bus.emit('wall:placed'); // triggers RoomDetector.analyse()
}
```

### `src/world/RoomDetector.js` — rimuovere `const GRID = 16`

Sostituire le 4 occorrenze hardcoded con valori dinamici da `this._tileMap`:

| Linea | Prima | Dopo |
|-------|-------|------|
| 65 | `x < GRID` | `x < this._tileMap.width` |
| 66 | `z < GRID` | `z < this._tileMap.height` |
| 111 | `nx >= GRID \|\| nz >= GRID` | `nx >= this._tileMap.width \|\| nz >= this._tileMap.height` |
| 130 | `x === GRID - 1 \|\| z === GRID - 1` | `x === this._tileMap.width-1 \|\| z === this._tileMap.height-1` |

Rimuovere `const GRID = 16` dalla riga 27.

### `index.html` — pulsante in build toolbar

```html
<button class="bt-tool" id="btn-expand-lot">🏗️ Espandi §1500</button>
```

### `src/core/Game.js` — handler espansione

In `_init()`:
```js
document.getElementById('btn-expand-lot')?.addEventListener('click', () => this._showExpandMenu());
```

Aggiungere `_showExpandMenu()`: overlay con 4 bottoni direzionali (→ Est, ↓ Sud, ← Ovest, ↑ Nord). Al click su ciascuno:
```js
if (!this.budgetSystem?.debit(1500, 'lot_expansion')) {
  bus.emit('story:entry', { text: 'Fondi insufficienti per espandere il lotto.', cat: 'neutral' }); return;
}
this.world?.expandLot?.(direction);
el.remove();
bus.emit('story:entry', { text: `Lotto espanso verso ${dirLabel}! Nuove stanze disponibili.`, cat: 'family' });
```

---

## Feature 2 — Trasloco romantico (visitatore → nucleo)

### `src/systems/RomanceSystem.js` — estendere `_maybeCommitPair()`

Dopo il blocco `sameHousehold` esistente (linea 134–141), aggiungere ELSE branch prima del return implicito:

```js
_maybeCommitPair(idA, idB) {
  if (this._population?.sameHousehold?.(idA, idB)) {
    // ... codice esistente invariato (righe 135-140) ...
    return;
  }
  // Nuovo: uno è household, l'altro visitatore
  const aH = this._population?.isHouseholdMember?.(idA);
  const bH = this._population?.isHouseholdMember?.(idB);
  if (!aH && !bH) return;
  const [hId, vId] = aH ? [idA, idB] : [idB, idA];
  if (this._graph.score(hId, vId, 'romance') < 50 || this._graph.score(vId, hId, 'romance') < 50) return;
  const key = `${[hId, vId].sort().join(':')}:movein`;
  if (this._announced.has(key)) return;
  this._announced.add(key);
  bus.emit('romance:moveInProposal', {
    householdId: hId, householdName: this._name(hId),
    visitorId:   vId, visitorName:   this._name(vId),
  });
}
```

### `src/core/Game.js` — dialog consenso (inline, no nuovo file)

In `_init()`:
```js
bus.on('romance:moveInProposal', e => this._showMoveInDialog(e));
```

Aggiungere `_showMoveInDialog({ householdId, householdName, visitorId, visitorName })`:
- Crea `<div>` modale (stile dark, centrato, z-index 200 — come PhonePanel)
- Testo: `"${householdName} e ${visitorName} si amano. ${visitorName} vuole trasferirsi."`
- **Accetta**:
  ```js
  const vSim = this.sims?.find(s => s.id === visitorId);
  if (vSim) {
    this.population.adoptHouseholdSim(vSim);
    vSim._isVisitor = false;
    this.population.setPartner?.(householdId, visitorId);
    bus.emit('story:entry', { text: `${visitorName} si è unito/a alla famiglia!`, cat: 'family' });
  }
  el.remove();
  ```
- **Rifiuta**: `this.relationshipGraph?.adjust?.(householdId, visitorId, 'romance', -10)` + story entry + `el.remove()`

---

## Feature 3 — Obiettivo condiviso: benessere familiare

### Nuovo file `src/systems/HouseholdGoalSystem.js` (~60 righe)

Ascolta `clock:dayChanged` (emesso da `GameClock.js:89`). Controlla che ogni Sim del nucleo abbia media needs ≥ 60. Conta i giorni consecutivi. Al terzo giorno: credita §500, emette story entry, schedula reset dopo 7 giorni.

```js
import { bus } from '../core/EventBus.js';
const TARGET_SCORE = 60, TARGET_DAYS = 3;

export class HouseholdGoalSystem {
  constructor(game) {
    this._game = game; this._days = 0; this._status = 'active'; this._resetAtDay = null;
    bus.on('clock:dayChanged', () => this._tick());
  }
  get progress() { return { days: this._days, target: TARGET_DAYS, score: TARGET_SCORE, status: this._status }; }
  _tick() {
    if (this._status === 'completed' && (this._game.clock?.day ?? 0) >= this._resetAtDay) {
      this._days = 0; this._status = 'active'; this._resetAtDay = null;
    }
    if (this._status !== 'active') return;
    const sims = (this._game.sims ?? []).filter(s => !s._isVisitor && !s._atWork);
    if (!sims.length) return;
    const allHappy = sims.every(s => {
      const v = Object.values(s.needs?.getAll?.() ?? {});
      return v.length && v.reduce((a,b)=>a+b,0)/v.length >= TARGET_SCORE;
    });
    this._days = allHappy ? this._days + 1 : 0;
    if (this._days >= TARGET_DAYS) this._complete();
    bus.emit('household:goalProgress', this.progress);
  }
  _complete() {
    this._status = 'completed';
    this._resetAtDay = (this._game.clock?.day ?? 0) + 7;
    this._game.budgetSystem?.credit?.(500, 'household_goal_bonus');
    bus.emit('household:goalCompleted', this.progress);
    bus.emit('story:entry', { text: '🏆 La famiglia ha raggiunto il benessere condiviso! +§500', cat: 'family' });
  }
  serialise() { return { days: this._days, status: this._status, resetAtDay: this._resetAtDay }; }
  restore(d={}) { this._days=d.days??0; this._status=d.status??'active'; this._resetAtDay=d.resetAtDay??null; }
}
```

### `src/core/Game.js` — wire

```js
this.householdGoalSystem = new HouseholdGoalSystem(this);
```

### `src/ui/LifeCyclePanel.js` — sezione obiettivo condiviso

Nel costruttore aggiungere: `bus.on('household:goalProgress', () => this._render())`

Nel metodo `_render()`, prima della sezione skills:
```js
const hg = this._game.householdGoalSystem?.progress;
if (hg) {
  const pct = Math.round((hg.days / hg.target) * 100);
  html += `<div class="lc-section">
    <div class="lc-title">🏠 Obiettivo Famiglia</div>
    <div style="font-size:10px;color:#aaa;margin-bottom:4px">
      Benessere ≥${hg.score}% · ${hg.days}/${hg.target} giorni${hg.status==='completed'?' ✓':''}
    </div>
    <div class="lc-bar-bg"><div class="lc-bar-fill" style="width:${pct}%;background:#f0c040"></div></div>
  </div>`;
}
```

---

## File modificati

| File | Modifica |
|------|----------|
| `src/world/TileMap.js` | + `expand(direction, tiles)` |
| `src/world/World.js` | + `expandLot(direction, tiles)` |
| `src/world/RoomDetector.js` | `GRID = 16` → dinamico da `this._tileMap` |
| `index.html` | + bottone 🏗️ Espandi nel build toolbar |
| `src/core/Game.js` | + `_showExpandMenu()`, `_showMoveInDialog()`, wire HouseholdGoalSystem |
| `src/systems/RomanceSystem.js` | + cross-household branch in `_maybeCommitPair()` |
| `src/systems/HouseholdGoalSystem.js` | **nuovo file** |
| `src/ui/LifeCyclePanel.js` | + sezione obiettivo condiviso, re-render su goalProgress |
| `docs/TECHNICAL.md` | + espansione lotto, romance move-in, household goal |
| `docs/FUNCTIONAL.md` | + le tre funzionalità dal punto di vista utente |

---

## Verifica

```
# Feature 1 — Espansione lotto
1. Build mode → "🏗️ Espandi §1500" → selezionare Est
2. Verificare nuove tile di pavimento appaiono a destra della casa
3. Piazzare pareti sulle nuove tile → RoomDetector deve rilevare nuove stanze
4. Con fondi < §1500: verificare messaggio di rifiuto

# Feature 2 — Trasloco romantico
1. Invitare un visitatore tramite telefono
2. Console: game.relationshipGraph.adjust(visitorId, householdId, 'romance', 55)
            game.relationshipGraph.adjust(householdId, visitorId, 'romance', 55)
3. Triggerare social:interaction tra i due → dialog move-in appare
4. Accetta → visitatore diventa household, compare in OffLotSimulationSystem._householdSims()
5. Rifiuta → penalità romance -10, nessun trasferimento

# Feature 3 — Obiettivo condiviso
1. LifeCyclePanel → verificare barra "Obiettivo Famiglia" visibile
2. Avanzare 3 giorni con tutti i Sim > 60% needs
3. Verificare story entry "🏆..." e credito §500 nel budget
4. Dopo 7 giorni verificare che l'obiettivo si resetti
```
