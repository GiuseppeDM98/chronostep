/**
 * TaskDetailPage - Comprehensive task management view
 *
 * Displays a single task with:
 * - Task editing modal with Esc warning on unsaved changes
 * - Hierarchical step tree with parent/child relationships and auto-complete
 * - Work log creation/editing with step association
 * - Status filtering for steps
 *
 * Architecture notes:
 * - 40+ state variables manage three modal forms (task, step, worklog)
 * - Text snapshots track unsaved changes for Esc warning behavior
 * - Step tree is built recursively and supports status filtering with descendants
 * - Dates use UTC midnight to avoid timezone shifts in calendar views
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import AuthGate from "../../../components/AuthGate";
import type { Step, StepStatus, Task, TaskStatus, WorkLogType } from "../../../lib/types";
import { useTaskStore } from "../../../hooks/useTaskStore";
import { useTimer } from "../../../hooks/useTimer";

type StepNode = Step & { children: StepNode[] };

const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

const WORKLOG_TYPE_LABELS: Record<WorkLogType, string> = {
  start: "Start",
  stop: "Stop",
  note: "Note",
};

const TASK_STATUS_OPTIONS: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const STEP_STATUS_OPTIONS: StepStatus[] = TASK_STATUS_OPTIONS.filter(
  (status): status is StepStatus => status !== "blocked",
);
const TASK_PRIORITY_OPTIONS: Array<NonNullable<Task["priority"]>> = ["low", "medium", "high"];

// Build a stable step tree per task, keeping sibling order deterministic.
const buildStepTree = (taskSteps: Step[]) => {
  const map = new Map<string, StepNode>();

  taskSteps.forEach((step) => {
    map.set(step.id, { ...step, children: [] });
  });

  const roots: StepNode[] = [];

  map.forEach((node) => {
    // Only attach a node if its parent exists in the same task snapshot.
    if (node.parentStepId && map.has(node.parentStepId)) {
      map.get(node.parentStepId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes: StepNode[]) => {
    // Order is user-defined, so keep it stable across renders.
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((child) => sortNodes(child.children));
  };

  sortNodes(roots);
  return roots;
};

const formatDate = (iso?: string) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString();
};

const parseTagsInput = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const formatTagsInput = (tags?: string[]) => tags?.join(", ") ?? "";

// Convert ISO timestamp to date input value (YYYY-MM-DD format).
// Uses .slice(0, 10) to extract date portion, which gives UTC date.
// This keeps date grouping consistent across timezones - a task due
// "2024-01-15" at UTC midnight appears as "2024-01-15" everywhere,
// not shifted to local time (which could show "2024-01-14" in some zones).
const toDateInputValue = (iso?: string) => {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
};

const StatusBadge = ({ status }: { status: Task["status"] }) => {
  const styles: Record<Task["status"], string> = {
    todo: "bg-slate-100 text-slate-700",
    in_progress: "bg-amber-100 text-amber-800",
    done: "bg-emerald-100 text-emerald-800",
    blocked: "bg-rose-100 text-rose-800",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
};

const STEP_STATUS_BADGE_STYLES: Record<StepStatus, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
};

const STEP_STATUS_DOT_STYLES: Record<StepStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-amber-500",
  done: "bg-emerald-500",
};

const StepStatusBadge = ({ status }: { status: StepStatus }) => (
  <span
    className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STEP_STATUS_BADGE_STYLES[status]}`}
  >
    <span className={`h-2 w-2 rounded-full ${STEP_STATUS_DOT_STYLES[status]}`} />
    {STEP_STATUS_LABELS[status]}
  </span>
);

// Filter step tree by status while preserving hierarchy.
// When a parent doesn't match the filter, we "lift" its matching
// descendants to the result array so they remain visible in the UI.
// This prevents hiding relevant steps just because their parent differs.
const filterStepTree = (nodes: StepNode[], status: StepStatus): StepNode[] => {
  const matches: StepNode[] = [];

  nodes.forEach((node) => {
    const filteredChildren = filterStepTree(node.children, status);
    if (node.status === status) {
      matches.push({ ...node, children: filteredChildren });
    } else {
      // Lift matching descendants when the parent does not match the filter.
      matches.push(...filteredChildren);
    }
  });

  return matches;
};

/**
 * StepTree - Recursive step hierarchy display
 *
 * Renders nested steps with status badges, edit/delete actions,
 * and visual nesting with border-left indentation.
 *
 * @param nodes - Step tree nodes to render (already filtered/ordered)
 * @param onStatusChange - Handler for inline status updates
 * @param onDelete - Handler for step deletion
 * @param onEdit - Handler to open edit modal
 */
