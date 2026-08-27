# AGENTS.md

ChronoStep project notes for coding agents. Keep changes aligned with existing patterns and keep
output actionable. Read [CLAUDE.md](./CLAUDE.md) for architecture, [PRODUCT.md](./PRODUCT.md) for
product truth, [DESIGN.md](./DESIGN.md) before touching UI, and [COMMENTS.md](./COMMENTS.md) plus
[DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md) while writing code.

## Project snapshot
- Next.js 16 App Router, TypeScript, Tailwind 3 bound to CSS custom properties.
- Firebase Auth (email/password) + Firestore, client SDK only. No server tier.
- Every route is a client component.
- UI copy is Italian. Code, comments and commit messages are English.

## Code organization
- `src/app/page.tsx` — **Oggi, the home route.** There is no separate landing page.
- `src/app/today/page.tsx` — a redirect to `/`, kept so old links resolve.
- `src/app/tasks/page.tsx` — task list · `src/app/tasks/[id]/page.tsx` — detail, steps, work log
- `src/app/timeline|report|insights/page.tsx` — Insights carries the priority/tag drilldown, driven
  by `?tag=` / `?priorita=` so a filtered view can be linked to
- `src/app/layout.tsx` — fonts, pre-paint theme script, the direction contract
- `src/app/globals.css` — OKLCH tokens, light and dark, plus browser-surface theming
- `src/components/` — `AppShell`, `Verdict`, `Dialog`, `controls`, `ThemeToggle`
- `src/hooks/` — `useAuth`, `useTaskStore`, `useTimer`, `useTheme`, `useAsyncAction`, `useNow`
- `src/lib/` — `verdicts`, `dates`, `insights`, `types`, `firebaseClient`
- `tests/` — rules, dates, insights, verdicts · `scripts/` — emulator seed, screenshots

## Rules that are easy to break

**Never test `!== undefined` on an update payload.** Use `"field" in input`. Value-presence guards
silently discard every "clear this field" edit. See `UpdatePayload` in `src/lib/types.ts`.

**Never sort a flat step list by `order`.** `order` is scoped to siblings, so every first child is
`1`. Walk the tree (`buildStepTree` in the detail page, `firstUnfinishedInTreeOrder` in
`verdicts.ts`).

**Never format a due date with `new Date(iso).toLocaleDateString()`.** Use `formatDueDate` from
`src/lib/dates.ts`. Due dates are `YYYY-MM-DD` day keys; instants are a different species and get
`formatInstantDate` / `instantDayKey`.

**Never pair work-log sessions on a filtered set.** Pair over the complete history with
`buildTaskActivity`, then narrow with the returned `logDurations`.

**Never clear the timer before the work log is written.** `previewStop()` reads, `clearTimer()`
ends. A failed write must leave the session running.

**Never render a control without `Field`** (or an explicit `htmlFor`/`id` pair). `Field` generates
the id, so an unlabelled control is not expressible.

**Never introduce a text colour lighter than `--ink-muted`.** It is the lightest colour text may
use and it clears WCAG AA in both themes. Anything lighter is `--line`, and lines are not words.

**Colour means judgement, nothing else.** Green = on track, amber = wants attention, red = behind.
The primary action is ink. A green button would make every green thing ambiguous.

**Every async action gets `useAsyncAction`.** It disables the control while in flight and renders
the failure. There is no server to notice a swallowed write.

**`useSearchParams` needs a Suspense boundary.** It opts the route into client rendering; without
the boundary the build fails on the statically rendered page. Insights wraps its content for exactly
this reason — keep the wrapper if you add another query-param-driven screen.

**Discriminated unions need an explicit comparison.** `tsconfig.json` sets `strict: false`, and with
`strictNullChecks` off, `if (!result.ok)` does not narrow a `{ok: true, value} | {ok: false, error}`
union — TypeScript still rejects `result.error`. Write `if (result.ok === false)`. Worth revisiting
if `strict` is ever turned on.

