/**
 * Form and action primitives.
 *
 * Two rules are enforced here rather than left to each call site, because both were violated
 * everywhere in the previous build:
 *
 * 1. **Every control is programmatically labelled.** `Field` generates the id and wires
 *    `htmlFor`/`id` itself, so a control cannot be rendered with a label that is merely adjacent.
 * 2. **Every async action shows that it is running and cannot be fired twice.** `Button` takes
 *    `pending` and disables itself; the previous submit buttons stayed live through a multi-second
 *    write and a second click created a duplicate row with a colliding order.
 *
 * Status is carried by a drawn glyph as well as by colour, so it survives a monochrome print, a
 * colour-blind reader, and the moment a user is comparing two rows at a glance.
 */
"use client";

import { useId, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { StepStatus, TaskStatus } from "../lib/types";

// ─── Field ───────────────────────────────────────────────────────────────────

type FieldProps = {
  label: string;
  hint?: string;
  required?: boolean;
  /**
   * Take the label off the screen without taking it away.
   *
   * For a ruled row of controls where a column heading already says what each one is: printing
   * "Titolo" beside forty inputs is noise, and dropping the label instead would be the exact
   * failure this component exists to make impossible.
   */
  labelHidden?: boolean;
  children: (props: { id: string; "aria-describedby"?: string }) => ReactNode;
};

export const Field = ({ label, hint, required, labelHidden = false, children }: FieldProps) => {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={labelHidden ? "contents" : "flex flex-col gap-1.5"}>
      <label
        htmlFor={id}
        className={
          labelHidden ? "sr-only" : "font-mono text-micro uppercase tracking-wider text-ink-muted"
        }
      >
        {label}
        {required ? <span className="text-bad"> *</span> : null}
      </label>
      {children({ id, "aria-describedby": hint ? hintId : undefined })}
      {hint ? (
        <p id={hintId} className="font-prose text-tiny text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

const controlClasses =
  "w-full border border-line bg-panel px-3 py-2.5 font-prose text-base text-ink transition-colors placeholder:text-ink-muted hover:border-line-strong focus:border-focus";

export const TextInput = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`${controlClasses} ${props.className ?? ""}`} />
);

export const TextArea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={`${controlClasses} resize-y ${props.className ?? ""}`} />
);

export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className={`${controlClasses} font-mono text-small ${props.className ?? ""}`}
  />
);

/** A date control. Values are plain `YYYY-MM-DD` day keys, in and out — see src/lib/dates.ts. */
export const DateInput = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} type="date" className={`${controlClasses} font-mono text-small ${props.className ?? ""}`} />
);

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  /** Id of the form this button submits, for a submit control rendered outside its <form>. */
  form?: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  pending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  // The primary action is ink, never a hue: colour in this interface means judgement, and spending
  // it on a button would make every green thing ambiguous.
  primary: "bg-inverse-ground text-inverse-ink hover:opacity-90",
  secondary: "border border-line-strong text-ink hover:bg-sunken",
  quiet: "text-ink-muted hover:text-ink",
  danger: "border border-bad text-bad hover:bg-bad-field",
};

export const Button = ({
  children,
  onClick,
  type = "button",
  form,
  variant = "secondary",
  pending = false,
  pendingLabel,
  disabled = false,
  className = "",
  ...rest
}: ButtonProps) => (
  <button
    {...rest}
    type={type}
    form={form}
    onClick={onClick}
    // `pending` disables as well as announces: a live button during a write is how duplicates happen.
    disabled={disabled || pending}
    aria-busy={pending || undefined}
    className={`inline-flex min-h-[2.5rem] items-center justify-center gap-2 px-4 py-2 font-mono text-tiny font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
  >
    {pending ? (
      <>
        <span
          aria-hidden="true"
          className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
        />
        {pendingLabel ?? children}
      </>
    ) : (
      children
    )}
  </button>
);

// ─── Status ──────────────────────────────────────────────────────────────────

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Da fare",
  in_progress: "In corso",
  done: "Fatto",
  blocked: "Fermo",
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  todo: "Da fare",
  in_progress: "In corso",
  done: "Fatto",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  todo: "text-ink-muted",
  in_progress: "text-warn",
  done: "text-good",
  blocked: "text-bad",
};

/**
 * A drawn glyph per status: empty square, half-filled, solid, crossed.
 *
 * Colour alone is not a channel. These read correctly in greyscale and to anyone who cannot
 * separate the green from the amber.
 */
const StatusGlyph = ({ status }: { status: TaskStatus }) => (
  <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 shrink-0">
    <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.25" />
    {status === "in_progress" ? <rect x="1.5" y="1.5" width="4.5" height="9" fill="currentColor" /> : null}
    {status === "done" ? <rect x="1.5" y="1.5" width="9" height="9" fill="currentColor" /> : null}
    {status === "blocked" ? (
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.25" />
    ) : null}
  </svg>
);

export const StatusChip = ({ status }: { status: TaskStatus }) => (
  <span
    className={`inline-flex items-center gap-1.5 font-mono text-micro uppercase tracking-wider ${STATUS_TONE[status]}`}
  >
    <StatusGlyph status={status} />
    {TASK_STATUS_LABELS[status]}
  </span>
);

// ─── Feedback ────────────────────────────────────────────────────────────────

/**
 * An error the user must see.
 *
 * There is no server tier behind this app: a write that fails and says nothing is simply lost, and
 * the user finds out later, or never. Every write path in the UI renders one of these.
 */
export const ErrorNote = ({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) => (
  <div role="alert" className="border border-bad bg-bad-field px-4 py-3">
    <p className="font-prose text-base text-ink">{children}</p>
    {onRetry ? (
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 font-mono text-tiny font-medium text-ink underline underline-offset-4"
      >
        Riprova
      </button>
    ) : null}
  </div>
);

/** Tag chips. Tags are the user's own vocabulary, so they are never restyled by meaning. */
export const TagList = ({ tags, limit }: { tags: string[]; limit?: number }) => {
  const shown = limit ? tags.slice(0, limit) : tags;
  const overflow = tags.length - shown.length;
  if (tags.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {shown.map((tag) => (
        <span key={tag} className="font-mono text-tiny text-ink-muted">
          #{tag}
        </span>
      ))}
      {overflow > 0 ? <span className="font-mono text-tiny text-ink-muted">+{overflow}</span> : null}
    </span>
  );
};
