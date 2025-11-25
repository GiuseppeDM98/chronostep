"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
}: {
  nodes: StepNode[];
  onStatusChange: (id: string, status: StepStatus) => void;
  onDelete: (id: string) => void;
}) => (
  <ul className="space-y-3">
    {nodes.map((node) => (
      <li key={node.id} className="rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-slate-900">{node.title}</p>
            <div className="flex items-center gap-2 text-xs text-slate-500">
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
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">#{node.order}</span>
            <button
              type="button"
              className="text-xs text-rose-600 hover:text-rose-700"
              onClick={() => onDelete(node.id)}
            >
              Elimina
            </button>
          </div>
        </div>
        {node.children.length > 0 ? (
          <div className="mt-3 border-l-2 border-slate-100 pl-4">
            <StepTree nodes={node.children} onStatusChange={onStatusChange} onDelete={onDelete} />
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
    deleteStep,
    deleteTask,
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
  const [newStepStatus, setNewStepStatus] = useState<StepStatus>("todo");

  const [newLogType, setNewLogType] = useState<WorkLogType>("note");
  const [newLogMessage, setNewLogMessage] = useState("");
  const [newLogStepId, setNewLogStepId] = useState("");

  const stepTree = useMemo(() => buildStepTree(taskSteps), [taskSteps]);

  const totalSteps = taskSteps.length;
  const completedSteps = taskSteps.filter((step) => step.status === "done").length;

  const orderedLogs = useMemo(
    () =>
      [...taskLogs].sort(
        (a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf(),
      ),
    [taskLogs],
  );

  if (!isHydrated) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-slate-600">Caricamento task...</p>
      </main>
    );
  }

  if (!task) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-slate-600">Task non trovata.</p>
      </main>
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
      status: newStepStatus,
      order: nextOrder,
    });

    setNewStepTitle("");
    setNewStepParentId("");
    setNewStepStatus("todo");
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

  return (
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
              {(["todo", "in_progress", "done", "blocked"] as TaskStatus[]).map((value) => (
                <option key={value} value={value}>
                  {value.replace("_", " ")}
                </option>
              ))}
            </select>
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
              />
            </div>
          )}

          <form className="mt-6 space-y-3" onSubmit={handleAddStep}>
            <p className="text-sm font-medium text-slate-700">Aggiungi Step</p>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Titolo step"
              value={newStepTitle}
              onChange={(event) => setNewStepTitle(event.target.value)}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={newStepParentId}
                onChange={(event) => setNewStepParentId(event.target.value)}
              >
                <option value="">Step principale</option>
                {taskSteps.map((step) => (
                  <option key={step.id} value={step.id}>
                    Substep di: {step.title}
                  </option>
                ))}
              </select>
              <select
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                  <p className="mt-2 text-sm text-slate-700">{log.message ?? "—"}</p>
                  {log.stepId ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Riferito allo step:{" "}
                      {taskSteps.find((step) => step.id === log.stepId)?.title ?? log.stepId}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

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
              {taskSteps.map((step) => (
                <option key={step.id} value={step.id}>
                  {step.title}
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
  );
};

export default TaskDetailPage;
