Implementa la milestone:

“External Sociality, Visitor Lifecycle & Persistence Foundation”

OBIETTIVO STRATEGICO
Il progetto non deve essere solo un clone dei Sims. Deve diventare una piattaforma sperimentale per osservare dinamiche sociali umane simulate: relazioni familiari, amicizie, conflitti, riconciliazioni, isolamento, fiducia, dipendenza, reputazione, vita dentro casa e socialità esterna.

L’obiettivo di questa milestone è:
1. Correggere l’integrazione del nuovo Social Simulation Core 2.0 nel comportamento reale dei Sims.
2. Introdurre persone esterne alla famiglia.
3. Permettere a queste persone di arrivare alla porta, suonare, essere accettate/rifiutate, entrare, interagire e poi tornare a casa.
4. Preparare la transizione dal salvataggio browser/localStorage a una persistenza locale strutturata, idealmente SQLite.
5. Rendere ogni comportamento osservabile tramite ExperimentLogger e Dashboard.

VINCOLI ARCHITETTURALI
- Mantieni Three.js e vanilla ES modules.
- Non introdurre bundler.
- Non introdurre LLM.
- Non fare refactor massivi inutili.
- Il loop di simulazione deve restare in memoria JavaScript.
- SQLite/local persistence non deve essere usato come datastore interrogato a ogni frame.
- La persistenza deve essere usata per: snapshot, configurazioni, popolazione, relazioni, event log, scenari.
- Mantieni compatibilità con il gioco attuale.
- Mantieni `game.sims` funzionante per compatibilità, ma prepara un modello più corretto basato su activeSims/household/visitors/population.
- Ogni nuovo sistema deve avere `serialise()` e `restore()`.
- Ogni evento rilevante deve passare da EventBus ed essere tracciabile da ExperimentLogger.
- Non rompere save/load esistente.
- Non rompere dashboard esistente.
- Non rompere pathfinding, porte, build mode o UI esistenti.

CONTESTO ATTUALE IMPORTANTE
Nel codice attuale:
- Game istanzia memorySystem, socialManager, relationshipGraph, socialDynamics, romanceSystem, experimentLogger e dashboard.
- SocialDynamicsSystem contiene un modello relazionale direzionale con trust, affection, respect, attraction, resentment, fear, familiarity, dependency.
- SocialAction usa InteractionContext e nuove interazioni sociali.
- ExperimentLogger registra eventi sociali standardizzati.
- UtilityAIPlanner però usa ancora affordance sociali hardcoded basate su SocialManager: greet/chat/compliment/insult/hug.
- Questo va corretto perché il nuovo sistema sociale deve guidare davvero il comportamento autonomo, non solo registrarlo.

TASK 1 — Correggere Social Core 2.0 nel planner
✅ IMPLEMENTATO — `UtilityAIPlanner._socialAffordances()` ora genera le affordance dal catalogo `INTERACTIONS` (filtrate per cooldown/requisiti/energia/presenza), con scoring che usa affinity + trust/affection/resentment/fear/attraction; fallback legacy se `socialDynamics` assente. Verificato: emergono apologize/forgive/confront/avoid/gossip/flirt; cooldown attivo; nessun errore console.

Modifica `src/ai/UtilityAIPlanner.js`.

Obiettivo:
Il planner principale deve generare affordance sociali dal catalogo `INTERACTIONS` definito in `SocialDynamicsSystem`, non da una lista hardcoded.

Implementazione richiesta:
- Importa `INTERACTIONS` da `src/systems/SocialDynamicsSystem.js`.
- In `_socialAffordances(target)`, genera una affordance per ogni interazione disponibile.
- Usa `game.socialDynamics` quando presente.
- Filtra le affordance con:
  - `socialDynamics.onCooldown(actorId, targetId, type)`
  - `socialDynamics.meetsRequirements(actorId, targetId, type, context)`
  - energia minima dell’attore
  - presenza del target nel lotto
- Mantieni fallback legacy solo se `socialDynamics` non esiste.
- Ogni affordance deve includere:
  - targetType: 'sim'
  - target
  - verb
  - label
  - utility
  - duration
  - interactionDef
- Lo scoring deve considerare anche:
  - affinity da SocialDynamics
  - trust
  - affection
  - resentment
  - fear
  - attraction per flirt/romance
  - bisogni social/fun/status/autonomy
  - personalità dell’attore
  - goal attivi
  - memoria/esperienza
