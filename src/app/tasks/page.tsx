/**
 * The task list.
 *
 * A browsing screen, so the verdict is short and the rows carry the weight. Rows are ruled lines,
 * not cards: a card per task turns a list of forty into forty containers, and the granularity range
 * here runs from a one-line reminder to an eight-step project — a shape that has to hold both.
 */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import Dialog from "../../components/Dialog";
import Verdict from "../../components/Verdict";
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
  TASK_STATUS_LABELS,
} from "../../components/controls";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { useNow } from "../../hooks/useNow";
import { useTaskStore } from "../../hooks/useTaskStore";
import { formatDueDate, formatMinutes } from "../../lib/dates";
import { buildStepsByTask, buildTaskActivity, getTaskStepSummary } from "../../lib/insights";
import { readTaskList } from "../../lib/verdicts";
import type { Task, TaskStatus } from "../../lib/types";

type StatusFilter = "attivi" | "tutti" | TaskStatus;

const STATUS_FILTERS: Array<{ label: string; value: StatusFilter }> = [
  { label: "Attivi", value: "attivi" },
  { label: "Tutti", value: "tutti" },
  { label: "Da fare", value: "todo" },
  { label: "In corso", value: "in_progress" },
  { label: "Fermi", value: "blocked" },
  { label: "Fatti", value: "done" },
];

const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const PRIORITIES: Array<{ value: NonNullable<Task["priority"]>; label: string }> = [
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Bassa" },
];
const PRIORITY_ORDER: Record<NonNullable<Task["priority"]>, number> = { high: 0, medium: 1, low: 2 };

const emptyForm = {
  title: "",
  description: "",
  status: "todo" as TaskStatus,
  priority: "" as "" | NonNullable<Task["priority"]>,
  tags: "",
  dueDate: "",
};

