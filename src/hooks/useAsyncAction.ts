/**
 * Runs one async action at a time and keeps its failure visible.
 *
 * Every write in this app went out as `void store.deleteTask(id)` or an un-awaited `onChange`
 * handler: the promise was discarded, so a rejected write produced no error, no retry, and no
 * change on screen — the user simply saw the old value and assumed they had misclicked. There is no
 * server tier here to reconcile afterwards, so a swallowed write is a lost one.
 *
 * `pending` also serves the second half of the problem: a control bound to it cannot be fired twice
 * while the first call is still in flight.
 */
"use client";

import { useCallback, useRef, useState } from "react";

type AsyncActionState = {
  pending: boolean;
  error: string | null;
};

export const useAsyncAction = () => {
  const [state, setState] = useState<AsyncActionState>({ pending: false, error: null });
  // Survives an unmount mid-flight: setting state on a gone component is a warning, not a feature.
  const mounted = useRef(true);

  const run = useCallback(async (action: () => Promise<unknown>, fallbackMessage: string) => {
    setState({ pending: true, error: null });
    try {
      await action();
      if (mounted.current) setState({ pending: false, error: null });
      return true;
    } catch (error) {
      if (mounted.current) {
        setState({
          pending: false,
          error: error instanceof Error && error.message ? error.message : fallbackMessage,
        });
      }
      return false;
    }
  }, []);

  const clearError = useCallback(() => setState((current) => ({ ...current, error: null })), []);

  return { ...state, run, clearError };
};
