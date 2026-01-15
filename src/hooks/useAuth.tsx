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
      setError(authError instanceof Error ? authError.message : "Unable to sign in");
      throw authError;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await createUserWithEmailAndPassword(firebaseAuth, email, password);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to sign up");
      throw authError;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setError(null);
    try {
      await signOut(firebaseAuth);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to sign out");
      throw authError;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

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
