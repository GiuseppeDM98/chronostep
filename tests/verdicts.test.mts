/**
 * Verdict engine verification.
 *
 * Run with: npm run test:verdicts
 *
 * The interesting assertions are the unflattering ones. A verdict that can only say encouraging
 * things is decoration, so the first test here checks that momentum does NOT outrank lateness, and
 * several others check that the engine refuses to judge when the data cannot support a judgement.
 */
import assert from "node:assert/strict";
import { readInsights, readTask, readToday } from "../src/lib/verdicts.ts";
import type { Step, Task, WorkLog } from "../src/lib/types.ts";

const NOW = new Date(2026, 7, 27, 11, 0, 0); // giovedì 27 agosto 2026, ora locale

let counter = 0;
const id = (prefix: string) => `${prefix}-${(counter += 1)}`;

const task = (fields: Partial<Task> = {}): Task => ({
  id: id("task"),
  userId: "alice",
  title: "Preventivo Rossi Imballaggi",
  status: "in_progress",
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
  ...fields,
});

const step = (fields: Partial<Step> = {}): Step => ({
  id: id("step"),
  userId: "alice",
  taskId: "task-1",
  title: "Raccogliere costi materiali",
  status: "todo",
  order: 1,
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
  ...fields,
});

const workLog = (fields: Partial<WorkLog> & Pick<WorkLog, "timestamp">): WorkLog => ({
  id: id("log"),
  userId: "alice",
  taskId: "task-1",
  tags: [],
  type: "stop",
  ...fields,
});

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
const check = (name: string, run: () => void) => {
  try {
    run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message.split("\n").slice(0, 3).join(" ") });
  }
};

const proseOf = (runs: Array<{ text: string }>) => runs.map((run) => run.text).join("");

// ── Il verdetto deve saper dare cattive notizie ──────────────────────────────

check("il ritardo batte lo slancio: timer acceso ma tre cose scadute", () => {
  const reading = readToday({
    tasks: [
      task({ dueDate: "2026-08-20" }),
      task({ dueDate: "2026-08-24" }),
      task({ dueDate: "2026-09-30" }),
    ],
    steps: [step({ dueDate: "2026-08-25" })],
    workLogs: [],
    running: { taskTitle: "Preventivo", elapsedMinutes: 72 },
    now: NOW,
  });
  assert.equal(reading.verdict.sentiment, "bad");
  assert.match(reading.verdict.headline, /ritardo su 3 cose/);
  // La sessione in corso viene comunque nominata, ma non è il titolo.
  assert.match(proseOf(reading.verdict.detail), /Stai lavorando da 1h 12m/);
});

check("con una sola cosa scaduta la frase resta al singolare", () => {
  const reading = readToday({
    tasks: [task({ dueDate: "2026-08-26" })],
    steps: [],
    workLogs: [],
    now: NOW,
  });
  assert.equal(reading.verdict.headline, "Sei in ritardo su una cosa.");
  assert.match(proseOf(reading.verdict.detail), /la più vecchia da 1 giorno/);
});

check("una sessione appena avviata non stampa «0m»", () => {
  const reading = readToday({
    tasks: [task({ dueDate: "2026-09-15" })],
    steps: [],
    workLogs: [],
    running: { taskTitle: "Preventivo", elapsedMinutes: 0 },
    now: NOW,
  });
  const prose = proseOf(reading.verdict.detail);
  assert.match(prose, /Stai lavorando da poco su Preventivo/);
  assert.doesNotMatch(prose, /0m/);
});

check("senza ritardi, un timer acceso porta il verdetto positivo", () => {
  const reading = readToday({
    tasks: [task({ dueDate: "2026-09-15" })],
    steps: [],
    workLogs: [],
    running: { taskTitle: "Preventivo", stepTitle: "Costi", elapsedMinutes: 72 },
    now: NOW,
  });
  assert.equal(reading.verdict.headline, "Sei già in pista.");
  assert.equal(reading.verdict.sentiment, "good");
});

check("scadenze di oggi senza ritardi danno attenzione, non allarme", () => {
  const reading = readToday({
    tasks: [task({ dueDate: "2026-08-27" })],
    steps: [step({ dueDate: "2026-08-27" })],
    workLogs: [],
    now: NOW,
  });
  assert.equal(reading.verdict.sentiment, "warn");
  assert.match(reading.verdict.headline, /scadono 2 cose/);
});

