import type {
  TaskEntity,
  TaskMutationType,
  TaskStatus,
  TransitionEvidence
} from "../types.js";
import type { TaskStateEventEnvelopeV1 } from "./types.js";

/** Discriminated event kinds for Phase 114 S1.2 (lifecycle + mutations). */
export type TaskStateEventKindV1 =
  | "task.created"
  | "task.updated"
  | "task.transitioned"
  | "task.batch_applied";

export type TaskCreatedPayloadV1 = {
  taskId: string;
  initialStatus: TaskStatus;
  title: string;
  type: string;
};

export type TaskUpdatedPayloadV1 = {
  taskId: string;
  /** Stable paths or field keys touched (matches update-task semantics). */
  changedFields: string[];
  /** Optional digest of the update argv for idempotency audits. */
  payloadDigest?: string;
  /** Optional field values applied on replay (subset of TaskEntity). */
  values?: Partial<
    Pick<
      TaskEntity,
      | "title"
      | "type"
      | "status"
      | "priority"
      | "phase"
      | "phaseKey"
      | "summary"
      | "description"
      | "risk"
      | "approach"
      | "archived"
      | "archivedAt"
      | "dependsOn"
      | "unblocks"
      | "technicalScope"
      | "acceptanceCriteria"
      | "features"
      | "ownership"
    >
  > & {
    metadata?: Record<string, unknown>;
  };
};

export type TaskTransitionedPayloadV1 = {
  taskId: string;
  fromState: TaskStatus;
  toState: TaskStatus;
  action: string;
  transitionId: string;
  guardResults: TransitionEvidence["guardResults"];
  dependentsUnblocked: string[];
  payloadDigest?: string;
};

export type TaskBatchAppliedPayloadV1 = {
  batchId?: string;
  appliedCount: number;
  transitionIds: string[];
  taskIds: string[];
};

export type TaskStateEventPayloadV1 =
  | TaskCreatedPayloadV1
  | TaskUpdatedPayloadV1
  | TaskTransitionedPayloadV1
  | TaskBatchAppliedPayloadV1;

/** Full canonical event: envelope fields + kind + payload. */
export type TaskStateEventV1 = TaskStateEventEnvelopeV1 & {
  kind: TaskStateEventKindV1;
  payload: TaskStateEventPayloadV1;
};

export function transitionEvidenceToTransitionedPayload(
  evidence: TransitionEvidence
): TaskTransitionedPayloadV1 {
  return {
    taskId: evidence.taskId,
    fromState: evidence.fromState,
    toState: evidence.toState,
    action: evidence.action,
    transitionId: evidence.transitionId,
    guardResults: evidence.guardResults.map((guard) => ({
      allowed: guard.allowed,
      guardName: guard.guardName,
      ...(guard.message?.trim() ? { reason: guard.message.trim() } : {})
    })),
    dependentsUnblocked: evidence.dependentsUnblocked,
    payloadDigest: evidence.payloadDigest
  };
}

export function mutationTypeToEventKind(mutationType: TaskMutationType): TaskStateEventKindV1 | null {
  switch (mutationType) {
    case "create-task":
    case "create-task-from-plan":
      return "task.created";
    case "update-task":
      return "task.updated";
    default:
      return null;
  }
}
