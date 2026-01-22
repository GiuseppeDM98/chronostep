# AGENTS.md
Chronostep project notes for Codex agents.
Keep changes aligned with existing patterns and keep output actionable.

## Project snapshot
- Framework: Next.js App Router with TypeScript.
- Styling: Tailwind CSS + minimal globals in `src/app/globals.css`.
- Auth: Firebase Authentication (email/password only).
- Data: Firebase Firestore (client SDK).
- Runtime: All route pages are client components.

## Code organization
- `src/app/` holds routes and layout.
- `src/app/page.tsx` is the home page.
- `src/app/tasks/page.tsx` lists tasks.
- `src/app/tasks/[id]/page.tsx` is task detail, edit, steps, work logs.
- `src/app/today/page.tsx` is the "Cosa faccio oggi?" focus view.
- `src/app/timeline/page.tsx` is chronological work log view.
- `src/app/report/page.tsx` is monthly report by task.
- `src/app/insights/page.tsx` is analytics + calendar.
- `src/app/layout.tsx` defines metadata and global wrapper.
- `src/app/providers.tsx` wires React context providers.
- `src/components/` contains shared UI (AuthGate, TopNav).
- `src/hooks/` contains app state and auth hooks.
- `src/lib/` contains domain types, Firebase client, and helpers.
- `docs/feature-implementation-ideas.md` tracks future ideas.

## Routing and rendering
- App Router only; no `pages/` directory.
- Pages are client components (`"use client"`) to access hooks.
- No API routes or server actions in this repo.
- `AuthGate` wraps all pages to enforce auth and render the top nav.
- Route params are used for task detail (`/tasks/[id]`).

## Auth flow
- `AuthProvider` in `src/hooks/useAuth.tsx` is the single auth context.
- `AuthGate` renders sign-in or sign-up UI when unauthenticated.
- Auth uses Firebase client SDK (`firebase/auth`) only.
- `signOutUser` is called from the top bar in `AuthGate`.
- New sign-ups can be disabled via `NEXT_PUBLIC_DISABLE_SIGNUPS`, with allowed emails in `NEXT_PUBLIC_SIGNUP_WHITELIST`.
- The login screen can surface shared demo credentials for open-source trials.

## Data model (Firestore)
- Collections: `tasks`, `steps`, `workLogs`.
- Every document must include `userId` for security rules.
- `tasks` store status, priority, tags, dueDate, timestamps.
- `steps` store order, optional parentStepId (nested steps), and dueDate.
- `workLogs` store type (`start` | `stop` | `note`), timestamp, and tags.

## Domain types
- `src/lib/types.ts` defines canonical domain shapes.
- `TaskStatus` includes: `todo`, `in_progress`, `done`, `blocked`.
- `StepStatus` includes: `todo`, `in_progress`, `done`.
- `WorkLogType` includes: `start`, `stop`, `note`.
- Types use ISO timestamp strings, not JS Date objects.

## State and data access
- `useTaskStore` is the single source of truth for data.
- It reads all documents for a user with 3 parallel queries.
- Writes are followed by a `refreshState()` fetch.
- No real-time listeners; everything is fetch-on-demand.
- `isHydrated` gates UI states during initial load.
- Deleting a task cascades to steps and work logs via batched ops.
- Step updates auto-complete ancestor steps and tasks when all children are `done` (no auto-reset).

## UI patterns
- Tailwind only; no component library.
- Layouts are simple `max-w-*` centered containers.
- CTAs use dark backgrounds with rounded corners.
- Status/priority badges are encoded as class maps in the page.
- Step status filters should reuse `TASK_STATUS_OPTIONS` and narrow to `StepStatus` as needed.
- Step status filtering shows only matching steps/substeps; non-matching parents are not shown.
- Task detail uses modals for add/edit flows (task, steps, work logs) with Esc-to-close warnings on unsaved text.
- Copy is mixed Italian/English; keep tone consistent.

## Key helpers
- `src/lib/insights.ts` holds derived metrics and summaries.
- `buildStepsByTask` returns step totals by task.
- `buildTaskActivity` computes durations and last log per task.
- `buildMonthlyReportSummary` aggregates per-task totals and highlights for reports.
- `groupWorkLogsByTag` groups logs by tag for filters.
- `buildTaskTagSummary` summarizes top tags per task for chips.
- `describePriority` normalizes priority labels.

