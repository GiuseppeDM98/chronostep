/**
 * The running work session.
 *
 * One session at a time, global to the app, mirrored to localStorage so a reload or a second tab
 * does not lose it.
 *
 * The important design decision is that **stopping is two steps, not one**. `previewStop()` reads
 * the session without touching it; only `clearTimer()` ends it. Callers write the work log first
 * and clear afterwards, so a failed write leaves the session running and retryable. The previous
 * version cleared state and localStorage before awaiting the write, which meant any network blip
 * destroyed the session and the minutes with it — silently, because the error had nowhere to go.
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./useAuth";

type TimerStatus = "idle" | "running";

export type RunningTimer = {
  status: "running";
  userId: string;
  taskId: string;
  taskTitle: string;
  stepId?: string;
  stepTitle?: string;
  startedAt: string;
};

export type TimerState = { status: "idle" } | RunningTimer;

type TimerStartInput = {
  taskId: string;
  taskTitle: string;
  stepId?: string;
  stepTitle?: string;
};

export type ClosedSession = {
  taskId: string;
  stepId?: string;
  taskTitle: string;
  stepTitle?: string;
  startedAt: string;
  stoppedAt: string;
  durationMinutes: number;
};

type TimerResult<T> = { ok: true; value: T } | { ok: false; error: string };

type TimerContextValue = {
  timerState: TimerState;
  status: TimerStatus;
  elapsedMinutes: number;
  elapsedSeconds: number;
  startTimer: (input: TimerStartInput) => TimerResult<RunningTimer>;
  /** Reads the session that would be closed, WITHOUT ending it. */
  previewStop: () => TimerResult<ClosedSession>;
  /** Ends the session. Call only once the work log has been written. */
  clearTimer: () => void;
};

const TIMER_STORAGE_KEY = "chronostep.timer.v1";
const TIMER_TICK_MS = 1000;

const TimerContext = createContext<TimerContextValue | null>(null);

const isRunning = (state: TimerState): state is RunningTimer => state.status === "running";

/**
 * localStorage access is wrapped everywhere: a browser with site data blocked (or Safari in
 * private mode on older versions) throws on read AND on write. A timer preference is never worth
 * an unrenderable app, so every failure degrades to "no stored session".
 */
const readStoredTimer = (): TimerState => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TIMER_STORAGE_KEY);
  } catch {
    return { status: "idle" };
  }
  return parseStoredTimer(raw);
};

const parseStoredTimer = (raw: string | null): TimerState => {
  if (!raw) return { status: "idle" };
  try {
    const parsed = JSON.parse(raw) as Partial<RunningTimer>;
    if (
      parsed &&
      parsed.status === "running" &&
      typeof parsed.userId === "string" &&
      typeof parsed.taskId === "string" &&
      typeof parsed.taskTitle === "string" &&
      typeof parsed.startedAt === "string" &&
      !Number.isNaN(new Date(parsed.startedAt).valueOf())
    ) {
      return {
        status: "running",
        userId: parsed.userId,
        taskId: parsed.taskId,
        taskTitle: parsed.taskTitle,
        stepId: parsed.stepId,
        stepTitle: parsed.stepTitle,
        startedAt: parsed.startedAt,
      };
    }
  } catch {
    return { status: "idle" };
  }
  return { status: "idle" };
};

const writeStoredTimer = (state: TimerState) => {
  try {
    if (state.status === "idle") localStorage.removeItem(TIMER_STORAGE_KEY);
    else localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A session that cannot be persisted still runs for this tab; that is the correct degradation.
  }
};

