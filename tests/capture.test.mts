/**
 * Capture verification.
 *
 * Run with: npm run test:capture
 *
 * The model's output is untrusted input, so most of what matters here is refusal: a plan naming a
 * task the caller does not own, a status that is not a status, a duration nobody could have worked,
 * a 31st of February. Each of those assertions was checked against a deliberately weakened copy of
 * the normalizer to prove it is not vacuous — the checks fail when the guard is taken out.
 *
 * The outline tests are the other half. `order` is scoped to siblings everywhere in this app, and a
 * resolver that got that wrong would produce steps that sort by title instead of by position.
 */
import assert from "node:assert/strict";
import {
  blankTitleCount,
  buildCaptureContext,
  droppedSteps,
  isDayKey,
  logTimestamp,
  normalizeCapturePlan,
  outlineRows,
  planTotals,
  resolveOutline,
  selectedPlan,
  taskKey,
  taskStepKey,
  additionStepKey,
  logKey,
  type CapturePlan,
  type CaptureStepDraft,
} from "../src/lib/aiCapture.ts";
import { instantDayKey } from "../src/lib/dates.ts";
import { readCapture } from "../src/lib/verdicts.ts";
import type { Step, Task } from "../src/lib/types.ts";

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
const check = (name: string, run: () => void) => {
  try {
    run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: (error as Error).message.split("\n").slice(0, 3).join(" "),
    });
  }
};

// ── Fixtures ────────────────────────────────────────────────────────────────

const MINE: Task = {
  id: "task-mine",
  userId: "alice",
  title: "Preventivo Rossi",
  status: "in_progress",
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
};

const OTHER: Task = { ...MINE, id: "task-other", userId: "bob", title: "Roba di Bob" };

const MY_STEP: Step = {
  id: "step-mine",
  userId: "alice",
  taskId: "task-mine",
  title: "Raccogliere i costi",
  status: "todo",
  order: 1,
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
};

const OTHER_STEP: Step = { ...MY_STEP, id: "step-other", taskId: "task-other" };

/** Only `MINE` and its step are the caller's; `OTHER` is deliberately left out. */
const context = buildCaptureContext([MINE], [MY_STEP, OTHER_STEP]);

const step = (fields: Partial<CaptureStepDraft> = {}) => ({
  title: "Uno step",
  status: "todo",
  level: 0,
  ...fields,
});

// ── Ownership: the reason this module exists ────────────────────────────────

check("uno step da aggiungere a un task altrui viene scartato", () => {
  const plan = normalizeCapturePlan(
    { additions: [{ taskId: OTHER.id, steps: [step()] }] },
    context,
  );
  assert.equal(plan.additions.length, 0);
});

check("uno step da aggiungere a un task proprio viene tenuto", () => {
  const plan = normalizeCapturePlan(
    { additions: [{ taskId: MINE.id, steps: [step()] }] },
    context,
  );
  assert.equal(plan.additions.length, 1);
  assert.equal(plan.additions[0].taskId, MINE.id);
});

check("una nota su un task altrui viene scartata", () => {
  const plan = normalizeCapturePlan(
    { logs: [{ taskId: OTHER.id, message: "Due ore su questo" }] },
    context,
  );
  assert.equal(plan.logs.length, 0);
});

check("una nota che punta a uno step di un altro task perde lo step, non la nota", () => {
  const plan = normalizeCapturePlan(
    { logs: [{ taskId: MINE.id, stepId: OTHER_STEP.id, message: "Fatto" }] },
    context,
  );
  assert.equal(plan.logs.length, 1);
  assert.equal(plan.logs[0].stepId, undefined);
});

check("una nota che punta a uno step del proprio task lo conserva", () => {
  const plan = normalizeCapturePlan(
    { logs: [{ taskId: MINE.id, stepId: MY_STEP.id, message: "Fatto" }] },
    context,
  );
  assert.equal(plan.logs[0].stepId, MY_STEP.id);
});