- Non limitarti a chat/compliment/insult/hug.
- apologize, forgive, comfort, ask_help, offer_help, confront, avoid, gossip, flirt devono poter emergere autonomamente.

Acceptance criteria:
- Dopo alcuni minuti di simulazione, nel logger possono comparire anche le nuove interazioni, non solo chat/joke/compliment/hug/insult.
- I Sims possono scegliere spontaneamente apologize/forgive/confront/avoid quando la relazione lo giustifica.
- I cooldown impediscono spam della stessa azione sulla stessa coppia.
- Nessun errore console.

TASK 2 — Correggere relationshipBefore/relationshipAfter
✅ IMPLEMENTATO — `SocialAction` ora applica l'effetto (`dyn.applyInteraction`) PRIMA di misurare `relationshipAfter` ed emette `socialDynamicsApplied: true`; il listener di `SocialDynamicsSystem` ignora gli eventi già applicati (niente doppia applicazione). Verificato: compliment 0→1, insult 1→−4, affection applicata una sola volta.

Modifica `src/ai/SocialAction.js` e/o `src/systems/SocialDynamicsSystem.js`.

Problema:
Attualmente SocialAction calcola `relationshipAfter` prima dell’emissione dell’evento `social:interaction`, ma SocialDynamicsSystem applica l’effetto ascoltando quello stesso evento. Questo può produrre log temporalmente scorretti.

Implementazione richiesta:
- Applica SocialDynamics esplicitamente dentro SocialAction prima di calcolare relationshipAfter, oppure emetti un evento successivo `social:dynamicsApplied`.
- Evita doppia applicazione usando un flag tipo `socialDynamicsApplied: true`.
- Il logger deve registrare relationshipBefore e relationshipAfter coerenti con l’effetto appena applicato.
- Aggiorna SocialDynamicsSystem per ignorare eventi già applicati.

Acceptance criteria:
- In un’interazione positiva, relationshipAfter deve essere maggiore di relationshipBefore se l’effetto netto è positivo.
- In insult/confront/reject_flirt, relationshipAfter deve riflettere peggioramento o aumento del conflitto.
- Il dashboard deve mostrare valori coerenti.

TASK 3 — Introdurre PopulationSystem
✅ IMPLEMENTATO — `src/systems/PopulationSystem.js` (household/visitors/off-lot, createPerson/createExternalPerson, activatePerson/deactivatePerson via nuovi `Game._spawnSim`/`_despawnSim`, serialise/restore). Esposto come `game.population`, serializzato in Game. Seed di 4 NPC esterni. Verificato: activate +1 sim, deactivate −1 mantenendo l'identità, popolazione esterna persiste al load. (Corretto anche un bug latente: `EmotionBadge`/`MoodRing.addSim` duplicavano `game.sims`.)

Crea `src/systems/PopulationSystem.js`.

Obiettivo:
Separare il concetto di famiglia, popolazione totale, Sims attivi e persone esterne.

Modello concettuale:
- Population: tutte le persone esistenti nel mondo.
- Household: persone che abitano nella casa.
- Active Sims: persone renderizzate e simulate nel lotto.
- Visitors: persone esterne temporaneamente presenti.
- Off-lot people: persone vive fuori scena, non renderizzate.

