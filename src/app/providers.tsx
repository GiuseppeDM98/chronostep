"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../hooks/useAuth";

const Providers = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

export default Providers;
