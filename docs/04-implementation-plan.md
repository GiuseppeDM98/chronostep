# Implementation Plan

## Tech Stack Overview

- **Framework:** Next.js (App Router, TypeScript)
- **Database:** SQLite
- **ORM:** Prisma
- **Styling:** Tailwind CSS

The app will be **database-first** from the moment we implement persistence. SQLite is chosen because it is:

- Simple to set up (single file, no server required).
- Perfect for a personal tool.
- Easy to migrate later to Postgres if needed.

---

## Milestone 1 — Static Mock UI

**Goal:** Build the basic screens and flow without real data.

Tasks:

- Set up a new Next.js project with TypeScript and App Router.
- Install and configure Tailwind CSS.
- Create placeholder pages:
  - `/`
  - `/tasks`
  - `/tasks/[id]`
  - `/timeline`
- Use hardcoded mock data in components (no state management yet).

---

## Milestone 2 — Domain Types & Mock Data

**Goal:** Define the domain model in TypeScript and use consistent mock data.

Tasks:

- Create `src/lib/types.ts` with interfaces:
  - `Task`
  - `Step`
  - `WorkLog`
- Create `src/lib/mockData.ts` with:
  - A few sample tasks.
  - Related steps and substeps.
  - A small set of work logs.

At this point, the UI still reads from mock data only.

---

## Milestone 3 — SQLite Database with Prisma

**Goal:** Introduce a real SQLite database and Prisma ORM, with a full schema for the app.

### 3.1 Install and Initialize Prisma

Tasks:

1. Install Prisma CLI and SQLite client:
   ```bash
   npm install prisma --save-dev
   npm install @prisma/client
   ```
2. Initialize Prisma with SQLite:
   ```bash
   npx prisma init --datasource-provider sqlite
   ```
3. Update `.env` to point to a local SQLite file:
   ```env
   DATABASE_URL="file:./dev.db"
   ```

### 3.2 Define the Prisma Schema

Edit `prisma/schema.prisma` to define all tables and relations:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Task {
  id          String       @id @default(cuid())
  title       String
  description String?
  status      TaskStatus
  priority    TaskPriority?
  // Tags stored as a comma-separated string or JSON text (parsed in app code)
  tagsRaw     String?      // e.g. "work,personal,nextjs"
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  dueDate     DateTime?

  steps    Step[]
  workLogs WorkLog[]
}

model Step {
  id           String       @id @default(cuid())
  task         Task         @relation(fields: [taskId], references: [id], onDelete: Cascade)
  taskId       String

  // Self-relation to support nested substeps
  parentStep   Step?        @relation("StepToSubsteps", fields: [parentStepId], references: [id])
  parentStepId String?
  substeps     Step[]       @relation("StepToSubsteps")

  title        String
  status       StepStatus
  order        Int

  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  workLogs     WorkLog[]
}

model WorkLog {
  id              String       @id @default(cuid())
  task            Task         @relation(fields: [taskId], references: [id], onDelete: Cascade)
  taskId          String

  step            Step?        @relation(fields: [stepId], references: [id])
  stepId          String?

  message         String?
  type            WorkLogType
  timestamp       DateTime     @default(now())
  durationMinutes Int?

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}

enum TaskStatus {
  todo
  in_progress
  done
  blocked
}

enum StepStatus {
  todo
  in_progress
  done
}

enum TaskPriority {
  low
  medium
  high
}

enum WorkLogType {
  start
  stop
  note
}
```

Notes:

- `tagsRaw` is a simple `String?` that can store comma-separated tags or JSON text.
- `Step` has a self-relation (`parentStep` / `substeps`) to support nested substeps.
- `WorkLog` can be linked to a `Task` and optionally to a specific `Step`.

### 3.3 Run Migrations and Generate Client

Tasks:

1. Run the first migration and create the SQLite database file:
   ```bash
   npx prisma migrate dev --name init
   ```
2. Generate the Prisma client:
   ```bash
   npx prisma generate
   ```

After this, you should have:

- `dev.db` SQLite file in the project root (or wherever configured).
- Typesafe Prisma client ready to use.

---

## Milestone 4 — Data Access Layer & Server Actions

**Goal:** Connect the Next.js app to SQLite via Prisma and expose CRUD operations.

Tasks:

1. Create a Prisma client helper (e.g. `src/lib/prisma.ts`):
   - Export a singleton Prisma client to avoid multiple instances in dev mode.

2. Implement basic repository functions:
   - `getTasks`, `getTaskById`
   - `getStepsForTask`
   - `getWorkLogsForTask`
   - `getWorkLogsTimeline`

3. Create Next.js **server actions** or **route handlers** for:
   - Creating/updating/deleting `Task`
   - Creating/updating/deleting `Step`
   - Creating `WorkLog` entries

4. Refactor UI components to load data from the database instead of mock data.

At the end of this milestone, the app is fully backed by SQLite.

---

## Milestone 5 — UI Integration & UX Polishing

**Goal:** Make the UI fully interactive with real DB-backed operations.

Tasks:

- Wire up all forms to server actions:
  - New task form.
  - Edit task details.
  - Add step/substep.
  - Add work log.
- Add basic loading/error states.
- Implement filters on `/tasks` and `/timeline` using DB queries.

---

## Milestone 6 — Enhancements & Analytics

**Goal:** Extend the app with more advanced features using the existing DB schema.

Possible tasks:

- Implement ordering and drag&drop for steps (with `order` column updates).
- Add simple analytics queries:
  - Work logs count per day.
  - Total duration per task.
- Improve tag handling:
  - Introduce a separate `Tag` model and many-to-many join table (optional).
- Add export features:
  - Export tasks/work logs as JSON, CSV, or markdown.

---

## Future Evolution

If you ever outgrow SQLite:

- Migrate to **Postgres** or **Supabase** by:
  - Changing the `datasource` in `schema.prisma`.
  - Updating `DATABASE_URL` in `.env`.
  - Running `prisma migrate dev` again.
- Add authentication and multi-user support by:
  - Introducing a `User` model.
  - Linking `Task` and `WorkLog` to `User`.

For now, SQLite provides an excellent, low-friction foundation for your personal task tracker.
