# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Giuseppe, operatore singolo.** ChronoStep è il suo diario operativo personale: un solo account reale,
i suoi dati, nessuna collaborazione. Lo apre **qualche volta al giorno** — la mattina, dopo pranzo, a
fine giornata — da desktop. Ogni apertura è un ri-orientamento: la domanda che si porta dietro è
"cosa faccio adesso?", non "fammi vedere tutto".

**Un account demo pubblico**, con credenziali mostrate sulla schermata di accesso, esiste perché
l'app possa essere fatta provare a qualcuno. È un utente secondario reale, non un'ipotesi: chi
arriva da lì non conosce il prodotto e non ha dati propri.

## Product Purpose

Tenere insieme tre cose che di solito stanno in strumenti diversi: **cosa c'è da fare**, **com'è
scomposto**, e **dove sono finite le ore**. Il successo è che a fine mese esista un consuntivo
attendibile senza che nessuno abbia dovuto ricostruire la giornata a memoria, e che all'apertura si
capisca in pochi secondi cosa merita attenzione adesso.

## Positioning

Il meccanismo che un task manager non ha e un time tracker nemmeno: **il tempo si attacca allo
step, non solo al task**. Un task si scompone in step annidati con ordine e riparentaggio; il timer
punta a uno step preciso; il work log conserva la nota di cosa è stato fatto. Ne consegue che il
consuntivo mensile non dice soltanto "8 ore su questo lavoro" ma su quale pezzo di lavoro sono
andate, e la nota del perché è lì accanto.

## Operating Context

- Desktop. Il telefono è tollerato, non è il caso da ottimizzare.
- Sessioni brevi e ripetute nell'arco della giornata, non una sessione lunga.
- Il timer è un oggetto vivo che attraversa le pagine: può essere in corso mentre si guarda
  qualcos'altro, e deve poter essere fermato da ovunque.
- Periodi intensi si alternano a settimane ferme: l'interfaccia incontra regolarmente dati magri.

## Capabilities and Constraints

**Modello di dominio.** Task → Step annidati (ordine, riparentaggio, auto-completamento verso l'alto)
→ Work log (`start` / `stop` / `note`, con tag e durata). Ogni documento porta un `userId`.

**La forbice di granularità è il vincolo di design centrale.** Un task va da "ricordarmi di mandare
quella mail" — nessuno step, nessun log, vita di dieci minuti — a un progetto con scadenza, otto step
su tre livelli e settimane di work log. Vivono nella stessa lista. Un task senza struttura non deve
sembrare rotto o incompleto accanto a uno strutturato, e le schermate non devono presupporre che
esista una gerarchia.

**Vocabolario neutro.** Il dominio è "qualsiasi task lavorativo": nessuna parola dell'interfaccia deve
presumere un cliente, una commessa, una fattura o un progetto software. I tag sono il meccanismo con
cui l'utente introduce il proprio vocabolario.

**Tecnici.**
- Next.js App Router; tutte le pagine sono client component. Nessun server tier, nessuna API route,
  nessuna server action.
- Firebase client SDK: Auth email/password e Firestore. Le regole Firestore sono l'unico confine fra
  i dati di due account — non esiste un livello server che possa ricontrollare.
- Nessun listener realtime: si legge a richiesta e si rilegge dopo ogni scrittura.
- Le registrazioni possono essere chiuse via variabile d'ambiente. Essendo `NEXT_PUBLIC_`, è un
  filtro dell'interfaccia e non un controllo: chiudere davvero le registrazioni è una configurazione
  di Firebase Auth.

**Copy.** Italiano, in tutta l'interfaccia.

## Brand Commitments

Il nome è **ChronoStep**. La voce è quella di uno strumento personale: diretta, concreta, mai
promozionale, mai congratulatoria senza motivo. L'app parla a una persona che conosce già i propri
dati e non va né istruita né lodata.

## Evidence on Hand

- **Nessun dato di produzione da preservare.** Il Firestore contiene dati vecchi più quelli
  dell'account demo, e può essere svuotato. Il modello dati è quindi correggibile dove è storto,
  senza migrazione.
- Nessun asset di marca esistente: niente logo, niente palette ereditata, nessun font vincolato.
- Nessuna testimonianza, metrica d'uso o caso reale. Non vanno inventati.

## Product Principles

1. **Ogni schermata risponde prima di mostrare.** L'utente conosce i propri dati; quello che non ha
   è la conclusione. La pagina la dice, poi la sostiene con i numeri.
2. **Un verdetto è un'affermazione verificabile, non un incoraggiamento.** Va calcolato da regole
   sui dati e deve poter dire che le cose vanno male. Un verdetto compiacente è un bug.
3. **I dati magri sono lo stato normale, non un caso limite.** Un account nuovo, un mese fermo, un
   task senza step: sono all'ordine del giorno e vanno progettati, non tappati con un vuoto.
4. **Il tempo registrato deve essere difendibile.** Meglio non contare dei minuti che inventarne: una
   sessione ambigua si scarta, non si arrotonda.
5. **Nessuna scrittura fallisce in silenzio.** Se un salvataggio non va a buon fine l'utente lo deve
   vedere, perché non c'è un server che possa rimediare dopo.

## Accessibility & Inclusion

WCAG 2.1 AA come base obbligatoria, resa vincolante dal riprogetto in corso: contrasto del testo
informativo ≥ 4.5:1 in entrambi i temi, ogni controllo con un'etichetta programmaticamente
associata, i dialoghi come veri dialoghi (ruolo, trappola del focus, ripristino del focus), focus
sempre visibile, e ogni interazione raggiungibile da tastiera. Doppio tema chiaro/scuro con
interruttore esplicito, che rispetta `prefers-color-scheme` come stato iniziale.
