/**
 * The application chrome: the auth wall, the navigation, and the running session.
 *
 * The running-session bar lives here rather than on the task page for a reason that used to be a
 * bug: a session could only be stopped from the detail page of the task it belonged to, so deleting
 * that task stranded a timer that could never be stopped and blocked every future one. A Stop that
 * is always on screen makes that state unreachable, and the bar can also discard a session whose
 * task no longer exists.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { formatElapsed } from "../lib/dates";
import { DEMO_EMAIL, READ_ONLY_MESSAGE } from "../lib/demoAccount";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useAuth } from "../hooks/useAuth";
import { useTaskStore } from "../hooks/useTaskStore";
import { useTimer } from "../hooks/useTimer";
import { Button, ErrorNote, Field, TextInput } from "./controls";
import ThemeToggle from "./ThemeToggle";

const NAV_LINKS = [
  { href: "/", label: "Oggi" },
  { href: "/tasks", label: "Task" },
  { href: "/capture", label: "Cattura" },
  { href: "/timeline", label: "Timeline" },
  { href: "/report", label: "Report" },
  { href: "/insights", label: "Insights" },
];

// ─── Sessione in corso ───────────────────────────────────────────────────────

const RunningSessionBar = () => {
  const { timerState, elapsedSeconds, previewStop, clearTimer } = useTimer();
  const { tasks, createWorkLog } = useTaskStore();
  const stop = useAsyncAction();
  const [warning, setWarning] = useState<string | null>(null);

  if (timerState.status !== "running") return null;

  const task = tasks.find((candidate) => candidate.id === timerState.taskId);
  const taskIsGone = tasks.length > 0 && !task;

  const handleStop = async () => {
    setWarning(null);
    const preview = previewStop();
    if (preview.ok === false) {
      setWarning(preview.error);
      return;
    }
    const session = preview.value;
    // Write first, clear second. The reverse order is what used to lose a session whenever the
    // write failed: the state and localStorage were already gone by the time the error arrived.
    const written = await stop.run(
      () =>
        createWorkLog({
          taskId: session.taskId,
          stepId: session.stepId,
          tags: task?.tags ?? [],
          type: "stop",
          timestamp: session.stoppedAt,
          durationMinutes: session.durationMinutes,
        }),
      "Non sono riuscito a salvare la sessione. La sessione è ancora in corso: riprova.",
    );
    if (written) clearTimer();
  };

  return (
    <div className="bg-inverse-ground text-inverse-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-good"
          />
          <span data-numeric className="font-mono text-lead font-medium tabular-nums">
            {formatElapsed(elapsedSeconds)}
          </span>
        </span>

        <span className="min-w-0 flex-1 font-prose text-base">
          {taskIsGone ? (
            <span>Il task di questa sessione non esiste più.</span>
          ) : (
            <Link href={`/tasks/${timerState.taskId}`} className="underline decoration-1">
              {timerState.taskTitle}
              {timerState.stepTitle ? (
                <span className="opacity-80"> · {timerState.stepTitle}</span>
              ) : null}
            </Link>
          )}
        </span>

        <span className="flex items-center gap-2">
          {taskIsGone ? (
            <button
              type="button"
              onClick={clearTimer}
              className="min-h-[2.25rem] border border-current px-3 py-1.5 font-mono text-tiny font-medium"
            >
              Scarta sessione
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              disabled={stop.pending}
              aria-busy={stop.pending || undefined}
              className="min-h-[2.25rem] bg-inverse-ink px-4 py-1.5 font-mono text-tiny font-medium text-inverse-ground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {stop.pending ? "Salvo…" : "Ferma e registra"}
            </button>
          )}
        </span>

        {stop.error || warning ? (
          <p role="alert" className="w-full font-prose text-small">
            {stop.error ?? warning}
          </p>
        ) : null}
      </div>
    </div>
  );
};

// ─── Muro di autenticazione ──────────────────────────────────────────────────

const AuthWall = () => {
  const { error, signIn, signUp, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = useAsyncAction();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    await action.run(
      () => (mode === "signin" ? signIn(email, password) : signUp(email, password)),
      mode === "signin" ? "Accesso non riuscito." : "Registrazione non riuscita.",
    );
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16">
      <p className="font-mono text-micro uppercase tracking-[0.2em] text-ink-muted">ChronoStep</p>
      <h1 className="mt-4 font-prose text-verdict font-semibold text-ink">
        {mode === "signin" ? "Bentornato" : "Crea il tuo diario"}
        <span aria-hidden="true" className="text-ink-muted">
          .
        </span>
      </h1>
      <p className="mt-3 font-prose text-prose text-ink-muted">
        Un diario operativo: task, step annidati e il tempo che ci hai messo davvero.
      </p>

      <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-5">
        <Field label="Email">
          {(props) => (
            <TextInput
              {...props}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          )}
        </Field>
        <Field label="Password">
          {(props) => (
            <TextInput
              {...props}
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          )}
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Button type="submit" variant="primary" pending={action.pending} pendingLabel="Un attimo…">
          {mode === "signin" ? "Entra" : "Crea l'account"}
        </Button>

        <button
          type="button"
          className="self-start font-mono text-tiny text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            clearError();
          }}
        >
          {mode === "signin" ? "Non hai un account? Registrati." : "Hai già un account? Accedi."}
        </button>
      </form>

      {/*
        The demo account is a product decision, not an oversight: the app is meant to be shown to
        someone. What used to be said here was that anything typed into it is visible to everyone —
        which was honest, and was also a description of a problem. It is now read-only, enforced in
        `firestore.rules`, so the sentence changed from a warning into a fact about what it does.

        The address comes from `DEMO_EMAIL` rather than being written twice: it is the same constant
        the app reads to put itself in read-only mode, and two copies of it would eventually name
        two different accounts.
      */}
      <aside className="mt-12 border-t border-line pt-6">
        <h2 className="font-mono text-micro uppercase tracking-wider text-ink-muted">
          Account di prova
        </h2>
        <p className="mt-2 font-prose text-base text-ink">
          <span data-numeric className="font-mono text-small">
            {DEMO_EMAIL}
          </span>{" "}
          ·{" "}
          <span data-numeric className="font-mono text-small">
            adminEx
          </span>
        </p>
        <p className="mt-2 font-prose text-tiny text-ink-muted">
          Si guarda e basta: da questo account non si può creare, modificare né cancellare niente,
          così quello che c'è dentro resta com'è per chi arriva dopo.
        </p>
      </aside>
    </main>
  );
};

