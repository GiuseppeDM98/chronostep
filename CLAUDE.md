# ChronoStep Technical Guide

> **Audience**: Developers and AI agents working on ChronoStep
> **Setup**: [SETUP.md](./SETUP.md) · **Product truth**: [PRODUCT.md](./PRODUCT.md) · **Visual system**: [DESIGN.md](./DESIGN.md)
> **Conventions**: [AGENTS.md](./AGENTS.md) · [COMMENTS.md](./COMMENTS.md) · [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md)
> **Session workflow**: read [WORKFLOW.md](./WORKFLOW.md) before starting any work — commit/branch
> approval rules and the guided manual-testing protocol. A new rule from the user goes there, in
> that session's commit, not here.

Detailed technical information: architecture, the decisions that are load-bearing, and the traps
that have already caught someone. Keep it concise and actionable.

## Current status

**Latest — 2026-08-27. Cattura, and a read-only demo account.** Both live in production.

- New screen `/capture` ("Cattura", sixth nav item): paste rough notes, get a proposal of tasks,
  nested steps, steps for a task that already exists, and work-log entries. Everything arrives
  ticked and editable; nothing is written until the user presses the button. A note can hang off a
  task the same plan is creating (`taskRef`) — without that, "ieri due ore sulla revisione del
  catalogo" lost its two hours, because a log has to belong to a task and that task did not exist.
- **The project now has exactly one server route**, `/api/ai/capture`, and it exists solely because
  an Anthropic API key cannot live in a browser. It holds no Firebase credentials, opens no database
  connection and writes nothing — the client still performs every write through `useTaskStore`,
  under `firestore.rules`. That boundary has not moved.
- The route is guarded three ways: a Firebase ID token verified against Google's identity endpoint
  (no `firebase-admin`, no hand-rolled JWT verification), an `AI_ALLOWED_EMAILS` list that fails
  **closed in production** because the demo credentials are public, and a per-account frequency
  limit. `GET` on the same route answers "may this account use it", so an account that cannot meets
  an explanation instead of a working-looking control.
- **The public demo account is read-only**, enforced in `firestore.rules`: it reads everything and
  writes nothing. Its credentials are printed on the sign-in screen, so letting it write meant
  letting anyone edit or delete what the next visitor sees, with no server tier to undo it. The
  interface stops offering write controls and says why in a band in the chrome — but the interface
  is JavaScript served to that same anyone, which is why the rule is the boundary.
- That account was filled first, with `scripts/seed-demo.mjs`: 11 tasks, 34 steps, 162 work-log
  entries over six months, covering every status, both extremes of the granularity range, and enough
  history for the trend chart. Read-only freezes whatever is there, so the order was not optional.
- All documentation is English now — the repository is public. Italian survives only where a
  document quotes what the interface actually says.
- `npm audit` stays at 0 with `@anthropic-ai/sdk` added (+7 packages). A fifth test suite (50
  assertions) plus 15 more in the rules suite (now 47), each checked against a deliberately weakened
  copy of the code.

## Tech stack (from package.json)
- Next.js 16.3.3 (App Router, Turbopack) · React 18.2 · React DOM 18.2
- TypeScript 5.3 (`strict: false`, `moduleResolution: bundler`)
- Tailwind CSS 3.4 bound to CSS custom properties
- Firebase client SDK 11 (Auth + Firestore). **No Admin SDK** — it was a direct dependency that no
  line of `src/` imported, and it alone accounted for most of the project's CVEs.
- `@anthropic-ai/sdk` 0.121, imported by `src/app/api/ai/capture/route.ts` and by nothing else. It
  must never be imported from a client component: that would bundle it, and the key with it.
- Dev only: `@firebase/rules-unit-testing` 4, `playwright` (screenshots)
- `npm audit`: 0 vulnerabilities. Keep it that way.
- Hosting: Vercel, wired to the GitHub repository. Nothing in the repo configures it.

## High-level architecture
- Every page is a client component. No server actions, and exactly **one** route handler:
  `/api/ai/capture`, which proxies the Claude API and touches nothing else.
- `TaskStoreProvider` mounts **once** at the root (`src/app/providers.tsx`). Pages consume it with
  `useTaskStore()`. Previously each page called the hook directly, which gave every route its own
  copy of the data and its own three Firestore reads.
- `AppShell` is the chrome: auth wall, navigation, theme toggle, and the running-session bar.
- Firestore rules are the **only** boundary between two accounts' data.

## The design direction, in one line
Every screen opens with a **conclusion** computed from the data, then a paragraph carrying the
figures inside the sentence. A number stated in that paragraph is never also drawn as a tile. The
full contract is an HTML comment at the top of `<body>` in `src/app/layout.tsx` (seed `b28bfbe7`);
`DESIGN.md` records the system that came out of the build.

## Load-bearing decisions

**Update payloads use key presence, not value presence.** `updateTask` / `updateStep` /
`updateWorkLog` test `"field" in input`, never `input.field !== undefined`. Callers express a
cleared control as `{ dueDate: undefined }` — a key that is present but empty — and the old
value-presence guard silently discarded every "empty this field" edit, including the one that moves
a substep back to the top level. See `UpdatePayload` in `src/lib/types.ts`.

