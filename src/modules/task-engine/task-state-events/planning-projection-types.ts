import type { KitWorkspaceStatusPublic } from "../persistence/workspace-status-store.js";
import type { PhaseCatalogRow } from "../persistence/phase-catalog-store.js";

export type PlanningWorkspaceStatusAuditV1 = {
  eventKind: string;
  actor: string | null;
  command: string | null;
  revisionBefore: number;
  revisionAfter: number;
  detailsJson: string;
  createdAt: string;
  clientMutationId?: string;
};

export type PlanningStateProjectionV1 = {
  schemaVersion: 1;
  phaseCatalogByKey: Record<string, PhaseCatalogRow>;
  workspaceStatus: KitWorkspaceStatusPublic | null;
  workspaceStatusAudits: PlanningWorkspaceStatusAuditV1[];
  /** clientMutationId keys applied in this replay (workspace status audit dedupe). */
  appliedWorkspaceMutationIds: Set<string>;
  lastEventSequence: number;
  lastUpdated: string;
};

export type PlanningStateApplierErrorCode =
  | "workspace-revision-mismatch"
  | "workspace-status-missing"
  | "phase-catalog-key-invalid"
  | "replay-conflict";

export type PlanningStateApplierError = {
  code: PlanningStateApplierErrorCode;
  message: string;
  eventId: string;
};
