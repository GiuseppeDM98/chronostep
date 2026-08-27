# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Giuseppe, a single operator.** ChronoStep is his personal operational diary: one real account, his
data, no collaboration. He opens it **a few times a day** — in the morning, after lunch, at the end
of the day — from a desktop. Every visit is a re-orientation: the question he brings with him is
"what do I do now?", not "show me everything".

**A public demo account**, with credentials shown on the sign-in screen, exists so the app can be
handed to someone to try. It is a real secondary user, not a hypothesis: whoever arrives that way
does not know the product and has no data of their own — and, because those credentials are public,
it is **read-only**: it opens every screen and changes nothing, so what one visitor sees is what the
next one sees.

## Product Purpose

Hold together three things that usually sit in different tools: **what there is to do**, **how it
breaks down**, and **where the hours went**. Success is that at the end of the month a trustworthy
monthly report exists without anyone having had to reconstruct a day from memory, and that on
opening the app it takes seconds to see what deserves attention now.

## Positioning

The mechanism a task manager does not have and a time tracker does not either: **time attaches to
the step, not only to the task**. A task breaks down into nested steps with ordering and
reparenting; the timer points at one specific step; the work log keeps the note of what was done. It
follows that the monthly report does not only say "8 hours on this job" but which piece of the job
they went into, with the note of why right beside it.

## Operating Context

- Desktop. The phone is tolerated; it is not the case to optimise for.
- Short visits repeated across the day, not one long sitting.
- The timer is a live object that crosses pages: it can be running while something else is on
  screen, and it must be stoppable from anywhere.
- Intense stretches alternate with dead weeks: the interface meets thin data regularly.

## Capabilities and Constraints

**Domain model.** Task → nested Steps (ordering, reparenting, auto-completion upwards) → Work log
(`start` / `stop` / `note`, with tags and duration). Every document carries a `userId`.

**The spread of granularity is the central design constraint.** A task ranges from «ricordarmi
di mandare quella mail» ("remind me to send that email") — no steps, no logs, a ten-minute
lifespan — to a project with a due date, eight steps across three levels and weeks of work log.
They live in the same list. A task with no structure must not look broken or unfinished next to a
structured one, and the screens must not presuppose that a hierarchy exists.

**Neutral vocabulary.** The domain is "any work task": no word in the interface may presuppose a
client, a job order, an invoice or a software project. Tags are the mechanism through which the user
brings in their own vocabulary.

**Cattura (capture from notes).** The first draft of a task can be written by the Claude API
from pasted notes: out come tasks with their fields filled in, nested steps, steps to attach to
a task that already exists, and work-log entries. It is not an assistant and it is not a chat —
it is a single pass from text to proposal. **The proposal is not data**: it arrives fully ticked
and editable, and becomes part of the record only when the user presses the button. That matters
most for the minutes: a note carrying a duration weighs on the monthly report exactly like a
timed session, and this is the last screen where it can be refused (principle 4).

**Technical.**
- Next.js App Router; every page is a client component. No server actions, and **exactly one server
  route**: `/api/ai/capture`, which exists solely because a Claude API key cannot live in a browser.
  It holds no Firebase credentials, opens no database and writes nothing: it returns a proposal, and
  the client is always the one that writes.
- Firebase client SDK: email/password Auth and Firestore. The Firestore rules are the only boundary
  between two accounts' data — there is no server tier that could check again.
- Capture from notes is optional: without `ANTHROPIC_API_KEY` the app works in full and the screen
  says the feature is off. Access is restricted to a list of addresses, because the demo account is
  public and every request costs money. **The demo account is deliberately outside that list**, and
  the screen it lands on says so and offers nothing to click — a control that fails after the fact
  is a worse answer than one that never pretended.
- No realtime listeners: read on demand, re-read after every write.
- Registrations can be closed through an environment variable. Being `NEXT_PUBLIC_`, it is an
  interface filter and not a control: closing registrations for real is a Firebase Auth setting.

**Copy.** Italian, throughout the interface.

## Brand Commitments

The name is **ChronoStep**. The voice is that of a personal tool: direct, concrete, never
promotional, never congratulatory without cause. The app speaks to a person who already knows their
own data and needs neither instruction nor praise.

## Evidence on Hand

- **No production data to preserve.** Firestore holds old data plus the demo account's, and can be
  emptied. The data model is therefore fixable where it is crooked, with no migration.
- No existing brand assets: no logo, no inherited palette, no mandated font.
- No testimonials, usage metrics or real cases. They are not to be invented.

## Product Principles

1. **Every screen answers before it shows.** The user knows their own data; what they do not have
   is the conclusion. The page states it, then backs it with the figures.
2. **A verdict is a checkable claim, not encouragement.** It has to be computed by rules over the
   data and must be able to say that things are going badly. A flattering verdict is a bug.
3. **Thin data is the normal state, not an edge case.** A new account, a dead month, a task with no
   steps: they are routine and have to be designed for, not patched over with a blank.
4. **Recorded time has to be defensible.** Better to leave minutes uncounted than to invent them: an
   ambiguous session is dropped, not rounded.
5. **No write fails silently.** If a save does not go through the user has to see it, because there
   is no server that can make it good afterwards.

## Accessibility & Inclusion

WCAG 2.1 AA as the mandatory floor, made binding by the redesign under way: informational text at
≥ 4.5:1 contrast in both themes, every control with a programmatically associated label, dialogs
that are real dialogs (role, focus trap, focus restore), focus always visible, and every interaction
reachable from the keyboard. Light and dark themes with an explicit toggle, honouring
`prefers-color-scheme` as the initial state.