API minima:
```js
class PopulationSystem {
  constructor(game, initialHousehold = [])
  allPeople()
  householdMembers()
  offLotPeople()
  activeVisitors()
  createPerson(def)
  createExternalPerson(def)
  activatePerson(personId, spawnPoint)
  deactivatePerson(personId)
  isHouseholdMember(personId)
  isVisitor(personId)
  serialise()
  restore(data)
}
````

Person record:

```js
{
  id,
  name,
  color,
  traits,
  role: 'household' | 'neighbor' | 'friend' | 'relative' | 'coworker' | 'service' | 'stranger',
  householdId,
  homeLotId,
  availability,
  relationshipSeeds,
  offLotState,
  lastSeenAt,
  createdAt
}
```

Regole:

* Gli abitanti della casa restano nel lotto salvo lavoro/scuola/eventi futuri.
* Gli NPC esterni esistono anche quando non sono renderizzati.
* Quando un NPC entra nel lotto, viene istanziato come Sim reale, con mesh, needs, brain e relazione persistente.
* Quando esce dal lotto, viene de-renderizzato ma non eliminato.
* Le relazioni e le memorie devono restare.

Acceptance criteria:

* La dashboard mostra popolazione totale, household size, active visitors, off-lot people.
* Save/load conserva popolazione esterna.
* Gli NPC non spariscono come identità quando lasciano il lotto.

TASK 4 — Introdurre VisitorSystem

Crea `src/systems/VisitorSystem.js`.

Obiettivo:
Gestire visite realistiche di persone esterne alla famiglia.

Stati visitatore:

```text
off_lot
arriving
ringing_doorbell
waiting_response
invited_in
rejected
no_answer
visiting
leaving
returned_home
```

Eventi da emettere:

```text
visitor:scheduled
visitor:arriving
visitor:doorbell
visitor:invited
visitor:rejected
visitor:noAnswer
visitor:entered
visitor:leaving
visitor:left
visitor:visitEnded
```

Visitor record:

```js
{
  id,
  personId,
  hostId,
  state,
  reason,
  arrivalTick,
  enteredTick,
  leaveByTick,
  actualLeftTick,
  entryPointId,
  invited,
  outcome,
  socialSummary
}
```

Tipi di visita:

```js
{
  spontaneous_neighbor,
  invited_friend,
  family_visit,
  romantic_visit,
  conflict_visit,
  service_visit
}
```

Regole di arrivo:

* Un visitatore deve arrivare da un entry point esterno.
* Deve camminare verso la porta.
* Deve suonare.
* Deve attendere risposta.
* Se invitato, entra.
* Se rifiutato, se ne va.
* Se nessuno risponde entro un timeout, se ne va.
* Dopo un certo tempo o condizioni sociali, deve lasciare la casa e tornare off-lot.
* Il visitatore non deve rimanere bloccato nel lotto.
* Il visitatore non deve diventare membro permanente della famiglia.

Decisione host:
Crea una funzione:

```js
decideDoorResponse(host, visitor, context)
```

Fattori:

* relazione host → visitor
* trust
* affection
* resentment
* fear
* ora del giorno
* energia dell’host
* mood dell’host
* personalità nice/outgoing/neurotic
* motivo della visita
* presenza di conflitti recenti
* eventuale goal attivo dell’host
* se la visita era attesa/invitata o spontanea

Effetti sociali:

* Invitare un amico aumenta lievemente trust/affection.
* Rifiutare un amico può aumentare resentment o ridurre affection.
* Rifiutare una persona ostile può aumentare safety/autonomy dell’host ma peggiorare il conflitto.
* Ignorare il campanello deve essere diverso dal rifiuto esplicito.
* Accettare una visita romantica deve poter aumentare attraction/intimacy.
* Una visita conflittuale può portare a confront/apologize/argue.

Acceptance criteria:

* Un NPC esterno può arrivare, suonare, attendere, essere accettato o rifiutato.
* Se accettato entra fisicamente nel lotto.
* Interagisce con almeno un membro della famiglia.
* Dopo una durata ragionevole esce e torna off-lot.
* Il logger mostra tutti gli eventi visitor:*.
* Il dashboard mostra active visitors e storico visite.

TASK 5 — Usare porte ed entry point

Modifica `src/world/World.js` e se necessario `DoorManager`.

Obiettivo:
Rendere espliciti i punti di ingresso/uscita.

Implementazione:

* Aggiungi `world.entryPoints`.
* Ogni entry point deve avere:

```js
{
  id,
  gx,
  gz,
  doorGx,
  doorGz,
  type: 'front_door' | 'back_door'
}
```

* Usa le porte già esistenti se possibile.
* Il visitor system deve usare `front_door` come default.
* Se non esiste una porta valida, fallback su bordo mappa più vicino.
* Non rompere pathfinding esistente.
* Non rompere BuildModeWalls.

Acceptance criteria:

* Il visitatore arriva da fuori, non appare magicamente in mezzo alla stanza.
* Il percorso verso ingresso/uscita è valido.
* Se una porta si apre/chiude, il visitor non resta bloccato.

TASK 6 — Visitor AI

Crea azioni dedicate se necessario in `src/ai/VisitorActions.js`.

Azioni minime:

```text
WalkToDoorAction
RingDoorbellAction
WaitForInviteAction
EnterHouseAction
VisitSocializeAction
LeaveHouseAction
ReturnHomeAction
```

Regole:

* Il visitatore deve avere una agenda temporanea.
* Durante la visita può:

  * salutare host
  * conversare
  * chiedere aiuto/offrire aiuto
  * confortare
  * flirtare se coerente
  * confrontare se visita conflittuale
  * usare solo oggetti permessi
* Non deve dormire nel letto della famiglia.
* Non deve usare oggetti privati senza permesso.
* Se mood/relazione peggiora molto, può andarsene prima.
* Se il bisogno bladder o hunger è critico, può chiedere/uso limitato oggetti base.

Acceptance criteria:

* Il visitor non agisce come un household member completo.
* Il visitor ha priorità sociali legate al motivo della visita.
* Il visitor lascia il lotto in modo affidabile.

TASK 7 — OffLotSimulationSystem

Crea `src/systems/OffLotSimulationSystem.js`.

Obiettivo:
Dare vita minima agli NPC fuori dal lotto.

Prima versione leggera:

* Aggiorna gli off-lot people ogni tot minuti simulati, non ogni frame.
* Cambia offLotState:

```text
home
work
socializing
travelling
unavailable
```

* Può generare:

  * desiderio di visita
  * invito futuro
  * gossip
  * cambiamento leggero di relazione
  * indisponibilità temporanea

Regole:

* Non serve renderizzare nulla.
* Deve essere deterministico abbastanza da poter essere analizzato.
* Deve emettere eventi:

```text
offlot:stateChanged
offlot:relationshipDrift
offlot:visitIntent
```

Acceptance criteria:

* Gli NPC esterni cambiano stato fuori scena.
* Alcune visite possono nascere da offlot:visitIntent.
* La dashboard può mostrare lo stato off-lot.

TASK 8 — ExperimentLogger esteso

Modifica `src/systems/ExperimentLogger.js`.

Aggiungi logging strutturato per:

* visitor:scheduled
* visitor:arriving
* visitor:doorbell
* visitor:invited
* visitor:rejected
* visitor:noAnswer
* visitor:entered
* visitor:leaving
* visitor:left
* visitor:visitEnded
* offlot:stateChanged
* offlot:visitIntent

Campi standard visitor:

```js
{
  eventId,
  tick,
  simDay,
  simHour,
  visitorId,
  visitorName,
  hostId,
  hostName,
  reason,
  state,
  outcome,
  accepted,
  entryPointId,
  duration,
  relationshipBefore,
  relationshipAfter,
  payload
}
```

Aggiungi metodi:

```js
summaryByVisitor()
summaryByVisitReason()
visitTimeline(visitorId)
externalSocialityMetrics()
```

Metriche:

* totalVisits
* visitAcceptanceRate
* rejectedVisits
* noAnswerVisits
* averageVisitDuration
* externalInteractionRate
* outsideNetworkSize
* mostFrequentVisitor
* mostRejectedVisitor
* mostVisitedHost

Acceptance criteria:

* CSV/JSON includono gli eventi visitor/offlot.
* Dashboard può visualizzare le metriche.
* Non rompere i metodi esistenti summaryBySim, summaryByPair, relationshipTimeline.

TASK 9 — Dashboard estesa

Modifica dashboard inline e dashboard.html/dashboard-page.js.

Aggiungi:

* Population overview:

  * household members
  * active visitors
  * off-lot people
  * total population
* Visitors tab o sezione:

  * visitatori attivi
  * ultimo campanello
  * visite recenti
  * esito visite
* Metriche:

  * visitAcceptanceRate
  * externalInteractionRate
  * averageVisitDuration
  * outsideNetworkSize
* Nel tab Events mostra anche visitor:*.
* Nel tab Relationships includi anche NPC esterni, almeno se hanno relazione con household.
* Distingui visivamente household vs visitor vs off-lot.

Acceptance criteria:

* Aprendo 🧪 Lab si vedono non solo i Sims in casa, ma anche rete sociale esterna.
* Una visita genera timeline leggibile.
* La matrice relazionale può includere persone esterne.

TASK 10 — PersistenceAdapter
✅ IMPLEMENTATO — Creati `src/persistence/PersistenceAdapter.js` (contratto async: saveSlot/readSlot/hasSlot/deleteSlot/listSlots/appendEvent/saveSnapshot/loadSnapshot), `LocalStorageAdapter.js` (unico punto che tocca localStorage, sync-compatibile, replica il comportamento attuale + event log/snapshots) e `SQLiteAdapter.js` (stub che documenta SQLite-WASM vs Tauri+SQL e lancia se usato senza backend, senza rompere il runtime). `SaveLoad` ora riceve/crea un adapter (default LocalStorage), nessun accesso diretto a localStorage, slot 0..2 e pending-load via sessionStorage invariati. Verificato: round-trip save/load (roster+household) OK, adapter=LocalStorageAdapter, nessun errore console.

Crea:

```text
src/persistence/PersistenceAdapter.js
src/persistence/LocalStorageAdapter.js
src/persistence/SQLiteAdapter.js
```

Obiettivo:
Separare SaveLoad dal localStorage.

API:

```js
class PersistenceAdapter {
  async saveSlot(slot, data)
  async readSlot(slot)
  async hasSlot(slot)
  async deleteSlot(slot)
  async listSlots()
  async appendEvent(runId, event)
  async saveSnapshot(runId, state)
  async loadSnapshot(runId, snapshotId)
}
```

LocalStorageAdapter:

* Deve replicare il comportamento attuale.
* Deve restare il default nel browser statico.
* Deve essere sincrono internamente ma esposto con API async o compatibile.

SQLiteAdapter:

* Per ora può essere stub se non vuoi introdurre Tauri subito.
* Deve documentare chiaramente due possibili strade:

  1. SQLite WASM per browser.
  2. Tauri + plugin SQL per vero file locale.
* Non deve rompere il runtime browser.

Modifica SaveLoad:

* Non deve accedere direttamente a localStorage.
* Deve ricevere o creare un adapter.
* Mantieni compatibilità con slot 0..2.
* Mantieni pending load via sessionStorage se necessario.

Acceptance criteria:

* Save/load funziona come prima con LocalStorageAdapter.
* Il codice è pronto per sostituire adapter con SQLiteAdapter.
* Nessun accesso diretto a localStorage resta dentro SaveLoad, tranne eventualmente dentro LocalStorageAdapter.

TASK 11 — SQLite schema documentation
✅ IMPLEMENTATO — Creato `docs/PERSISTENCE.md`: perché localStorage è insufficiente, perché SQLite è utile per esperimenti sociali, perché il loop live deve restare in memoria, strategia consigliata (Tauri + SQLite) e alternativa (SQLite WASM/OPFS), nota sync↔async per lo swap dell'adapter, schema SQL iniziale completo + mappatura modello-in-memoria→tabelle e lista delle config che migreranno (collega Task 12).

Crea `docs/PERSISTENCE.md`.

Deve contenere:

* Perché localStorage è insufficiente.
* Perché SQLite è utile per esperimenti sociali.
* Perché il loop live deve restare in memoria.
* Strategia consigliata: Tauri + SQLite se si vuole vero file locale.
* Alternativa: SQLite WASM se si resta browser-only.
* Schema iniziale.

Schema minimo:

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  seed INTEGER,
  config_json TEXT
);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lot_id TEXT
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color INTEGER,
  role TEXT NOT NULL,
  household_id TEXT,
  home_lot_id TEXT,
  traits_json TEXT NOT NULL,
  availability_json TEXT,
  offlot_state TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE relationship_state (
  run_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  trust REAL DEFAULT 0,
  affection REAL DEFAULT 0,
  respect REAL DEFAULT 0,
  attraction REAL DEFAULT 0,
  resentment REAL DEFAULT 0,
  fear REAL DEFAULT 0,
  familiarity REAL DEFAULT 0,
  dependency REAL DEFAULT 0,
  updated_tick INTEGER,
  PRIMARY KEY (run_id, from_id, to_id)
);

CREATE TABLE event_log (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  tick INTEGER NOT NULL,
  sim_day INTEGER,
  sim_hour REAL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  target_id TEXT,
  interaction_type TEXT,
  accepted INTEGER,
  location TEXT,
  is_public INTEGER,
  dominant_motive TEXT,
  active_goal TEXT,
  relationship_before REAL,
  relationship_after REAL,
  payload_json TEXT
);

CREATE TABLE visitor_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  host_id TEXT,
  reason TEXT,
  state TEXT NOT NULL,
  accepted INTEGER,
  arrived_tick INTEGER,
  entered_tick INTEGER,
  left_tick INTEGER,
  outcome TEXT,
  payload_json TEXT
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  tick INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  state_json TEXT NOT NULL
);

CREATE TABLE object_defs (
  id TEXT PRIMARY KEY,
  category TEXT,
  config_json TEXT NOT NULL
);

CREATE TABLE interaction_defs (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL
);

CREATE TABLE scenario_defs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL
);
```

