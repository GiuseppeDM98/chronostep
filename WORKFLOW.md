# WORKFLOW.md

Regole di sessione e collaborazione per chi (persona o agente) lavora su questo repo. La Parte 1 è
lo standard portabile, uguale in ogni repo dove viene adottato. La Parte 2 è locale a ChronoStep.

## Parte 1 — Regole di sessione e collaborazione

1. Mai fare commit senza approvazione esplicita. Non eseguire `git commit` (né `--amend`) finché
   non arriva l'OK per quel commit specifico. Finire il lavoro, riassumere il diff, poi chiedere.
   Creare il branch e modificare i file non richiede approvazione — solo il commit.

2. Un branch per sessione. Prima di iniziare lavoro di implementazione, creare un nuovo branch a
   partire dal branch attivo all'inizio della sessione (controllare sempre quale sia, non dare per
   scontato master/main).

3. Un solo commit per sessione. Tutte le modifiche di una sessione vanno squashate in un unico
   commit, non sparse su più commit.

4. Rispondere sempre in italiano quando si lavora su questo repo (vale per il canale
   conversazionale — codice, identificatori e commenti restano in inglese).

### Regola del collaudo guidato

Quando si deve verificare manualmente che una funzionalità appena implementata funzioni, non
consegnare una checklist e sparire. Il collaudo si fa insieme, in chat, una fase alla volta. Quattro
obblighi:

1. I dati di prova li prepara l'agente — uno script usa-e-getta (non tracciato da git, cancellato a
   fine collaudo) con "parole spia" (parole inventate tipo fenicottero, ornitorinco, che non
   compaiono da nessun'altra parte nell'archivio), non a mano da parte dell'utente.
2. Una fase per messaggio — dare la fase, aspettare il resoconto, poi la successiva. Mai consegnare
   tutte le fasi insieme: fa saltare i prerequisiti.
3. Dichiarare l'esito atteso prima di eseguire, non dopo — altrimenti la lettura si adatta sempre a
   quello che è successo.
4. Fare ogni controllo che si riesce ad automatizzare, e lasciare all'utente solo quello che non si
   può fare. "Insieme, in chat" non vuol dire "un click alla volta dettato all'utente": se le sessioni
   sono JWT o comunque scriptabili, scrivere uno script usa-e-getta che apre un vero browser (es.
   Playwright) con una sessione autenticata — quella dell'agente stesso se il ruolo lo permette,
   altrimenti un'identità di prova usa-e-getta creata per l'occasione — e verificare ogni esito sul
   database o sulla risposta HTTP, mai sul solo aspetto della pagina. Riportare i risultati fase per
   fase, con l'esito atteso dichiarato prima. Ogni test end-to-end automatico che si è in grado di
   eseguire, lo si esegue: non dichiarare mai una funzionalità verificata se un controllo automatico
   che poteva coprirla è rimasto non eseguito. Lasciare all'utente solo ciò che è genuinamente non
   automatizzabile: giudizio visivo/estetico, hardware fisico (es. uno scanner di barcode reale), o
   un login interattivo che non si può guidare da script (es. un vero flusso OAuth con MFA).

