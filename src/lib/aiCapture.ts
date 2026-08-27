/**
 * The capture plan: what the model is allowed to propose, and how that proposal is made safe.
 *
 * The AI never writes anything. It returns a PLAN — new tasks, steps to hang under them, steps for
 * a task that already exists, notes for the work log — and every one of those items is written by
 * the client afterwards, through the ordinary store, under the ordinary Firestore rules. This
 * module is the seam between the two: it holds the plan's shape, and it is where a raw model
 * response becomes something the app is willing to act on.
 *
 * Three decisions here are load-bearing.
 *
 * **Nesting is an outline, not a tree.** A step carries a `level` (0, 1, 2) and its parent is the
 * nearest preceding step one level shallower — exactly how a person writes an indented list. A
 * recursive JSON schema would have expressed the same thing, but a flat array with a depth number
 * cannot come back malformed in a way that loses a step: a level that jumps from 0 to 2 is clamped
 * to 1 and the step stays. `resolveOutline` turns the outline into parent links and sibling orders.
 *
 * **A reference to a task the caller does not own is dropped, not written.** The Firestore rules
 * would reject such a write anyway — but only after the user pressed the button, as a failure with
 * no explanation. Checking it here means the proposal on screen is the proposal that can be
 * written.
 *
 * **Every bound in this file has a reason outside it.** Titles are capped at the length the
 * Firestore rules accept, durations at the twelve hours `insights.ts` treats as the longest
 * defensible session. A limit invented here would eventually contradict one enforced elsewhere.
 */
import { dayKeyToLocalDate, localDayKey, type DayKey } from "./dates";
import type { Step, StepStatus, Task, TaskPriority, TaskStatus } from "./types";

// ─── Bounds ──────────────────────────────────────────────────────────────────

/** `validNewTask` / `validNewStep` in firestore.rules reject a title longer than this. */
const MAX_TITLE_LENGTH = 500;
/** The rules allow 20000; this is the length past which a description stops being one. */
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 40;
/** Deepest level a step may sit at. Three levels is already more than the UI numbers comfortably. */
const MAX_STEP_LEVEL = 2;
const MAX_TASKS = 20;
const MAX_STEPS_PER_GROUP = 40;
const MAX_LOGS = 30;
/** `MAX_PAIRED_SESSION_MINUTES` in insights.ts: above this a span stops being one sitting. */
const MAX_DURATION_MINUTES = 12 * 60;
const MAX_SUMMARY_LENGTH = 400;
const MAX_UNCLEAR_ITEMS = 6;

const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const STEP_STATUSES: StepStatus[] = ["todo", "in_progress", "done"];
const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

// ─── The plan ────────────────────────────────────────────────────────────────

/** One step of an outline. `level` 0 is a top-level step; deeper levels nest under what precedes. */
export type CaptureStepDraft = {
  title: string;
  description?: string;
  status: StepStatus;
  dueDate?: DayKey;
  level: number;
};

export type CaptureTaskDraft = {
  /**
   * A handle for this proposed task, so a note in the same plan can point at it before it exists.
   *
   * Deliberately not an array index. The list is filtered twice between the model's answer and the
   * write — once for titleless entries, once for what the user unticks — and every filter shifts
   * indices under whatever was still holding one. A handle survives both: a note whose task is gone
   * simply fails to find it.
   */
  ref: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  tags: string[];
  dueDate?: DayKey;
  steps: CaptureStepDraft[];
};

/** Steps to add under a task that already exists. `taskId` is always one of the caller's own. */
export type CaptureAdditionDraft = {
  taskId: string;
  steps: CaptureStepDraft[];
};

