/**
 * A clock that actually moves.
 *
 * "Oggi" used to memoize its date with an empty dependency array, so a tab left open overnight kept
 * insisting it was yesterday — and every verdict computed from it was wrong until someone reloaded.
 * Anything that reasons about *now* reads it from here instead.
 *
 * The default cadence is a minute: nothing on these screens changes faster than that, and the live
 * seconds readout has its own ticker inside the timer context.
 */
"use client";

import { useEffect, useState } from "react";

const MINUTE = 60_000;

export const useNow = (intervalMs: number = MINUTE) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), intervalMs);
    // A tab that was suspended comes back with a stale clock; re-read the moment it is visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return now;
};
