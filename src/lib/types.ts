/**
 * Domain model primitives for Chronostep.
 * Derived from docs/02-domain-model-and-routes.md to keep the UI and data layer in sync.
 */

/**
 * Branded type for IDs so we can tighten contracts later without churn.
 * Currently behaves as a string but highlights semantic intent at call sites.
 */
export type EntityId = string;

/**
 * ISO 8601 timestamps stored as strings to preserve precision during serialization.
 */
export type IsoDateTimeString = string;

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";

export type TaskPriority = "low" | "medium" | "high";

export type StepStatus = "todo" | "in_progress" | "done";

export type WorkLogType = "start" | "stop" | "note";

/**
 * Top-level item that users manipulate. Tracks metadata and progress signals.
 */
export interface Task {
  id: EntityId;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
  dueDate?: IsoDateTimeString;
}

/**
 * A smaller action under a Task, supporting nested steps and ordering.
 */
export interface Step {
  id: EntityId;
  taskId: EntityId;
  parentStepId?: EntityId;
  title: string;
  status: StepStatus;
  order: number;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

/**
 * Chronological record of work sessions or notes tied to tasks or steps.
 */
export interface WorkLog {
  id: EntityId;
  taskId: EntityId;
  stepId?: EntityId;
  message?: string;
  type: WorkLogType;
  timestamp: IsoDateTimeString;
  durationMinutes?: number;
}
