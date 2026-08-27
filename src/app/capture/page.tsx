/**
 * Cattura — notes in, a proposal out.
 *
 * The one screen in ChronoStep where something other than the user writes the first draft. It is
 * built as three moments rather than as a chat: you paste, you read what came back and correct it,
 * you write it. There is no conversation to keep, no history to scroll, and nothing on this page
 * remembers a previous attempt — the notes are the state.
 *
 * The proposal is never written on arrival. Everything comes back ticked, so the ordinary path is
 * still two clicks, but the button that commits it says what it is about to do first. That matters
 * most for the work-log notes: a duration written here is counted in the monthly report exactly
 * like a session somebody timed.
 */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import CaptureReview from "../../components/CaptureReview";
import Verdict from "../../components/Verdict";
import { Button, ErrorNote, Field, TextArea } from "../../components/controls";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { useAiAccess } from "../../hooks/useAiAccess";
import { useAuth } from "../../hooks/useAuth";
import { useNow } from "../../hooks/useNow";
import { useTaskStore } from "../../hooks/useTaskStore";
import {
  blankTitleCount,
  buildCaptureContext,
  normalizeCapturePlan,
  planIsEmpty,
  selectedPlan,
  type CaptureLogDraft,
  type CapturePlan,
  type CaptureStepDraft,
  type CaptureTaskDraft,
  type CaptureWriteResult,
} from "../../lib/aiCapture";
import { MAX_NOTES_LENGTH, type CaptureContextPayload } from "../../lib/aiPrompt";
import { formatDayKey, todayKey } from "../../lib/dates";
import { readCapture, type CaptureAccess } from "../../lib/verdicts";
import type { Step, Task, WorkLog } from "../../lib/types";

/**
 * The archive as the request carries it: enough for the model to recognise what the notes refer to,
 * and nothing else. Open tasks first, because a note about finished work is the rarer case.
 */
const buildContextPayload = (
  tasks: Task[],
  steps: Step[],
  workLogs: WorkLog[],
): CaptureContextPayload => {
  const stepsByTask = new Map<string, Step[]>();
  steps.forEach((step) => {
    const bucket = stepsByTask.get(step.taskId) ?? [];
    bucket.push(step);
    stepsByTask.set(step.taskId, bucket);
  });

  const ordered = [...tasks].sort((a, b) => {
    const openA = a.status === "done" ? 1 : 0;
    const openB = b.status === "done" ? 1 : 0;
    if (openA !== openB) return openA - openB;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const tags = new Set<string>();
  tasks.forEach((task) => task.tags?.forEach((tag) => tags.add(tag)));
  workLogs.forEach((log) => log.tags.forEach((tag) => tags.add(tag)));

  return {
    tasks: ordered.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      steps: (stepsByTask.get(task.id) ?? []).map((step) => ({
        id: step.id,
        title: step.title,
        status: step.status,
      })),
    })),
    tags: Array.from(tags),
  };
};