export const TimerProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const [timerState, setTimerState] = useState<TimerState>({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const hadUserRef = useRef(false);

  // Restore on mount. Reading in an effect rather than in the initial state keeps the server and
  // the first client render identical, which is what avoids a hydration mismatch.
  useEffect(() => {
    setTimerState(readStoredTimer());
  }, []);

  // A second tab starting or stopping a session moves this one too.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== TIMER_STORAGE_KEY) return;
      const next = parseStoredTimer(event.newValue);
      if (next.status === "running" && user && next.userId !== user.uid) {
        setTimerState({ status: "idle" });
        return;
      }
      setTimerState(next);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [user]);

  useEffect(() => {
    if (timerState.status !== "running") return;
    const interval = window.setInterval(() => setNow(Date.now()), TIMER_TICK_MS);
    return () => window.clearInterval(interval);
  }, [timerState.status]);

  /**
   * Reconcile the session with the signed-in account.
   *
   * The distinction that matters: "nobody is signed in" is not the same as "somebody signed out".
   * On first load `user` is null while Firebase resolves the session, and wiping storage then would
   * destroy a running session on every page load — which is why the previous version left storage
   * alone and, as a result, let a session survive an actual sign-out and reappear hours later with
   * its original start time. `loading` separates the two cases, and `hadUserRef` proves a real
   * sign-out happened.
   */
  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (hadUserRef.current) {
        hadUserRef.current = false;
        setTimerState({ status: "idle" });
        writeStoredTimer({ status: "idle" });
      }
      return;
    }

    hadUserRef.current = true;

    // A session belonging to a different account is not this user's business.
    setTimerState((current) => {
      if (current.status === "running" && current.userId !== user.uid) {
        writeStoredTimer({ status: "idle" });
        return { status: "idle" };
      }
      return current;
    });
  }, [loading, user]);

  const startTimer = useCallback(
    (input: TimerStartInput): TimerResult<RunningTimer> => {
      if (!user) {
        return { ok: false, error: "Devi essere autenticato per avviare una sessione." };
      }
      if (timerState.status === "running") {
        return { ok: false, error: "C'è già una sessione in corso. Fermala prima di aprirne un'altra." };
      }
      const next: RunningTimer = {
        status: "running",
        userId: user.uid,
        taskId: input.taskId,
        taskTitle: input.taskTitle,
        stepId: input.stepId,
        stepTitle: input.stepTitle,
        startedAt: new Date().toISOString(),
      };
      setTimerState(next);
      writeStoredTimer(next);
      setNow(Date.now());
      return { ok: true, value: next };
    },
    [timerState.status, user],
  );

  const previewStop = useCallback((): TimerResult<ClosedSession> => {
    if (!isRunning(timerState)) {
      return { ok: false, error: "Non c'è nessuna sessione da fermare." };
    }
    const stoppedAt = new Date();
    const startedAtMs = new Date(timerState.startedAt).valueOf();
    const elapsedMs = stoppedAt.valueOf() - startedAtMs;

    // A negative span means the machine's clock moved backwards mid-session. The old code clamped
    // it to one minute, which turned a broken measurement into a plausible-looking log. Refusing is
    // the honest outcome: better no minutes than invented ones.
    if (elapsedMs < 0) {
      return {
        ok: false,
        error:
          "L'orologio del computer è andato indietro durante la sessione, quindi la durata non è calcolabile. Scarta la sessione e riavviala.",
      };
    }

    return {
      ok: true,
      value: {
        taskId: timerState.taskId,
        stepId: timerState.stepId,
        taskTitle: timerState.taskTitle,
        stepTitle: timerState.stepTitle,
        startedAt: timerState.startedAt,
        stoppedAt: stoppedAt.toISOString(),
        durationMinutes: Math.max(1, Math.round(elapsedMs / 60000)),
      },
    };
  }, [timerState]);

  const clearTimer = useCallback(() => {
    setTimerState({ status: "idle" });
    writeStoredTimer({ status: "idle" });
  }, []);

  const elapsedSeconds = useMemo(() => {
    if (!isRunning(timerState)) return 0;
    const startedAtMs = new Date(timerState.startedAt).valueOf();
    return Math.max(0, Math.floor((now - startedAtMs) / 1000));
  }, [now, timerState]);

  const elapsedMinutes = useMemo(() => Math.max(0, Math.round(elapsedSeconds / 60)), [elapsedSeconds]);

  const value = useMemo<TimerContextValue>(
    () => ({
      timerState,
      status: timerState.status,
      elapsedMinutes,
      elapsedSeconds,
      startTimer,
      previewStop,
      clearTimer,
    }),
    [timerState, elapsedMinutes, elapsedSeconds, startTimer, previewStop, clearTimer],
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
};

export const useTimer = () => {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error("useTimer must be used within a TimerProvider.");
  }
  return context;
};
