/**
 * Report — how the month's hours divide across tasks.
 *
 * Sessions are paired over the COMPLETE history and only then narrowed to the selected period, so a
 * session begun on the last evening of a month and stopped after midnight still reports its
 * minutes. Pairing the filtered slice instead — which is what this page used to do — made such a
 * session worth zero minutes in every month, because its start and its stop never appeared in the
 * same slice.
 */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import Verdict from "../../components/Verdict";
import { ErrorNote, TagList } from "../../components/controls";
import { useNow } from "../../hooks/useNow";
import { useTaskStore } from "../../hooks/useTaskStore";
import { aOrAd, formatMinutes, instantDayKey, todayKey } from "../../lib/dates";
import {
  buildMonthlyReportSummary,
  buildTaskTagSummary,
  groupWorkLogsByTag,
} from "../../lib/insights";
import { readSlice } from "../../lib/verdicts";

const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

const ReportPage = () => {
  const { workLogs, tasks, isHydrated, loadError, refresh } = useTaskStore();
  const now = useNow();
  const today = todayKey(now);

  const [year, setYear] = useState(today.slice(0, 4));
  const [month, setMonth] = useState(today.slice(5, 7));
  const [tag, setTag] = useState("tutti");

  const logsByTag = useMemo(() => groupWorkLogsByTag(workLogs), [workLogs]);
  const taskTitles = useMemo(() => new Map(tasks.map((task) => [task.id, task.title])), [tasks]);

  const availableYears = useMemo(() => {
    const years = new Set(workLogs.map((log) => instantDayKey(log.timestamp).slice(0, 4)));
    years.add(today.slice(0, 4));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [today, workLogs]);

  const availableTags = useMemo(
    () => Array.from(logsByTag.keys()).sort((a, b) => a.localeCompare(b)),
    [logsByTag],
  );

  const isInScope = useMemo(() => {
    const tagged = tag === "tutti" ? null : new Set((logsByTag.get(tag) ?? []).map((log) => log.id));
    return (log: { id: string; timestamp: string }) => {
      const dayKey = instantDayKey(log.timestamp);
      if (dayKey.slice(0, 4) !== year) return false;
      if (month !== "tutti" && dayKey.slice(5, 7) !== month) return false;
      if (tagged && !tagged.has(log.id)) return false;
      return true;
    };
  }, [logsByTag, month, tag, year]);

  const scopedLogs = useMemo(() => workLogs.filter(isInScope), [isInScope, workLogs]);
  const entries = useMemo(
    () => buildMonthlyReportSummary(workLogs, isInScope),
    [isInScope, workLogs],
  );
  const tagSummary = useMemo(() => buildTaskTagSummary(scopedLogs), [scopedLogs]);

  const scopeLabel = useMemo(() => {
    const monthName = month === "tutti" ? "" : MONTHS[Number(month) - 1].toLowerCase();
    const monthLabel = monthName ? `${aOrAd(monthName)} ${monthName} ` : "";
    const tagLabel = tag === "tutti" ? "" : ` su #${tag}`;
    return `${monthLabel}${year}${tagLabel}`;
  }, [month, tag, year]);

  const verdict = useMemo(
    () => readSlice(workLogs, scopedLogs, scopeLabel),
    [scopeLabel, scopedLogs, workLogs],
  );

  const totalMinutes = entries.reduce((sum, entry) => sum + entry.totalMinutes, 0);
  const filterClasses = "border border-line bg-panel px-2 py-1.5 font-mono text-tiny text-ink";

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        {loadError ? (
          <div className="mb-8">
            <ErrorNote onRetry={() => void refresh()}>Non sono riuscito a leggere i dati.</ErrorNote>
          </div>
        ) : null}

        {!isHydrated ? (
          <p className="font-mono text-tiny uppercase tracking-wider text-ink-muted">Leggo i dati…</p>
        ) : (
          <>
            <Verdict verdict={verdict}>
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="report-anno" className="sr-only">
                  Anno
                </label>
                <select
                  id="report-anno"
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  className={filterClasses}
                >
                  {availableYears.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>

                <label htmlFor="report-mese" className="sr-only">
                  Mese
                </label>
                <select
                  id="report-mese"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className={filterClasses}
                >
                  <option value="tutti">Tutto l&apos;anno</option>
                  {MONTHS.map((label, index) => (
                    <option key={label} value={String(index + 1).padStart(2, "0")}>
                      {label}
                    </option>
                  ))}
                </select>

                <label htmlFor="report-tag" className="sr-only">
                  Tag
                </label>
                <select
                  id="report-tag"
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  disabled={availableTags.length === 0}
                  className={`${filterClasses} disabled:opacity-50`}
                >
                  <option value="tutti">Tutti i tag</option>
                  {availableTags.map((value) => (
                    <option key={value} value={value}>
                      #{value}
                    </option>
                  ))}
                </select>
              </div>
            </Verdict>

            {entries.length > 0 ? (
              <table className="mt-10 w-full border-collapse text-left">
                <caption className="sr-only">
                  Ore registrate per task {scopeLabel}
                </caption>
                <thead>
                  <tr className="border-b border-line-strong">
                    <th
                      scope="col"
                      className="pb-2 font-mono text-micro uppercase tracking-wider text-ink-muted"
                    >
                      Task
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-right font-mono text-micro uppercase tracking-wider text-ink-muted"
                    >
                      Voci
                    </th>
                    <th
                      scope="col"
                      className="pb-2 text-right font-mono text-micro uppercase tracking-wider text-ink-muted"
                    >
                      Tempo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const summary = tagSummary.get(entry.taskId);
                    return (
                      <tr key={entry.taskId} className="border-b border-line align-top">
                        <td className="py-3 pr-4">
                          <Link
                            href={`/tasks/${entry.taskId}`}
                            className="font-prose text-base text-ink no-underline hover:underline"
                          >
                            {taskTitles.get(entry.taskId) ?? "Task eliminato"}
                          </Link>
                          {summary && summary.tags.length > 0 ? (
                            <div className="mt-1">
                              <TagList tags={summary.tags} />
                            </div>
                          ) : null}
                          {entry.highlights.length > 0 ? (
                            <ul className="mt-2 flex flex-col gap-1">
                              {entry.highlights.map((highlight) => (
                                <li
                                  key={highlight}
                                  className="max-w-measure font-prose text-tiny text-ink-muted"
                                >
                                  {highlight}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td
                          data-numeric
                          className="py-3 text-right font-mono text-tiny text-ink-muted"
                        >
                          {entry.logCount}
                        </td>
                        <td
                          data-numeric
                          className="py-3 text-right font-mono text-small font-medium text-ink"
                        >
                          {formatMinutes(entry.totalMinutes)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th
                      scope="row"
                      className="pt-3 text-left font-mono text-micro uppercase tracking-wider text-ink-muted"
                    >
                      Totale
                    </th>
                    <td />
                    <td
                      data-numeric
                      className="pt-3 text-right font-mono text-small font-semibold text-ink"
                    >
                      {formatMinutes(totalMinutes)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : null}
          </>
        )}
      </main>
    </AppShell>
  );
};

export default ReportPage;