// ── Una nota può appartenere a un task che il piano sta creando ─────────────
//
// È il caso che ha fatto nascere `taskRef`: «ieri due ore sulla revisione del catalogo» parla di
// lavoro fatto su qualcosa che nel diario non c'è ancora. Pretendere che il task esistesse già
// buttava via quelle due ore proprio mentre l'utente stava provando a registrarle.

check("una nota può agganciarsi a un task proposto nello stesso piano", () => {
  const plan = normalizeCapturePlan(
    {
      tasks: [{ title: "Revisione del catalogo" }],
      logs: [{ newTaskIndex: 0, message: "Due ore di revisione", durationMinutes: 120 }],
    },
    context,
  );
  assert.equal(plan.logs.length, 1);
  assert.equal(plan.logs[0].taskId, undefined);
  assert.equal(plan.logs[0].taskRef, plan.tasks[0].ref);
});

check("una nota che punta a un task proposto inesistente viene scartata", () => {
  const plan = normalizeCapturePlan(
    { tasks: [{ title: "Uno solo" }], logs: [{ newTaskIndex: 3, message: "Fatto" }] },
    context,
  );
  assert.equal(plan.logs.length, 0);
});

check("una nota che punta a un task proposto senza titolo cade con lui", () => {
  const plan = normalizeCapturePlan(
    {
      tasks: [{ title: "   " }, { title: "Questo sì" }],
      logs: [{ newTaskIndex: 0, message: "Fatto sul primo" }],
    },
    context,
  );
  assert.equal(plan.tasks.length, 1);
  assert.equal(
    plan.logs.length,
    0,
    "il riferimento non deve scivolare sul task che ha preso il suo posto",
  );
});

check("l'indice del modello non slitta quando un task viene scartato", () => {
  const plan = normalizeCapturePlan(
    {
      tasks: [{ title: "" }, { title: "Il secondo" }],
      logs: [{ newTaskIndex: 1, message: "Fatto sul secondo" }],
    },
    context,
  );
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.logs.length, 1);
  assert.equal(plan.logs[0].taskRef, plan.tasks[0].ref, "deve puntare a «Il secondo»");
});

check("un taskId reale batte l'indice, se ci sono tutti e due", () => {
  const plan = normalizeCapturePlan(
    {
      tasks: [{ title: "Un task nuovo" }],
      logs: [{ taskId: MINE.id, newTaskIndex: 0, message: "Fatto" }],
    },
    context,
  );
  assert.equal(plan.logs[0].taskId, MINE.id);
  assert.equal(plan.logs[0].taskRef, undefined);
});

check("escludere il task proposto porta via la nota che ci apparteneva", () => {
  const plan = normalizeCapturePlan(
    {
      tasks: [{ title: "Revisione del catalogo" }],
      logs: [{ newTaskIndex: 0, message: "Due ore", durationMinutes: 120 }],
    },
    context,
  );
  const selected = selectedPlan(plan, new Set([taskKey(0)]));
  assert.equal(selected.tasks.length, 0);
  assert.equal(selected.logs.length, 0, "una nota senza il suo task non ha dove andare");
  assert.equal(planTotals(selected).minutes, 0);
});

check("escludere un ALTRO task non tocca la nota", () => {
  const plan = normalizeCapturePlan(
    {
      tasks: [{ title: "Primo" }, { title: "Secondo" }],
      logs: [{ newTaskIndex: 1, message: "Fatto sul secondo" }],
    },
    context,
  );
  const selected = selectedPlan(plan, new Set([taskKey(0)]));
  assert.equal(selected.tasks.length, 1);
  assert.equal(selected.logs.length, 1);
  assert.equal(selected.logs[0].taskRef, selected.tasks[0].ref);
});

// ── Campi: tutto quello che non è del dominio viene rifiutato ───────────────

