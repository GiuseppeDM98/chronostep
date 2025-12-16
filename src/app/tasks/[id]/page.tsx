"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "../../../components/AuthGate";
import type { Step, StepStatus, Task, TaskStatus, WorkLogType } from "../../../lib/types";
import { useTaskStore } from "../../../hooks/useTaskStore";

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
const TASK_PRIORITY_OPTIONS: Array<NonNullable<Task["priority"]>> = ["low", "medium", "high"];

const buildStepTree = (taskSteps: Step[]) => {
  const map = new Map<string, StepNode>();

  taskSteps.forEach((step) => {
    map.set(step.id, { ...step, children: [] });
  });

  const roots: StepNode[] = [];

  map.forEach((node) => {
    if (node.parentStepId && map.has(node.parentStepId)) {
      map.get(node.parentStepId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes: StepNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((child) => sortNodes(child.children));
  };

  sortNodes(roots);
  return roots;
};

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
};

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
              <p className="break-words text-sm text-slate-600">{node.description}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{STEP_STATUS_LABELS[node.status]}</span>
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

const TaskDetailPage = ({ params }: { params: { id: string } }) => {
  const router = useRouter();
  const {
    tasks,
    steps,
    workLogs,
    isHydrated,
    createStep,
    createWorkLog,
    updateStep,
    updateTask,
    updateWorkLog,
    deleteStep,
    deleteTask,
    deleteWorkLog,
  } = useTaskStore();

  const task = tasks.find((candidate) => candidate.id === params.id);
  const taskSteps = useMemo(
    () => steps.filter((step) => step.taskId === params.id),
    [steps, params.id],
  );
  const taskLogs = useMemo(
    () => workLogs.filter((log) => log.taskId === params.id),
    [workLogs, params.id],
  );

  const [newStepTitle, setNewStepTitle] = useState("");
  const [newStepParentId, setNewStepParentId] = useState("");
  const [newStepDescription, setNewStepDescription] = useState("");
  const [newStepStatus, setNewStepStatus] = useState<StepStatus>("todo");
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingStepTitle, setEditingStepTitle] = useState("");
  const [editingStepDescription, setEditingStepDescription] = useState("");
  const [editingStepStatus, setEditingStepStatus] = useState<StepStatus>("todo");

  const [newLogType, setNewLogType] = useState<WorkLogType>("note");
  const [newLogMessage, setNewLogMessage] = useState("");
  const [newLogStepId, setNewLogStepId] = useState("");
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLogType, setEditingLogType] = useState<WorkLogType>("note");
  const [editingLogMessage, setEditingLogMessage] = useState("");
  const [editingLogStepId, setEditingLogStepId] = useState("");
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [taskTitleInput, setTaskTitleInput] = useState("");
  const [taskDescriptionInput, setTaskDescriptionInput] = useState("");
  const [taskStatusInput, setTaskStatusInput] = useState<TaskStatus>("todo");
  const [taskPriorityInput, setTaskPriorityInput] = useState<Task["priority"]>();
  const [taskTagsInput, setTaskTagsInput] = useState("");
  const [taskDueDateInput, setTaskDueDateInput] = useState("");
  const [taskFormError, setTaskFormError] = useState<string | null>(null);
  const [isTaskSaving, setIsTaskSaving] = useState(false);

  const stepTree = useMemo(() => buildStepTree(taskSteps), [taskSteps]);
  const orderedSteps = useMemo(
    () => [...taskSteps].sort((first, second) => first.order - second.order),
    [taskSteps],
  );

  const totalSteps = taskSteps.length;
  const completedSteps = taskSteps.filter((step) => step.status === "done").length;

  const orderedLogs = useMemo(
    () =>
      [...taskLogs].sort(
        (a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf(),
      ),
    [taskLogs],
  );

  const resetStepEditForm = () => {
    setEditingStepId(null);
    setEditingStepTitle("");
    setEditingStepDescription("");
    setEditingStepStatus("todo");
  };

  const resetWorkLogEditForm = () => {
    setEditingLogId(null);
    setEditingLogType("note");
    setEditingLogMessage("");
    setEditingLogStepId("");
  };

  const resetTaskEditForm = () => {
    setTaskTitleInput("");
    setTaskDescriptionInput("");
    setTaskStatusInput("todo");
    setTaskPriorityInput(undefined);
    setTaskTagsInput("");
    setTaskDueDateInput("");
    setTaskFormError(null);
  };

  const startTaskEdit = () => {
    if (!task) return;
    setTaskTitleInput(task.title);
    setTaskDescriptionInput(task.description ?? "");
    setTaskStatusInput(task.status);
    setTaskPriorityInput(task.priority);
    setTaskTagsInput(task.tags?.join(", ") ?? "");
    setTaskDueDateInput(toDateInputValue(task.dueDate));
    setTaskFormError(null);
    setIsEditingTask(true);
  };

  const cancelTaskEdit = () => {
    resetTaskEditForm();
    setIsEditingTask(false);
  };

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
      cancelTaskEdit();
    } catch (error) {
      console.error(error);
      setTaskFormError("Errore durante il salvataggio del task.");
    } finally {
      setIsTaskSaving(false);
    }
  };

  useEffect(() => {
    if (editingStepId && !taskSteps.some((step) => step.id === editingStepId)) {
      resetStepEditForm();
    }
  }, [editingStepId, taskSteps]);

  useEffect(() => {
    if (editingLogId && !taskLogs.some((log) => log.id === editingLogId)) {
      resetWorkLogEditForm();
    }
  }, [editingLogId, taskLogs]);

  useEffect(() => {
    if (!task) {
      resetTaskEditForm();
      setIsEditingTask(false);
    }
  }, [task]);

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

  const handleAddStep = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newStepTitle.trim()) return;

    const parentId = newStepParentId || undefined;
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
    });

    setNewStepTitle("");
    setNewStepParentId("");
    setNewStepDescription("");
    setNewStepStatus("todo");
  };

  const startEditingStep = (stepId: string) => {
    const step = taskSteps.find((candidate) => candidate.id === stepId);
    if (!step) return;
    setEditingStepId(stepId);
    setEditingStepTitle(step.title);
    setEditingStepDescription(step.description ?? "");
    setEditingStepStatus(step.status);
  };

  const handleEditStepSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingStepId || !editingStepTitle.trim()) return;

    await updateStep(editingStepId, {
      title: editingStepTitle.trim(),
      description: editingStepDescription.trim() || undefined,
      status: editingStepStatus,
    });
    resetStepEditForm();
  };

  const handleAddWorkLog = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newLogMessage.trim()) return;

    await createWorkLog({
      taskId: task.id,
      stepId: newLogStepId || undefined,
      message: newLogMessage.trim(),
      type: newLogType,
      timestamp: new Date().toISOString(),
    });

    setNewLogMessage("");
    setNewLogStepId("");
    setNewLogType("note");
  };

  const startEditingLog = (logId: string) => {
    const log = taskLogs.find((candidate) => candidate.id === logId);
    if (!log) return;
    setEditingLogId(logId);
    setEditingLogType(log.type);
    setEditingLogMessage(log.message ?? "");
    setEditingLogStepId(log.stepId ?? "");
  };

  const handleEditLogSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingLogId) return;
    await updateWorkLog(editingLogId, {
      type: editingLogType,
      message: editingLogMessage.trim() || undefined,
      stepId: editingLogStepId || undefined,
    });
    resetWorkLogEditForm();
  };

  const handleDeleteLog = async (logId: string) => {
    if (!confirm("Eliminare questo WorkLog?")) return;
    await deleteWorkLog(logId);
    if (editingLogId === logId) {
      resetWorkLogEditForm();
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
              <p className="mt-2 text-slate-600">{task.description}</p>
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
              onClick={() => (isEditingTask ? cancelTaskEdit() : startTaskEdit())}
            >
              {isEditingTask ? "Chiudi modifica" : "Modifica Task"}
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
        {isEditingTask ? (
          <form
            className="mt-6 space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-5"
            onSubmit={handleTaskEditSubmit}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Modifica Task</p>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-700"
                onClick={cancelTaskEdit}
                disabled={isTaskSaving}
              >
                Annulla
              </button>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Titolo *</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={taskTitleInput}
                onChange={(event) => setTaskTitleInput(event.target.value)}
                required
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
                <label className="text-sm font-medium text-slate-600">Priorità</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={taskPriorityInput ?? ""}
                  onChange={(event) =>
                    setTaskPriorityInput(
                      event.target.value ? (event.target.value as Task["priority"]) : undefined,
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
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isTaskSaving}
            >
              {isTaskSaving ? "Salvataggio..." : "Salva Task"}
            </button>
          </form>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Steps</h2>
          {taskSteps.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Nessun passo ancora, aggiungine uno.</p>
          ) : (
            <div className="mt-4">
              <StepTree
                nodes={stepTree}
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

          {editingStepId ? (
            <form
              className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              onSubmit={handleEditStepSubmit}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Modifica step esistente</p>
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-slate-700"
                  onClick={resetStepEditForm}
                >
                  Annulla
                </button>
              </div>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={editingStepTitle}
                onChange={(event) => setEditingStepTitle(event.target.value)}
                placeholder="Titolo step"
              />
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                rows={3}
                value={editingStepDescription}
                onChange={(event) => setEditingStepDescription(event.target.value)}
                placeholder="Descrizione step"
              />
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={editingStepStatus}
                onChange={(event) => setEditingStepStatus(event.target.value as StepStatus)}
              >
                {Object.entries(STEP_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Salva modifiche
              </button>
            </form>
          ) : null}

          <form className="mt-6 space-y-3" onSubmit={handleAddStep}>
            <p className="text-sm font-medium text-slate-700">Aggiungi Step</p>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Titolo step"
              value={newStepTitle}
              onChange={(event) => setNewStepTitle(event.target.value)}
            />
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Descrizione (facoltativa)"
              rows={3}
              value={newStepDescription}
              onChange={(event) => setNewStepDescription(event.target.value)}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:flex-1"
                value={newStepParentId}
                onChange={(event) => setNewStepParentId(event.target.value)}
              >
                <option value="">Step principale</option>
                {orderedSteps.map((step) => (
                  <option key={step.id} value={step.id}>
                    Substep di #{step.order}: {step.title}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:flex-1"
                value={newStepStatus}
                onChange={(event) => setNewStepStatus(event.target.value as StepStatus)}
              >
                {Object.entries(STEP_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Salva Step
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Work Log</h2>
          {orderedLogs.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Nessun log ancora, registra una nota o sessione di lavoro.
            </p>
          ) : (
            <ol className="mt-4 space-y-4">
              {orderedLogs.map((log) => (
                <li key={log.id} className="rounded-lg border border-slate-100 p-4">
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

          {editingLogId ? (
            <form
              className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              onSubmit={handleEditLogSubmit}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Modifica WorkLog</p>
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-slate-700"
                  onClick={resetWorkLogEditForm}
                >
                  Annulla
                </button>
              </div>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={editingLogType}
                onChange={(event) => setEditingLogType(event.target.value as WorkLogType)}
              >
                {Object.entries(WORKLOG_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                rows={3}
                value={editingLogMessage}
                onChange={(event) => setEditingLogMessage(event.target.value)}
                placeholder="Aggiorna la nota"
              />
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={editingLogStepId}
                onChange={(event) => setEditingLogStepId(event.target.value)}
              >
                <option value="">Nessun step</option>
                {orderedSteps.map((step) => (
                  <option key={step.id} value={step.id}>
                    #{step.order} - {step.title}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Salva WorkLog
              </button>
            </form>
          ) : null}

          <form className="mt-6 space-y-3" onSubmit={handleAddWorkLog}>
            <p className="text-sm font-medium text-slate-700">Aggiungi Log</p>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={newLogType}
              onChange={(event) => setNewLogType(event.target.value as WorkLogType)}
            >
              {Object.entries(WORKLOG_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Descrivi cosa hai fatto..."
              rows={3}
              value={newLogMessage}
              onChange={(event) => setNewLogMessage(event.target.value)}
            />
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={newLogStepId}
              onChange={(event) => setNewLogStepId(event.target.value)}
            >
              <option value="">Nessun step</option>
              {orderedSteps.map((step) => (
                <option key={step.id} value={step.id}>
                  #{step.order} - {step.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Registra Log
            </button>
          </form>
        </div>
      </section>
    </main>
    </AuthGate>
  );
};

export default TaskDetailPage;
