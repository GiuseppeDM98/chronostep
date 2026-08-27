/**
 * Task detail — the one screen where structure is manipulated.
 *
 * The step tree is rendered flat with a numbering gutter rather than as nested `<ul>`s: at three
 * levels the nested version spends most of its width on indentation, and this screen has to hold a
 * task with no steps at all as comfortably as one with eight across three levels. The numbering
 * (1, 2, 2.1) is what carries depth.
 *
 * Status filtering keeps ancestors visible, dimmed. The previous version lifted matching substeps
 * to the top level and dropped their parents, which produced two rows both labelled "#1" and no way
 * to tell what they belonged to.
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import AppShell from "../../../components/AppShell";
import Dialog from "../../../components/Dialog";
import Verdict from "../../../components/Verdict";
import {
  Button,
  DateInput,
  ErrorNote,
  Field,
  Select,
  StatusChip,
  TagList,
  TextArea,
  TextInput,
  STEP_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from "../../../components/controls";
import { useAsyncAction } from "../../../hooks/useAsyncAction";
import { useNow } from "../../../hooks/useNow";
import { useTaskStore } from "../../../hooks/useTaskStore";
import { useTimer } from "../../../hooks/useTimer";
import {
  formatDueDate,
  formatInstantTime,
  formatMinutes,
  instantDayKey,
  todayKey,
} from "../../../lib/dates";
import { buildTaskActivity } from "../../../lib/insights";
import { readTask } from "../../../lib/verdicts";
import type { Step, StepStatus, Task, TaskStatus, WorkLogType } from "../../../lib/types";

type StepNode = Step & { children: StepNode[] };
type FlatStep = { step: Step; depth: number; numbering: string };

const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const STEP_STATUSES: StepStatus[] = ["todo", "in_progress", "done"];
const WORKLOG_TYPES: Array<{ value: WorkLogType; label: string }> = [
  { value: "note", label: "Nota" },
  { value: "start", label: "Inizio" },
  { value: "stop", label: "Fine" },
];
const PRIORITIES: Array<{ value: NonNullable<Task["priority"]>; label: string }> = [
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Bassa" },
];

const buildStepTree = (steps: Step[]): StepNode[] => {
  const byId = new Map<string, StepNode>();
  steps.forEach((step) => byId.set(step.id, { ...step, children: [] }));

  const roots: StepNode[] = [];
  byId.forEach((node) => {
    const parent = node.parentStepId ? byId.get(node.parentStepId) : undefined;
    // A parent outside this task's snapshot (or a self-reference) leaves the node at the root
    // rather than dropping it: an unreachable step is worse than a misplaced one.
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  });

  const sort = (nodes: StepNode[]) => {
    nodes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
};

const flattenTree = (nodes: StepNode[], prefix = "", depth = 0): FlatStep[] =>
  nodes.flatMap((node, index) => {
    const numbering = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    return [{ step: node, depth, numbering }, ...flattenTree(node.children, numbering, depth + 1)];
  });

/** Ids of every descendant of `stepId`, so a step can never be reparented under itself. */
const descendantsOf = (nodes: StepNode[], stepId: string): Set<string> => {
  const found = new Set<string>();
  const walk = (node: StepNode, insideTarget: boolean) => {
    const collecting = insideTarget || node.id === stepId;
    node.children.forEach((child) => {
      if (collecting) found.add(child.id);
      walk(child, collecting);
    });
  };
  nodes.forEach((node) => walk(node, false));
  return found;
};

const emptyStepForm = {
  title: "",
  description: "",
  status: "todo" as StepStatus,
  dueDate: "",
  parentStepId: "",
  order: 1,
};

const emptyLogForm = {
  type: "note" as WorkLogType,
  message: "",
  stepId: "",
  tags: "",
};

