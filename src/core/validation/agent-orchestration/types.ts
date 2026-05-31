import type { AgentActivityV1 } from "../../../contracts/agent-activity.v1.js";
import type { AgentDefinitionV1 } from "../../../contracts/agent-orchestration.js";
import type { AgentSessionV1 } from "../../../contracts/agent-session.v1.js";
import type { TeamAssignmentMetadataV1 } from "../../../contracts/team-execution-assignment-metadata.v1.js";
import type { TeamExecutionHandoffV2 } from "../../../contracts/team-execution-handoff.v2.js";

/** Stable codes from AGENT_ORCHESTRATION_CONTRACTS.md §8.2. */
export const ORCHESTRATION_VALIDATION_CODES = [
  "invalid-orchestration-schema",
  "unknown-orchestration-field",
  "invalid-orchestration-enum",
  "missing-required-orchestration-field",
  "invalid-handoff-schema-version",
  "handoff-v2-missing-field",
  "unknown-capability"
] as const;

export type OrchestrationValidationCode = (typeof ORCHESTRATION_VALIDATION_CODES)[number];

export type OrchestrationValidationIssue = {
  code: OrchestrationValidationCode;
  path: string;
  message: string;
  severity: "error" | "warning";
};

export type OrchestrationValidationOptions = {
  /** When true, apply extra strict checks beyond JSON Schema (e.g. recommended ownedPaths). */
  strict?: boolean;
};

export type OrchestrationValidationSuccess<T> = {
  ok: true;
  data: T;
  warnings?: OrchestrationValidationIssue[];
};

export type OrchestrationValidationFailure = {
  ok: false;
  code: OrchestrationValidationCode;
  message: string;
  issues: OrchestrationValidationIssue[];
};

export type OrchestrationValidationResult<T> =
  | OrchestrationValidationSuccess<T>
  | OrchestrationValidationFailure;

export type AgentDefinitionValidationResult = OrchestrationValidationResult<AgentDefinitionV1>;
export type AgentSessionValidationResult = OrchestrationValidationResult<AgentSessionV1>;
export type AssignmentMetadataValidationResult = OrchestrationValidationResult<TeamAssignmentMetadataV1>;
export type AgentActivityValidationResult = OrchestrationValidationResult<AgentActivityV1>;
export type HandoffV2ValidationResult = OrchestrationValidationResult<TeamExecutionHandoffV2>;
