/**
 * Providers - Client-side provider wrapper
 *
 * Centralizes client providers (AuthProvider) so RootLayout
 * can remain a server component. Enables "use client" boundary here.
 */
"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../hooks/useAuth";

const Providers = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

export default Providers;