check("uno stato inventato diventa todo", () => {
  const plan = normalizeCapturePlan(
    { tasks: [{ title: "Un task", status: "urgentissimo" }] },
    context,
  );
  assert.equal(plan.tasks[0].status, "todo");
});

check("una priorità inventata sparisce invece di essere scritta", () => {
  const plan = normalizeCapturePlan(
    { tasks: [{ title: "Un task", priority: "altissima" }] },
    context,
  );
  assert.equal(plan.tasks[0].priority, undefined);
});

check("un task senza titolo non è un task", () => {
  const plan = normalizeCapturePlan(
    { tasks: [{ title: "   " }, { title: "Questo sì" }] },
    context,
  );
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.tasks[0].title, "Questo sì");
});

check("il 31 febbraio non è una scadenza", () => {
  assert.equal(isDayKey("2026-02-31"), false);
  assert.equal(isDayKey("2026-02-28"), true);
  const plan = normalizeCapturePlan(
    { tasks: [{ title: "Un task", dueDate: "2026-02-31" }] },
    context,
  );
  assert.equal(plan.tasks[0].dueDate, undefined);
});

check("una scadenza in formato instant viene rifiutata, non reinterpretata", () => {
  const plan = normalizeCapturePlan(
    { tasks: [{ title: "Un task", dueDate: "2026-08-27T00:00:00.000Z" }] },
    context,
  );
  assert.equal(plan.tasks[0].dueDate, undefined);
});

check("i tag si de-duplicano ignorando le maiuscole e si fermano a otto", () => {
  const plan = normalizeCapturePlan(
    {
      tasks: [
        {
          title: "Un task",
          tags: ["Rossi", "rossi", "a", "b", "c", "d", "e", "f", "g", "h", "i"],
        },
      ],
    },
    context,
  );
  const tags = plan.tasks[0].tags;
  assert.equal(tags.filter((tag) => tag.toLowerCase() === "rossi").length, 1);
  assert.equal(tags[0], "Rossi");
  assert.ok(tags.length <= 8, `otto tag al massimo, non ${tags.length}`);
});

check("una durata impossibile non entra nel report", () => {
  const cases: Array<[unknown, number | undefined]> = [
    [0, undefined],
    [-30, undefined],
    [12 * 60 + 1, undefined],
    ["120", undefined],
    [120, 120],
    [90.4, 90],
  ];
  for (const [input, expected] of cases) {
    const plan = normalizeCapturePlan(
      { logs: [{ taskId: MINE.id, message: "Fatto", durationMinutes: input }] },
      context,
    );
    assert.equal(
      plan.logs[0].durationMinutes,
      expected,
      `durationMinutes ${JSON.stringify(input)} → ${plan.logs[0].durationMinutes}`,
    );
  }
});

check("una risposta che non è un oggetto produce un piano vuoto, non un errore", () => {
  for (const raw of [null, undefined, "una frase", 42, []]) {
    const plan = normalizeCapturePlan(raw, context);
    assert.equal(plan.tasks.length, 0);
    assert.equal(plan.additions.length, 0);
    assert.equal(plan.logs.length, 0);
  }
});

// ── Outline: order è per fratelli, mai globale ──────────────────────────────

check("un outline piatto numera i fratelli da uno", () => {
  const resolved = resolveOutline([step(), step(), step()]);
  assert.deepEqual(
    resolved.map((entry) => entry.order),
    [1, 2, 3],
  );
  assert.deepEqual(
    resolved.map((entry) => entry.parentIndex),
    [null, null, null],
  );
});

check("i figli ripartono da uno sotto il proprio genitore", () => {
  const resolved = resolveOutline([
    step({ title: "A" }),
    step({ title: "A.1", level: 1 }),
    step({ title: "A.2", level: 1 }),
    step({ title: "B" }),
    step({ title: "B.1", level: 1 }),
  ]);
  assert.deepEqual(
    resolved.map((entry) => entry.order),
    [1, 1, 2, 2, 1],
  );
  assert.deepEqual(
    resolved.map((entry) => entry.parentIndex),
    [null, 0, 0, null, 3],
  );
});