**Two kinds of date, handled differently** (`src/lib/dates.ts`). A due date is a calendar day and is
stored as `"2026-08-27"`. A work-log timestamp is an instant, and the day it is filed under is the
viewer's **local** day. `normalizeDayKey` still reads the old UTC-midnight shape.

**Sessions are paired over the complete log history, then filtered** (`src/lib/insights.ts`).
Pairing a filtered slice makes a session that straddles the filter worth zero minutes everywhere.
Sessions are keyed by `taskId + stepId`, a `stop` always closes its session even when it also
carries `durationMinutes`, and a pair longer than 12 hours is dropped as a forgotten stop.

**Stopping the timer is two steps.** `previewStop()` reads the session without ending it;
`clearTimer()` ends it. Callers write the work log first and clear afterwards, so a failed write
leaves the session running and retryable.

**`order` is scoped to siblings, not global.** Every first child carries `order: 1`. Sorting a flat
step list by `order` is always wrong — walk the tree.

**The demo account is read-only in the rules, and only there.** `NEXT_PUBLIC_DEMO_EMAIL` and the
address inside `isDemoAccount()` in `firestore.rules` must name the same account: the first lets the
interface stop offering what the second refuses. If they drift, the app offers actions the database
then rejects — the failure this arrangement exists to prevent. Every write in the store goes through
`ensureCanWrite`, so a control somebody forgets to hide fails with a sentence rather than with a
database permission error.

**The AI proposes; the client writes.** `/api/ai/capture` returns a plan and never touches
Firestore. The client re-validates that plan against its own snapshot (`normalizeCapturePlan`) and
writes it through `useTaskStore`, so the security model is unchanged: the rules remain the only
boundary, and a plan naming a task the caller does not own is dropped before it can be attempted.
The route holds no Firebase credentials, so it could not bypass the rules even if it tried.

**A proposed step outline is a flat list with a `level`, not a tree.** Nesting is resolved by
`resolveOutline`, which turns levels into parent links and sibling-scoped orders. A recursive schema
would have been equivalent on a good day; a depth number cannot come back malformed in a way that
loses a step.

**A step's level is settled once, in `readStepDrafts`.** It is clamped against the level of the step
before it, not merely into 0..2, because three separate readers depend on it agreeing with itself:
`outlineRows` draws the indent, `droppedSteps` decides what a descendant is, and `resolveOutline`
assigns parents. When only the last of the three clamped, an outline whose levels jumped rendered as
a parent and a child while the exclusion cascade saw two siblings — so unticking the parent kept the
child and wrote it somewhere else entirely.

**The review screen and the writer ask the same function what will be written.** `droppedSteps` is
exported for exactly that: a row greys out and locks because `selectedPlan` has removed it, not
because the screen independently decided it should look removed.

## Main modules
| Path | Responsibility |
|---|---|
| `src/lib/verdicts.ts` | The verdict engine: `readToday`, `readTask`, `readInsights`, `readTaskList`, `readSlice`, `readCapture`, `nextDecisions` |
| `src/lib/dates.ts` | Day keys, due dates, instants, formatting, `formatMinutes`, `formatElapsed` |
| `src/lib/insights.ts` | Session pairing, per-task rollups, daily/monthly buckets, tag grouping |
| `src/lib/aiCapture.ts` | The plan's shape, `normalizeCapturePlan`, `resolveOutline`, `selectedPlan` |
| `src/lib/aiPrompt.ts` | The JSON schema, the system prompt, the archive the model is shown |
| `src/app/api/ai/capture/route.ts` | The only server route: token, allow list, frequency limit, Claude |
| `src/hooks/useTaskStore.tsx` | All reads and writes, cascade deletes, auto-complete, `loadError`, `applyCapturePlan` |
| `src/hooks/useTimer.tsx` | The running session, localStorage, cross-tab sync |
| `src/hooks/useAsyncAction.ts` | One async action at a time, with `pending` and a visible `error` |
| `src/hooks/useNow.ts` | A clock that moves, so a tab left open overnight is not stuck on yesterday |
| `src/components/Dialog.tsx` | role, aria-modal, focus trap, focus restore, scroll lock, discard confirmation |
| `src/components/controls.tsx` | `Field` generates the id and wires the label — a control cannot ship unlabelled |

## Data model
See the README for the shapes. Every document carries `userId`. Timestamps are ISO strings; due
dates are `YYYY-MM-DD`.

## Tests
`npm test` runs five suites. Each was checked against a deliberately broken copy of the code it
covers, to prove it is not vacuous.

| Command | What it covers |
|---|---|
| `npm run test:rules` | 47 checks in the Firestore emulator: cross-account attacks, every real app flow, field validation, and the demo account's read-only pairs |
| `npm run test:dates` | 15 checks × 4 timezones (a date bug is invisible from Greenwich) |
| `npm run test:insights` | Session pairing, bucket agreement, tag de-duplication |
| `npm run test:verdicts` | The verdict rules, including that bad news outranks momentum |
| `npm run test:capture` | What of the AI's output is refused (foreign ids, invented statuses, impossible days and durations), that the drawn level and the written level are one level, and the exclusion cascade |

