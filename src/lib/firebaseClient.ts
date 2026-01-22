"use client";

/**
 * Firebase client initialization with HMR support.
 *
 * This module uses a singleton pattern to prevent duplicate Firebase app
 * initialization during Next.js development HMR (Hot Module Replacement).
 * Without this check, each HMR would create a new Firebase app instance
 * and trigger warnings about duplicate app initialization.
 */

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Check if app exists before initializing to avoid duplicate Firebase apps during HMR.
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/** Firebase app instance shared across the application. */
export const firebaseApp = app;

/** Firebase Auth instance for authentication operations. */
export const firebaseAuth = getAuth(app);
