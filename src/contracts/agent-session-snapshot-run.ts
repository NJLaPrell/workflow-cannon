/**
 * Stable types for `workspace-kit run agent-session-snapshot` success `data`.
 * Keep aligned with `task-engine-internal.ts` handler output.
 */

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
    statusYamlMatchesConfig: boolean;
  };
  doctorKitPhaseIssues: Array<{ path: string; reason: string }>;
  teamExecutionContext: AgentSessionSnapshotTeamContext;
  planningGeneration?: number;
  planningGenerationPolicy?: string;
};

export type AgentSessionSnapshotSuccess = {
  ok: true;
  code: "agent-session-snapshot";
  message: string;
  data: AgentSessionSnapshotData;
};
