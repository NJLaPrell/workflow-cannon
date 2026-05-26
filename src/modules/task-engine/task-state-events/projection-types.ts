import type {
  TaskEntity,
  TaskMutationEvidence,
  TaskStoreDocument,
  TransitionEvidence
} from "../types.js";

/** Monotonic per-task version after each applied event touching that task. */
export type TaskVersionRecordV1 = {
  taskId: string;
  version: number;
  eventId: string;
  sequence: number;
  recordedAt: string;
};

/** In-memory projection built by deterministic replay (no I/O). */
export type TaskStateProjectionV1 = {
  schemaVersion: 1;
  tasksById: Record<string, TaskEntity>;
  transitionLog: TransitionEvidence[];
  mutationLog: TaskMutationEvidence[];
  taskVersions: TaskVersionRecordV1[];
  lastEventSequence: number;
  lastUpdated: string;
};

export type TaskStateReplayResultV1 = {
  projection: TaskStateProjectionV1;
  document: TaskStoreDocument;
};

export type TaskStateApplierErrorCode =
  | "event-order-violation"
  | "duplicate-event-id"
  | "task-not-found"
  | "duplicate-task-id"
  | "invalid-event-kind"
  | "parent-sequence-mismatch";

export type TaskStateApplierError = {
  code: TaskStateApplierErrorCode;
  message: string;
  eventId?: string;
};
