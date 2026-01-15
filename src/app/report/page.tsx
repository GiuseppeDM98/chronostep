"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AuthGate from "../../components/AuthGate";
import { useTaskStore } from "../../hooks/useTaskStore";
import { buildMonthlyReportSummary } from "../../lib/insights";

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

// Format minutes into a compact hours/minutes label for report totals.
const formatMinutes = (totalMinutes: number) => {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

const ReportPage = () => {
  const { workLogs, tasks, isHydrated } = useTaskStore();
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const taskLookup = useMemo(() => {
    const map = new Map(tasks.map((task) => [task.id, task.title]));
    return map;
  }, [tasks]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    workLogs.forEach((log) => {
      set.add(new Date(log.timestamp).getFullYear());
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [workLogs]);

  const filteredLogs = useMemo(
    () =>
      workLogs.filter((log) => {
        const date = new Date(log.timestamp);
        const yearPass =
          selectedYear === "all" || date.getFullYear().toString() === selectedYear;
        const monthPass =
          selectedMonth === "all" || (date.getMonth() + 1).toString() === selectedMonth;
        return yearPass && monthPass;
      }),
    [workLogs, selectedMonth, selectedYear],
  );

  const reportEntries = useMemo(
    () => buildMonthlyReportSummary(filteredLogs),
    [filteredLogs],
  );

  const totalMinutes = useMemo(
    () => reportEntries.reduce((sum, entry) => sum + entry.totalMinutes, 0),
    [reportEntries],
  );

  return (
    <AuthGate>
      <main className="mx-auto w-full max-w-4xl p-6">
        <header className="mb-6 space-y-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:border-slate-400"
          >
            Torna alla Home
          </Link>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Chronostep</p>
            <h1 className="text-3xl font-bold text-slate-900">Report mensile</h1>
            <p className="text-sm text-slate-500">
              Riepilogo ore e highlights delle note per task.
            </p>
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
            Caricamento dati locali.
          </div>
        ) : reportEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            Nessun log nel periodo selezionato.
          </div>
        ) : (
          <section className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
              <span className="font-semibold text-slate-900">
                Totale mese: {formatMinutes(totalMinutes)}
              </span>
              <span className="ml-3 text-xs text-slate-500">
                {reportEntries.length} task con attivita
              </span>
            </div>
            {reportEntries.map((entry) => (
              <article
                key={entry.taskId}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {taskLookup.get(entry.taskId) ?? "Task sconosciuto"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.logCount} log • {formatMinutes(entry.totalMinutes)}
                    </p>
                  </div>
                  <Link
                    href={`/tasks/${encodeURIComponent(entry.taskId)}`}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400"
                  >
                    Apri task
                  </Link>
                </div>
                {entry.highlights.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {entry.highlights.map((highlight, index) => (
                      <li key={`${entry.taskId}-highlight-${index}`} className="flex gap-2">
                        <span className="text-slate-400">•</span>
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    Nessuna nota rilevante per questo task.
                  </p>
                )}
              </article>
            ))}
          </section>
        )}
      </main>
    </AuthGate>
  );
};

export default ReportPage;
