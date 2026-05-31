/**
 * AgentSession v1 wire contract.
 * Mirror: schemas/agent-orchestration/agent-session.v1.json
 */

import type { AgentHostHint, AgentModelTier } from "./agent-orchestration.js";

export const AGENT_SESSION_SCHEMA_VERSION = 1 as const;

export type AgentSessionStatus =
  | "open"
  | "idle"
  | "active"
  | "blocked"
  | "closing"
  | "closed"
  | "stale";

export type AgentSessionV1 = {
  sessionId: string;
  agentDefinitionId: string;
  agentId: string;
  hostHint?: AgentHostHint;
  hostSessionRef?: string;
  status: AgentSessionStatus;
  modelTier?: AgentModelTier;
  modelHint?: string;
  currentAssignmentId?: string;
  currentTaskId?: string;
  currentActivityId?: string;
  startedAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};
