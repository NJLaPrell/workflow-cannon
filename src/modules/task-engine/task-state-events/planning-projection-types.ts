import type { KitWorkspaceStatusPublic } from "../persistence/workspace-status-store.js";
import type { PhaseCatalogRow } from "../persistence/phase-catalog-store.js";
import type { PhaseDeliveryHistoryRow } from "../persistence/phase-delivery-history-store.js";
import type { PhaseNoteRow, PhaseNoteTaskSuggestionRow } from "../phase-journal/phase-journal-types.js";

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

export type ModuleStateProjectionRow = {
  moduleId: string;
  stateSchemaVersion: number;
  state: Record<string, unknown>;
  updatedAt: string;
};

export type WorkflowIdeaProjectionRow = {
  id: string;
  title: string;
  note: string | null;
  status: "open" | "planning" | "planned";
  sortOrder: number;
  linkedPlanArtifact: string | null;
  previousPlanArtifacts: string[];
  createdAt: string;
  updatedAt: string;
};

export type PlanningStateProjectionV1 = {
  schemaVersion: 1;
  phaseCatalogByKey: Record<string, PhaseCatalogRow>;
  phaseNotesById: Record<string, PhaseNoteRow>;
  phaseNoteSuggestionsById: Record<string, PhaseNoteTaskSuggestionRow>;
  ideasById: Record<string, WorkflowIdeaProjectionRow>;
  phaseDeliveryHistoryByKey: Record<string, PhaseDeliveryHistoryRow>;
  moduleStateById: Record<string, ModuleStateProjectionRow>;
  workspaceStatus: KitWorkspaceStatusPublic | null;
  workspaceStatusAudits: PlanningWorkspaceStatusAuditV1[];
  /** clientMutationId keys applied in this replay (workspace status audit dedupe). */
  appliedWorkspaceMutationIds: Set<string>;
  /** note idempotencyKey or create clientMutationId keys applied in this replay. */
  appliedNoteIdempotencyKeys: Set<string>;
  /** clientMutationId keys applied for suggestion mutations in this replay. */
  appliedSuggestionMutationIds: Set<string>;
  /** clientMutationId keys applied for idea mutations in this replay. */
  appliedIdeaMutationIds: Set<string>;
  /** clientMutationId keys applied for phase delivery history mutations in this replay. */
  appliedPhaseDeliveryHistoryMutationIds: Set<string>;
  /** clientMutationId keys applied for module state mutations in this replay. */
  appliedModuleStateMutationIds: Set<string>;
  lastEventSequence: number;
  lastUpdated: string;
};

export type PlanningStateApplierErrorCode =
  | "workspace-revision-mismatch"
  | "module-state-schema-version-mismatch"
  | "workspace-status-missing"
  | "phase-catalog-key-invalid"
  | "replay-conflict";

export type PlanningStateApplierError = {
  code: PlanningStateApplierErrorCode;
  message: string;
  eventId: string;
};