## Firebase setup
- `src/lib/firebaseClient.ts` initializes client SDK.
- Requires `NEXT_PUBLIC_FIREBASE_*` env vars.
- A `FIREBASE_SERVICE_ACCOUNT` JSON string exists in `.env`.
- Service account is not used in client code today.

## Firestore rules
- Rules live in `firestore.rules`.
- All reads/writes require `request.auth` and `userId` ownership.
- `step` access is allowed if owning task or parent step is owned.
- `workLog` access is allowed via task or step ownership.
- Any new collection must follow similar ownership constraints.

## Conventions and patterns
- Prefer `useMemo` for heavy derived computations.
- Prefer `useCallback` for handlers passed to children.
- Use inline UI state for forms (no external state libs).
- Pre-fill Work Log tag inputs from task tags only when the field is empty.
- Sorting is done in render layer (not in Firestore queries).
- When reparenting steps, exclude self/descendants and recompute `order` for the new sibling group.
- Use ISO strings everywhere; UI converts to local display.
- Due dates are converted via `new Date('${yyyy-mm-dd}T00:00:00.000Z')`.
- Localized date formatting uses `toLocaleDateString` and `toLocaleString`.
- JSX copy must escape `<`/`>` (wrap arrow text in `{""}` or use HTML entities).

## Known gaps
- No tests or test framework in repo.
- No lint config file; uses `next lint` defaults.
- No build or deploy scripts beyond `next` defaults.
- `src/lib/mockData.ts` exists but is unused.
- `docs/02-domain-model-and-routes.md` is referenced in comments but missing.

## Commands (package.json)
- `npm run dev` starts the dev server.
- `npm run build` builds for production.
- `npm run start` runs the production server.
- `npm run lint` runs Next.js lint.

## Setup gotchas
- `.env` contains real Firebase credentials. Treat it as sensitive.
- Ensure Firebase Auth (email/password) is enabled in the project.
- Firestore must be enabled and rules deployed.
- `FIREBASE_SERVICE_ACCOUNT` private key must escape newlines (`\n`).
- The app expects `userId` on every document; writes must include it.
- If sign-ups are disabled, only whitelisted emails can register.
- Timezone: due dates are stored as UTC midnight, display is local.
- Deleting steps recurses through children; long trees can be slow.

## Adding new features
- If adding derived metrics, extend `src/lib/insights.ts`.
- If adding new collections, update Firestore rules accordingly.
- Keep UI pieces within pages unless shared across routes.
- Reuse `AuthGate` for any new routes.
- Use `useTaskStore` for all data writes.

## Performance notes
- `useTaskStore` loads all documents each refresh.
- For large data sets, consider pagination or query filters.
- `buildTaskActivity` sorts all logs on every render.
- Avoid heavy computations outside `useMemo`.

## Style and text
- Current UI copy is a mix of Italian and English.
- Keep button labels short and consistent.
- Use sentence case for helper text.

## File references
- Auth context: `src/hooks/useAuth.tsx`
- Task store: `src/hooks/useTaskStore.ts`
- Firebase init: `src/lib/firebaseClient.ts`
- Domain types: `src/lib/types.ts`
- Insights helpers: `src/lib/insights.ts`
- Home page: `src/app/page.tsx`
- Tasks list: `src/app/tasks/page.tsx`
- Task detail: `src/app/tasks/[id]/page.tsx`
- Timeline: `src/app/timeline/page.tsx`
- Insights: `src/app/insights/page.tsx`
- Today: `src/app/today/page.tsx`
- Global styles: `src/app/globals.css`

## Security reminders
- Do not log or print credential values.
- Do not commit service account JSON in new files.
- Ensure new data writes include `userId`.

## Quick triage checklist
- Is the user authenticated and `isHydrated` true?
- Are env vars loaded in the runtime?
- Are Firestore rules allowing the operation?
- Are timestamps ISO strings, not Date objects?
- Are steps ordered correctly with `order`?
