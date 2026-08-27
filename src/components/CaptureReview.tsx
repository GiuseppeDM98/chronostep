/**
 * The proposal, before it becomes data.
 *
 * This screen exists because of what sits on the other side of the button. A task written wrongly is
 * a nuisance; a work-log note carrying an invented duration is a lie in next month's report, and
 * `buildTaskActivity` counts it exactly like a session somebody actually timed. So nothing here is
 * read-only: every proposed row can be corrected in place or dropped, and everything arrives ticked
 * so the ordinary path stays two clicks — read the notes, write the plan.
 *
 * Dropping a step drops what is nested under it. That rule lives in `selectedPlan`, not here, so
 * what the screen shows and what the writer writes cannot drift apart.
 */
"use client";

import { useId, type ReactNode } from "react";
import {
  additionKey,
  additionStepKey,
  droppedSteps,
  logKey,
  outlineRows,
  taskKey,
  taskStepKey,
  type CaptureLogDraft,
  type CapturePlan,
  type CaptureStepDraft,
  type CaptureTaskDraft,
} from "../lib/aiCapture";
import type { Step, StepStatus, Task, TaskStatus } from "../lib/types";
import {
  DateInput,
  Field,
  STEP_STATUS_LABELS,
  Select,
  TASK_STATUS_LABELS,
  TextInput,
} from "./controls";

const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "blocked"];
const STEP_STATUSES: StepStatus[] = ["todo", "in_progress", "done"];
const PRIORITIES: Array<{ value: NonNullable<CaptureTaskDraft["priority"]>; label: string }> = [
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Bassa" },
];

/** `MAX_DURATION_MINUTES` in aiCapture.ts, as the bound of the control that edits it. */
const MAX_DURATION_MINUTES = 12 * 60;

// ─── Primitives ──────────────────────────────────────────────────────────────

/**
 * The include/exclude control.
 *
 * A checkbox, unstyled beyond its accent colour: it is already a square in the form language of
 * this interface, and its unchecked state has to read as "this will not be written" without a
 * legend.
 */
const Toggle = ({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) => {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-2 h-4 w-4 shrink-0 accent-ink"
      />
    </>
  );
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-10">
    <h2 className="font-mono text-micro uppercase tracking-wider text-ink-muted">{title}</h2>
    <ul className="mt-3 border-t border-line">{children}</ul>
  </section>
);

/** A row whose content is greyed once it has been dropped, so the list keeps its shape. */
const Row = ({ dropped, children }: { dropped: boolean; children: ReactNode }) => (
  <li className={`border-b border-line py-3 ${dropped ? "opacity-50" : ""}`}>{children}</li>
);

// ─── Steps ───────────────────────────────────────────────────────────────────

type StepRowsProps = {
  steps: CaptureStepDraft[];
  disabled: boolean;
  keyOf: (stepIndex: number) => string;
  excluded: Set<string>;
  onToggle: (key: string) => void;
  onChange: (stepIndex: number, patch: Partial<CaptureStepDraft>) => void;
};

