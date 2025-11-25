import type { Step, Task, WorkLog } from "./types";

/**
 * Seed data for local development before persistence is in place.
 */
export const tasks: Task[] = [
  {
    id: "task-chrono-setup",
    title: "Set up Chronostep workspace",
    description: "Initialize repo, configure linting, and prep mock data.",
    status: "in_progress",
    priority: "high",
    tags: ["setup", "devex"],
    createdAt: "2025-01-10T08:30:00.000Z",
    updatedAt: "2025-01-12T09:45:00.000Z",
    dueDate: "2025-01-15T12:00:00.000Z",
  },
  {
    id: "task-research-ux",
    title: "Research UX patterns",
    description: "Collect references for multi-step progress trackers.",
    status: "todo",
    priority: "medium",
    tags: ["research", "ux"],
    createdAt: "2025-01-11T10:00:00.000Z",
    updatedAt: "2025-01-11T10:00:00.000Z",
  },
  {
    id: "task-write-devlog",
    title: "Write developer log entry",
    status: "done",
    priority: "low",
    tags: ["writing"],
    createdAt: "2025-01-09T15:00:00.000Z",
    updatedAt: "2025-01-10T07:20:00.000Z",
  },
];

export const steps: Step[] = [
  {
    id: "step-init-repo",
    taskId: "task-chrono-setup",
    title: "Initialize repository",
    status: "done",
    order: 1,
    createdAt: "2025-01-10T08:35:00.000Z",
    updatedAt: "2025-01-10T08:50:00.000Z",
  },
  {
    id: "step-config-lint",
    taskId: "task-chrono-setup",
    title: "Configure linting",
    status: "in_progress",
    order: 2,
    createdAt: "2025-01-10T09:00:00.000Z",
    updatedAt: "2025-01-12T09:45:00.000Z",
  },
  {
    id: "step-populate-mock",
    taskId: "task-chrono-setup",
    parentStepId: "step-config-lint",
    title: "Populate mock data",
    status: "todo",
    order: 3,
    createdAt: "2025-01-12T09:00:00.000Z",
    updatedAt: "2025-01-12T09:00:00.000Z",
  },
  {
    id: "step-gather-sources",
    taskId: "task-research-ux",
    title: "Gather inspirational apps",
    status: "todo",
    order: 1,
    createdAt: "2025-01-11T10:05:00.000Z",
    updatedAt: "2025-01-11T10:05:00.000Z",
  },
  {
    id: "step-outline-devlog",
    taskId: "task-write-devlog",
    title: "Outline entry",
    status: "done",
    order: 1,
    createdAt: "2025-01-09T15:10:00.000Z",
    updatedAt: "2025-01-09T16:20:00.000Z",
  },
  {
    id: "step-polish-devlog",
    taskId: "task-write-devlog",
    title: "Polish draft and publish",
    status: "done",
    order: 2,
    createdAt: "2025-01-10T06:30:00.000Z",
    updatedAt: "2025-01-10T07:20:00.000Z",
  },
];

export const workLogs: WorkLog[] = [
  {
    id: "worklog-1",
    taskId: "task-chrono-setup",
    stepId: "step-init-repo",
    type: "start",
    timestamp: "2025-01-10T08:35:00.000Z",
    message: "Kickoff repo initialization.",
  },
  {
    id: "worklog-2",
    taskId: "task-chrono-setup",
    stepId: "step-config-lint",
    type: "note",
    timestamp: "2025-01-12T09:30:00.000Z",
    message: "ESLint config mostly done, need to revisit Prettier rules.",
  },
  {
    id: "worklog-3",
    taskId: "task-research-ux",
    type: "note",
    timestamp: "2025-01-11T12:00:00.000Z",
    message: "Found three apps with progressive steps UI.",
  },
  {
    id: "worklog-4",
    taskId: "task-write-devlog",
    stepId: "step-polish-devlog",
    type: "stop",
    timestamp: "2025-01-10T07:20:00.000Z",
    durationMinutes: 50,
    message: "Entry ready for publishing.",
  },
];
