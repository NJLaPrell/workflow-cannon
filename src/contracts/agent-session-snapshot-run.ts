/**
 * Stable types for `workspace-kit run agent-session-snapshot` success `data`.
 * Keep aligned with `task-engine-internal.ts` handler output.
 */

import type { AgentPhaseJournalSnapshotBlock } from "./agent-phase-journal-read-contract.js";
import type { DashboardAgentRegistrySessionSummary } from "./dashboard-summary-run.js";

export type AgentSessionSnapshotTeamContext = {
  schemaVersion: 1;
  available: boolean;
  openCount: number;
  topOpen: Array<{
    assignmentId: string;
    executionTaskId: string;
    executionTaskTitle: string | null;
    supervisorId: string;
    workerId: string;
    status: string;
    updatedAt: string;
  }>;
};

export type AgentSessionSnapshotData = {
  schemaVersion: 1;
  refreshedAt: string;
  suggestedNext: { id: string; title: string; status: string } | null;
  stateSummary: Record<string, unknown>;
  queueHealthSummary: Record<string, unknown>;
  canonicalPhase: {
    canonicalPhaseKey: string | null;
    phaseSource: "workspace-status" | "config" | "none";
    configMatchesWorkspaceStatus: boolean | null;
  };
  doctorKitPhaseIssues: Array<{ path: string; reason: string }>;
  teamExecutionContext: AgentSessionSnapshotTeamContext;
  agentRegistrySessionContext?: AgentSessionSnapshotAgentRegistrySessionContext;
  /** Maintainer PR/phase-branch hints (Phase 77); safe on every snapshot read. */
  maintainerDelivery?: Record<string, unknown>;
  /** Phase journal summary (Phase 78); present when canonical phase + kit SQLite v19+. */
  phaseJournal?: AgentPhaseJournalSnapshotBlock;
  planningGeneration?: number;
  planningGenerationPolicy?: string;
};

export type AgentSessionSnapshotAgentRegistrySessionContext = DashboardAgentRegistrySessionSummary;

export type AgentSessionSnapshotSuccess = {
  ok: true;
  code: "agent-session-snapshot";
  message: string;
  data: AgentSessionSnapshotData;
};