const StepTree = ({
  nodes,
  onStatusChange,
  onDelete,
  onEdit,
}: {
  nodes: StepNode[];
  onStatusChange: (id: string, status: StepStatus) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) => (
  <ul className="space-y-3">
    {nodes.map((node) => (
      <li key={node.id} className="rounded-lg border border-slate-200 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="break-words font-medium text-slate-900">{node.title}</p>
            {node.description ? (
              <p className="break-words whitespace-pre-wrap text-sm text-slate-600">
                {node.description}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <StepStatusBadge status={node.status} />
              <select
                className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                value={node.status}
                onChange={(event) => onStatusChange(node.id, event.target.value as StepStatus)}
              >
                {Object.entries(STEP_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {node.dueDate ? <span>Due {formatDate(node.dueDate)}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-medium sm:justify-end">
            <span className="text-slate-400">#{node.order}</span>
            <button
              type="button"
              className="text-sky-700 hover:text-sky-900"
              onClick={() => onEdit(node.id)}
            >
              Modifica
            </button>
            <button
              type="button"
              className="text-rose-600 hover:text-rose-700"
              onClick={() => onDelete(node.id)}
            >
              Elimina
            </button>
          </div>
        </div>
        {node.children.length > 0 ? (
          <div className="mt-3 border-l-2 border-slate-100 pl-4">
            <StepTree
              nodes={node.children}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          </div>
        ) : null}
      </li>
    ))}
  </ul>
);

/**
 * TaskDetailPage - Main task detail view component
 *
 * Renders task header, step tree, work logs, and three modal forms.
 * Heavy use of local state to manage modal interactions and form data.
 *
 * @param params - Next.js route params with task ID (Promise in Next.js 16+)
 */
const TaskDetailPage = ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = use(params);
  const router = useRouter();
  const {
    tasks,
    steps,
    workLogs,
    isHydrated,
    createStep,
    createWorkLog,
    updateStep,
    updateStepOrders,
    updateTask,
    updateWorkLog,
    deleteStep,
    deleteTask,
    deleteWorkLog,
  } = useTaskStore();
  const { timerState, elapsedSeconds, startTimer, stopTimer } = useTimer();

  const task = tasks.find((candidate) => candidate.id === id);
  const taskSteps = useMemo(
    () => steps.filter((step) => step.taskId === id),
    [steps, id],
  );
  const taskLogs = useMemo(
    () => workLogs.filter((log) => log.taskId === id),
    [workLogs, id],
  );

  // ============================================================================
  // State Management - Step Form
  // ============================================================================
  const [newStepTitle, setNewStepTitle] = useState("");
  const [newStepParentId, setNewStepParentId] = useState("");
  const [newStepDescription, setNewStepDescription] = useState("");
  const [newStepStatus, setNewStepStatus] = useState<StepStatus>("todo");
  const [newStepDueDate, setNewStepDueDate] = useState("");
  const [stepStatusFilter, setStepStatusFilter] = useState<"all" | StepStatus>("all");
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingStepTitle, setEditingStepTitle] = useState("");
  const [editingStepDescription, setEditingStepDescription] = useState("");
  const [editingStepStatus, setEditingStepStatus] = useState<StepStatus>("todo");
  const [editingStepDueDate, setEditingStepDueDate] = useState("");
  const [editingStepParentId, setEditingStepParentId] = useState("");
  const [editingStepOriginalParentId, setEditingStepOriginalParentId] = useState("");
  const [editingStepOrder, setEditingStepOrder] = useState(1);

  // ============================================================================
  // State Management - Work Log Form
  // ============================================================================
  const [newLogType, setNewLogType] = useState<WorkLogType>("note");
  const [newLogMessage, setNewLogMessage] = useState("");
  const [newLogStepId, setNewLogStepId] = useState("");
  const [newLogTags, setNewLogTags] = useState("");
  const defaultTaskTags = useMemo(() => formatTagsInput(task?.tags), [task?.tags]);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLogType, setEditingLogType] = useState<WorkLogType>("note");
  const [editingLogMessage, setEditingLogMessage] = useState("");
  const [editingLogStepId, setEditingLogStepId] = useState("");
  const [editingLogTags, setEditingLogTags] = useState("");

  // ============================================================================
  // State Management - Timer
  // ============================================================================
  const [timerStepId, setTimerStepId] = useState("");
  const [timerWarning, setTimerWarning] = useState<string | null>(null);
  const [isTimerSaving, setIsTimerSaving] = useState(false);

  // ============================================================================
  // State Management - Modal Visibility
  // ============================================================================
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isStepModalOpen, setIsStepModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

  // ============================================================================
  // State Management - Task Edit Modal
  // ============================================================================
  const [taskTitleInput, setTaskTitleInput] = useState("");
  const [taskDescriptionInput, setTaskDescriptionInput] = useState("");
  const [taskStatusInput, setTaskStatusInput] = useState<TaskStatus>("todo");
  const [taskPriorityInput, setTaskPriorityInput] = useState<Task["priority"]>();
  const [taskTagsInput, setTaskTagsInput] = useState("");
  const [taskDueDateInput, setTaskDueDateInput] = useState("");
  const [taskFormError, setTaskFormError] = useState<string | null>(null);
  const [isTaskSaving, setIsTaskSaving] = useState(false);

  // ============================================================================
  // State Management - Esc Warning System
  // ============================================================================
  // Text snapshots capture original values to detect unsaved changes.
  // When user presses Esc, we compare current input against snapshot.
  const taskTextSnapshot = useRef({ title: "", description: "", tags: "" });
  const stepTextSnapshot = useRef({ title: "", description: "" });
  const logTextSnapshot = useRef({ message: "", tags: "" });
  const [taskEscWarning, setTaskEscWarning] = useState<string | null>(null);
  const [stepEscWarning, setStepEscWarning] = useState<string | null>(null);
  const [logEscWarning, setLogEscWarning] = useState<string | null>(null);

  const logTagLimit = 3;

  // ============================================================================
  // Memos - Computed Data
  // ============================================================================
  const stepTree = useMemo(() => buildStepTree(taskSteps), [taskSteps]);
  const filteredStepTree = useMemo(() => {
    if (stepStatusFilter === "all") return stepTree;
    return filterStepTree(stepTree, stepStatusFilter);
  }, [stepTree, stepStatusFilter]);
  const orderedSteps = useMemo(
    () => [...taskSteps].sort((first, second) => first.order - second.order),
    [taskSteps],
  );
  const editingStepOrderOptions = useMemo(() => {
    if (!editingStepId) return [];
    const parentId = editingStepParentId || undefined;
    const siblingCount = taskSteps.filter(
      (step) => step.parentStepId === parentId && step.id !== editingStepId,
    ).length;
    return Array.from({ length: siblingCount + 1 }, (_, index) => index + 1);
  }, [taskSteps, editingStepParentId, editingStepId]);
  // Collect all descendant IDs of the step being edited.
  // Used to prevent circular references - can't make a step its own descendant.
  // Traverses the tree recursively once the editing step is found.
  const editingStepDescendantIds = useMemo(() => {
    if (!editingStepId) return new Set<string>();
    const collectDescendants = (nodes: StepNode[]): Set<string> => {
      for (const node of nodes) {
        if (node.id === editingStepId) {
          const collectFrom = (current: StepNode, acc: Set<string>) => {
            current.children.forEach((child) => {
              acc.add(child.id);
              collectFrom(child, acc);
            });
            return acc;
          };
          return collectFrom(node, new Set());
        }
        const nested = collectDescendants(node.children);
        if (nested.size > 0) {
          return nested;
        }
      }
      return new Set();
    };
    return collectDescendants(stepTree);
  }, [editingStepId, stepTree]);

  const totalSteps = taskSteps.length;
  const completedSteps = taskSteps.filter((step) => step.status === "done").length;

  const orderedLogs = useMemo(
    () =>
      [...taskLogs].sort(
        (a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf(),
      ),
    [taskLogs],
  );
  const isEditingStep = Boolean(editingStepId);
  const isEditingLog = Boolean(editingLogId);
  const isTimerRunning = timerState.status === "running";
  const isTimerForTask = isTimerRunning && timerState.taskId === id;
  const isTimerForOtherTask = isTimerRunning && timerState.taskId !== id;

  const formatElapsed = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value: number) => value.toString().padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  // ============================================================================
  // Form Reset Functions
  // ============================================================================
  const resetStepEditForm = () => {
    setEditingStepId(null);
    setEditingStepTitle("");
    setEditingStepDescription("");
    setEditingStepStatus("todo");
    setEditingStepDueDate("");
    setEditingStepParentId("");
    setEditingStepOriginalParentId("");
    setEditingStepOrder(1);
    setStepEscWarning(null);
  };

  const resetNewStepForm = () => {
    setNewStepTitle("");
    setNewStepParentId("");
    setNewStepDescription("");
    setNewStepStatus("todo");
    setNewStepDueDate("");
    setStepEscWarning(null);
  };

  const resetWorkLogEditForm = () => {
    setEditingLogId(null);
    setEditingLogType("note");
    setEditingLogMessage("");
    setEditingLogStepId("");
    setEditingLogTags("");
    setLogEscWarning(null);
  };

  const resetNewLogForm = () => {
    setNewLogMessage("");
    setNewLogStepId("");
    setNewLogType("note");
    setNewLogTags(defaultTaskTags);
    setLogEscWarning(null);
  };

  const resetTaskEditForm = () => {
    setTaskTitleInput("");
    setTaskDescriptionInput("");
    setTaskStatusInput("todo");
    setTaskPriorityInput(undefined);
    setTaskTagsInput("");
    setTaskDueDateInput("");
    setTaskFormError(null);
    setTaskEscWarning(null);
  };

  const openTaskModal = () => {
    if (!task) return;
    setTaskTitleInput(task.title);
    setTaskDescriptionInput(task.description ?? "");
    setTaskStatusInput(task.status);
    setTaskPriorityInput(task.priority);
    setTaskTagsInput(task.tags?.join(", ") ?? "");
    setTaskDueDateInput(toDateInputValue(task.dueDate));
    setTaskFormError(null);
    taskTextSnapshot.current = {
      title: task.title.trim(),
      description: (task.description ?? "").trim(),
      tags: (task.tags?.join(", ") ?? "").trim(),
    };
    setTaskEscWarning(null);
    setIsTaskModalOpen(true);
  };

  function closeTaskModal() {
    resetTaskEditForm();
    setIsTaskModalOpen(false);
  }

  // ============================================================================
  // Form Handlers - Task Edit
  // ============================================================================
  const handleTaskEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!task) return;
    const trimmedTitle = taskTitleInput.trim();
    if (!trimmedTitle) {
      setTaskFormError("Il titolo è obbligatorio.");
      return;
    }
    setIsTaskSaving(true);
    setTaskFormError(null);
    try {
      const trimmedDescription = taskDescriptionInput.trim();
      const tags =
        taskTagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean) ?? [];
      // Store due dates at UTC midnight to keep calendar math consistent across timezones.
      // If we stored local time, a due date of "Jan 15" in Tokyo (UTC+9) would
      // serialize to "Jan 14 15:00 UTC" and display as "Jan 14" in Los Angeles (UTC-8).
      // Using UTC midnight ("Jan 15 00:00 UTC") ensures "Jan 15" displays everywhere.
      const dueDateIso = taskDueDateInput
        ? new Date(`${taskDueDateInput}T00:00:00.000Z`).toISOString()
        : undefined;
      await updateTask(task.id, {
        title: trimmedTitle,
        description: trimmedDescription || undefined,
        status: taskStatusInput,
        priority: taskPriorityInput,
        tags: tags.length > 0 ? tags : undefined,
        dueDate: dueDateIso,
      });
      closeTaskModal();
    } catch (error) {
      console.error(error);
      setTaskFormError("Errore durante il salvataggio del task.");
    } finally {
      setIsTaskSaving(false);
    }
  };

  // ============================================================================
  // Effects - Cleanup and Esc Warning System
  // ============================================================================
  // Close modal if edited entity is deleted elsewhere
  useEffect(() => {
    if (editingStepId && !taskSteps.some((step) => step.id === editingStepId)) {
      resetStepEditForm();
      setIsStepModalOpen(false);
    }
  }, [editingStepId, taskSteps]);

  useEffect(() => {
    if (!isEditingStep) return;
    const maxOrder = Math.max(1, editingStepOrderOptions.length || 1);
    setEditingStepOrder((current) => Math.min(Math.max(current, 1), maxOrder));
  }, [isEditingStep, editingStepOrderOptions.length]);

  useEffect(() => {
    if (editingLogId && !taskLogs.some((log) => log.id === editingLogId)) {
      resetWorkLogEditForm();
      setIsLogModalOpen(false);
    }
  }, [editingLogId, taskLogs]);

  useEffect(() => {
    if (!task) {
      resetTaskEditForm();
      setIsTaskModalOpen(false);
    }
  }, [task]);

  useEffect(() => {
    if (!newLogTags && defaultTaskTags) {
      setNewLogTags(defaultTaskTags);
    }
  }, [defaultTaskTags, newLogTags]);

  useEffect(() => {
    if (!isTimerForTask) return;
    setTimerStepId(timerState.stepId ?? "");
  }, [isTimerForTask, timerState.stepId]);

  // Esc key handler for task modal with unsaved change detection.
  // Compares current input values against snapshot taken at modal open.
  // Only shows warning if text fields have been modified.
  useEffect(() => {
    if (!isTaskModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const snapshot = taskTextSnapshot.current;
      const hasTextChanges =
        taskTitleInput.trim() !== snapshot.title ||
        taskDescriptionInput.trim() !== snapshot.description ||
        taskTagsInput.trim() !== snapshot.tags;
      if (!hasTextChanges && !isTaskSaving) {
        event.preventDefault();
        closeTaskModal();
      } else if (hasTextChanges) {
        setTaskEscWarning("Non puoi chiudere la finestra, ci sono modifiche non salvate.");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isTaskModalOpen,
    taskTitleInput,
    taskDescriptionInput,
    taskTagsInput,
    isTaskSaving,
    closeTaskModal,
  ]);

  useEffect(() => {
    if (!isTaskModalOpen || !taskEscWarning) return;
    const snapshot = taskTextSnapshot.current;
    const hasTextChanges =
      taskTitleInput.trim() !== snapshot.title ||
      taskDescriptionInput.trim() !== snapshot.description ||
      taskTagsInput.trim() !== snapshot.tags;
    if (!hasTextChanges) {
      setTaskEscWarning(null);
    }
  }, [isTaskModalOpen, taskEscWarning, taskTitleInput, taskDescriptionInput, taskTagsInput]);

  useEffect(() => {
    if (!isStepModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const snapshot = stepTextSnapshot.current;
      const currentTitle = (isEditingStep ? editingStepTitle : newStepTitle).trim();
      const currentDescription = (
        isEditingStep ? editingStepDescription : newStepDescription
      ).trim();
      const hasTextChanges =
        currentTitle !== snapshot.title || currentDescription !== snapshot.description;
      if (!hasTextChanges) {
        event.preventDefault();
        closeStepModal();
      } else if (hasTextChanges) {
        setStepEscWarning("Non puoi chiudere la finestra, ci sono modifiche non salvate.");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isStepModalOpen,
    isEditingStep,
    editingStepTitle,
    editingStepDescription,
    newStepTitle,
    newStepDescription,
    closeStepModal,
  ]);

  useEffect(() => {
    if (!isStepModalOpen || !stepEscWarning) return;
    const snapshot = stepTextSnapshot.current;
    const currentTitle = (isEditingStep ? editingStepTitle : newStepTitle).trim();
    const currentDescription = (
      isEditingStep ? editingStepDescription : newStepDescription
    ).trim();
    const hasTextChanges =
      currentTitle !== snapshot.title || currentDescription !== snapshot.description;
    if (!hasTextChanges) {
      setStepEscWarning(null);
    }
  }, [
    isStepModalOpen,
    stepEscWarning,
    isEditingStep,
    editingStepTitle,
    editingStepDescription,
    newStepTitle,
    newStepDescription,
  ]);

  useEffect(() => {
    if (!isLogModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const snapshot = logTextSnapshot.current;
      const currentMessage = (isEditingLog ? editingLogMessage : newLogMessage).trim();
      const currentTags = (isEditingLog ? editingLogTags : newLogTags).trim();
      const hasTextChanges = currentMessage !== snapshot.message || currentTags !== snapshot.tags;
      if (!hasTextChanges) {
        event.preventDefault();
        closeLogModal();
      } else if (hasTextChanges) {
        setLogEscWarning("Non puoi chiudere la finestra, ci sono modifiche non salvate.");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isLogModalOpen,
    isEditingLog,
    editingLogMessage,
    editingLogTags,
    newLogMessage,
    newLogTags,
    closeLogModal,
  ]);

  useEffect(() => {
    if (!isLogModalOpen || !logEscWarning) return;
    const snapshot = logTextSnapshot.current;
    const currentMessage = (isEditingLog ? editingLogMessage : newLogMessage).trim();
    const currentTags = (isEditingLog ? editingLogTags : newLogTags).trim();
    const hasTextChanges = currentMessage !== snapshot.message || currentTags !== snapshot.tags;
    if (!hasTextChanges) {
      setLogEscWarning(null);
    }
  }, [
    isLogModalOpen,
    logEscWarning,
    isEditingLog,
    editingLogMessage,
    editingLogTags,
    newLogMessage,
    newLogTags,
  ]);

  if (!isHydrated) {
    return (
      <AuthGate>
        <main className="mx-auto max-w-4xl p-6">
          <p className="text-slate-600">Caricamento task...</p>
        </main>
      </AuthGate>
    );
  }

  if (!task) {
    return (
      <AuthGate>
        <main className="mx-auto max-w-4xl p-6">
          <p className="text-slate-600">Task non trovata.</p>
        </main>
      </AuthGate>
    );
  }

  // ============================================================================
  // Form Handlers - Steps
  // ============================================================================
  const handleAddStep = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newStepTitle.trim()) return;

    const parentId = newStepParentId || undefined;
    const dueDateIso = newStepDueDate
      ? new Date(`${newStepDueDate}T00:00:00.000Z`).toISOString()
      : undefined;
    // Step order is scoped to siblings, so derive the next slot from the same parent.
    const siblingOrders = taskSteps
      .filter((step) => step.parentStepId === parentId)
      .map((step) => step.order);
    const nextOrder = siblingOrders.length > 0 ? Math.max(...siblingOrders) + 1 : 1;

    await createStep({
      taskId: task.id,
      parentStepId: parentId,
      title: newStepTitle.trim(),
      description: newStepDescription.trim() || undefined,
      status: newStepStatus,
      order: nextOrder,
      dueDate: dueDateIso,
    });

    resetNewStepForm();
    setIsStepModalOpen(false);
  };

  function closeStepModal() {
    resetStepEditForm();
    resetNewStepForm();
    setIsStepModalOpen(false);
  }

  const openNewStepModal = () => {
    resetStepEditForm();
    resetNewStepForm();
    stepTextSnapshot.current = { title: "", description: "" };
    setStepEscWarning(null);
    setIsStepModalOpen(true);
  };

  const startEditingStep = (stepId: string) => {
    const step = taskSteps.find((candidate) => candidate.id === stepId);
    if (!step) return;
    setEditingStepId(stepId);
    setEditingStepTitle(step.title);
    setEditingStepDescription(step.description ?? "");
    setEditingStepStatus(step.status);
    setEditingStepDueDate(toDateInputValue(step.dueDate));
    setEditingStepParentId(step.parentStepId ?? "");
    setEditingStepOriginalParentId(step.parentStepId ?? "");
    setEditingStepOrder(step.order);
    stepTextSnapshot.current = {
      title: step.title.trim(),
      description: (step.description ?? "").trim(),
    };
    setStepEscWarning(null);
    setIsStepModalOpen(true);
  };

  const handleEditStepSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingStepId || !editingStepTitle.trim()) return;

    const nextParentId = editingStepParentId || undefined;
    const parentChanged = editingStepOriginalParentId !== (nextParentId ?? "");
    const siblingSteps = taskSteps
      .filter((step) => step.parentStepId === nextParentId && step.id !== editingStepId)
      .sort((first, second) => first.order - second.order);
    const maxOrder = siblingSteps.length + 1;
    const nextOrder = Math.min(Math.max(editingStepOrder, 1), maxOrder);
    const updatePayload: Partial<Step> = {
      title: editingStepTitle.trim(),
      description: editingStepDescription.trim() || undefined,
      status: editingStepStatus,
      parentStepId: nextParentId,
      order: nextOrder,
    };
    const dueDateIso = editingStepDueDate
      ? new Date(`${editingStepDueDate}T00:00:00.000Z`).toISOString()
      : undefined;
    updatePayload.dueDate = dueDateIso;
    await updateStep(editingStepId, updatePayload);
    const orderUpdates: Array<{ id: string; order: number }> = [];
    const reorderedIds = siblingSteps.map((step) => step.id);
    reorderedIds.splice(nextOrder - 1, 0, editingStepId);
    reorderedIds.forEach((id, index) => {
      if (id === editingStepId) return;
      const step = taskSteps.find((candidate) => candidate.id === id);
      const targetOrder = index + 1;
      if (step && step.order !== targetOrder) {
        orderUpdates.push({ id: step.id, order: targetOrder });
      }
    });
    if (parentChanged) {
      const previousParentId = editingStepOriginalParentId || undefined;
      const previousSiblings = taskSteps
        .filter((step) => step.parentStepId === previousParentId && step.id !== editingStepId)
        .sort((first, second) => first.order - second.order);
      previousSiblings.forEach((step, index) => {
        const targetOrder = index + 1;
        if (step.order !== targetOrder) {
          orderUpdates.push({ id: step.id, order: targetOrder });
        }
      });
    }
    if (orderUpdates.length > 0) {
      await updateStepOrders(orderUpdates);
    }
    resetStepEditForm();
    setIsStepModalOpen(false);
  };

  // ============================================================================
  // Form Handlers - Work Logs
  // ============================================================================
  const handleAddWorkLog = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newLogMessage.trim()) return;
    const tags = parseTagsInput(newLogTags);

    await createWorkLog({
      taskId: task.id,
      stepId: newLogStepId || undefined,
      message: newLogMessage.trim(),
      tags: tags.length > 0 ? tags : [],
      type: newLogType,
      timestamp: new Date().toISOString(),
    });

    resetNewLogForm();
    setIsLogModalOpen(false);
  };

  const openNewLogModal = () => {
    resetWorkLogEditForm();
    resetNewLogForm();
    logTextSnapshot.current = {
      message: "",
      tags: (defaultTaskTags ?? "").trim(),
    };
    setLogEscWarning(null);
    setIsLogModalOpen(true);
  };

  function closeLogModal() {
    resetWorkLogEditForm();
    resetNewLogForm();
    setIsLogModalOpen(false);
  }

  const startEditingLog = (logId: string) => {
    const log = taskLogs.find((candidate) => candidate.id === logId);
    if (!log) return;
    setEditingLogId(logId);
    setEditingLogType(log.type);
    setEditingLogMessage(log.message ?? "");
    setEditingLogStepId(log.stepId ?? "");
    setEditingLogTags(log.tags.join(", "));
    logTextSnapshot.current = {
      message: (log.message ?? "").trim(),
      tags: log.tags.join(", ").trim(),
    };
    setLogEscWarning(null);
    setIsLogModalOpen(true);
  };

  const handleEditLogSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingLogId) return;
    const tags = parseTagsInput(editingLogTags);
    await updateWorkLog(editingLogId, {
      type: editingLogType,
      message: editingLogMessage.trim() || undefined,
      stepId: editingLogStepId || undefined,
      tags,
    });
    resetWorkLogEditForm();
    setIsLogModalOpen(false);
  };

  const handleDeleteLog = async (logId: string) => {
    if (!confirm("Eliminare questo WorkLog?")) return;
    await deleteWorkLog(logId);
    if (editingLogId === logId) {
      resetWorkLogEditForm();
    }
  };

  // ============================================================================
  // Handlers - Timer
  // ============================================================================
  const handleStartTimer = () => {
    if (!task) return;
    setTimerWarning(null);
    const step = orderedSteps.find((candidate) => candidate.id === timerStepId);
    const result = startTimer({
      taskId: task.id,
      taskTitle: task.title,
      stepId: step?.id,
      stepTitle: step?.title,
    });
    if (!result.ok) {
      setTimerWarning(result.error);
    }
  };

  const handleStopTimer = async () => {
    setTimerWarning(null);
    if (!isTimerRunning) {
      setTimerWarning("Nessun timer attivo da fermare.");
      return;
    }
    if (!task || !isTimerForTask) {
      setTimerWarning("Il timer attivo è su un altro task.");
      return;
    }
    setIsTimerSaving(true);
    try {
      const result = stopTimer();
      if (!result) {
        setTimerWarning("Nessun timer attivo da fermare.");
        return;
      }
      await createWorkLog({
        taskId: result.taskId,
        stepId: result.stepId,
        tags: task.tags ?? [],
        type: "stop",
        timestamp: result.stoppedAt,
        durationMinutes: result.durationMinutes,
      });
    } catch (error) {
      console.error(error);
      setTimerWarning("Errore durante il salvataggio del timer.");
    } finally {
      setIsTimerSaving(false);
    }
  };

  return (
    <AuthGate>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:border-slate-400"
        >
          ← Torna alla Home
        </Link>
        <Link
          href="/tasks"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:border-slate-400"
        >
          ← Lista Tasks
        </Link>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Task</p>
            <h1 className="text-3xl font-bold text-slate-900">{task.title}</h1>
            {task.description ? (
              <p className="mt-2 whitespace-pre-wrap text-slate-600">{task.description}</p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={task.status} />
            <select
              value={task.status}
              onChange={(event) =>
                updateTask(task.id, { status: event.target.value as TaskStatus })
              }
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {TASK_STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value.replace("_", " ")}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="text-xs font-semibold text-slate-600 transition hover:text-slate-900"
              onClick={openTaskModal}
            >
              Modifica Task
            </button>
            <button
              type="button"
              className="text-xs text-rose-600 hover:text-rose-700"
              onClick={async () => {
                if (confirm("Eliminare definitivamente questo task?")) {
                  await deleteTask(task.id);
                  router.push("/tasks");
                }
              }}
            >
              Elimina Task
            </button>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
          <div>
            <dt className="font-medium text-slate-500">Progress</dt>
            <dd className="text-lg font-semibold text-slate-900">
              {completedSteps}/{totalSteps}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Priority</dt>
            <dd className="capitalize">{task.priority ?? "none"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Due date</dt>
            <dd>{formatDate(task.dueDate)}</dd>
          </div>
        </dl>
        {task.tags && task.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
        {isTaskModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-8">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Task</p>
                  <h2 className="text-2xl font-semibold text-slate-900">Modifica Task</h2>
                </div>
                <button
                  className="text-slate-500 transition hover:text-slate-900"
                  onClick={closeTaskModal}
                  disabled={isTaskSaving}
                >
                  X
                </button>
              </div>
              <form className="mt-6 space-y-4" onSubmit={handleTaskEditSubmit}>
                {taskEscWarning ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {taskEscWarning}
                  </p>
                ) : null}
                <div>
                  <label className="text-sm font-medium text-slate-600">Titolo *</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={taskTitleInput}
                    onChange={(event) => setTaskTitleInput(event.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Descrizione</label>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    rows={3}
                    value={taskDescriptionInput}
                    onChange={(event) => setTaskDescriptionInput(event.target.value)}
                    placeholder="Dettagli o note aggiuntive"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-600">Status</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={taskStatusInput}
                      onChange={(event) => setTaskStatusInput(event.target.value as TaskStatus)}
                    >
                      {TASK_STATUS_OPTIONS.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {statusOption.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Priority</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={taskPriorityInput ?? ""}
                      onChange={(event) =>
                        setTaskPriorityInput(
                          event.target.value
                            ? (event.target.value as Task["priority"])
                            : undefined,
                        )
                      }
                    >
                      <option value="">Nessuna</option>
                      {TASK_PRIORITY_OPTIONS.map((priorityOption) => (
                        <option key={priorityOption} value={priorityOption}>
                          {priorityOption}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-600">Due date</label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={taskDueDateInput}
                      onChange={(event) => setTaskDueDateInput(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Tags (comma)</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={taskTagsInput}
                      onChange={(event) => setTaskTagsInput(event.target.value)}
                      placeholder="design,backend"
                    />
                  </div>
                </div>
                {taskFormError ? <p className="text-sm text-rose-600">{taskFormError}</p> : null}
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                    onClick={closeTaskModal}
                    disabled={isTaskSaving}
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={isTaskSaving}
                  >
                    {isTaskSaving ? "Salvataggio..." : "Salva Task"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Steps</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
              <span>Filtro stato</span>
              <select
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                value={stepStatusFilter}
                onChange={(event) =>
                  setStepStatusFilter(event.target.value as "all" | StepStatus)
                }
              >
                <option value="all">Tutti</option>
                {STEP_STATUS_OPTIONS.map((statusOption) => (
                  <option key={statusOption} value={statusOption}>
                    {STEP_STATUS_LABELS[statusOption]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                onClick={openNewStepModal}
              >
                + Nuovo Step
              </button>
            </div>
          </div>
          {taskSteps.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Ancora nessuno step, aggiungine uno.</p>
          ) : filteredStepTree.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Nessuno step con lo stato selezionato.
            </p>
          ) : (
            <div className="mt-4">
              <StepTree
                nodes={filteredStepTree}
                onStatusChange={(id, newStatus) => updateStep(id, { status: newStatus })}
                onDelete={(id) => {
                  if (confirm("Eliminare questo step e i suoi substep?")) {
                    void deleteStep(id);
                  }
                }}
                onEdit={startEditingStep}
              />
            </div>
          )}

          {isStepModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-8">
              <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Step</p>
                    <h3 className="text-2xl font-semibold text-slate-900">
                      {isEditingStep ? "Modifica Step" : "Nuovo Step"}
                    </h3>
                  </div>
                  <button
                    className="text-slate-500 transition hover:text-slate-900"
                    onClick={closeStepModal}
                  >
                    X
                  </button>
                </div>
                <form
                  className="mt-6 space-y-4"
                  onSubmit={isEditingStep ? handleEditStepSubmit : handleAddStep}
                >
                  {stepEscWarning ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {stepEscWarning}
                    </p>
                  ) : null}
                  <div>
                    <label className="text-sm font-medium text-slate-700">Titolo *</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={isEditingStep ? editingStepTitle : newStepTitle}
                      onChange={(event) =>
                        isEditingStep
                          ? setEditingStepTitle(event.target.value)
                          : setNewStepTitle(event.target.value)
                      }
                      placeholder="Titolo step"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Descrizione</label>
                    <textarea
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      rows={3}
                      value={isEditingStep ? editingStepDescription : newStepDescription}
                      onChange={(event) =>
                        isEditingStep
                          ? setEditingStepDescription(event.target.value)
                          : setNewStepDescription(event.target.value)
                      }
                      placeholder="Descrizione step"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Due date</label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={isEditingStep ? editingStepDueDate : newStepDueDate}
                      onChange={(event) =>
                        isEditingStep
                          ? setEditingStepDueDate(event.target.value)
                          : setNewStepDueDate(event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Step padre</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={isEditingStep ? editingStepParentId : newStepParentId}
                      onChange={(event) =>
                        isEditingStep
                          ? setEditingStepParentId(event.target.value)
                          : setNewStepParentId(event.target.value)
                      }
                    >
                      <option value="">Step principale</option>
                      {orderedSteps
                        .filter((step) => {
                          if (!isEditingStep) return true;
                          if (step.id === editingStepId) return false;
                          return !editingStepDescendantIds.has(step.id);
                        })
                        .map((step) => (
                          <option key={step.id} value={step.id}>
                            Substep di #{step.order}: {step.title}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Status</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={isEditingStep ? editingStepStatus : newStepStatus}
                      onChange={(event) =>
                        isEditingStep
                          ? setEditingStepStatus(event.target.value as StepStatus)
                          : setNewStepStatus(event.target.value as StepStatus)
                      }
                    >
                      {Object.entries(STEP_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isEditingStep ? (
                    <div>
                      <label className="text-sm font-medium text-slate-700">Priorita</label>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        value={editingStepOrder}
                        onChange={(event) => setEditingStepOrder(Number(event.target.value))}
                      >
                        {editingStepOrderOptions.map((order) => (
                          <option key={order} value={order}>
                            {order}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                      onClick={closeStepModal}
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                      {isEditingStep ? "Salva modifiche" : "Salva Step"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Timer</p>
                <h3 className="text-lg font-semibold text-slate-900">Start/Stop</h3>
              </div>
              {isTimerForTask ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {formatElapsed(elapsedSeconds)}
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Step</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={timerStepId}
                  onChange={(event) => setTimerStepId(event.target.value)}
                  disabled={isTimerRunning}
                >
                  <option value="">Nessun step</option>
                  {orderedSteps.map((step) => (
                    <option key={step.id} value={step.id}>
                      #{step.order} - {step.title}
                    </option>
                  ))}
                </select>
              </div>
              {isTimerForTask ? (
                <p className="text-xs text-slate-500">
                  In corso dalle {new Date(timerState.startedAt).toLocaleTimeString()}.
                </p>
              ) : null}
              {isTimerForOtherTask ? (
                <p className="text-xs text-amber-700">
                  C'è già un timer attivo su un altro task. Fermalo prima di avviarne uno nuovo.
                </p>
              ) : null}
              {timerWarning ? (
                <p className="text-xs text-rose-600">{timerWarning}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  onClick={handleStartTimer}
                  disabled={isTimerRunning || isTimerSaving}
                >
                  Avvia timer
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                  onClick={handleStopTimer}
                  disabled={!isTimerForTask || isTimerSaving}
                >
                  {isTimerSaving ? "Salvataggio..." : "Stop timer"}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Work Log</h2>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
              onClick={openNewLogModal}
            >
              + Nuovo Log
            </button>
          </div>
          {orderedLogs.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Nessun log ancora, registra una nota o sessione di lavoro.
            </p>
          ) : (
            <ol className="mt-4 space-y-4">
              {orderedLogs.map((log) => (
                <li key={log.id} className="rounded-lg border border-slate-100 p-4">
                  {log.tags.length > 0 ? (
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      {log.tags.slice(0, logTagLimit).map((tag) => (
                        <span
                          key={`${log.id}-tag-${tag}`}
                          className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600"
                        >
                          #{tag}
                        </span>
                      ))}
                      {log.tags.length > logTagLimit ? (
                        <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-500">
                          +{log.tags.length - logTagLimit}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium">{WORKLOG_TYPE_LABELS[log.type]}</span>
                    <time>{new Date(log.timestamp).toLocaleString()}</time>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{log.message ?? "-"}</p>
                  {log.stepId ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Riferito allo step:{" "}
                      {taskSteps.find((step) => step.id === log.stepId)?.title ?? log.stepId}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold">
                    <button
                      type="button"
                      className="text-sky-700 hover:text-sky-900"
                      onClick={() => startEditingLog(log.id)}
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      className="text-rose-600 hover:text-rose-700"
                      onClick={() => handleDeleteLog(log.id)}
                    >
                      Elimina
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {isLogModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-8">
              <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Work Log</p>
                    <h3 className="text-2xl font-semibold text-slate-900">
                      {isEditingLog ? "Modifica Work Log" : "Nuovo Work Log"}
                    </h3>
                  </div>
                  <button
                    className="text-slate-500 transition hover:text-slate-900"
                    onClick={closeLogModal}
                  >
                    X
                  </button>
                </div>
                <form
                  className="mt-6 space-y-4"
                  onSubmit={isEditingLog ? handleEditLogSubmit : handleAddWorkLog}
                >
                  {logEscWarning ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {logEscWarning}
                    </p>
                  ) : null}
                  <div>
                    <label className="text-sm font-medium text-slate-700">Tipo</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={isEditingLog ? editingLogType : newLogType}
                      onChange={(event) =>
                        isEditingLog
                          ? setEditingLogType(event.target.value as WorkLogType)
                          : setNewLogType(event.target.value as WorkLogType)
                      }
                    >
                      {Object.entries(WORKLOG_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Messaggio</label>
                    <textarea
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      rows={3}
                      value={isEditingLog ? editingLogMessage : newLogMessage}
                      onChange={(event) =>
                        isEditingLog
                          ? setEditingLogMessage(event.target.value)
                          : setNewLogMessage(event.target.value)
                      }
                      placeholder="Descrivi cosa hai fatto..."
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Step</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={isEditingLog ? editingLogStepId : newLogStepId}
                      onChange={(event) =>
                        isEditingLog
                          ? setEditingLogStepId(event.target.value)
                          : setNewLogStepId(event.target.value)
                      }
                    >
                      <option value="">Nessun step</option>
                      {orderedSteps.map((step) => (
                        <option key={step.id} value={step.id}>
                          #{step.order} - {step.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Tag (comma)</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={isEditingLog ? editingLogTags : newLogTags}
                      onChange={(event) =>
                        isEditingLog
                          ? setEditingLogTags(event.target.value)
                          : setNewLogTags(event.target.value)
                      }
                      placeholder="cliente,progetto,attivita"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Usa i tag per raggruppare le attivita (es: cliente, progetto, tipo lavoro).
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                      onClick={closeLogModal}
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                      {isEditingLog ? "Salva Work Log" : "Registra Log"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
    </AuthGate>
  );
};

export default TaskDetailPage;
