/**
 * Read-plane types for `get-next-actions` (extension / consumers).
 * `teamExecutionContext` is additive (Phase 60+).
 */

export type NextActionsTeamExecutionContext = {
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

/** Task rows mirror `TaskEntity` — kept loose here so contracts do not import modules. */
export type GetNextActionsPayload = {
  readyQueue: Record<string, unknown>[];
  suggestedNext: Record<string, unknown> | null;
  stateSummary: Record<string, unknown>;
  blockingAnalysis: unknown[];
  teamExecutionContext: NextActionsTeamExecutionContext;
  scope: string;
  queueNamespace: string | null;
  planningGeneration?: number;
  planningGenerationPolicy?: string;
};
