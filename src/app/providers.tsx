"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../hooks/useAuth";

// Centralize client-side providers so the layout stays server-friendly.
const Providers = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

export default Providers;