check("un livello che salta viene riportato a uno sotto il precedente", () => {
  const resolved = resolveOutline([step({ title: "A" }), step({ title: "B", level: 2 })]);
  assert.equal(resolved[1].draft.level, 1);
  assert.equal(resolved[1].parentIndex, 0);
});

check("un outline che comincia annidato viene riportato alla radice", () => {
  const resolved = resolveOutline([step({ title: "A", level: 2 })]);
  assert.equal(resolved[0].draft.level, 0);
  assert.equal(resolved[0].parentIndex, null);
});

check("gli step di primo livello partono da dove finiscono quelli esistenti", () => {
  const resolved = resolveOutline([step(), step({ level: 1 }), step()], 4);
  assert.deepEqual(
    resolved.map((entry) => entry.order),
    [4, 1, 5],
  );
});

check("la numerazione mostrata è quella della schermata task", () => {
  const rows = outlineRows([
    step({ title: "A" }),
    step({ title: "A.1", level: 1 }),
    step({ title: "A.1.1", level: 2 }),
    step({ title: "B" }),
  ]);
  assert.deepEqual(
    rows.map((row) => row.numbering),
    ["1", "1.1", "1.1.1", "2"],
  );
});

/** A plan with a three-level outline, an addition and a note carrying two hours. */
const planWithOutline = (): CapturePlan => ({
  summary: "",
  unclear: [],
  additions: [
    {
      taskId: MINE.id,
      steps: [step({ title: "X" }), step({ title: "X.1", level: 1 })],
    },
  ],
  logs: [{ taskId: MINE.id, message: "Fatto", tags: [], durationMinutes: 120 }],
  tasks: [
    {
      title: "Nuovo",
      status: "todo",
      tags: [],
      steps: [
        step({ title: "A" }),
        step({ title: "A.1", level: 1 }),
        step({ title: "A.1.1", level: 2 }),
        step({ title: "B" }),
      ],
    },
  ],
});

// ── Il livello si decide una volta sola ─────────────────────────────────────
//
// Queste verifiche coprono il bug trovato dalla revisione: la schermata disegnava l'annidamento con
// il livello CORRETTO da resolveOutline, mentre l'esclusione ragionava sul livello GREZZO. Con un
// outline che saltava un livello i due non erano d'accordo, e togliere la spunta a un genitore
// lasciava passare il figlio — che veniva poi riscritto sotto un altro step.

check("un outline che parte annidato viene appiattito già in normalizzazione", () => {
  const plan = normalizeCapturePlan(
    { tasks: [{ title: "Un task", steps: [step({ title: "A", level: 1 }), step({ title: "B", level: 1 })] }] },
    context,
  );
  assert.deepEqual(
    plan.tasks[0].steps.map((entry) => entry.level),
    [0, 1],
  );
});

check("un salto di livello viene chiuso in normalizzazione, non solo alla scrittura", () => {
  const plan = normalizeCapturePlan(
    {
      tasks: [
        {
          title: "Un task",
          steps: [step({ title: "A" }), step({ title: "B", level: 2 }), step({ title: "C", level: 2 })],
        },
      ],
    },
    context,
  );
  assert.deepEqual(
    plan.tasks[0].steps.map((entry) => entry.level),
    [0, 1, 2],
  );
});

check("uno step senza titolo non approfondisce l'outline che lo segue", () => {
  const plan = normalizeCapturePlan(
    {
      tasks: [
        {
          title: "Un task",
          steps: [step({ title: "A" }), step({ title: "  " }), step({ title: "C", level: 2 })],
        },
      ],
    },
    context,
  );
  assert.deepEqual(
    plan.tasks[0].steps.map((entry) => `${entry.title}@${entry.level}`),
    ["A@0", "C@1"],
  );
});

