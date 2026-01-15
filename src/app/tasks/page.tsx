"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AuthGate from "../../components/AuthGate";
import type { Task, TaskStatus } from "../../lib/types";
import { useTaskStore } from "../../hooks/useTaskStore";

type StatusFilter = "all" | TaskStatus;

const STATUS_FILTERS: Array<{ label: string; value: StatusFilter }> = [
  { label: "All", value: "all" },
  { label: "Todo", value: "todo" },
  { label: "In Progress", value: "in_progress" },
  { label: "Done", value: "done" },
  { label: "Blocked", value: "blocked" },
];

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
  blocked: "bg-rose-100 text-rose-800",
};

const PRIORITY_STYLES: Record<NonNullable<Task["priority"]>, string> = {
  low: "text-slate-500",
  medium: "text-amber-600",
  high: "text-rose-600",
};
const PRIORITY_ORDER: Record<NonNullable<Task["priority"]>, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const TASK_PRIORITIES: Array<NonNullable<Task["priority"]>> = ["low", "medium", "high"];

// Normalize priority labels for consistent UI copy.
const formatPriority = (priority?: Task["priority"]) => {
  if (!priority) return "No priority";
  return `${priority.charAt(0).toUpperCase()}${priority.slice(1)}`;
};

const TaskCard = ({
  task,
  totalSteps,
  completedSteps,
  onDelete,
}: {
  task: Task;
  totalSteps: number;
  completedSteps: number;
  onDelete: (taskId: string) => void;
}) => (
  <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:border-slate-400 hover:shadow-md">
    <Link href={`/tasks/${task.id}`} className="block">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{task.title}</h3>
          {task.description ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{task.description}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[task.status]}`}
        >
          {task.status.replace("_", " ")}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <div>
          <span className="font-semibold text-slate-900">{completedSteps}</span>/
          <span>{totalSteps}</span> Steps
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            Priority
          </span>
          <span className={`font-medium ${task.priority ? PRIORITY_STYLES[task.priority] : "text-slate-400"}`}>
            {formatPriority(task.priority)}
          </span>
        </div>

        {task.tags && task.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-sm font-semibold text-slate-500">Apri dettagli →</p>
    </Link>
    <div className="mt-4 flex justify-end">
      <button
        type="button"
        className="text-sm text-rose-600 hover:text-rose-700"
        onClick={() => onDelete(task.id)}
      >
        Elimina task
      </button>
    </div>
  </article>
);

const TasksPage = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { tasks, steps, isHydrated, createTask, deleteTask } = useTaskStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<Task["priority"]>();
  const [tagsInput, setTagsInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const modalTextSnapshot = useRef({ title: "", description: "", tags: "" });
  const [escWarning, setEscWarning] = useState<string | null>(null);

  const stepsByTask = useMemo(() => {
    // Pre-compute step totals per task to keep render logic simple.
    const map = new Map<string, { total: number; done: number }>();
    tasks.forEach((task) => {
      map.set(task.id, { total: 0, done: 0 });
    });

    steps.forEach((stepItem) => {
      const current = map.get(stepItem.taskId) ?? { total: 0, done: 0 };
      const updated = {
        total: current.total + 1,
        done: current.done + (stepItem.status === "done" ? 1 : 0),
      };
      map.set(stepItem.taskId, updated);
    });

    return map;
  }, [steps, tasks]);

  const filteredTasks = useMemo(() => {
    const byStatus =
      statusFilter === "all" ? tasks : tasks.filter((task) => task.status === statusFilter);
    // Sort by priority first, then title to keep the list predictable.
    return [...byStatus].sort((taskA, taskB) => {
      const priorityA =
        taskA.priority !== undefined ? PRIORITY_ORDER[taskA.priority] : Number.POSITIVE_INFINITY;
      const priorityB =
        taskB.priority !== undefined ? PRIORITY_ORDER[taskB.priority] : Number.POSITIVE_INFINITY;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return taskA.title.localeCompare(taskB.title);
    });
  }, [statusFilter, tasks]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setStatus("todo");
    setPriority(undefined);
    setTagsInput("");
    setDueDate("");
    setFormError(null);
    setEscWarning(null);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const openModal = () => {
    modalTextSnapshot.current = {
      title: title.trim(),
      description: description.trim(),
      tags: tagsInput.trim(),
    };
    setEscWarning(null);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const snapshot = modalTextSnapshot.current;
      const hasTextChanges =
        title.trim() !== snapshot.title ||
        description.trim() !== snapshot.description ||
        tagsInput.trim() !== snapshot.tags;
      if (!hasTextChanges && !isSaving) {
        event.preventDefault();
        closeModal();
      } else if (hasTextChanges) {
        setEscWarning("Non puoi chiudere la finestra, ci sono modifiche non salvate.");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, title, description, tagsInput, isSaving, closeModal]);

  useEffect(() => {
    if (!isModalOpen || !escWarning) return;
    const snapshot = modalTextSnapshot.current;
    const hasTextChanges =
      title.trim() !== snapshot.title ||
      description.trim() !== snapshot.description ||
      tagsInput.trim() !== snapshot.tags;
    if (!hasTextChanges) {
      setEscWarning(null);
    }
  }, [isModalOpen, escWarning, title, description, tagsInput]);

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      setFormError("Il titolo è obbligatorio.");
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const tags =
        tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean) ?? [];
      // Store due dates at UTC midnight to keep calendar math consistent across timezones.
      const dueDateIso = dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined;

      await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        tags: tags.length > 0 ? tags : undefined,
        dueDate: dueDateIso,
      });
      closeModal();
    } catch (error) {
      console.error(error);
      setFormError("Errore nel salvataggio. Riprova.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthGate>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:border-slate-400"
          >
            ← Torna alla Home
          </Link>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Chronostep
          </p>
          <h1 className="text-3xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500">
            Track everything you are working on in one list.
          </p>
        </div>
        <button
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          onClick={openModal}
        >
          + New Task
        </button>
      </header>

      <section className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
              statusFilter === filter.value
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </section>

      {!isHydrated ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
          Caricamento dati…
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {filteredTasks.map((task) => {
            const stepData = stepsByTask.get(task.id) ?? { total: 0, done: 0 };
            return (
              <TaskCard
                key={task.id}
                task={task}
                totalSteps={stepData.total}
                completedSteps={stepData.done}
                onDelete={(id) => {
                  if (confirm("Sei sicuro di voler eliminare questo task?")) {
                    void deleteTask(id);
                  }
                }}
              />
            );
          })}

          {filteredTasks.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
              No tasks match this filter.
            </div>
          ) : null}
        </section>
      )}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Nuovo Task</p>
                <h2 className="text-2xl font-semibold text-slate-900">Crea un task</h2>
              </div>
              <button
                className="text-slate-500 transition hover:text-slate-900"
                onClick={closeModal}
              >
                ✕
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleCreateTask}>
              {escWarning ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {escWarning}
                </p>
              ) : null}
              <div>
                <label className="text-sm font-medium text-slate-700">Titolo *</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Es. Setup progetto"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Descrizione</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Dettagli sul task"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Status</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as TaskStatus)}
                  >
                    {TASK_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Priority</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={priority ?? ""}
                    onChange={(event) =>
                      setPriority(event.target.value ? (event.target.value as Task["priority"]) : undefined)
                    }
                  >
                    <option value="">Nessuna</option>
                    {TASK_PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Due date</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Tags (comma)</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="setup,backend"
                    value={tagsInput}
                    onChange={(event) => setTagsInput(event.target.value)}
                  />
                </div>
              </div>

              {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                  onClick={closeModal}
                  disabled={isSaving}
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={isSaving}
                >
                  {isSaving ? "Salvataggio..." : "Crea Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
    </AuthGate>
  );
};

export default TasksPage;
