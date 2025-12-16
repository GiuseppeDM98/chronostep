# AI Agent Guidelines for Code Development

Chronostep is a Next.js (App Router, TypeScript) workspace backed by Firebase Authentication and Firestore. UI pages live under `src/app`, reusable logic inside `src/hooks` and `src/lib`, and every authenticated screen is wrapped by `AuthGate` to enforce sign-in.

## General Principles

### Readability and Maintainability
- Keep Firestore access isolated inside `useTaskStore` and consume its snapshot/state in page components (see `src/app/tasks/page.tsx` and `src/app/insights/page.tsx`).
- Memoize derived data such as grouped logs or calendar cells with `useMemo` so large components stay predictable.
- Extract declarative constants (`CTA_LINKS`, `STATUS_FILTERS`, `TASK_STATUS_OPTIONS`, etc.) to the top of a file and reuse them instead of scattering literals.
- When you add new derived helpers, co-locate them near the component and keep props flat; avoid prop-drilling when context (`useAuth`, `useTaskStore`) already supplies the data.

### SOLID Principles
- **Single Responsibility Principle**: `src/hooks/useTaskStore.ts` owns Firestore reads/writes plus snapshot hydration, and `src/components/AuthGate.tsx` handles authentication UI. Extend those units rather than duplicating their duties elsewhere.
- **Open/Closed Principle**: Add new progress or analytics helpers by composing new functions beside `buildStepsByTask` or `buildTaskActivity` inside `src/lib/insights.ts`, keeping existing behavior untouched.
- **Liskov Substitution Principle**: The domain contracts in `src/lib/types.ts` define exact field requirements, so keep new entities compatible with those interfaces or introduce new types when semantics diverge.
- **Interface Segregation Principle**: Prefer focused hooks/contexts (e.g., `useAuth`, `useTaskStore`) over "god" providers; expose specific actions and state slices rather than dumping Firestore objects into components.
- **Dependency Inversion Principle**: Obtain Firebase instances through `src/lib/firebaseClient.ts` and inject abstractions (hooks/helpers) into components; never initialize SDKs inside UI files.

### DRY (Don't Repeat Yourself)
- Reuse shared helpers (`buildStepsByTask`, `getTaskStepSummary`, `describePriority`) along the pages to avoid reimplementing count/format logic.
- Treat enumerations consistently: update all `TaskStatus`/`TaskPriority` arrays (`TASK_STATUSES`, `TASK_PRIORITIES`, `TASK_STATUS_OPTIONS`) whenever you introduce a new literal to keep filters and dropdowns in sync.
- When building nested UIs (step trees, grouped logs), centralize the transformation (`buildStepTree`, grouped map builders) and reuse it across render paths instead of recalculating inline.

### Compact Functions
- Favor small, purpose-built callbacks and helpers; compose them at the render site. The existing pages split formatting (`formatPriority`, `formatTime`) from rendering to maintain clarity—follow the same pattern when adding features.
- When a function grows beyond a screenful (e.g., new modal logic), pull discrete responsibilities into hooks or helper functions to keep files approachable.

### Error Handling
- Mirror the pattern in `src/hooks/useAuth.tsx`: reset error state before async work, catch SDK errors, translate them into user-friendly strings, and rethrow when the caller must know about failures.
- Guard privileged operations with `ensureUserId` (or equivalent) and short-circuit if the preconditions are not met, as seen in `useTaskStore`.
- Prefer optimistic UI updates plus `refreshState()` calls after mutations; if you add complex workflows, surface loading/error toggles so `AuthGate` pages remain responsive.

### Testing
- There are no automated tests yet. When you create pure helpers under `src/lib`, add colocated unit tests (e.g., `insights.test.ts`) or at least provide sample usage inside the docs to keep regressions small.
- For UI flows, rely on manual verification via `npm run dev` plus seeded Firestore data; document any manual QA steps in PR descriptions.

### Style Conventions
- This project uses TypeScript, React 18, Next.js App Router, Tailwind CSS, and Firebase SDKs—follow their idiomatic patterns.
- Client components begin with `"use client";` and keep hooks at the top. Server components should remain hook-free.
- Keep comments and code in English even if UI copy occasionally contains Italian text.
- Use Tailwind utility classes for styling; avoid inline styles unless absolutely necessary.
- Keep files ASCII-only unless you must surface existing localized copy.

---

## Comment Guidelines

**IMPORTANT: All comments must be written in English.** Favor comments that explain rationale or domain intent; let TypeScript types express structure.

### Recommended Comment Types

#### 1. Function Comments
Document public contracts or data structures so contributors can treat them as black boxes. Example (`src/lib/types.ts:25-69`):
```ts
/**
 * Top-level item that users manipulate. Tracks metadata and progress signals.
 */
export interface Task {
  id: EntityId;
  // …
}
```

