/**
 * AgentActivity v1 wire contract.
 * Mirror: schemas/agent-orchestration/agent-activity.v1.json
 * Activity kinds align with DASHBOARD_AGENT_STATUS_KINDS in agent-activity-store.ts.
 */

import type { AgentHostHint, AgentModelTier } from "./agent-orchestration.js";

export const AGENT_ACTIVITY_SCHEMA_VERSION = 1 as const;

export const AGENT_ACTIVITY_KINDS = [
  "unavailable",
  "planning",
  "blocked",
  "working_task",
  "delegating_task",
  "ready_task",
  "awaiting_instruction",
  "reviewing_item",
  "reviewing_pr",
  "validating",
  "releasing",
  "awaiting_policy_approval",
  "awaiting_human_gate"
] as const;

export type AgentActivityKind = (typeof AGENT_ACTIVITY_KINDS)[number];

export type AgentActivityV1 = {
  activityId: string;
  agentId: string;
  agentDefinitionId?: string;
  sessionId: string;
  assignmentId?: string;
  taskId?: string;
  phaseKey?: string;
  kind: AgentActivityKind;
  label: string;
  currentStep?: string;
  command?: string;
  hostHint?: string;
  modelTier?: AgentModelTier;
  modelHint?: string;
  startedAt?: string;
  updatedAt: string;
  expiresAt: string;
  details?: Record<string, unknown>;
};