const CapturePage = () => {
  const { user } = useAuth();
  const { tasks, steps, workLogs, isHydrated, loadError, refresh, applyCapturePlan } =
    useTaskStore();
  const now = useNow();

  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState<CapturePlan | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [written, setWritten] = useState<CaptureWriteResult | null>(null);
  /**
   * Bumped on every fresh proposal and used as the review's React key.
   *
   * The tag field is uncontrolled — it has to be, see the comment on it — so a new plan arriving
   * into the same mounted rows would leave the previous proposal's tags sitting in the inputs.
   * Remounting the subtree is the honest way to say "this is a different proposal".
   */
  const [planSerial, setPlanSerial] = useState(0);

  const read = useAsyncAction();
  const write = useAsyncAction();

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const stepsById = useMemo(() => new Map(steps.map((step) => [step.id, step])), [steps]);

  // What would actually be written, exclusions applied. The verdict reads this, not the proposal:
  // a plan the user has emptied by unticking everything is an empty plan, and should say so.
  const selected = useMemo(
    () => (plan ? selectedPlan(plan, excluded) : undefined),
    [plan, excluded],
  );

  const access = useAiAccess();
  // "unreachable" means the check itself failed, not that the answer was no: the controls stay
  // live and the real request produces the real error.
  const accessState: CaptureAccess = access.checking
    ? "checking"
    : access.allowed
    ? "allowed"
    : access.reason === "not-configured"
    ? "not-configured"
    : "not-allowed";

  const verdict = useMemo(
    () => readCapture({ access: accessState, selected, written: written ?? undefined }),
    [accessState, selected, written],
  );

  const toggle = (key: string) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const patchTask = (taskIndex: number, patch: Partial<CaptureTaskDraft>) =>
    setPlan((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((task, index) =>
              index === taskIndex ? { ...task, ...patch } : task,
            ),
          }
        : current,
    );

  const patchSteps = (
    steps: CaptureStepDraft[],
    stepIndex: number,
    patch: Partial<CaptureStepDraft>,
  ) => steps.map((step, index) => (index === stepIndex ? { ...step, ...patch } : step));

  const patchTaskStep = (
    taskIndex: number,
    stepIndex: number,
    patch: Partial<CaptureStepDraft>,
  ) =>
    setPlan((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((task, index) =>
              index === taskIndex ? { ...task, steps: patchSteps(task.steps, stepIndex, patch) } : task,
            ),
          }
        : current,
    );

  const patchAdditionStep = (
    additionIndex: number,
    stepIndex: number,
    patch: Partial<CaptureStepDraft>,
  ) =>
    setPlan((current) =>
      current
        ? {
            ...current,
            additions: current.additions.map((addition, index) =>
              index === additionIndex
                ? { ...addition, steps: patchSteps(addition.steps, stepIndex, patch) }
                : addition,
            ),
          }
        : current,
    );

  const patchLog = (logIndex: number, patch: Partial<CaptureLogDraft>) =>
    setPlan((current) =>
      current
        ? {
            ...current,
            logs: current.logs.map((log, index) =>
              index === logIndex ? { ...log, ...patch } : log,
            ),
          }
        : current,
    );

  const handleRead = async () => {
    if (!user || !notes.trim()) return;
    setWritten(null);
    await read.run(async () => {
      // A fresh token every time: the request may be the first in a tab that has been open for
      // hours, and a stale one comes back as an unexplained 401.
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          notes: notes.trim(),
          // The day is the caller's, not the server's: "entro venerdì" has to resolve against the
          // calendar the user is looking at.
          today: todayKey(now),
          context: buildContextPayload(tasks, steps, workLogs),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        plan?: unknown;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Non sono riuscito a leggere le note.");
      }

      // Normalized HERE, against this account's real ids, rather than trusting what came back
      // through the route. See the module comment in src/lib/aiCapture.ts.
      setPlan(normalizeCapturePlan(payload.plan, buildCaptureContext(tasks, steps)));
      setExcluded(new Set());
      setPlanSerial((current) => current + 1);
    }, "Non sono riuscito a leggere le note.");
  };

  const blankTitles = selected ? blankTitleCount(selected) : 0;

  const handleWrite = async () => {
    if (!selected || planIsEmpty(selected) || blankTitleCount(selected) > 0) return;
    const outcome: { value?: CaptureWriteResult } = {};
    const done = await write.run(async () => {
      outcome.value = await applyCapturePlan(selected);
    }, "Non sono riuscito a scrivere la proposta.");

    if (done && outcome.value) {
      setWritten(outcome.value);
      // The proposal is cleared even when part of it failed. Leaving it on screen would invite a
      // second press, and a retry would duplicate everything that did land the first time.
      setPlan(null);
      setExcluded(new Set());
    }
  };

  const discard = () => {
    setPlan(null);
    setExcluded(new Set());
    write.clearError();
  };

  const dateline = formatDayKey(todayKey(now), { weekday: "long", day: "numeric", month: "long" });

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {loadError ? (
          <div className="mb-8">
            <ErrorNote onRetry={() => void refresh()}>
              Non sono riuscito a leggere i tuoi task, quindi l'AI non saprebbe riconoscere quelli
              che esistono già.
            </ErrorNote>
          </div>
        ) : null}

        <Verdict verdict={verdict} dateline={dateline} />

        {/*
          An account that cannot use the feature is shown the verdict and nothing else. Rendering a
          disabled textarea under it would still invite someone to type into it; the sentence above
          has already said everything there is to say.
        */}
        {accessState !== "allowed" ? null : (
        <section className="mt-10" aria-labelledby="note">
          <h2 id="note" className="font-mono text-micro uppercase tracking-wider text-ink-muted">
            Le tue note
          </h2>
          <div className="mt-3 max-w-measure">
            <Field
              label="Note da trasformare"
              labelHidden
              hint="Alla Claude API vengono inviati: le note che scrivi qui, e — perché possa riconoscere un task invece di duplicarlo — titolo, stato, scadenza e identificativo dei tuoi task e dei loro step, più i tag che usi già. Le note del work log non vengono inviate. Niente viene scritto finché non lo confermi."
            >
              {(props) => (
                <TextArea
                  {...props}
                  rows={10}
                  maxLength={MAX_NOTES_LENGTH}
                  value={notes}
                  disabled={read.pending || write.pending}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={
                    "Preventivo per Rossi entro venerdì: raccogliere i costi dei materiali, chiedere il listino al fornitore, poi scrivere il documento.\nIeri due ore sulla revisione del catalogo."
                  }
                />
              )}
            </Field>
          </div>

          {/*
            The hint above is rendered by Field and wired through aria-describedby; this line is the
            visible one, and it sits beside the action because the count is only interesting while
            you are about to press it.
          */}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Button
              variant="primary"
              onClick={() => void handleRead()}
              pending={read.pending}
              pendingLabel="Leggo…"
              disabled={!isHydrated || notes.trim().length === 0 || write.pending}
            >
              Leggi le note
            </Button>
            <span data-numeric className="font-mono text-tiny text-ink-muted">
              {notes.length}/{MAX_NOTES_LENGTH}
            </span>
          </div>

          {read.error ? (
            <div className="mt-4 max-w-measure">
              <ErrorNote>{read.error}</ErrorNote>
            </div>
          ) : null}
        </section>
        )}

        {written && written.failures.length > 0 ? (
          <section className="mt-10" aria-labelledby="non-scritto">
            <h2
              id="non-scritto"
              className="font-mono text-micro uppercase tracking-wider text-ink-muted"
            >
              Non è stato scritto
            </h2>
            <ul className="mt-3 border-t border-line">
              {written.failures.map((failure) => (
                <li key={failure} className="border-b border-line py-3">
                  <p className="max-w-measure font-prose text-base text-ink">{failure}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {written && written.failures.length === 0 ? (
          <p className="mt-6 font-mono text-tiny text-ink-muted">
            <Link href="/tasks" className="underline underline-offset-4">
              Vai ai task →
            </Link>
          </p>
        ) : null}

        {plan && selected ? (
          <>
            <CaptureReview
              key={planSerial}
              plan={plan}
              excluded={excluded}
              disabled={write.pending}
              tasksById={tasksById}
              stepsById={stepsById}
              onToggle={toggle}
              onTaskChange={patchTask}
              onTaskStepChange={patchTaskStep}
              onAdditionStepChange={patchAdditionStep}
              onLogChange={patchLog}
            />

            {write.error ? (
              <div className="mt-8 max-w-measure">
                <ErrorNote>{write.error}</ErrorNote>
              </div>
            ) : null}

            {/*
              A blank title cannot be written — firestore.rules refuse it — and the refusal would
              arrive only after the rest of the plan had already landed and this screen had been
              cleared. Saying so here, with the button held, is the difference between a rule and an
              apology.
            */}
            {blankTitles > 0 ? (
              <p role="status" className="mt-8 max-w-measure font-prose text-base text-bad">
                {blankTitles === 1
                  ? "Una riga è rimasta senza titolo. Riempila, oppure toglile la spunta: senza titolo non si può scrivere."
                  : `${blankTitles} righe sono rimaste senza titolo. Riempile, oppure toglile la spunta: senza titolo non si possono scrivere.`}
              </p>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-line pt-6">
              <Button
                variant="primary"
                onClick={() => void handleWrite()}
                pending={write.pending}
                pendingLabel="Scrivo…"
                disabled={planIsEmpty(selected) || blankTitles > 0}
              >
                Scrivi in archivio
              </Button>
              {/*
                No counter beside these buttons. What the plan amounts to is already the verdict's
                own sentence at the top of the screen, and repeating a figure it has already stated
                is the tile this design refuses.
              */}
              <Button variant="quiet" onClick={discard} disabled={write.pending}>
                Scarta la proposta
              </Button>
            </div>
          </>
        ) : null}
      </main>
    </AppShell>
  );
};

export default CapturePage;
