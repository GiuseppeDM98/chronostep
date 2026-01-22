"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type {
  CreateStepInput,
  CreateTaskInput,
  CreateWorkLogInput,
  Step,
  Task,
  TaskStoreSnapshot,
  UpdateStepInput,
  UpdateTaskInput,
  UpdateWorkLogInput,
  WorkLog,
} from "../lib/types";
import { firebaseApp } from "../lib/firebaseClient";
import { useAuth } from "./useAuth";

type TaskStoreState = TaskStoreSnapshot;

const defaultState: TaskStoreState = {
  tasks: [],
  steps: [],
  workLogs: [],
};

// Normalize Firestore optional arrays so callers can treat "empty" as undefined.
// This prevents UI code from needing to check both [] and undefined separately.
const normalizeArray = <T,>(value?: T[] | null) => (value && value.length > 0 ? value : undefined);

// Document model converters apply safe defaults for optional fields and normalize
// inconsistent Firestore data (null vs undefined, missing arrays). This ensures
// UI components receive consistent, type-safe data shapes regardless of how
// documents were written to Firestore.

// Map Firestore task documents into the canonical Task shape with safe defaults.
const toTaskModel = (docSnap: QueryDocumentSnapshot<DocumentData>): Task => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    userId: data.userId,
    title: data.title ?? "",
    description: data.description ?? undefined,
    status: data.status,
    priority: data.priority ?? undefined,
    tags: normalizeArray<string>(data.tags),
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    dueDate: data.dueDate ?? undefined,
  };
};

// Map Firestore step documents into the canonical Step shape with safe defaults.
const toStepModel = (docSnap: QueryDocumentSnapshot<DocumentData>): Step => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    userId: data.userId,
    taskId: data.taskId,
    parentStepId: data.parentStepId ?? undefined,
    title: data.title ?? "",
    description: data.description ?? undefined,
    status: data.status,
    order: data.order ?? 0,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    dueDate: data.dueDate ?? undefined,
  };
};

// Map Firestore work log documents into the canonical WorkLog shape with safe defaults.
const toWorkLogModel = (docSnap: QueryDocumentSnapshot<DocumentData>): WorkLog => {
  const data = docSnap.data();
  const tags = Array.isArray(data.tags) ? data.tags.filter(Boolean) : [];
  return {
    id: docSnap.id,
    userId: data.userId,
    taskId: data.taskId,
    stepId: data.stepId ?? undefined,
    message: data.message ?? undefined,
    tags,
    type: data.type,
    timestamp: data.timestamp ?? new Date().toISOString(),
    durationMinutes: data.durationMinutes ?? undefined,
  };
};

const tasksCollection = (db: Firestore) => collection(db, "tasks");
const stepsCollection = (db: Firestore) => collection(db, "steps");
const workLogsCollection = (db: Firestore) => collection(db, "workLogs");

// Pull a consistent snapshot of tasks, steps, and logs for the current user.
const fetchTaskStoreSnapshot = async (db: Firestore, userId: string): Promise<TaskStoreSnapshot> => {
  const [taskSnapshot, stepSnapshot, workLogSnapshot] = await Promise.all([
    getDocs(query(tasksCollection(db), where("userId", "==", userId))),
    getDocs(query(stepsCollection(db), where("userId", "==", userId))),
    getDocs(query(workLogsCollection(db), where("userId", "==", userId))),
  ]);

  return {
    tasks: taskSnapshot.docs
      .map(toTaskModel)
      // Sort tasks newest-first for the default list view
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    steps: stepSnapshot.docs.map(toStepModel),
    workLogs: workLogSnapshot.docs
      .map(toWorkLogModel)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  };
};

// Cascade delete all work logs linked to a task (Firestore has no server-side cascade).
const deleteWorkLogsByTask = async (db: Firestore, taskId: string) => {
  const snapshot = await getDocs(query(workLogsCollection(db), where("taskId", "==", taskId)));
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
};

