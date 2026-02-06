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
 *
 * Used by UI components to render progress bars without re-scanning steps.
 */
export const buildStepsByTask = (steps: Step[]) => {
  const map = new Map<string, StepSummary>();
  steps.forEach((step) => {
    const current = map.get(step.taskId) ?? { total: 0, done: 0 };
    const updated: StepSummary = {
      total: current.total + 1,
      done: current.done + (step.status === "done" ? 1 : 0),
    };
    map.set(step.taskId, updated);
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

export type TaskTagSummary = {
  tags: string[];
  overflowCount: number;
};

/**
 * Group work logs by tag for filtering and rollup displays.
 *
 * @param workLogs - Array of work logs to group
 * @returns Map of tag name to array of logs containing that tag
 *
 * Note: A single log with multiple tags will appear in multiple groups.
 */
export const groupWorkLogsByTag = (workLogs: WorkLog[]) => {
  const map = new Map<string, WorkLog[]>();
  workLogs.forEach((log) => {
    log.tags.forEach((tag) => {
      if (!tag) return;
      const trimmed = tag.trim();
      if (!trimmed) return;
      const bucket = map.get(trimmed) ?? [];
      bucket.push(log);
      map.set(trimmed, bucket);
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
 * Tags are sorted by frequency (most used first), then alphabetically.
 */
export const buildTaskTagSummary = (workLogs: WorkLog[], limit = 3) => {
  const map = new Map<string, Map<string, number>>();
  workLogs.forEach((log) => {
    if (!log.tags.length) return;
    const taskTags = map.get(log.taskId) ?? new Map<string, number>();
    log.tags.forEach((tag) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      taskTags.set(trimmed, (taskTags.get(trimmed) ?? 0) + 1);
    });
    map.set(log.taskId, taskTags);
  });

  const summary = new Map<string, TaskTagSummary>();
  map.forEach((counts, taskId) => {
    const sorted = Array.from(counts.entries()).sort(
      ([tagA, countA], [tagB, countB]) => countB - countA || tagA.localeCompare(tagB),
    );
    const tags = sorted.slice(0, limit).map(([tag]) => tag);
    summary.set(taskId, {
      tags,
      overflowCount: Math.max(0, sorted.length - tags.length),
    });
  });
  return summary;
};

/**
 * Calculate time spent per task from work logs.
 *
 * @param workLogs - Array of work logs to process
 * @returns Object containing per-log durations and per-task activity summaries
 *
 * Handles two duration sources:
 * 1. Explicit durationMinutes field (used for manual time entry)
 * 2. Paired start/stop logs (computed from timestamp difference)
 *
 * All durations are clamped to a minimum of 1 minute for UI consistency.
 */
export const buildTaskActivity = (workLogs: WorkLog[]): TaskActivityResult => {
  // Sort ascending so start/stop sessions compute forward in time.
  const sortedLogs = [...workLogs].sort(
    (a, b) => new Date(a.timestamp).valueOf() - new Date(b.timestamp).valueOf(),
  );
  const logDurations = new Map<string, number>();
  const taskActivity = new Map<string, TaskActivitySummary>();
  const runningSessions = new Map<string, number>();

  // Process logs chronologically to handle start/stop pairing
  sortedLogs.forEach((log) => {
    const timestampMs = new Date(log.timestamp).valueOf();
    const entry =
      taskActivity.get(log.taskId) ?? {
        totalMinutes: 0,
        logCount: 0,
        lastLogTimestamp: undefined,
      };
    entry.logCount += 1;
    if (!entry.lastLogTimestamp || timestampMs > new Date(entry.lastLogTimestamp).valueOf()) {
      entry.lastLogTimestamp = log.timestamp;
    }

    if (typeof log.durationMinutes === "number") {
      // Clamp to at least 1 minute to keep UI chips meaningful and avoid zero-length logs.
      const bounded = Math.max(1, Math.round(log.durationMinutes));
      logDurations.set(log.id, bounded);
      entry.totalMinutes += bounded;
    } else if (log.type === "start") {
      // Start/stop session pairing algorithm:
      // Track the most recent "start" timestamp per task. When we encounter
      // a "stop" for that task, compute elapsed time and clear the session.
      // Unpaired starts (no corresponding stop) are ignored - this handles
      // cases where users forget to log a stop event.
      runningSessions.set(log.taskId, timestampMs);
    } else if (log.type === "stop" && runningSessions.has(log.taskId)) {
      const startTime = runningSessions.get(log.taskId)!;
      // Use a minimum of 1 minute to avoid invisible sessions from short stop/start gaps.
      const duration = Math.max(1, Math.round((timestampMs - startTime) / 60000));
      logDurations.set(log.id, duration);
      entry.totalMinutes += duration;
      runningSessions.delete(log.taskId);
    }

    taskActivity.set(log.taskId, entry);
  });

  return { logDurations, taskActivity };
};

/**
 * Build per-task monthly summaries with total minutes and note highlights.
 *
 * Args:
 *   workLogs: Filtered work logs for a specific month.
 *   highlightLimit: Max number of note highlights per task.
 *
 * Returns:
 *   MonthlyReportEntry[]: Sorted summaries ready for report UI.
 */
export const buildMonthlyReportSummary = (
  workLogs: WorkLog[],
  highlightLimit = 3,
): MonthlyReportEntry[] => {
  const { taskActivity } = buildTaskActivity(workLogs);
  const highlightsByTask = new Map<string, string[]>();

  const sortedLogs = [...workLogs].sort(
    (a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf(),
  );

  sortedLogs.forEach((log) => {
    if (!log.message) return;
    const trimmed = log.message.trim();
    if (!trimmed) return;
    const highlights = highlightsByTask.get(log.taskId) ?? [];
    if (highlights.includes(trimmed)) return;
    if (highlights.length < highlightLimit) {
      highlights.push(trimmed);
      highlightsByTask.set(log.taskId, highlights);
    }
  });

  return Array.from(taskActivity.entries())
    .map(([taskId, activity]) => ({
      taskId,
      totalMinutes: activity.totalMinutes,
      logCount: activity.logCount,
      highlights: highlightsByTask.get(taskId) ?? [],
    }))
    .sort(
      (a, b) =>
        b.totalMinutes - a.totalMinutes || b.logCount - a.logCount || a.taskId.localeCompare(b.taskId),
    );
};

/**
 * Aggregate total minutes per UTC calendar day from work logs.
 *
 * @param workLogs - Array of work logs to analyze
 * @param logDurations - Map of logId to computed duration in minutes
 * @returns Map of UTC date key (YYYY-MM-DD) to total minutes
 *
 * Why UTC keys: keeps daily buckets stable across timezones and consistent
 * with the Timeline grouping logic and calendar date keys.
 */
export const buildDailyWorkLogTotals = (
  workLogs: WorkLog[],
  logDurations: Map<string, number>,
) => {
  const totals = new Map<string, number>();
  workLogs.forEach((log) => {
    const minutes = logDurations.get(log.id);
    if (!minutes) return;
    const dateKey = new Date(log.timestamp).toISOString().slice(0, 10);
    totals.set(dateKey, (totals.get(dateKey) ?? 0) + minutes);
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
 * @returns Capitalized priority string or "No priority" for undefined
 */
export const describePriority = (priority?: Task["priority"]) => {
  if (!priority) return "No priority";
  return `${priority.charAt(0).toUpperCase()}${priority.slice(1)}`;
};
