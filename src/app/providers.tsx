/**
 * Client provider stack, so the root layout can stay a server component.
 *
 * Order is load-bearing: the timer and the store both read the signed-in user, and the store is
 * mounted above the app chrome because the running-session bar writes a work log from outside any
 * page.
 */
"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../hooks/useAuth";
import { TaskStoreProvider } from "../hooks/useTaskStore";
import { ThemeProvider } from "../hooks/useTheme";
import { TimerProvider } from "../hooks/useTimer";

const Providers = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>
    <AuthProvider>
      <TimerProvider>
        <TaskStoreProvider>{children}</TaskStoreProvider>
      </TimerProvider>
    </AuthProvider>
  </ThemeProvider>
);

export default Providers;
