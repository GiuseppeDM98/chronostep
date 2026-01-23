# Session Notes

Goal: allow editing step priority (order) after creation.

Changes:
- Added a priority selector for steps in the edit modal.
- Reordered sibling steps when a step priority changes or when reparenting.
- Added a batched step order update helper in the task store.

Files touched:
- src/app/tasks/[id]/page.tsx
- src/hooks/useTaskStore.ts
