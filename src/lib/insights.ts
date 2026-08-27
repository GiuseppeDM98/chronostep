/**
 * Derived metrics for the Timeline, Report and Insights views.
 *
 * The one thing to understand before changing anything here: a work log carries its minutes in one
 * of two ways, and they must never both count.
 *
 *   - An explicit `durationMinutes`, written by the timer when a session is stopped.
 *   - A `start` log paired with a later `stop` log, written by hand.
 *
 * Pairing is the delicate part, and three separate bugs lived in it: sessions were keyed by task
 * alone (so two steps of the same task overwrote each other), a `stop` carrying an explicit
 * duration did not close its session (so a stale `start` stayed open and later paired with an
 * unrelated `stop`, counting the same hours twice), and a forgotten `stop` could pair days later
 * and report a single session of 40 hours.
 */
import { instantDayKey, instantMonthKey } from "./dates";
import type { Step, Task, WorkLog } from "./types";

export type StepSummary = {
  total: number;
  done: number;
};

/**
 * Aggregate step counts per task for progress display.
 *
 * @param steps - Array of steps to aggregate
 * @returns Map of taskId to { total, done } counts
 */
export const buildStepsByTask = (steps: Step[]) => {
  const map = new Map<string, StepSummary>();
  steps.forEach((step) => {
    const current = map.get(step.taskId) ?? { total: 0, done: 0 };
    map.set(step.taskId, {
      total: current.total + 1,
      done: current.done + (step.status === "done" ? 1 : 0),
    });
  });
  return map;
};

export type TaskActivitySummary = {
  totalMinutes: number;
  logCount: number;
  lastLogTimestamp?: string;
};

export type TaskActivityResult = {
  logDurations: Map<string, number>;
  taskActivity: Map<string, TaskActivitySummary>;
};

export type MonthlyReportEntry = {
  taskId: string;
  totalMinutes: number;
  logCount: number;
  highlights: string[];
};

export type MonthlyTrendEntry = {
  monthKey: string;
  totalMinutes: number;
  topTaskId?: string;
  topTaskMinutes: number;
  topTag?: string;
  topTagMinutes: number;
};

export type TaskTagSummary = {
  tags: string[];
  overflowCount: number;
};

/**
 * A `start` that stays open longer than this is treated as a forgotten stop and abandoned, exactly
 * as an unpaired `start` already was. Without the cap, one missed stop silently attributes every
 * hour up to the next unrelated stop — days, sometimes — to a single session, and that one number
 * then dominates the report, the trends and the heatmap.
 *
 * Twelve hours is above any plausible single sitting and below an overnight gap.
 */
const MAX_PAIRED_SESSION_MINUTES = 12 * 60;

/** Sessions are per task AND per step: two steps of one task can be timed one after the other. */
const sessionKey = (log: WorkLog) => `${log.taskId}::${log.stepId ?? ""}`;

/** Tags, trimmed, non-empty and de-duplicated within a single log. */
const normalizedTags = (log: WorkLog): string[] => {
  const seen = new Set<string>();
  log.tags.forEach((tag) => {
    const trimmed = tag.trim();
    if (trimmed) seen.add(trimmed);
  });
  return Array.from(seen);
};

/**
 * Calculate time spent per task from work logs.
 *
 * @param workLogs - Work logs to process. Pass the COMPLETE set: pairing a filtered set drops any
 *   session whose start and stop fall on opposite sides of the filter. Narrow afterwards, using
 *   the returned per-log durations.
 * @returns Per-log durations in minutes, and per-task rollups.
 *
 * Durations are clamped to a minimum of 1 minute so a short session still registers.
 */
export const buildTaskActivity = (workLogs: WorkLog[]): TaskActivityResult => {
  // Ascending, so a start is always seen before the stop that closes it.
  const sortedLogs = [...workLogs].sort(
    (a, b) => new Date(a.timestamp).valueOf() - new Date(b.timestamp).valueOf(),
  );
  const logDurations = new Map<string, number>();
  const taskActivity = new Map<string, TaskActivitySummary>();
  const openSessions = new Map<string, number>();

  sortedLogs.forEach((log) => {
    const timestampMs = new Date(log.timestamp).valueOf();
    const entry = taskActivity.get(log.taskId) ?? {
      totalMinutes: 0,
      logCount: 0,
      lastLogTimestamp: undefined as string | undefined,
    };
    entry.logCount += 1;
    if (!entry.lastLogTimestamp || timestampMs > new Date(entry.lastLogTimestamp).valueOf()) {
      entry.lastLogTimestamp = log.timestamp;
    }

    const key = sessionKey(log);
    // A stop closes its session whatever else it does. The timer writes a stop that ALSO carries
    // durationMinutes; if that stop did not close the session, a manual start would stay open and
    // pair with some later stop, billing the same stretch of time twice.
    const openedAtMs = openSessions.get(key);
    if (log.type === "stop") {
      openSessions.delete(key);
    }

    if (typeof log.durationMinutes === "number") {
      const bounded = Math.max(1, Math.round(log.durationMinutes));
      logDurations.set(log.id, bounded);
      entry.totalMinutes += bounded;
    } else if (log.type === "start") {
      openSessions.set(key, timestampMs);
    } else if (log.type === "stop" && openedAtMs !== undefined) {
      const elapsedMinutes = Math.round((timestampMs - openedAtMs) / 60000);
      // A negative span means the clock moved backwards between the two logs; an over-long one
      // means the stop was never pressed. Neither is a session, so neither is counted.
      if (elapsedMinutes >= 0 && elapsedMinutes <= MAX_PAIRED_SESSION_MINUTES) {
        const duration = Math.max(1, elapsedMinutes);
        logDurations.set(log.id, duration);
        entry.totalMinutes += duration;
      }
    }

    taskActivity.set(log.taskId, entry);
  });

  return { logDurations, taskActivity };
};