/**
 * A work-log entry.
 *
 * Always a `note`, never a `start` or a `stop`. A start/stop pair is the record of a timer that
 * actually ran; inventing one would put minutes into the report that nobody ever measured. A note
 * carrying an explicit `durationMinutes` says "I worked this long", which is a claim the user makes
 * and confirms — and `buildTaskActivity` counts it exactly like any other duration, which is why
 * the review screen never writes one without showing it first.
 *
 * It hangs off exactly one of two things: `taskId`, a task that already exists, or `taskRef`, a
 * task this same plan is about to create. The second case is the one that made the feature worth
 * having — "ieri due ore sulla revisione del catalogo" is a sentence about work done on something
 * that is not in the diary yet, and requiring the task to pre-exist meant those two hours were
 * quietly dropped on the floor at the exact moment the user was trying to record them.
 */
export type CaptureLogDraft = {
  taskId?: string;
  /** `ref` of a task in the same plan's `tasks`. Mutually exclusive with `taskId`. */
  taskRef?: string;
  stepId?: string;
  message: string;
  tags: string[];
  durationMinutes?: number;
  /** The local day the note belongs to. Turned into an instant only at write time. */
  dayKey?: DayKey;
};

export type CapturePlan = {
  /** One sentence, in Italian, saying what the model understood. Not a verdict — a receipt. */
  summary: string;
  tasks: CaptureTaskDraft[];
  additions: CaptureAdditionDraft[];
  logs: CaptureLogDraft[];
  /** What the notes did not say clearly enough to act on. Shown to the user, never guessed at. */
  unclear: string[];
};

/** What the model is allowed to point at: the caller's own tasks and their steps. */
export type CaptureContext = {
  taskIds: Set<string>;
  stepIdsByTask: Map<string, Set<string>>;
};

export const emptyPlan = (): CapturePlan => ({
  summary: "",
  tasks: [],
  additions: [],
  logs: [],
  unclear: [],
});

/** Build the ownership context from a snapshot. The only source of "which ids are mine". */
export const buildCaptureContext = (tasks: Task[], steps: Step[]): CaptureContext => {
  const taskIds = new Set(tasks.map((task) => task.id));
  const stepIdsByTask = new Map<string, Set<string>>();
  steps.forEach((step) => {
    if (!taskIds.has(step.taskId)) return;
    const bucket = stepIdsByTask.get(step.taskId) ?? new Set<string>();
    bucket.add(step.id);
    stepIdsByTask.set(step.taskId, bucket);
  });
  return { taskIds, stepIdsByTask };
};

// ─── Field-level normalization ───────────────────────────────────────────────

const readString = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Truncated rather than rejected: an over-long title is still the right title, and dropping the
  // whole item over its length would lose work the user can see in their own notes.
  return trimmed.slice(0, maxLength);
};

const readEnum = <T extends string>(value: unknown, allowed: T[]): T | undefined =>
  typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : undefined;

const readTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const kept: string[] = [];
  // Compared case-insensitively but stored as written: tags are the user's own vocabulary, so
  // "Rossi" and "rossi" are one tag and the first spelling is the one that survives.
  const seen = new Set<string>();
  value.forEach((entry) => {
    const tag = readString(entry, MAX_TAG_LENGTH);
    if (!tag || seen.has(tag.toLowerCase())) return;
    seen.add(tag.toLowerCase());
    kept.push(tag);
  });
  return kept.slice(0, MAX_TAGS);
};

/**
 * A day key that denotes a real day.
 *
 * The pattern alone accepts "2026-02-31". Round-tripping through a local Date rejects it: an
 * impossible day rolls over into March and comes back as a different key.
 */
export const isDayKey = (value: unknown): value is DayKey => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return localDayKey(dayKeyToLocalDate(value)) === value;
};

const readDayKey = (value: unknown): DayKey | undefined => (isDayKey(value) ? value : undefined);

const readDuration = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const minutes = Math.round(value);
  if (minutes < 1 || minutes > MAX_DURATION_MINUTES) return undefined;
  return minutes;
};

// ─── Item-level normalization ────────────────────────────────────────────────

