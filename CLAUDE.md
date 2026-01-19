# CLAUDE.md
Keep information concise and actionable.

## Tech stack (versions from package.json)
- Next.js: 14.1.0
- React: 18.2.0
- React DOM: 18.2.0
- TypeScript: 5.3.3
- Tailwind CSS: 3.4.1
- Firebase client SDK: 11.0.1
- Firebase Admin SDK: 12.5.0
- PostCSS: 8.4.33
- Autoprefixer: 10.4.16
- Node.js: not pinned in repo (check local runtime)

## High-level architecture
- Next.js App Router renders client-side pages for all routes.
- Firebase Auth gates the UI; `AuthGate` wraps every page.
- Firestore stores tasks, steps, and work logs under a userId.
- `useTaskStore` is the single data access layer (client only).
- Tailwind CSS styles every view; minimal global CSS.

## Main features and modules
- Auth: email/password sign-in and sign-up (`src/hooks/useAuth.tsx`).
- Tasks list: search by title/description/tags, filter by status, and sort by priority (`src/app/tasks/page.tsx`).
- Tasks list: default view excludes `done` tasks via the "Active" filter (`src/app/tasks/page.tsx`).
- Task detail: edit task, steps, and work logs in modals with Esc warnings on unsaved text (`src/app/tasks/[id]/page.tsx`).
- Steps: status filters that show only matching steps/substeps and readable status badges.
- Steps: nested steps with ordering, status updates, parent reassignment, and auto-complete when all children are done.
- Today view: highlights tasks and steps due today (`src/app/today/page.tsx`).
- Work logs: start/stop/note entries per task or step with tags, prefilled from task tags.
- Timeline: chronological work log view with month/year + tag filters (`src/app/timeline/page.tsx`).
- Report: monthly summary by task with totals, note highlights, and tag rollups (`src/app/report/page.tsx`).
- Insights: upcoming due dates, recent activity, priority/tag summaries, calendar (`src/app/insights/page.tsx`).
- Shared UI: top navigation and auth gate (`src/components`).

## Data model summary
- Task: status, priority, tags, dueDate, timestamps, userId.
- Step: order, optional parentStepId, status, dueDate, userId.
- WorkLog: type, message, timestamp, tags, optional stepId, userId.
- All timestamps are ISO strings; UI converts them for display.

## Current project state
- Core UI flows are implemented and wired to Firestore.
- All pages are client components; no server actions or API routes.
- Data is fetched on demand; no real-time subscriptions.
- Firestore rules enforce per-user ownership by userId.
- No automated tests or CI config in repo.
- `src/lib/mockData.ts` exists but is not referenced.
- `.env` contains Firebase credentials (treat as sensitive).

## Setup and environment
- Required env vars for client:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
- Optional: `FIREBASE_SERVICE_ACCOUNT` JSON string is present in `.env`.
- Firebase Auth (email/password) must be enabled.
- Firestore rules should be deployed from `firestore.rules`.

## Design and UI notes
- Uses Tailwind utility classes and white card layouts.
- Status and priority colors are encoded via class maps in pages.
- Copy is mixed Italian/English; keep tone consistent when editing.
- Dates are displayed with `toLocaleDateString` / `toLocaleString`.

## Common workflows
- Start dev server: `npm run dev`.
- Production build: `npm run build`.
- Lint: `npm run lint`.

## Known risks and gaps
- Due date handling uses UTC midnight; local timezone display may shift day.
- `useTaskStore` loads all docs per user; scale may become slow.
- Delete operations recurse through steps and work logs client-side.
- Lack of tests increases regression risk for refactors.

## Suggested next additions (from docs)
- Preset work logs / quick log actions.
- Start-stop timer and calendar heatmap.
