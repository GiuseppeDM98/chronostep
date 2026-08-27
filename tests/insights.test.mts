/**
 * Aggregation verification for src/lib/insights.ts.
 *
 * Run with: npm run test:insights
 *
 * These are the numbers the Report, Timeline and Insights screens print. Each case below is a bug
 * that shipped: sessions colliding across steps, the timer's stop double-counting against a manual
 * start, a forgotten stop billing four days to one session, and a session straddling a month filter
 * counting as zero minutes in every view.
 */
import assert from "node:assert/strict";
import {
  buildDailyWorkLogTotals,
  buildMonthlyReportSummary,
  buildMonthlyTrends,
  buildTaskActivity,
  groupWorkLogsByTag,
} from "../src/lib/insights.ts";
import { instantMonthKey } from "../src/lib/dates.ts";
import type { WorkLog } from "../src/lib/types.ts";

let counter = 0;
const log = (fields: Partial<WorkLog> & Pick<WorkLog, "type" | "timestamp">): WorkLog => ({
  id: `log-${(counter += 1)}`,
  userId: "alice",
  taskId: "task-1",
  tags: [],
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

check("due step dello stesso task non si sovrascrivono a vicenda", () => {
  // Sessione su step-a (60 min) e poi su step-b (30 min). Prima erano indicizzate per solo taskId,
  // quindi il secondo start cancellava il primo e i 60 minuti sparivano.
  const logs = [
    log({ type: "start", timestamp: "2026-08-27T08:00:00.000Z", stepId: "step-a" }),
    log({ type: "start", timestamp: "2026-08-27T08:30:00.000Z", stepId: "step-b" }),
    log({ type: "stop", timestamp: "2026-08-27T09:00:00.000Z", stepId: "step-b" }),
    log({ type: "stop", timestamp: "2026-08-27T09:00:00.000Z", stepId: "step-a" }),
  ];
  const { taskActivity } = buildTaskActivity(logs);
  assert.equal(taskActivity.get("task-1")?.totalMinutes, 90);
});

check("uno stop del timer chiude la sessione manuale rimasta aperta", () => {
  // Start manuale alle 08:00, poi il timer scrive uno stop con durationMinutes=45: 45 minuti in
  // tutto. Se quello stop non chiudesse la sessione, lo start delle 08:00 resterebbe aperto e si
  // accoppierebbe con il prossimo stop — qui alle 10:00 — aggiungendo altri 120 minuti mai lavorati.
  const logs = [
    log({ type: "start", timestamp: "2026-08-27T08:00:00.000Z" }),
    log({ type: "stop", timestamp: "2026-08-27T08:45:00.000Z", durationMinutes: 45 }),
    log({ type: "stop", timestamp: "2026-08-27T10:00:00.000Z" }),
  ];
  const { taskActivity } = buildTaskActivity(logs);
  assert.equal(taskActivity.get("task-1")?.totalMinutes, 45); // non 165
});

check("uno start seguito da uno stop del timer e poi da uno nuovo conta entrambe le sessioni", () => {
  const logs = [
    log({ type: "start", timestamp: "2026-08-27T08:00:00.000Z" }),
    log({ type: "stop", timestamp: "2026-08-27T08:45:00.000Z", durationMinutes: 45 }),
    log({ type: "start", timestamp: "2026-08-27T10:00:00.000Z" }),
    log({ type: "stop", timestamp: "2026-08-27T10:30:00.000Z" }),
  ];
  const { taskActivity } = buildTaskActivity(logs);
  assert.equal(taskActivity.get("task-1")?.totalMinutes, 75);
});

check("uno stop dimenticato non fattura giorni interi", () => {
  // Start lunedì mattina, nessuno stop; il prossimo stop è giovedì.
  const logs = [
    log({ type: "start", timestamp: "2026-08-24T09:00:00.000Z" }),
    log({ type: "stop", timestamp: "2026-08-27T18:00:00.000Z" }),
  ];
  const { taskActivity } = buildTaskActivity(logs);
  assert.equal(taskActivity.get("task-1")?.totalMinutes ?? 0, 0); // non 4860 minuti
});

check("una sessione lunga ma plausibile viene conteggiata", () => {
  const logs = [
    log({ type: "start", timestamp: "2026-08-27T08:00:00.000Z" }),
    log({ type: "stop", timestamp: "2026-08-27T16:00:00.000Z" }),
  ];
  const { taskActivity } = buildTaskActivity(logs);
  assert.equal(taskActivity.get("task-1")?.totalMinutes, 480);
});

check("un orologio che va indietro non produce minuti", () => {
  const logs = [
    log({ type: "start", timestamp: "2026-08-27T10:00:00.000Z" }),
    log({ type: "stop", timestamp: "2026-08-27T09:00:00.000Z" }),
  ];
  const { taskActivity } = buildTaskActivity(logs);
  // Lo stop precede lo start una volta ordinati, quindi non c'è nessuna sessione da chiudere.
  assert.equal(taskActivity.get("task-1")?.totalMinutes ?? 0, 0);
});

check("una sessione a cavallo di due mesi conta una volta sola, nel mese dello stop", () => {
  const logs = [
    log({ type: "start", timestamp: "2026-07-31T22:00:00.000Z" }),
    log({ type: "stop", timestamp: "2026-08-01T01:00:00.000Z" }),
    log({ type: "note", timestamp: "2026-08-15T10:00:00.000Z", message: "nota di agosto" }),
  ];
  const inAugust = (entry: WorkLog) => instantMonthKey(entry.timestamp) === "2026-08";
  const august = buildMonthlyReportSummary(logs, inAugust);
  const julyOnly = buildMonthlyReportSummary(logs, (entry) => instantMonthKey(entry.timestamp) === "2026-07");

  // Prima il pairing avveniva DOPO il filtro, quindi la sessione valeva zero in entrambi i mesi.
  assert.equal(august[0]?.totalMinutes, 180, "agosto deve ricevere i 180 minuti");
  assert.equal(julyOnly[0]?.totalMinutes ?? 0, 0, "luglio non deve ricevere minuti");
});

check("un tag ripetuto nello stesso log non raddoppia i minuti", () => {
  const logs = [
    log({ type: "stop", timestamp: "2026-08-27T09:00:00.000Z", durationMinutes: 60, tags: ["cliente", "cliente", " cliente "] }),
  ];
  const byTag = groupWorkLogsByTag(logs);
  assert.equal(byTag.get("cliente")?.length, 1);
});

check("la heatmap e i trend mensili concordano sul totale del mese", () => {
  // L'invariante che prima si rompeva: la heatmap raggruppava per giorno UTC, i trend per mese locale.
  const logs = [
    log({ type: "stop", timestamp: new Date(2026, 7, 3, 10, 0).toISOString(), durationMinutes: 95 }),
    log({ type: "stop", timestamp: new Date(2026, 7, 17, 14, 0).toISOString(), durationMinutes: 240 }),
    // Un log serale: è il giorno dopo in UTC per chi sta a est di Greenwich.
    log({ type: "stop", timestamp: new Date(2026, 7, 31, 23, 30).toISOString(), durationMinutes: 72 }),
  ];
  const { logDurations } = buildTaskActivity(logs);
  const daily = buildDailyWorkLogTotals(logs, logDurations);
  const trends = buildMonthlyTrends(logs);

  let augustFromHeatmap = 0;
  daily.forEach((minutes, dayKey) => {
    if (dayKey.startsWith("2026-08")) augustFromHeatmap += minutes;
  });

  assert.equal(augustFromHeatmap, 407);
  assert.equal(trends.get("2026-08")?.totalMinutes, 407);
});

check("un log serale resta nella propria giornata locale nella heatmap", () => {
  const evening = new Date(2026, 7, 27, 23, 30);
  const logs = [log({ type: "stop", timestamp: evening.toISOString(), durationMinutes: 30 })];
  const { logDurations } = buildTaskActivity(logs);
  const daily = buildDailyWorkLogTotals(logs, logDurations);
  assert.equal(daily.get("2026-08-27"), 30);
});

check("il top task del mese è quello con più minuti", () => {
  const logs = [
    log({ type: "stop", taskId: "task-1", timestamp: new Date(2026, 7, 5, 9, 0).toISOString(), durationMinutes: 100, tags: ["cliente"] }),
    log({ type: "stop", taskId: "task-2", timestamp: new Date(2026, 7, 6, 9, 0).toISOString(), durationMinutes: 300, tags: ["listino"] }),
  ];
  const trends = buildMonthlyTrends(logs);
  assert.equal(trends.get("2026-08")?.topTaskId, "task-2");
  assert.equal(trends.get("2026-08")?.topTaskMinutes, 300);
  assert.equal(trends.get("2026-08")?.topTag, "listino");
});

const failed = results.filter((result) => !result.ok);
console.log("");
for (const result of results) {
  console.log(`   ${result.ok ? "PASS" : "FAIL"}  ${result.name}`);
  if (!result.ok) console.log(`         ${result.detail}`);
}
console.log(`\n  ${results.length - failed.length}/${results.length} verifiche superate\n`);
process.exit(failed.length > 0 ? 1 : 0);