/**
 * Read an outline, and settle its levels here and nowhere else.
 *
 * A level is clamped against the level of the step BEFORE it, not just into 0..2 — an outline
 * cannot jump from 0 to 2, and the model does occasionally try. Doing it once, at the boundary,
 * is what keeps the three readers of `level` in agreement: `outlineRows` draws the indent,
 * `keepSelectedSteps` decides what a descendant is, and `resolveOutline` assigns parents. They used
 * to disagree, because only the last of the three clamped, and the cost was precise: a plan whose
 * levels went [1, 1] rendered as a parent and its child, but unticking the parent kept the child —
 * which was then written as a top-level step under a heading the user had explicitly refused.
 *
 * `resolveOutline` still clamps. It is now a net rather than the rule.
 */
const readStepDrafts = (value: unknown): CaptureStepDraft[] => {
  if (!Array.isArray(value)) return [];
  const drafts: CaptureStepDraft[] = [];
  // The level of the last step actually kept: a step dropped for having no title is not an
  // ancestor of anything, so it cannot deepen the outline.
  let previousLevel = -1;

  value.slice(0, MAX_STEPS_PER_GROUP).forEach((entry) => {
    if (typeof entry !== "object" || entry === null) return;
    const raw = entry as Record<string, unknown>;
    const title = readString(raw.title, MAX_TITLE_LENGTH);
    // A step with no title cannot be written: the Firestore rules require a non-empty one.
    if (!title) return;

    const claimed = typeof raw.level === "number" && Number.isFinite(raw.level) ? raw.level : 0;
    const level = Math.max(
      0,
      Math.min(Math.round(claimed), previousLevel + 1, MAX_STEP_LEVEL),
    );
    previousLevel = level;

    drafts.push({
      title,
      description: readString(raw.description, MAX_DESCRIPTION_LENGTH),
      status: readEnum(raw.status, STEP_STATUSES) ?? "todo",
      dueDate: readDayKey(raw.dueDate),
      level,
    });
  });
  return drafts;
};

/** The handle a proposed task carries, derived from its position in the model's own answer. */
const taskRefFor = (modelIndex: number) => `t${modelIndex}`;

const readTaskDraft = (
  raw: Record<string, unknown>,
  modelIndex: number,
): CaptureTaskDraft | undefined => {
  const title = readString(raw.title, MAX_TITLE_LENGTH);
  if (!title) return undefined;
  return {
    ref: taskRefFor(modelIndex),
    title,
    description: readString(raw.description, MAX_DESCRIPTION_LENGTH),
    status: readEnum(raw.status, TASK_STATUSES) ?? "todo",
    priority: readEnum(raw.priority, PRIORITIES),
    tags: readTags(raw.tags),
    dueDate: readDayKey(raw.dueDate),
    steps: readStepDrafts(raw.steps),
  };
};

const readAdditionDraft = (
  raw: Record<string, unknown>,
  context: CaptureContext,
): CaptureAdditionDraft | undefined => {
  const taskId = typeof raw.taskId === "string" ? raw.taskId : "";
  // The whole point of this check: a plan that names someone else's task is not a plan this app
  // will offer to write.
  if (!context.taskIds.has(taskId)) return undefined;
  const steps = readStepDrafts(raw.steps);
  if (steps.length === 0) return undefined;
  return { taskId, steps };
};

const readLogDraft = (
  raw: Record<string, unknown>,
  context: CaptureContext,
  proposedRefs: Set<string>,
): CaptureLogDraft | undefined => {
  const message = readString(raw.message, MAX_DESCRIPTION_LENGTH);
  if (!message) return undefined;

  const common = {
    message,
    tags: readTags(raw.tags),
    durationMinutes: readDuration(raw.durationMinutes),
    dayKey: readDayKey(raw.dayKey),
  };

  // An existing task wins: a note that names one is about that one, whatever else it also carries.
  const taskId = typeof raw.taskId === "string" ? raw.taskId : "";
  if (context.taskIds.has(taskId)) {
    // A step id that belongs to another task loses the step, not the note: the note is still true
    // about the task.
    const stepId = typeof raw.stepId === "string" ? raw.stepId : undefined;
    const ownedStep = stepId && context.stepIdsByTask.get(taskId)?.has(stepId) ? stepId : undefined;
    return { taskId, stepId: ownedStep, ...common };
  }

  // Otherwise a task from this same plan, by the position it held in the model's own answer. A
  // proposal that survived normalisation still holds that ref; one that was dropped does not, and
  // the note goes with it rather than attaching itself to whatever took its place.
  const index = typeof raw.newTaskIndex === "number" ? Math.round(raw.newTaskIndex) : -1;
  const ref = taskRefFor(index);
  if (index >= 0 && proposedRefs.has(ref)) {
    // No `stepId`: the steps of a task that does not exist yet have no ids to point at.
    return { taskRef: ref, ...common };
  }

  return undefined;
};

