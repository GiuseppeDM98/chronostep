# Idee di implementazione e prompt

Questo documento raccoglie i miglioramenti richiesti per Chronostep, spiegando lo scopo, un approccio di implementazione ad alto livello e un prompt pronto per una sessione futura.

## 1) Report mensile (raggruppato per progetto/task)

**Stato**
Completato.

**Scopo**
Offrire una pagina "Report" mensile che riassume il lavoro per progetto/task con totali e un elenco sintetico delle attivita, cosi da preparare rapidamente il report per il manager.

**Come implementarlo**
- Aggiungere una nuova pagina in `src/app/report/page.tsx` con `AuthGate`.
- Riutilizzare `useTaskStore` per ottenere `tasks`, `steps` e `workLogs`.
- Preparare i dati derivati con `useMemo`: filtrare per mese, raggruppare per task (e opzionalmente per tag/progetto), sommare le durate e generare highlights dalle note dei worklog.
- Aggiungere un month picker (come nella Timeline).
- Spostare eventuali helper in `src/lib/insights.ts` (es. `buildMonthlyReportSummary`).
- Layout compatto: tabella o card con nome task, ore totali e highlights.

**Prompt per una sessione futura**
“Crea una nuova pagina Report mensile in Chronostep (Next.js App Router) che raggruppa i worklog per task, somma le ore totali per task e mostra una lista breve di highlights dalle note. Riusa `useTaskStore` e metti eventuali helper in `src/lib/insights.ts`. Aggiungi filtro mese come nella Timeline. Usa `useMemo` per i dati e avvolgi la pagina con `AuthGate`.”

---

## 2) Tag/etichette sui worklog

**Stato**
Completato.

**Scopo**
Introdurre tag (cliente, progetto, tipo attivita) per filtrare e aggregare meglio i dati a fine mese.

**Come implementarlo**
- Estendere i tipi in `src/lib/types.ts` con `tags: string[]` su `WorkLog`.
- Aggiornare il CRUD in `useTaskStore` per leggere/salvare i tag.
- Aggiornare la UI di creazione worklog con input tag (chip o input separato da virgole).
- Aggiungere filtri per tag in Timeline e Report.
- Aggiungere un helper derivato in `src/lib/insights.ts` (es. `groupWorkLogsByTag`).

**Prompt per una sessione futura**
“Aggiungi il supporto ai tag sui WorkLog in Chronostep. Estendi `WorkLog` in `src/lib/types.ts` con `tags: string[]`, aggiorna il CRUD in `useTaskStore`, aggiungi un input tag in creazione worklog e aggiungi un filtro per tag in Timeline e Report. Metti il grouping in `src/lib/insights.ts` e memoizza i dati.”

---

## 3) Filtro substep per stato e stato piu chiaro

**Scopo**
Permettere di filtrare i substep per stato e rendere lo stato piu leggibile a colpo d'occhio.

**Come implementarlo**
- Nella pagina dettaglio task (es. `src/app/tasks/[id]/page.tsx`), aggiungere un filtro stato usando `TASK_STATUS_OPTIONS`.
- Usare `useMemo` per filtrare gli step in base allo stato selezionato.
- Migliorare la resa visiva: badge o dot colorata + label testuale per lo stato.
- Assicurare coerenza con `TASK_STATUSES` e `TASK_STATUS_OPTIONS`.

**Prompt per una sessione futura**
“Nella pagina dettaglio task aggiungi un filtro per stato dei substep usando `TASK_STATUS_OPTIONS` e rendi lo stato piu leggibile con badge/dot + label. Usa `useMemo` per gli step filtrati, mantieni i tipi coerenti con `TaskStatus` e aggiorna le costanti condivise se necessario.”

---

## 4) Preset / azioni rapide per attivita ricorrenti

**Scopo**
Velocizzare la creazione dei worklog con preset riutilizzabili (task + nota + durata + tag).

**Come implementarlo**
- Creare un tipo `WorkLogPreset` in `src/lib/types.ts`.
- Salvare i preset in Firestore (collezione `workLogPresets` o sotto il profilo utente).
- Aggiungere CRUD in `useTaskStore` per i preset.
- Aggiungere una UI “Quick log” su Timeline o Tasks per creare un worklog da preset.

**Prompt per una sessione futura**
“Implementa i preset per WorkLog in Chronostep. Aggiungi un tipo `WorkLogPreset`, salva i preset in Firestore, aggiungi CRUD in `useTaskStore` e una UI ‘Quick log’ che crea un worklog da preset (task, nota predefinita, durata, tag). Memoizza i dati derivati dove serve.”

---

## 5) Timer Start–Stop

**Scopo**
Ridurre gli errori di memoria tracciando il tempo in modo live e creando un worklog a fine sessione.

**Come implementarlo**
- Aggiungere stato timer in UI (start time, running, task/step selezionato).
- Salvare lo stato del timer in local storage per resistere al refresh.
- Al stop, calcolare la durata e creare il worklog via `useTaskStore`.
- Opzionale: indicatore di timer in corso visibile tra le pagine.

**Prompt per una sessione futura**
“Aggiungi un timer Start–Stop in Chronostep. L'utente seleziona task/step, avvia il timer e allo stop viene creato un worklog con durata calcolata. Salva lo stato del timer in local storage e mostra un indicatore di timer in corso. Usa `useTaskStore` per la scrittura finale.”

---

## 6) Calendar heatmap

**Scopo**
Fornire un colpo d'occhio sui giorni piu intensi.

**Come implementarlo**
- Costruire una griglia calendario per un mese selezionato (riusa utilita di Timeline/Insights).
- Aggregare i minuti totali per giorno dai worklog.
- Mappare i totali su una scala colori (classi Tailwind).
- Renderizzare una heatmap con label o tooltip dei giorni.

**Prompt per una sessione futura**
“Crea una vista heatmap calendario con i totali giornalieri dei worklog per un mese selezionato. Aggrega i minuti per giorno da `useTaskStore`, mappa i totali a una scala colori e renderizza una griglia calendario. Memoizza i dati e usa solo Tailwind per lo stile.”

---

## 7) Trend mensili (totale ore, top task, top tag)

**Scopo**
Confrontare i mesi a colpo d'occhio con metriche chiave.

**Come implementarlo**
- Aggiungere una sezione trend (nella pagina Report o in Insights).
- Calcolare totali per mese, top task per ore e top tag per ore.
- Visualizzare con card o mini chart (senza librerie pesanti all'inizio).
- Tenere i calcoli in `src/lib/insights.ts` e memoizzare in UI.

**Prompt per una sessione futura**
“Aggiungi una sezione Trend mensili con totali ore per mese, top task per ore e top tag per ore. Metti gli helper in `src/lib/insights.ts`, memoizza in UI e usa card di riepilogo (senza librerie chart se non necessario).”
