# ChronoStep

**An operational diary: tasks, nested steps, and the time you actually spent.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.3-black)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-11-orange)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

![Oggi](docs/screenshots/oggi-chiaro.png)

---

## The idea

A normal dashboard hands you a wall of tiles with numbers in them and leaves the interpretation to
you. ChronoStep does not: **every screen opens with a conclusion** — a sentence that says where you
stand — and backs it with a paragraph in which the figures sit **inside** the sentence.

> Oggi scadono 4 cose**.**
> Oggi scadono `2 task` e `2 step`. Oggi hai registrato `1h 12m`, sotto la tua media di `1h 32m`.

The full stop takes the colour of the judgement: green if things are on track, amber if they want
attention, red if you are behind. A figure that appears in the paragraph is never also drawn as a
tile somewhere else.

Verdicts are computed by rules over the data, not written by hand, and they **must be able to
deliver bad news**: if you have a timer running but three things overdue, the headline is about the
three overdue things. Where the data is too thin for a judgement, the page says so instead of
inventing one.

---

## What it does

- **Task → nested steps → work log.** A task can stay a single line («mandare la mail a Bianchi» —
  email Bianchi) or become a project with eight steps across three levels. Both live in the same
  list without the empty one looking broken.
- **Time attaches to the step, not just to the task.** The summary does not only say "19h on this
  job", it says which piece of the job those hours went into.
- **A global timer.** It starts from a row of the tree and stops from any page, because the
  running-session bar is always on screen — even after you delete the task it was running on.

