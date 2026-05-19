/**
 * Bounded phase-scoped read model for `phase-focus-dashboard` and optional
 * `agent-bootstrap` / `dashboard-summary` projections (Phase 100+).
 */

export type AgentPhaseFocusReadyRow = {
  id: string;
  title: string;
  status: "ready";
  priority: string | null;
};

export type AgentPhaseFocusBlockedRow = {
  taskId: string;
  title: string;
  blockedBy: string[];
  blockingCount: number;
  blockedReasonCategory: string | null;
};

export type AgentPhaseFocusEvidenceGapRow = {
  taskId: string;
  code: string;
  message: string;
  missingFields: string[];
};

export type AgentPhaseFocusQueueCounts = {
  ready: number;
  proposed: number;
  blocked: number;
  inProgress: number;
  research: number;
};

export type AgentPhaseFocusDeliverySlice = {
  closeoutPassed: boolean;
  remainingCount: number;
  progressPercent: number;
  releaseReadyPercent: number;
};

export type AgentPhaseFocusJournalSlice = {
  available: boolean;
  activeNoteCount: number;
  criticalCount: number;
  silenceWarning: boolean;
};

/** Stable v1 payload for one scoped phase question (agents / CI). */
export type AgentPhaseFocusDashboard = {
  schemaVersion: 1;
  phaseKey: string | null;
  generatedAt: string;
  canonicalPhase: {
    canonicalPhaseKey: string | null;
    phaseSource: string | null;
    currentKitPhase: string | null;
    nextKitPhase: string | null;
    configMatchesWorkspaceStatus: boolean | null;
  };
  queue: AgentPhaseFocusQueueCounts;
  delivery: AgentPhaseFocusDeliverySlice;
  readyTop: AgentPhaseFocusReadyRow[];
  blockedTop: AgentPhaseFocusBlockedRow[];
  phaseJournal: AgentPhaseFocusJournalSlice;
  evidenceGaps: {
    violationCount: number;
    top: AgentPhaseFocusEvidenceGapRow[];
  };
};