## Local development against the emulators
```bash
npm run emulators   # Auth + Firestore
npm run seed        # an account plus fixtures generated relative to today
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev
node scripts/screenshots.mjs   # captures every route × theme × width into .impeccable/review/
```
`src/lib/firebaseClient.ts` switches to the emulators on `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`.

## Firestore rules
Verbs are split, and `update` requires ownership of **both** the stored document and the incoming
one, plus an unchanged `userId` and `taskId`. A single OR-ed rule authorised an update by the
incoming `userId` alone, which let anyone holding a document id (they travel in `/tasks/<id>` URLs)
take over or destroy another account's data. `create` also verifies the referenced task is yours,
and validates shape and size. `npm run test:rules` proves both halves.

## Known risks and gaps
- `useTaskStore` reads every document for the user on each refresh. Paginate before the data grows.
- No realtime listeners: read on demand, re-read after every write.
- Cascade deletes are chunked at 400 operations but are not transactional; a failure midway leaves a
  partial state.
- `NEXT_PUBLIC_DISABLE_SIGNUPS` is a UI filter, not a control. Closing registrations for real is a
  Firebase Auth setting.
- The demo account on the sign-in screen is shared with anyone holding the link. This is why
  `AI_ALLOWED_EMAILS` fails closed in production: without it, that account could spend the API key.
- The frequency limit on `/api/ai/capture` is module state on a serverless instance, so it resets on
  a cold start and does not add up across instances. It stops a runaway retry, not a determined
  caller; the spend limit on the Anthropic account is the ceiling that actually holds.
- `npm run lint` is broken and was already broken before this session: `next lint` was removed in
  Next 16. Nothing replaces it yet, so `npm run build` (which type-checks) is the only static gate.
- `tsconfig.json` has `strict: false`. Turning it on would catch a class of bug the tests currently
  have to — and would remove the need for `result.ok === false` where `!result.ok` should narrow.
- Playwright's `fullPage` stitching fabricates compositing artifacts on this app; captures grow the
  viewport instead. With the emulators, Firebase Auth persists to IndexedDB, not localStorage.
- **A deployed ruleset propagates gradually.** For a while after `firebase deploy` reports success,
  consecutive requests can be evaluated against different rulesets. Verify a deny rule by repeating
  until the answer is stable, and probe with an `update` rather than a `delete` — see the trap in
  AGENTS.md, which was written from a real deletion.
- The demo account's contents can only be changed while it can still write, i.e. by temporarily
  pointing `isDemoAccount()` elsewhere, deploying, running `scripts/seed-demo.mjs`, and putting the
  rules back. There is no admin path, by design.

## Manual test runs

`npm test` covers the pure logic; nothing in it drives a browser. What was verified by hand, once,
against the running app goes here — a test run that is not written down counts as one that did not
happen (WORKFLOW.md, closing rule).

**2026-08-27 · Cattura and the read-only demo account. 43/43 checks, all passing.** Emulators, a
seeded account and a real `ANTHROPIC_API_KEY`, driven by throwaway Playwright scripts that signed in
for real and read every outcome back out of Firestore rather than off the page.

- **Cattura, phases A–F (32/32).** Every screen still opens with its verdict and the nav has six
  items; an account outside `AI_ALLOWED_EMAILS` gets an explanation and no controls while one inside
  gets both; notes carrying invented spy words became a task whose `order` is contiguous from 1 in
  every sibling group, whose nesting points at a step of the same task, whose due date is a day key
  (`2026-08-28` from "entro venerdì") and whose two hours landed as a 120-minute `note` on
  **yesterday's** local day; the route called directly rejects empty notes, over-long notes and a
  malformed date with 400; no token and a forged token both 401, and the allow-list pair — identical
  body, one address 200 and the other 403.
- **Read-only demo (11/11).** The half that matters is not the interface: signed in as the demo
  account through the app's own client SDK, outside every screen, `addDoc` came back
  `PERMISSION_DENIED`, while the identical call from a normal account succeeded. On the interface
  side the band shows only for that account, and no write control is rendered — while the step
  *filter* stays usable, because filtering is reading.
- **Production.** After seeding and deploying: reads work, and create, update and delete are refused
  on all three collections, three times out of three.

Three defects surfaced here rather than in the suite: the structured-output schema was rejected by
the API twice (a nullable enum, then `minimum`/`maximum` on an integer), and a note about a task
that did not exist yet was silently dropped — which is what `taskRef` now exists to fix. The
verification itself also cost a real document to the propagation trap now recorded above.

## Common workflows
```bash
npm run dev        # dev server
npm run build      # production build, and the only type check that runs
npm run lint       # BROKEN: `next lint` was removed in Next 16
npm test           # every suite
npm audit          # must stay at 0
```
