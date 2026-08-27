"use client";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { firebaseAuth } from "../lib/firebaseClient";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Turns a Firebase auth failure into something a person can act on.
 *
 * Two reasons this is not just cosmetic. First, the raw strings are developer output —
 * "Firebase: Error (auth/invalid-credential)." tells the user nothing about what to do next.
 * Second, and less obvious: Firebase distinguishes "no such account" from "wrong password", and
 * rendering that distinction turns the sign-in form into an oracle for whether a given address has
 * an account here. Both collapse into one message on purpose.
 */
const describeAuthError = (error: unknown): string => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email o password non corrette.";
    case "auth/invalid-email":
      return "Questo indirizzo email non è valido.";
    case "auth/user-disabled":
      return "Questo account è disattivato.";
    case "auth/email-already-in-use":
      return "Esiste già un account con questa email. Prova ad accedere.";
    case "auth/weak-password":
      return "La password è troppo corta: servono almeno sei caratteri.";
    case "auth/too-many-requests":
      return "Troppi tentativi. Aspetta qualche minuto e riprova.";
    case "auth/network-request-failed":
      return "Nessuna connessione. Controlla la rete e riprova.";
    case "auth/operation-not-allowed":
      return "L'accesso con email e password non è abilitato su questo progetto Firebase.";
    default:
      return "Non è andata. Riprova fra un momento.";
  }
};

const SIGNUPS_DISABLED = process.env.NEXT_PUBLIC_DISABLE_SIGNUPS === "true";
const SIGNUP_WHITELIST = new Set(
  (process.env.NEXT_PUBLIC_SIGNUP_WHITELIST ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

const isSignupAllowed = (email: string) => {
  if (!SIGNUPS_DISABLED) {
    return true;
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }
  return SIGNUP_WHITELIST.has(normalizedEmail);
};

// AuthProvider exposes Firebase auth state and actions through a single context.
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Keep Firebase as the source of truth and update UI on sign-in/out events.
    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (authError) {
      setError(describeAuthError(authError));
      // Re-throw the error after storing it so callers can handle both
      // UI feedback (via context.error) and local error boundaries.
      throw authError;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(null);
    // Checked before the try, not inside it: routing this through the same catch as a Firebase
    // failure would run it through describeAuthError, which has no code to match and would replace
    // the specific reason with the generic one.
    if (!isSignupAllowed(email)) {
      const message = "Le registrazioni sono chiuse per questo indirizzo.";
      setError(message);
      throw new Error(message);
    }
    try {
      await createUserWithEmailAndPassword(firebaseAuth, email, password);
    } catch (authError) {
      setError(describeAuthError(authError));
      // Re-throw the error after storing it so callers can handle both
      // UI feedback (via context.error) and local error boundaries.
      throw authError;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setError(null);
    try {
      await signOut(firebaseAuth);
    } catch (authError) {
      setError(describeAuthError(authError));
      // Re-throw the error after storing it so callers can handle both
      // UI feedback (via context.error) and local error boundaries.
      throw authError;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Memoize the context value to prevent unnecessary re-renders of all consumers.
  // Callbacks are already stable via useCallback, so the value only changes when
  // auth state (user/loading/error) changes.
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      signIn,
      signUp,
      signOutUser,
      clearError,
    }),
    [user, loading, error, signIn, signUp, signOutUser, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Hook wrapper that enforces usage within the AuthProvider boundary.
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
