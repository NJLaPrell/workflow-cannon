export type TaskStatus =
  | "proposed"
  | "ready"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export type TaskPriority = "P1" | "P2" | "P3";

export type TaskEntity = {
  id: string;
  status: TaskStatus;
  type: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  archivedAt?: string;
  priority?: TaskPriority;
  dependsOn?: string[];
  unblocks?: string[];
  phase?: string;
  metadata?: Record<string, unknown>;
  ownership?: string;
  approach?: string;
  technicalScope?: string[];
  acceptanceCriteria?: string[];
};

export type GuardResult = {
  allowed: boolean;
  guardName: string;
  code?: string;
  message?: string;
};

export type TransitionContext = {
  allTasks: TaskEntity[];
  timestamp: string;
  actor?: string;
};

export type TransitionGuard = {
  name: string;
  canTransition: (
    task: TaskEntity,
    targetState: TaskStatus,
    context: TransitionContext
  ) => GuardResult;
};

export type TransitionEvidence = {
  transitionId: string;
  taskId: string;
  fromState: TaskStatus;
  toState: TaskStatus;
  action: string;
  guardResults: GuardResult[];
  dependentsUnblocked: string[];
  timestamp: string;
  actor?: string;
};

export type TaskStoreDocument = {
  schemaVersion: 1;
  tasks: TaskEntity[];
  transitionLog: TransitionEvidence[];
  mutationLog?: TaskMutationEvidence[];
  lastUpdated: string;
};

export type TaskMutationType =
  | "create-task"
  | "update-task"
  | "archive-task"
  | "add-dependency"
  | "remove-dependency"
  | "create-task-from-plan";

export type TaskMutationEvidence = {
  mutationId: string;
  mutationType: TaskMutationType;
  taskId: string;
  timestamp: string;
  actor?: string;
  details?: Record<string, unknown>;
};

import type { TaskEngineErrorCode as _TaskEngineErrorCode } from "../../core/error-codes.js";

export type TaskEngineErrorCode = _TaskEngineErrorCode;

export type TaskEngineError = {
  code: TaskEngineErrorCode;
  message: string;
};

export type TaskAdapter = {
  name: string;
  supports: () => TaskAdapterCapability[];
  load: () => Promise<TaskEntity[]>;
  save?: (tasks: TaskEntity[]) => Promise<void>;
};

export type TaskAdapterCapability = "read" | "write" | "watch";

export type NextActionSuggestion = {
  readyQueue: TaskEntity[];
  suggestedNext: TaskEntity | null;
  stateSummary: {
    proposed: number;
    ready: number;
    in_progress: number;
    blocked: number;
    completed: number;
    cancelled: number;
    total: number;
  };
  blockingAnalysis: BlockingAnalysisEntry[];
};

export type BlockingAnalysisEntry = {
  taskId: string;
  blockedBy: string[];
  blockingCount: number;
};
