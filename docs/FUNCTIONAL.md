# Sims Clone — Documentazione Funzionale

> Last updated: 2026-06-21

## Cos'è

Sims Clone è una simulazione di vita sociale in vista isometrica. Il giocatore
posiziona uno o più Sim in un lotto, li osserva vivere autonomamente e può
interagire con loro tramite click diretto (selezione, movement override).

---

## Personaggi (Sim)

### Bisogni

Ogni Sim ha **8 bisogni** che decadono nel tempo:

| Bisogno | Descrizione | Decadimento |
|---|---|---|
| Hunger | Fame | Veloce |
| Energy | Stanchezza | Lento di notte, più rapido di giorno |
| Bladder | Bisogno fisiologico | Molto veloce |
| Hygiene | Pulizia | Medio |
| Social | Bisogno di compagnia | Medio |
| Fun | Bisogno di divertimento | Lento |
| Comfort | Comfort fisico | Lento |
| Room | Qualità dell'ambiente | Molto lento |

Quando un bisogno scende sotto **25%** il planner AI lo considera critico.

### Personalità (Big Five semplificato)

5 tratti in scala **[-1, +1]**:

| Tratto | Effetto |
|---|---|---|
| Outgoing | Più alto → cerca interazioni sociali più spesso, social threshold più alta |
| Neurotic | Più alto → mood crash su miserable, emozioni più intense |
| Playful | Più alto → idle più breve, joy spikes più intensi |
| Nice | Più alto → guilt/embarrassment più intensi, meno insult |
| Ambitious | Più alto → genera career/skill goal più spesso, pride spikes |

I tratti **evolvono lentamente** nel tempo (PersonalityDrift) in risposta a
eventi ripetuti, con un cap di ±0.30 dal valore iniziale.

---

## Sistema Emozionale

### Mood baseline

Calcolato come media pesata di tutti i bisogni, modulata da neurotic e playful.
Si aggiorna ogni 5 secondi di gioco e mappa su 5 livelli:

`miserable → sad → neutral → happy → ecstatic`

### Emozioni momentanee

Eventi di gioco generano **spike emozionali** con tipo, intensità e durata:

| Evento | Emozione | Durata |
|---|---|---|
| Interazione sociale positiva | Joy | 10s |
| Abbraccio / bacio | Love | 15s |
| Insulto subìto | Anger + Embarrassment | 12s |
| Uso di oggetto piacevole | Joy | 6s |
| Promozione | Pride + Joy | 20s |
| Licenziamento | Sadness + Fear | 25s |
| Goal raggiunto | Pride + Joy | 12s |
| Goal fallito | Sadness + Guilt | 15s |
| Romance formata | Love + Joy | 30s |
| Romance rotta | Sadness + Anger | 40s |
| Re-incontro con Sim odiato | Fear | 10s |
| Re-incontro con Sim amato | Love | 8s |

Il tier effettivo visualizzato = baseline + bias dagli spike attivi (max ±2 livelli).

---

## Memoria Episodica

Ogni Sim ricorda fino a **40 eventi** della sua vita.
Le memorie hanno:
- **Valenza** [-1, +1]: quanto era positivo o negativo l'evento
- **Intensità** [0, 1]: quanto è stato forte
- **Salience**: si riduce col tempo (half-life ~1 giorno di gioco), ma aumenta ogni volta che la memoria viene richiamata

### Effetti delle memorie

- **Relazioni**: `biasWith(otherId)` restituisce il sentiment netto verso un altro Sim — usato da GoalSystem per generare obiettivi di evitamento
- **Flashback**: incontrare un Sim con memorie molto negative genera un spike di Fear; molto positive genera Love
- **SocialLearning**: i Sim osservano cosa succede agli altri e aggiornano i propri bias di conseguenza

---

## AI Autonoma

### Pipeline decisionale

Ogni Sim decide autonomamente cosa fare tramite una pipeline a 4 livelli:

1. **UtilityAIPlanner** — sceglie l'affordance con punteggio più alto tra tutti gli oggetti e Sim vicini (raggio 8 tile)
2. **NeedDrivenPlanner** — fallback se nessuna affordance supera la soglia minima: soddisfa direttamente il bisogno più critico
3. **SocialAction fallback** — se il bisogno Social è molto basso, cerca un Sim vicino
4. **IdleAction** — se non c'è nulla da fare, aspetta (1.5–3.5s in base a playful)

### Scorer (UtilityAIPlanner)

Il punteggio di ogni affordance combina 6 fattori:
1. Pressione dei bisogni × utilità dichiarata × peso del tratto
2. Bonus relazione con il target (familiarity + affinity)
3. Penalità distanza
4. Bias da esperienza (ExperientialBias — rinforzo appreso)
5. Boost da obiettivo attivo (GoalSystem)
6. Rumore contestuale (circadiano + mood, deterministico per Sim)

### Obiettivi

Il sistema genera automaticamente fino a **3 obiettivi attivi** per Sim:
- Ottenere una promozione (Sims ambiziosi)
- Fare amicizia con un Sim specifico (Sims estroversi)
- Migliorare una skill (tutti)
- Riposarsi (Sims nevrotici o stanchi)
- Evitare un Sim ostile (basato su memorie negative)