const TasksPage = () => {
  const { tasks, steps, workLogs, isHydrated, loadError, createTask, deleteTask, refresh } =
    useTaskStore();
  const now = useNow();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("attivi");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  const create = useAsyncAction();
  const remove = useAsyncAction();

  const stepsByTask = useMemo(() => buildStepsByTask(steps), [steps]);
  const { taskActivity } = useMemo(() => buildTaskActivity(workLogs), [workLogs]);

  const visibleTasks = useMemo(() => {
    const byStatus =
      statusFilter === "attivi"
        ? tasks.filter((task) => task.status !== "done")
        : statusFilter === "tutti"
        ? tasks
        : tasks.filter((task) => task.status === statusFilter);

    const needle = searchQuery.trim().toLowerCase();
    const bySearch = needle
      ? byStatus.filter((task) =>
          [task.title, task.description ?? "", task.tags?.join(" ") ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        )
      : byStatus;

    return [...bySearch].sort((a, b) => {
      const priorityA = a.priority ? PRIORITY_ORDER[a.priority] : 3;
      const priorityB = b.priority ? PRIORITY_ORDER[b.priority] : 3;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.title.localeCompare(b.title);
    });
  }, [statusFilter, tasks, searchQuery]);

  const verdict = useMemo(
    () => readTaskList(visibleTasks, tasks, now),
    [visibleTasks, tasks, now],
  );

  const formIsDirty =
    form.title.trim() !== "" || form.description.trim() !== "" || form.tags.trim() !== "";

  const closeCreate = () => {
    setIsCreateOpen(false);
    setForm(emptyForm);
    create.clearError();
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const created = await create.run(
      () =>
        createTask({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          status: form.status,
          priority: form.priority || undefined,
          tags: tags.length > 0 ? tags : undefined,
          // Already a YYYY-MM-DD day key: no conversion, so nothing to get wrong.
          dueDate: form.dueDate || undefined,
        }),
      "Non sono riuscito a creare il task.",
    );
    if (created) closeCreate();
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const deleted = await remove.run(
      () => deleteTask(pendingDelete.id),
      "Non sono riuscito a eliminare il task.",
    );
    if (deleted) setPendingDelete(null);
  };

  const stepsUnder = pendingDelete
    ? getTaskStepSummary(stepsByTask, pendingDelete.id).total
    : 0;
  const logsUnder = pendingDelete
    ? workLogs.filter((log) => log.taskId === pendingDelete.id).length
    : 0;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {loadError ? (
          <div className="mb-8">
            <ErrorNote onRetry={() => void refresh()}>
              Non sono riuscito a leggere i tuoi task, quindi la lista potrebbe non essere aggiornata.
            </ErrorNote>
          </div>
        ) : null}

        {!isHydrated ? (
          <p className="font-mono text-tiny uppercase tracking-wider text-ink-muted">Leggo i dati…</p>
        ) : (
          <>
            <Verdict verdict={verdict}>
              <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                Nuovo task
              </Button>
            </Verdict>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="min-w-[14rem] flex-1">
                <label htmlFor="ricerca-task" className="sr-only">
                  Cerca fra i task
                </label>
                <TextInput
                  id="ricerca-task"
                  type="search"
                  placeholder="Cerca per titolo, descrizione o tag"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <div role="group" aria-label="Filtra per stato" className="flex flex-wrap gap-x-4 gap-y-2">
                {STATUS_FILTERS.map((filter) => {
                  const active = statusFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStatusFilter(filter.value)}
                      className={`border-b-2 py-1 font-mono text-tiny transition-colors ${
                        active
                          ? "border-ink font-medium text-ink"
                          : "border-transparent text-ink-muted hover:text-ink"
                      }`}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {visibleTasks.length > 0 ? (
              <ul className="mt-8 border-t border-line">
                {visibleTasks.map((task) => {
                  const progress = getTaskStepSummary(stepsByTask, task.id);
                  const minutes = taskActivity.get(task.id)?.totalMinutes ?? 0;
                  return (
                    <li
                      key={task.id}
                      className="group flex flex-col gap-2 border-b border-line py-4 sm:flex-row sm:items-baseline sm:gap-x-4"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="font-prose text-lead text-ink no-underline hover:underline"
                        >
                          {task.title}
                        </Link>
                        {task.description ? (
                          <p className="mt-1 max-w-measure font-prose text-base text-ink-muted">
                            {task.description}
                          </p>
                        ) : null}
                        {task.tags?.length ? (
                          <div className="mt-1.5">
                            <TagList tags={task.tags} limit={4} />
                          </div>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-baseline gap-4">
                        <StatusChip status={task.status} />

                        {/* A task with no steps prints nothing here rather than a hollow "0/0". */}
                        <span data-numeric className="w-14 text-right font-mono text-tiny text-ink-muted">
                          {progress.total > 0 ? `${progress.done}/${progress.total}` : ""}
                        </span>
                        <span data-numeric className="w-16 text-right font-mono text-tiny text-ink-muted">
                          {minutes > 0 ? formatMinutes(minutes) : ""}
                        </span>
                        <span data-numeric className="w-20 text-right font-mono text-tiny text-ink-muted">
                          {task.dueDate
                            ? formatDueDate(task.dueDate, { day: "numeric", month: "short" })
                            : ""}
                        </span>

                        <button
                          type="button"
                          onClick={() => setPendingDelete(task)}
                          className="font-mono text-tiny text-ink-muted underline underline-offset-4 transition-opacity hover:text-bad focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          Elimina
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        )}

        <Dialog
          open={isCreateOpen}
          title="Nuovo task"
          description="Il titolo basta. Tutto il resto è facoltativo."
          hasUnsavedChanges={formIsDirty}
          onClose={closeCreate}
          footer={
            <>
              <Button variant="quiet" onClick={closeCreate} disabled={create.pending}>
                Annulla
              </Button>
              <Button
                type="submit"
                form="form-nuovo-task"
                variant="primary"
                pending={create.pending}
                pendingLabel="Salvo…"
              >
                Crea task
              </Button>
            </>
          }
        >
          <form id="form-nuovo-task" onSubmit={handleCreate} className="flex flex-col gap-5">
            {create.error ? <ErrorNote>{create.error}</ErrorNote> : null}

            <Field label="Titolo" required>
              {(props) => (
                <TextInput
                  {...props}
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Mandare il preventivo a Rossi"
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
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Stato">
                {(props) => (
                  <Select
                    {...props}
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })}
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
                    value={form.priority}
                    onChange={(event) =>
                      setForm({ ...form, priority: event.target.value as typeof form.priority })
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

              <Field label="Scadenza">
                {(props) => (
                  <DateInput
                    {...props}
                    value={form.dueDate}
                    onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                  />
                )}
              </Field>

              <Field label="Tag" hint="Separati da virgola.">
                {(props) => (
                  <TextInput
                    {...props}
                    value={form.tags}
                    onChange={(event) => setForm({ ...form, tags: event.target.value })}
                    placeholder="cliente, preventivo"
                  />
                )}
              </Field>
            </div>
          </form>
        </Dialog>

        <Dialog
          open={pendingDelete !== null}
          title="Eliminare questo task?"
          onClose={() => {
            setPendingDelete(null);
            remove.clearError();
          }}
          footer={
            <>
              <Button variant="quiet" onClick={() => setPendingDelete(null)} disabled={remove.pending}>
                Annulla
              </Button>
              <Button variant="danger" onClick={handleDelete} pending={remove.pending} pendingLabel="Elimino…">
                Elimina definitivamente
              </Button>
            </>
          }
        >
          {remove.error ? <ErrorNote>{remove.error}</ErrorNote> : null}
          <p className="font-prose text-prose text-ink">
            «{pendingDelete?.title}» sparisce, e con lui{" "}
            <span data-numeric className="font-mono">
              {stepsUnder}
            </span>{" "}
            {stepsUnder === 1 ? "step" : "step"} e{" "}
            <span data-numeric className="font-mono">
              {logsUnder}
            </span>{" "}
            {logsUnder === 1 ? "voce di work log" : "voci di work log"}.
          </p>
          <p className="mt-3 font-prose text-base text-ink-muted">
            Il tempo registrato su questo task non è recuperabile: non finisce in un cestino.
          </p>
        </Dialog>
      </main>
    </AppShell>
  );
};

export default TasksPage;
