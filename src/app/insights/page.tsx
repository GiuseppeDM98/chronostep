/**
 * Insights — where the month goes.
 *
 * The calendar and the trend figures are built from the same local-day buckets, so the two panels
 * add up to the same total. They used to disagree: the heatmap grouped by UTC day while the trends
 * grouped by local month, which shifted late-evening work onto the next day and, at a month
 * boundary, out of the month entirely.
 *
 * There is no KPI row on this page. Every figure worth stating is already in the opening paragraph,
 * and repeating it in a tile would be the dashboard this design refuses.
 *
 * The priority and tag rows are a drilldown, not a readout: picking one filters the tasks, steps and
 * work logs underneath, in place. The selection lives in the query string so a view can be linked to
 * and survives a reload.
 */
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import Verdict from "../../components/Verdict";
import { ErrorNote } from "../../components/controls";
import { useNow } from "../../hooks/useNow";
import { useTaskStore } from "../../hooks/useTaskStore";
import {
  daysBetweenKeys,
  daysUntilDue,
  formatDayKey,
  formatInstantTime,
  formatMinutes,
  formatMonthKey,
  instantDayKey,
  todayKey,
} from "../../lib/dates";
import { buildDailyWorkLogTotals, buildTaskActivity, buildMonthlyTrends } from "../../lib/insights";
import { readInsights } from "../../lib/verdicts";
import type { Step, Task, WorkLog } from "../../lib/types";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const PRIORITY_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Media",
  low: "Bassa",
  none: "Nessuna",
};
const PRIORITY_ORDER = ["high", "medium", "low", "none"] as const;

