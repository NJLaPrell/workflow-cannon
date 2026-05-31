/**
 * TeamAssignment structured metadata v1 (AgentAssignmentMetadata).
 * Mirror: schemas/agent-orchestration/assignment-metadata.v1.json
 * Stored on kit_team_assignments.metadata when schemaVersion === 1.
 */

import type { AgentModelTier } from "./agent-orchestration.js";

export const TEAM_ASSIGNMENT_METADATA_SCHEMA_VERSION = 1 as const;

export type TeamAssignmentResourceScope = {
  ownedPaths?: string[];
  readOnlyPaths?: string[];
  sharedPaths?: string[];
  forbiddenPaths?: string[];
  requiresApprovalPaths?: string[];
};

export type TeamAssignmentLockScope = {
  tasks?: string[];
  modules?: string[];
  commands?: string[];
};

export type TeamAssignmentMetadataV1 = {
  schemaVersion: typeof TEAM_ASSIGNMENT_METADATA_SCHEMA_VERSION;
  agentDefinitionId: string;
  agentSessionId?: string;
  modelTier?: AgentModelTier;
  contextProfileId: string;
  accessProfileId: string;
  handoffContractId: string;
  ownedPaths?: string[];
  forbiddenPaths?: string[];
  sharedPaths?: string[];
  requiresApprovalPaths?: string[];
  assignmentPromptSummary?: string;
  blockingPolicy?: string;
  resources?: TeamAssignmentResourceScope;
  lockScope?: TeamAssignmentLockScope;
};
