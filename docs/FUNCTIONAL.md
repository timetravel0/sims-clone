# Sims Clone — Documentazione Funzionale

> Last updated: 2026-06-22

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

Quando fame, bladder o energia scendono in fascia critica, l'AI interrompe la
normale pianificazione autonoma e cerca subito un oggetto utile. Gli altri
comportamenti non essenziali vengono penalizzati finché il bisogno non risale;
gli eventi di crisi sono loggati con cooldown per evitare spam analitico.

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

Ogni Sim decide autonomamente cosa fare tramite una pipeline a 5 livelli:

1. **Critical need preemption** — fame, bladder o energia critici hanno priorità su tutto il comportamento autonomo
1b. **Bonding coinquilini** — a intervalli (~1-2 ore di gioco) il Sim va a stare con il coinquilino più compatibile presente, per costruire i legami che portano a romance e figli
2. **UtilityAIPlanner** — sceglie l'affordance con punteggio più alto tra tutti gli oggetti e Sim vicini (raggio 8 tile)
3. **NeedDrivenPlanner** — fallback se nessuna affordance supera la soglia minima: soddisfa direttamente il bisogno più critico
4. **SocialAction fallback** — se il bisogno Social è molto basso, cerca un Sim vicino
5. **IdleAction** — se non c'è nulla da fare, aspetta (1.5–3.5s in base a playful)

### Scorer (UtilityAIPlanner)

Il punteggio di ogni affordance combina 6 fattori:
1. Pressione dei bisogni × utilità dichiarata × peso del tratto
2. Bonus relazione con il target (familiarity + affinity)
3. Penalità distanza
4. Bias da esperienza (ExperientialBias — rinforzo appreso)
5. Boost da obiettivo attivo (GoalSystem)
6. Rumore contestuale (circadiano + mood, deterministico per Sim)

Se fame, bladder o energia sono critici, le azioni che non aiutano quel bisogno
ricevono una forte penalità. Questo evita casi osservati nei dati SQLite in cui
i Sim continuavano a socializzare o vagare mentre fame/energia/bladder erano a
zero. Le soglie di preemption sono state alzate (da 14-18 a 20-26) in base
all'analisi headless: ora i Sim vanno a mangiare/bagno/dormire **prima** che il
bisogno collassi, non dopo — dimezzando gli eventi di crisi.

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
- **Velocità** → `1` / `3` / `5` — 1× = 1 minuto di gioco al secondo reale; 3× = 1 ora ogni 3 secondi; 5× = 1 ora ogni mezzo secondo

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

Gli oggetti disponibili, i costi d'acquisto autonomo, gli skill source e la
dotazione iniziale della casa sono configurati in `src/config/*`, non sparsi nei
sistemi runtime.

**Acquisto automatico su contesa.** Se un bisogno va ripetutamente in crisi
(es. un solo WC per più Sim), la famiglia compra autonomamente una seconda
istanza dell'oggetto che lo soddisfa (secondo bagno/letto/frigo), invece di
lasciare quel bisogno crollare in continuazione. La decisione non guarda solo se
un oggetto equivalente è libero *in quell'istante*, ma accumula la pressione
delle crisi nel tempo.

---

## Lavoro, salute, famiglia e uscite

**Cambio lavoro.** Ogni Sim può cambiare carriera dal pannello Lifecycle/Career
(`switchCareer`) oppure **autonomamente**: se dopo 3 giorni lavorativi consecutivi
il Sim non è stato promosso, valuta spontaneamente se cambiare settore (probabilità
base 8%, amplificata dal tratto Ambitious). In ogni caso lascia la carriera attuale
e ne inizia un'altra ripartendo dal livello base.

**Orario di lavoro.** Tutte le carriere lavorano **dal lunedì al venerdì
(giorni 0–4), 08:00–17:00**; nel weekend (giorni 5–6) i Sim sono a casa. Durante
il turno il Sim è fuori dal lotto (nascosto) e rientra a fine giornata.

**Malattia e guarigione.** I Sim possono ammalarsi (raffreddore, influenza,
spossatezza, intossicazione) con probabilità legata a igiene, energia, fame e
meteo. Una malattia passa da `ill` a `recovering` e infine a `healthy`, con un
costo temporaneo su energia, divertimento e socialità. Gli incidenti fuori casa
provocano un infortunio.

**Uscite dal lotto (con motivo chiaro).** Oltre al lavoro, i Sim della famiglia
escono autonomamente per un **pranzo/cena fuori**, una **gita**, una **visita a
un altro Sim** o per **altro**. Quando un Sim lascia il lotto il motivo è sempre
esplicitato nello story log (es. *"Alice è uscita per un pranzo fuori"*,
*"Bob è andato al lavoro come Chef"*) e il Sim viene nascosto finché non rientra.
Al rientro recupera i bisogni in base al tipo di uscita. Non escono se hanno un
bisogno critico (fame/energia/bisogno fisiologico): in quel caso restano a casa.

**Incidenti fuori casa.** Mentre sono fuori (uscita o lavoro) i Sim possono avere
un incidente, che li fa rientrare/risultare infortunati (vedi Salute).

