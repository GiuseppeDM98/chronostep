"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AuthGate from "../../components/AuthGate";
import { useTaskStore } from "../../hooks/useTaskStore";
import { buildStepsByTask, buildTaskActivity, describePriority, getTaskStepSummary } from "../../lib/insights";
import type { WorkLog } from "../../lib/types";

type GroupedLogs = Array<{
  dateLabel: string;
  logs: WorkLog[];
}>;

// Format a log date with locale-aware day/month labels for section headers.
const formatDate = (value: string) => {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// Keep time display compact so log rows stay readable on mobile.
const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const MONTH_OPTIONS = [
  { value: "all", label: "Tutti i mesi" },
  { value: "1", label: "Gennaio" },
  { value: "2", label: "Febbraio" },
  { value: "3", label: "Marzo" },
  { value: "4", label: "Aprile" },
  { value: "5", label: "Maggio" },
  { value: "6", label: "Giugno" },
  { value: "7", label: "Luglio" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Settembre" },
  { value: "10", label: "Ottobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Dicembre" },
];

const TimelinePage = () => {
  const { workLogs, tasks, steps, isHydrated } = useTaskStore();
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const stepsByTask = useMemo(() => buildStepsByTask(steps), [steps]);
  const { logDurations, taskActivity } = useMemo(
    () => buildTaskActivity(workLogs),
    [workLogs],
  );

  const taskLookup = useMemo(() => {
    const map = new Map(tasks.map((task) => [task.id, task.title]));
    return map;
  }, [tasks]);

  const stepLookup = useMemo(() => {
    const map = new Map(steps.map((step) => [step.id, step.title]));
    return map;
  }, [steps]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    workLogs.forEach((log) => {
      set.add(new Date(log.timestamp).getFullYear());
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [workLogs]);

  const groupedLogs: GroupedLogs = useMemo(() => {
    const logs = workLogs
      .filter((log) => {
        const date = new Date(log.timestamp);
        const yearPass =
          selectedYear === "all" || date.getFullYear().toString() === selectedYear;
        const monthPass =
          selectedMonth === "all" || (date.getMonth() + 1).toString() === selectedMonth;
        return yearPass && monthPass;
      })
      // Sort newest first so the timeline reads top-down by recency.
      .sort(
        (a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf(),
      );

    const groups = new Map<string, typeof logs>();
    logs.forEach((log) => {
      // Bucket by ISO day to keep timezone-safe grouping across locales.
      const dateKey = new Date(log.timestamp).toISOString().slice(0, 10);
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(log);
    });

    const sortedGroups = Array.from(groups.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([dateKey, logsForDay]) => ({
        dateLabel: formatDate(logsForDay[0].timestamp),
        logs: logsForDay,
      }));
    return sortedGroups;
  }, [workLogs, selectedMonth, selectedYear]);

  return (
    <AuthGate>
      <main className="mx-auto w-full max-w-4xl p-6">
      <header className="mb-6 space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:border-slate-400"
        >
          ← Torna alla Home
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Chronostep</p>
          <h1 className="text-3xl font-bold text-slate-900">Timeline</h1>
          <p className="text-sm text-slate-500">Registro cronologico delle attività più recenti.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={selectedYear}
            onChange={(event) => setSelectedYear(event.target.value)}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700"
          >
            <option value="all">Tutti gli anni</option>
            {availableYears.map((year) => (
              <option key={year} value={year.toString()}>
                {year}
              </option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700"
          >
            {MONTH_OPTIONS.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {!isHydrated ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
          Caricamento dati locali…
        </div>
      ) : groupedLogs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
          Nessun log registrato. Crea il tuo primo WorkLog dalla pagina di un task.
        </div>
      ) : (
        <div className="space-y-6">
          {groupedLogs.map((group) => (
            <section key={group.dateLabel}>
              <h2 className="text-sm font-semibold uppercase text-slate-500">{group.dateLabel}</h2>
              <ol className="mt-3 space-y-3">
                {group.logs.map((log) => {
                  const progress = getTaskStepSummary(stepsByTask, log.taskId);
                  const durationMinutes = logDurations.get(log.id);
                  const activity = taskActivity.get(log.taskId);
                  return (
                    <li
                      key={log.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {taskLookup.get(log.taskId) ?? "Task sconosciuto"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {log.type.toUpperCase()} • {formatTime(log.timestamp)}
                              {log.stepId
                                ? ` • Step: ${stepLookup.get(log.stepId) ?? log.stepId}`
                                : ""}
                            </p>
                          </div>
                          <div className="text-right text-xs text-slate-500">
                            <p>{new Date(log.timestamp).toLocaleTimeString()}</p>
                            <p>{describePriority(tasks.find((task) => task.id === log.taskId)?.priority)}</p>
                          </div>
                        </div>
                        {log.message ? (
                          <p className="text-sm text-slate-700">{log.message}</p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                          <span className="font-semibold">
                            Progress {progress.done}/{progress.total}
                          </span>
                          {durationMinutes ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                              {durationMinutes} min
                            </span>
                          ) : null}
                          {activity?.lastLogTimestamp === log.timestamp ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                              Ultimo aggiornamento
                            </span>
                          ) : null}
                          <Link
                            href={`/insights?task=${encodeURIComponent(log.taskId)}`}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-700 transition hover:border-slate-400"
                          >
                            Vai a Insights
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </main>
    </AuthGate>
  );
};

export default TimelinePage;
