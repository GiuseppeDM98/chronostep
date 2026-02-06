/**
 * InsightsPage - Dashboard with upcoming tasks, activity, and calendar
 *
 * Features:
 * - Upcoming tasks within configurable window (default 14 days)
 * - Recent activity from last N days (default 3 days)
 * - Interactive monthly calendar with task due dates
 * - Priority and tag summaries
 *
 * Calendar uses UTC date keys to avoid timezone-based date shifts.
 */
"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGate from "../../components/AuthGate";
import { useTaskStore } from "../../hooks/useTaskStore";
import {
  buildStepsByTask,
  buildTaskActivity,
  buildDailyWorkLogTotals,
  buildMonthlyTrends,
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

// Format minutes into compact hours/minutes label for summary cards.
const formatMinutesAsHours = (totalMinutes: number) => {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

const daysBetween = (target: Date, from: Date) =>
  Math.ceil((target.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

const monthLabel = (year: number, month: number) =>
  new Date(year, month).toLocaleDateString(undefined, { month: "long", year: "numeric" });

const getHeatmapStyles = (minutes: number, maxMinutes: number) => {
  if (minutes <= 0 || maxMinutes <= 0) {
    return { bgClass: "bg-white", textClass: "text-slate-400" };
  }
  const ratio = minutes / maxMinutes;
  if (ratio <= 0.25) {
    return { bgClass: "bg-emerald-50", textClass: "text-emerald-700" };
  }
  if (ratio <= 0.5) {
    return { bgClass: "bg-emerald-100", textClass: "text-emerald-800" };
  }
  if (ratio <= 0.75) {
    return { bgClass: "bg-emerald-200", textClass: "text-emerald-900" };
  }
  return { bgClass: "bg-emerald-300", textClass: "text-emerald-950" };
};

type FocusState =
  | { type: "tag"; value: string }
  | { type: "priority"; value: Task["priority"] | "none" }
  | null;

const PRIORITY_LEVELS: Array<Task["priority"] | "none"> = [
  "high",
  "medium",
  "low",
  "none",
];

const getFocusFromParams = (searchParams: ReturnType<typeof useSearchParams>): FocusState => {
  const tag = searchParams.get("tag")?.trim();
  // Tag wins when both params are present to keep the focus consistent and explicit.
  if (tag) return { type: "tag", value: tag };

  const priority = searchParams.get("priority")?.trim() as Task["priority"] | "none" | undefined;
  if (priority && PRIORITY_LEVELS.includes(priority)) {
    return { type: "priority", value: priority };
  }

  return null;
};

/**
 * Build calendar grid aligned to Monday (Italian week layout).
 *
 * Bucketing logic:
 * - Tasks are grouped by UTC date keys (YYYY-MM-DD via .slice(0, 10))
 * - JS Date.getDay() returns Sunday=0, so we shift by 6 to make Monday=0
 * - startOffset pads empty cells before the 1st of the month
 * - totalCells rounds up to complete the last week
 *
 * Why UTC keys:
 * A task due "2024-01-15" should display on Jan 15 in the calendar
 * regardless of user timezone. Using UTC midnight prevents shifts.
 *
 * @param year - Calendar year
 * @param month - Calendar month (0-indexed, JS Date convention)
 * @param tasks - Tasks to bucket by due date
 * @returns Array of calendar day cells with task assignments
 */
const buildCalendarDays = (year: number, month: number, tasks: Task[]) => {
  const startOfMonth = new Date(year, month, 1);
  // Shift JS Sunday=0 to Monday=0 so the grid aligns with Italian week layout.
  const startOffset = (startOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const tasksByDate = new Map<string, Task[]>();
  tasks.forEach((task) => {
    if (!task.dueDate) return;
    const due = new Date(task.dueDate);
    if (due.getFullYear() !== year || due.getMonth() !== month) return;
    // Extract UTC date key (YYYY-MM-DD) via .slice(0, 10) on ISO timestamp.
    // Ensures date-based grouping/comparison works across timezones.
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
      // Extract UTC date key (YYYY-MM-DD) via .slice(0, 10) on ISO timestamp.
      // Ensures date-based grouping/comparison works across timezones.
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

/**
 * InsightsPageContent - Main insights dashboard content
 *
 * Wrapped in Suspense by parent to handle search params.
 * Renders upcoming tasks, recent activity, calendar, and summaries.
 */
const InsightsPageContent = () => {
  const { tasks, steps, workLogs, isHydrated } = useTaskStore();
  const stepsByTask = useMemo(() => buildStepsByTask(steps), [steps]);
  const { taskActivity, logDurations } = useMemo(
    () => buildTaskActivity(workLogs),
    [workLogs],
  );
  const today = useMemo(() => new Date(), []);
  const [calendarState, setCalendarState] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const { year: calendarYear, month: calendarMonth } = calendarState;
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusedTaskId = searchParams.get("task");
  const focusedTask = tasks.find((task) => task.id === focusedTaskId);
  const focusedTaskActivity = focusedTask ? taskActivity.get(focusedTask.id) : undefined;
  const focusState = useMemo(() => getFocusFromParams(searchParams), [searchParams]);

  const setFocusParams = (next: { tag?: string | null; priority?: Task["priority"] | "none" | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.tag) {
      params.set("tag", next.tag);
    } else {
      params.delete("tag");
    }
    if (next.priority) {
      params.set("priority", next.priority);
    } else {
      params.delete("priority");
    }
    const query = params.toString();
    router.replace(query ? `/insights?${query}` : "/insights", { scroll: false });
  };

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done"),
    [tasks],
  );

  const upcomingTasks = useMemo(() => {
    return activeTasks
      .filter((task) => {
        if (!task.dueDate) return false;
        const due = new Date(task.dueDate);
        // Keep a short horizon to focus the "next steps" list on imminent deadlines.
        return daysBetween(due, today) <= UPCOMING_WINDOW_DAYS;
      })
      .sort((a, b) => {
        const dueA = new Date(a.dueDate ?? 0).valueOf();
        const dueB = new Date(b.dueDate ?? 0).valueOf();
        return dueA - dueB;
      });
  }, [activeTasks, today]);

  const recentTasks = useMemo(() => {
    const threshold = new Date(today);
    // Use a rolling window of recent activity instead of calendar weeks.
    threshold.setDate(today.getDate() - RECENT_ACTIVITY_DAYS);
    return activeTasks
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
  }, [activeTasks, taskActivity, today]);

  const priorityStats = useMemo(() => {
    return PRIORITY_LEVELS.map((level) => {
      const bucket = activeTasks.filter(
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
  }, [stepsByTask, taskActivity, activeTasks]);

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

  const monthlyTrendsMap = useMemo(() => buildMonthlyTrends(workLogs), [workLogs]);
  const trendMonths = useMemo(() => {
    const months: string[] = [];
    for (let offset = 0; offset < 6; offset += 1) {
      const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
      months.push(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      );
    }
    return months;
  }, [today]);
  const trendEntries = useMemo(
    () =>
      trendMonths.map((monthKey) => {
        return (
          monthlyTrendsMap.get(monthKey) ?? {
            monthKey,
            totalMinutes: 0,
            topTaskId: undefined,
            topTaskMinutes: 0,
            topTag: undefined,
            topTagMinutes: 0,
          }
        );
      }),
    [monthlyTrendsMap, trendMonths],
  );
  const hasTrendData = useMemo(
    () => trendEntries.some((entry) => entry.totalMinutes > 0),
    [trendEntries],
  );

  const taskTitleById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task.title])),
    [tasks],
  );
  const stepTitleById = useMemo(
    () => new Map(steps.map((step) => [step.id, step.title])),
    [steps],
  );

  const focusTasks = useMemo(() => {
    if (!focusState) return [];
    if (focusState.type === "priority") {
      return activeTasks.filter(
        (task) => (task.priority ?? "none") === focusState.value,
      );
    }
    return tasks.filter((task) => task.tags?.includes(focusState.value));
  }, [activeTasks, focusState, tasks]);

  const focusTaskIds = useMemo(
    () => new Set(focusTasks.map((task) => task.id)),
    [focusTasks],
  );

  const focusSteps = useMemo(() => {
    if (!focusState) return [];
    return steps
      .filter((step) => focusTaskIds.has(step.taskId))
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }, [focusState, focusTaskIds, steps]);

  const focusLogs = useMemo(() => {
    if (!focusState) return [];
    const filtered =
      focusState.type === "priority"
        ? workLogs.filter((log) => focusTaskIds.has(log.taskId))
        : workLogs.filter((log) => log.tags.includes(focusState.value));
    return filtered.sort(
      (a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf(),
    );
  }, [focusState, focusTaskIds, workLogs]);

  const focusLabel = useMemo(() => {
    if (!focusState) return "";
    if (focusState.type === "priority") {
      return `Dettaglio priorità: ${describePriority(
        focusState.value === "none" ? undefined : focusState.value,
      )}`;
    }
    return `Dettaglio tag: #${focusState.value}`;
  }, [focusState]);

  const calendarDays = useMemo(
    () => buildCalendarDays(calendarYear, calendarMonth, tasks),
    [calendarMonth, calendarYear, tasks],
  );
  const dailyMinutesByDate = useMemo(
    () => buildDailyWorkLogTotals(workLogs, logDurations),
    [logDurations, workLogs],
  );
  const monthlyMinutesByDate = useMemo(() => {
    const monthKey = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}`;
    const filtered = new Map<string, number>();
    dailyMinutesByDate.forEach((minutes, dateKey) => {
      if (dateKey.startsWith(monthKey)) {
        filtered.set(dateKey, minutes);
      }
    });
    return filtered;
  }, [calendarMonth, calendarYear, dailyMinutesByDate]);
  const maxMonthlyMinutes = useMemo(() => {
    const values = Array.from(monthlyMinutesByDate.values());
    return values.length > 0 ? Math.max(...values) : 0;
  }, [monthlyMinutesByDate]);
  useEffect(() => {
    if (selectedDayKey && calendarDays.some((day) => day.key === selectedDayKey)) {
      return;
    }
    // Auto-focus the first day with tasks so the detail panel is never empty on load.
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

  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
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
                  const isFocused =
                    focusState?.type === "priority" && focusState.value === stat.level;
                  return (
                    <li key={stat.level} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <button
                          type="button"
                          className={`rounded-full px-2 py-0.5 text-left font-semibold transition ${
                            isFocused
                              ? "bg-slate-900 text-white"
                              : "text-slate-700 hover:bg-slate-100"
                          }`}
                          aria-pressed={isFocused}
                          onClick={() =>
                            isFocused
                              ? setFocusParams({ priority: null, tag: null })
                              : setFocusParams({ priority: stat.level, tag: null })
                          }
                        >
                          {label}
                        </button>
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
                    const isFocused =
                      focusState?.type === "tag" && focusState.value === stat.tag;
                    return (
                      <li key={stat.tag}>
                        <div className="flex items-center justify-between text-sm">
                          <button
                            type="button"
                            className={`rounded-full px-2 py-0.5 text-left font-semibold transition ${
                              isFocused
                                ? "bg-amber-500 text-white"
                                : "text-slate-700 hover:bg-amber-50"
                            }`}
                            aria-pressed={isFocused}
                            onClick={() =>
                              isFocused
                                ? setFocusParams({ tag: null, priority: null })
                                : setFocusParams({ tag: stat.tag, priority: null })
                            }
                          >
                            #{stat.tag}
                          </button>
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

          {focusState ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Drilldown</p>
                  <h2 className="text-xl font-semibold text-slate-900">{focusLabel}</h2>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{focusTasks.length} task</span>
                  <span>{focusSteps.length} step</span>
                  <span>{focusLogs.length} log</span>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400"
                    onClick={() => setFocusParams({ tag: null, priority: null })}
                  >
                    Reset focus
                  </button>
                </div>
              </div>

              {focusTasks.length === 0 && focusSteps.length === 0 && focusLogs.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  Nessun elemento trovato per il focus selezionato.
                </div>
              ) : (
                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-700">Task</h3>
                    {focusTasks.length === 0 ? (
                      <p className="text-sm text-slate-500">Nessun task collegato.</p>
                    ) : (
                      <ul className="space-y-3">
                        {focusTasks.map((task) => {
                          const summary = getTaskStepSummary(stepsByTask, task.id);
                          return (
                            <li key={task.id} className="rounded-xl border border-slate-200 p-3">
                              <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                              <p className="text-xs text-slate-500">
                                Status {task.status.replace("_", " ")} •{" "}
                                {describePriority(task.priority)}
                              </p>
                              <p className="text-xs text-slate-500">
                                Progress {summary.done}/{summary.total} steps
                              </p>
                              <Link
                                href={`/tasks/${task.id}`}
                                className="mt-2 inline-flex text-xs font-semibold text-slate-700 hover:text-slate-900"
                              >
                                Vai al task →
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-700">Step</h3>
                    {focusSteps.length === 0 ? (
                      <p className="text-sm text-slate-500">Nessuna step collegata.</p>
                    ) : (
                      <ul className="space-y-3">
                        {focusSteps.map((step) => (
                          <li key={step.id} className="rounded-xl border border-slate-200 p-3">
                            <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                            <p className="text-xs text-slate-500">
                              Task: {taskTitleById.get(step.taskId) ?? "Task sconosciuto"}
                            </p>
                            <p className="text-xs text-slate-500">
                              Status {step.status.replace("_", " ")}
                            </p>
                            <Link
                              href={`/tasks/${step.taskId}`}
                              className="mt-2 inline-flex text-xs font-semibold text-slate-700 hover:text-slate-900"
                            >
                              Apri task →
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-700">Work log</h3>
                    {focusLogs.length === 0 ? (
                      <p className="text-sm text-slate-500">Nessun work log collegato.</p>
                    ) : (
                      <ul className="space-y-3">
                        {focusLogs.map((log) => (
                          <li key={log.id} className="rounded-xl border border-slate-200 p-3">
                            <p className="text-sm font-semibold text-slate-900">
                              {taskTitleById.get(log.taskId) ?? "Task sconosciuto"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {log.type.toUpperCase()} •{" "}
                              {new Date(log.timestamp).toLocaleString()}
                            </p>
                            {log.stepId ? (
                              <p className="text-xs text-slate-500">
                                Step: {stepTitleById.get(log.stepId) ?? log.stepId}
                              </p>
                            ) : null}
                            {log.message ? (
                              <p className="text-xs text-slate-600">{log.message}</p>
                            ) : null}
                            <Link
                              href={`/tasks/${log.taskId}`}
                              className="mt-2 inline-flex text-xs font-semibold text-slate-700 hover:text-slate-900"
                            >
                              Apri task →
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Trend mensili</p>
                <h2 className="text-xl font-semibold text-slate-900">Ore, top task e top tag</h2>
              </div>
              <span className="text-xs text-slate-400">Ultimi 6 mesi</span>
            </div>
            {!hasTrendData ? (
              <p className="mt-4 text-sm text-slate-500">
                Nessun dato negli ultimi 6 mesi.
              </p>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {trendEntries.map((entry) => {
                  const topTaskLabel = entry.topTaskId
                    ? taskTitleById.get(entry.topTaskId) ?? "Task sconosciuto"
                    : "—";
                  const topTagLabel = entry.topTag ? `#${entry.topTag}` : "—";
                  return (
                    <article
                      key={entry.monthKey}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatMonthLabel(entry.monthKey)}
                          </p>
                          <p className="text-xs text-slate-500">
                            Totale {formatMinutesAsHours(entry.totalMinutes)}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {formatMinutesAsHours(entry.totalMinutes)}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        <p>
                          <span className="font-semibold text-slate-700">Top task:</span>{" "}
                          {topTaskLabel}{" "}
                          {entry.topTaskMinutes > 0
                            ? `(${formatMinutesAsHours(entry.topTaskMinutes)})`
                            : ""}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-700">Top tag:</span>{" "}
                          {topTagLabel}{" "}
                          {entry.topTagMinutes > 0
                            ? `(${formatMinutesAsHours(entry.topTagMinutes)})`
                            : ""}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
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
                const dayMinutes = calendarDay.isCurrentMonth
                  ? monthlyMinutesByDate.get(calendarDay.key) ?? 0
                  : 0;
                const heatmapStyles = getHeatmapStyles(dayMinutes, maxMonthlyMinutes);
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
                          ? `border-slate-900 ${heatmapStyles.bgClass} ring-2 ring-slate-900 ring-offset-1`
                          : `border-slate-200 ${heatmapStyles.bgClass}`
                        : "border-dashed border-slate-100 text-slate-300"
                    }`}
                  >
                    <p className="text-xs font-semibold">{calendarDay.label}</p>
                    {calendarDay.isCurrentMonth && dayMinutes > 0 ? (
                      <p className={`text-[10px] font-semibold ${heatmapStyles.textClass}`}>
                        {dayMinutes} min
                      </p>
                    ) : null}
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
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-600">Meno</span>
              <div className="flex items-center gap-1">
                {[
                  "bg-white",
                  "bg-emerald-50",
                  "bg-emerald-100",
                  "bg-emerald-200",
                  "bg-emerald-300",
                ].map((bgClass) => (
                  <span
                    key={bgClass}
                    className={`h-3 w-3 rounded border border-slate-200 ${bgClass}`}
                  />
                ))}
              </div>
              <span className="font-semibold text-slate-600">Più</span>
              <span className="text-slate-400">
                Max giornaliero: {maxMonthlyMinutes} min
              </span>
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
                  <p className="mt-2 text-xs font-semibold text-slate-600">
                    Totale worklog: {monthlyMinutesByDate.get(selectedDayInfo.key) ?? 0} min
                  </p>
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
