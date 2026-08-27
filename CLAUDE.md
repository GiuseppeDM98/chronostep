# ChronoStep Technical Guide

> **Audience**: Developers and AI agents working on ChronoStep
> **Setup**: [SETUP.md](./SETUP.md) · **Product truth**: [PRODUCT.md](./PRODUCT.md) · **Visual system**: [DESIGN.md](./DESIGN.md)
> **Conventions**: [AGENTS.md](./AGENTS.md) · [COMMENTS.md](./COMMENTS.md) · [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md)

Detailed technical information: architecture, the decisions that are load-bearing, and the traps
that have already caught someone. Keep it concise and actionable.

## Current status

**Latest — 2026-08-27. Security audit, bug fixes, interface rebuild.**

- Dependencies: 21 vulnerabilities → 0, 345 → 189 packages. `firebase-admin` removed (a direct
  dependency no line of `src/` imported); Next 16.1.6 → 16.3.3.
- Firestore rules rewritten and **deployed to production**: `update` had been authorised by the
  incoming `userId` alone, so anyone holding a document id could seize or destroy another account's
  data. Verbs are now split and both sides of a write must be owned.
- Data layer: key-presence update payloads, due dates stored as `YYYY-MM-DD` day keys, session
  pairing rewritten (per task AND step, forgotten stops dropped), store lifted to one root provider
  with `loadError` and a refresh sequence guard.
- Interface rebuilt on the "Verdetto" direction: every screen opens with a computed conclusion and
  backs it with prose carrying the figures inside the sentence. OKLCH tokens, light and dark,
  Literata + JetBrains Mono, Oggi promoted to the home route.
- Four test suites added, 122 assertions, each checked against the pre-fix code to prove it is not
  vacuous.
- The Insights priority/tag drilldown was dropped during the rebuild and restored: the rows are
  controls again, the selection lives in the query string, and Timeline links back into it.
- **The frontend is not deployed.** No hosting config exists in the repo; production serves an older
  client, which the new rules were verified against before the deploy.

## Tech stack (from package.json)
- Next.js 16.3.3 (App Router, Turbopack) · React 18.2 · React DOM 18.2
- TypeScript 5.3 (`strict: false`, `moduleResolution: bundler`)
- Tailwind CSS 3.4 bound to CSS custom properties
- Firebase client SDK 11 (Auth + Firestore). **No Admin SDK** — it was a direct dependency that no
  line of `src/` imported, and it alone accounted for most of the project's CVEs.
- Dev only: `@firebase/rules-unit-testing` 4, `playwright` (screenshots)
- `npm audit`: 0 vulnerabilities. Keep it that way.

## High-level architecture
- Every route is a client component. No server actions, no API routes, no server tier.
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

## Main modules
| Path | Responsibility |
|---|---|
| `src/lib/verdicts.ts` | The verdict engine: `readToday`, `readTask`, `readInsights`, `readTaskList`, `readSlice`, `nextDecisions` |
| `src/lib/dates.ts` | Day keys, due dates, instants, formatting, `formatMinutes`, `formatElapsed` |
| `src/lib/insights.ts` | Session pairing, per-task rollups, daily/monthly buckets, tag grouping |
| `src/hooks/useTaskStore.tsx` | All reads and writes, cascade deletes, auto-complete, `loadError` |
| `src/hooks/useTimer.tsx` | The running session, localStorage, cross-tab sync |
| `src/hooks/useAsyncAction.ts` | One async action at a time, with `pending` and a visible `error` |
| `src/hooks/useNow.ts` | A clock that moves, so a tab left open overnight is not stuck on yesterday |
| `src/components/Dialog.tsx` | role, aria-modal, focus trap, focus restore, scroll lock, discard confirmation |
| `src/components/controls.tsx` | `Field` generates the id and wires the label — a control cannot ship unlabelled |

## Data model
See the README for the shapes. Every document carries `userId`. Timestamps are ISO strings; due
dates are `YYYY-MM-DD`.

## Tests
`npm test` runs four suites. Each was checked against the pre-fix code to prove it is not vacuous.

| Command | What it covers |
|---|---|
| `npm run test:rules` | 32 checks in the Firestore emulator: cross-account attacks, every real app flow, field validation |
| `npm run test:dates` | 15 checks × 4 timezones (a date bug is invisible from Greenwich) |
| `npm run test:insights` | Session pairing, bucket agreement, tag de-duplication |
| `npm run test:verdicts` | The verdict rules, including that bad news outranks momentum |

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
- The demo account on the sign-in screen is shared with anyone holding the link.
- `tsconfig.json` has `strict: false`. Turning it on would catch a class of bug the tests currently
  have to — and would remove the need for `result.ok === false` where `!result.ok` should narrow.
- Playwright's `fullPage` stitching fabricates compositing artifacts on this app; captures grow the
  viewport instead. With the emulators, Firebase Auth persists to IndexedDB, not localStorage.

## Common workflows
```bash
npm run dev        # dev server
npm run build      # production build
npm run lint       # next lint
npm test           # every suite
npm audit          # must stay at 0
```
