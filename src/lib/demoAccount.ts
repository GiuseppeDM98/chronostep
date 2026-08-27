/**
 * The public demo account, and the fact that it may only look.
 *
 * ChronoStep shows its demo credentials on the sign-in screen, so that account is reachable by
 * everyone who has the link. Letting it write means letting anyone edit or delete what the next
 * visitor is going to see, and there is no server tier to undo it afterwards.
 *
 * Read-only is enforced in **`firestore.rules`**, and that is the only place it can be enforced:
 * everything in this file is the interface being honest about a decision the database has already
 * made. A hidden button is a suggestion; the rule is the fact.
 *
 * WARNING: `NEXT_PUBLIC_DEMO_EMAIL` and the address hard-coded in `isDemoAccount()` inside
 * `firestore.rules` must name the same account. If they drift, the app offers actions the database
 * then refuses — which is the one failure mode this whole arrangement exists to avoid.
 */

/**
 * The demo address, lower-cased.
 *
 * Defaults to the address the sign-in screen has always shown, so the feature is correct on a
 * deployment that never sets the variable — the failure to avoid here is a demo account that
 * silently regains write access because an environment was configured incompletely.
 */
export const DEMO_EMAIL = (process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "admin@example.com")
  .trim()
  .toLowerCase();

/**
 * Is this the demo account?
 *
 * Compared without case, because Firebase Auth does not normalise it and "Admin@Example.com" signs
 * into the same account. The rules do the same comparison, the same way.
 */
export const isDemoAccount = (email?: string | null): boolean =>
  DEMO_EMAIL.length > 0 && (email ?? "").trim().toLowerCase() === DEMO_EMAIL;

/** What the user is told, wherever they meet the limit. One sentence, used everywhere. */
export const READ_ONLY_MESSAGE =
  "Questo è l'account di prova: si può guardare tutto, ma non si può cambiare niente.";