check("il livello disegnato e il livello scritto sono lo stesso livello", () => {
  const plan = normalizeCapturePlan(
    {
      tasks: [
        {
          title: "Un task",
          steps: [
            step({ title: "A", level: 2 }),
            step({ title: "B", level: 2 }),
            step({ title: "C", level: 0 }),
            step({ title: "D", level: 2 }),
          ],
        },
      ],
    },
    context,
  );
  const steps = plan.tasks[0].steps;
  const rows = outlineRows(steps);
  const resolved = resolveOutline(steps);
  for (let index = 0; index < steps.length; index += 1) {
    assert.equal(rows[index].level, steps[index].level, `riga ${index}: disegno`);
    assert.equal(resolved[index].draft.level, steps[index].level, `riga ${index}: scrittura`);
  }
});

check("dopo la normalizzazione, escludere un genitore porta via il figlio anche con i salti", () => {
  const plan = normalizeCapturePlan(
    { tasks: [{ title: "Un task", steps: [step({ title: "A", level: 1 }), step({ title: "B", level: 1 })] }] },
    context,
  );
  const selected = selectedPlan(plan, new Set([taskStepKey(0, 0)]));
  assert.deepEqual(selected.tasks[0].steps.map((entry) => entry.title), []);
});

check("droppedSteps segna come esclusi anche i discendenti, per la schermata", () => {
  const steps = [
    step({ title: "A" }),
    step({ title: "A.1", level: 1 }),
    step({ title: "A.1.1", level: 2 }),
    step({ title: "B" }),
  ];
  assert.deepEqual(
    droppedSteps(steps, (index) => index === 0),
    [true, true, true, false],
  );
  assert.deepEqual(
    droppedSteps(steps, (index) => index === 1),
    [false, true, true, false],
  );
  assert.deepEqual(
    droppedSteps(steps, () => false),
    [false, false, false, false],
  );
});

check("droppedSteps e selectedPlan danno la stessa risposta", () => {
  const plan = planWithOutline();
  const excluded = new Set([taskStepKey(0, 1)]);
  const flags = droppedSteps(plan.tasks[0].steps, (index) =>
    excluded.has(taskStepKey(0, index)),
  );
  const kept = selectedPlan(plan, excluded).tasks[0].steps.map((entry) => entry.title);
  const kepByFlags = plan.tasks[0].steps
    .filter((_, index) => !flags[index])
    .map((entry) => entry.title);
  assert.deepEqual(kept, kepByFlags);
});

// ── Un titolo svuotato a mano si ferma prima delle regole Firestore ─────────

check("un titolo svuotato nella revisione viene contato prima della scrittura", () => {
  const plan = planWithOutline();
  assert.equal(blankTitleCount(plan), 0);

  plan.tasks[0].title = "   ";
  assert.equal(blankTitleCount(plan), 1);

  plan.tasks[0].steps[0].title = "";
  plan.additions[0].steps[0].title = " ";
  assert.equal(blankTitleCount(plan), 3);
});

check("una riga svuotata ma esclusa non blocca più niente", () => {
  const plan = planWithOutline();
  plan.tasks[0].title = "";
  assert.equal(blankTitleCount(selectedPlan(plan, new Set([taskKey(0)]))), 0);
});

// ── Selezione: togliere un genitore toglie i figli ──────────────────────────

check("escludere uno step porta via anche quello che ci sta sotto", () => {
  const selected = selectedPlan(planWithOutline(), new Set([taskStepKey(0, 1)]));
  assert.deepEqual(
    selected.tasks[0].steps.map((entry) => entry.title),
    ["A", "B"],
  );
});

check("escludere un task lo toglie del tutto", () => {
  const selected = selectedPlan(planWithOutline(), new Set([taskKey(0)]));
  assert.equal(selected.tasks.length, 0);
  assert.equal(selected.additions.length, 1, "gli altri gruppi restano");
});

