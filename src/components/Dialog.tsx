/**
 * A dialog that behaves like one.
 *
 * The previous modals were `<div>`s with a fixed overlay: no role, no `aria-modal`, no focus trap,
 * no focus restore, no way to dismiss by backdrop, the page behind still scrolling, and a fixed
 * height that clipped the form at both ends on a short viewport with no way to scroll to the
 * clipped parts. Everything here exists to close one of those.
 *
 * The unsaved-changes behaviour is a deliberate departure from the old one. Escape used to be
 * REFUSED while a text field differed from its opening value, leaving the X button — which
 * discarded everything without asking — as the only exit. Both halves were wrong: the guard blocked
 * the safe gesture and left the destructive one unguarded. Now every dismissal routes through the
 * same confirmation, and the confirmation offers both answers explicitly.
 */
"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type DialogProps = {
  open: boolean;
  title: string;
  /** A short line under the title. Optional; the title carries the weight. */
  description?: string;
  /** True while the form holds edits that dismissing would throw away. */
  hasUnsavedChanges?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

const Dialog = ({
  open,
  title,
  description,
  hasUnsavedChanges = false,
  onClose,
  children,
  footer,
}: DialogProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  const requestClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }, [hasUnsavedChanges, onClose]);

  // Remember who opened the dialog, and give that element the focus back on close. Without this a
  // keyboard user lands back at the top of the document every time they dismiss one.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setConfirmingDiscard(false);

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();

    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // The page behind a modal must not scroll: on a trackpad it is otherwise impossible to tell which
  // of the two surfaces is moving.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== "Tab") return;

      // Focus trap. Tab must not reach the page behind, which is inert to a mouse but perfectly
      // reachable by keyboard without this.
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, requestClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-6 sm:py-12"
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the backdrop dismisses; otherwise a drag that
        // began inside a text field and released outside would throw the form away.
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        // max-height plus internal scrolling is what keeps a long form reachable on a short screen.
        className="flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col border border-line bg-panel shadow-panel outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 id={titleId} className="font-prose text-title text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 font-mono text-tiny text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Chiudi"
            className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center text-ink-muted transition-colors hover:text-ink"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
              <path
                d="M5 5l10 10M15 5L5 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {confirmingDiscard ? (
          <div className="border-b border-warn bg-warn-field px-6 py-4">
            <p className="font-prose text-base text-ink">
              Ci sono modifiche non salvate. Se chiudi adesso vanno perse.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onClose}
                className="border border-line-strong px-3 py-2 font-mono text-tiny font-medium text-ink transition-colors hover:bg-sunken"
              >
                Scarta le modifiche
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDiscard(false)}
                className="bg-inverse-ground px-3 py-2 font-mono text-tiny font-medium text-inverse-ink transition-opacity hover:opacity-90"
              >
                Continua a modificare
              </button>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
};

export default Dialog;
