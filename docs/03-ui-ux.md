# UI & UX Specification

## Design Principles
- Minimalistic, readable, distraction‑free.
- Optimized for keyboard and quick interactions.
- Clear separation between task structure and activity logs.

## Core Screens

### Dashboard (`/`)
- Quick stats: tasks in progress, logs today.
- Shortcuts to create new task/log.
- Recent activity list.

### Tasks List (`/tasks`)
- List of all tasks.
- Filters:
  - Status filter (todo, in progress…)
  - Tag filter
  - Priority filter
- Button to create new task.
- Each TaskCard shows:
  - Title
  - Progress (steps done / total)
  - Status badge
  - Priority indicator

### Task Detail (`/tasks/[id]`)
Sections:
1. **Task Header**
   - Title, description
   - Status selector
   - Priority, due date, tags
2. **Steps**
   - Create new step
   - Step list with nested substeps
   - Checkbox to mark done
   - Reorder using arrows or drag&drop (later)
3. **WorkLog Timeline**
   - Add log (free-text note)
   - Chronological list
   - Show timestamp, type, optional step reference

### Timeline (`/timeline`)
- Full list of all logs.
- Filters by:
  - Date range
  - Task
  - Log type
- Daily grouping.

## Components
- `TaskCard`
- `StepList`, `StepItem`
- `LogTimeline`, `LogEntry`
- `Tag`, `Badge`, `StatusSelector`
- `Modal`, `Dialog`, `Input`, `Textarea`, `Button`

## Empty States
- No tasks → “Create your first task”
- No logs → “Start logging your progress”