## Data model
Collections: `tasks`, `steps`, `workLogs`. Every document carries `userId`.
- `Task`: status, priority, tags, `dueDate` (`YYYY-MM-DD`), timestamps
- `Step`: `order` (sibling-scoped), optional `parentStepId`, status, `dueDate`
- `WorkLog`: `type` (`start` | `stop` | `note`), `timestamp` (ISO instant), tags, `durationMinutes`

Statuses: `TaskStatus` = todo | in_progress | done | blocked. `StepStatus` drops `blocked` — a step
is meant to be immediately actionable, and blockage is a task-level fact.

## State and data access
- One `TaskStoreProvider` at the root; pages consume `useTaskStore()`. Do not call the store
  implementation directly, and do not add a second provider.
- Writes re-fetch the snapshot. `refreshState` carries a sequence guard so a late stale response
  cannot revert the screen.
- `loadError` is part of the store's contract: a screen that ignores it renders an empty account as
  if it were true.
- Completing all substeps completes the parent, and all steps completes the task. Never auto-reset.

## Firestore rules
Verbs are split. `update` requires ownership of the stored **and** incoming document, plus an
unchanged `userId` and `taskId`. `create` verifies the referenced task is yours and validates shape.
Any new collection follows the same shape, and any rules change runs `npm run test:rules`.

## Verdicts
`src/lib/verdicts.ts` produces every screen's opening sentence. Three rules:
1. A verdict must be able to deliver bad news. Lateness outranks momentum.
2. Where the data is too thin, set `isSparse` and let the screen offer guidance instead.
3. A figure in the paragraph is never also drawn as a tile.

Rules are evaluated top to bottom and the first match wins, so the order of the `if`s **is** the
editorial priority of that screen. Changing it changes the product.

## Local development
```bash
npm run emulators                                  # Auth + Firestore
npm run seed                                       # account + fixtures relative to today
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev
node scripts/screenshots.mjs                       # every route × theme × width
npm test                                           # rules, dates, insights, verdicts
```

## Commands
`npm run dev` · `build` · `start` · `lint` · `test` · `test:rules` · `test:dates` ·
`test:insights` · `test:verdicts` · `emulators` · `seed`

## Setup gotchas
- `.env` holds real credentials and is gitignored. It has never been committed.
- Firebase Auth (email/password) must be enabled; rules deployed from `firestore.rules`.
- **The deployed Firestore rules are current; the deployed frontend is not.** There is no hosting
  config in the repo, though the project has a live site. Assume production runs an older client.

## Tooling traps

Each of these cost an hour to diagnose and gives no useful error.

- **Point the browser at `localhost`, never `127.0.0.1`.** Next refuses to serve dev chunks
  cross-origin, so every `/_next/static/` request 403s and the page renders its server HTML forever
  with no JavaScript and no visible error. `allowedDevOrigins` in `next.config.js` covers both now,
  but the symptom is silent.
- **Playwright's `fullPage` fabricates artifacts.** It stitches the page in bands and composited
  body fragments into the header on this app — a design review reported a rendering defect that did
  not exist. `scripts/screenshots.mjs` grows the viewport to the document height and shoots once
  instead. Never send a stitched capture to a reviewer.
- **With the emulators, Firebase Auth persists to IndexedDB, not localStorage.** Reading a uid out of
  `localStorage` returns nothing and fails silently. To exercise a running session, click the real
  control rather than seeding storage.
- **`npm run test:rules` uses `firebase.test.json`** on port 8181, deliberately apart from the
  development emulators on 8080/9099, so both run at once. Sharing the port fails with "port taken".

## Release notes

`Draft Release Temp.md` accumulates the user-visible changes since the last published release. At
the end of a session, append there; when a release is cut the file is pasted into the GitHub release
body and started fresh.

Only what a user can see belongs in it. A fix to something not yet released is not a bug fix — fold
it into the feature's own bullet, because nobody can have hit a bug in a version they never had.

## Quick triage checklist
- Is the user authenticated, and is `isHydrated` true?
- Is `loadError` set? An empty screen and a failed read look identical without it.
- Are due dates day keys and timestamps instants?
- Is a step being sorted by `order` outside its sibling group?
- Does the write path surface its own failure?

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