Fasi standard da seguire quando ha senso: A-Invarianza (quello che c'era prima funziona ancora) →
B-Cambio di contesto (il ruolo/stato nuovo è davvero attivo) → C-Comportamento nuovo (fa quello che
deve, non quello che non deve — qui vale di più il punto 4: automatizza) → D-Sotto la UI (le stesse
regole reggono chiamando la route a mano) → E-Casi negativi (chi non ha diritti viene respinto, con
l'errore giusto) → F-Ripristino (configurazione ripristinata, fixture rimosse, script cancellato).

Un test negativo da solo non prova un guard di sicurezza: serve sempre la coppia risorsa-propria
(controllo positivo, deve riuscire) / risorsa-altrui (il test, deve fallire), con lo stesso identico
file/dato. Chiusura del collaudo: ripristinare eventuali config modificate, rimuovere fixture e
allegati di prova, cancellare lo script, e annotare l'esito da qualche parte che sopravvive alla
sessione (CLAUDE.md o equivalente) — un collaudo non annotato vale come non fatto.

## Parte 2 — Come si applica in questo repo

**Gestore pacchetti e comandi.** npm. `npm test` esegue in sequenza `test:dates`, `test:insights`,
`test:verdicts`, `test:rules` (vedi `package.json`); `npm run lint` e `npm run build` sono gli altri
controlli automatici disponibili. Non esiste CI configurata nel repo (nessuna cartella `.github`):
questi comandi vanno lanciati a mano prima di considerare un collaudo chiuso.

**Non esiste una suite E2E autenticata.** Le quattro suite in `tests/` sono unit/integration su
regole Firestore, date, insights e verdetti — nessuna guida un browser. `playwright` è una
devDependency usata solo da `scripts/screenshots.mjs`, che apre un browser reale, fa login con
l'account demo (`demo@chronostep.local` / `chronostep`, sovrascrivibili con `SEED_EMAIL` /
`SEED_PASSWORD`) contro l'emulatore Auth, e scatta screenshot: non fa assert sui dati. È comunque il
pattern di riferimento da cui partire per uno script di collaudo — stesso login reale via
Playwright, ma seguito da una verifica sui dati (vedi sotto) invece che da uno screenshot.

**Ambiente locale isolato.** Emulatori Firebase, non un database di test separato:
```bash
npm run emulators                                  # Auth :9099, Firestore :8080 (firebase.json)
npm run seed                                       # scripts/seed-emulator.mjs — account + fixture relative a "oggi"
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev
```
`npm run test:rules` gira su un emulatore Firestore separato, porta 8181 (`firebase.test.json`),
apposta per poter girare insieme agli emulatori di sviluppo senza conflitto di porta.

**Identità di prova.** Non esiste un ruolo admin lato client. Per un secondo utente, replicare il
pattern `ensureUser` di `scripts/seed-emulator.mjs`: `POST` a
`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp` (o `:signInWithPassword`
se l'account esiste già) con `key=fake-api-key`. Per un collaudo a un solo ruolo, riusare l'account
demo seedato è sufficiente.

**Come si legge indietro lo stato reale.** Non c'è un endpoint REST admin, e la Firestore emulator UI
è disabilitata di default (`"ui": {"enabled": false}` sia in `firebase.json` sia in
`firebase.test.json`). Due opzioni, in ordine di preferenza:
1. Dallo stesso script Node/Playwright usato per il collaudo, interrogare Firestore con l'SDK client
   (`firebase/firestore`) puntato all'emulatore, con le stesse credenziali dell'utente di prova — lo
   stesso approccio che `scripts/seed-emulator.mjs` usa per scrivere, applicato a una lettura dopo
   l'azione da verificare.
2. Abilitare temporaneamente `"ui": {"enabled": true}` in `firebase.json` per ispezionare a mano
   durante il collaudo, poi riportarlo a `false` in fase F (ripristino) — è un file tracciato da git.

Non leggere lo uid da `localStorage` per un flusso con emulatore: Firebase Auth persiste in
IndexedDB (già annotato in `AGENTS.md`).

**Branch.** Predefinito/di integrazione: `main` (`origin/main`). Le convenzioni di naming
(`feature/…`, `fix/…`, `refactor/…`, `chore/…`) e il formato dei messaggi di commit (Conventional
Commits) sono già in [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md#-git--versioning) — non
duplicati qui.

**Dove annotare l'esito di un collaudo.** Non esiste oggi un posto dedicato. `Draft Release Temp.md`
accumula solo le note di rilascio visibili all'utente finale, non gli esiti di verifica interna.
Proposta: una sezione `## Collaudi manuali` in fondo a `CLAUDE.md` (il file caricato
automaticamente), una riga per collaudo — data, funzionalità, fasi eseguite, esito. Crearla al primo
collaudo che segue questa regola, se non esiste ancora.

### Cosa manca, oggi, per rispettare pienamente l'obbligo 4

- Nessuna suite E2E vera: le quattro suite in `tests/` non guidano un browser né un flusso HTTP
  completo. Il minimo indispensabile sarebbe uno script Playwright riusabile (login emulatore +
  helper di lettura Firestore) invece di scriverne uno da zero a ogni collaudo.
- Nessun endpoint di debug/admin per leggere lo stato senza passare dall'SDK client o dalla Firestore
  emulator UI (disabilitata di default).
- Nessun posto già esistente per gli esiti dei collaudi manuali: va creato alla bisogna (proposta
  sopra).