TASK 12 — Configurazioni non hardcoded

Obiettivo:
Preparare la rimozione graduale di definizioni hardcoded.

Identifica e documenta dove oggi sono hardcoded:

* SIM_DEFS
* TRAIT_AXIS
* furniture iniziale
* starter careers
* interaction catalogue
* visitor types futuri
* object defs
* schedule/routine base

Implementa solo una prima astrazione sicura:

```text
src/config/defaultScenario.js
src/config/defaultPopulation.js
src/config/defaultObjects.js
```

Non serve spostare tutto subito in SQLite, ma la struttura deve essere pronta.

Acceptance criteria:

* Il gioco continua ad avviarsi con scenario default.
* Le definizioni sono più isolate e meno sparse in Game.js/World.js.
* docs/PERSISTENCE.md spiega quali config finiranno in SQLite.

TASK 13 — Serializzazione completa

Aggiorna Game.serialise()/restore() per includere:

* population
* visitors
* offLot state
* socialDynamics
* relationshipGraph
* romance
* memorySystem globale
* Sim brain state
* experimentLog
* furniture
* budget
* walls
* weather
* skills
* age
* career

Acceptance criteria:

* Se salvo durante una visita e ricarico, lo stato resta coerente.
* Se un visitatore era in casa, deve essere ripristinato o riportato coerentemente off-lot senza corrompere la simulazione.
* Relazioni con NPC esterni persistono.

