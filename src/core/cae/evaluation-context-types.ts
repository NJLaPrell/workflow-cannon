/**
 * TypeScript mirrors of `schemas/cae/evaluation-context.v1.json` (T842).
 * Builder: `evaluation-context-builder.ts` (T859).
 */

export type CaeTaskStatus =
  | "proposed"
  | "ready"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

/** Allowlisted `task.metadata` keys only — reject unknowns at build time. */
export type CaeTaskMetadataAllowlisted = {
  specPath?: string;
  caePhase?: string;
  phaseProgram?: string;
  programContextPath?: string;
  risk?: "low" | "medium" | "high";
};

export type CaeEvaluationContextTask = {
  taskId: string;
  status: CaeTaskStatus;
  phaseKey: string;
  title?: string;
  tags?: string[];
  features?: string[];
  metadata?: CaeTaskMetadataAllowlisted;
};

export type CaeEvaluationContextCommand = {
  name: string;
  moduleId?: string;
  argvSummary?: string;
};

export type CaeEvaluationContextWorkspace = {
  currentKitPhase: string;
  nextKitPhase?: string | null;
  workspaceRootFingerprint?: string;
};

export type CaeEvaluationContextGovernance = {
  policyApprovalRequired: boolean;
  approvalTierHint: "none" | "A" | "B" | "C";
  policySurface?: string;
};

export type CaeEvaluationContextQueue = {
  readyQueueDepth: number;
  suggestedNextTaskId?: string | null;
};

/** v1 evaluation context payload (normative shape). */
export type CaeEvaluationContext = {
  schemaVersion: 1;
  task: CaeEvaluationContextTask;
  command: CaeEvaluationContextCommand;
  workspace: CaeEvaluationContextWorkspace;
  governance: CaeEvaluationContextGovernance;
  queue: CaeEvaluationContextQueue;
  mapSignals: null;
};