// Cascade delete all work logs linked to a step (Firestore has no server-side cascade).
const deleteWorkLogsByStep = async (db: Firestore, stepId: string) => {
  const snapshot = await getDocs(query(workLogsCollection(db), where("stepId", "==", stepId)));
  if (snapshot.empty) return;
  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
};

// Delete a step subtree depth-first to ensure children and their logs are removed first.
//
// Recursion: For each child step, recursively delete its subtree before deleting the child.
// This ensures we delete leaf nodes (and their work logs) before parent nodes, maintaining
// referential integrity in a system without server-side cascade deletes.
const deleteStepWithChildren = async (db: Firestore, stepId: string) => {
  const childSnapshot = await getDocs(
    query(stepsCollection(db), where("parentStepId", "==", stepId)),
  );
  await Promise.all(childSnapshot.docs.map((child) => deleteStepWithChildren(db, child.id)));
  await deleteWorkLogsByStep(db, stepId);
  await deleteDoc(doc(db, "steps", stepId));
};

// Task store hook backed by fetch-on-demand Firestore queries (no realtime listeners).
export const useTaskStore = () => {
  const { user } = useAuth();
  const [state, setState] = useState<TaskStoreState>(defaultState);
  const [isHydrated, setIsHydrated] = useState(false);
  const db = useMemo(() => getFirestore(firebaseApp), []);

  // Guard every write with the current user id to enforce ownership.
  // Throws if no authenticated user, preventing writes without a userId.
  // Firestore rules also enforce this server-side, but we fail fast client-side.
  const ensureUserId = useCallback(() => {
    if (!user) {
      throw new Error("User is not authenticated.");
    }
    return user.uid;
  }, [user]);

  // Fetch and replace the entire in-memory snapshot after every write.
  //
  // Trade-off: This is simpler than maintaining incremental updates but less
  // efficient at scale. We chose simplicity for the initial implementation;
  // consider real-time listeners or delta updates if performance degrades.
  const refreshState = useCallback(async () => {
    if (!user) {
      setState(defaultState);
      return defaultState;
    }
    const snapshot = await fetchTaskStoreSnapshot(db, user.uid);
    setState(snapshot);
    return snapshot;
  }, [db, user]);

  useEffect(() => {
    // Guard against race conditions when user logs in/out rapidly or component unmounts
    // during async fetch. The `active` flag prevents stale fetch results from updating
    // state after the effect has been cleaned up or user has changed.
    let active = true;
    if (!user) {
      setState(defaultState);
      setIsHydrated(true);
      return () => {
        active = false;
      };
    }

    setIsHydrated(false);
    fetchTaskStoreSnapshot(db, user.uid)
      .then((snapshot) => {
        // Only update state if this effect is still active (not cleaned up)
        if (!active) return;
        setState(snapshot);
      })
      .finally(() => {
        if (active) setIsHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [db, user]);

  // Write helpers below always refresh the snapshot to keep derived views consistent.
  const createTask = useCallback(
    async (input: CreateTaskInput) => {
      const uid = ensureUserId();
      const now = new Date().toISOString();
      await addDoc(tasksCollection(db), {
        userId: uid,
        title: input.title,
        // Convert undefined to null for Firestore compatibility.
        // Firestore omits undefined fields from documents, but we want to explicitly
        // clear values when users delete optional data (description, priority, etc.).
        description: input.description ?? null,
        status: input.status,
        priority: input.priority ?? null,
        tags: input.tags ?? [],
        dueDate: input.dueDate ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await refreshState();
    },
    [db, ensureUserId, refreshState],
  );

  const updateTask = useCallback(
    async (id: string, input: UpdateTaskInput) => {
      ensureUserId();
      const now = new Date().toISOString();
      const data: Record<string, unknown> = { updatedAt: now };
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description ?? null;
      if (input.status !== undefined) data.status = input.status;
      if (input.priority !== undefined) data.priority = input.priority ?? null;
      if (input.tags !== undefined) data.tags = input.tags ?? [];
      if (input.dueDate !== undefined) data.dueDate = input.dueDate ?? null;
      await updateDoc(doc(db, "tasks", id), data);
      await refreshState();
    },
    [db, ensureUserId, refreshState],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      ensureUserId();
      // Cascade delete in strict order to maintain referential integrity:
      // 1. Work logs (depend on task and steps)
      // 2. Steps (depend on task, may have children)
      // 3. Task (root entity)
      // Firestore has no server-side cascade, so we handle it client-side.
      await deleteWorkLogsByTask(db, id);
      const stepSnapshot = await getDocs(query(stepsCollection(db), where("taskId", "==", id)));
      await Promise.all(stepSnapshot.docs.map((step) => deleteStepWithChildren(db, step.id)));
      await deleteDoc(doc(db, "tasks", id));
      await refreshState();
    },
    [db, ensureUserId, refreshState],
  );

  const createStep = useCallback(
    async (input: CreateStepInput) => {
      const uid = ensureUserId();
      const now = new Date().toISOString();
      await addDoc(stepsCollection(db), {
        userId: uid,
        taskId: input.taskId,
        parentStepId: input.parentStepId ?? null,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        order: input.order,
        dueDate: input.dueDate ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await refreshState();
    },
    [db, ensureUserId, refreshState],
  );

  /**
   * Read step metadata needed for cascading status updates.
   *
   * Returns only the fields needed to walk parent chains and check completion,
   * avoiding the overhead of loading all step fields and related entities.
   *
   * @param stepId - The step to read
   * @returns Minimal step data (taskId, parentStepId, status) or null if not found
   */
  const readStepMetadata = useCallback(
    async (stepId: string) => {
      const snapshot = await getDoc(doc(db, "steps", stepId));
      if (!snapshot.exists()) return null;
      const data = snapshot.data();
      return {
        taskId: data.taskId as string,
        parentStepId: (data.parentStepId as string | null) ?? undefined,
        status: data.status as Step["status"],
      };
    },
    [db],
  );

  /**
   * Promote parent steps to done when all of their substeps are done.
   * This only auto-completes upward and never auto-resets statuses.
   *
   * Algorithm: Walk up the parent chain from the starting step. At each level,
   * check if all sibling substeps are done. If so, mark the parent done and
   * continue to the next parent. Stop when reaching a parent with incomplete
   * children or the root (no parentStepId).
   *
   * Side effects: Updates step status and updatedAt timestamp in Firestore.
   */
  const completeAncestorStepsIfReady = useCallback(
    async (startingStepId?: string) => {
      let currentStepId = startingStepId;

      while (currentStepId) {
        const stepSnapshot = await getDoc(doc(db, "steps", currentStepId));
        if (!stepSnapshot.exists()) return;
        const stepData = stepSnapshot.data();

        const childrenSnapshot = await getDocs(
          query(stepsCollection(db), where("parentStepId", "==", currentStepId)),
        );
        if (childrenSnapshot.empty) return;

        const allChildrenDone = childrenSnapshot.docs.every(
          (child) => child.data().status === "done",
        );
        // If any sibling is incomplete, stop the cascade (don't auto-complete parent)
        if (!allChildrenDone) return;

        if (stepData.status !== "done") {
          await updateDoc(doc(db, "steps", currentStepId), {
            status: "done",
            updatedAt: new Date().toISOString(),
          });
        }

        currentStepId = (stepData.parentStepId as string | null) ?? undefined;
      }
    },
    [db],
  );

  /**
   * Mark a task as done when all of its steps are done (if it has any).
   *
   * This mirrors the step auto-completion logic but operates at the task level.
   * Only tasks with at least one step are auto-completed; tasks without steps
   * must be marked done manually.
   */
  const completeTaskIfReady = useCallback(
    async (taskId: string) => {
      const stepsSnapshot = await getDocs(
        query(stepsCollection(db), where("taskId", "==", taskId)),
      );
      if (stepsSnapshot.empty) return;

      const allStepsDone = stepsSnapshot.docs.every((step) => step.data().status === "done");
      if (!allStepsDone) return;

      const taskSnapshot = await getDoc(doc(db, "tasks", taskId));
      if (!taskSnapshot.exists()) return;
      const taskData = taskSnapshot.data();
      if (taskData.status === "done") return;

      await updateDoc(doc(db, "tasks", taskId), {
        status: "done",
        updatedAt: new Date().toISOString(),
      });
    },
    [db],
  );

  const updateStep = useCallback(
    async (id: string, input: UpdateStepInput) => {
      ensureUserId();
      const now = new Date().toISOString();
      // Capture the old parent before updating, so we can cascade completion
      // checks for both the old and new parent hierarchies.
      const previousStep = state.steps.find((step) => step.id === id);
      const previousParentId = previousStep?.parentStepId;
      const data: Record<string, unknown> = { updatedAt: now };
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description ?? null;
      if (input.status !== undefined) data.status = input.status;
      if (input.order !== undefined) data.order = input.order;
      if (input.parentStepId !== undefined) data.parentStepId = input.parentStepId ?? null;
      if (input.dueDate !== undefined) data.dueDate = input.dueDate ?? null;
      await updateDoc(doc(db, "steps", id), data);
      const currentStep = await readStepMetadata(id);
      if (currentStep) {
        await completeAncestorStepsIfReady(currentStep.parentStepId);
        // When parent changes, check completion for BOTH hierarchies:
        // 1. New parent chain (current.parentStepId) might now be completable
        // 2. Old parent chain (previousParentId) might now be incomplete
        if (previousParentId && previousParentId !== currentStep.parentStepId) {
          await completeAncestorStepsIfReady(previousParentId);
        }
        await completeTaskIfReady(currentStep.taskId);
      }
      await refreshState();
    },
    [
      db,
      ensureUserId,
      refreshState,
      state.steps,
      readStepMetadata,
      completeAncestorStepsIfReady,
      completeTaskIfReady,
    ],
  );

  const deleteStep = useCallback(
    async (id: string) => {
      ensureUserId();
      await deleteStepWithChildren(db, id);
      await refreshState();
    },
    [db, ensureUserId, refreshState],
  );

  const createWorkLog = useCallback(
    async (input: CreateWorkLogInput) => {
      const uid = ensureUserId();
      const now = new Date().toISOString();
      const timestamp = input.timestamp ?? now;
      await addDoc(workLogsCollection(db), {
        userId: uid,
        taskId: input.taskId,
        stepId: input.stepId ?? null,
        message: input.message ?? null,
        tags: input.tags ?? [],
        type: input.type,
        timestamp,
        durationMinutes: input.durationMinutes ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await refreshState();
    },
    [db, ensureUserId, refreshState],
  );

  const updateWorkLog = useCallback(
    async (id: string, input: UpdateWorkLogInput) => {
      ensureUserId();
      const now = new Date().toISOString();
      const data: Record<string, unknown> = { updatedAt: now };
      if (input.message !== undefined) data.message = input.message ?? null;
      if (input.tags !== undefined) data.tags = input.tags ?? [];
      if (input.type !== undefined) data.type = input.type;
      if (input.timestamp !== undefined) data.timestamp = input.timestamp;
      if (input.durationMinutes !== undefined) data.durationMinutes = input.durationMinutes ?? null;
      if (input.stepId !== undefined) data.stepId = input.stepId ?? null;
      await updateDoc(doc(db, "workLogs", id), data);
      await refreshState();
    },
    [db, ensureUserId, refreshState],
  );

  const deleteWorkLog = useCallback(
    async (id: string) => {
      ensureUserId();
      await deleteDoc(doc(db, "workLogs", id));
      await refreshState();
    },
    [db, ensureUserId, refreshState],
  );

  return {
    ...state,
    isHydrated,
    createTask,
    updateTask,
    deleteTask,
    createStep,
    updateStep,
    deleteStep,
    createWorkLog,
    updateWorkLog,
    deleteWorkLog,
    refresh: refreshState,
  };
};
