/**
 * Providers - Client-side provider wrapper
 *
 * Centralizes client providers (AuthProvider) so RootLayout
 * can remain a server component. Enables "use client" boundary here.
 */
"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../hooks/useAuth";
import { TimerProvider } from "../hooks/useTimer";

const Providers = ({ children }: { children: ReactNode }) => (
  <AuthProvider>
    <TimerProvider>{children}</TimerProvider>
  </AuthProvider>
);

export default Providers;