check("un gruppo di step svuotato non viene scritto", () => {
  const selected = selectedPlan(
    planWithOutline(),
    new Set([additionStepKey(0, 0), additionStepKey(0, 1)]),
  );
  assert.equal(selected.additions.length, 0);
});

check("i minuti del piano sono quelli delle note incluse", () => {
  assert.equal(planTotals(planWithOutline()).minutes, 120);
  assert.equal(planTotals(selectedPlan(planWithOutline(), new Set([logKey(0)]))).minutes, 0);
});

// ── Istanti: una nota di ieri resta di ieri ─────────────────────────────────

check("una nota datata finisce nel giorno locale che porta scritto", () => {
  for (const dayKey of ["2026-01-01", "2026-03-29", "2026-08-27", "2026-10-25", "2026-12-31"]) {
    const iso = logTimestamp(dayKey, new Date());
    assert.equal(instantDayKey(iso), dayKey, `${dayKey} → ${iso}`);
  }
});

check("una nota senza data è di adesso", () => {
  const now = new Date(2026, 7, 27, 23, 40, 0);
  assert.equal(instantDayKey(logTimestamp(undefined, now)), "2026-08-27");
});

// ── Verdetto ────────────────────────────────────────────────────────────────

check("un account non abilitato lo sa prima di scrivere una parola", () => {
  const verdict = readCapture({ access: "not-allowed" });
  assert.equal(verdict.isSparse, true, "la schermata deve offrire spiegazione, non un campo");
  const prose = verdict.detail.map((run) => run.text).join("");
  assert.match(prose, /credenziali/, "va detto PERCHÉ, non solo che non si può");
});

check("il divieto batte tutto il resto, anche una proposta già pronta", () => {
  const verdict = readCapture({ access: "not-allowed", selected: planWithOutline() });
  assert.equal(verdict.headline, "Questo account non può usare l'AI.");
});

check("una chiave mancante è una configurazione, non un divieto", () => {
  const verdict = readCapture({ access: "not-configured" });
  assert.notEqual(verdict.headline, readCapture({ access: "not-allowed" }).headline);
  assert.equal(verdict.isSparse, true);
});

check("senza indicazione di accesso la schermata si comporta come prima", () => {
  assert.equal(readCapture({}).headline, readCapture({ access: "allowed" }).headline);
});

check("una scrittura parziale lo dice prima di dire cosa è andato bene", () => {
  const verdict = readCapture({
    written: { createdTasks: 2, createdSteps: 3, createdLogs: 0, failures: ["Uno step è saltato."] },
  });
  assert.equal(verdict.sentiment, "bad");
});

check("una scrittura riuscita non finge di essere un problema", () => {
  const verdict = readCapture({
    written: { createdTasks: 2, createdSteps: 3, createdLogs: 1, failures: [] },
  });
  assert.equal(verdict.sentiment, "good");
});

check("un piano con delle ore le nomina, perché contano nel report", () => {
  const verdict = readCapture({ selected: planWithOutline() });
  const prose = verdict.detail.map((run) => run.text).join("");
  assert.match(prose, /2h/);
  assert.ok(
    verdict.detail.some((run) => run.kind === "figure" && run.sentiment === "warn"),
    "le ore vanno segnalate, non solo scritte",
  );
});

check("un piano svuotato dice che non c'è niente da scrivere", () => {
  const empty = selectedPlan(planWithOutline(), new Set([taskKey(0), additionStepKey(0, 0), logKey(0)]));
  const verdict = readCapture({ selected: empty });
  assert.equal(verdict.isSparse, true);
});

check("ogni titolo è una frase che finisce con un punto", () => {
  const samples = [
    readCapture({}),
    readCapture({ selected: planWithOutline() }),
    readCapture({ written: { createdTasks: 1, createdSteps: 0, createdLogs: 0, failures: [] } }),
    readCapture({ written: { createdTasks: 0, createdSteps: 0, createdLogs: 0, failures: ["No."] } }),
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