// ─── Sola lettura ────────────────────────────────────────────────────────────

/**
 * The band that says this account may only look.
 *
 * In the chrome rather than on a page, for the same reason the running-session bar is: it is true
 * of the whole application, not of whatever screen happens to be open. It is set in `warn` — the
 * colour for "this wants your attention" — because it is not an error and nothing is behind; it is
 * a condition the visitor should know about before they try to change something.
 */
const ReadOnlyBand = () => {
  const { isReadOnly } = useTaskStore();
  if (!isReadOnly) return null;

  return (
    <div className="border-b border-line bg-warn-field">
      <div className="mx-auto w-full max-w-6xl px-6 py-2.5">
        <p className="font-prose text-base text-ink">
          {READ_ONLY_MESSAGE}{" "}
          <span className="text-ink-muted">
            Le credenziali sono pubbliche, quindi quello che vedi resta com'è per chi arriva dopo.
          </span>
        </p>
      </div>
    </div>
  );
};

// ─── Shell ───────────────────────────────────────────────────────────────────

const AppShell = ({ children }: { children: ReactNode }) => {
  const { user, loading, signOutUser } = useAuth();
  const pathname = usePathname();

  const isActive = useMemo(
    () => (href: string) =>
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`),
    [pathname],
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-tiny uppercase tracking-wider text-ink-muted">
          Verifico la sessione…
        </p>
      </main>
    );
  }

  if (!user) return <AuthWall />;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link href="/" className="font-mono text-micro uppercase tracking-[0.2em] text-ink no-underline">
            ChronoStep
          </Link>

          {/*
            The nav scrolls sideways on a narrow screen instead of wrapping. Wrapping turned the
            links into a column one line per link tall, and pushed the wordmark away from the
            account controls.
          */}
          <nav
            aria-label="Sezioni"
            className="order-last flex w-full items-center gap-x-5 overflow-x-auto sm:order-none sm:w-auto sm:flex-1 sm:overflow-visible"
          >
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 border-b-2 py-1 font-mono text-tiny no-underline transition-colors ${
                    active
                      ? "border-ink font-medium text-ink"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-1 items-center justify-end gap-4 sm:flex-none">
            <ThemeToggle />
            <span
              className="hidden font-mono text-tiny text-ink-muted sm:inline"
              title={user.email ?? user.uid}
            >
              {user.email ?? user.uid}
            </span>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="font-mono text-tiny text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
            >
              Esci
            </button>
          </div>
        </div>
      </header>

      <ReadOnlyBand />
      <RunningSessionBar />

      <div className="flex-1">{children}</div>
    </div>
  );
};

export default AppShell;
