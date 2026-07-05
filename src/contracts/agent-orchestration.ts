/**
 * Shared orchestration contract enums, profile refs, and AgentDefinition v1.
 * Mirror: schemas/agent-orchestration/agent-definition.v1.json
 */

export const AGENT_DEFINITION_SCHEMA_VERSION = 1 as const;

export type AgentDefinitionRole =
  | "orchestrator"
  | "task_worker"
  | "reviewer"
  | "validator"
  | "supervisor"
  | "manual"
  | "unknown";

export type AgentHostHint =
  | "cursor"
  | "vscode"
  | "cli"
  | "codex"
  | "mcp"
  | "service"
  | "manual"
  | "unknown";

/** Known capability vocabulary (A-SCHEMA §2.4); validators accept unknown strings in v1 bridge. */
export const AGENT_CAPABILITY_VOCABULARY = [
  "read_context",
  "edit_files",
  "edit_owned_files",
  "run_commands",
  "run_allowed_commands",
  "submit_handoff",
  "report_activity",
  "receive_assignment",
  "record_subagent_session",
  "spawn_subagents",
  "open_pr",
  "read_git_diff",
  "write_task_state",
  "open_blocking_task",
  "open_bug_report",
  "stream_activity"
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITY_VOCABULARY)[number] | string;

/** Profile catalog reference (A-PROFILES). Pattern: ^[a-z][a-z0-9_]*$ */
export type OrchestrationProfileId = string;

export const ORCHESTRATION_ACCESS_PROFILE_IDS = [
  "orchestrator_access_v1",
  "task_worker_strict_v1"
] as const;

export type KnownOrchestrationAccessProfileId = (typeof ORCHESTRATION_ACCESS_PROFILE_IDS)[number];

export const ORCHESTRATION_CONTEXT_PROFILE_IDS = [
  "orchestrator_context_v1",
  "task_worker_context_v1"
] as const;

export type KnownOrchestrationContextProfileId = (typeof ORCHESTRATION_CONTEXT_PROFILE_IDS)[number];

export const ORCHESTRATION_MODEL_PROFILE_IDS = [
  "high_reasoning_or_balanced_v1",
  "balanced_or_cheaper_v1"
] as const;

export type KnownOrchestrationModelProfileId = (typeof ORCHESTRATION_MODEL_PROFILE_IDS)[number];

export type AgentModelTier =
  | "cheap_fast"
  | "balanced"
  | "high_reasoning"
  | "specialist"
  | "human_review";

export type TeamAssignmentStatus =
  | "assigned"
  | "submitted"
  | "blocked"
  | "reconciled"
  | "cancelled";

export type AgentDefinitionV1 = {
  agentDefinitionId: string;
  displayName: string;
  description: string;
  role: AgentDefinitionRole;
  hostCompatibility: [AgentHostHint, ...AgentHostHint[]];
  requiredCapabilities: string[];
  optionalCapabilities: string[];
  allowedCommands: string[];
  accessProfileId: string;
  contextProfileId: string;
  modelProfileId: string;
  handoffContractId: string;
  activityContractId: string;
  metadata?: Record<string, unknown>;
  retired: boolean;
  version: typeof AGENT_DEFINITION_SCHEMA_VERSION;
};
