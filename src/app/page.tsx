/**
 * Oggi — the home route.
 *
 * The app opens on the question its user actually arrives with: what do I do now. The verdict
 * answers it in a sentence; the list under it offers only the decisions that are live, each with
 * what it costs. Everything else on this screen is deliberately quiet, and there is no row of
 * counters: the figures are already in the paragraph.
 */
"use client";

import Link from "next/link";
import { useMemo } from "react";
import AppShell from "../components/AppShell";
import Verdict from "../components/Verdict";
import { Button, StatusChip, TagList } from "../components/controls";
import { useAuth } from "../hooks/useAuth";
import { useNow } from "../hooks/useNow";
import { useTaskStore } from "../hooks/useTaskStore";
import { useTimer } from "../hooks/useTimer";
import { formatDayKey, formatMinutes, todayKey } from "../lib/dates";
import { buildTaskActivity } from "../lib/insights";
import { nextDecisions, readToday } from "../lib/verdicts";
import type { WorkLog } from "../lib/types";

const greeting = (hour: number) => {
  if (hour < 13) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
};

const dueLabel = (days?: number) => {
  if (days === undefined) return null;
  if (days < 0) return `in ritardo di ${Math.abs(days)} ${Math.abs(days) === 1 ? "giorno" : "giorni"}`;
  if (days === 0) return "scade oggi";
  return `fra ${days} ${days === 1 ? "giorno" : "giorni"}`;
};

