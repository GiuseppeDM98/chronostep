/**
 * Fills the PUBLIC DEMO ACCOUNT of a real Firebase project with a diary worth looking at.
 *
 * Run with:
 *   node scripts/seed-demo.mjs --yes                  # add to whatever is there
 *   node scripts/seed-demo.mjs --yes --replace        # wipe that account first
 *
 * This writes to production. `--yes` is required and there is no default; the flag exists so the
 * command cannot be run by autocompleting a shell history.
 *
 * WHY IT EXISTS
 * -------------
 * The demo account is read-only (see `isDemoAccount` in firestore.rules), and read-only freezes
 * whatever is in there. An empty demo account shows empty screens, and Timeline, Report and Insights
 * have nothing at all to say without work logs — which is most of what distinguishes this app. So
 * the account has to be filled BEFORE the read-only rules are deployed.
 *
 * ORDER MATTERS, AND IT IS NOT REVERSIBLE
 * ---------------------------------------
 * Once those rules are live this script stops working, and there is no other path: the project has
 * no admin credentials by design. To change the demo data afterwards you either edit it in the
 * Firebase console, or point `isDemoAccount()` at another address, deploy, run this, and put it
 * back. See SETUP.md section 7.
 *
 * WHAT IT WRITES
 * --------------
 * Everything the app can show, because a demo that only exercises the happy path demonstrates a
 * different product: all four task statuses, all three priorities and none, a task that is overdue
 * and one that is due today, a task with no steps at all next to one nested three levels deep,
 * steps carrying their own due dates, start/stop sessions and hand-written notes, notes carrying a
 * duration, time attached to a specific step, and six months of history so the trend chart and the
 * month-over-month comparison have something to compare.
 *
 * Everything is generated RELATIVE TO TODAY, so the fixture does not go stale — but it does age:
 * re-run it when the demo starts looking like a museum.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocs,
  getFirestore,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const CONFIRMED = args.includes("--yes");
const REPLACE = args.includes("--replace");

const EMAIL = process.env.DEMO_EMAIL ?? "admin@example.com";
const PASSWORD = process.env.DEMO_PASSWORD ?? "adminEx";

if (!CONFIRMED) {
  console.error(
    [
      "",
      "  Questo script scrive su Firebase in PRODUZIONE.",
      "",
      `  Account   ${EMAIL}`,
      `  Modalità  ${REPLACE ? "sostituzione (cancella tutto prima)" : "aggiunta"}`,
      "",
      "  Rilancia con --yes se è quello che vuoi.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

// ── Firebase, letto da .env come fa l'app ────────────────────────────────────

const env = Object.fromEntries(
  readFileSync(join(repoRoot, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"|"$/g, "")];
    }),
);

/**
 * Against the emulators when asked.
 *
 * A script that writes to production should be runnable somewhere harmless first — the fixture below
 * is long enough that a typo in it is likelier than a typo in the code, and the only way to see
 * whether it produces a diary worth showing is to look at it in the app.
 */
const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

const app = initializeApp({
  apiKey: USE_EMULATOR ? "fake-api-key" : env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: USE_EMULATOR ? "localhost" : env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: USE_EMULATOR ? "1:1:web:1" : env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);
if (USE_EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

const credential = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
const userId = credential.user.uid;

console.log(`\n  Progetto  ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}${USE_EMULATOR ? "  (EMULATORI)" : ""}`);
console.log(`  Account   ${EMAIL}  (uid ${userId.slice(0, 8)}…)`);

// ── Date, tutte relative a oggi ──────────────────────────────────────────────

const pad = (value) => String(value).padStart(2, "0");
const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
/** An instant at a given local hour of a day N days from today. */
const at = (daysFromToday, hours, minutes = 0) => {
  const stamped = addDays(new Date(), daysFromToday);
  stamped.setHours(hours, minutes, 0, 0);
  return stamped.toISOString();
};
const day = (daysFromToday) => dayKey(addDays(new Date(), daysFromToday));

const now = new Date();
const today = dayKey(now);
const endOfMonth = dayKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));

/**
 * A deterministic pseudo-random generator.
 *
 * The history below is hundreds of sessions long and writing each one by hand would be noise, but
 * `Math.random()` would make two runs of this script produce different demos — and then a screenshot
 * in the README stops matching what a visitor sees.
 */
