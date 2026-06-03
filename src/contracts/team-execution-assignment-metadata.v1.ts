/**
 * TeamAssignment structured metadata v1 (AgentAssignmentMetadata).
 * Mirror: schemas/agent-orchestration/assignment-metadata.v1.json
 * Stored on kit_team_assignments.metadata when schemaVersion === 1.
 */

import type { AgentModelTier } from "./agent-orchestration.js";

export const TEAM_ASSIGNMENT_METADATA_SCHEMA_VERSION = 1 as const;

export const WORKER_PACKET_MODEL_TIER_LABELS = ["tier_1", "tier_2", "tier_3"] as const;

export type WorkerPacketModelTierLabel = (typeof WORKER_PACKET_MODEL_TIER_LABELS)[number];

export type WorkerPacketModelTierRecommendation = {
  label: WorkerPacketModelTierLabel;
  rationale: string;
};

export type TeamAssignmentValidationCommand = {
  command: string;
  rationale?: string;
  result?: string;
  exitCode?: number;
};

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
  modelTierRationale?: string;
  modelTierRecommendation?: WorkerPacketModelTierRecommendation;
  packetId?: string;
  packetDigest?: string;
  contextProfileId: string;
  accessProfileId: string;
  handoffContractId: string;
  ownedPaths?: string[];
  forbiddenPaths?: string[];
  sharedPaths?: string[];
  requiresApprovalPaths?: string[];
  assignmentPromptSummary?: string;
  blockingPolicy?: string;
  validationCommands?: TeamAssignmentValidationCommand[];
  resources?: TeamAssignmentResourceScope;
  lockScope?: TeamAssignmentLockScope;
};

/**
 * Additive response summary used by assignment lifecycle commands so callers
 * can quickly identify orchestration linkage without parsing full metadata.
 */
export type TeamAssignmentOrchestrationMetadataSummary = {
  schemaVersion: number;
  agentDefinitionId?: string;
  agentSessionId?: string;
  modelTier?: AgentModelTier;
  modelTierRationale?: string;
  modelTierRecommendation?: WorkerPacketModelTierRecommendation;
  packetId?: string;
  packetDigest?: string;
  contextProfileId?: string;
  accessProfileId?: string;
  handoffContractId?: string;
  assignmentPromptSummary?: string;
  blockingPolicy?: string;
  validationCommandCount: number;
  packetContextStatus?: "current" | "stale" | "missing";
  packetRegistryStatus?: "stored" | "missing";
  pathCounts: {
    ownedPaths: number;
    readOnlyPaths: number;
    sharedPaths: number;
    forbiddenPaths: number;
    requiresApprovalPaths: number;
  };
  lockCounts: {
    tasks: number;
    modules: number;
    commands: number;
  };
};
