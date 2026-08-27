"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { normalizeDayKey } from "../lib/dates";
import { firebaseApp } from "../lib/firebaseClient";
import { useAuth } from "./useAuth";

type TaskStoreState = TaskStoreSnapshot;

const defaultState: TaskStoreState = {
  tasks: [],
  steps: [],
  workLogs: [],
};

/**
 * Firestore's writeBatch rejects past 500 operations. A cascade delete is unbounded by nature — a
 * task tracked for a year has more than 500 work logs — so every batch here is chunked. The old
 * code committed one batch of everything, which meant a long-lived task could not be deleted at all
 * and said nothing about why.
 */
const BATCH_LIMIT = 400;

// Normalize Firestore optional arrays so callers can treat "empty" as undefined.
const normalizeArray = <T,>(value?: T[] | null) => (value && value.length > 0 ? value : undefined);

/** Due dates are calendar days. Documents from the previous build hold a UTC instant instead. */
const normalizeDueDate = (value?: string | null) => {
  if (!value) return undefined;
  return normalizeDayKey(value) || undefined;
};

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
    dueDate: normalizeDueDate(data.dueDate),
  };
};

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
    dueDate: normalizeDueDate(data.dueDate),
  };
};

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

/** Delete documents in batches small enough to commit. */
const deleteAll = async (db: Firestore, refs: Array<{ id: string; path: string }>) => {
  for (let index = 0; index < refs.length; index += BATCH_LIMIT) {
    const chunk = refs.slice(index, index + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((ref) => batch.delete(doc(db, ref.path, ref.id)));
    await batch.commit();
  }
};

const deleteWorkLogsWhere = async (db: Firestore, field: "taskId" | "stepId", value: string) => {
  const snapshot = await getDocs(query(workLogsCollection(db), where(field, "==", value)));
  if (snapshot.empty) return;
  await deleteAll(
    db,
    snapshot.docs.map((docSnap) => ({ id: docSnap.id, path: "workLogs" })),
  );
};

/**
 * Delete a step subtree depth-first, so children and their logs go before their parent.
 *
 * `visited` is not defensive decoration. `parentStepId` is a plain string field with nothing
 * enforcing acyclicity, and a cycle (A parents B, B parents A) sent the old version into unbounded
 * recursion: the tab froze and Firestore reads climbed until the quota stopped them. Skipping an
 * already-seen id turns that into a terminating, if incomplete, delete.
 */
const deleteStepWithChildren = async (
  db: Firestore,
  stepId: string,
  visited: Set<string> = new Set(),
) => {
  if (visited.has(stepId)) return;
  visited.add(stepId);

  const childSnapshot = await getDocs(
    query(stepsCollection(db), where("parentStepId", "==", stepId)),
  );
  for (const child of childSnapshot.docs) {
    await deleteStepWithChildren(db, child.id, visited);
  }
  await deleteWorkLogsWhere(db, "stepId", stepId);
  await deleteDoc(doc(db, "steps", stepId));
};

export type TaskStore = TaskStoreState & {
  isHydrated: boolean;
  /** Set when the snapshot could not be read. The UI must say so rather than render an empty account. */
  loadError: string | null;
  createTask: (input: CreateTaskInput) => Promise<void>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  createStep: (input: CreateStepInput) => Promise<void>;
  updateStep: (id: string, input: UpdateStepInput) => Promise<void>;
  updateStepOrders: (updates: Array<{ id: string; order: number }>) => Promise<void>;
  deleteStep: (id: string) => Promise<void>;
  createWorkLog: (input: CreateWorkLogInput) => Promise<void>;
  updateWorkLog: (id: string, input: UpdateWorkLogInput) => Promise<void>;
  deleteWorkLog: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * The store implementation. Not exported: every consumer goes through the context below.
 *
 * Calling this hook directly from each page — which is what the app used to do — gives every route
 * its own copy of the data and its own three Firestore queries, so navigating re-reads everything
 * and two mounted consumers can hold different snapshots of the same account. One provider at the
 * root fixes both, and it is what lets the app chrome write (the global Stop button needs the store
 * from outside any page).
 */
const useTaskStoreState = (): TaskStore => {
  const { user } = useAuth();
  const [state, setState] = useState<TaskStoreState>(defaultState);
  const [isHydrated, setIsHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const db = useMemo(() => getFirestore(firebaseApp), []);

  /**
   * Guards against an older snapshot landing after a newer one.
   *
   * Two writes in flight produce two refreshes, and nothing guarantees they resolve in order. With
   * no realtime listener to correct it afterwards, a late-arriving stale snapshot silently reverts
   * the screen to pre-write data and stays there until the next write. Only the highest sequence
   * number is allowed to reach state.
   */
  const requestSequence = useRef(0);
  const appliedSequence = useRef(0);

  const ensureUserId = useCallback(() => {
    if (!user) {
      throw new Error("Devi essere autenticato.");
    }
    return user.uid;
  }, [user]);

  const applySnapshot = useCallback((snapshot: TaskStoreSnapshot, sequence: number) => {
    if (sequence < appliedSequence.current) return;
    appliedSequence.current = sequence;
    setState(snapshot);
  }, []);

  const refreshState = useCallback(async () => {
    if (!user) {
      setState(defaultState);
      return;
    }
    const sequence = (requestSequence.current += 1);
    try {
      const snapshot = await fetchTaskStoreSnapshot(db, user.uid);
      applySnapshot(snapshot, sequence);
      setLoadError(null);
    } catch (error) {
      // Surfaced, not swallowed: without a server tier nothing else will notice.
      setLoadError(
        error instanceof Error ? error.message : "Impossibile rileggere i dati.",
      );
      throw error;
    }
  }, [applySnapshot, db, user]);

  useEffect(() => {
    let active = true;
    if (!user) {
      setState(defaultState);
      setLoadError(null);
      setIsHydrated(true);
      return () => {
        active = false;
      };
    }

    setIsHydrated(false);
    setLoadError(null);
    const sequence = (requestSequence.current += 1);

    fetchTaskStoreSnapshot(db, user.uid)
      .then((snapshot) => {
        if (!active) return;
        applySnapshot(snapshot, sequence);
      })
      .catch((error: unknown) => {
        if (!active) return;
        // The old version had no catch at all: a rejected read left the store empty and marked
        // hydrated, so a connectivity failure rendered as "you have no tasks" — indistinguishable
        // from a genuinely empty account, and quietly wrong.
        setLoadError(
          error instanceof Error ? error.message : "Impossibile leggere i dati dell'account.",
        );
      })
      .finally(() => {
        if (active) setIsHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [applySnapshot, db, user]);

  const createTask = useCallback(
    async (input: CreateTaskInput) => {
      const uid = ensureUserId();
      const now = new Date().toISOString();
      await addDoc(tasksCollection(db), {
        userId: uid,
        title: input.title,
        // undefined is omitted by Firestore; null is stored. Optional fields are written explicitly
        // so "cleared" and "never set" look the same on read.
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
      // Presence of the KEY decides whether a field is written; its value decides what to write.
      // Testing `!== undefined` instead made every "svuota il campo" edit a silent no-op: callers
      // express a cleared control as `{ dueDate: undefined }` — a key that is present but carries no
      // value — and that was indistinguishable from never mentioning the field at all. The modal
      // reported a successful save and the old value was still there afterwards.
      // See UpdatePayload in src/lib/types.ts.
      const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if ("title" in input) data.title = input.title;
      if ("description" in input) data.description = input.description ?? null;
      if ("status" in input) data.status = input.status;
      if ("priority" in input) data.priority = input.priority ?? null;
      if ("tags" in input) data.tags = input.tags ?? [];
      if ("dueDate" in input) data.dueDate = input.dueDate ?? null;
      await updateDoc(doc(db, "tasks", id), data);
      await refreshState();
    },
    [db, ensureUserId, refreshState],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      ensureUserId();
      // Children first, root last. Any order can fail halfway without transactions; this one at
      // least never leaves steps and logs stranded under a task that no longer exists, because the
      // task document is the last thing to go.
      await deleteWorkLogsWhere(db, "taskId", id);
      const stepSnapshot = await getDocs(query(stepsCollection(db), where("taskId", "==", id)));
      const visited = new Set<string>();
      for (const step of stepSnapshot.docs) {
        await deleteStepWithChildren(db, step.id, visited);
      }
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
   * Promote parent steps to done once every substep is done. Only ever upward, never a reset.
   *
   * The `visited` set terminates a `parentStepId` cycle. Without it the while-loop below never
   * exits, hanging the tab and issuing Firestore reads until something else stops it.
   */
  const completeAncestorStepsIfReady = useCallback(
    async (startingStepId?: string) => {
      let currentStepId = startingStepId;
      const visited = new Set<string>();

      while (currentStepId && !visited.has(currentStepId)) {
        visited.add(currentStepId);

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

  /** Mark a task done once all of its steps are. Tasks with no steps are always closed by hand. */
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
      if (taskSnapshot.data().status === "done") return;

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
      // Read the previous parent from Firestore rather than from the React snapshot: the snapshot
      // can be a refresh behind, and a stale parent id sends the completion cascade up the wrong
      // branch.
      const previousStep = await readStepMetadata(id);
      const previousParentId = previousStep?.parentStepId;

      // Key-presence semantics, as in updateTask. This is also what lets a substep be promoted back
      // to top level: the edit form sends `{ parentStepId: undefined }` for "Step principale", which
      // the old guard skipped, so the step stayed nested however the user set the control.
      const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if ("title" in input) data.title = input.title;
      if ("description" in input) data.description = input.description ?? null;
      if ("status" in input) data.status = input.status;
      if ("order" in input) data.order = input.order;
      if ("parentStepId" in input) data.parentStepId = input.parentStepId ?? null;
      if ("dueDate" in input) data.dueDate = input.dueDate ?? null;
      await updateDoc(doc(db, "steps", id), data);

      const currentStep = await readStepMetadata(id);
      if (currentStep) {
        await completeAncestorStepsIfReady(currentStep.parentStepId);
        // A move touches two hierarchies: the new parent may now be completable, and the old one
        // may not be any more.
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
      readStepMetadata,
      completeAncestorStepsIfReady,
      completeTaskIfReady,
    ],
  );

  const updateStepOrders = useCallback(
    async (updates: Array<{ id: string; order: number }>) => {
      ensureUserId();
      if (updates.length === 0) return;
      const now = new Date().toISOString();
      for (let index = 0; index < updates.length; index += BATCH_LIMIT) {
        const chunk = updates.slice(index, index + BATCH_LIMIT);
        const batch = writeBatch(db);
        chunk.forEach(({ id, order }) => {
          batch.update(doc(db, "steps", id), { order, updatedAt: now });
        });
        await batch.commit();
      }
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
      await addDoc(workLogsCollection(db), {
        userId: uid,
        taskId: input.taskId,
        stepId: input.stepId ?? null,
        message: input.message ?? null,
        tags: input.tags ?? [],
        type: input.type,
        timestamp: input.timestamp ?? now,
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
      // Key-presence semantics, as in updateTask. Without it a work log could never be detached
      // from its step, nor its message emptied.
      const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if ("message" in input) data.message = input.message ?? null;
      if ("tags" in input) data.tags = input.tags ?? [];
      if ("type" in input) data.type = input.type;
      if ("timestamp" in input) data.timestamp = input.timestamp;
      if ("durationMinutes" in input) data.durationMinutes = input.durationMinutes ?? null;
      if ("stepId" in input) data.stepId = input.stepId ?? null;
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
    loadError,
    createTask,
    updateTask,
    deleteTask,
    createStep,
    updateStep,
    updateStepOrders,
    deleteStep,
    createWorkLog,
    updateWorkLog,
    deleteWorkLog,
    refresh: refreshState,
  };
};

const TaskStoreContext = createContext<TaskStore | null>(null);

export const TaskStoreProvider = ({ children }: { children: ReactNode }) => {
  const store = useTaskStoreState();
  return <TaskStoreContext.Provider value={store}>{children}</TaskStoreContext.Provider>;
};

export const useTaskStore = (): TaskStore => {
  const store = useContext(TaskStoreContext);
  if (!store) {
    throw new Error("useTaskStore must be used within a TaskStoreProvider.");
  }
  return store;
};
