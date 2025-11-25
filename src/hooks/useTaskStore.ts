import { useCallback, useEffect, useState } from "react";
import type { Step, Task, WorkLog } from "../lib/types";
import {
  createStepAction,
  createTaskAction,
  createWorkLogAction,
  deleteStepAction,
  deleteTaskAction,
  deleteWorkLogAction,
  getTaskStoreSnapshot,
  updateStepAction,
  updateTaskAction,
  updateWorkLogAction,
  type CreateStepInput,
  type CreateTaskInput,
  type CreateWorkLogInput,
  type UpdateStepInput,
  type UpdateTaskInput,
  type UpdateWorkLogInput,
} from "../app/actions/taskActions";

type TaskStoreState = {
  tasks: Task[];
  steps: Step[];
  workLogs: WorkLog[];
};

const defaultState: TaskStoreState = {
  tasks: [],
  steps: [],
  workLogs: [],
};

export const useTaskStore = () => {
  const [state, setState] = useState<TaskStoreState>(defaultState);
  const [isHydrated, setIsHydrated] = useState(false);

  const refreshState = useCallback(async () => {
    const snapshot = await getTaskStoreSnapshot();
    setState(snapshot);
  }, []);

  useEffect(() => {
    let active = true;
    getTaskStoreSnapshot()
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
  }, []);

  const createTask = useCallback(
    async (input: CreateTaskInput) => {
      const task = await createTaskAction(input);
      await refreshState();
      return task;
    },
    [refreshState],
  );

  const updateTask = useCallback(
    async (id: string, input: UpdateTaskInput) => {
      const task = await updateTaskAction(id, input);
      await refreshState();
      return task;
    },
    [refreshState],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await deleteTaskAction(id);
      await refreshState();
    },
    [refreshState],
  );

  const createStep = useCallback(
    async (input: CreateStepInput) => {
      const step = await createStepAction(input);
      await refreshState();
      return step;
    },
    [refreshState],
  );

  const updateStep = useCallback(
    async (id: string, input: UpdateStepInput) => {
      const step = await updateStepAction(id, input);
      await refreshState();
      return step;
    },
    [refreshState],
  );

  const deleteStep = useCallback(
    async (id: string) => {
      await deleteStepAction(id);
      await refreshState();
    },
    [refreshState],
  );

  const createWorkLog = useCallback(
    async (input: CreateWorkLogInput) => {
      const log = await createWorkLogAction(input);
      await refreshState();
      return log;
    },
    [refreshState],
  );

  const updateWorkLog = useCallback(
    async (id: string, input: UpdateWorkLogInput) => {
      const log = await updateWorkLogAction(id, input);
      await refreshState();
      return log;
    },
    [refreshState],
  );

  const deleteWorkLog = useCallback(
    async (id: string) => {
      await deleteWorkLogAction(id);
      await refreshState();
    },
    [refreshState],
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