**Figli.** Una coppia può avere figli solo se: vivono nella **stessa famiglia
(household)**, hanno una **relazione amorosa reciproca** abbastanza forte, sono
**maschio e femmina** e **non sono consanguinei**. Il figlio nasce come **membro
della famiglia a livello di dati** (non un Sim sul lotto); cresce sullo sfondo e
**compare come Sim adolescente** quando è abbastanza grande, dopodiché continua a
invecchiare normalmente. Esiste un tetto alla dimensione del nucleo e un cooldown
tra una nascita e l'altra.

**Creazione di oggetti.** Un Sim con **handiness ≥ 2** (raggiungibile dopo ~8 usi
del workbench), usando il **workbench**, può fabbricare autonomamente un **nuovo
oggetto** le cui caratteristiche (bisogno soddisfatto, restore rate, utilità)
**scalano con il livello di handiness**. La creazione è gated da un cooldown (600 s
di gioco) e non richiede che la casa sia "piena" di oggetti equivalenti — l'oggetto
artigianale è espressivo, non economico. Viene piazzato sul lotto e salvato con la
partita.

**Gelosia e monogamia.** Se due Sim conviventi hanno una relazione amorosa,
tendono a non stringere altri legami romantici. Un Sim impegnato **non cerca**
di flirtare con altri (l'AI scarta quell'azione) e, se viene corteggiato da un
terzo, **respinge il flirt** quasi sempre — a prescindere dall'attrazione
accumulata — salvo una piccola probabilità che una scintilla intensa passi
comunque. Quando questo accade, il partner di famiglia diventa **geloso** (spike
emozionale, memoria negativa, aumento della rivalità verso il rivale) e il legame
impegnato viene penalizzato.

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

**Crescita dei legami.** Il contatto positivo ripetuto fa crescere davvero la
relazione: la familiarità accumulata contribuisce all'affinità (prima due Sim
potevano chiacchierare a lungo restando "neutri") e un rifiuto educato pesa molto
meno di prima. Così, anche partendo da estranei, le interazioni positive nel
tempo prevalgono e le coppie che si piacciono si scaldano sempre più in fretta.

**Voglia di stare insieme.** Periodicamente un Sim va a passare del tempo con un
**coinquilino** (preferendo quello più compatibile), invece di accudire l'ennesimo
oggetto. Senza questa spinta i Sim di casa, già "sazi" di socialità grazie ai
visitatori, non si cercavano mai a vicenda e nessuna coppia nasceva. È questo a
innescare la catena **amicizia → corteggiamento → coppia stabile → figli**.

**Experiment Dashboard (pulsante 🧪 Lab).** Un pannello mostra: la timeline
degli eventi sociali recenti, una matrice relazionale a colori (clic su una
cella per i dettagli di una coppia), la spiegazione leggibile di una relazione
(*“Aaa è affezionata a Bbb, ma le porta un po' di rancore”*) e metriche
aggregate: tasso di conflitto, tasso di interazioni positive, indice di
isolamento, legame più forte, risentimento più alto. Esporta CSV/JSON.

**Salvataggio.** Le dimensioni relazionali, la memoria e gli obiettivi di ogni
Sim vengono salvati e ripristinati assieme al resto della partita.

**Analytics persistente.** Gli eventi vengono mantenuti in memoria per la UI e
appendati nel backend di persistenza. Con SQLite/OPFS il log contiene colonne
normalizzate interrogabili per run, tick, tipo evento, attore/target e tipo di
interazione; vengono salvati anche snapshot periodici delle relazioni.

**Simulation Health.** La dashboard include una sezione di salute della
simulazione che evidenzia crisi dei bisogni, visitatori bloccati, churn degli
stati off-lot, tasso di accettazione sociale, quota di interazioni negative e
righe social legacy. Questi indicatori sono pensati per trasformare i dati
registrati in suggerimenti di tuning.

## Popolazione esterna e visitatori

Gli NPC esterni vivono anche quando non sono sul lotto: hanno uno stato off-lot
(`home`, `work`, `socializing`, `travelling`, `unavailable`) che dura almeno un
intervallo minimo prima di cambiare. Questo riduce passaggi troppo frequenti
casa/lavoro/socialità.

Quando un visitatore arriva, la casa sceglie il membro più adatto a rispondere
alla porta in base a distanza, energia, personalità e relazione con il
visitatore. Il visitatore può essere invitato, rifiutato o non ricevere risposta.
Le visite hanno timeout di sicurezza e al termine l'NPC viene sempre riportato
off-lot, evitando stati "visiting" permanenti nei salvataggi.

**Orari delle visite e coprifuoco notturno.** Gli ospiti arrivano solo in fasce
orarie sensate: nel **fine settimana** (di giorno e di sera) oppure, **in
settimana, solo la sera** (fuori dagli orari di lavoro). Non arrivano mai di
notte. Dalle **23:00** gli ospiti presenti vengono mandati a casa e **tra le
00:00 e le 06:00 non c'è nessun ospite sul lotto**. Nelle stesse ore notturne i
Sim della famiglia non escono per gite/visite e l'AI li spinge a **dormire**
(le emergenze fame/bisogno/energia restano comunque prioritarie, così un Sim
affamato mangia prima di andare a letto).

La popolazione iniziale include piccoli seed relazionali: alcuni esterni sono
già amici/familiari/conoscenti e un coworker parte con una leggera tensione.
Questo rende più probabili anche confronti, scuse o riparazioni invece di sole
interazioni positive.

> Per gli esperimenti da console vedi “How to run a social experiment manually”
> in `docs/TECHNICAL.md`.
