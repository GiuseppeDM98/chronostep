/**
 * Fills the Firebase emulators with a plausible account, for local development and for looking at
 * populated screens.
 *
 * Run with: npm run seed  (the emulators must already be running: npm run emulators)
 *
 * Everything is generated RELATIVE to today, so the fixture never goes stale: the verdicts always
 * have something current to say, the heatmap always covers the visible month, and the month-over-
 * month comparison always has a previous month to compare against.
 *
 * It writes through the rules-unit-testing harness with rules disabled — seeding is setup, and a
 * fixture that has to satisfy the security rules would quietly become a second, weaker test of them.
 */
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { collection, doc, setDoc } from "firebase/firestore";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = process.env.SEED_PROJECT_ID ?? "chronostep-9ab39";
const EMAIL = process.env.SEED_EMAIL ?? "demo@chronostep.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "chronostep";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";

// ── Auth ─────────────────────────────────────────────────────────────────────

/** Creates the account in the Auth emulator, or signs in when it already exists. Returns the uid. */
const ensureUser = async () => {
  const base = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts`;
  const body = JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true });
  const headers = { "Content-Type": "application/json" };

  const signUp = await fetch(`${base}:signUp?key=fake-api-key`, { method: "POST", headers, body });
  if (signUp.ok) return (await signUp.json()).localId;

  const signIn = await fetch(`${base}:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers,
    body,
  });
  if (signIn.ok) return (await signIn.json()).localId;

  throw new Error(`Auth emulator non raggiungibile su ${AUTH_HOST}: ${await signUp.text()}`);
};

// ── Date helpers ─────────────────────────────────────────────────────────────

const pad = (value) => String(value).padStart(2, "0");
const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const at = (date, hours, minutes) => {
  const stamped = new Date(date);
  stamped.setHours(hours, minutes, 0, 0);
  return stamped.toISOString();
};

const now = new Date();
const today = dayKey(now);
const endOfMonth = dayKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));

// ── Fixture ──────────────────────────────────────────────────────────────────

