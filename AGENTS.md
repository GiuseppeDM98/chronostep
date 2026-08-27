# AGENTS.md

ChronoStep project notes for coding agents. Keep changes aligned with existing patterns and keep
output actionable. Read [CLAUDE.md](./CLAUDE.md) for architecture, [PRODUCT.md](./PRODUCT.md) for
product truth, [DESIGN.md](./DESIGN.md) before touching UI, and [COMMENTS.md](./COMMENTS.md) plus
[DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md) while writing code. Read
[WORKFLOW.md](./WORKFLOW.md) before starting a session — commit/branch approval rules and the
guided manual-testing protocol.

## Project snapshot
- Next.js 16 App Router, TypeScript, Tailwind 3 bound to CSS custom properties.
- Firebase Auth (email/password) + Firestore, client SDK only. Data never passes through a server.
- Every page is a client component. There is exactly one route handler, `/api/ai/capture`, and it
  proxies the Claude API — no database, no writes, no Firebase credentials.
- Deployed from GitHub to Vercel. Nothing in the repo configures that.
- UI copy is Italian. Everything else is English: code, identifiers, comments, commit messages,
  prompts, and **every document in this repository**. The repo is public, so the documentation is
  read by people who do not speak Italian; an Italian string only belongs in a document when it is
  quoting what the interface actually says, and then it stays verbatim with a gloss if one helps.

## Code organization
- `src/app/page.tsx` — **Oggi, the home route.** There is no separate landing page.
- `src/app/today/page.tsx` — a redirect to `/`, kept so old links resolve.
- `src/app/tasks/page.tsx` — task list · `src/app/tasks/[id]/page.tsx` — detail, steps, work log
- `src/app/capture/page.tsx` — Cattura: notes in, a reviewable proposal out
- `src/app/api/ai/capture/route.ts` — the only server code in the project
- `src/app/timeline|report|insights/page.tsx` — Insights carries the priority/tag drilldown, driven
  by `?tag=` / `?priorita=` so a filtered view can be linked to
- `src/app/layout.tsx` — fonts, pre-paint theme script, the direction contract
- `src/app/globals.css` — OKLCH tokens, light and dark, plus browser-surface theming
- `src/components/` — `AppShell` (chrome, auth wall, read-only band, running session), `Verdict`,
  `Dialog`, `controls`, `CaptureReview`, `ThemeToggle`
- `src/hooks/` — `useAuth`, `useTaskStore`, `useTimer`, `useTheme`, `useAsyncAction`, `useNow`,
  `useAiAccess`
- `src/lib/` — `verdicts`, `dates`, `insights`, `aiCapture`, `aiPrompt`, `demoAccount`, `types`,
  `firebaseClient`
- `tests/` — rules, dates, insights, verdicts, capture · `scripts/` — emulator seed, screenshots

## Rules that are easy to break

**Never test `!== undefined` on an update payload.** Use `"field" in input`. Value-presence guards
silently discard every "clear this field" edit. See `UpdatePayload` in `src/lib/types.ts`.

**Never sort a flat step list by `order`.** `order` is scoped to siblings, so every first child is
`1`. Walk the tree (`buildStepTree` in the detail page, `firstUnfinishedInTreeOrder` in
`verdicts.ts`).

**Never format a due date with `new Date(iso).toLocaleDateString()`.** Use `formatDueDate` from
`src/lib/dates.ts`. Due dates are `YYYY-MM-DD` day keys; instants are a different species and get
`formatInstantDate` / `instantDayKey`.

**Never import `@anthropic-ai/sdk` outside `src/app/api/`.** A client component that imports it
bundles it, and takes `ANTHROPIC_API_KEY` along if it ever reads one. The route is the only place
that touches either.

**Never add a write path that skips `ensureCanWrite`.** Every write method in the store calls it,
and it is what stops the read-only demo account from writing through a control nobody remembered to
hide. `ensureUserId` alone is not enough: it proves who you are, not that you may write.

**Never let the server write to Firestore.** `/api/ai/capture` returns a plan; the client writes it.
Giving that route database access would make it a second boundary alongside `firestore.rules`, and
two boundaries is one more than this project can keep correct.

**Never trust a model's output as domain data.** It goes through `normalizeCapturePlan` against the
caller's own snapshot, which drops foreign ids, invented statuses and impossible dates. A field read
straight off the response is a bug even when it looks right.

**Never point at a proposed task by its index.** A capture plan is filtered twice between the
model's answer and the write — once for titleless entries, once for what the user unticks — and both
shift indices under anything holding one. Proposed tasks carry a `ref`; a note points at that.

