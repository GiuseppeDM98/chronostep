"use client";

/**
 * Firebase client initialization.
 *
 * Two things happen here beyond calling initializeApp.
 *
 * 1. **HMR guard.** Next re-executes this module on every hot reload; without the getApps() check
 *    each reload registers another Firebase app and the SDK warns about duplicates.
 *
 * 2. **Emulator mode.** With `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` the SDK is pointed at the
 *    local Auth and Firestore emulators instead of the real project. That is what makes it possible
 *    to develop, seed fixtures, and take screenshots of populated screens without touching real
 *    data — and it exercises `firestore.rules` on the way, so a rules change is caught locally
 *    rather than after a deploy.
 */

import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/** Firebase app instance shared across the application. */
export const firebaseApp = app;

/** Firebase Auth instance for authentication operations. */
export const firebaseAuth = getAuth(app);

if (useEmulator && typeof window !== "undefined") {
  // Guarded by a module-level flag on the global: React strict mode mounts twice in development,
  // and connecting an already-connected emulator throws.
  const globalWithFlag = window as typeof window & { __chronostepEmulatorsConnected?: boolean };
  if (!globalWithFlag.__chronostepEmulatorsConnected) {
    globalWithFlag.__chronostepEmulatorsConnected = true;
    connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(getFirestore(app), "127.0.0.1", 8080);
  }
}