Gli obiettivi hanno una scadenza in giorni di gioco e vengono marcati
completed/failed automaticamente dagli eventi del bus.

---

## Interazioni Sociali

| Azione | Requisito | Effetto su Affinity |
|---|---|---|
| Greet | — | +small |
| Chat | Familiarity ≥ 10 | +medium |
| Compliment | Affinity ≥ -10 | +medium |
| Insult | Affinity ≤ -20 | −large (entrambi) |
| Hug | Affinity ≥ 40 | +large |

Ogni interazione aggiorna `SocialManager`, emette `social:interaction` sul bus,
crea una memoria episodica e può scatenare spike emozionali.

---

## Controllo del giocatore

- **Click su tile** → il Sim selezionato si muove (pathfinding A*)
- **Click su oggetto** → UseObject override
- **Click su altro Sim** → SocialAction override
- **Pausa** → `Space`
- **Velocità** → `1` / `2` / `5` (1x, 2x, 5x)

Gli override del giocatore sospendono l'AI per max **30 secondi** o fino al
completamento dell'azione; poi il Sim riprende l'autonomia.

---

## Oggetti (Furniture)

| Oggetto | Affordance principali | Bisogno soddisfatto |
|---|---|---|
| Letto | sleep | Energy |
| Frigorifero | eat | Hunger |
| WC | use | Bladder |
| Divano | sit, watch TV | Comfort, Fun |
| Doccia | shower | Hygiene |
| Libreria | read | Fun, (skill) |

Gli oggetti possono essere **riservati** da un solo Sim alla volta
(`world.reserveFurniture`). Se occupato, l'AI sceglie un'alternativa.

---

## Social Simulation Core 2.0

Il sistema sociale non è più un singolo punteggio: ogni Sim ha relazioni
**direzionali** verso gli altri, descritte da otto dimensioni 0–100 — *fiducia,
affetto, rispetto, attrazione, risentimento, paura, familiarità, dipendenza*.

**Interazioni disponibili.** Oltre a chiacchierare, scherzare, complimentarsi,
abbracciare, litigare e insultare, i Sim possono ora **scusarsi, perdonare,
affrontare (confront), evitare, chiedere aiuto, offrire aiuto, consolare,
spettegolare, flirtare e respingere un flirt**. Ogni interazione ha requisiti
(es. ci si scusa solo se l'altro ti porta rancore), può essere **rifiutata**, ha
un costo/ricompensa sui bisogni e un effetto sulle dimensioni relazionali. Un
**cooldown per coppia e tipo** evita che ripetano sempre la stessa azione.

**Contesto.** Prima di risolvere un'interazione il gioco considera luogo,
eventuali testimoni (interazione pubblica o privata), umore e bisogni dei due
Sim, la relazione attuale, i ricordi recenti, gli obiettivi attivi e l'ora del
giorno — tutto questo modula la probabilità di accettazione e il risultato.

**Experiment Dashboard (pulsante 🧪 Lab).** Un pannello mostra: la timeline
degli eventi sociali recenti, una matrice relazionale a colori (clic su una
cella per i dettagli di una coppia), la spiegazione leggibile di una relazione
(*“Aaa è affezionata a Bbb, ma le porta un po' di rancore”*) e metriche
aggregate: tasso di conflitto, tasso di interazioni positive, indice di
isolamento, legame più forte, risentimento più alto. Esporta CSV/JSON.

**Salvataggio.** Le dimensioni relazionali, la memoria e gli obiettivi di ogni
Sim vengono salvati e ripristinati assieme al resto della partita.

> Per gli esperimenti da console vedi “How to run a social experiment manually”
> in `docs/TECHNICAL.md`.

## Roadmap

### Implementato ✅
- **Social Simulation Core 2.0**: relazioni direzionali a 8 dimensioni,
  10 nuove interazioni con requisiti/rifiuto/cooldown, InteractionContext,
  ExperimentDashboard, logger con campi standardizzati ✅ NEW
- Vista isometrica Three.js con ombre
- Tilemap 16×16 con walkable mask
- 8 bisogni con decay + barre UI
- Pathfinding A*
- Personalità Big Five + PersonalityDrift
- UtilityAI a 6 layer + ExperientialBias
- GoalSystem (3 goal max, scadenza, auto-completamento)
- ContextualNoise (circadiano + mood)
- SocialLearning (apprendimento osservazionale)
- **MemorySystem** (40 entries, salience decay, biasWith) ✅ NEW
- **EmotionEngine** (baseline + spike, 9 tipi) ✅ NEW
- SimBrain fully wired (serialise/restore completo) ✅ NEW

### Prossimi ⬜
- GOAP Planner (pianificazione multi-step)
- DialogueSystem (stati conversazionali)
- SkillSystem (progressione da uso oggetti)
- CareerSystem (lavoro, turni, stipendio)
- SaveLoad JSON completo
- Routine scheduling (agenda giornaliera)
- UI emozionale (icone emozione sul Sim, tooltip memoria)