let seed = 20260827;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (values) => values[Math.floor(random() * values.length)];
const between = (min, max) => min + Math.floor(random() * (max - min + 1));

// ── I task ───────────────────────────────────────────────────────────────────

const created = (daysAgo) => at(-daysAgo, 9, 0);

const TASKS = [
  {
    id: "preventivo-rossi-imballaggi",
    title: "Preventivo Rossi Imballaggi",
    description:
      "Offerta per 12.000 scatole americane a doppia onda, consegna scaglionata su settembre e ottobre.",
    status: "in_progress",
    priority: "high",
    tags: ["cliente", "preventivo"],
    dueDate: today,
    createdAt: created(24),
  },
  {
    id: "migrazione-listino-2026",
    title: "Migrazione listino 2026",
    description: "Allineare i codici articolo e i prezzi al nuovo listino prima delle offerte di ottobre.",
    status: "in_progress",
    priority: "medium",
    tags: ["interno", "listino"],
    dueDate: day(4),
    createdAt: created(31),
  },
  {
    id: "contratto-fornitore-cartiera",
    title: "Revisione contratto cartiera",
    description: "Fermo in attesa della bozza rivista dal legale: senza quella non si firma.",
    status: "blocked",
    priority: "high",
    tags: ["fornitori", "legale"],
    dueDate: day(2),
    createdAt: created(18),
  },
  {
    id: "visita-bianchi",
    title: "Visita in stabilimento da Bianchi",
    description: "Sopralluogo per capire come imballano oggi la linea dei fustellati.",
    status: "todo",
    priority: "high",
    tags: ["cliente"],
    dueDate: day(-3),
    createdAt: created(14),
  },
  {
    id: "certificazione-fsc",
    title: "Rinnovo certificazione FSC",
    description: "Raccolta documenti e audit di sorveglianza annuale.",
    status: "in_progress",
    priority: "medium",
    tags: ["qualità", "certificazioni"],
    dueDate: day(11),
    createdAt: created(40),
  },
  {
    id: "campionatura-verdi",
    title: "Campionatura Verdi Alimentari",
    description: "Tre varianti di vassoio per la linea surgelati. Chiusa e consegnata.",
    status: "done",
    priority: "medium",
    tags: ["cliente", "campionatura"],
    dueDate: day(-8),
    createdAt: created(46),
  },
  {
    id: "report-mensile",
    title: "Consuntivo del mese",
    description: null,
    status: "todo",
    priority: "medium",
    tags: ["interno"],
    dueDate: endOfMonth,
    createdAt: created(9),
  },
  {
    id: "catalogo-2027",
    title: "Impostare il catalogo 2027",
    description: "Ancora niente di urgente: prima serve il listino nuovo.",
    status: "todo",
    priority: "low",
    tags: ["interno", "catalogo"],
    dueDate: day(38),
    createdAt: created(6),
  },
  {
    id: "formazione-magazzino",
    title: "Affiancamento in magazzino al nuovo collega",
    description: null,
    status: "todo",
    priority: null,
    tags: ["interno"],
    dueDate: day(6),
    createdAt: created(5),
  },
  {
    id: "mail-studio-tecnico",
    title: "Mandare le quote allo studio tecnico",
    description: null,
    status: "todo",
    priority: null,
    tags: [],
    dueDate: null,
    createdAt: created(2),
  },
  {
    id: "inventario-magazzino",
    title: "Inventario di fine semestre",
    description: "Conta fisica su tutte le corsie, riconciliata con il gestionale.",
    status: "done",
    priority: "low",
    tags: ["interno", "magazzino"],
    dueDate: day(-34),
    createdAt: created(62),
  },
];

// ── Gli step ─────────────────────────────────────────────────────────────────
//
// `level` è la profondità nell'outline: 0 è di primo livello, e ogni livello più profondo si
// annida sotto lo step precedente un gradino più su. `order` è per FRATELLI, mai globale — è
// esattamente il vincolo che l'app impone ovunque, e una fixture che lo violasse mostrerebbe
// un albero che l'app da sola non potrebbe produrre.

