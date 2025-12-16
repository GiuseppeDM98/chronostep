import type { Step, Task, WorkLog } from "./types";

export type StepSummary = {
  total: number;
  done: number;
};

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

export const buildTaskActivity = (workLogs: WorkLog[]): TaskActivityResult => {
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
      const bounded = Math.max(1, Math.round(log.durationMinutes));
      logDurations.set(log.id, bounded);
      entry.totalMinutes += bounded;
    } else if (log.type === "start") {
      runningSessions.set(log.taskId, timestampMs);
    } else if (log.type === "stop" && runningSessions.has(log.taskId)) {
      const startTime = runningSessions.get(log.taskId)!;
      const duration = Math.max(1, Math.round((timestampMs - startTime) / 60000));
      logDurations.set(log.id, duration);
      entry.totalMinutes += duration;
      runningSessions.delete(log.taskId);
    }

    taskActivity.set(log.taskId, entry);
  });

  return { logDurations, taskActivity };
};

export const getTaskStepSummary = (
  map: Map<string, StepSummary>,
  taskId: string,
): StepSummary => map.get(taskId) ?? { total: 0, done: 0 };

export const describePriority = (priority?: Task["priority"]) => {
  if (!priority) return "No priority";
  return `${priority.charAt(0).toUpperCase()}${priority.slice(1)}`;
};
