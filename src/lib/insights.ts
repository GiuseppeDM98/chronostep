import type { Step, Task, WorkLog } from "./types";

export type StepSummary = {
  total: number;
  done: number;
};

// Aggregate step totals per task so UIs can render progress without re-scanning steps.
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

// Derive per-task activity from work logs, handling explicit durations and start/stop sessions.
export const buildTaskActivity = (workLogs: WorkLog[]): TaskActivityResult => {
  // Sort ascending so start/stop sessions compute forward in time.
  const sortedLogs = [...workLogs].sort(
    (a, b) => new Date(a.timestamp).valueOf() - new Date(b.timestamp).valueOf(),
  );
  const logDurations = new Map<string, number>();
  const taskActivity = new Map<string, TaskActivitySummary>();
  const runningSessions = new Map<string, number>();

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

// Return a summary bucket even if the task has no steps yet.
export const getTaskStepSummary = (
  map: Map<string, StepSummary>,
  taskId: string,
): StepSummary => map.get(taskId) ?? { total: 0, done: 0 };

// Normalize priority labels for consistent UI copy.
export const describePriority = (priority?: Task["priority"]) => {
  if (!priority) return "No priority";
  return `${priority.charAt(0).toUpperCase()}${priority.slice(1)}`;
};
