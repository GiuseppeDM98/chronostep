"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { Step, Task, WorkLog } from "../../lib/types";

export type TaskStoreSnapshot = {
  tasks: Task[];
  steps: Step[];
  workLogs: WorkLog[];
};

export type CreateTaskInput = Omit<Task, "id" | "createdAt" | "updatedAt">;
export type UpdateTaskInput = Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>;

export type CreateStepInput = Omit<Step, "id" | "createdAt" | "updatedAt">;
export type UpdateStepInput = Partial<Omit<Step, "id" | "createdAt" | "updatedAt">>;

export type CreateWorkLogInput = Omit<WorkLog, "id" | "createdAt" | "updatedAt">;
export type UpdateWorkLogInput = Partial<Omit<WorkLog, "id" | "createdAt" | "updatedAt">>;

const serializeTags = (tags?: string[]) => {
  if (!tags || tags.length === 0) return null;
  return JSON.stringify(tags);
};

const deserializeTags = (raw?: string | null) => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : undefined;
  } catch {
    return raw.split(",").map((tag) => tag.trim());
  }
};

const dateOrNull = (value?: string) => (value ? new Date(value) : null);

const toTaskModel = (task: Prisma.TaskGetPayload<{}>): Task => ({
  id: task.id,
  title: task.title,
  description: task.description ?? undefined,
  status: task.status,
  priority: task.priority ?? undefined,
  tags: deserializeTags(task.tagsRaw),
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
  dueDate: task.dueDate ? task.dueDate.toISOString() : undefined,
});

const toStepModel = (step: Prisma.StepGetPayload<{}>): Step => ({
  id: step.id,
  taskId: step.taskId,
  parentStepId: step.parentStepId ?? undefined,
  title: step.title,
  status: step.status,
  order: step.order,
  createdAt: step.createdAt.toISOString(),
  updatedAt: step.updatedAt.toISOString(),
});

const toWorkLogModel = (log: Prisma.WorkLogGetPayload<{}>): WorkLog => ({
  id: log.id,
  taskId: log.taskId,
  stepId: log.stepId ?? undefined,
  message: log.message ?? undefined,
  type: log.type,
  timestamp: log.timestamp.toISOString(),
  durationMinutes: log.durationMinutes ?? undefined,
});

export const getTaskStoreSnapshot = async (): Promise<TaskStoreSnapshot> => {
  const [tasks, steps, workLogs] = await Promise.all([
    prisma.task.findMany(),
    prisma.step.findMany(),
    prisma.workLog.findMany({
      orderBy: {
        timestamp: "desc",
      },
    }),
  ]);

  return {
    tasks: tasks.map(toTaskModel),
    steps: steps.map(toStepModel),
    workLogs: workLogs.map(toWorkLogModel),
  };
};

export const createTaskAction = async (input: CreateTaskInput): Promise<Task> => {
  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      tagsRaw: serializeTags(input.tags),
      dueDate: dateOrNull(input.dueDate),
    },
  });
  return toTaskModel(task);
};

export const updateTaskAction = async (id: string, input: UpdateTaskInput): Promise<Task> => {
  const data: Prisma.TaskUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.status !== undefined) data.status = input.status;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.tags !== undefined) data.tagsRaw = serializeTags(input.tags);
  if (input.dueDate !== undefined) data.dueDate = dateOrNull(input.dueDate);

  const task = await prisma.task.update({
    where: { id },
    data,
  });
  return toTaskModel(task);
};

export const deleteTaskAction = async (id: string): Promise<void> => {
  await prisma.task.delete({
    where: { id },
  });
};

export const createStepAction = async (input: CreateStepInput): Promise<Step> => {
  const step = await prisma.step.create({
    data: {
      taskId: input.taskId,
      parentStepId: input.parentStepId ?? null,
      title: input.title,
      status: input.status,
      order: input.order,
    },
  });
  return toStepModel(step);
};

export const updateStepAction = async (id: string, input: UpdateStepInput): Promise<Step> => {
  const data: Prisma.StepUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.status !== undefined) data.status = input.status;
  if (input.order !== undefined) data.order = input.order;
  if (input.parentStepId !== undefined) data.parentStepId = input.parentStepId;

  const step = await prisma.step.update({
    where: { id },
    data,
  });
  return toStepModel(step);
};

export const deleteStepAction = async (id: string): Promise<void> => {
  await prisma.step.delete({
    where: { id },
  });
};

export const createWorkLogAction = async (input: CreateWorkLogInput): Promise<WorkLog> => {
  const timestamp = input.timestamp ? new Date(input.timestamp) : new Date();
  const log = await prisma.workLog.create({
    data: {
      taskId: input.taskId,
      stepId: input.stepId ?? null,
      message: input.message,
      type: input.type,
      timestamp,
      durationMinutes: input.durationMinutes ?? null,
    },
  });
  return toWorkLogModel(log);
};

export const updateWorkLogAction = async (
  id: string,
  input: UpdateWorkLogInput,
): Promise<WorkLog> => {
  const data: Prisma.WorkLogUpdateInput = {};
  if (input.message !== undefined) data.message = input.message;
  if (input.type !== undefined) data.type = input.type;
  if (input.timestamp !== undefined) data.timestamp = new Date(input.timestamp);
  if (input.durationMinutes !== undefined) data.durationMinutes = input.durationMinutes;
  if (input.stepId !== undefined) data.stepId = input.stepId ?? null;

  const log = await prisma.workLog.update({
    where: { id },
    data,
  });
  return toWorkLogModel(log);
};

export const deleteWorkLogAction = async (id: string): Promise<void> => {
  await prisma.workLog.delete({
    where: { id },
  });
};