const STEPS = {
  "preventivo-rossi-imballaggi": [
    { title: "Raccogliere i costi dei materiali", status: "done", level: 0 },
    { title: "Chiedere il listino cartone alla cartiera", status: "done", level: 1 },
    { title: "Verificare la resa per formato", status: "done", level: 1 },
    { title: "Calcolare il prezzo per i tre scaglioni", status: "in_progress", level: 0 },
    { title: "Ipotesi a 4.000 pezzi", status: "done", level: 1 },
    { title: "Ipotesi a 8.000 pezzi", status: "in_progress", level: 1 },
    { title: "Controllare il margine con l'amministrazione", status: "todo", level: 2 },
    { title: "Ipotesi a 12.000 pezzi", status: "todo", level: 1 },
    { title: "Scrivere l'offerta e mandarla", status: "todo", level: 0, dueDate: today },
  ],
  "migrazione-listino-2026": [
    { title: "Esportare i codici dal gestionale", status: "done", level: 0 },
    { title: "Mappare i codici dismessi sui nuovi", status: "in_progress", level: 0 },
    { title: "Cartone teso", status: "done", level: 1 },
    { title: "Ondulato", status: "in_progress", level: 1 },
    { title: "Accessori e nastri", status: "todo", level: 1 },
    { title: "Ricaricare il listino e rifare due offerte di prova", status: "todo", level: 0 },
  ],
  "contratto-fornitore-cartiera": [
    { title: "Rileggere le clausole sui tempi di consegna", status: "done", level: 0 },
    { title: "Mandare le osservazioni al legale", status: "done", level: 0 },
    { title: "Aspettare la bozza rivista", status: "in_progress", level: 0 },
    { title: "Firmare", status: "todo", level: 0 },
  ],
  "certificazione-fsc": [
    { title: "Raccogliere le fatture di acquisto dell'anno", status: "done", level: 0 },
    { title: "Aggiornare il registro dei fornitori certificati", status: "in_progress", level: 0 },
    { title: "Fissare la data dell'audit", status: "todo", level: 0, dueDate: day(9) },
  ],
  "campionatura-verdi": [
    { title: "Disegnare le tre varianti", status: "done", level: 0 },
    { title: "Fustella nuova per la variante bassa", status: "done", level: 1 },
    { title: "Far stampare i campioni", status: "done", level: 0 },
    { title: "Consegnare e raccogliere il riscontro", status: "done", level: 0 },
  ],
  "report-mensile": [
    { title: "Chiudere le ore del mese", status: "todo", level: 0 },
    { title: "Confrontare con il mese scorso", status: "todo", level: 0 },
  ],
  "catalogo-2027": [{ title: "Decidere quali famiglie tenere", status: "todo", level: 0 }],
  "formazione-magazzino": [
    { title: "Giro delle corsie e dei codici", status: "todo", level: 0 },
    { title: "Come si registra un carico", status: "todo", level: 0 },
  ],
  "inventario-magazzino": [
    { title: "Conta fisica per corsia", status: "done", level: 0 },
    { title: "Riconciliare con il gestionale", status: "done", level: 0 },
    { title: "Sistemare le differenze", status: "done", level: 0 },
  ],
};

/**
 * Turn an outline into documents: parent links, and `order` counted per parent.
 *
 * The same resolution `resolveOutline` performs in the app, written out here rather than imported,
 * because this script is plain ESM and the app module is TypeScript.
 */
const resolveSteps = (taskId, outline) => {
  const documents = [];
  const ancestors = [];
  const nextOrder = new Map();

  outline.forEach((entry, index) => {
    const level = Math.min(entry.level, ancestors.length, 2);
    ancestors.length = level;
    const parentIndex = level === 0 ? null : ancestors[level - 1];
    const parentId = parentIndex === null ? null : documents[parentIndex].id;

    const order = nextOrder.get(parentId) ?? 1;
    nextOrder.set(parentId, order + 1);

    documents.push({
      id: `${taskId}-s${index + 1}`,
      taskId,
      parentStepId: parentId,
      title: entry.title,
      description: entry.description ?? null,
      status: entry.status,
      order,
      dueDate: entry.dueDate ?? null,
    });
    ancestors[level] = index;
  });

  return documents;
};

const stepDocuments = Object.entries(STEPS).flatMap(([taskId, outline]) =>
  resolveSteps(taskId, outline),
);
const stepsByTask = new Map();
for (const step of stepDocuments) {
  stepsByTask.set(step.taskId, [...(stepsByTask.get(step.taskId) ?? []), step]);
}

