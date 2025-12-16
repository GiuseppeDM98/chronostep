"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthGate from "../../components/AuthGate";
import { useTaskStore } from "../../hooks/useTaskStore";
import {
  buildStepsByTask,
  buildTaskActivity,
  describePriority,
  getTaskStepSummary,
} from "../../lib/insights";
import type { Task } from "../../lib/types";

const UPCOMING_WINDOW_DAYS = 14;
const RECENT_ACTIVITY_DAYS = 3;

const formatShortDate = (iso?: string) => {
  if (!iso) return "Nessuna data";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const formatFullDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const daysBetween = (target: Date, from: Date) =>
  Math.ceil((target.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

const monthLabel = (year: number, month: number) =>
  new Date(year, month).toLocaleDateString(undefined, { month: "long", year: "numeric" });

const buildCalendarDays = (year: number, month: number, tasks: Task[]) => {
  const startOfMonth = new Date(year, month, 1);
  const startOffset = (startOfMonth.getDay() + 6) % 7; // Monday as first column
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const tasksByDate = new Map<string, Task[]>();
  tasks.forEach((task) => {
    if (!task.dueDate) return;
    const due = new Date(task.dueDate);
    if (due.getFullYear() !== year || due.getMonth() !== month) return;
    const key = due.toISOString().slice(0, 10);
    const bucket = tasksByDate.get(key) ?? [];
    bucket.push(task);
    tasksByDate.set(key, bucket);
  });

  const days: Array<{ key: string; label: string; tasks: Task[]; isCurrentMonth: boolean }> = [];
  for (let cell = 0; cell < totalCells; cell += 1) {
    const dayOfMonth = cell - startOffset + 1;
    if (dayOfMonth < 1 || dayOfMonth > daysInMonth) {
      days.push({ key: `blank-${cell}`, label: "", tasks: [], isCurrentMonth: false });
    } else {
      const iso = new Date(Date.UTC(year, month, dayOfMonth)).toISOString().slice(0, 10);
      days.push({
        key: iso,
        label: dayOfMonth.toString(),
        tasks: tasksByDate.get(iso) ?? [],
        isCurrentMonth: true,
      });
    }
  }

  return days;
};

const InsightsPageContent = () => {
  const { tasks, steps, workLogs, isHydrated } = useTaskStore();
  const stepsByTask = useMemo(() => buildStepsByTask(steps), [steps]);
  const { taskActivity } = useMemo(() => buildTaskActivity(workLogs), [workLogs]);
  const today = useMemo(() => new Date(), []);
  const [calendarState, setCalendarState] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const { year: calendarYear, month: calendarMonth } = calendarState;
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const focusedTaskId = searchParams.get("task");
  const focusedTask = tasks.find((task) => task.id === focusedTaskId);
  const focusedTaskActivity = focusedTask ? taskActivity.get(focusedTask.id) : undefined;

  const upcomingTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (!task.dueDate) return false;
        const due = new Date(task.dueDate);
        return daysBetween(due, today) <= UPCOMING_WINDOW_DAYS;
      })
      .sort((a, b) => {
        const dueA = new Date(a.dueDate ?? 0).valueOf();
        const dueB = new Date(b.dueDate ?? 0).valueOf();
        return dueA - dueB;
      });
  }, [tasks, today]);

  const recentTasks = useMemo(() => {
    const threshold = new Date(today);
    threshold.setDate(today.getDate() - RECENT_ACTIVITY_DAYS);
    return tasks
      .filter((task) => {
        const lastLog = taskActivity.get(task.id)?.lastLogTimestamp;
        if (!lastLog) return false;
        return new Date(lastLog) >= threshold;
      })
      .sort((a, b) => {
        const lastA = taskActivity.get(a.id)?.lastLogTimestamp ?? "";
        const lastB = taskActivity.get(b.id)?.lastLogTimestamp ?? "";
        return new Date(lastB).valueOf() - new Date(lastA).valueOf();
      });
  }, [tasks, taskActivity, today]);

  const priorityLevels: Array<Task["priority"] | "none"> = ["high", "medium", "low", "none"];
  const priorityStats = useMemo(() => {
    return priorityLevels.map((level) => {
      const bucket = tasks.filter(
        (task) => (task.priority ?? "none") === level,
      );
      const summary = bucket.reduce(
        (acc, task) => {
          const stepsSummary = getTaskStepSummary(stepsByTask, task.id);
          const activity = taskActivity.get(task.id);
          acc.tasks += 1;
          acc.totalSteps += stepsSummary.total;
          acc.doneSteps += stepsSummary.done;
          acc.minutes += activity?.totalMinutes ?? 0;
          return acc;
        },
        { tasks: 0, totalSteps: 0, doneSteps: 0, minutes: 0 },
      );
      return { level, ...summary };
    });
  }, [stepsByTask, taskActivity, tasks]);

  const maxPriorityMinutes = Math.max(...priorityStats.map((item) => item.minutes), 1);

  const tagStats = useMemo(() => {
    const map = new Map<
      string,
      { tasks: number; totalSteps: number; doneSteps: number; minutes: number }
    >();
    tasks.forEach((task) => {
      if (!task.tags) return;
      const stepsSummary = getTaskStepSummary(stepsByTask, task.id);
      const activity = taskActivity.get(task.id);
      task.tags.forEach((tag) => {
        const entry = map.get(tag) ?? { tasks: 0, totalSteps: 0, doneSteps: 0, minutes: 0 };
        entry.tasks += 1;
        entry.totalSteps += stepsSummary.total;
        entry.doneSteps += stepsSummary.done;
        entry.minutes += activity?.totalMinutes ?? 0;
        map.set(tag, entry);
      });
    });
    return Array.from(map.entries())
      .map(([tag, stats]) => ({ tag, ...stats }))
      .sort((a, b) => b.minutes - a.minutes || b.tasks - a.tasks)
      .slice(0, 6);
  }, [stepsByTask, taskActivity, tasks]);

  const calendarDays = useMemo(
    () => buildCalendarDays(calendarYear, calendarMonth, tasks),
    [calendarMonth, calendarYear, tasks],
  );
  useEffect(() => {
    if (selectedDayKey && calendarDays.some((day) => day.key === selectedDayKey)) {
      return;
    }
    const firstWithTasks = calendarDays.find(
      (day) => day.isCurrentMonth && day.tasks.length > 0,
    );
    setSelectedDayKey(firstWithTasks?.key ?? null);
  }, [calendarDays, selectedDayKey]);
  const selectedDayInfo = useMemo(
    () => calendarDays.find((day) => day.key === selectedDayKey),
    [calendarDays, selectedDayKey],
  );

  const changeMonth = (direction: "next" | "prev") => {
    setCalendarState(({ year, month }) => {
      if (direction === "next") {
        if (month === 11) {
          return { year: year + 1, month: 0 };
        }
        return { year, month: month + 1 };
      }
      if (month === 0) {
        return { year: year - 1, month: 11 };
      }
      return { year, month: month - 1 };
    });
  };

  return (
    <AuthGate>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <header className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:border-slate-400"
        >
          ← Torna alla Home
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Chronostep</p>
          <h1 className="text-3xl font-bold text-slate-900">Insights & Pianificazione</h1>
          <p className="text-sm text-slate-500">Capisci dove concentrare l’energia e quando consegnare.</p>
        </div>
        {focusedTask ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Focus rapido</p>
            <h2 className="text-xl font-semibold text-slate-900">{focusedTask.title}</h2>
            <p className="text-sm text-slate-500">
              Ultimo log:{" "}
              {focusedTaskActivity?.lastLogTimestamp
                ? new Date(focusedTaskActivity.lastLogTimestamp).toLocaleString()
                : "—"}
            </p>
          </div>
        ) : null}
      </header>

      {!isHydrated ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
          Caricamento dati…
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Focus della settimana</p>
              <h2 className="text-2xl font-semibold text-slate-900">Organizza priorità e scadenze</h2>
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Prossime scadenze</h3>
                  <Link href="/tasks" className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                    Vai ai tasks
                  </Link>
                </div>
                <ul className="mt-3 space-y-3">
                  {upcomingTasks.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      Nessun task con due date nelle prossime due settimane.
                    </li>
                  ) : (
                    upcomingTasks.slice(0, 4).map((task) => {
                      const stepsSummary = getTaskStepSummary(stepsByTask, task.id);
                      return (
                        <li key={task.id} className="rounded-lg border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                              <p className="text-xs text-slate-500">
                                Due {formatShortDate(task.dueDate)} • {describePriority(task.priority)}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-slate-600">
                              {stepsSummary.done}/{stepsSummary.total}
                            </span>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Attività recente</h3>
                  <Link
                    href="/timeline"
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                  >
                    Vai alla timeline
                  </Link>
                </div>
                <ul className="mt-3 space-y-3">
                  {recentTasks.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      Nessun log negli ultimi {RECENT_ACTIVITY_DAYS} giorni.
                    </li>
                  ) : (
                    recentTasks.slice(0, 4).map((task) => {
                      const lastLog = taskActivity.get(task.id)?.lastLogTimestamp;
                      const stepsSummary = getTaskStepSummary(stepsByTask, task.id);
                      const minutes = taskActivity.get(task.id)?.totalMinutes ?? 0;
                      return (
                        <li key={task.id} className="rounded-lg border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                              <p className="text-xs text-slate-500">
                                Ultimo log {lastLog ? new Date(lastLog).toLocaleString() : "—"}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-slate-600">{minutes} min</span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            Progress {stepsSummary.done}/{stepsSummary.total}
                          </p>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Priorità</p>
                  <h2 className="text-xl font-semibold text-slate-900">Carico per priorità</h2>
                </div>
                <span className="text-xs text-slate-400">basato sui task attivi</span>
              </div>
              <ul className="mt-6 space-y-4">
                {priorityStats.map((stat) => {
                  const label = stat.level === "none" ? "Nessuna" : describePriority(stat.level as Task["priority"]);
                  const width = `${Math.min(100, (stat.minutes / maxPriorityMinutes) * 100)}%`;
                  return (
                    <li key={stat.level} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-700">{label}</span>
                        <span className="text-slate-500">
                          {stat.doneSteps}/{stat.totalSteps} steps · {stat.minutes} min
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-slate-900 transition-all"
                          style={{ width }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Tag</p>
                  <h2 className="text-xl font-semibold text-slate-900">Focus per tag</h2>
                </div>
                <span className="text-xs text-slate-400">Top 6 per tempo investito</span>
              </div>
              {tagStats.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Nessun tag disponibile.</p>
              ) : (
                <ul className="mt-6 space-y-4">
                  {tagStats.map((stat) => {
                    const width = `${Math.min(
                      100,
                      (stat.minutes / Math.max(tagStats[0]?.minutes ?? 1, 1)) * 100,
                    )}%`;
                    return (
                      <li key={stat.tag}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-slate-700">#{stat.tag}</span>
                          <span className="text-slate-500">
                            {stat.tasks} task · {stat.doneSteps}/{stat.totalSteps} steps
                          </span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-amber-500 transition-all" style={{ width }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Calendario</p>
                <h2 className="text-xl font-semibold text-slate-900">Due date del mese</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:border-slate-400"
                  onClick={() => changeMonth("prev")}
                >
                  ←
                </button>
                <span className="text-sm font-semibold text-slate-700">
                  {monthLabel(calendarYear, calendarMonth)}
                </span>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:border-slate-400"
                  onClick={() => changeMonth("next")}
                >
                  →
                </button>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase text-slate-500">
              {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {calendarDays.map((calendarDay) => {
                const isSelected = calendarDay.key === selectedDayKey;
                const isInteractive = calendarDay.isCurrentMonth;
                return (
                  <div
                    key={calendarDay.key}
                    role={isInteractive ? "button" : undefined}
                    tabIndex={isInteractive ? 0 : -1}
                    onClick={() =>
                      isInteractive ? setSelectedDayKey(calendarDay.key) : undefined
                    }
                    onKeyDown={(event) => {
                      if (!isInteractive) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedDayKey(calendarDay.key);
                      }
                    }}
                    className={`min-h-[90px] rounded-xl border p-2 text-sm outline-none ${
                      isInteractive
                        ? "cursor-pointer transition hover:border-slate-400"
                        : ""
                    } ${
                      calendarDay.isCurrentMonth
                        ? isSelected
                          ? "border-slate-900 bg-slate-900/5"
                          : "border-slate-200 bg-white"
                        : "border-dashed border-slate-100 text-slate-300"
                    }`}
                  >
                    <p className="text-xs font-semibold">{calendarDay.label}</p>
                    <div className="mt-1 space-y-1">
                      {calendarDay.tasks.slice(0, 2).map((task) => (
                        <p key={task.id} className="truncate text-xs text-slate-600">
                          {task.title}
                        </p>
                      ))}
                      {calendarDay.tasks.length > 2 ? (
                        <p className="text-xs text-slate-500">
                          +{calendarDay.tasks.length - 2} altri
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              {selectedDayInfo && selectedDayInfo.isCurrentMonth ? (
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Dettagli giorno
                      </p>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {formatFullDate(selectedDayInfo.key)}
                      </h3>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {selectedDayInfo.tasks.length} task
                    </span>
                  </div>
                  {selectedDayInfo.tasks.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">
                      Nessuna due date in questo giorno. Seleziona un altro giorno del mese.
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {selectedDayInfo.tasks.map((task) => (
                        <li
                          key={task.id}
                          className="flex flex-col gap-1 rounded-xl border border-white bg-white/70 p-3 shadow-sm"
                        >
                          <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                          <p className="text-xs text-slate-500">
                            Priorità {describePriority(task.priority)} •{" "}
                            {getTaskStepSummary(stepsByTask, task.id).done}/
                            {getTaskStepSummary(stepsByTask, task.id).total} steps
                          </p>
                          <Link
                            href={`/tasks/${task.id}`}
                            className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                          >
                            Vai al task →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Seleziona un giorno del mese per vedere i relativi task.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </main>
    </AuthGate>
  );
};

const InsightsPage = () => (
  <Suspense
    fallback={
      <main className="mx-auto flex w-full max-w-4xl items-center justify-center p-6 text-sm text-slate-500">
        Caricamento Insights…
      </main>
    }
  >
    <InsightsPageContent />
  </Suspense>
);

export default InsightsPage;
