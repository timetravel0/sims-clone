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

## Economia del cibo e morte per fame

**Costo pasto.** Ogni volta che un Sim usa un oggetto che ripristina la fame
(frigorifero, tavolo da pranzo o qualsiasi oggetto con `needTarget === 'hunger'`),
il sistema detrae automaticamente **§15** dal budget familiare. Se il budget è
insufficiente, il Sim non può mangiare (`UseObjectAction` termina subito senza
ripristinare il bisogno o caricare l'oggetto).

**Scala della fame.** `HealthSystem` controlla la salute ogni ~28 secondi di
gioco. Se la fame di un Sim scende sotto **10** e ci rimane:

| Cicli di starvation | Conseguenza |
|---|---|
| ≥ 5 (~2 minuti) | Il Sim si ammala di **starvation** (severity 0.75) |
| ≥ 25 (~12 minuti) | Il Sim **muore** — `sim:died` + story entry |

La malattia da fame non guarisce spontaneamente finché il Sim non riesce a
mangiare: il contatore `_starveCycles` si azzera solo quando la fame risale
sopra 10 (il Sim ha mangiato). In quel caso la malattia segue il normale
percorso `ill → recovering → healthy`.

**Morte.** `HealthSystem._killSim()` segna `person.dead = true`, nasconde la
mesh, rimuove il Sim dall'array `game.sims`, chiama
`population.deactivatePerson()` e emette `sim:died` + `life:event(death)` +
`story:entry` drammatica. Non c'è resurrezione: la morte è permanente per quella
sessione (la persona rimane nel record della popolazione con `dead: true`).

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
6. Rumore contestuale (circadiano + mood + emozione dominante, deterministico per Sim)

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

Il **pannello LifeCycle** (toolbar) mostra le barre di progresso degli obiettivi
attivi direttamente nell'interfaccia, con aggiornamento a ogni `goal:completed`.

### Rumore contestuale (ContextualNoise)

Il rumore contestuale modula lo scoring delle azioni con:
- **Curva circadiana** — i Sim normali sono più sociali 18:00–21:00; i Sim **nevrotici** (neurotic > 0.4) usano una curva spostata (picco 20:00–21:00, mattina più bassa).
- **Mood tier** — Sims miserable ricevono −60% rumore sociale.
- **Emozione dominante** — joy/love amplificano le azioni sociali (+30–40%); fear/anger/sadness le attenuano (−25–45%); le azioni su oggetti reagiscono in senso opposto (sadness → +15% oggetti).

### AI Debug overlay (dashboard)

Il tab **🧠 AI Debug** nel dashboard mostra, per il Sim selezionato nel gioco:
- **Experiential Bias top-5** positivi e negativi (affordance → valore appreso)
- **Obiettivi attivi** con barra di progresso
- **Top-5 memorie** per salienza
- **Ultima decisione Utility AI** (azione, score, need/goal driver)
- **Emozione corrente** (tier + tipo dominante)

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

**Casa di partenza (set minimo ma completo).** Una nuova partita parte già con un
set di arredo **minimo ma completo**, organizzato per **zone funzionali**, così la
famiglia può soddisfare ogni bisogno e allenare ogni abilità fin da subito:
- **Camera**: letto (energia) + lampada (ambiente/stanza)
- **Studio**: scrivania (logica)
- **Cucina** (ciclo completo del cibo): frigo → piano di lavoro → fornelli →
  lavandino
- **Sala da pranzo**: tavolo (mangiare + carisma)
- **Soggiorno**: divano (comfort) + TV (divertimento/social)
- **Bagno**: WC (vescica) + doccia (igiene)
- **Hobby/abilità**: piano (creatività), tapis roulant (fitness), banco da lavoro
  (manualità)
- **Comunicazione**: telefono (chiamate/inviti)

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

**Carriere.** Esistono **34 professioni** in 10 famiglie (cucina, scienza/medicina,
tecnologia, istruzione, business, arte, fitness, servizi pubblici, artigianato,
freelance), ciascuna con orari, skill richieste, stipendio e livello di stress
propri. Entrare in una carriera è libero; le skill richieste contano per
promozioni e performance, non per l'assunzione.

**Cambio lavoro.** Ogni Sim può cambiare carriera dal pannello Lifecycle/Career
(`switchCareer`) oppure **autonomamente**: se dopo 3 giorni lavorativi consecutivi
non viene promosso, **oppure se è in burnout**, valuta spontaneamente se cambiare
settore (probabilità base 8%, amplificata dal tratto Ambitious e triplicata in
caso di burnout). In burnout sceglie preferibilmente un lavoro meno stressante.

**Orario di lavoro.** Gli orari ora variano per professione: turni diurni
standard, mattine presto, pomeriggi/sere, **turni notturni** (es. medico,
chirurgo), **lavoro nel weekend** (ristorazione), part-time e orari flessibili
(creativi/freelance). Durante il turno il Sim è fuori dal lotto (nascosto) e
rientra a fine turno.

**Stress lavorativo e burnout.** Ogni turno accumula o smaltisce stress in base
all'intensità del lavoro; i lavori stressanti consumano divertimento. Oltre una
soglia il Sim va in **burnout** (calo d'umore, scatto di rabbia) e tende a
cambiare lavoro. A fine turno può capitare una **bella giornata** (bonus in
stipendio) o una **giornata storta** (penalità). Il pannello Carriera mostra una
barra di stress.

**Mangiare (preparazione del cibo).** La fame non si risolve più "aprendo il
frigo": quando un Sim ha fame avvia un vero **ciclo del cibo** — va al frigo
(ingredienti), al **piano di lavoro** (preparazione), ai **fornelli** (cottura) e
infine **mangia a tavola**. La ricetta scelta dipende dall'abilità in cucina
(cuochi migliori sbloccano piatti più ricchi e con più porzioni). La **qualità**
del pasto (scarso/normale/buono/eccellente) dipende da abilità ed
elettrodomestici disponibili: senza fornelli si mangia crudo (scarso). Mangiare a
tavola dà comfort, socialità e status; mangiare in piedi costa comfort. Un pasto
scarso può causare **intossicazione alimentare**. Un pasto servito a tavola
**sfama anche gli altri membri della famiglia** presenti e affamati (pasto di
gruppo). Se mancano cucina o tavolo il Sim mangia comunque (versione di ripiego):
nessuno muore di fame per un percorso bloccato.

**Pianificazione domestica autonoma.** Una volta al giorno la famiglia fa il
punto della situazione e decide **un intervento prioritario**: osserva fondi,
malattie, bisogni sotto pressione e ambizione, classifica le possibili azioni per
urgenza (tenendo conto di ciò che può permettersi) e mette in atto quella più
importante — **curare un malato**, **costruire una stanza**, **comprare un
oggetto** o **riorganizzare i mobili**. Ogni decisione è annunciata nello story
log come un "🏠 Piano di famiglia" con il motivo, così i miglioramenti della casa
sono scelte spiegabili e coordinate, non reazioni isolate.

**Costruzione autonoma di stanze.** Quando la famiglia non ha abbastanza letti
per i suoi membri, **acquista terreno e costruisce autonomamente una nuova
stanza** (camera da letto): il lotto si espande, viene racchiusa una stanza con
una **porta** e arredata con un letto. La decisione è gated da un motivo
funzionale, una riserva di fondi, un costo del terreno, un cooldown e un tetto
massimo di stanze — niente costruzioni senza motivo. Ogni costruzione è annunciata
nello story log. Il giocatore può anche espandere il lotto manualmente (Est/Sud)
dal menu di costruzione.

**Malattia e guarigione.** I Sim possono ammalarsi (raffreddore, influenza,
spossatezza, intossicazione alimentare) con probabilità legata a igiene, energia,
fame, qualità del cibo e meteo. Una malattia passa da `ill` a `recovering` e
infine a `healthy`, con un costo temporaneo su energia, divertimento e socialità.
Gli incidenti fuori casa provocano un infortunio.

**Cure mediche a pagamento.** La malattia non si risolve più solo aspettando: un
**dottore può curare a pagamento**. Quando un Sim della famiglia si ammala in modo
abbastanza grave e la famiglia può permetterselo, **prenota da solo una visita**;
in alternativa il giocatore può premere 🩺 **"Chiama il dottore"** nel pannello
Lifecycle del Sim selezionato. Dopo un breve tempo di arrivo, la **tariffa viene
pagata** dal budget e la malattia **guarisce** (o si attenua, per la semplice
consulenza). Le cure disponibili vanno dalla consulenza base (§120) e dai farmaci
(§80) fino al pronto intervento (§450) e alla visita medica a domicilio (§700),
scelte in base al tipo e alla gravità della malattia.

**Igiene della cucina e piatti sporchi.** Ogni pasto cucinato **sporca la cucina**
e lascia piatti da lavare. Una cucina sporca **aumenta il rischio di
intossicazione e di malattia**. Per pulire serve un **lavandino**: la
pianificazione domestica programma il **lavaggio dei piatti** quando l'igiene
scende troppo, riportando la cucina pulita.

**Cibo, salute e cure collegati.** Un pasto di **bassa qualità** può causare
**intossicazione alimentare**: il rischio cresce con la scarsa qualità e cala con
l'**abilità in cucina** (un cuoco esperto cucina in sicurezza). La **qualità della
nutrizione** nel tempo influenza la salute: chi mangia bene si ammala di meno, chi
si nutre male di più (e i pasti migliori ridanno anche un po' di energia). Quando
arriva un'intossicazione, il **dottore può risolverla rapidamente** col pronto
intervento, invece di aspettare la guarigione naturale. Questo crea un ciclo
coerente: cucinare bene → meno malattie → meno spese mediche.

**Uscite dal lotto (con motivo chiaro).** Oltre al lavoro, i Sim della famiglia
escono autonomamente per un **pranzo/cena fuori**, una **gita**, una **visita a
un altro Sim** o per **altro**. Quando un Sim lascia il lotto il motivo è sempre
esplicitato nello story log (es. *"Alice è uscita per un pranzo fuori"*,
*"Bob è andato al lavoro come Chef"*) e il Sim viene nascosto finché non rientra.
Al rientro recupera i bisogni in base al tipo di uscita. Non escono se hanno un
bisogno critico (fame/energia/bisogno fisiologico): in quel caso restano a casa.

**Incidenti fuori casa.** Mentre sono fuori (uscita o lavoro) i Sim possono avere
un incidente, che li fa rientrare/risultare infortunati (vedi Salute).

**Figli e limiti familiari.** Una coppia può avere figli solo se: vivono nella
**stessa famiglia (household)**, hanno una **relazione amorosa reciproca**
abbastanza forte, sono **maschio e femmina** e **non sono consanguinei**. Le
nascite autonome rispettano ora **limiti espliciti**: dimensione massima del
nucleo, **numero massimo di figli per coppia**, tetto ai figli a carico,
**disponibilità economica** (budget minimo), **stabilità della relazione**
(romance sufficiente), **salute** di entrambi i genitori e **capacità di posti
letto**. Il figlio nasce come membro della famiglia a livello di dati (non un Sim
sul lotto); cresce sullo sfondo e **compare come Sim adolescente**, poi invecchia
normalmente. Un cooldown separa le nascite. Ogni Sim ha inoltre un **profilo di
fertilità** (desiderio di figli + fecondità): la probabilità di una nascita
dipende dal desiderio medio della coppia e il concepimento dalla fecondità. Esiste
un interruttore globale che può **disattivare del tutto le nascite autonome**.
La storia familiare di ciascuno (essere diventati partner, aver avuto un figlio,
legami tra fratelli) e la **storia di carriera** (assunzioni, cambi, promozioni)
vengono registrate e salvate.

**Dove si trova ogni Sim (e perché).** Il pannello Lifecycle del Sim selezionato
mostra un riquadro 📍 con **dove si trova** (stanza e coordinate sul lotto, oppure
"al lavoro"/"in visita"/"fuori"/"dal dottore"), **cosa sta facendo** (dorme,
cucina e mangia, socializza, cammina, ecc.), il **motivo** e l'oggetto vicino. I
ritratti dei Sim in alto a sinistra mostrano lo **stato live** passandoci sopra il
mouse, così si capisce a colpo d'occhio dove sono tutti i membri della famiglia.

**Struttura familiare iniziale e istruzione.** All'avvio la famiglia viene
generata con una struttura: i primi due adulti sono **sposi**, il terzo è
**fratello/sorella** del primo (stessa linea familiare → niente romance, bonus
familiare). Ogni Sim ha un **livello di istruzione** (nessuna/superiori/college/
università), mostrato nel pannello Lifecycle (🎓): un'istruzione più alta fa
**iniziare la carriera a un livello superiore** e dà un bonus iniziale alle skill
richieste. L'albero genealogico (genitori, figli, fratelli, istruzione)
sopravvive al salvataggio/caricamento.

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

## Pannello di configurazione (Admin)

Apri `http://127.0.0.1:1420/admin.html` mentre il server di sviluppo Vite è attivo.

Il pannello mostra tutti i parametri numerici del gioco organizzati in sezioni:

- **Decadimento Bisogni** — quanto rapidamente fame, energia, igiene ecc. calano nel tempo
- **AI Planner** — soglie e pesi del pianificatore utilità (goal bonus, rumore, topK)
- **Accettazione Sociale** — pesi della formula che decide se un Sim accetta un'interazione
- **Utilità Azioni Sociali** — impatto su ogni bisogno per ciascun tipo di interazione (chat, flirt, conforto…)
- **Delta Tier Emozione** — quanto ogni emozione alza/abbassa il tier d'umore
- **Drift Relazioni** — decadimento passivo delle dimensioni relazionali (fiducia, affetto…)
- **Oggetti** — utilità e prezzo di acquisto per ogni oggetto della casa

Ogni valore ha uno slider e un campo numerico sincronizzati. Clicca **Salva** per scrivere le modifiche su `config/gameConfig.json`; Vite rileva il cambiamento e ricarica il gioco automaticamente nella scheda del browser.

## Nuove funzionalità (NEW_FEATURES.md)

### Espansione lotto
In Build Mode appare il pulsante **🏗️ Espandi §1500**. Cliccandolo si apre un overlay con quattro direzioni (Nord, Est, Sud, Ovest). Il gioco scala il lotto di 8 tile nella direzione scelta, aggiunge il pavimento corrispondente, e il rilevatore di stanze si aggiorna automaticamente. Il costo (§1500) viene detratto dal budget; se insufficiente compare un avviso.

### Trasloco romantico
Quando un visitatore e un membro del nucleo raggiungono entrambi romance ≥ 50 (reciproco), appare un dialog modale: **Accetta** trasferisce il visitatore nel nucleo e li segna come partner; **Rifiuta** applica una penalità romance di −10.

### Obiettivo condiviso: benessere familiare
Ogni volta che cambia il giorno di gioco (`clock:dayChanged`), il sistema controlla se tutti i Sims del nucleo (non in lavoro, non visitatori) hanno media bisogni ≥ 60. Se la condizione tiene per 3 giorni di fila: +§500 al budget e story entry. Il ciclo ricomincia dopo 7 giorni. Il progresso è visibile nel LifeCyclePanel sotto "Obiettivo Famiglia".

## Funzionalità recenti

### Inviti programmati (Telefono)
Nel pannello telefono ogni contatto ha ora due pulsanti di invito: **Invita ora** (visita immediata) e **Domani** (visita programmata a ~1440 tick, circa un giorno di gioco). Le visite programmate bypassano il citofono — il visitatore entra direttamente senza attendere risposta alla porta.

### Ispezione memorie (tasto M)
Con un Sim selezionato, premi **M** per aprire il pannello memorie. Mostra le memorie episodiche del Sim (tipo, intensità, attori coinvolti) come barre colorate. Il pannello si aggiorna automaticamente quando si seleziona un altro Sim.

### Reputazione e gossip
Ogni Sim ha una reputazione calcolata come media ponderata di rispetto, affetto e risentimento degli altri verso di lui. Il gossip negativo ha una probabilità del 30% che il soggetto venga a sapere, causando un deterioramento della relazione con il gossiper.

### Invecchiamento e morte
Gli anziani (elder) esposti a energy o hunger sotto 5 per 3 giorni consecutivi muoiono di vecchiaia. Il Sim viene rimosso dalla partita e compare una voce nella storia. Il bonus AI per le azioni di cura (comfort, hug, chat) verso familiari è +4 punti score.

### Seeding deterministico (browser)
Aggiungere `?seed=42` all'URL della partita fa sì che tutte le chiamate a `Math.random()` usino Mulberry32 con quel seed — identico all'headless runner. Due sessioni con lo stesso seed producono la stessa sequenza di azioni.

---

## Diagnostica sessione interattiva

Il gioco ora registra automaticamente ogni partita in `localStorage` (chiave `sims-session-log`, max 3000 eventi). Dalla console del browser:

```js
// Riassunto testuale di cosa è successo
_game.sessionLog.summary()

// Ultimi 30 eventi in formato strutturato
_game.sessionLog.tail(30)

// Scarica sims-log-YYYY-MM-DD...json
_game.sessionLog.export()

// Cancella il log salvato
_game.sessionLog.clear()
```

**Eventi catturati:**
- `sim:needsSnapshot` ogni 60 ticks — hunger/energy/hygiene/bladder/social di tutti i Sim + budget
- `food:eatAborted` — quando un Sim tenta di mangiare ma fallisce: `{ simName, reason, hunger, budget, objectId }`. `reason` può essere `budget_insufficient` (soldi insufficienti) o `object_in_use` (frigo occupato)
- `health:starvationProgressed` — ogni ciclo di fame (`STARVE_HUNGER_MAX=10`): `{ simName, cycles, maxCycles, hunger, budget }`. La morte avviene al ciclo 25 (~12 minuti di gioco)
- `budget:insufficient` — ogni tentativo di acquisto fallito (incluso cibo)
- `story:entry`, `sim:died`, `career:promoted`, `skill:levelUp`, ecc.

**Come diagnosticare la morte per fame:**
Se i Sim muoiono nonostante i soldi, il log mostrerà: se `food:eatAborted.reason = object_in_use` → il frigo è rimasto bloccato (`inUse=true` senza reset); se `reason = budget_insufficient` → il budget era davvero esaurito in quel momento; se nessun `food:eatAborted` → il planner non ha mai proposto di mangiare (bug nel priority override dei bisogni critici).

---

## WP1 — Spatial Reliability & Layout Intelligence

### Camera zoom e rotazione
La camera è ora interattiva: **scroll del mouse** fa zoom in/out (range 5–30 unità, default 12). I tasti **Q** ed **E** ruotano la vista di 90° snappati (NW → NE → SE → SW → NW). I limiti prevengono un ingrandimento eccessivo o un campo visivo troppo stretto. Il raycasting sul suolo e la selezione dei Sim rimangono corretti dopo la rotazione perché la camera orthografica aggiorna posizione e lookAt coerentemente.

### Muri, porte e stanze verificati
I test automatizzati (`tests/WallManager.test.js`) confermano tutti gli invarianti:
- Un Sim non può attraversare un muro (il Pathfinder controlla `wallManager.isPassable()` per ogni edge)
- Un Sim può attraversare una porta
- Rimuovere una porta ripristina la passabilità corretta
- serialise/restore preserva l'intera configurazione muri/porte
- Il rilevatore di stanze BFS rispetta i muri e riclassifica al cambio

### Object function tags
Ogni oggetto nel catalogo ha ora `category`, `functionTags` e `roomTags`. Questa informazione permette all'AutonomousShoppingSystem di ragionare per funzione invece di sola `needTarget`, e al LayoutPlanner di valutare la coerenza zonale. `adjacencyPrefs` documenta quali oggetti beneficiano di vicinanza.

### LayoutPlanner — score, suggerimenti e riorganizzazione autonoma
`window._game.layoutPlanner` è disponibile in console e attivo nel game loop:
- **`score()`** → `{ total, zones, issues }` — punteggio per zona funzionale (bedroom, bathroom, kitchen, dining, living, study). Include violazioni (sparsi, prossimità indesiderata).
- **`suggestMoves()`** → lista spostamenti consigliati ordinati per guadagno stimato. Non esegue nulla.
- **`autoRearrange()`** — esegue autonomamente la mossa migliore se: l'oggetto non è in uso, la mossa migliora il punteggio di almeno 5 punti, e la connettività del lotto è preservata (BFS check).

Il sistema si attiva automaticamente ogni ~1 ora di gioco. Ogni spostamento emette una voce nella storia ("Il nucleo riorganizza la casa: TV spostato più vicino al Piano").

Esempio console:
```js
_game.layoutPlanner.score()
// { total: 42, zones: { bedroom: { score: 20, objectCount: 1 }, ... }, issues: [...] }
_game.layoutPlanner.suggestMoves()
// [{ objectId: 'tv', from: {gx:8,gz:5}, to: {gx:2,gz:7}, reason: 'move closer to Piano (6 tiles away)', gain: 14 }]
_game.layoutPlanner.autoRearrange() // esegue subito la mossa migliore
```