// ── Il work log ──────────────────────────────────────────────────────────────
//
// Una sessione è una coppia start/stop nello stesso giorno, come la scrive il timer: lo `start`
// senza durata, lo `stop` con `durationMinutes`. `buildTaskActivity` conta la durata esplicita e
// chiude comunque la sessione, quindi non si contano due volte.

const logs = [];
let logCounter = 0;
const nextLogId = () => `log-${String((logCounter += 1)).padStart(4, "0")}`;

/** One worked session: a start, a stop carrying its minutes, and optionally a note beside it. */
const session = ({ taskId, stepId = null, daysAgo, startHour, minutes, tags, message = null }) => {
  const startedAt = at(-daysAgo, startHour, between(0, 45));
  const stoppedAt = new Date(new Date(startedAt).getTime() + minutes * 60000).toISOString();

  logs.push({
    id: nextLogId(),
    taskId,
    stepId,
    message: null,
    tags,
    type: "start",
    timestamp: startedAt,
    durationMinutes: null,
  });
  logs.push({
    id: nextLogId(),
    taskId,
    stepId,
    message,
    tags,
    type: "stop",
    timestamp: stoppedAt,
    durationMinutes: minutes,
  });
};

/** A note written by hand. With minutes when the note claims them, without when it does not. */
const note = ({ taskId, stepId = null, daysAgo, hour, message, tags, minutes = null }) => {
  logs.push({
    id: nextLogId(),
    taskId,
    stepId,
    message,
    tags,
    type: "note",
    timestamp: at(-daysAgo, hour, between(0, 50)),
    durationMinutes: minutes,
  });
};

const stepId = (taskId, index) => stepsByTask.get(taskId)?.[index]?.id ?? null;

// Sei mesi di storia, così il grafico dei sei mesi e il confronto col mese scorso hanno di che
// confrontare. Più fitto vicino a oggi: un archivio che si dirada andando indietro è come sono
// fatti gli archivi veri.
const HISTORY = [
  { taskId: "inventario-magazzino", tags: ["interno", "magazzino"], from: 170, to: 120, perWeek: 2 },
  { taskId: "certificazione-fsc", tags: ["qualità", "certificazioni"], from: 150, to: 20, perWeek: 1 },
  { taskId: "campionatura-verdi", tags: ["cliente", "campionatura"], from: 46, to: 9, perWeek: 3 },
  { taskId: "migrazione-listino-2026", tags: ["interno", "listino"], from: 31, to: 1, perWeek: 3 },
  { taskId: "preventivo-rossi-imballaggi", tags: ["cliente", "preventivo"], from: 24, to: 0, perWeek: 4 },
  { taskId: "contratto-fornitore-cartiera", tags: ["fornitori", "legale"], from: 18, to: 5, perWeek: 1 },
];

for (const stretch of HISTORY) {
  const steps = stepsByTask.get(stretch.taskId) ?? [];
  for (let daysAgo = stretch.from; daysAgo >= stretch.to; daysAgo -= 1) {
    const date = addDays(now, -daysAgo);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) continue; // il fine settimana resta vuoto, come nella realtà
    if (random() > stretch.perWeek / 5) continue;

    session({
      taskId: stretch.taskId,
      stepId: steps.length > 0 ? pick(steps).id : null,
      daysAgo,
      startHour: pick([8, 9, 10, 11, 14, 15, 16]),
      minutes: between(20, 165),
      tags: stretch.tags,
    });
  }
}

