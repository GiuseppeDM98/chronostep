# WORKFLOW.md

Session and collaboration rules for whoever — person or agent — works on this repo. Part 1 is the
portable standard, identical in every repo that adopts it. Part 2 is local to ChronoStep.

## Part 1 — Session and collaboration rules

1. Never commit without explicit approval. Do not run `git commit` (or `--amend`) until the OK for
   that specific commit arrives. Finish the work, summarise the diff, then ask. Creating the branch
   and editing files needs no approval — only the commit does.

2. One branch per session. Before starting implementation work, create a new branch off the branch
   that was active at the start of the session (always check which one that is, never assume
   master/main).

3. One commit per session. Every change made in a session is squashed into a single commit, not
   spread over several.

4. Always reply in Italian when working on this repo (this covers the conversational channel — code,
   identifiers and comments stay in English).

### Guided manual-testing rule

When a freshly implemented feature has to be verified by hand, do not hand over a checklist and
disappear. The testing is done together, in chat, one phase at a time. Four obligations:

1. The agent prepares the test data — a throwaway script (untracked by git, deleted once the testing
   is over) carrying "marker words" (invented words like fenicottero, ornitorinco — flamingo,
   platypus — that appear nowhere else in the archive), not the user by hand.
2. One phase per message — give the phase, wait for the report, then the next one. Never hand over
   every phase at once: prerequisites end up skipped.
3. State the expected outcome before running, not after — otherwise the reading always bends to fit
   what happened.
4. Run every check that can be automated, and leave the user only what cannot be. "Together, in
   chat" does not mean "one click at a time dictated to the user": if the sessions are JWTs or are
   otherwise scriptable, write a throwaway script that drives a real browser (e.g. Playwright) with
   an authenticated session — the agent's own if its role allows it, otherwise a throwaway test
   identity created for the occasion — and verify every outcome against the database or the HTTP
   response, never against how the page looks. Report the results phase by phase, with the expected
   outcome stated first. Every automatic end-to-end test you are able to run, you run: never declare
   a feature verified while an automatic check that could have covered it was left unrun. Leave the
   user only what is genuinely not automatable: visual/aesthetic judgement, physical hardware (e.g. a
   real barcode scanner), or an interactive login that cannot be driven from a script (e.g. a real
   OAuth flow with MFA).

Standard phases, to follow where they make sense: A-Invariance (what worked before still works) →
B-Context switch (the new role/state really is active) → C-New behaviour (it does what it must, and
not what it must not — point 4 counts for most here: automate) → D-Under the UI (the same rules
hold when the route is called by hand) → E-Negative cases (whoever lacks the rights is refused,
with the right error) → F-Restore (configuration put back, fixtures removed, script deleted).

A negative test alone does not prove a security guard: it always takes the pair own-resource
(positive control, must succeed) / someone-else's-resource (the test, must fail), on the exact same
file or record. Closing a test run: restore any config that was changed, remove test fixtures and
attachments, delete the script, and record the outcome somewhere that outlives the session
(CLAUDE.md or equivalent) — an unrecorded test run counts as one never done.

## Part 2 — How it applies in this repo

**Package manager and commands.** npm. `npm test` runs `test:dates`, `test:insights`,
`test:verdicts`, `test:rules` in sequence (see `package.json`); `npm run lint` and `npm run build`
are the other automatic checks available. No CI is configured in the repo (there is no `.github`
directory): these commands must be run by hand before a test run can count as closed.

**There is no authenticated E2E suite.** The four suites in `tests/` are unit/integration tests over
Firestore rules, dates, insights and verdicts — none of them drives a browser. `playwright` is a
devDependency used only by `scripts/screenshots.mjs`, which opens a real browser, logs in with the
demo account (`demo@chronostep.local` / `chronostep`, overridable with `SEED_EMAIL` /
`SEED_PASSWORD`) against the Auth emulator, and takes screenshots: it asserts nothing about the
data. It is still the reference pattern to start a test script from — the same real login through
Playwright, but followed by a check on the data (see below) rather than by a screenshot.

**Isolated local environment.** Firebase emulators, not a separate test database:
```bash
npm run emulators                                  # Auth :9099, Firestore :8080 (firebase.json)
npm run seed                                       # scripts/seed-emulator.mjs — account + fixtures relative to today
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev
```
`npm run test:rules` runs on a separate Firestore emulator, port 8181 (`firebase.test.json`),
deliberately, so it can run alongside the development emulators without a port conflict.

**Test identity.** There is no admin role on the client. For a second user, replicate the
`ensureUser` pattern in `scripts/seed-emulator.mjs`: `POST` to
`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp` (or `:signInWithPassword`
if the account already exists) with `key=fake-api-key`. For single-role testing, reusing the seeded
demo account is enough.

**How the real state is read back.** There is no admin REST endpoint, and the Firestore emulator UI
is disabled by default (`"ui": {"enabled": false}` in both `firebase.json` and
`firebase.test.json`). Two options, in order of preference:
1. From the same Node/Playwright script used for the test run, query Firestore with the client SDK
   (`firebase/firestore`) pointed at the emulator, under the test user's own credentials — the same
   approach `scripts/seed-emulator.mjs` uses to write, applied to a read after the action being
   verified.
2. Temporarily set `"ui": {"enabled": true}` in `firebase.json` to inspect by hand during the test
   run, then put it back to `false` in phase F (restore) — it is a git-tracked file.

Do not read the uid out of `localStorage` for an emulator flow: Firebase Auth persists to IndexedDB
(already noted in `AGENTS.md`).

**Branches.** Default/integration: `main` (`origin/main`). The naming conventions (`feature/…`,
`fix/…`, `refactor/…`, `chore/…`) and the commit message format (Conventional Commits) are already
in [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md#-git--versioning) — not duplicated here.

**Where to record the outcome of a test run.** There is no dedicated place today.
`Draft Release Temp.md` accumulates only the release notes an end user sees, not internal
verification outcomes. Proposal: a `## Manual test runs` section at the bottom of `CLAUDE.md` (the
file that is loaded automatically), one line per run — date, feature, phases executed, outcome.
Create it at the first test run that follows this rule, if it does not exist yet.

### What is missing today to honour obligation 4 in full

- No real E2E suite: the four suites in `tests/` drive neither a browser nor a complete HTTP flow.
  The bare minimum would be a reusable Playwright script (emulator login + a Firestore read helper)
  instead of writing one from scratch for every test run.
- No debug/admin endpoint for reading state without going through the client SDK or the Firestore
  emulator UI (disabled by default).
- No place that already exists for manual test outcomes: it has to be created as needed (proposal
  above).
