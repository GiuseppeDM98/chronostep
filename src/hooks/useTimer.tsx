/**
 * Timer context for tracking an active work session.
 *
 * Persists the timer state in localStorage to survive refreshes
 * and keeps the UI in sync across browser tabs.
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

export type TimerState =
  | { status: "idle" }
  | {
      status: "running";
      userId: string;
      taskId: string;
      taskTitle: string;
      stepId?: string;
      stepTitle?: string;
      startedAt: string;
    };

type TimerStartInput = {
  taskId: string;
  taskTitle: string;
  stepId?: string;
  stepTitle?: string;
};

type TimerStopResult = {
  taskId: string;
  stepId?: string;
  taskTitle: string;
  stepTitle?: string;
  startedAt: string;
  stoppedAt: string;
  durationMinutes: number;
};

type TimerStartResult = { ok: true } | { ok: false; error: string };

type TimerContextValue = {
  timerState: TimerState;
  status: TimerStatus;
  elapsedMinutes: number;
  elapsedSeconds: number;
  startTimer: (input: TimerStartInput) => TimerStartResult;
  stopTimer: () => TimerStopResult | null;
  clearTimer: () => void;
};

const TIMER_STORAGE_KEY = "chronostep.timer.v1";
const TIMER_TICK_MS = 1000;

const TimerContext = createContext<TimerContextValue | null>(null);

const isRunningTimer = (state: TimerState): state is Extract<TimerState, { status: "running" }> =>
  state.status === "running";

const parseStoredTimer = (raw: string | null): TimerState => {
  if (!raw) return { status: "idle" };
  try {
    const parsed = JSON.parse(raw) as Partial<TimerState>;
    if (parsed && parsed.status === "running") {
      const candidate = parsed as Extract<TimerState, { status: "running" }>;
      if (
        typeof candidate.userId === "string" &&
        typeof candidate.taskId === "string" &&
        typeof candidate.taskTitle === "string" &&
        typeof candidate.startedAt === "string"
      ) {
        return {
          status: "running",
          userId: candidate.userId,
          taskId: candidate.taskId,
          taskTitle: candidate.taskTitle,
          stepId: candidate.stepId,
          stepTitle: candidate.stepTitle,
          startedAt: candidate.startedAt,
        };
      }
    }
  } catch {
    return { status: "idle" };
  }
  return { status: "idle" };
};

const saveTimerToStorage = (state: TimerState) => {
  if (state.status === "idle") {
    localStorage.removeItem(TIMER_STORAGE_KEY);
    return;
  }
  localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
};

export const TimerProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [timerState, setTimerState] = useState<TimerState>({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    setTimerState(parseStoredTimer(localStorage.getItem(TIMER_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== TIMER_STORAGE_KEY) return;
      const nextState = parseStoredTimer(event.newValue);
      if (nextState.status === "running" && user && nextState.userId !== user.uid) {
        setTimerState({ status: "idle" });
        return;
      }
      setTimerState(nextState);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [user]);

  useEffect(() => {
    if (timerState.status !== "running") return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, TIMER_TICK_MS);
    return () => window.clearInterval(interval);
  }, [timerState.status]);

  useEffect(() => {
    if (!user) {
      lastUserIdRef.current = null;
      if (timerState.status !== "idle") {
        setTimerState({ status: "idle" });
      }
      return;
    }

    if (lastUserIdRef.current !== user.uid) {
      lastUserIdRef.current = user.uid;
    }

    if (timerState.status === "running" && timerState.userId !== user.uid) {
      setTimerState({ status: "idle" });
      localStorage.removeItem(TIMER_STORAGE_KEY);
      return;
    }

    if (timerState.status === "idle") {
      const stored = parseStoredTimer(localStorage.getItem(TIMER_STORAGE_KEY));
      if (stored.status === "running" && stored.userId === user.uid) {
        setTimerState(stored);
      }
    }
  }, [timerState, user]);

  const startTimer = useCallback(
    (input: TimerStartInput): TimerStartResult => {
      if (!user) {
        return { ok: false, error: "Devi essere autenticato per avviare il timer." };
      }
      if (timerState.status === "running") {
        return { ok: false, error: "C'è già un timer in corso." };
      }
      const nextState: TimerState = {
        status: "running",
        userId: user.uid,
        taskId: input.taskId,
        taskTitle: input.taskTitle,
        stepId: input.stepId,
        stepTitle: input.stepTitle,
        startedAt: new Date().toISOString(),
      };
      setTimerState(nextState);
      saveTimerToStorage(nextState);
      setNow(Date.now());
      return { ok: true };
    },
    [timerState.status, user],
  );

  const stopTimer = useCallback((): TimerStopResult | null => {
    if (!isRunningTimer(timerState)) return null;
    const stoppedAt = new Date().toISOString();
    const startedAtMs = new Date(timerState.startedAt).valueOf();
    const stoppedAtMs = new Date(stoppedAt).valueOf();
    const durationMinutes = Math.max(1, Math.round((stoppedAtMs - startedAtMs) / 60000));
    const result: TimerStopResult = {
      taskId: timerState.taskId,
      stepId: timerState.stepId,
      taskTitle: timerState.taskTitle,
      stepTitle: timerState.stepTitle,
      startedAt: timerState.startedAt,
      stoppedAt,
      durationMinutes,
    };
    setTimerState({ status: "idle" });
    saveTimerToStorage({ status: "idle" });
    setNow(Date.now());
    return result;
  }, [timerState]);

  const clearTimer = useCallback(() => {
    setTimerState({ status: "idle" });
    saveTimerToStorage({ status: "idle" });
  }, []);

  const elapsedMinutes = useMemo(() => {
    if (!isRunningTimer(timerState)) return 0;
    const startedAtMs = new Date(timerState.startedAt).valueOf();
    const diffMinutes = Math.round((now - startedAtMs) / 60000);
    return Math.max(1, diffMinutes);
  }, [now, timerState]);

  const elapsedSeconds = useMemo(() => {
    if (!isRunningTimer(timerState)) return 0;
    const startedAtMs = new Date(timerState.startedAt).valueOf();
    const diffSeconds = Math.floor((now - startedAtMs) / 1000);
    return Math.max(0, diffSeconds);
  }, [now, timerState]);

  const value = useMemo<TimerContextValue>(
    () => ({
      timerState,
      status: timerState.status,
      elapsedMinutes,
      elapsedSeconds,
      startTimer,
      stopTimer,
      clearTimer,
    }),
    [elapsedMinutes, elapsedSeconds, startTimer, stopTimer, timerState, clearTimer],
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
};

export const useTimer = () => {
  const ctx = useContext(TimerContext);
  if (!ctx) {
    throw new Error("useTimer must be used within a TimerProvider.");
  }
  return ctx;
};
