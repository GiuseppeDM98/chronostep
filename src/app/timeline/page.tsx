/**
 * Timeline — the work log, newest first, grouped by day.
 *
 * Grouping and labelling both use the LOCAL day. They used to disagree: logs were bucketed by UTC
 * day and the heading was formatted from the newest log's local date, so a late-evening session
 * appeared under a heading naming the following day, contradicting the time printed on its own row.
 * The day key is also the React key here, which the localized label was not — two groups could
 * produce the same label and collide.
 */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import Verdict from "../../components/Verdict";
import { ErrorNote, TagList } from "../../components/controls";
import { useTaskStore } from "../../hooks/useTaskStore";
import {
  aOrAd,
  formatDayKey,
  formatInstantTime,
  formatMinutes,
  instantDayKey,
} from "../../lib/dates";
import { buildTaskActivity, groupWorkLogsByTag } from "../../lib/insights";
import { readSlice } from "../../lib/verdicts";
import type { WorkLog } from "../../lib/types";

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

const TimelinePage = () => {
  const { workLogs, tasks, steps, isHydrated, loadError, refresh } = useTaskStore();
  const [year, setYear] = useState("tutti");
  const [month, setMonth] = useState("tutti");
  const [tag, setTag] = useState("tutti");

  const { logDurations } = useMemo(() => buildTaskActivity(workLogs), [workLogs]);
  const logsByTag = useMemo(() => groupWorkLogsByTag(workLogs), [workLogs]);
  const taskTitles = useMemo(() => new Map(tasks.map((task) => [task.id, task.title])), [tasks]);
  const stepTitles = useMemo(() => new Map(steps.map((step) => [step.id, step.title])), [steps]);

  const availableYears = useMemo(() => {
    const years = new Set(workLogs.map((log) => instantDayKey(log.timestamp).slice(0, 4)));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [workLogs]);

  const availableTags = useMemo(
    () => Array.from(logsByTag.keys()).sort((a, b) => a.localeCompare(b)),
    [logsByTag],
  );

  const scopedLogs = useMemo(() => {
    const base = tag === "tutti" ? workLogs : logsByTag.get(tag) ?? [];
    return base.filter((log) => {
      const dayKey = instantDayKey(log.timestamp);
      const yearPass = year === "tutti" || dayKey.slice(0, 4) === year;
      const monthPass = month === "tutti" || dayKey.slice(5, 7) === month;
      return yearPass && monthPass;
    });
  }, [logsByTag, month, tag, workLogs, year]);

  /** Groups are keyed by the day key itself — stable, unique, and sortable as a string. */
  const groups = useMemo(() => {
    const byDay = new Map<string, WorkLog[]>();
    scopedLogs.forEach((log) => {
      const dayKey = instantDayKey(log.timestamp);
      const bucket = byDay.get(dayKey) ?? [];
      bucket.push(log);
      byDay.set(dayKey, bucket);
    });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dayKey, logs]) => ({
        dayKey,
        logs: [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
        minutes: logs.reduce((sum, log) => sum + (logDurations.get(log.id) ?? 0), 0),
      }));
  }, [logDurations, scopedLogs]);

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (month !== "tutti") {
      const monthName = MONTHS[Number(month) - 1].toLowerCase();
      parts.push(`${aOrAd(monthName)} ${monthName}`);
    }
    if (year !== "tutti") parts.push(`nel ${year}`);
    if (tag !== "tutti") parts.push(`su #${tag}`);
    return parts.length > 0 ? parts.join(" ") : "in tutto";
  }, [month, tag, year]);

  const verdict = useMemo(
    () => readSlice(workLogs, scopedLogs, scopeLabel),
    [scopeLabel, scopedLogs, workLogs],
  );

  const filterClasses =
    "border border-line bg-panel px-2 py-1.5 font-mono text-tiny text-ink";

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        {loadError ? (
          <div className="mb-8">
            <ErrorNote onRetry={() => void refresh()}>
              Non sono riuscito a leggere il registro.
            </ErrorNote>
          </div>
        ) : null}

        {!isHydrated ? (
          <p className="font-mono text-tiny uppercase tracking-wider text-ink-muted">Leggo i dati…</p>
        ) : (
          <>
            <Verdict verdict={verdict}>
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="filtro-anno" className="sr-only">
                  Anno
                </label>
                <select
                  id="filtro-anno"
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  className={filterClasses}
                >
                  <option value="tutti">Tutti gli anni</option>
                  {availableYears.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>

                <label htmlFor="filtro-mese" className="sr-only">
                  Mese
                </label>
                <select
                  id="filtro-mese"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className={filterClasses}
                >
                  <option value="tutti">Tutti i mesi</option>
                  {MONTHS.map((label, index) => (
                    <option key={label} value={String(index + 1).padStart(2, "0")}>
                      {label}
                    </option>
                  ))}
                </select>

                <label htmlFor="filtro-tag" className="sr-only">
                  Tag
                </label>
                <select
                  id="filtro-tag"
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

            <div className="mt-10 flex flex-col gap-10">
              {groups.map((group) => (
                <section key={group.dayKey} aria-labelledby={`giorno-${group.dayKey}`}>
                  <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
                    <h2
                      id={`giorno-${group.dayKey}`}
                      className="font-mono text-micro uppercase tracking-wider text-ink-muted"
                    >
                      {formatDayKey(group.dayKey, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </h2>
                    {group.minutes > 0 ? (
                      <span data-numeric className="font-mono text-tiny font-medium text-ink">
                        {formatMinutes(group.minutes)}
                      </span>
                    ) : null}
                  </div>

                  <ol>
                    {group.logs.map((log) => {
                      const minutes = logDurations.get(log.id);
                      return (
                        <li
                          key={log.id}
                          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line py-3"
                        >
                          <time
                            dateTime={log.timestamp}
                            data-numeric
                            className="w-12 shrink-0 font-mono text-tiny text-ink-muted"
                          >
                            {formatInstantTime(log.timestamp)}
                          </time>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/tasks/${log.taskId}`}
                              className="font-prose text-base text-ink no-underline hover:underline"
                            >
                              {taskTitles.get(log.taskId) ?? "Task eliminato"}
                            </Link>
                            {log.stepId ? (
                              <span className="ml-2 font-mono text-tiny text-ink-muted">
                                su {stepTitles.get(log.stepId) ?? "step eliminato"}
                              </span>
                            ) : null}
                            {log.message ? (
                              <p className="mt-0.5 max-w-measure font-prose text-base text-ink-muted">
                                {log.message}
                              </p>
                            ) : null}
                            {log.tags.length > 0 ? (
                              <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                                <TagList tags={log.tags} limit={5} />
                                {/* Back into the Insights drilldown, filtered by this log's first tag. */}
                                <Link
                                  href={`/insights?tag=${encodeURIComponent(log.tags[0])}`}
                                  className="font-mono text-micro uppercase tracking-wider text-ink-muted no-underline hover:text-ink"
                                >
                                  Vedi in Insights
                                </Link>
                              </div>
                            ) : null}
                          </div>
                          <span
                            data-numeric
                            className="w-16 shrink-0 text-right font-mono text-tiny text-ink"
                          >
                            {minutes ? formatMinutes(minutes) : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
};

export default TimelinePage;
