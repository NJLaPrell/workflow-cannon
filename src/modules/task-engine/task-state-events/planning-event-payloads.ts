import type { TaskStateEventEnvelopeV1 } from "./types.js";
import type { WorkspaceStatusUpdatePatch } from "../persistence/workspace-status-store.js";

/** Discriminated planning event kinds (Phase 119 — shared git stream with task.*). */
export type PlanningStateEventKindV1 =
  | "planning.phase_catalog.upserted"
  | "planning.phase_catalog.removed"
  | "planning.workspace_status.updated";

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

export type PlanningStateEventPayloadV1 =
  | PlanningPhaseCatalogUpsertedPayloadV1
  | PlanningPhaseCatalogRemovedPayloadV1
  | PlanningWorkspaceStatusUpdatedPayloadV1;

export type PlanningStateEventV1 = TaskStateEventEnvelopeV1 & {
  kind: PlanningStateEventKindV1;
  payload: PlanningStateEventPayloadV1;
  expectedWorkspaceRevision?: number;
};

export const PLANNING_STATE_EVENT_KINDS: readonly PlanningStateEventKindV1[] = [
  "planning.phase_catalog.upserted",
  "planning.phase_catalog.removed",
  "planning.workspace_status.updated"
] as const;

export function isPlanningStateEventKind(kind: string): kind is PlanningStateEventKindV1 {
  return (PLANNING_STATE_EVENT_KINDS as readonly string[]).includes(kind);
}