const TodayPage = () => {
  const { user } = useAuth();
  const { tasks, steps, workLogs, isHydrated, loadError, refresh } = useTaskStore();
  const { timerState, elapsedMinutes } = useTimer();
  const now = useNow();

  const running =
    timerState.status === "running"
      ? {
          taskTitle: timerState.taskTitle,
          stepTitle: timerState.stepTitle,
          elapsedMinutes,
        }
      : undefined;

  const reading = useMemo(
    () => readToday({ tasks, steps, workLogs, running, now }),
    [tasks, steps, workLogs, running, now],
  );

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const stepsById = useMemo(() => new Map(steps.map((step) => [step.id, step])), [steps]);

  const { taskActivity, logDurations } = useMemo(() => buildTaskActivity(workLogs), [workLogs]);

  const minutesByTask = useMemo(() => {
    const map = new Map<string, number>();
    taskActivity.forEach((activity, taskId) => map.set(taskId, activity.totalMinutes));
    return map;
  }, [taskActivity]);

  const minutesByStep = useMemo(() => {
    const map = new Map<string, number>();
    workLogs.forEach((log: WorkLog) => {
      if (!log.stepId) return;
      map.set(log.stepId, (map.get(log.stepId) ?? 0) + (logDurations.get(log.id) ?? 0));
    });
    return map;
  }, [logDurations, workLogs]);

  const decisions = useMemo(
    () => nextDecisions(reading, { stepsById, tasksById, minutesByTask, minutesByStep }, now),
    [reading, stepsById, tasksById, minutesByTask, minutesByStep, now],
  );

  // What is open but not urgent — shown small, below the fold of the decision, and capped.
  const restOfTheDesk = useMemo(() => {
    const urgent = new Set(decisions.map((decision) => decision.id.replace(/^task-/, "")));
    return tasks
      .filter((task) => task.status !== "done" && !urgent.has(task.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6);
  }, [decisions, tasks]);

  const displayName = user?.displayName?.split(" ")[0] ?? "";
  const dateline = `${greeting(now.getHours())}${displayName ? ` ${displayName}` : ""} · ${formatDayKey(
    todayKey(now),
    { weekday: "long", day: "numeric", month: "long" },
  )}`;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {loadError ? (
          <div role="alert" className="mb-8 border border-bad bg-bad-field px-4 py-3">
            <p className="font-prose text-base text-ink">
              Non sono riuscito a leggere i tuoi dati, quindi quello che vedi sotto potrebbe non
              essere aggiornato.
            </p>
            <p className="mt-1 font-mono text-tiny text-ink-muted">{loadError}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-2 font-mono text-tiny font-medium text-ink underline underline-offset-4"
            >
              Riprova
            </button>
          </div>
        ) : null}

        {!isHydrated ? (
          <p className="font-mono text-tiny uppercase tracking-wider text-ink-muted">Leggo i dati…</p>
        ) : (
          <>
            <Verdict verdict={reading.verdict} dateline={dateline} size="large">
              {reading.verdict.isSparse ? (
                <Link href="/tasks">
                  <Button variant="primary">Crea il primo task</Button>
                </Link>
              ) : null}
            </Verdict>

            {decisions.length > 0 ? (
              <section className="mt-10" aria-labelledby="prossime-decisioni">
                <h2
                  id="prossime-decisioni"
                  className="font-mono text-micro uppercase tracking-wider text-ink-muted"
                >
                  Da qui si riparte
                </h2>
                <ul className="mt-4 border-t border-line">
                  {decisions.map((decision) => (
                    <li key={decision.id} className="border-b border-line">
                      {/*
                        Below sm the meta drops under the title. One wrapping flex row squeezed the
                        title into a narrow column while the context held the first line, and the two
                        ran into each other.
                      */}
                      <Link
                        href={decision.href}
                        className="flex gap-3 py-4 no-underline transition-colors hover:bg-sunken"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-2 h-2 w-2 shrink-0 ${
                            decision.sentiment === "bad"
                              ? "bg-bad"
                              : decision.sentiment === "warn"
                              ? "bg-warn"
                              : "bg-line-strong"
                          }`}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                          <span className="min-w-0 flex-1 font-prose text-lead text-ink">
                            {decision.label}
                          </span>
                          {/* Where the step sits is a sentence about the work, so it is prose. */}
                          {decision.context ? (
                            <span className="font-prose text-tiny text-ink-muted">
                              {decision.context}
                            </span>
                          ) : null}
                          {/*
                            What it has cost so far belongs on THIS list — the one the user is being
                            told to act from — not on the quiet list below, which is where it used
                            to be and where nobody needs it.

                            Zero is a value, so it is drawn. An em dash is how this interface already
                            says "nothing here" (the six-month chart uses the same mark), and leaving
                            the slot blank instead made the never-started row look like a row whose
                            cost had gone missing.
                          */}
                          <span data-numeric className="shrink-0 font-mono text-tiny text-ink-muted">
                            {decision.minutesSpent ? (
                              `${formatMinutes(decision.minutesSpent)} finora`
                            ) : (
                              <>
                                <span aria-hidden="true">—</span>
                                <span className="sr-only">nessun tempo registrato</span>
                              </>
                            )}
                          </span>
                          <span
                            data-numeric
                            className={`shrink-0 font-mono text-tiny ${
                              decision.sentiment === "bad"
                                ? "text-bad"
                                : decision.sentiment === "warn"
                                ? "text-warn"
                                : "text-ink-muted"
                            }`}
                          >
                            {dueLabel(decision.dueInDays)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {restOfTheDesk.length > 0 ? (
              <section className="mt-12" aria-labelledby="resto">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 id="resto" className="font-mono text-micro uppercase tracking-wider text-ink-muted">
                    Il resto, senza fretta
                  </h2>
                  <Link href="/tasks" className="font-mono text-tiny text-ink-muted no-underline hover:text-ink">
                    Tutti i task →
                  </Link>
                </div>
                <ul className="mt-4 border-t border-line">
                  {restOfTheDesk.map((task) => {
                    const minutes = taskActivity.get(task.id)?.totalMinutes ?? 0;
                    return (
                      <li key={task.id} className="border-b border-line">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="flex flex-col gap-1 py-3 no-underline transition-colors hover:bg-sunken sm:flex-row sm:items-baseline sm:gap-4"
                        >
                          <span className="min-w-0 flex-1 font-prose text-base text-ink">
                            {task.title}
                          </span>
                          <span className="flex items-baseline gap-4">
                            {task.tags?.length ? <TagList tags={task.tags} limit={2} /> : null}
                            <StatusChip status={task.status} />
                            <span
                              data-numeric
                              className="w-16 shrink-0 text-right font-mono text-tiny text-ink-muted"
                            >
                              {minutes > 0 ? formatMinutes(minutes) : ""}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>
    </AppShell>
  );
};

export default TodayPage;