check("una giornata tranquilla non viene drammatizzata", () => {
  const reading = readToday({
    tasks: [task({ dueDate: "2026-09-30" })],
    steps: [],
    workLogs: [],
    now: NOW,
  });
  assert.equal(reading.verdict.headline, "Oggi non scade niente.");
  assert.equal(reading.verdict.sentiment, "good");
});

// ── Dati magri: il verdetto si astiene ──────────────────────────────────────

check("un account nuovo non riceve un giudizio ma un'indicazione", () => {
  const reading = readToday({ tasks: [], steps: [], workLogs: [], now: NOW });
  assert.equal(reading.verdict.isSparse, true);
  assert.match(reading.verdict.headline, /non c'è ancora niente/i);
  assert.match(proseOf(reading.verdict.detail), /Crea il primo task/);
});

check("senza log registrati Insights non inventa un confronto", () => {
  const reading = readInsights({ workLogs: [], now: NOW });
  assert.equal(reading.verdict.isSparse, true);
  assert.match(reading.verdict.headline, /abbastanza da confrontare/);
});

check("il primo mese con dati non viene confrontato con il nulla", () => {
  const reading = readInsights({
    workLogs: [workLog({ timestamp: new Date(2026, 7, 10, 9, 0).toISOString(), durationMinutes: 120 })],
    now: NOW,
  });
  assert.equal(reading.verdict.sentiment, "neutral");
  assert.match(reading.verdict.headline, /primo mese con dei dati/);
  assert.doesNotMatch(proseOf(reading.verdict.detail), /contro/);
});

// ── Il confronto fra mesi è onesto ──────────────────────────────────────────

check("un mese sotto il precedente lo dice, con la percentuale e i giorni rimasti", () => {
  const reading = readInsights({
    workLogs: [
      workLog({ timestamp: new Date(2026, 6, 10, 9, 0).toISOString(), durationMinutes: 1125 }), // luglio 18h45
      workLog({ timestamp: new Date(2026, 7, 10, 9, 0).toISOString(), durationMinutes: 680 }), // agosto 11h20
    ],
    now: NOW,
  });
  assert.equal(reading.verdict.sentiment, "warn");
  assert.match(reading.verdict.headline, /non tiene il passo di luglio/);
  const prose = proseOf(reading.verdict.detail);
  assert.match(prose, /-40%/); // 680/1125 = -39,56% -> -40%
  assert.match(prose, /4 giorni/); // agosto ha 31 giorni, oggi è il 27
});

check("un mese sopra il precedente riceve il verdetto positivo", () => {
  const reading = readInsights({
    workLogs: [
      workLog({ timestamp: new Date(2026, 6, 10, 9, 0).toISOString(), durationMinutes: 300 }),
      workLog({ timestamp: new Date(2026, 7, 10, 9, 0).toISOString(), durationMinutes: 600 }),
    ],
    now: NOW,
  });
  assert.equal(reading.verdict.sentiment, "good");
  assert.match(reading.verdict.headline, /batte luglio/);
});

// ── La forbice di granularità ───────────────────────────────────────────────

check("un promemoria da una riga non sembra un task rotto", () => {
  const reading = readTask({
    task: task({ title: "Mandare la mail a Rossi", status: "todo" }),
    steps: [],
    workLogs: [],
    now: NOW,
  });
  assert.equal(reading.verdict.headline, "È una voce singola.");
  assert.equal(reading.verdict.sentiment, "neutral");
});

check("un task in scadenza oggi e indietro arriva stretto", () => {
  const parent = task({ dueDate: "2026-08-27" });
  const reading = readTask({
    task: parent,
    steps: [
      step({ taskId: parent.id, status: "done", order: 1 }),
      step({ taskId: parent.id, status: "todo", order: 2, title: "Calcolare i tempi macchina" }),
      step({ taskId: parent.id, status: "todo", order: 3 }),
      step({ taskId: parent.id, status: "todo", order: 4 }),
    ],
    workLogs: [],
    now: NOW,
  });
  assert.equal(reading.verdict.headline, "Arriva stretto alla scadenza.");
  assert.equal(reading.verdict.sentiment, "warn");
  // La prossima decisione è lo step successivo nell'ordine dell'albero.
  assert.equal(reading.nextStep?.title, "Calcolare i tempi macchina");
  assert.match(proseOf(reading.verdict.detail), /Il prossimo è Calcolare i tempi macchina/);
});

check("il prossimo step segue l'albero, non il campo order", () => {
  // Ogni primo figlio ha order 1, quindi un ordinamento piatto per order metteva "3.1 Impaginare
  // il documento" davanti a "2.1 Raccogliere costi materiali": il verdetto indicava come prossima
  // cosa uno step tre posizioni più in basso nell'albero.
  const parent = task();
  const s2 = step({ taskId: parent.id, title: "Preparare la base di calcolo", status: "in_progress", order: 2 });
  const s3 = step({ taskId: parent.id, title: "Redigere l'offerta", status: "todo", order: 3 });
  const reading = readTask({
    task: parent,
    steps: [
      step({ taskId: parent.id, title: "Aprire la commessa", status: "done", order: 1 }),
      s2,
      step({ taskId: parent.id, parentStepId: s2.id, title: "Raccogliere costi materiali", status: "in_progress", order: 1 }),
      step({ taskId: parent.id, parentStepId: s2.id, title: "Calcolare i tempi macchina", status: "done", order: 2 }),
      s3,
      step({ taskId: parent.id, parentStepId: s3.id, title: "Impaginare il documento", status: "todo", order: 1 }),
    ],
    workLogs: [],
    now: NOW,
  });
  // Non "Preparare la base di calcolo": quello è un contenitore, il lavoro vero è la foglia sotto.
  assert.equal(reading.nextStep?.title, "Raccogliere costi materiali");
});

check("un ciclo fra parentStepId non manda in loop la ricerca del prossimo step", () => {
  const parent = task();
  const a = step({ taskId: parent.id, id: "ciclo-a", title: "A", status: "todo", order: 1 });
  const b = step({ taskId: parent.id, id: "ciclo-b", title: "B", status: "todo", order: 1 });
  a.parentStepId = "ciclo-b";
  b.parentStepId = "ciclo-a";
  const reading = readTask({ task: parent, steps: [a, b], workLogs: [], now: NOW });
  // Nessuno dei due è raggiungibile dalla radice: il punto è che la funzione ritorni.
  assert.equal(reading.nextStep, undefined);
});

check("un task scaduto lo dice in giorni", () => {
  const reading = readTask({
    task: task({ dueDate: "2026-08-20" }),
    steps: [],
    workLogs: [],
    now: NOW,
  });
  assert.equal(reading.verdict.headline, "In ritardo di 7 giorni.");
  assert.equal(reading.verdict.sentiment, "bad");
});

check("un task chiuso non viene commentato oltre", () => {
  const reading = readTask({
    task: task({ status: "done" }),
    steps: [],
    workLogs: [],
    now: NOW,
  });
  assert.equal(reading.verdict.headline, "Chiuso.");
  assert.equal(reading.verdict.sentiment, "good");
});

check("un task bloccato è cattiva notizia, non neutra", () => {
  const reading = readTask({
    task: task({ status: "blocked" }),
    steps: [],
    workLogs: [],
    now: NOW,
  });
  assert.equal(reading.verdict.headline, "Bloccato.");
  assert.equal(reading.verdict.sentiment, "bad");
});

// ── Ogni verdetto è una frase ───────────────────────────────────────────────

check("ogni titolo è una frase che finisce con un punto", () => {
  const samples = [
    readToday({ tasks: [], steps: [], workLogs: [], now: NOW }).verdict,
    readToday({ tasks: [task({ dueDate: "2026-08-20" })], steps: [], workLogs: [], now: NOW }).verdict,
    readTask({ task: task(), steps: [], workLogs: [], now: NOW }).verdict,
    readInsights({ workLogs: [], now: NOW }).verdict,
  ];
  for (const verdict of samples) {
    assert.ok(verdict.headline.endsWith("."), `"${verdict.headline}" non finisce con un punto`);
    assert.ok(verdict.headline.length < 70, `"${verdict.headline}" è troppo lungo per un titolo`);
  }
});

const failed = results.filter((result) => !result.ok);
console.log("");
for (const result of results) {
  console.log(`   ${result.ok ? "PASS" : "FAIL"}  ${result.name}`);
  if (!result.ok) console.log(`         ${result.detail}`);
}
console.log(`\n  ${results.length - failed.length}/${results.length} verifiche superate\n`);
process.exit(failed.length > 0 ? 1 : 0);