TASK 14 — Documentazione

Aggiorna:

* docs/TECHNICAL.md
* docs/FUNCTIONAL.md
* nuovo docs/PERSISTENCE.md

TECHNICAL deve spiegare:

* SocialDynamicsSystem come fonte relazionale high-resolution.
* Differenza tra SocialManager legacy, RelationshipGraph e SocialDynamics.
* PopulationSystem.
* VisitorSystem.
* OffLotSimulationSystem.
* PersistenceAdapter.
* Come funziona save/load.
* Come leggere eventi da ExperimentLogger.
* Come eseguire un esperimento manuale.

FUNCTIONAL deve spiegare:

* Household vs visitors vs off-lot people.
* Campanello.
* Visite.
* Rifiuto/accettazione.
* Socialità esterna.
* Metriche nuove.

Correggi documentazione obsoleta:

* Se SkillPanel è montato, non deve risultare “non disponibile”.
* Se ExperimentDashboard è montato, non deve risultare “console only”.
* Se SaveSlotPanel è montato, aggiorna stato reale.
* Se BuildModeWalls/RoomOverlay sono attivi, aggiorna tabella runtime.

TASK 15 — Robustezza e edge case

Gestisci questi casi:

* Visitante arriva ma host è al lavoro.
* Visitante arriva ma tutti dormono.
* Visitante arriva di notte.
* Due visitatori arrivano quasi insieme.
* Visitante invitato ma path bloccato.
* Visitante dentro casa quando parte autosave.
* Visitante dentro casa quando si ricarica.
* Host muore/cambia stato/non è disponibile.
* Visitor rifiutato troppe volte.
* Visitor con relazione ostile.
* Visitor romantico mentre è presente un partner geloso.
* Visitor non deve rimanere per sempre nel lotto.
* Visitor non deve entrare in loop porta/campanello.
* Off-lot people non devono essere considerati ostacoli fisici.
* Dashboard non deve rompersi se window.opener non esiste.

TASK 16 — Acceptance finale globale

La milestone è completa solo se:

* `python3 -m http.server 8765` avvia il gioco senza errori console.
* I Sims della famiglia continuano a soddisfare bisogni e interagire.
* UtilityAIPlanner usa il catalogo SocialDynamics e non solo affordance hardcoded.
* Un NPC esterno può arrivare alla porta.
* Il campanello genera evento.
* Un host decide se accettarlo o rifiutarlo.
* Se accettato, l’NPC entra, interagisce e poi esce.
* Se rifiutato o ignorato, l’NPC torna off-lot e la relazione cambia.
* Gli eventi visitor sono visibili in ExperimentLogger e Dashboard.
* Save/load conserva popolazione, relazioni e stato sociale.
* SaveLoad usa PersistenceAdapter.
* LocalStorageAdapter funziona come prima.
* SQLiteAdapter è preparato/stub/documentato senza rompere il browser.
* docs aggiornati e non contraddittori.
* Nessuna nuova feature deve essere solo estetica: tutto deve generare dati osservabili.