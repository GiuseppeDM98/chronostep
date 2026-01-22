/**
 * ReportPage - Monthly time report by task
 *
 * Aggregates work logs into monthly summaries showing:
 * - Total minutes per task
 * - Note highlights
 * - Tag breakdown
 *
 * Filters by year, month, and tag.
 */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AuthGate from "../../components/AuthGate";
import { useTaskStore } from "../../hooks/useTaskStore";
import {
  buildMonthlyReportSummary,
  buildTaskTagSummary,
  groupWorkLogsByTag,
} from "../../lib/insights";

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

// Format minutes into compact hours/minutes label for report totals.
// Omits zero values (e.g., "2h 30m", "45m", "3h" but not "0h 0m").
const formatMinutes = (totalMinutes: number) => {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

/**
 * ReportPage - Monthly work log report
 *
 * Displays aggregated time tracking data grouped by task,
 * with filter controls for year, month, and tag.
 */
const ReportPage = () => {
  const { workLogs, tasks, isHydrated } = useTaskStore();
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const logsByTag = useMemo(() => groupWorkLogsByTag(workLogs), [workLogs]);

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

  const availableTags = useMemo(
    () => Array.from(logsByTag.keys()).sort((a, b) => a.localeCompare(b)),
    [logsByTag],
  );

  // Pre-filter by tag before applying year/month filters
  // (more efficient than filtering by all three at once)
  const tagFilteredLogs = useMemo(
    () => (selectedTag === "all" ? workLogs : logsByTag.get(selectedTag) ?? []),
    [logsByTag, selectedTag, workLogs],
  );

  // Apply year and month filters to tag-filtered logs
  const filteredLogs = useMemo(
    () =>
      tagFilteredLogs.filter((log) => {
        const date = new Date(log.timestamp);
        const yearPass =
          selectedYear === "all" || date.getFullYear().toString() === selectedYear;
        const monthPass =
          selectedMonth === "all" || (date.getMonth() + 1).toString() === selectedMonth;
        return yearPass && monthPass;
      }),
    [selectedMonth, selectedYear, tagFilteredLogs],
  );

  const reportEntries = useMemo(
    () => buildMonthlyReportSummary(filteredLogs),
    [filteredLogs],
  );
  const tagSummaryByTask = useMemo(
    () => buildTaskTagSummary(filteredLogs),
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
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            <p className="font-semibold text-slate-900">Tag: perché usarli</p>
            <p className="mt-1 text-sm text-slate-600">
              Usa tag come cliente, progetto o tipo lavoro per isolare le attività nel report.
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
            <select
              value={selectedTag}
              onChange={(event) => setSelectedTag(event.target.value)}
              className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700"
              disabled={availableTags.length === 0}
            >
              <option value="all">Tutti i tag</option>
              {availableTags.length === 0 ? (
                <option value="" disabled>
                  Nessun tag
                </option>
              ) : (
                availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))
              )}
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
            {reportEntries.map((entry) => {
              const summary = tagSummaryByTask.get(entry.taskId);
              return (
                <article
                  key={entry.taskId}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  {summary && summary.tags.length > 0 ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      {summary.tags.map((tag) => (
                        <span
                          key={`${entry.taskId}-tag-${tag}`}
                          className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600"
                        >
                          #{tag}
                        </span>
                      ))}
                      {summary.overflowCount > 0 ? (
                        <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-500">
                          +{summary.overflowCount}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {taskLookup.get(entry.taskId) ?? "Task sconosciuto"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {entry.logCount} log  {formatMinutes(entry.totalMinutes)}
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
                          <span className="text-slate-400"></span>
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
              );
            })}
          </section>
        )}
      </main>
    </AuthGate>
  );
};

export default ReportPage;
