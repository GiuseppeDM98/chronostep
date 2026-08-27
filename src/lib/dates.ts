/**
 * Date handling for Chronostep.
 *
 * The app stores two kinds of date, and nearly every timezone bug in it came from treating them
 * as one kind.
 *
 * 1. CALENDAR DATES (`Task.dueDate`, `Step.dueDate`) are days on a wall calendar: "consegna il
 *    27 agosto". They carry no time and no timezone, so they are STORED AS `"2026-08-27"` —
 *    the day itself, not a moment.
 *
 *    They used to be stored as UTC midnight (`2026-08-27T00:00:00.000Z`), which encodes a calendar
 *    day as an instant and then needs every reader to remember to decode it in UTC. One reader
 *    that forgot — `new Date(iso).toLocaleDateString()` — printed "26 agosto" for everyone west of
 *    Greenwich. A plain day string cannot drift, so the whole class of bug stops being possible
 *    rather than being defended against at each call site. `normalizeDayKey` still accepts the old
 *    shape, so documents written by the previous build keep reading correctly.
 *
 * 2. INSTANTS (`WorkLog.timestamp`) are moments in time: when a session stopped. The day a user
 *    files an instant under is their LOCAL day — a log written at 23:30 in Rome belongs to that
 *    evening, not to the next morning in UTC.
 *
 * Mixing the two is what made the Insights heatmap (UTC days) disagree with the monthly trends
 * (local months), and what filed a late-evening work log under a date heading that contradicted
 * the time printed on the row beneath it.
 *
 * Every function here takes an explicit `now` where "today" is involved, so callers can be tested
 * and so a long-lived tab can recompute instead of freezing the day it mounted.
 */

/** `YYYY-MM-DD`. Compared as a string; never re-parsed with `new Date()` outside this module. */
export type DayKey = string;

/** `YYYY-MM`. */
export type MonthKey = string;

const pad = (value: number) => value.toString().padStart(2, "0");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Instants (work log timestamps) ──────────────────────────────────────────

/** The day key a user would file `date` under: their local calendar day. */
export const localDayKey = (date: Date): DayKey =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The local day key for an instant stored as an ISO string. */
export const instantDayKey = (iso: string): DayKey => localDayKey(new Date(iso));

/** The local month key for an instant stored as an ISO string. */
export const instantMonthKey = (iso: string): MonthKey => instantDayKey(iso).slice(0, 7);

/** Today, in the user's timezone. Pass `now` so callers can recompute rather than freeze it. */
export const todayKey = (now: Date = new Date()): DayKey => localDayKey(now);

// ─── Calendar dates (due dates) ──────────────────────────────────────────────

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Coerce a stored due date to a day key.
 *
 * Today's writes are already `"2026-08-27"` and pass straight through. Documents written by the
 * previous build hold a UTC-midnight instant instead, so those are decoded in UTC — the timezone
 * they were encoded in. Reading such a value locally is precisely the bug this shape retires.
 */
export const normalizeDayKey = (value: string): DayKey => {
  if (DAY_KEY_PATTERN.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

/** The calendar day a stored due date denotes. */
export const dueDateKey = (stored: string): DayKey => normalizeDayKey(stored);

/** Stored due date -> the value an `<input type="date">` expects (the same shape). */
export const dueDateToInputValue = (stored?: string): string =>
  stored ? normalizeDayKey(stored) : "";

// ─── Day-key arithmetic ──────────────────────────────────────────────────────

/**
 * Turn a day key into a Date positioned at LOCAL midnight of that day.
 *
 * This is the one safe way to hand a day key to `toLocaleDateString`: the components go in as
 * local ones and come back out as the same local ones, so no offset can shift the result. Building
 * it as `new Date(key)` instead would parse the key as UTC and reintroduce the drift.
 */
export const dayKeyToLocalDate = (dayKey: DayKey): Date => {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Whole days from `from` to `to`, both day keys. Positive means `to` is in the future.
 *
 * Computed on UTC-anchored midnights so a DST transition between the two dates cannot round the
 * difference to 0 or 2 — the reason not to subtract two local Date objects and divide.
 */
export const daysBetweenKeys = (from: DayKey, to: DayKey): number => {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((end - start) / MS_PER_DAY);
};

/** Days from today until a stored due date. Negative means overdue. */
export const daysUntilDue = (dueIso: string, now: Date = new Date()): number =>
  daysBetweenKeys(todayKey(now), dueDateKey(dueIso));

// ─── Display ─────────────────────────────────────────────────────────────────

type DateStyleOptions = Intl.DateTimeFormatOptions;

/** Format a day key for display, free of timezone drift. */
export const formatDayKey = (dayKey: DayKey, options?: DateStyleOptions): string =>
  dayKeyToLocalDate(dayKey).toLocaleDateString(undefined, options);

/** Format a stored due date for display. Shows the day that was chosen, in every timezone. */
export const formatDueDate = (iso?: string, options?: DateStyleOptions): string =>
  iso ? formatDayKey(dueDateKey(iso), options) : "—";

/** Format an instant's date part in the viewer's timezone. */
export const formatInstantDate = (iso: string, options?: DateStyleOptions): string =>
  new Date(iso).toLocaleDateString(undefined, options);

/** Format an instant's clock time in the viewer's timezone. */
export const formatInstantTime = (iso: string, options?: DateStyleOptions): string =>
  new Date(iso).toLocaleTimeString(undefined, options ?? { hour: "2-digit", minute: "2-digit" });

/** Format a month key ("2026-08") as a month-and-year label. */
export const formatMonthKey = (monthKey: MonthKey, options?: DateStyleOptions): string =>
  formatDayKey(`${monthKey}-01`, options ?? { month: "long", year: "numeric" });

/**
 * The Italian preposition "a" before a month name.
 *
 * The euphonic form "ad" is required before a word starting with the same vowel: "ad agosto",
 * "ad aprile", but "a ottobre". Composing the label as `a ${month}` produced "a agosto", and it
 * was set in the largest type on the Report page.
 */
export const aOrAd = (word: string): string => (/^a/i.test(word) ? "ad" : "a");

/** Minutes as a compact "2h 30m" / "45m" label. */
export const formatMinutes = (totalMinutes: number): string => {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

/** Elapsed seconds as `HH:MM:SS`, for the live timer readout. */
export const formatElapsed = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};