/**
 * Roll a set of logs up per task, reusing durations computed over the complete history.
 *
 * @param workLogs - The logs in scope (already filtered by month, tag, whatever).
 * @param logDurations - Durations from buildTaskActivity over the FULL log set.
 * @param highlightLimit - Max note highlights per task.
 */
export const summarizeLogsByTask = (
  workLogs: WorkLog[],
  logDurations: Map<string, number>,
  highlightLimit = 3,
): MonthlyReportEntry[] => {
  const totals = new Map<string, { totalMinutes: number; logCount: number }>();
  workLogs.forEach((log) => {
    const current = totals.get(log.taskId) ?? { totalMinutes: 0, logCount: 0 };
    current.totalMinutes += logDurations.get(log.id) ?? 0;
    current.logCount += 1;
    totals.set(log.taskId, current);
  });

  const highlightsByTask = new Map<string, string[]>();
  [...workLogs]
    .sort((a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf())
    .forEach((log) => {
      const trimmed = log.message?.trim();
      if (!trimmed) return;
      const highlights = highlightsByTask.get(log.taskId) ?? [];
      if (highlights.includes(trimmed) || highlights.length >= highlightLimit) return;
      highlights.push(trimmed);
      highlightsByTask.set(log.taskId, highlights);
    });

  return Array.from(totals.entries())
    .map(([taskId, totalsForTask]) => ({
      taskId,
      totalMinutes: totalsForTask.totalMinutes,
      logCount: totalsForTask.logCount,
      highlights: highlightsByTask.get(taskId) ?? [],
    }))
    .sort(
      (a, b) =>
        b.totalMinutes - a.totalMinutes ||
        b.logCount - a.logCount ||
        a.taskId.localeCompare(b.taskId),
    );
};

/**
 * Build per-task monthly summaries with total minutes and note highlights.
 *
 * @param allWorkLogs - The complete set, so start/stop pairs that straddle the filter still count.
 * @param isInScope - Predicate selecting the logs the report covers.
 * @param highlightLimit - Max note highlights per task.
 *
 * Minutes are attributed to the log that CLOSES a session, so a session begun in January and
 * stopped in February belongs to February — one month, never zero and never both.
 */
export const buildMonthlyReportSummary = (
  allWorkLogs: WorkLog[],
  isInScope: (log: WorkLog) => boolean,
  highlightLimit = 3,
): MonthlyReportEntry[] => {
  const { logDurations } = buildTaskActivity(allWorkLogs);
  return summarizeLogsByTask(allWorkLogs.filter(isInScope), logDurations, highlightLimit);
};

/**
 * Group work logs by tag for filtering and rollup displays.
 *
 * @param workLogs - Array of work logs to group
 * @returns Map of tag name to the logs carrying it
 *
 * A log listing the same tag twice appears in that bucket ONCE — otherwise a duplicated tag
 * doubled the log's minutes under the tag filter.
 */
export const groupWorkLogsByTag = (workLogs: WorkLog[]) => {
  const map = new Map<string, WorkLog[]>();
  workLogs.forEach((log) => {
    normalizedTags(log).forEach((tag) => {
      const bucket = map.get(tag) ?? [];
      bucket.push(log);
      map.set(tag, bucket);
    });
  });
  return map;
};

/**
 * Build compact tag summaries for task list views.
 *
 * @param workLogs - Array of work logs to analyze
 * @param limit - Maximum number of tags to show per task (default: 3)
 * @returns Map of taskId to { tags, overflowCount }
 *
 * Tags are ranked by how many logs carry them, then alphabetically.
 */
export const buildTaskTagSummary = (workLogs: WorkLog[], limit = 3) => {
  const countsByTask = new Map<string, Map<string, number>>();
  workLogs.forEach((log) => {
    const tags = normalizedTags(log);
    if (tags.length === 0) return;
    const taskTags = countsByTask.get(log.taskId) ?? new Map<string, number>();
    tags.forEach((tag) => taskTags.set(tag, (taskTags.get(tag) ?? 0) + 1));
    countsByTask.set(log.taskId, taskTags);
  });

  const summary = new Map<string, TaskTagSummary>();
  countsByTask.forEach((counts, taskId) => {
    const sorted = Array.from(counts.entries()).sort(
      ([tagA, countA], [tagB, countB]) => countB - countA || tagA.localeCompare(tagB),
    );
    const tags = sorted.slice(0, limit).map(([tag]) => tag);
    summary.set(taskId, { tags, overflowCount: Math.max(0, sorted.length - tags.length) });
  });
  return summary;
};

/**
 * Build monthly trend snapshots for totals and top contributors.
 *
 * @param workLogs - The complete log set.
 * @returns Map keyed by local YYYY-MM with total minutes, top task and top tag.
 */
export const buildMonthlyTrends = (workLogs: WorkLog[]) => {
  const { logDurations } = buildTaskActivity(workLogs);
  const totalMinutesByMonth = new Map<string, number>();
  const taskMinutesByMonth = new Map<string, Map<string, number>>();
  const tagMinutesByMonth = new Map<string, Map<string, number>>();

  workLogs.forEach((log) => {
    const minutes = logDurations.get(log.id);
    if (!minutes) return;
    const monthKey = instantMonthKey(log.timestamp);

    totalMinutesByMonth.set(monthKey, (totalMinutesByMonth.get(monthKey) ?? 0) + minutes);

    const taskTotals = taskMinutesByMonth.get(monthKey) ?? new Map<string, number>();
    taskTotals.set(log.taskId, (taskTotals.get(log.taskId) ?? 0) + minutes);
    taskMinutesByMonth.set(monthKey, taskTotals);

    const tagTotals = tagMinutesByMonth.get(monthKey) ?? new Map<string, number>();
    normalizedTags(log).forEach((tag) => {
      tagTotals.set(tag, (tagTotals.get(tag) ?? 0) + minutes);
    });
    tagMinutesByMonth.set(monthKey, tagTotals);
  });

  // Highest minutes wins; an exact tie is broken by id so the label does not flicker between renders.
  const pickTopEntry = (bucket?: Map<string, number>) => {
    let topId: string | undefined;
    let topMinutes = 0;
    bucket?.forEach((minutes, id) => {
      if (minutes > topMinutes || (minutes === topMinutes && topId !== undefined && id < topId)) {
        topId = id;
        topMinutes = minutes;
      }
    });
    return { id: topId, minutes: topMinutes };
  };

  const trends = new Map<string, MonthlyTrendEntry>();
  totalMinutesByMonth.forEach((totalMinutes, monthKey) => {
    const taskTop = pickTopEntry(taskMinutesByMonth.get(monthKey));
    const tagTop = pickTopEntry(tagMinutesByMonth.get(monthKey));
    trends.set(monthKey, {
      monthKey,
      totalMinutes,
      topTaskId: taskTop.id,
      topTaskMinutes: taskTop.minutes,
      topTag: tagTop.id,
      topTagMinutes: tagTop.minutes,
    });
  });

  return trends;
};

/**
 * Aggregate total minutes per calendar day from work logs.
 *
 * @param workLogs - Work logs to analyze
 * @param logDurations - Per-log durations from buildTaskActivity
 * @returns Map of local day key (YYYY-MM-DD) to total minutes
 *
 * Buckets are LOCAL days, matching the months used by buildMonthlyTrends. They used to be UTC days
 * while the trends were local months, so the heatmap and the trend panel reported different totals
 * for the same month and late-evening work landed on the following day.
 */
export const buildDailyWorkLogTotals = (
  workLogs: WorkLog[],
  logDurations: Map<string, number>,
) => {
  const totals = new Map<string, number>();
  workLogs.forEach((log) => {
    const minutes = logDurations.get(log.id);
    if (!minutes) return;
    const dayKey = instantDayKey(log.timestamp);
    totals.set(dayKey, (totals.get(dayKey) ?? 0) + minutes);
  });
  return totals;
};

/**
 * Safely retrieve step summary for a task, with fallback.
 *
 * @param map - Step summary map from buildStepsByTask
 * @param taskId - Task ID to look up
 * @returns StepSummary with { total: 0, done: 0 } if task has no steps
 */
export const getTaskStepSummary = (
  map: Map<string, StepSummary>,
  taskId: string,
): StepSummary => map.get(taskId) ?? { total: 0, done: 0 };

/**
 * Format priority value for display.
 *
 * @param priority - Optional priority value
 * @returns Capitalized priority string or "Nessuna priorità" for undefined
 */
export const describePriority = (priority?: Task["priority"]) => {
  if (!priority) return "Nessuna priorità";
  const labels: Record<NonNullable<Task["priority"]>, string> = {
    low: "Bassa",
    medium: "Media",
    high: "Alta",
  };
  return labels[priority];
};
