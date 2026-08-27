/**
 * Date-handling verification.
 *
 * Run with: npm run test:dates
 *
 * Every assertion here is run TWICE, once from a timezone west of UTC and once from a timezone
 * east of it, because a date bug in this app is invisible from Greenwich. The runner re-executes
 * this file with TZ set; a single run only ever proves half of it.
 */
import assert from "node:assert/strict";
import {
  daysBetweenKeys,
  daysUntilDue,
  dueDateKey,
  dueDateToInputValue,
  formatDayKey,
  formatDueDate,
  formatElapsed,
  formatMinutes,
  instantDayKey,
  instantMonthKey,
  normalizeDayKey,
  todayKey,
} from "../src/lib/dates.ts";

const zone = process.env.TZ ?? "(sistema)";
const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

const check = (name: string, run: () => void) => {
  try {
    run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message.split("\n")[0] });
  }
};

// A due date is a calendar day, stored as the day itself.
const DUE = "2026-08-27";
// The shape the previous build wrote: a calendar day encoded as a UTC-midnight instant.
const LEGACY_DUE = "2026-08-27T00:00:00.000Z";

check("una due date conserva il giorno scelto", () => {
  assert.equal(dueDateKey(DUE), "2026-08-27");
});

check("una due date scritta dal build precedente si legge ancora giusta", () => {
  assert.equal(normalizeDayKey(LEGACY_DUE), "2026-08-27");
  assert.equal(dueDateKey(LEGACY_DUE), "2026-08-27");
});

check("la due date formattata mostra il 27, non il 26", () => {
  const shown = formatDueDate(DUE, { day: "numeric", month: "numeric", year: "numeric" });
  assert.ok(shown.includes("27"), `atteso il giorno 27, ottenuto "${shown}"`);
  const legacyShown = formatDueDate(LEGACY_DUE, { day: "numeric", month: "numeric", year: "numeric" });
  assert.ok(legacyShown.includes("27"), `atteso il giorno 27 anche dal formato vecchio, ottenuto "${legacyShown}"`);
});

check("il round-trip con <input type=date> è stabile", () => {
  assert.equal(dueDateToInputValue(DUE), "2026-08-27");
  assert.equal(dueDateToInputValue("2026-03-08"), "2026-03-08");
  assert.equal(dueDateToInputValue(LEGACY_DUE), "2026-08-27");
});

check("una due date assente o illeggibile non stampa 'Invalid Date'", () => {
  assert.equal(formatDueDate(undefined), "—");
  assert.equal(formatDueDate(""), "—");
  assert.equal(normalizeDayKey("non una data"), "");
});

// "Oggi" is the user's local day. These two instants are the same moment; the day differs by zone.
check("le 19:00 di giovedì a Los Angeles sono ancora giovedì", () => {
  // 2026-08-28T02:00Z = giovedì 27 agosto, 19:00 PDT.
  const key = todayKey(new Date("2026-08-28T02:00:00.000Z"));
  const expected = process.env.TZ === "America/Los_Angeles" ? "2026-08-27" : "2026-08-28";
  assert.equal(key, expected);
});

check("l'una di notte di giovedì a Tokyo è già giovedì", () => {
  // 2026-08-26T16:00Z = giovedì 27 agosto, 01:00 JST.
  const key = todayKey(new Date("2026-08-26T16:00:00.000Z"));
  const expected = process.env.TZ === "Asia/Tokyo" ? "2026-08-27" : "2026-08-26";
  assert.equal(key, expected);
});

check("un work log serale finisce nella giornata locale, non in quella UTC", () => {
  // 23:30 locali: l'istante cade il giorno dopo in UTC per chi sta a est di Greenwich.
  const evening = new Date(2026, 7, 27, 23, 30, 0);
  assert.equal(instantDayKey(evening.toISOString()), "2026-08-27");
  assert.equal(instantMonthKey(evening.toISOString()), "2026-08");
});

check("un work log mattutino resta nella stessa giornata locale", () => {
  const morning = new Date(2026, 7, 27, 0, 15, 0);
  assert.equal(instantDayKey(morning.toISOString()), "2026-08-27");
});

// Day arithmetic must survive a DST transition.
check("due giorni restano due anche attraverso il cambio d'ora", () => {
  assert.equal(daysBetweenKeys("2026-03-07", "2026-03-09"), 2); // DST negli USA
  assert.equal(daysBetweenKeys("2026-10-24", "2026-10-26"), 2); // DST in Europa
  assert.equal(daysBetweenKeys("2026-08-27", "2026-08-27"), 0);
  assert.equal(daysBetweenKeys("2026-01-01", "2025-12-31"), -1);
});

check("una scadenza passata dà giorni negativi", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  assert.equal(daysUntilDue("2026-08-31", now), 4);
  assert.equal(daysUntilDue("2026-08-20", now), -7);
});

check("un giorno bisestile non si perde", () => {
  assert.equal(dueDateKey("2028-02-29"), "2028-02-29");
  assert.equal(daysBetweenKeys("2028-02-28", "2028-03-01"), 2);
});

check("formatDayKey non sposta il giorno", () => {
  const shown = formatDayKey("2026-08-01", { day: "numeric", month: "numeric" });
  assert.ok(shown.includes("1"), `atteso il giorno 1, ottenuto "${shown}"`);
});

check("formatMinutes", () => {
  assert.equal(formatMinutes(0), "0m");
  assert.equal(formatMinutes(45), "45m");
  assert.equal(formatMinutes(60), "1h");
  assert.equal(formatMinutes(150), "2h 30m");
  assert.equal(formatMinutes(-5), "0m");
});

check("formatElapsed", () => {
  assert.equal(formatElapsed(0), "00:00:00");
  assert.equal(formatElapsed(4358), "01:12:38");
  assert.equal(formatElapsed(-10), "00:00:00");
});

const failed = results.filter((result) => !result.ok);
console.log(`\n  TZ=${zone}`);
for (const result of results) {
  console.log(`   ${result.ok ? "PASS" : "FAIL"}  ${result.name}`);
  if (!result.ok) console.log(`         ${result.detail}`);
}
console.log(`   ${results.length - failed.length}/${results.length}`);
process.exit(failed.length > 0 ? 1 : 0);