/** The entries of an array field, capped and stripped of anything that is not an object. */
const readObjectArray = (value: unknown, limit: number): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value
        .slice(0, limit)
        .filter(
          (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
        )
    : [];

/**
 * Turn a raw model response into a plan this app is willing to act on.
 *
 * Nothing here trusts the input: every field is re-read, every enum is re-checked, every id is
 * verified against what the caller actually owns, and anything unusable is dropped rather than
 * repaired into a guess. A malformed response therefore yields a smaller plan, never a wrong one.
 *
 * @param raw - Whatever came back from the model, already JSON-parsed.
 * @param context - The caller's own task and step ids, from `buildCaptureContext`.
 */
export const normalizeCapturePlan = (raw: unknown, context: CaptureContext): CapturePlan => {
  if (typeof raw !== "object" || raw === null) return emptyPlan();
  const source = raw as Record<string, unknown>;

  // Tasks first: a note may point at one of them, and it can only do so once they are known.
  const tasks = readObjectArray(source.tasks, MAX_TASKS)
    .map(readTaskDraft)
    .filter((draft): draft is CaptureTaskDraft => draft !== undefined);
  const proposedRefs = new Set(tasks.map((task) => task.ref));

  return {
    summary: readString(source.summary, MAX_SUMMARY_LENGTH) ?? "",
    tasks,
    additions: readObjectArray(source.additions, MAX_TASKS)
      .map((entry) => readAdditionDraft(entry, context))
      .filter((draft): draft is CaptureAdditionDraft => draft !== undefined),
    logs: readObjectArray(source.logs, MAX_LOGS)
      .map((entry) => readLogDraft(entry, context, proposedRefs))
      .filter((draft): draft is CaptureLogDraft => draft !== undefined),
    unclear: Array.isArray(source.unclear)
      ? source.unclear
          .map((entry) => readString(entry, MAX_SUMMARY_LENGTH))
          .filter((entry): entry is string => entry !== undefined)
          .slice(0, MAX_UNCLEAR_ITEMS)
      : [],
  };
};

// ─── Outline → parent links and sibling orders ───────────────────────────────

export type ResolvedStep = {
  draft: CaptureStepDraft;
  /** Index into the same resolved array, or null for a top-level step. */
  parentIndex: number | null;
  /** `order` as the store expects it: scoped to siblings, first child is 1. */
  order: number;
};

/**
 * Resolve an outline into parent links and sibling-scoped orders.
 *
 * @param drafts - Steps in document order, each carrying its own level.
 * @param rootStartOrder - The order the first top-level step takes. Pass 1 for a new task; pass
 *   `max(existing sibling order) + 1` when appending to a task that already has steps, so the new
 *   ones land after them instead of colliding.
 *
 * A level deeper than "one below the previous step" is impossible in an outline, so it is clamped
 * rather than rejected: the model occasionally skips a level, and the step it describes is still
 * wanted. `order` is per parent because that is what `order` means everywhere else in this app —
 * sorting a flat step list by it is always wrong.
 */
export const resolveOutline = (
  drafts: CaptureStepDraft[],
  rootStartOrder = 1,
): ResolvedStep[] => {
  const resolved: ResolvedStep[] = [];
  // Index of the most recent step at each level, so `ancestors[level - 1]` is the current parent.
  const ancestors: number[] = [];
  const nextOrderByParent = new Map<number | null, number>();

  drafts.forEach((draft, index) => {
    const level = Math.min(draft.level, ancestors.length, MAX_STEP_LEVEL);
    ancestors.length = level;
    const parentIndex = level === 0 ? null : ancestors[level - 1];

    const firstOrder = parentIndex === null ? rootStartOrder : 1;
    const order = nextOrderByParent.get(parentIndex) ?? firstOrder;
    nextOrderByParent.set(parentIndex, order + 1);

    resolved.push({ draft: { ...draft, level }, parentIndex, order });
    ancestors[level] = index;
  });

  return resolved;
};

/** How a proposed step is presented: its position in the outline and how deep it sits. */
export type OutlineRow = { numbering: string; level: number };

/**
 * The "1", "1.1", "2" gutter the task screen already uses, computed for a proposed outline.
 *
 * Always numbered from 1, even for steps that will be appended after existing ones: this labels the
 * shape of the proposal on screen, not the position it will end up occupying.
 */
export const outlineRows = (drafts: CaptureStepDraft[]): OutlineRow[] => {
  const labelByIndex = new Map<number, string>();
  return resolveOutline(drafts).map(({ draft, parentIndex, order }, index) => {
    const prefix = parentIndex === null ? "" : `${labelByIndex.get(parentIndex)}.`;
    const numbering = `${prefix}${order}`;
    labelByIndex.set(index, numbering);
    return { numbering, level: draft.level };
  });
};

// ─── Selection ───────────────────────────────────────────────────────────────

/**
 * Stable keys for the review screen's include/exclude toggles.
 *
 * Positional rather than content-based: two proposed steps can legitimately carry the same title,
 * and a key that collided would hide one behind the other's checkbox.
 */
export const taskKey = (taskIndex: number) => `task:${taskIndex}`;
export const taskStepKey = (taskIndex: number, stepIndex: number) =>
  `task:${taskIndex}:step:${stepIndex}`;
export const additionKey = (additionIndex: number) => `add:${additionIndex}`;
export const additionStepKey = (additionIndex: number, stepIndex: number) =>
  `add:${additionIndex}:step:${stepIndex}`;
export const logKey = (logIndex: number) => `log:${logIndex}`;

/**
 * For each step, whether it will be left out of the write.
 *
 * Excluding a parent has to take its children with it: writing an orphaned substep would attach it
 * to whatever step happened to precede it instead — silently, and under a heading the user
 * explicitly refused.
 *
 * Exported because the review screen needs the SAME answer, row by row, in order to grey out and
 * lock the children of a step that has been unticked. Deriving that on screen from the row's own
 * checkbox alone let the two drift: a substep stayed ticked, upright and editable while it had
 * already been removed from what would be written.
 */
export const droppedSteps = (
  steps: CaptureStepDraft[],
  isExcluded: (stepIndex: number) => boolean,
): boolean[] => {
  const dropped: boolean[] = [];
  let prunedAbove: number | null = null;

  steps.forEach((step, index) => {
    if (prunedAbove !== null && step.level > prunedAbove) {
      dropped.push(true);
      return;
    }
    prunedAbove = null;
    if (isExcluded(index)) {
      prunedAbove = step.level;
      dropped.push(true);
      return;
    }
    dropped.push(false);
  });

  return dropped;
};

const keepSelectedSteps = (
  steps: CaptureStepDraft[],
  isExcluded: (stepIndex: number) => boolean,
): CaptureStepDraft[] => {
  const dropped = droppedSteps(steps, isExcluded);
  return steps.filter((_, index) => !dropped[index]);
};

/**
 * Project a plan through the user's exclusions: what is actually going to be written.
 *
 * @param plan - The proposal as edited on screen.
 * @param excluded - Keys from `taskKey` / `taskStepKey` / `additionKey` / `additionStepKey` / `logKey`.
 */
export const selectedPlan = (plan: CapturePlan, excluded: Set<string>): CapturePlan => {
  const tasks = plan.tasks
    .map((task, taskIndex) => ({
      ...task,
      steps: keepSelectedSteps(task.steps, (stepIndex) =>
        excluded.has(taskStepKey(taskIndex, stepIndex)),
      ),
    }))
    .filter((_, taskIndex) => !excluded.has(taskKey(taskIndex)));

  // A note attached to a proposed task goes with it. Left behind, it would be a note about
  // something that is never going to exist — and there would be nothing to file it under.
  const keptRefs = new Set(tasks.map((task) => task.ref));

  return {
    summary: plan.summary,
    unclear: plan.unclear,
    tasks,
    additions: plan.additions
      .map((addition, additionIndex) => ({
        ...addition,
        steps: keepSelectedSteps(addition.steps, (stepIndex) =>
          excluded.has(additionStepKey(additionIndex, stepIndex)),
        ),
      }))
      .filter(
        (addition, additionIndex) =>
          !excluded.has(additionKey(additionIndex)) && addition.steps.length > 0,
      ),
    logs: plan.logs
      .filter((_, logIndex) => !excluded.has(logKey(logIndex)))
      .filter((log) => !log.taskRef || keptRefs.has(log.taskRef)),
  };
};

/**
 * What actually landed when a plan was written, and what did not.
 *
 * Lives here rather than in the store because the verdict engine reads it too, and a type that
 * both a hook and a pure module need belongs under neither of them.
 */
export type CaptureWriteResult = {
  createdTasks: number;
  createdSteps: number;
  createdLogs: number;
  /** One sentence per item that failed. Empty when the whole plan landed. */
  failures: string[];
};

export type PlanTotals = {
  tasks: number;
  steps: number;
  logs: number;
  /** Minutes the plan would add to the report. Zero when no note claims a duration. */
  minutes: number;
};

/** What a plan amounts to, for the verdict and for the confirmation copy. */
export const planTotals = (plan: CapturePlan): PlanTotals => ({
  tasks: plan.tasks.length,
  steps:
    plan.tasks.reduce((sum, task) => sum + task.steps.length, 0) +
    plan.additions.reduce((sum, addition) => sum + addition.steps.length, 0),
  logs: plan.logs.length,
  minutes: plan.logs.reduce((sum, log) => sum + (log.durationMinutes ?? 0), 0),
});

export const planIsEmpty = (plan: CapturePlan): boolean => {
  const totals = planTotals(plan);
  return totals.tasks === 0 && totals.steps === 0 && totals.logs === 0;
};

/**
 * How many rows of this plan carry a title that is empty after trimming.
 *
 * The model cannot produce one — `readStepDrafts` and `readTaskDraft` drop a titleless row — but
 * the review screen can: its title fields are ordinary text inputs, and clearing one is a natural
 * way to say "I don't want this". `validNewTask` and `validNewStep` in `firestore.rules` require a
 * title of non-zero length, so such a row is refused at the very last moment, after the rest of the
 * plan has already been written and the proposal has been cleared. Counting them beforehand is what
 * lets the screen stop instead of apologise.
 */
export const blankTitleCount = (plan: CapturePlan): number => {
  const isBlank = (title: string) => title.trim().length === 0;
  const inSteps = (steps: CaptureStepDraft[]) =>
    steps.filter((step) => isBlank(step.title)).length;

  return (
    plan.tasks.filter((task) => isBlank(task.title)).length +
    plan.tasks.reduce((sum, task) => sum + inSteps(task.steps), 0) +
    plan.additions.reduce((sum, addition) => sum + inSteps(addition.steps), 0)
  );
};

/**
 * The instant a note is filed at.
 *
 * A note dictated as "ieri" carries a day, not a moment, and the work log stores moments. Local
 * noon is the safe representative of a local day: far enough from both midnights that no timezone
 * offset or daylight-saving shift can move it onto the neighbouring day, which is exactly the
 * failure `dates.ts` exists to prevent.
 */
export const logTimestamp = (dayKey: DayKey | undefined, now: Date): string => {
  if (!dayKey) return now.toISOString();
  const noon = dayKeyToLocalDate(dayKey);
  noon.setHours(12, 0, 0, 0);
  return noon.toISOString();
};