/** Days of `monthKey` laid out Monday-first, plus the blanks that pad the first week. */
const buildMonthGrid = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  const firstOfMonth = new Date(year, month - 1, 1);
  // getDay() is Sunday=0; shift so Monday is 0, matching the Italian week.
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: Array<{ key: string; dayKey?: string; label?: string }> = [];
  for (let index = 0; index < startOffset; index += 1) {
    cells.push({ key: `vuoto-${index}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    cells.push({ key: dayKey, dayKey, label: String(day) });
  }
  return cells;
};

const shiftMonth = (monthKey: string, delta: number) => {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
};

/** What the drilldown is currently filtered by, read from the query string. */
type Focus =
  | { kind: "priority"; value: string }
  | { kind: "tag"; value: string }
  | null;

const InsightsPageContent = () => {
  const { tasks, steps, workLogs, isHydrated, loadError, refresh } = useTaskStore();
  const now = useNow();
  const today = todayKey(now);

  const [monthKey, setMonthKey] = useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  const focus: Focus = useMemo(() => {
    const tag = searchParams.get("tag")?.trim();
    if (tag) return { kind: "tag", value: tag };
    const priority = searchParams.get("priorita")?.trim();
    if (priority && PRIORITY_ORDER.includes(priority as (typeof PRIORITY_ORDER)[number])) {
      return { kind: "priority", value: priority };
    }
    return null;
  }, [searchParams]);

  // Selecting the row that is already selected clears it, so the same control is the way out.
  const setFocus = useCallback(
    (next: Focus) => {
      const params = new URLSearchParams();
      if (next?.kind === "tag") params.set("tag", next.value);
      if (next?.kind === "priority") params.set("priorita", next.value);
      const query = params.toString();
      router.replace(query ? `/insights?${query}` : "/insights", { scroll: false });
    },
    [router],
  );

  const reading = useMemo(() => readInsights({ workLogs, now }), [workLogs, now]);
  const { logDurations, taskActivity } = useMemo(() => buildTaskActivity(workLogs), [workLogs]);
  const minutesByDay = useMemo(
    () => buildDailyWorkLogTotals(workLogs, logDurations),
    [logDurations, workLogs],
  );
  const trends = useMemo(() => buildMonthlyTrends(workLogs), [workLogs]);

  const grid = useMemo(() => buildMonthGrid(monthKey), [monthKey]);
  const peakOfMonth = useMemo(() => {
    let peak = 0;
    minutesByDay.forEach((minutes, dayKey) => {
      if (dayKey.startsWith(monthKey) && minutes > peak) peak = minutes;
    });
    return peak;
  }, [minutesByDay, monthKey]);

  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== "done"), [tasks]);

  /** Upcoming work, bounded at both ends: overdue items belong on Oggi, not in a "what's next" list. */
  const upcoming = useMemo(
    () =>
      activeTasks
        .filter((task) => {
          if (!task.dueDate) return false;
          const days = daysUntilDue(task.dueDate, now);
          return days >= 0 && days <= 21;
        })
        .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string))
        .slice(0, 6),
    [activeTasks, now],
  );

  const priorityLoad = useMemo(
    () =>
      PRIORITY_ORDER.map((level) => {
        const bucket = activeTasks.filter((task) => (task.priority ?? "none") === level);
        const minutes = bucket.reduce(
          (sum, task) => sum + (taskActivity.get(task.id)?.totalMinutes ?? 0),
          0,
        );
        return { level, tasks: bucket.length, minutes };
      }).filter((row) => row.tasks > 0),
    [activeTasks, taskActivity],
  );
  const maxPriorityMinutes = Math.max(1, ...priorityLoad.map((row) => row.minutes));

  const tagLoad = useMemo(() => {
    const minutesByTag = new Map<string, number>();
    workLogs.forEach((log) => {
      const minutes = logDurations.get(log.id);
      if (!minutes) return;
      new Set(log.tags.map((tag) => tag.trim()).filter(Boolean)).forEach((tag) => {
        minutesByTag.set(tag, (minutesByTag.get(tag) ?? 0) + minutes);
      });
    });
    return Array.from(minutesByTag.entries())
      .map(([tag, minutes]) => ({ tag, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 6);
  }, [logDurations, workLogs]);
  const maxTagMinutes = Math.max(1, ...tagLoad.map((row) => row.minutes));

  const recentMonths = useMemo(() => {
    const months: string[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) months.push(shiftMonth(today.slice(0, 7), -offset));
    return months;
  }, [today]);
  const maxMonthMinutes = Math.max(
    1,
    ...recentMonths.map((key) => trends.get(key)?.totalMinutes ?? 0),
  );

  const focusResult = useMemo(() => {
    if (!focus) return null;

    const matchedTasks: Task[] =
      focus.kind === "priority"
        ? tasks.filter((task) => (task.priority ?? "none") === focus.value)
        : tasks.filter((task) => task.tags?.includes(focus.value));
    const taskIds = new Set(matchedTasks.map((task) => task.id));

    const matchedSteps: Step[] = steps
      .filter((step) => taskIds.has(step.taskId))
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

    // A tag filter follows the tag on the log itself; a priority filter follows the task.
    const matchedLogs: WorkLog[] = (
      focus.kind === "tag"
        ? workLogs.filter((log) => log.tags.includes(focus.value))
        : workLogs.filter((log) => taskIds.has(log.taskId))
    ).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const minutes = matchedLogs.reduce((sum, log) => sum + (logDurations.get(log.id) ?? 0), 0);
    const label = focus.kind === "tag" ? `#${focus.value}` : PRIORITY_LABELS[focus.value];

    return { matchedTasks, matchedSteps, matchedLogs, minutes, label };
  }, [focus, logDurations, steps, tasks, workLogs]);

  const taskTitles = useMemo(() => new Map(tasks.map((task) => [task.id, task.title])), [tasks]);

  const selectedMinutes = selectedDay ? minutesByDay.get(selectedDay) ?? 0 : 0;
  const selectedTasks: Task[] = useMemo(
    () => (selectedDay ? tasks.filter((task) => task.dueDate === selectedDay) : []),
    [selectedDay, tasks],
  );

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        {loadError ? (
          <div className="mb-8">
            <ErrorNote onRetry={() => void refresh()}>Non sono riuscito a leggere i dati.</ErrorNote>
          </div>
        ) : null}

        {!isHydrated ? (
          <p className="font-mono text-tiny uppercase tracking-wider text-ink-muted">Leggo i dati…</p>
        ) : (
          <>
            <Verdict verdict={reading.verdict} />

            {!reading.verdict.isSparse ? (
              <>
                {/* ── Calendario ────────────────────────────────────── */}
                <section className="mt-12" aria-labelledby="titolo-calendario">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3">
                    <h2
                      id="titolo-calendario"
                      className="font-mono text-micro uppercase tracking-wider text-ink-muted"
                    >
                      {formatMonthKey(monthKey)}
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMonthKey(shiftMonth(monthKey, -1))}
                        aria-label="Mese precedente"
                        className="min-h-[2rem] border border-line px-2.5 font-mono text-tiny text-ink-muted hover:text-ink"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonthKey(shiftMonth(monthKey, 1))}
                        aria-label="Mese successivo"
                        className="min-h-[2rem] border border-line px-2.5 font-mono text-tiny text-ink-muted hover:text-ink"
                      >
                        →
                      </button>
                    </div>
                  </div>

                  {/*
                    Seven columns fit a 390px phone once the per-day minutes drop out below sm: the
                    ink bar still carries how much, and the exact figure is one tap away in the day
                    panel. Forcing a 32rem minimum instead pushed Saturday and Sunday off the edge
                    inside a scroll container with no visible affordance — two days a week silently
                    missing is worse than a coarser cell.
                  */}
                  <div className="overflow-x-auto">
                    <div className="min-w-0 sm:min-w-[32rem]">
                      <div className="mt-4 grid grid-cols-7 gap-1">
                        {WEEKDAYS.map((day) => (
                          <span
                            key={day}
                            className="pb-1 text-center font-mono text-micro uppercase tracking-wider text-ink-muted"
                          >
                            {day}
                          </span>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {grid.map((cell) => {
                          if (!cell.dayKey) return <span key={cell.key} />;
                          const minutes = minutesByDay.get(cell.dayKey) ?? 0;
                          const intensity = peakOfMonth > 0 ? minutes / peakOfMonth : 0;
                          const isToday = cell.dayKey === today;
                          const isSelected = cell.dayKey === selectedDay;
                          return (
                            <button
                              key={cell.key}
                              type="button"
                              onClick={() => setSelectedDay(isSelected ? null : cell.dayKey ?? null)}
                              aria-pressed={isSelected}
                              aria-label={`${formatDayKey(cell.dayKey, {
                                day: "numeric",
                                month: "long",
                              })}: ${minutes > 0 ? formatMinutes(minutes) : "niente registrato"}`}
                              className={`flex h-14 flex-col items-stretch justify-between border p-1 text-left transition-colors sm:p-1.5 ${
                                isSelected ? "border-ink" : "border-line hover:border-line-strong"
                              }`}
                            >
                              <span
                                data-numeric
                                className={`font-mono text-tiny ${
                                  isToday ? "font-semibold text-ink underline" : "text-ink-muted"
                                }`}
                              >
                                {cell.label}
                              </span>
                              {/*
                                Quantity is drawn as rule length in ink, not as a green fill. Green
                                means "on track" everywhere else in this interface; spending it on
                                "many minutes" would make every other green ambiguous. Leaving the
                                cell unfilled also keeps the day number on a known background, so
                                its contrast is the guaranteed one.
                              */}
                              {minutes > 0 ? (
                                <span className="flex flex-col gap-1">
                                  <span
                                    data-numeric
                                    className="hidden font-mono text-micro font-medium text-ink sm:block"
                                  >
                                    {formatMinutes(minutes)}
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className="h-1 bg-ink"
                                    style={{ width: `${Math.max(8, Math.round(intensity * 100))}%` }}
                                  />
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {selectedDay ? (
                    <div className="mt-4 border-t border-line pt-4">
                      <h3 className="font-prose text-lead text-ink">
                        {formatDayKey(selectedDay, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </h3>
                      <p className="mt-1 font-prose text-base text-ink-muted">
                        {selectedMinutes > 0 ? (
                          <>
                            <span data-numeric className="font-mono text-ink">
                              {formatMinutes(selectedMinutes)}
                            </span>{" "}
                            registrati
                          </>
                        ) : (
                          "Niente registrato in questa giornata"
                        )}
                        {selectedTasks.length > 0
                          ? `, e ${selectedTasks.length === 1 ? "un task scade" : `${selectedTasks.length} task scadono`} qui.`
                          : "."}
                      </p>
                      {selectedTasks.length > 0 ? (
                        <ul className="mt-2 flex flex-col gap-1">
                          {selectedTasks.map((task) => (
                            <li key={task.id}>
                              <Link
                                href={`/tasks/${task.id}`}
                                className="font-prose text-base text-ink no-underline hover:underline"
                              >
                                {task.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                {/* ── Ripartizioni ──────────────────────────────────── */}
                <div className="mt-12 grid gap-12 md:grid-cols-2">
                  {priorityLoad.length > 0 ? (
                    <section aria-labelledby="titolo-priorita">
                      <h2
                        id="titolo-priorita"
                        className="border-b border-line pb-2 font-mono text-micro uppercase tracking-wider text-ink-muted"
                      >
                        Carico per priorità
                      </h2>
                      <ul className="mt-3 flex flex-col gap-3">
                        {priorityLoad.map((row) => {
                          const active = focus?.kind === "priority" && focus.value === row.level;
                          return (
                            <li key={row.level}>
                              <button
                                type="button"
                                aria-pressed={active}
                                onClick={() =>
                                  setFocus(active ? null : { kind: "priority", value: row.level })
                                }
                                className="w-full text-left"
                              >
                                <span className="flex items-baseline justify-between gap-4">
                                  <span
                                    className={`font-prose text-base ${
                                      active ? "text-ink underline underline-offset-4" : "text-ink"
                                    }`}
                                  >
                                    {PRIORITY_LABELS[row.level]}
                                  </span>
                                  <span data-numeric className="font-mono text-tiny text-ink-muted">
                                    {row.tasks} task ·{" "}
                                    <span className="text-ink">{formatMinutes(row.minutes)}</span>
                                  </span>
                                </span>
                                <span className="mt-1 block h-1 bg-sunken">
                                  <span
                                    className="block h-1 bg-ink"
                                    style={{ width: `${(row.minutes / maxPriorityMinutes) * 100}%` }}
                                  />
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ) : null}

                  {tagLoad.length > 0 ? (
                    <section aria-labelledby="titolo-tag">
                      <h2
                        id="titolo-tag"
                        className="border-b border-line pb-2 font-mono text-micro uppercase tracking-wider text-ink-muted"
                      >
                        Dove è andato il tempo
                      </h2>
                      <ul className="mt-3 flex flex-col gap-3">
                        {tagLoad.map((row) => {
                          const active = focus?.kind === "tag" && focus.value === row.tag;
                          return (
                            <li key={row.tag}>
                              <button
                                type="button"
                                aria-pressed={active}
                                onClick={() => setFocus(active ? null : { kind: "tag", value: row.tag })}
                                className="w-full text-left"
                              >
                                <span className="flex items-baseline justify-between gap-4">
                                  <span
                                    className={`font-mono text-small text-ink ${
                                      active ? "underline underline-offset-4" : ""
                                    }`}
                                  >
                                    #{row.tag}
                                  </span>
                                  <span data-numeric className="font-mono text-tiny text-ink">
                                    {formatMinutes(row.minutes)}
                                  </span>
                                </span>
                                <span className="mt-1 block h-1 bg-sunken">
                                  <span
                                    className="block h-1 bg-ink"
                                    style={{ width: `${(row.minutes / maxTagMinutes) * 100}%` }}
                                  />
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ) : null}
                </div>

                {/* ── Dettaglio della selezione ─────────────────────── */}
                {focusResult ? (
                  <section className="mt-12" aria-labelledby="titolo-dettaglio">
                    <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-2">
                      <h2
                        id="titolo-dettaglio"
                        className="font-mono text-micro uppercase tracking-wider text-ink-muted"
                      >
                        Dettaglio · {focusResult.label}
                      </h2>
                      <button
                        type="button"
                        onClick={() => setFocus(null)}
                        className="font-mono text-tiny text-ink underline underline-offset-4"
                      >
                        Azzera
                      </button>
                    </div>

                    <p className="mt-3 max-w-measure font-prose text-base text-ink-muted">
                      <span data-numeric className="font-mono text-ink">
                        {focusResult.matchedTasks.length}
                      </span>{" "}
                      task,{" "}
                      <span data-numeric className="font-mono text-ink">
                        {focusResult.matchedSteps.length}
                      </span>{" "}
                      step e{" "}
                      <span data-numeric className="font-mono text-ink">
                        {focusResult.matchedLogs.length}
                      </span>{" "}
                      voci di work log, per{" "}
                      <span data-numeric className="font-mono text-ink">
                        {formatMinutes(focusResult.minutes)}
                      </span>
                      .
                    </p>

                    {focusResult.matchedTasks.length === 0 ? (
                      <p className="mt-4 font-prose text-base text-ink-muted">
                        Niente corrisponde a questa selezione.
                      </p>
                    ) : (
                      <div className="mt-4 grid gap-8 lg:grid-cols-3">
                        <div>
                          <h3 className="font-mono text-micro uppercase tracking-wider text-ink-muted">
                            Task
                          </h3>
                          <ul className="mt-2 border-t border-line">
                            {focusResult.matchedTasks.map((task) => (
                              <li key={task.id} className="border-b border-line py-2">
                                <Link
                                  href={`/tasks/${task.id}`}
                                  className="font-prose text-base text-ink no-underline hover:underline"
                                >
                                  {task.title}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h3 className="font-mono text-micro uppercase tracking-wider text-ink-muted">
                            Step
                          </h3>
                          {focusResult.matchedSteps.length === 0 ? (
                            <p className="mt-2 font-prose text-base text-ink-muted">Nessuno step.</p>
                          ) : (
                            <ul className="mt-2 border-t border-line">
                              {focusResult.matchedSteps.slice(0, 12).map((step) => (
                                <li key={step.id} className="border-b border-line py-2">
                                  <Link
                                    href={`/tasks/${step.taskId}`}
                                    className="font-prose text-base text-ink no-underline hover:underline"
                                  >
                                    {step.title}
                                  </Link>
                                  <span className="block font-mono text-tiny text-ink-muted">
                                    {taskTitles.get(step.taskId) ?? "Task eliminato"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div>
                          <h3 className="font-mono text-micro uppercase tracking-wider text-ink-muted">
                            Work log
                          </h3>
                          {focusResult.matchedLogs.length === 0 ? (
                            <p className="mt-2 font-prose text-base text-ink-muted">Nessuna voce.</p>
                          ) : (
                            <ul className="mt-2 border-t border-line">
                              {focusResult.matchedLogs.slice(0, 12).map((log) => (
                                <li key={log.id} className="border-b border-line py-2">
                                  <span data-numeric className="font-mono text-tiny text-ink-muted">
                                    {formatDayKey(instantDayKey(log.timestamp), {
                                      day: "numeric",
                                      month: "short",
                                    })}{" "}
                                    {formatInstantTime(log.timestamp)}
                                  </span>
                                  {log.message ? (
                                    <span className="block font-prose text-base text-ink">
                                      {log.message}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                ) : null}

                {/* ── Ultimi sei mesi ───────────────────────────────── */}
                <section className="mt-12" aria-labelledby="titolo-trend">
                  <h2
                    id="titolo-trend"
                    className="border-b border-line pb-2 font-mono text-micro uppercase tracking-wider text-ink-muted"
                  >
                    Ultimi sei mesi
                  </h2>
                  <ul className="mt-4 flex items-end gap-3">
                    {recentMonths.map((key) => {
                      const minutes = trends.get(key)?.totalMinutes ?? 0;
                      const height = Math.round((minutes / maxMonthMinutes) * 100);
                      return (
                        <li key={key} className="flex flex-1 flex-col items-center gap-2">
                          <span data-numeric className="font-mono text-micro text-ink-muted">
                            {minutes > 0 ? formatMinutes(minutes) : "—"}
                          </span>
                          {/*
                            A month with nothing in it gets a dashed baseline, not a two-pixel bar.
                            A hairline the height of a rounding error reads as a broken chart; a
                            dashed rule reads as "nothing here", which is what it means.
                          */}
                          {minutes > 0 ? (
                            <div
                              className={`w-full ${key === today.slice(0, 7) ? "bg-ink" : "bg-line-strong"}`}
                              style={{ height: `${Math.max(4, height)}px` }}
                            />
                          ) : (
                            <div className="w-full border-t border-dashed border-line-strong" />
                          )}
                          <span className="font-mono text-micro uppercase tracking-wider text-ink-muted">
                            {formatMonthKey(key, { month: "short" })}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                {/* ── In arrivo ─────────────────────────────────────── */}
                {upcoming.length > 0 ? (
                  <section className="mt-12" aria-labelledby="titolo-arrivo">
                    <h2
                      id="titolo-arrivo"
                      className="border-b border-line pb-2 font-mono text-micro uppercase tracking-wider text-ink-muted"
                    >
                      Nelle prossime tre settimane
                    </h2>
                    <ul>
                      {upcoming.map((task) => {
                        const days = daysBetweenKeys(today, task.dueDate as string);
                        return (
                          <li key={task.id} className="border-b border-line">
                            <Link
                              href={`/tasks/${task.id}`}
                              className="flex flex-wrap items-baseline gap-x-4 py-3 no-underline transition-colors hover:bg-sunken"
                            >
                              <span className="min-w-0 flex-1 font-prose text-base text-ink">
                                {task.title}
                              </span>
                              <span data-numeric className="font-mono text-tiny text-ink-muted">
                                {days === 0 ? "oggi" : `fra ${days} ${days === 1 ? "giorno" : "giorni"}`}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </main>
    </AppShell>
  );
};

/**
 * useSearchParams opts a route into client-side rendering; the boundary is what keeps the rest of
 * the page prerenderable rather than failing the build.
 */
const InsightsPage = () => (
  <Suspense
    fallback={
      <AppShell>
        <main className="mx-auto w-full max-w-5xl px-6 py-10">
          <p className="font-mono text-tiny uppercase tracking-wider text-ink-muted">Leggo i dati…</p>
        </main>
      </AppShell>
    }
  >
    <InsightsPageContent />
  </Suspense>
);

export default InsightsPage;
