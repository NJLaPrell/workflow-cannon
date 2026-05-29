import type { TaskStateEventEnvelopeV1 } from "./types.js";
import type { WorkspaceStatusUpdatePatch } from "../persistence/workspace-status-store.js";
import type { PhaseNotePriority, PhaseNoteStatus } from "../phase-journal/phase-journal-types.js";

/** Discriminated planning event kinds (Phase 119 + Phase 120 S1 phase journal). */
export type PlanningStateEventKindV1 =
  | "planning.phase_catalog.upserted"
  | "planning.phase_catalog.removed"
  | "planning.workspace_status.updated"
  | "planning.phase_note.created"
  | "planning.phase_note.updated"
  | "planning.phase_note.archived"
  | "planning.phase_note_suggestion.created"
  | "planning.phase_note_suggestion.updated"
  | "planning.phase_note_suggestion.removed";

export type PlanningPhaseCatalogUpsertedPayloadV1 = {
  phaseKey: string;
  shortDescription: string | null;
  updatedAt: string;
};

export type PlanningPhaseCatalogRemovedPayloadV1 = {
  phaseKey: string;
};

export type PlanningWorkspaceStatusUpdatedPayloadV1 = {
  patch: WorkspaceStatusUpdatePatch;
  /** Snapshot fields after apply (for deterministic replay verification). */
  after: {
    workspaceRevision: number;
    currentKitPhase: string | null;
    nextKitPhase: string | null;
    activeFocus: string | null;
    lastUpdated: string | null;
    blockers: string[];
    pendingDecisions: string[];
    nextAgentActions: string[];
    updatedAt: string;
  };
  payloadDigest?: string;
};

export type PlanningPhaseNoteEventRefV1 = {
  refType: string;
  refValue: string;
};

/** Full note row + refs (no delta-only updates — Phase 120 S1 decision). */
export type PlanningPhaseNoteSnapshotV1 = {
  id: string;
  phaseKey: string;
  phaseLabel: string | null;
  taskId: string | null;
  author: string | null;
  authorKind: string | null;
  sessionId: string | null;
  sourceCommand: string | null;
  planningGeneration: number | null;
  policyTraceId: string | null;
  noteType: string;
  summary: string;
  details: string | null;
  status: PhaseNoteStatus;
  priority: PhaseNotePriority;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  supersededBy: string | null;
  convertedTaskId: string | null;
  idempotencyKey: string | null;
  refs: PlanningPhaseNoteEventRefV1[];
};

export type PlanningPhaseNoteCreatedPayloadV1 = {
  note: PlanningPhaseNoteSnapshotV1;
};

export type PlanningPhaseNoteUpdatedPayloadV1 = {
  note: PlanningPhaseNoteSnapshotV1;
};

export type PlanningPhaseNoteArchivedPayloadV1 = {
  note: PlanningPhaseNoteSnapshotV1;
};

export type PlanningPhaseNoteSuggestionSnapshotV1 = {
  id: string;
  noteId: string;
  title: string;
  description: string;
  suggestedStatus: string;
  suggestedPhaseKey: string;
  suggestedPhaseLabel: string | null;
  suggestedTaskType: string | null;
  acceptanceCriteriaJson: string | null;
  convertedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlanningPhaseNoteSuggestionCreatedPayloadV1 = {
  suggestion: PlanningPhaseNoteSuggestionSnapshotV1;
};

export type PlanningPhaseNoteSuggestionUpdatedPayloadV1 = {
  suggestion: PlanningPhaseNoteSuggestionSnapshotV1;
};

export type PlanningPhaseNoteSuggestionRemovedPayloadV1 = {
  suggestionId: string;
  noteId: string;
};

export type PlanningStateEventPayloadV1 =
  | PlanningPhaseCatalogUpsertedPayloadV1
  | PlanningPhaseCatalogRemovedPayloadV1
  | PlanningWorkspaceStatusUpdatedPayloadV1
  | PlanningPhaseNoteCreatedPayloadV1
  | PlanningPhaseNoteUpdatedPayloadV1
  | PlanningPhaseNoteArchivedPayloadV1
  | PlanningPhaseNoteSuggestionCreatedPayloadV1
  | PlanningPhaseNoteSuggestionUpdatedPayloadV1
  | PlanningPhaseNoteSuggestionRemovedPayloadV1;

export type PlanningStateEventV1 = TaskStateEventEnvelopeV1 & {
  kind: PlanningStateEventKindV1;
  payload: PlanningStateEventPayloadV1;
  expectedWorkspaceRevision?: number;
};

export const PLANNING_STATE_EVENT_KINDS: readonly PlanningStateEventKindV1[] = [
  "planning.phase_catalog.upserted",
  "planning.phase_catalog.removed",
  "planning.workspace_status.updated",
  "planning.phase_note.created",
  "planning.phase_note.updated",
  "planning.phase_note.archived",
  "planning.phase_note_suggestion.created",
  "planning.phase_note_suggestion.updated",
  "planning.phase_note_suggestion.removed"
] as const;

export function isPlanningStateEventKind(kind: string): kind is PlanningStateEventKindV1 {
  return (PLANNING_STATE_EVENT_KINDS as readonly string[]).includes(kind);
}