**A step's level is decided once, in `readStepDrafts`.** Three readers depend on it agreeing with
itself: `outlineRows` draws the indent, `droppedSteps` decides what a descendant is, and
`resolveOutline` assigns parents. Clamping in only one of them is what let an unticked step's child
survive and get written under a different parent.

**The screen never decides for itself what will be written.** `droppedSteps` and `selectedPlan` are
the same answer; the review greys a row because the writer has dropped it, not because the component
worked it out separately.

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
- `applyCapturePlan` writes a whole reviewed proposal and refreshes **once**. Do not build a bulk
  write out of repeated `createTask` / `createStep` calls: each one re-reads the entire account, so
  a plan of three tasks and twelve steps would cost fifteen full snapshots. It also never throws —
  a plan is many independent writes with no transaction, so it reports which ones landed.

## Firestore rules
Verbs are split. `update` requires ownership of the stored **and** incoming document, plus an
unchanged `userId` and `taskId`. `create` verifies the referenced task is yours and validates shape.
Every write verb also passes `mayWrite()`, which refuses the public demo account — that is where
read-only is real, and the only place it can be. Reads deliberately skip it.

Any new collection follows the same shape, and any rules change runs `npm run test:rules`. Deploying
one is `firebase deploy --only firestore:rules`; read the propagation trap below before you verify
what you deployed.

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
npm test                                           # rules, dates, insights, verdicts, capture
```
Cattura works against the emulators as long as `ANTHROPIC_API_KEY` is in `.env`: the route verifies
the ID token against the Auth emulator when `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`, and the call
to Anthropic is real either way.

## Commands
`npm run dev` · `build` · `start` · `test` · `test:rules` · `test:dates` · `test:insights` ·
`test:verdicts` · `test:capture` · `emulators` · `seed`

`scripts/seed-demo.mjs` fills the **public demo account of a real project** and is deliberately not
an npm script: it requires `--yes`, and typing its whole path is friction in proportion to what it
does. It only works while the demo account can still write — see SETUP.md section 7.

`npm run lint` is broken, and was before this feature: `next lint` was removed in Next 16. Nothing
replaces it, so `npm run build` is the only static gate — it type-checks.

## Setup gotchas
- `.env` holds real credentials and is gitignored. It has never been committed.
- Firebase Auth (email/password) must be enabled; rules deployed from `firestore.rules`.
- The frontend deploys from GitHub to **Vercel**, configured in the Vercel dashboard, so the absence
  of a hosting config in the repo says nothing about whether the app is live. It is.
- `ANTHROPIC_API_KEY` and `AI_ALLOWED_EMAILS` are server-only variables and live in Vercel's project
  settings as well as in `.env`. A Vercel deployment does not pick up a new variable until it is
  rebuilt. `AI_ALLOWED_EMAILS` left empty means Cattura is open in development and **dead in
  production** — that is deliberate, and it needs the address you actually sign in with.
- `NEXT_PUBLIC_DEMO_EMAIL` and the literal in `isDemoAccount()` in `firestore.rules` must name the
  same account. The rules refuse the writes; the variable only lets the interface stop offering them.
- The demo account's contents can only be changed while it can still write: point `isDemoAccount()`
  at another address, deploy, run `node scripts/seed-demo.mjs --yes --replace`, put the rules back.
  There is no admin path, by design. SETUP.md section 7 has the whole procedure.

## Tooling traps

Each of these cost an hour to diagnose and gives no useful error.

- **A deployed ruleset does not take effect everywhere at once.** `firebase deploy` reports success
  and returns, but the rollout across Firestore's frontends takes a while, and during that window
  two requests made back to back can be evaluated against two different rulesets. This is not
  theoretical: a verification run started a minute after a deploy watched seven writes get refused
  and the eighth succeed — and that eighth one deleted a real document from the public demo account
  while reporting that the rules did not hold. **Never conclude anything from a single pass, and
  never verify a deny rule with a destructive operation.** Retry until the answer repeats, and probe
  with an `update` that changes only `updatedAt`: a refused update leaves the document exactly as it
  was, a "successful" delete does not.

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
- Is this the demo account? Every write is refused, by design — check `isReadOnly`.
- Is `loadError` set? An empty screen and a failed read look identical without it.
- Are due dates day keys and timestamps instants?
- Is a step being sorted by `order` outside its sibling group?
- Does the write path surface its own failure?

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
