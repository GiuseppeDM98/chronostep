/**
 * TodayPage - Today's due tasks and steps
 *
 * Filters tasks and steps by due date matching today's date.
 * Uses UTC date keys for timezone-safe comparison.
 * Shows only non-done items.
 */
"use client";

import Link from "next/link";
import { useMemo } from "react";
import AuthGate from "../../components/AuthGate";
import { useTaskStore } from "../../hooks/useTaskStore";
import type { Step, StepStatus, Task, TaskStatus } from "../../lib/types";

const TASK_STATUS_STYLES: Record<TaskStatus, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
  blocked: "bg-rose-100 text-rose-800",
};

const STEP_STATUS_STYLES: Record<StepStatus, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
};

const formatDate = (iso?: string) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString();
};

const formatLongDate = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

/**
 * TodayPage - Dashboard for today's work
 *
 * Shows count and list of tasks/steps due today (excluding done items).
 * Uses UTC date key comparison to avoid timezone issues.
 */
const TodayPage = () => {
  const { tasks, steps, isHydrated } = useTaskStore();
  // Get today's date key (YYYY-MM-DD) using .slice(0, 10) on ISO string.
  // This extracts just the date portion for comparison with task/step dueDates.
  // Using UTC-based keys ensures consistent date matching across timezones.
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayLabel = useMemo(() => formatLongDate(new Date()), []);

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const stepsById = useMemo(() => new Map(steps.map((step) => [step.id, step])), [steps]);

  // Filter tasks due today by comparing UTC date keys.
  // task.dueDate?.slice(0, 10) extracts "YYYY-MM-DD" for direct comparison.
  // Excludes done tasks since focus is on active work.
  const tasksDueToday = useMemo(() => {
    return tasks
      .filter((task) => task.status !== "done" && task.dueDate?.slice(0, 10) === todayKey)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, todayKey]);

  const stepsDueToday = useMemo(() => {
    return steps
      .filter((step) => step.status !== "done" && step.dueDate?.slice(0, 10) === todayKey)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [steps, todayKey]);

  return (
    <AuthGate>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:border-slate-400"
            >
              {"<- Torna alla Home"}
            </Link>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Chronostep
            </p>
            <h1 className="text-3xl font-bold text-slate-900">Cosa faccio oggi?</h1>
            <p className="text-sm text-slate-500">{todayLabel}</p>
          </div>
          <Link
            href="/tasks"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          >
            Vai ai task
          </Link>
        </header>

        {!isHydrated ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            Caricamento dati.
          </div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Task di oggi</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {tasksDueToday.length}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Step di oggi</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {stepsDueToday.length}
                </p>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-slate-900">Task in scadenza</h2>
                  <span className="text-xs font-semibold text-slate-500">
                    {tasksDueToday.length} totali
                  </span>
                </div>
                {tasksDueToday.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">
                    Nessun task con due date oggi.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {tasksDueToday.map((task) => (
                      <li key={task.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                            {task.description ? (
                              <p className="mt-1 text-xs text-slate-500">
                                {task.description}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              TASK_STATUS_STYLES[task.status]
                            }`}
                          >
                            {task.status.replace("_", " ")}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                          <span>Due {formatDate(task.dueDate)}</span>
                          <Link
                            href={`/tasks/${task.id}`}
                            className="font-semibold text-slate-700 hover:text-slate-900"
                          >
                            Vai al task {"->"}
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-slate-900">Step in scadenza</h2>
                  <span className="text-xs font-semibold text-slate-500">
                    {stepsDueToday.length} totali
                  </span>
                </div>
                {stepsDueToday.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">
                    Nessuno step con due date oggi.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {stepsDueToday.map((step) => {
                      const task = tasksById.get(step.taskId);
                      const parent = step.parentStepId
                        ? stepsById.get(step.parentStepId)
                        : undefined;
                      return (
                        <li key={step.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">
                                {step.title}
                              </p>
                              {parent ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  Substep di: {parent.title}
                                </p>
                              ) : null}
                              {task ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  Task: {task.title}
                                </p>
                              ) : null}
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                STEP_STATUS_STYLES[step.status]
                              }`}
                            >
                              {step.status.replace("_", " ")}
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                            <span>Due {formatDate(step.dueDate)}</span>
                            {task ? (
                              <Link
                                href={`/tasks/${task.id}`}
                                className="font-semibold text-slate-700 hover:text-slate-900"
                              >
                                Vai al task {"->"}
                              </Link>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </AuthGate>
  );
};

export default TodayPage;
