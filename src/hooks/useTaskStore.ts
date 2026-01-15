"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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
const normalizeArray = <T,>(value?: T[] | null) => (value && value.length > 0 ? value : undefined);

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
  };
};

// Map Firestore work log documents into the canonical WorkLog shape with safe defaults.
const toWorkLogModel = (docSnap: QueryDocumentSnapshot<DocumentData>): WorkLog => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    userId: data.userId,
    taskId: data.taskId,
    stepId: data.stepId ?? undefined,
    message: data.message ?? undefined,
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
  const ensureUserId = useCallback(() => {
    if (!user) {
      throw new Error("User is not authenticated.");
    }
    return user.uid;
  }, [user]);

  // Fetch and replace the entire in-memory snapshot after every write.
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
      // Keep referential integrity manually by removing logs and nested steps first.
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
        createdAt: now,
        updatedAt: now,
      });
      await refreshState();
    },
    [db, ensureUserId, refreshState],
  );

  const updateStep = useCallback(
    async (id: string, input: UpdateStepInput) => {
      ensureUserId();
      const now = new Date().toISOString();
      const data: Record<string, unknown> = { updatedAt: now };
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description ?? null;
      if (input.status !== undefined) data.status = input.status;
      if (input.order !== undefined) data.order = input.order;
      if (input.parentStepId !== undefined) data.parentStepId = input.parentStepId ?? null;
      await updateDoc(doc(db, "steps", id), data);
      await refreshState();
    },
    [db, ensureUserId, refreshState],
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