const build = (userId) => {
  const stamp = at(addDays(now, -21), 9, 0);
  const base = { userId, createdAt: stamp, updatedAt: stamp };

  const tasks = [
    {
      id: "preventivo-rossi",
      ...base,
      title: "Preventivo Rossi Imballaggi",
      description: "Offerta per 12.000 scatole americane, consegna a settembre.",
      status: "in_progress",
      priority: "high",
      tags: ["cliente", "preventivo"],
      dueDate: today,
    },
    {
      id: "migrazione-listino",
      ...base,
      title: "Migrazione listino 2026",
      description: "Allineare i codici articolo al nuovo listino.",
      status: "in_progress",
      priority: "medium",
      tags: ["interno", "listino"],
      dueDate: today,
    },
    {
      id: "contratto-fornitore",
      ...base,
      title: "Revisione contratto fornitore",
      description: null,
      status: "blocked",
      priority: "high",
      tags: ["legale"],
      dueDate: dayKey(addDays(now, 2)),
    },
    {
      id: "report-mensile",
      ...base,
      title: "Report mensile",
      description: null,
      status: "todo",
      priority: "low",
      tags: ["reportistica"],
      dueDate: endOfMonth,
    },
    {
      // The other end of the granularity range: a reminder with no structure at all.
      id: "mail-bianchi",
      ...base,
      title: "Mandare la mail a Bianchi",
      description: null,
      status: "todo",
      priority: null,
      tags: [],
      dueDate: null,
    },
    {
      id: "archivio-2025",
      ...base,
      title: "Sistemare l'archivio 2025",
      description: null,
      status: "done",
      priority: null,
      tags: ["interno"],
      dueDate: dayKey(addDays(now, -9)),
    },
  ];

  const step = (id, taskId, title, status, order, extra = {}) => ({
    id,
    ...base,
    taskId,
    parentStepId: null,
    title,
    description: null,
    status,
    order,
    dueDate: null,
    ...extra,
  });

  const steps = [
    step("s1", "preventivo-rossi", "Aprire la commessa", "done", 1),
    step("s2", "preventivo-rossi", "Preparare la base di calcolo", "in_progress", 2),
    step("s2a", "preventivo-rossi", "Raccogliere costi materiali", "in_progress", 1, {
      parentStepId: "s2",
      dueDate: today,
    }),
    step("s2b", "preventivo-rossi", "Calcolare i tempi macchina", "done", 2, { parentStepId: "s2" }),
    step("s2c", "preventivo-rossi", "Aggiungere margine commerciale", "todo", 3, { parentStepId: "s2" }),
    step("s3", "preventivo-rossi", "Redigere l'offerta", "todo", 3),
    step("s3a", "preventivo-rossi", "Impaginare il documento", "todo", 1, { parentStepId: "s3" }),
    step("s4", "preventivo-rossi", "Inviare al cliente", "todo", 4),

    step("m1", "migrazione-listino", "Esportare il listino vecchio", "done", 1),
    step("m2", "migrazione-listino", "Verificare i codici articolo", "todo", 2, { dueDate: today }),
    step("m3", "migrazione-listino", "Caricare il nuovo listino", "todo", 3),

    step("c1", "contratto-fornitore", "Rileggere le clausole di recesso", "in_progress", 1),
  ];

  // Sessions spread over the last seven weeks, so the heatmap fills and the previous month has a
  // total worth comparing against. Weekends stay light, as they would in a real diary.
  const workLogs = [];
  const sessions = [
    { offset: -46, minutes: 150, task: "migrazione-listino", tags: ["interno", "listino"], note: "Estratto e ripulito il listino vecchio." },
    { offset: -44, minutes: 95, task: "migrazione-listino", tags: ["listino"], note: null },
    { offset: -40, minutes: 210, task: "contratto-fornitore", tags: ["legale"], note: "Prima lettura integrale del contratto." },
    { offset: -37, minutes: 120, task: "migrazione-listino", tags: ["listino"] },
    { offset: -33, minutes: 180, task: "contratto-fornitore", tags: ["legale"] },
    { offset: -30, minutes: 75, task: "archivio-2025", tags: ["interno"] },
    { offset: -24, minutes: 165, task: "migrazione-listino", tags: ["interno", "listino"] },
    { offset: -21, minutes: 240, task: "preventivo-rossi", tags: ["cliente", "preventivo"], note: "Aperta la commessa e raccolti i disegni." },
    { offset: -18, minutes: 90, task: "archivio-2025", tags: ["interno"] },
    { offset: -16, minutes: 135, task: "preventivo-rossi", tags: ["cliente"], step: "s1" },
    { offset: -14, minutes: 60, task: "contratto-fornitore", tags: ["legale"] },
    { offset: -11, minutes: 195, task: "preventivo-rossi", tags: ["preventivo"], step: "s2", note: "Impostato il foglio di calcolo dei costi." },
    { offset: -9, minutes: 80, task: "archivio-2025", tags: ["interno"], note: "Chiuso l'archivio del 2025." },
    { offset: -7, minutes: 145, task: "preventivo-rossi", tags: ["cliente", "preventivo"], step: "s2b" },
    { offset: -4, minutes: 110, task: "migrazione-listino", tags: ["listino"], step: "m1" },
    { offset: -2, minutes: 200, task: "preventivo-rossi", tags: ["cliente"], step: "s2a", note: "Confrontate tre offerte di cartone." },
    { offset: -1, minutes: 190, task: "preventivo-rossi", tags: ["cliente", "preventivo"], step: "s2a", note: "Chiuse le quotazioni cartone con tre fornitori." },
    { offset: 0, minutes: 72, task: "preventivo-rossi", tags: ["cliente"], step: "s2a", note: "Ripreso il calcolo dei costi materiali." },
  ];

  sessions.forEach((session, index) => {
    const day = addDays(now, session.offset);
    workLogs.push({
      id: `log-${index}`,
      userId,
      taskId: session.task,
      stepId: session.step ?? null,
      message: session.note ?? null,
      tags: session.tags,
      type: "stop",
      timestamp: at(day, 11 + (index % 6), (index * 7) % 60),
      durationMinutes: session.minutes,
      createdAt: stamp,
      updatedAt: stamp,
    });
  });

  workLogs.push({
    id: "log-nota",
    userId,
    taskId: "preventivo-rossi",
    stepId: null,
    message: "Il cliente ha chiesto anche la variante con stampa a due colori.",
    tags: ["cliente"],
    type: "note",
    timestamp: at(addDays(now, -1), 9, 52),
    durationMinutes: null,
    createdAt: stamp,
    updatedAt: stamp,
  });

  return { tasks, steps, workLogs };
};

// ── Write ────────────────────────────────────────────────────────────────────

const userId = await ensureUser();

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules: readFileSync(join(repoRoot, "firestore.rules"), "utf8") },
});

await testEnv.clearFirestore();
const { tasks, steps, workLogs } = build(userId);

await testEnv.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  const write = (name, records) =>
    Promise.all(
      records.map(({ id, ...data }) => setDoc(doc(collection(db, name), id), data)),
    );
  await write("tasks", tasks);
  await write("steps", steps);
  await write("workLogs", workLogs);
});

await testEnv.cleanup();

console.log(`
  Emulatori popolati.
    utente     ${EMAIL} / ${PASSWORD}   (uid ${userId})
    task       ${tasks.length}
    step       ${steps.length}
    work log   ${workLogs.length}

  Avvia l'app contro gli emulatori:
    NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev
`);
