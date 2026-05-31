/**
 * Handoff v2 wire contract for team execution assignments.
 * Mirror: schemas/agent-orchestration/handoff.v2.json
 * Stored on kit_team_assignments.handoff when schemaVersion === 2.
 */

export const TEAM_EXECUTION_HANDOFF_SCHEMA_VERSION = 2 as const;

export type HandoffV2Status = "completed" | "blocked" | "partial" | "failed" | "needs_review";

export type HandoffV2CommandRunStatus = "passed" | "failed" | "skipped" | "not_run";

export type HandoffV2AcceptanceCriterionStatus = "passed" | "failed" | "partial" | "not_applicable";

export type HandoffV2Severity = "low" | "medium" | "high" | "critical";

export type HandoffV2FileChange = {
  path: string;
  reason?: string;
};

export type HandoffV2CommandRun = {
  command: string;
  status: HandoffV2CommandRunStatus;
  summary?: string;
};

export type HandoffV2AcceptanceCriterion = {
  criterion: string;
  status: HandoffV2AcceptanceCriterionStatus;
  evidence?: string;
};

export type HandoffV2Blocker = {
  summary: string;
  taskId?: string;
  severity?: HandoffV2Severity;
};

export type HandoffV2Risk = {
  risk: string;
  severity: HandoffV2Severity;
  recommendation?: string;
};

export type TeamExecutionHandoffV2 = {
  schemaVersion: typeof TEAM_EXECUTION_HANDOFF_SCHEMA_VERSION;
  assignmentId: string;
  agentId: string;
  agentDefinitionId?: string;
  status: HandoffV2Status;
  summary: string;
  filesChanged?: HandoffV2FileChange[];
  commandsRun?: HandoffV2CommandRun[];
  acceptanceCriteria?: HandoffV2AcceptanceCriterion[];
  evidenceRefs: string[];
  blockers?: HandoffV2Blocker[];
  risks?: HandoffV2Risk[];
  nextRecommendedAction?: string;
};