const StepRows = ({ steps, disabled, keyOf, excluded, onToggle, onChange }: StepRowsProps) => {
  const rows = outlineRows(steps);
  // The same answer the writer uses, not a second implementation of it. A row is out either because
  // it was unticked or because something it hangs off was, and both have to look the same.
  const dropFlags = droppedSteps(steps, (stepIndex) => excluded.has(keyOf(stepIndex)));

  return (
    <ul className="mt-2 border-t border-line">
      {steps.map((step, stepIndex) => {
        const key = keyOf(stepIndex);
        const dropped = dropFlags[stepIndex];
        // Dropped because an ancestor was: the checkbox is locked, since including a substep whose
        // parent is out has no meaning the writer could honour.
        const droppedByAncestor = dropped && !excluded.has(key);
        const { numbering, level } = rows[stepIndex];
        return (
          <li
            key={key}
            className={`flex items-start gap-3 border-b border-line py-2 ${
              dropped ? "opacity-50" : ""
            }`}
            // The gutter carries the depth, exactly as on the task screen.
            style={{ paddingLeft: `${level * 1.5}rem` }}
          >
            <Toggle
              label={
                droppedByAncestor
                  ? `«${step.title}» è escluso insieme allo step da cui dipende`
                  : `Includi lo step ${step.title}`
              }
              checked={!dropped}
              disabled={disabled || droppedByAncestor}
              onChange={() => onToggle(key)}
            />
            <span data-numeric className="mt-2 w-8 shrink-0 font-mono text-tiny text-ink-muted">
              {numbering}
            </span>
            <Field label="Titolo dello step" labelHidden>
              {(props) => (
                <TextInput
                  {...props}
                  className="min-w-0 flex-1"
                  value={step.title}
                  required
                  aria-invalid={step.title.trim() ? undefined : true}
                  disabled={disabled || dropped}
                  onChange={(event) => onChange(stepIndex, { title: event.target.value })}
                />
              )}
            </Field>
            <Field label="Stato dello step" labelHidden>
              {(props) => (
                <Select
                  {...props}
                  className="w-32 shrink-0"
                  value={step.status}
                  disabled={disabled || dropped}
                  onChange={(event) =>
                    onChange(stepIndex, { status: event.target.value as StepStatus })
                  }
                >
                  {STEP_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STEP_STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </li>
        );
      })}
    </ul>
  );
};

// ─── The review ──────────────────────────────────────────────────────────────

export type CaptureReviewProps = {
  plan: CapturePlan;
  excluded: Set<string>;
  /** True while the plan is being written: every control freezes rather than racing the writes. */
  disabled: boolean;
  tasksById: Map<string, Task>;
  stepsById: Map<string, Step>;
  onToggle: (key: string) => void;
  onTaskChange: (taskIndex: number, patch: Partial<CaptureTaskDraft>) => void;
  onTaskStepChange: (
    taskIndex: number,
    stepIndex: number,
    patch: Partial<CaptureStepDraft>,
  ) => void;
  onAdditionStepChange: (
    additionIndex: number,
    stepIndex: number,
    patch: Partial<CaptureStepDraft>,
  ) => void;
  onLogChange: (logIndex: number, patch: Partial<CaptureLogDraft>) => void;
};

const CaptureReview = ({
  plan,
  excluded,
  disabled,
  tasksById,
  stepsById,
  onToggle,
  onTaskChange,
  onTaskStepChange,
  onAdditionStepChange,
  onLogChange,
}: CaptureReviewProps) => (
  <>
    {plan.tasks.length > 0 ? (
      <Section title="Task nuovi">
        {plan.tasks.map((task, taskIndex) => {
          const key = taskKey(taskIndex);
          const dropped = excluded.has(key);
          return (
            <Row key={key} dropped={dropped}>
              <div className="flex items-start gap-3">
                <Toggle
                  label={`Includi il task ${task.title}`}
                  checked={!dropped}
                  disabled={disabled}
                  onChange={() => onToggle(key)}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <Field label="Titolo del task" labelHidden>
                    {(props) => (
                      <TextInput
                        {...props}
                        value={task.title}
                        required
                        aria-invalid={task.title.trim() ? undefined : true}
                        disabled={disabled || dropped}
                        onChange={(event) => onTaskChange(taskIndex, { title: event.target.value })}
                      />
                    )}
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Stato" labelHidden>
                      {(props) => (
                        <Select
                          {...props}
                          value={task.status}
                          disabled={disabled || dropped}
                          onChange={(event) =>
                            onTaskChange(taskIndex, { status: event.target.value as TaskStatus })
                          }
                        >
                          {TASK_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {TASK_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>

                    <Field label="Priorità" labelHidden>
                      {(props) => (
                        <Select
                          {...props}
                          value={task.priority ?? ""}
                          disabled={disabled || dropped}
                          onChange={(event) =>
                            onTaskChange(taskIndex, {
                              priority: (event.target.value ||
                                undefined) as CaptureTaskDraft["priority"],
                            })
                          }
                        >
                          <option value="">Nessuna priorità</option>
                          {PRIORITIES.map((priority) => (
                            <option key={priority.value} value={priority.value}>
                              {priority.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>

                    <Field label="Scadenza" labelHidden>
                      {(props) => (
                        <DateInput
                          {...props}
                          value={task.dueDate ?? ""}
                          disabled={disabled || dropped}
                          onChange={(event) =>
                            onTaskChange(taskIndex, { dueDate: event.target.value || undefined })
                          }
                        />
                      )}
                    </Field>

                    <Field label="Tag, separati da virgola" labelHidden>
                      {(props) => (
                        <TextInput
                          {...props}
                          className="font-mono text-small"
                          placeholder="tag, separati, da virgola"
                          /*
                            The only uncontrolled field on this screen, and it has to be. The stored
                            value is an array; deriving `value` from it on every keystroke normalised
                            the separator away before the next render, so typing a comma put it in
                            the DOM and React took it straight back out — a second tag could never be
                            entered at all. The field holds the raw text, the plan holds the array,
                            and they only need to agree at the moment of writing. The rest of the app
                            solves the same problem by keeping the raw string in form state until
                            submit; here the row IS the form.
                          */
                          defaultValue={task.tags.join(", ")}
                          disabled={disabled || dropped}
                          onChange={(event) =>
                            onTaskChange(taskIndex, {
                              tags: event.target.value
                                .split(",")
                                .map((tag) => tag.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      )}
                    </Field>
                  </div>

                  {task.steps.length > 0 ? (
                    <StepRows
                      steps={task.steps}
                      disabled={disabled || dropped}
                      excluded={excluded}
                      keyOf={(stepIndex) => taskStepKey(taskIndex, stepIndex)}
                      onToggle={onToggle}
                      onChange={(stepIndex, patch) => onTaskStepChange(taskIndex, stepIndex, patch)}
                    />
                  ) : null}
                </div>
              </div>
            </Row>
          );
        })}
      </Section>
    ) : null}

    {plan.additions.length > 0 ? (
      <Section title="Step da aggiungere a task che esistono già">
        {plan.additions.map((addition, additionIndex) => {
          const key = additionKey(additionIndex);
          const dropped = excluded.has(key);
          const target = tasksById.get(addition.taskId);
          return (
            <Row key={key} dropped={dropped}>
              <div className="flex items-start gap-3">
                <Toggle
                  label={`Includi gli step per ${target?.title ?? "questo task"}`}
                  checked={!dropped}
                  disabled={disabled}
                  onChange={() => onToggle(key)}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-prose text-lead text-ink">{target?.title ?? addition.taskId}</p>
                  <StepRows
                    steps={addition.steps}
                    disabled={disabled || dropped}
                    excluded={excluded}
                    keyOf={(stepIndex) => additionStepKey(additionIndex, stepIndex)}
                    onToggle={onToggle}
                    onChange={(stepIndex, patch) =>
                      onAdditionStepChange(additionIndex, stepIndex, patch)
                    }
                  />
                </div>
              </div>
            </Row>
          );
        })}
      </Section>
    ) : null}

    {plan.logs.length > 0 ? (
      <Section title="Work log">
        {plan.logs.map((log, logIndex) => {
          const key = logKey(logIndex);
          const dropped = excluded.has(key);
          // The note hangs off a task that exists, or off one further up this same proposal. In
          // the second case the title has to come from the plan — there is no document to look up
          // yet, which is the whole reason `taskRef` exists.
          const proposed = log.taskRef
            ? plan.tasks.find((task) => task.ref === log.taskRef)
            : undefined;
          const target = log.taskId ? tasksById.get(log.taskId) : undefined;
          const targetTitle = target?.title ?? proposed?.title ?? log.taskId ?? "";
          const step = log.stepId ? stepsById.get(log.stepId) : undefined;
          return (
            <Row key={key} dropped={dropped}>
              <div className="flex items-start gap-3">
                <Toggle
                  label={`Includi la nota su ${targetTitle || "questo task"}`}
                  checked={!dropped}
                  disabled={disabled}
                  onChange={() => onToggle(key)}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="font-prose text-base text-ink">
                    {targetTitle}
                    {/* A task that does not exist yet is worth marking: this note lands only if
                        the proposal above it is written too. */}
                    {proposed ? (
                      <span className="font-mono text-tiny text-ink-muted"> · task nuovo</span>
                    ) : null}
                    {step ? <span className="text-ink-muted"> · {step.title}</span> : null}
                  </p>
                  <Field label="Nota" labelHidden>
                    {(props) => (
                      <TextInput
                        {...props}
                        value={log.message}
                        disabled={disabled || dropped}
                        onChange={(event) => onLogChange(logIndex, { message: event.target.value })}
                      />
                    )}
                  </Field>
                  <div className="flex flex-wrap items-center gap-3">
                    {/*
                      The duration is the one field on this screen that changes a number somebody
                      will read back as fact, so it is spelled out rather than shown as a figure.
                    */}
                    <span className="font-mono text-micro uppercase tracking-wider text-ink-muted">
                      Durata
                    </span>
                    <Field label="Durata in minuti" labelHidden>
                      {(props) => (
                        <TextInput
                          {...props}
                          type="number"
                          min={1}
                          max={MAX_DURATION_MINUTES}
                          step={1}
                          placeholder="—"
                          className="w-24 font-mono text-small"
                          value={log.durationMinutes ?? ""}
                          disabled={disabled || dropped}
                          onChange={(event) =>
                            onLogChange(logIndex, {
                              durationMinutes: event.target.value
                                ? Number(event.target.value)
                                : undefined,
                            })
                          }
                        />
                      )}
                    </Field>
                    <span className="font-mono text-micro uppercase tracking-wider text-ink-muted">
                      Giorno
                    </span>
                    <Field label="Giorno della nota" labelHidden>
                      {(props) => (
                        <DateInput
                          {...props}
                          className="w-44"
                          value={log.dayKey ?? ""}
                          disabled={disabled || dropped}
                          onChange={(event) =>
                            onLogChange(logIndex, { dayKey: event.target.value || undefined })
                          }
                        />
                      )}
                    </Field>
                  </div>
                </div>
              </div>
            </Row>
          );
        })}
      </Section>
    ) : null}

    {plan.unclear.length > 0 ? (
      <Section title="Rimasto in sospeso">
        {/* Keyed by position: the model can legitimately raise the same doubt twice. */}
        {plan.unclear.map((note, index) => (
          <li key={`${index}-${note}`} className="border-b border-line py-3">
            <p className="max-w-measure font-prose text-base text-ink-muted">{note}</p>
          </li>
        ))}
      </Section>
    ) : null}
  </>
);

export default CaptureReview;
