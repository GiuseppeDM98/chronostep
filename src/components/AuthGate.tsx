"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import TopNav from "./TopNav";

/**
 * Authentication gate that wraps all application pages.
 *
 * Renders a sign-in/sign-up form for unauthenticated users, shows a loading
 * state during Firebase session verification, and displays the protected content
 * with navigation for authenticated users.
 *
 * @param children - Protected page content to render after authentication
 */
const AuthGate = ({ children }: { children: ReactNode }) => {
  const { user, loading, error, signIn, signUp, signOutUser, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      // Switch between sign-in and sign-up flows using the same form state.
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      setEmail("");
      setPassword("");
      clearError();
    } catch (actionError) {
      console.error(actionError);
    } finally {
      setSubmitting(false);
    }
  };

  // Render loading state while verifying Firebase session
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="text-sm text-slate-500">Verifying session…</p>
      </main>
    );
  }

  // Render authentication form for unauthenticated users
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Chronostep
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {mode === "signin" ? "Access your tasks" : "Create an account"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Firebase Authentication protects your personal workspace.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={submitting}
            >
              {submitting
                ? mode === "signin"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "signin"
                ? "Sign in"
                : "Create account"}
            </button>
            <button
              type="button"
              className="w-full text-sm text-slate-600 underline decoration-dashed underline-offset-4"
              onClick={() => {
                // Reset auth errors when switching between sign-in and sign-up modes.
                setMode(mode === "signin" ? "signup" : "signin");
                clearError();
              }}
            >
              {mode === "signin"
                ? "Need an account? Register here."
                : "Already registered? Back to sign in."}
            </button>
          </div>
        </form>
      </main>
    );
  }

  // Render protected content with navigation for authenticated users
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3 text-sm text-slate-600">
          <div>
            Signed in as <span className="font-semibold">{user.email ?? user.uid}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              // Fire-and-forget sign-out; UI will update from auth state listener.
              void signOutUser();
            }}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400"
          >
            Sign out
          </button>
        </div>
        <TopNav />
      </div>
      {children}
    </div>
  );
};

export default AuthGate;