const TaskDetailPage = ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = use(params);
  const router = useRouter();
  const now = useNow();

  const {
    tasks,
    steps,
    workLogs,
    isHydrated,
    isReadOnly,
    loadError,
    createStep,
    createWorkLog,
    updateStep,
    updateStepOrders,
    updateTask,
    updateWorkLog,
    deleteStep,
    deleteTask,
    deleteWorkLog,
    refresh,
  } = useTaskStore();
  const { timerState, elapsedMinutes, startTimer, clearTimer } = useTimer();

  const task = tasks.find((candidate) => candidate.id === id);
  const taskSteps = useMemo(() => steps.filter((step) => step.taskId === id), [steps, id]);
  const taskLogs = useMemo(() => workLogs.filter((log) => log.taskId === id), [workLogs, id]);

  const [statusFilter, setStatusFilter] = useState<"tutti" | StepStatus>("tutti");
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    status: "todo" as TaskStatus,
    priority: "" as "" | NonNullable<Task["priority"]>,
    tags: "",
    dueDate: "",
  });
  const [stepDialog, setStepDialog] = useState<{ mode: "create" | "edit"; stepId?: string } | null>(
    null,
  );
  const [stepForm, setStepForm] = useState(emptyStepForm);
  const [logDialog, setLogDialog] = useState<{ mode: "create" | "edit"; logId?: string } | null>(
    null,
  );
  const [logForm, setLogForm] = useState(emptyLogForm);
  const [pendingStepDelete, setPendingStepDelete] = useState<Step | null>(null);
  const [pendingLogDelete, setPendingLogDelete] = useState<string | null>(null);
  const [isTaskDeleteOpen, setIsTaskDeleteOpen] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const saveTask = useAsyncAction();
  const saveStep = useAsyncAction();
  const saveLog = useAsyncAction();
  const removeStep = useAsyncAction();
  const removeLog = useAsyncAction();
  const removeTask = useAsyncAction();
  const changeStatus = useAsyncAction();

  const tree = useMemo(() => buildStepTree(taskSteps), [taskSteps]);
  const flatSteps = useMemo(() => flattenTree(tree), [tree]);

  // Filtering keeps a matching step's ancestors on screen so its place in the tree survives.
  const visibleSteps = useMemo(() => {
    if (statusFilter === "tutti") return flatSteps.map((row) => ({ ...row, dimmed: false }));
    const matching = new Set(
      flatSteps.filter((row) => row.step.status === statusFilter).map((row) => row.numbering),
    );
    const keep = new Set<string>();
    matching.forEach((numbering) => {
      const parts = numbering.split(".");
      for (let index = 1; index <= parts.length; index += 1) {
        keep.add(parts.slice(0, index).join("."));
      }
    });
    return flatSteps
      .filter((row) => keep.has(row.numbering))
      .map((row) => ({ ...row, dimmed: !matching.has(row.numbering) }));
  }, [flatSteps, statusFilter]);

  const { taskActivity, logDurations } = useMemo(() => buildTaskActivity(workLogs), [workLogs]);

  const isTimerHere = timerState.status === "running" && timerState.taskId === id;
  const runningStepId = timerState.status === "running" ? timerState.stepId : undefined;
  const runningStepTitle = timerState.status === "running" ? timerState.stepTitle : undefined;

  const reading = useMemo(
    () =>
      task
        ? readTask({
            task,
            steps: taskSteps,
            workLogs: taskLogs,
            running: isTimerHere ? { stepTitle: runningStepTitle, elapsedMinutes } : undefined,
            now,
          })
        : null,
    [task, taskSteps, taskLogs, isTimerHere, runningStepTitle, elapsedMinutes, now],
  );

  const orderedLogs = useMemo(
    () => [...taskLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [taskLogs],
  );

  const editingStep = stepDialog?.stepId
    ? taskSteps.find((step) => step.id === stepDialog.stepId)
    : undefined;
  const forbiddenParents = useMemo(
    () => (stepDialog?.stepId ? descendantsOf(tree, stepDialog.stepId) : new Set<string>()),
    [stepDialog?.stepId, tree],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const openTaskDialog = () => {
    if (!task) return;
    setTaskForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority ?? "",
      tags: task.tags?.join(", ") ?? "",
      dueDate: task.dueDate ?? "",
    });
    saveTask.clearError();
    setIsTaskDialogOpen(true);
  };

  const handleTaskSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!task || !taskForm.title.trim()) return;
    const tags = taskForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    const saved = await saveTask.run(
      () =>
        updateTask(task.id, {
          title: taskForm.title.trim(),
          // Every key is present, so an emptied control clears the stored value. See UpdatePayload.
          description: taskForm.description.trim() || null,
          status: taskForm.status,
          priority: taskForm.priority || null,
          tags: tags.length > 0 ? tags : null,
          dueDate: taskForm.dueDate || null,
        }),
      "Non sono riuscito a salvare il task.",
    );
    if (saved) setIsTaskDialogOpen(false);
  };

  const openStepDialog = (mode: "create" | "edit", step?: Step) => {
    saveStep.clearError();
    if (mode === "edit" && step) {
      setStepForm({
        title: step.title,
        description: step.description ?? "",
        status: step.status,
        dueDate: step.dueDate ?? "",
        parentStepId: step.parentStepId ?? "",
        order: step.order,
      });
      setStepDialog({ mode, stepId: step.id });
      return;
    }
    setStepForm(emptyStepForm);
    setStepDialog({ mode: "create" });
  };

  const handleStepSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!task || !stepForm.title.trim()) return;
    const parentStepId = stepForm.parentStepId || undefined;

    if (stepDialog?.mode === "edit" && stepDialog.stepId) {
      const editingId = stepDialog.stepId;
      const siblings = taskSteps
        .filter((step) => (step.parentStepId ?? "") === (parentStepId ?? "") && step.id !== editingId)
        .sort((a, b) => a.order - b.order);
      const nextOrder = Math.min(Math.max(stepForm.order, 1), siblings.length + 1);

      const saved = await saveStep.run(async () => {
        await updateStep(editingId, {
          title: stepForm.title.trim(),
          description: stepForm.description.trim() || null,
          status: stepForm.status,
          dueDate: stepForm.dueDate || null,
          // Present-and-null means "move to top level"; the old code skipped the field entirely, so
          // a substep could never be promoted back out.
          parentStepId: parentStepId ?? null,
          order: nextOrder,
        });
        // Renumber the sibling group the step lands in, so two steps never share a position.
        const reordered = siblings.map((step) => step.id);
        reordered.splice(nextOrder - 1, 0, editingId);
        const updates = reordered
          .map((stepId, index) => ({ id: stepId, order: index + 1 }))
          .filter(
            ({ id: stepId, order }) =>
              stepId !== editingId && taskSteps.find((step) => step.id === stepId)?.order !== order,
          );
        if (updates.length > 0) await updateStepOrders(updates);
      }, "Non sono riuscito a salvare lo step.");
      if (saved) setStepDialog(null);
      return;
    }

    const siblingOrders = taskSteps
      .filter((step) => (step.parentStepId ?? "") === (parentStepId ?? ""))
      .map((step) => step.order);
    const created = await saveStep.run(
      () =>
        createStep({
          taskId: task.id,
          parentStepId,
          title: stepForm.title.trim(),
          description: stepForm.description.trim() || undefined,
          status: stepForm.status,
          order: siblingOrders.length > 0 ? Math.max(...siblingOrders) + 1 : 1,
          dueDate: stepForm.dueDate || undefined,
        }),
      "Non sono riuscito a creare lo step.",
    );
    if (created) setStepDialog(null);
  };

  const handleLogSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!task) return;
    const tags = logForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean);

    if (logDialog?.mode === "edit" && logDialog.logId) {
      const logId = logDialog.logId;
      const saved = await saveLog.run(
        () =>
          updateWorkLog(logId, {
            type: logForm.type,
            message: logForm.message.trim() || null,
            stepId: logForm.stepId || null,
            tags,
          }),
        "Non sono riuscito a salvare la voce.",
      );
      if (saved) setLogDialog(null);
      return;
    }

    if (!logForm.message.trim()) return;
    const created = await saveLog.run(
      () =>
        createWorkLog({
          taskId: task.id,
          stepId: logForm.stepId || undefined,
          message: logForm.message.trim(),
          tags,
          type: logForm.type,
          timestamp: new Date().toISOString(),
        }),
      "Non sono riuscito a registrare la voce.",
    );
    if (created) setLogDialog(null);
  };

  const handleStart = (step?: Step) => {
    if (!task) return;
    setStartError(null);
    const result = startTimer({
      taskId: task.id,
      taskTitle: task.title,
      stepId: step?.id,
      stepTitle: step?.title,
    });
    if (result.ok === false) setStartError(result.error);
  };

  const handleTaskDelete = async () => {
    if (!task) return;
    // Clear the session first: once the task is gone the work log can no longer be written against
    // it, and a session pointing at a deleted task is exactly the state the global bar has to rescue.
    if (isTimerHere) clearTimer();
    const deleted = await removeTask.run(
      () => deleteTask(task.id),
      "Non sono riuscito a eliminare il task.",
    );
    if (deleted) router.push("/tasks");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!isHydrated) {
    return (
      <AppShell>
        <main className="mx-auto w-full max-w-6xl px-6 py-10">
          <p className="font-mono text-tiny uppercase tracking-wider text-ink-muted">
            Leggo il task…
          </p>
        </main>
      </AppShell>
    );
  }

  if (!task || !reading) {
    return (
      <AppShell>
        <main className="mx-auto w-full max-w-3xl px-6 py-16">
          <h1 className="font-prose text-verdict font-semibold text-ink">
            Questo task non c&apos;è più
            <span aria-hidden="true" className="text-ink-muted">
              .
            </span>
          </h1>
          <p className="mt-4 max-w-measure font-prose text-prose text-ink-muted">
            {loadError
              ? "Potrebbe anche essere che non sia riuscito a leggere i dati: in quel caso riprova fra un attimo."
              : "È stato eliminato, oppure il link punta a qualcosa che non esiste."}
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/tasks">
              <Button variant="primary">Torna ai task</Button>
            </Link>
            {loadError ? <Button onClick={() => void refresh()}>Riprova</Button> : null}
          </div>
        </main>
      </AppShell>
    );
  }

  const dateline = (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <Link href="/tasks" className="text-ink-muted no-underline hover:text-ink">
        ← Task
      </Link>
      <h1 className="font-prose text-title text-ink">{task.title}</h1>
      <StatusChip status={task.status} />
      {task.dueDate ? (
        <span data-numeric className="text-ink-muted">
          scade {formatDueDate(task.dueDate, { day: "numeric", month: "long" })}
        </span>
      ) : null}
      {task.tags?.length ? <TagList tags={task.tags} /> : null}
    </div>
  );

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {loadError ? (
          <div className="mb-8">
            <ErrorNote onRetry={() => void refresh()}>
              Non sono riuscito a rileggere i dati: quello che vedi potrebbe essere vecchio.
            </ErrorNote>
          </div>
        ) : null}

        <Verdict verdict={reading.verdict} dateline={dateline} headingAs="p">
          {/*
            Read-only accounts get no actions at all here. The band in the chrome has already said
            why; repeating it beside every control would be nagging, and leaving the controls up
            would be worse — they cannot work.
          */}
          <div className="flex flex-wrap items-center gap-3">
            {!isReadOnly && !isTimerHere ? (
              <Button variant="primary" onClick={() => handleStart(reading.nextStep)}>
                {reading.nextStep ? `Avvia su «${reading.nextStep.title}»` : "Avvia una sessione"}
              </Button>
            ) : null}
            {!isReadOnly ? (
              <>
                <Button onClick={openTaskDialog}>Modifica</Button>
                <Button variant="quiet" onClick={() => setIsTaskDeleteOpen(true)}>
                  Elimina
                </Button>
              </>
            ) : null}
          </div>
        </Verdict>

        {startError ? (
          <div className="mt-6">
            <ErrorNote>{startError}</ErrorNote>
          </div>
        ) : null}

        {task.description ? (
          <p className="mt-8 max-w-measure font-prose text-prose text-ink-muted">
            {task.description}
          </p>
        ) : null}

        <div className="mt-12 grid gap-12 lg:grid-cols-[1.15fr_1fr]">
          {/* ── Step ───────────────────────────────────────────────────── */}
          <section aria-labelledby="titolo-step">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3">
              <h2
                id="titolo-step"
                className="font-mono text-micro uppercase tracking-wider text-ink-muted"
              >
                Step
              </h2>
              <div className="flex items-center gap-4">
                <label htmlFor="filtro-step" className="sr-only">
                  Filtra gli step per stato
                </label>
                <select
                  id="filtro-step"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  className="border border-line bg-panel px-2 py-1 font-mono text-tiny text-ink-muted"
                >
                  <option value="tutti">Tutti</option>
                  {STEP_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STEP_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                {!isReadOnly ? (
                  <button
                    type="button"
                    onClick={() => openStepDialog("create")}
                    className="font-mono text-tiny text-ink underline underline-offset-4"
                  >
                    Aggiungi
                  </button>
                ) : null}
              </div>
            </div>

            {changeStatus.error ? (
              <div className="mt-4">
                <ErrorNote>{changeStatus.error}</ErrorNote>
              </div>
            ) : null}

            {taskSteps.length === 0 ? (
              <p className="mt-6 max-w-measure font-prose text-base text-ink-muted">
                Non ci sono step, e va benissimo così: un task può restare una riga sola. Aggiungine
                uno quando ti accorgi che il lavoro si divide in pezzi.
              </p>
            ) : visibleSteps.length === 0 ? (
              <p className="mt-6 font-prose text-base text-ink-muted">Nessuno step in questo stato.</p>
            ) : (
              <ul className="mt-1">
                {visibleSteps.map(({ step, depth, numbering, dimmed }) => {
                  const isTimerStep = isTimerHere && runningStepId === step.id;
                  return (
                    <li
                      key={step.id}
                      className={`group flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line py-2.5 ${
                        dimmed ? "opacity-60" : ""
                      }`}
                      style={{ paddingLeft: `${depth * 1.5}rem` }}
                    >
                      {/* The numbering gutter carries the depth. */}
                      <span data-numeric className="w-10 shrink-0 font-mono text-tiny text-ink-muted">
                        {numbering}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className={`font-prose text-base ${
                            step.status === "done" ? "text-ink-muted line-through" : "text-ink"
                          }`}
                        >
                          {step.title}
                        </span>
                        {step.description ? (
                          <span className="block font-prose text-tiny text-ink-muted">
                            {step.description}
                          </span>
                        ) : null}
                        {/*
                          The running badge and the due date live in the title column. Between the
                          title and the select they were variable-width, so the select started at a
                          different x on almost every row and the tree read as two columns.
                        */}
                        {isTimerStep || step.dueDate ? (
                          <span className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
                            {isTimerStep ? (
                              <span className="font-mono text-micro uppercase tracking-wider text-good">
                                in corso
                              </span>
                            ) : null}
                            {step.dueDate ? (
                              <span data-numeric className="font-mono text-tiny text-ink-muted">
                                scade{" "}
                                {formatDueDate(step.dueDate, { day: "numeric", month: "short" })}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>

                      {/* Fixed-width cluster: every row's select sits on the same left edge. */}
                      <span className="flex shrink-0 items-baseline gap-3">
                        <label htmlFor={`stato-${step.id}`} className="sr-only">
                          Stato di {step.title}
                        </label>
                        <select
                          id={`stato-${step.id}`}
                          value={step.status}
                          disabled={isReadOnly || changeStatus.pending}
                          onChange={(event) =>
                            void changeStatus.run(
                              () => updateStep(step.id, { status: event.target.value as StepStatus }),
                              "Non sono riuscito a cambiare lo stato.",
                            )
                          }
                          className="w-[7.5rem] border border-line bg-panel px-1.5 py-1 font-mono text-micro uppercase tracking-wider text-ink-muted disabled:opacity-50"
                        >
                          {STEP_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {STEP_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>

                        <span className="w-12 shrink-0">
                          {!isReadOnly && !isTimerHere && step.status !== "done" ? (
                            <button
                              type="button"
                              onClick={() => handleStart(step)}
                              className="font-mono text-micro uppercase tracking-wider text-ink-muted underline underline-offset-4 hover:text-ink"
                            >
                              Avvia
                            </button>
                          ) : null}
                        </span>

                        {/*
                          Editing and deleting are rare next to changing a status or starting a
                          session; leaving all four permanently visible put thirty-two controls on a
                          tree of eight rows. They stay reachable by keyboard through focus-within.
                        */}
                        <span className="flex w-[9.5rem] justify-end gap-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          {isReadOnly ? null : (
                          <>
                          <button
                            type="button"
                            onClick={() => openStepDialog("edit", step)}
                            aria-label={`Modifica ${step.title}`}
                            className="font-mono text-micro uppercase tracking-wider text-ink-muted underline underline-offset-4 hover:text-ink"
                          >
                            Modifica
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingStepDelete(step)}
                            aria-label={`Elimina ${step.title}`}
                            className="font-mono text-micro uppercase tracking-wider text-ink-muted underline underline-offset-4 hover:text-bad"
                          >
                            Elimina
                          </button>
                          </>
                          )}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Work log ───────────────────────────────────────────────── */}
          <section aria-labelledby="titolo-log">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3">
              <h2
                id="titolo-log"
                className="font-mono text-micro uppercase tracking-wider text-ink-muted"
              >
                Work log
                {reading.minutesSpent > 0 ? (
                  <span data-numeric className="ml-3 normal-case tracking-normal text-ink">
                    {formatMinutes(reading.minutesSpent)} in tutto
                  </span>
                ) : null}
              </h2>
              {!isReadOnly ? (
                <button
                  type="button"
                  onClick={() => {
                    setLogForm({ ...emptyLogForm, tags: task.tags?.join(", ") ?? "" });
                    saveLog.clearError();
                    setLogDialog({ mode: "create" });
                  }}
                  className="font-mono text-tiny text-ink underline underline-offset-4"
                >
                  Aggiungi
                </button>
              ) : null}
            </div>

            {orderedLogs.length === 0 ? (
              <p className="mt-6 max-w-measure font-prose text-base text-ink-muted">
                Ancora niente. Avvia una sessione dallo step su cui stai lavorando, oppure annota a
                mano cosa hai fatto.
              </p>
            ) : (
              <ol className="mt-1">
                {orderedLogs.map((log) => {
                  const minutes = logDurations.get(log.id);
                  const step = log.stepId
                    ? taskSteps.find((candidate) => candidate.id === log.stepId)
                    : undefined;
                  const isToday = instantDayKey(log.timestamp) === todayKey(now);
                  return (
                    <li key={log.id} className="group border-b border-line py-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <time
                          dateTime={log.timestamp}
                          data-numeric
                          className="font-mono text-tiny text-ink-muted"
                        >
                          {isToday
                            ? "oggi"
                            : formatDueDate(instantDayKey(log.timestamp), {
                                day: "numeric",
                                month: "short",
                              })}{" "}
                          {formatInstantTime(log.timestamp)}
                        </time>
                        {minutes ? (
                          <span data-numeric className="font-mono text-tiny font-medium text-ink">
                            {formatMinutes(minutes)}
                          </span>
                        ) : null}
                        {step ? (
                          <span className="font-mono text-tiny text-ink-muted">su {step.title}</span>
                        ) : null}
                        <span className="ml-auto flex gap-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          {isReadOnly ? null : (
                          <>
                          <button
                            type="button"
                            onClick={() => {
                              setLogForm({
                                type: log.type,
                                message: log.message ?? "",
                                stepId: log.stepId ?? "",
                                tags: log.tags.join(", "),
                              });
                              saveLog.clearError();
                              setLogDialog({ mode: "edit", logId: log.id });
                            }}
                            className="font-mono text-micro uppercase tracking-wider text-ink-muted underline underline-offset-4 hover:text-ink"
                          >
                            Modifica
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingLogDelete(log.id)}
                            className="font-mono text-micro uppercase tracking-wider text-ink-muted underline underline-offset-4 hover:text-bad"
                          >
                            Elimina
                          </button>
                          </>
                          )}
                        </span>
                      </div>
                      {log.message ? (
                        <p className="mt-1 max-w-measure font-prose text-base text-ink">
                          {log.message}
                        </p>
                      ) : null}
                      {log.tags.length > 0 ? (
                        <div className="mt-1">
                          <TagList tags={log.tags} limit={4} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* ── Dialoghi ─────────────────────────────────────────────────── */}

        <Dialog
          open={isTaskDialogOpen}
          title="Modifica task"
          hasUnsavedChanges={
            taskForm.title !== task.title ||
            taskForm.description !== (task.description ?? "") ||
            taskForm.tags !== (task.tags?.join(", ") ?? "")
          }
          onClose={() => setIsTaskDialogOpen(false)}
          footer={
            <>
              <Button
                variant="quiet"
                onClick={() => setIsTaskDialogOpen(false)}
                disabled={saveTask.pending}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                form="form-task"
                variant="primary"
                pending={saveTask.pending}
                pendingLabel="Salvo…"
              >
                Salva
              </Button>
            </>
          }
        >
          <form id="form-task" onSubmit={handleTaskSave} className="flex flex-col gap-5">
            {saveTask.error ? <ErrorNote>{saveTask.error}</ErrorNote> : null}
            <Field label="Titolo" required>
              {(props) => (
                <TextInput
                  {...props}
                  value={taskForm.title}
                  onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
                  required
                  autoFocus
                />
              )}
            </Field>
            <Field label="Descrizione">
              {(props) => (
                <TextArea
                  {...props}
                  rows={3}
                  value={taskForm.description}
                  onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })}
                />
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Stato">
                {(props) => (
                  <Select
                    {...props}
                    value={taskForm.status}
                    onChange={(event) =>
                      setTaskForm({ ...taskForm, status: event.target.value as TaskStatus })
                    }
                  >
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {TASK_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Priorità">
                {(props) => (
                  <Select
                    {...props}
                    value={taskForm.priority}
                    onChange={(event) =>
                      setTaskForm({
                        ...taskForm,
                        priority: event.target.value as typeof taskForm.priority,
                      })
                    }
                  >
                    <option value="">Nessuna</option>
                    {PRIORITIES.map((priority) => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Scadenza" hint="Svuota il campo per togliere la scadenza.">
                {(props) => (
                  <DateInput
                    {...props}
                    value={taskForm.dueDate}
                    onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Tag" hint="Separati da virgola.">
                {(props) => (
                  <TextInput
                    {...props}
                    value={taskForm.tags}
                    onChange={(event) => setTaskForm({ ...taskForm, tags: event.target.value })}
                  />
                )}
              </Field>
            </div>
          </form>
        </Dialog>

        <Dialog
          open={stepDialog !== null}
          title={stepDialog?.mode === "edit" ? "Modifica step" : "Nuovo step"}
          hasUnsavedChanges={
            stepDialog?.mode === "create"
              ? stepForm.title.trim() !== "" || stepForm.description.trim() !== ""
              : stepForm.title !== (editingStep?.title ?? "") ||
                stepForm.description !== (editingStep?.description ?? "")
          }
          onClose={() => setStepDialog(null)}
          footer={
            <>
              <Button variant="quiet" onClick={() => setStepDialog(null)} disabled={saveStep.pending}>
                Annulla
              </Button>
              <Button
                type="submit"
                form="form-step"
                variant="primary"
                pending={saveStep.pending}
                pendingLabel="Salvo…"
              >
                Salva
              </Button>
            </>
          }
        >
          <form id="form-step" onSubmit={handleStepSave} className="flex flex-col gap-5">
            {saveStep.error ? <ErrorNote>{saveStep.error}</ErrorNote> : null}
            <Field label="Titolo" required>
              {(props) => (
                <TextInput
                  {...props}
                  value={stepForm.title}
                  onChange={(event) => setStepForm({ ...stepForm, title: event.target.value })}
                  required
                  autoFocus
                />
              )}
            </Field>
            <Field label="Descrizione">
              {(props) => (
                <TextArea
                  {...props}
                  rows={2}
                  value={stepForm.description}
                  onChange={(event) => setStepForm({ ...stepForm, description: event.target.value })}
                />
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Stato">
                {(props) => (
                  <Select
                    {...props}
                    value={stepForm.status}
                    onChange={(event) =>
                      setStepForm({ ...stepForm, status: event.target.value as StepStatus })
                    }
                  >
                    {STEP_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {STEP_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Scadenza">
                {(props) => (
                  <DateInput
                    {...props}
                    value={stepForm.dueDate}
                    onChange={(event) => setStepForm({ ...stepForm, dueDate: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Sta sotto" hint="«Nessuno» lo riporta al primo livello.">
                {(props) => (
                  <Select
                    {...props}
                    value={stepForm.parentStepId}
                    onChange={(event) =>
                      setStepForm({ ...stepForm, parentStepId: event.target.value })
                    }
                  >
                    <option value="">Nessuno</option>
                    {flatSteps
                      .filter(
                        ({ step }) => step.id !== stepDialog?.stepId && !forbiddenParents.has(step.id),
                      )
                      .map(({ step, numbering }) => (
                        <option key={step.id} value={step.id}>
                          {numbering} · {step.title}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
              {stepDialog?.mode === "edit" ? (
                <Field label="Posizione" hint="Fra i suoi pari livello.">
                  {(props) => (
                    <TextInput
                      {...props}
                      type="number"
                      min={1}
                      value={stepForm.order}
                      onChange={(event) =>
                        setStepForm({ ...stepForm, order: Number(event.target.value) || 1 })
                      }
                    />
                  )}
                </Field>
              ) : null}
            </div>
          </form>
        </Dialog>

        <Dialog
          open={logDialog !== null}
          title={logDialog?.mode === "edit" ? "Modifica voce" : "Nuova voce di work log"}
          hasUnsavedChanges={logDialog?.mode === "create" && logForm.message.trim() !== ""}
          onClose={() => setLogDialog(null)}
          footer={
            <>
              <Button variant="quiet" onClick={() => setLogDialog(null)} disabled={saveLog.pending}>
                Annulla
              </Button>
              <Button
                type="submit"
                form="form-log"
                variant="primary"
                pending={saveLog.pending}
                pendingLabel="Salvo…"
              >
                Salva
              </Button>
            </>
          }
        >
          <form id="form-log" onSubmit={handleLogSave} className="flex flex-col gap-5">
            {saveLog.error ? <ErrorNote>{saveLog.error}</ErrorNote> : null}
            <Field label="Cosa hai fatto" required={logDialog?.mode === "create"}>
              {(props) => (
                <TextArea
                  {...props}
                  rows={3}
                  value={logForm.message}
                  onChange={(event) => setLogForm({ ...logForm, message: event.target.value })}
                  placeholder="Chiuse le quotazioni con tre fornitori."
                  autoFocus
                />
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Tipo">
                {(props) => (
                  <Select
                    {...props}
                    value={logForm.type}
                    onChange={(event) =>
                      setLogForm({ ...logForm, type: event.target.value as WorkLogType })
                    }
                  >
                    {WORKLOG_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Step">
                {(props) => (
                  <Select
                    {...props}
                    value={logForm.stepId}
                    onChange={(event) => setLogForm({ ...logForm, stepId: event.target.value })}
                  >
                    <option value="">Nessuno</option>
                    {flatSteps.map(({ step, numbering }) => (
                      <option key={step.id} value={step.id}>
                        {numbering} · {step.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Tag" hint="Separati da virgola.">
              {(props) => (
                <TextInput
                  {...props}
                  value={logForm.tags}
                  onChange={(event) => setLogForm({ ...logForm, tags: event.target.value })}
                />
              )}
            </Field>
          </form>
        </Dialog>

        <Dialog
          open={pendingStepDelete !== null}
          title="Eliminare questo step?"
          onClose={() => setPendingStepDelete(null)}
          footer={
            <>
              <Button
                variant="quiet"
                onClick={() => setPendingStepDelete(null)}
                disabled={removeStep.pending}
              >
                Annulla
              </Button>
              <Button
                variant="danger"
                pending={removeStep.pending}
                pendingLabel="Elimino…"
                onClick={async () => {
                  if (!pendingStepDelete) return;
                  const done = await removeStep.run(
                    () => deleteStep(pendingStepDelete.id),
                    "Non sono riuscito a eliminare lo step.",
                  );
                  if (done) setPendingStepDelete(null);
                }}
              >
                Elimina
              </Button>
            </>
          }
        >
          {removeStep.error ? <ErrorNote>{removeStep.error}</ErrorNote> : null}
          <p className="font-prose text-prose text-ink">
            «{pendingStepDelete?.title}» sparisce insieme ai suoi substep e alle voci di work log
            registrate su di lui.
          </p>
        </Dialog>

        <Dialog
          open={pendingLogDelete !== null}
          title="Eliminare questa voce?"
          onClose={() => setPendingLogDelete(null)}
          footer={
            <>
              <Button
                variant="quiet"
                onClick={() => setPendingLogDelete(null)}
                disabled={removeLog.pending}
              >
                Annulla
              </Button>
              <Button
                variant="danger"
                pending={removeLog.pending}
                pendingLabel="Elimino…"
                onClick={async () => {
                  if (!pendingLogDelete) return;
                  const done = await removeLog.run(
                    () => deleteWorkLog(pendingLogDelete),
                    "Non sono riuscito a eliminare la voce.",
                  );
                  if (done) setPendingLogDelete(null);
                }}
              >
                Elimina
              </Button>
            </>
          }
        >
          {removeLog.error ? <ErrorNote>{removeLog.error}</ErrorNote> : null}
          <p className="font-prose text-prose text-ink">
            I minuti registrati in questa voce escono dal totale del task e dal report.
          </p>
        </Dialog>

        <Dialog
          open={isTaskDeleteOpen}
          title="Eliminare questo task?"
          onClose={() => setIsTaskDeleteOpen(false)}
          footer={
            <>
              <Button
                variant="quiet"
                onClick={() => setIsTaskDeleteOpen(false)}
                disabled={removeTask.pending}
              >
                Annulla
              </Button>
              <Button
                variant="danger"
                onClick={handleTaskDelete}
                pending={removeTask.pending}
                pendingLabel="Elimino…"
              >
                Elimina definitivamente
              </Button>
            </>
          }
        >
          {removeTask.error ? <ErrorNote>{removeTask.error}</ErrorNote> : null}
          <p className="font-prose text-prose text-ink">
            «{task.title}» sparisce, e con lui{" "}
            <span data-numeric className="font-mono">
              {taskSteps.length}
            </span>{" "}
            step e{" "}
            <span data-numeric className="font-mono">
              {taskLogs.length}
            </span>{" "}
            voci di work log, per un totale di{" "}
            <span data-numeric className="font-mono">
              {formatMinutes(taskActivity.get(task.id)?.totalMinutes ?? 0)}
            </span>
            .
          </p>
          {isTimerHere ? (
            <p className="mt-3 font-prose text-base text-warn">
              C&apos;è una sessione in corso su questo task: verrà scartata senza essere registrata.
            </p>
          ) : null}
        </Dialog>
      </main>
    </AppShell>
  );
};

export default TaskDetailPage;