![Running session](docs/screenshots/sessione-in-corso.png)

  With a session open the verdict changes on its own: *"Sei già in pista."* ("you are already
  moving").
- **Timeline, Report, Insights.** A chronological log, a per-task summary, and a heatmap of the
  month that agrees with the monthly totals — because they use the same buckets. Clicking a priority
  or a tag opens the detail of what sits underneath, and the filtered view can be linked to.
- **Cattura (capture from notes).** You paste your notes exactly as they are and a proposal comes
  out: tasks with their fields, nested steps, steps to attach to a task that already exists,
  work-log entries. The proposal is corrected row by row and does not touch the archive until you
  confirm it. It needs a Claude API key; without one the screen says so and the rest of the app is
  unchanged.
- **Light and dark**, with a three-state toggle (light, dark, follow the system).

---

## What it looks like

| | |
|---|---|
| ![Task detail](docs/screenshots/dettaglio-task.png) | ![Insights](docs/screenshots/insights.png) |
| **Task detail** — the step tree is flat with a numbering column (1, 2, 2.1): at three levels real nesting spends almost all the width on indents. | **Insights** — quantity is drawn as the length of an ink bar, not as a coloured fill: green stays reserved for judgement. |
| ![Oggi, dark theme](docs/screenshots/oggi-scuro.png) | ![Oggi on a phone](docs/screenshots/oggi-mobile.png) |
| **Dark theme** — the identity is not in the black: it is in the anatomy of the verdict and in the serif/monospace pair. The theme is only a swap of OKLCH tokens. | **Phone** — desktop-first, but rows stack and the navigation scrolls instead of breaking. |

---

## Try it

The sign-in screen carries a demo account. It is **read-only** — it opens every screen and changes
nothing, because its credentials are public and what one visitor sees should be what the next one
sees — and it holds a real diary: eleven tasks, steps nested three levels deep, six months of work
log. The home screen opens on something overdue, which is the point.

---

## Quick start

You need Node.js 20+ and a Firebase project ([free plan](https://firebase.google.com/pricing)).

```bash
git clone https://github.com/GiuseppeDM98/chronostep.git
cd chronostep
npm install
cp .env.example .env      # then fill in the four NEXT_PUBLIC_FIREBASE_* variables
npm run dev
```

The full instructions are in [SETUP.md](./SETUP.md).

### Developing against the emulators

To work without touching real data — and to see the screens full instead of empty:

```bash
npm run emulators          # Auth + Firestore, locally
npm run seed               # creates an account and some sample data
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev
```

The seed prints the credentials. The data is generated **relative to today**, so the heatmap always
covers the visible month and the month-over-month comparison always has a previous month.

---

## Checks

No data ever passes through a server: the Firestore rules are the **only** boundary between two
accounts' data, and dates have historically been this project's richest source of bugs. Both have a
suite. The one server route in the project talks to the Claude API and to nothing else — it holds no
Firebase credentials and cannot write, which is why adding it did not move that boundary.

```bash
npm test              # everything
npm run test:rules    # 47 checks on the rules, in the emulator
npm run test:dates    # 15 checks × 4 timezones
npm run test:insights # aggregation: start/stop pairing, buckets, totals
npm run test:verdicts # the verdict engine, including that it can deliver bad news
npm run test:capture  # what gets rejected out of what the AI answers, and how the outline resolves
```

`test:rules` tries the attacks (a second account attempting to read, hijack or delete the first
one's data) **and** the app's real flows, because tightening the rules can break the cascade delete
without breaking anything else. It also proves the demo account is read-only, in pairs: every check
is the same write, refused for the demo account and accepted for a normal one.

`test:dates` replays the same assertions from four timezones: a date bug is invisible from
Greenwich.

---

## Data model

```typescript
interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority?: "low" | "medium" | "high";
  tags?: string[];
  dueDate?: string;      // "2026-08-27" — a calendar day, not an instant
  createdAt: string;     // ISO 8601
  updatedAt: string;
}

interface Step {
  id: string;
  userId: string;
  taskId: string;
  parentStepId?: string; // nesting
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  order: number;         // relative to SIBLINGS, not global
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkLog {
  id: string;
  userId: string;
  taskId: string;
  stepId?: string;
  message?: string;
  tags: string[];
  type: "start" | "stop" | "note";
  timestamp: string;         // ISO 8601: an instant
  durationMinutes?: number;
}
```

**Two kinds of date, handled differently.** A due date is a day on the calendar and is stored as
`"2026-08-27"`: it cannot drift. A timestamp is an instant, and the day it is filed under is the
**local** day of whoever is looking. See `src/lib/dates.ts`.

---

## Structure

```
chronostep/
├── src/
│   ├── app/
│   │   ├── page.tsx            # Oggi — the home route
│   │   ├── tasks/              # list and detail
│   │   ├── capture/            # Cattura — notes in, a proposal out
│   │   ├── api/ai/capture/     # the only server route: a proxy for the Claude API
│   │   ├── timeline/ report/ insights/
│   │   ├── layout.tsx          # fonts, theme, the direction contract
│   │   └── globals.css         # OKLCH tokens, light and dark
│   ├── components/
│   │   ├── AppShell.tsx        # navigation + the running session
│   │   ├── Verdict.tsx         # the verdict block
│   │   ├── Dialog.tsx          # dialog with a focus trap
│   │   ├── controls.tsx        # labelled fields, buttons with state
│   │   └── CaptureReview.tsx   # the proposal, before it becomes data
│   ├── hooks/                  # auth, store, timer, theme, clock, AI access
│   └── lib/
│       ├── verdicts.ts         # the verdict engine
│       ├── dates.ts            # the two species of date
│       ├── insights.ts         # aggregation and session pairing
│       ├── aiCapture.ts        # plan shape, normalisation, outline
│       ├── aiPrompt.ts         # JSON schema and system prompt
│       ├── demoAccount.ts     # the read-only demo account
│       └── types.ts
├── tests/                      # rules, dates, aggregation, verdicts, capture
├── scripts/                    # emulator seed, screenshots
├── firestore.rules
├── PRODUCT.md                  # product truth
└── DESIGN.md                   # the visual system
```

---

## Stack

Next.js 16 (App Router, every page a client component) · React 18 · TypeScript · Tailwind 3 with
OKLCH tokens · Firebase Auth + Firestore, client SDK only. Data never passes through a server: the
project's only server route, `/api/ai/capture`, talks to the Claude API and to nothing else.

Typography: **Literata** for the human voice (verdicts, prose, notes) and **JetBrains Mono** for the
instrument (durations, counts, dates, statuses, control labels). The alternation between the two is
the identity: strip out all the content and the product is still recognisable.

---

## Known limits

- `useTaskStore` reads every document for the user on each refresh: at large volumes it needs
  pagination.
- No realtime sync: reads happen on demand and are repeated after every write.
- The cascade delete is not transactional. It is chunked so as not to exceed Firestore's limit of
  500 operations, but a failure midway leaves a partial state.
- Closing registrations with `NEXT_PUBLIC_DISABLE_SIGNUPS` is an interface filter, not a control: to
  close them for real, configure Firebase Auth.
- The demo account shown on the sign-in screen is shared with anyone who has the link, and is
  read-only for that reason: it can open every screen and change nothing. Enforced in
  `firestore.rules`, not in the interface.

---

## Documentation

- [SETUP.md](./SETUP.md) — step-by-step Firebase configuration
- [PRODUCT.md](./PRODUCT.md) — users, purpose, constraints, principles
- [DESIGN.md](./DESIGN.md) — tokens, typography, components, anti-patterns
- [AGENTS.md](./AGENTS.md) · [CLAUDE.md](./CLAUDE.md) — technical reference
- [LICENSE.md](./LICENSE.md) — AGPL-3.0

---

## License

**GNU Affero General Public License v3.0.** You may use it, modify it and distribute it; if you
modify it and publish it as a web service you must make the source available, and every derivative
work stays under AGPL-3.0. Full text in [LICENSE.md](./LICENSE.md).
