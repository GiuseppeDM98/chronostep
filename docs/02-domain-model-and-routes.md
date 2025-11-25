# Domain Model & Application Routes

## Data Models

### Task
```ts
interface Task {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority?: "low" | "medium" | "high";
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
}
```

### Step
```ts
interface Step {
  id: string;
  taskId: string;
  parentStepId?: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  order: number;
  createdAt: string;
  updatedAt: string;
}
```

### WorkLog
```ts
interface WorkLog {
  id: string;
  taskId: string;
  stepId?: string;
  message?: string;
  type: "start" | "stop" | "note";
  timestamp: string;
  durationMinutes?: number;
}
```

## Persistence Strategy
### MVP
Use **LocalStorage** to support offline‑first behavior with minimal infrastructure.

### Future Options
- SQLite via Prisma.
- Postgres/Supabase for shared multi-device usage.

## Routes
```
/
├─ tasks
│  ├─ page.tsx
│  └─ [id]
│     └─ page.tsx
├─ timeline
│  └─ page.tsx
└─ settings
   └─ page.tsx
```

### Route Descriptions
- `/` — Dashboard with current tasks and recent logs.
- `/tasks` — Full task list with filters.
- `/tasks/[id]` — Task detail view with steps and logs.
- `/timeline` — Global chronological activity timeline.
- `/settings` — Preferences and future configuration options.
