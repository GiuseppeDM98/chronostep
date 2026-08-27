<!--
  Release notes accumulating since the last published release (v.0.1.0, 22 Jan 2026).

  How this file works
  - Append user-visible changes at the end of every session, under the right heading.
  - Paste the whole file into the GitHub release body when you cut a release, then delete it and
    start a fresh one. This comment does not render, so it is safe to paste as-is.
  - Only what a user can see belongs here. Refactors, renames and internal cleanups do not, unless
    they change behaviour.
  - A fix to something that has NOT been released yet is not a bug fix — fold it into the feature's
    own bullet instead. Nobody can have experienced a bug in a version they never had.
  - Keep the heading order below and delete any heading that ends up empty.

  Suggested version for this batch: 0.2.0 — new features plus one breaking change, still pre-1.0.
-->

## ✨ New Features

- Added an opening verdict to every screen: a sentence stating how things actually stand, with the figures inside it, in place of a grid of counters. It is computed from your data and will tell you when things are going badly.
- Added a "what to pick up next" list on the home screen, showing only what is live — overdue first, then due today — each with the time already spent on it.
- Added a live work-session timer with an HH:MM:SS readout. It starts from any step, follows you across the app, and can be stopped from any page.
- Added a light and dark theme with a three-state switch: light, dark, or follow your system.
- Added an Insights drilldown: click a priority or tag to see the tasks, steps and work logs behind it, click it again to clear. The filtered view has its own address, so it can be bookmarked and shared.
- Added a calendar heatmap in Insights showing how much you logged on each day of the month.
- Added a monthly trends section in Insights with total hours, top task and top tag for the last six months.
- Added the ability to change a step's position among its siblings after creating it, and to move it under a different parent.
- Added an optional lock on new registrations, with an email whitelist, plus demo account credentials on the sign-in screen so the app can be shown to someone.

## 🔧 Improvements

- The home screen is now "Oggi" itself, instead of a landing page of links to the other sections.
- Failed saves now say so. Previously a write that failed changed nothing and reported nothing, and the only clue was that the value had not changed.
- Every button that saves now disables itself while it works, so a second click can no longer create a duplicate.
- Dialogs can be dismissed with Escape or by clicking outside, and ask once before discarding unsaved changes. The previous version refused to close while a field had been edited, leaving the X button — which discarded everything without asking — as the only way out.
- A brand-new account, a filter that matches nothing, and a month with no work now explain themselves instead of showing a blank area.
- A task with no steps no longer looks incomplete beside one with eight; a single-line reminder is a legitimate task.
- Filtering steps by status now keeps their parents on screen, so a substep never appears detached from what it belongs to.
- Interface copy is now consistently Italian, including accented words and the status labels that were still English.

## 🐛 Bug Fixes

- Fixed time disappearing when two steps of the same task were timed one after the other: the first session's minutes were silently dropped.
- Fixed a forgotten Stop billing every hour until the next unrelated Stop, which could report a single session lasting days.
- Fixed the same minutes being counted twice when a timer Stop landed while a manually started session was still open.
- Fixed sessions that span a month boundary counting as zero minutes in every report.
- Fixed the Insights heatmap and the monthly trends disagreeing about the same month's total.
- Fixed a tag repeated on the same entry counting its minutes twice.
- Fixed "Cosa faccio oggi?" showing the wrong day's work for several hours a day outside UTC, and staying on yesterday when the tab was left open overnight.
- Fixed due dates displaying one day earlier for anyone west of Greenwich.
- Fixed Timeline entries appearing under a date heading that contradicted the time printed on the entry itself.
- Fixed tasks due on the 1st of a month vanishing from the Insights calendar.
- Fixed "Prossime scadenze" filling up with long-overdue items and hiding what is actually coming.
- Fixed a running timer becoming unstoppable, and blocking every future timer, when its task was deleted.
- Fixed a stopped session being lost when saving it failed.
- Fixed a session surviving sign-out and reappearing later with its original start time.
- Fixed emptying a field having no effect: clearing a due date, priority, tags or description now clears it instead of silently keeping the old value.
- Fixed a substep never being able to move back to the top level.
- Fixed a task with more than 500 work logs being impossible to delete.

## ⚠️ Breaking Changes

- Due dates are now stored as a plain calendar day (`2026-08-27`) instead of a UTC timestamp. Dates written by earlier versions are still read correctly, but anything reading Firestore directly should expect the new shape.

## 🔒 Security

- Fixed a flaw that let any signed-in user take over or delete another user's tasks, steps and work logs if they knew a document id — and document ids appear in shared URLs.
- Blocked injecting steps and work logs into another user's task.
- Sign-in errors no longer reveal whether an email address has an account.
- Removed 21 dependency vulnerabilities, 3 of them critical, by dropping the unused `firebase-admin` package and upgrading Next.js from 14.1.0 to 16.3.3.

## 📚 Documentation

- Rewrote the README with screenshots of the app.
- Added DESIGN.md, recording the visual system, and PRODUCT.md, recording who the product is for and what constrains it.

## 🏗️ Technical

- Added test suites covering the Firestore security rules, date handling across four timezones, work-log aggregation and the verdict rules.
- Added a local Firebase emulator setup with realistic sample data, so the app can be developed and reviewed without touching real data.
