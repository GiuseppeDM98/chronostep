## ✨ New Features

- Added an Insights drilldown so you can click a priority or tag to see related tasks, steps, and work logs.
- Added a quick toggle to clear the active Insights focus by clicking the same priority or tag.
- Added a Start/Stop timer to track live work sessions and save the time automatically.
- Added a calendar heatmap in Insights to visualize daily work log minutes for the selected month.
- Added a monthly trends section in Insights with total hours, top task, and top tag for the last six months.
- Added a light and dark theme with a three-state switch: light, dark, or follow your system.
- Added an opening verdict to every screen — a sentence that states how things stand, with the figures inside it, replacing the grid of counters.
- Added a "what to pick up next" list on Oggi showing only live deadlines, each with the time already spent on it.

## 🐛 Bug Fixes

- Fixed emptying a field having no effect: clearing a due date, priority, tags, or a description now actually clears it instead of silently keeping the old value.
- Fixed a substep never being able to move back to the top level.
- Fixed time being lost when two steps of the same task were timed one after the other — the first session's minutes disappeared.
- Fixed a forgotten Stop billing every hour until the next unrelated Stop, which could report a single session of several days.
- Fixed time being counted twice when a timer Stop landed while a manually started session was still open.
- Fixed sessions that span a month boundary counting as zero minutes in every report.
- Fixed the Insights heatmap and the monthly trends disagreeing about the same month's total.
- Fixed "Cosa faccio oggi?" showing the wrong day's work for several hours a day outside UTC, and staying on yesterday if the tab was left open overnight.
- Fixed due dates displaying one day earlier for anyone west of Greenwich.
- Fixed Timeline entries appearing under a date heading that contradicted their own timestamp.
- Fixed tasks due on the 1st of a month vanishing from the Insights calendar.
- Fixed "Prossime scadenze" filling with long-overdue items and hiding what is actually coming up.
- Fixed a running timer becoming unstoppable — and blocking every future timer — when its task was deleted.
- Fixed a stopped session being lost when saving it failed.
- Fixed a session surviving sign-out and reappearing later with its original start time.
- Fixed a repeated tag on the same entry counting its minutes twice.
- Fixed a task with more than 500 work logs being impossible to delete.
- Fixed the step edit form labelling the position control "Priorità".

## 🔧 Improvements

- Added a global session bar with a live HH:MM:SS readout, always on screen and stoppable from any page.
- Oggi is now the home screen; the old landing page of navigation cards is gone.
- Failed saves now say so instead of failing silently, and every button that saves disables itself while it works.
- Dialogs can be dismissed with Escape or by clicking outside, and warn once before discarding unsaved changes — the previous version refused to close and offered no way out but the X, which discarded everything without asking.
- A brand-new account, an empty filter, and a quiet month now get a real explanation instead of a blank screen.
- A task with no steps no longer looks broken next to one with eight.
- Filtering steps by status now keeps their parents visible, so a substep never appears without its context.
- The whole interface is now in Italian, including the accented words and the status labels that were still English.

## ⚠️ Breaking Changes

- Due dates are now stored as a plain calendar day (`2026-08-27`) instead of a UTC timestamp. Existing dates are read correctly, but anything reading Firestore directly should expect the new shape.

## 🔒 Security

- Fixed a flaw that let any signed-in user take over or delete another user's tasks, steps, and work logs if they knew a document id — and document ids appear in shared URLs.
- Blocked injecting steps and work logs into another user's task.
- Sign-in errors no longer reveal whether an email address has an account.
- Removed 21 dependency vulnerabilities, including 3 critical, by dropping the unused `firebase-admin` package and upgrading Next.js from 14.1.0 to 16.3.3.

## 📚 Documentation

- Rewrote the README with screenshots of the app.
- Added DESIGN.md (the visual system) and PRODUCT.md (who the product is for and what constrains it).

## 🏗️ Technical

- Added four test suites covering the Firestore security rules, date handling across four timezones, work-log aggregation, and the verdict rules.
- Added a local Firebase emulator setup with realistic sample data, so the app can be developed and reviewed without touching real data.