// Le note: sono quelle che riempiono la colonna "cosa è stato fatto" del consuntivo.
note({
  taskId: "preventivo-rossi-imballaggi",
  stepId: stepId("preventivo-rossi-imballaggi", 1),
  daysAgo: 9,
  hour: 11,
  message: "La cartiera tiene il prezzo fino a fine settembre, poi rivede tutto.",
  tags: ["cliente", "preventivo"],
});
note({
  taskId: "preventivo-rossi-imballaggi",
  daysAgo: 4,
  hour: 17,
  message: "Rossi ha chiesto di vedere anche l'ipotesi a 12.000 pezzi prima di decidere.",
  tags: ["cliente"],
});
note({
  taskId: "preventivo-rossi-imballaggi",
  stepId: stepId("preventivo-rossi-imballaggi", 3),
  daysAgo: 1,
  hour: 15,
  message: "Rifatti i conti sullo scaglione medio: il margine regge, ma di poco.",
  tags: ["cliente", "preventivo"],
  minutes: 75,
});
note({
  taskId: "contratto-fornitore-cartiera",
  daysAgo: 5,
  hour: 10,
  message: "Mandate le osservazioni al legale. Da qui non si va avanti finché non risponde.",
  tags: ["fornitori", "legale"],
});
note({
  taskId: "campionatura-verdi",
  daysAgo: 9,
  hour: 16,
  message: "Consegnati i tre campioni. Hanno scelto la variante bassa, la fustella nuova ha reso.",
  tags: ["cliente", "campionatura"],
  minutes: 45,
});
note({
  taskId: "migrazione-listino-2026",
  stepId: stepId("migrazione-listino-2026", 3),
  daysAgo: 2,
  hour: 9,
  message: "L'ondulato ha 40 codici che non esistono più: vanno decisi uno per uno.",
  tags: ["interno", "listino"],
});
note({
  taskId: "inventario-magazzino",
  daysAgo: 121,
  hour: 18,
  message: "Chiuso. Due differenze sole, entrambe su codici dismessi.",
  tags: ["interno", "magazzino"],
});
note({
  taskId: "certificazione-fsc",
  daysAgo: 20,
  hour: 14,
  message: "L'ente ha confermato che l'audit si può fare da remoto.",
  tags: ["qualità", "certificazioni"],
});

// Oggi: qualcosa di registrato, così la home ha un consuntivo di giornata da mostrare.
session({
  taskId: "preventivo-rossi-imballaggi",
  stepId: stepId("preventivo-rossi-imballaggi", 5),
  daysAgo: 0,
  startHour: 9,
  minutes: 95,
  tags: ["cliente", "preventivo"],
});
session({
  taskId: "migrazione-listino-2026",
  stepId: stepId("migrazione-listino-2026", 3),
  daysAgo: 0,
  startHour: 11,
  minutes: 40,
  tags: ["interno", "listino"],
});

// ── Scrittura ────────────────────────────────────────────────────────────────

const stamp = new Date().toISOString();

const readAll = async (name) => {
  const snapshot = await getDocs(query(collection(db, name), where("userId", "==", userId)));
  return snapshot.docs;
};

if (REPLACE) {
  console.log("\n  Cancello quello che c'è adesso:");
  // Logs and steps before tasks: nothing is ever left hanging off a task that no longer exists.
  for (const name of ["workLogs", "steps", "tasks"]) {
    const existing = await readAll(name);
    if (name === "tasks") {
      for (const entry of existing) console.log(`    · ${entry.data().title}`);
    }
    for (let index = 0; index < existing.length; index += 400) {
      const batch = writeBatch(db);
      existing.slice(index, index + 400).forEach((entry) => batch.delete(entry.ref));
      await batch.commit();
    }
    console.log(`    ${name}: ${existing.length} eliminati`);
  }
}

const writeAll = async (name, records) => {
  for (let index = 0; index < records.length; index += 400) {
    const batch = writeBatch(db);
    for (const { id, ...data } of records.slice(index, index + 400)) {
      // `createdAt` comes from the record when it has one. Defaulting it unconditionally is what
      // this line used to do, and it stamped every task with the same instant — which the task
      // list sorts by, so the whole archive looked created in one second.
      batch.set(doc(collection(db, name), id), {
        ...data,
        userId,
        createdAt: data.createdAt ?? stamp,
        updatedAt: stamp,
      });
    }
    await batch.commit();
  }
};

await writeAll("tasks", TASKS);
await writeAll("steps", stepDocuments);
await writeAll("workLogs", logs);

// ── Verifica, rileggendo ─────────────────────────────────────────────────────

const [tasksBack, stepsBack, logsBack] = await Promise.all([
  readAll("tasks"),
  readAll("steps"),
  readAll("workLogs"),
]);

const minutes = logsBack
  .map((entry) => entry.data().durationMinutes)
  .filter((value) => typeof value === "number")
  .reduce((sum, value) => sum + value, 0);

const days = new Set(
  logsBack.map((entry) => dayKey(new Date(entry.data().timestamp))),
).size;

console.log("\n  Scritto e riletto:");
console.log(`    task      ${tasksBack.length}`);
console.log(`    step      ${stepsBack.length}`);
console.log(`    work log  ${logsBack.length}  su ${days} giornate`);
console.log(`    ore       ${Math.round(minutes / 60)}h circa\n`);

process.exit(0);