#### 2. Design Comments
Use file- or module-level comments to explain sourcing decisions or architectural tradeoffs. Example (`src/lib/types.ts:1-4`):
```ts
/**
 * Domain model primitives for Chronostep.
 * Derived from docs/02-domain-model-and-routes.md to keep the UI and data layer in sync.
 */
```

#### 3. Why Comments
Add inline comments only when intent is non-obvious. Example (`src/app/insights/page.tsx:42-45`):
```ts
const startOffset = (startOfMonth.getDay() + 6) % 7; // Monday as first column
```

#### 4. Teacher Comments
Explain domain background or demo data so future readers understand context. Example (`src/lib/mockData.ts:5-7`):
```ts
/**
 * Seed data for local development before persistence is in place.
 */
```

#### 5. Guide Comments
Use short section headers to break up very long components (e.g., the task-detail page) when adding new blocks of forms or derived lists. Introduce them sparingly such as `/* Step creation form */` before a JSX section when structure alone is not enough.

#### 6. Checklist Comments
Place warnings near tightly coupled declarations when missing updates would break the UI (e.g., if you add a new `TaskStatus`, remind readers to update `TASK_STATUS_OPTIONS` and `TASK_STATUSES`). There are no current examples, so add them only where the coupling is real.

---

### Comments to Avoid

- Do not restate obvious logic (`// increment i`) or Tailwind utility meaning.
- Avoid leaving TODO/FIXME without an issue reference; prefer creating GitHub issues or updating `docs/04-implementation-plan.md`.
- Never keep commented-out code; rely on git history instead.
- Keep comments English-only even though UI copy mixes languages.

---

## Project-Specific Guidelines

### Architecture Overview
- Next.js App Router drives routing (`src/app/**/page.tsx`). Every page wraps its tree with `AuthGate` so only authenticated users see data.
- `useAuth` manages Firebase Authentication state, while `useTaskStore` centralizes Firestore collections (`tasks`, `steps`, `workLogs`) and exposes CRUD helpers plus hydration flags.
- Derived analytics (step counts, activity summaries) live in `src/lib/insights.ts` and are consumed by both Timeline and Insights pages.
- Domain documentation under `docs/02-domain-model-and-routes.md` and the README remain the canonical source when you need business rules.

### Key Workflows
- Install deps with `npm install`, then run `npm run dev` for local development. Use `npm run build` and `npm run start` to simulate production, and `npm run lint` to enforce Next.js ESLint defaults.
- Configure Firebase credentials via `.env` (`NEXT_PUBLIC_FIREBASE_*`). Test auth flows inside `AuthGate` before touching data.
- Manual testing relies on your own Firebase project; seed collections via the UI or temporary scripts if needed.

### Important Patterns
- Use `isHydrated` from `useTaskStore` to gate rendering of data-heavy sections (empty states vs. loading placeholders).
- Convert arrays into lookup maps with `useMemo` before rendering to minimize repeated computation (`stepsByTask`, grouped logs, calendar grids).
- Keep form state local to the component and reset via helper functions (see modal helpers in `src/app/tasks/page.tsx`).
- Navigation uses `next/link` plus semantic buttons; keep accessible labels consistent.

### Integration Points
- Firebase Auth and Firestore are the only external services; keep SDK usage inside hooks/lib files.
- Firestore collections expected by the UI: `tasks`, `steps`, `workLogs` with the schema defined in `src/lib/types.ts`.
- Environment variables: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.

---

## Language-Specific Notes

- Stick to TypeScript strictness: annotate props, hook returns, and derived data maps.
- Follow React/Next.js rules of hooks and App Router conventions (client components mark `"use client";` on the first line).
- Use `next/link` for internal navigation and avoid mixing imperative router pushes unless needed.
- Tailwind utilities should be composed in `className`; extract to helper components only when reuse is obvious.

---

## Quick Reference

- [ ] Review `src/lib/types.ts` before touching persistence to keep domain contracts aligned.
- [ ] Run `npm run lint` (and `npm run build` when touching build-time code) before submitting changes.
- [ ] Launch the dev server with `npm run dev` to exercise AuthGate, task CRUD, and insights flows.
- [ ] Keep Firebase env vars in sync with your local `.env`; confirm they are available before initializing SDKs.

---

## Conclusion

Favor clear, typed abstractions, lean on the existing hooks/components for Firebase access, and document intent whenever the code would otherwise be surprising. Build features that extend the current patterns instead of reinventing them, and always double-check that updates stay in sync across the shared constants, domain types, and UI states.
