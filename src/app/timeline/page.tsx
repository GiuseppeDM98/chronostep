"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AuthGate from "../../components/AuthGate";
import { useTaskStore } from "../../hooks/useTaskStore";
import type { WorkLog } from "../../lib/types";

type GroupedLogs = Array<{
  dateLabel: string;
  logs: WorkLog[];
}>;

const formatDate = (value: string) => {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

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
      .sort(
        (a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf(),
      );

    const groups = new Map<string, typeof logs>();
    logs.forEach((log) => {
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
                {group.logs.map((log) => (
                  <li
                    key={log.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {taskLookup.get(log.taskId) ?? "Task sconosciuto"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {log.type.toUpperCase()} • {formatTime(log.timestamp)}
                          {log.stepId ? ` • Step: ${stepLookup.get(log.stepId) ?? log.stepId}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {log.message ? (
                      <p className="mt-2 text-sm text-slate-700">{log.message}</p>
                    ) : null}
                  </li>
                ))}
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
