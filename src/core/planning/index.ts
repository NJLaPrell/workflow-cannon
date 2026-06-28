/**
 * Shared planning-domain exports for cross-module consumers.
 *
 * **Planning persistence** (task + wishlist stores, SQLite/JSON) lives in `src/modules/task-engine/`.
 * The **`planning` module** (`src/modules/planning/`) is the CLI interview surface (`build-plan`, …).
 * This facade keeps non-task-engine modules from importing deep task-engine paths; implementations stay in task-engine.
 */
export {
  openPlanningStores,
  openPlanningStoresFull,
  openPlanningStoresReadOnly,
  openPlanningStoresForDashboardSlice
} from "../../modules/task-engine/persistence/planning-open.js";
export { TaskStore } from "../../modules/task-engine/persistence/store.js";
export { WishlistStore } from "../../modules/task-engine/persistence/wishlist-store.js";
export { TransitionService } from "../../modules/task-engine/service.js";
export { validateKnownTaskTypeRequirements } from "../../modules/task-engine/task-type-validation.js";
export {
  buildWishlistItemFromIntake,
  validateWishlistContentFields,
  validateWishlistIntakePayload,
  validateWishlistUpdatePayload,
  WISHLIST_ID_RE
} from "../../modules/task-engine/wishlist-validation.js";
export {
  taskEntityFromNewIntake
} from "../../modules/task-engine/wishlist-intake.js";
export type {
  TaskEntity,
  TaskPriority,
  TaskStatus,
  TransitionEvidence,
  TransitionGuard,
  TransitionContext,
  GuardResult
} from "../../modules/task-engine/types.js";
export type {
  WishlistItem,
  WishlistStatus,
  WishlistConversionDecomposition
} from "../../modules/task-engine/wishlist-types.js";
export {
  persistBuildPlanSession,
  clearBuildPlanSession,
  readBuildPlanSession,
  toDashboardPlanningSession,
  type BuildPlanSessionSnapshotV1,
  type DashboardPlanningSessionV1
} from "./build-plan-session-file.js";
export {
  PLAN_ARTIFACT_SCHEMA_VERSION,
  isPlanArtifactSchemaVersion,
  isPlanArtifactV1,
  type PlanArtifactApprovalRecord,
  type PlanArtifactArchitecture,
  type PlanArtifactArchitectureDecision,
  type PlanArtifactConfidence,
  type PlanArtifactExecuteEvidenceBundle,
  type PlanArtifactExecutionLinkage,
  type PlanArtifactGeneratedTaskPayload,
  type PlanArtifactIdentity,
  type PlanArtifactPhaseRecommendation,
  type PlanArtifactPlanningType,
  type PlanArtifactProvenance,
  type PlanArtifactProvenanceSource,
  type PlanArtifactReviewProfile,
  type PlanArtifactRiskItem,
  type PlanArtifactRiskSeverity,
  type PlanArtifactSchemaVersion,
  type PlanArtifactStatus,
  type PlanArtifactTechnicalImpact,
  type PlanArtifactTestingStrategy,
  type PlanArtifactUiUxDirection,
  type PlanArtifactUserStory,
  type PlanArtifactUserStoryPriority,
  type PlanArtifactValueAssessment,
  type PlanArtifactV1,
  type PlanArtifactWbsItem
} from "./plan-artifact-v1.js";
export {
  isPlanArtifactWbsItem,
  normalizeWbsItemToTaskDraft,
  validatePlanArtifactWbsItemShape,
  type NormalizeWbsToTaskDraftContext,
  type NormalizeWbsToTaskDraftResult,
  type PlanningExecutionTaskDraft,
  type WbsShapeFinding,
  type WbsShapeGuardResult
} from "./normalize-wbs-to-task-draft.js";
export {
  PLAN_ARTIFACT_MODULE_ID_PREFIX,
  PLAN_ARTIFACT_ROOT_REL,
  getPlanArtifactStoragePaths,
  listPlanArtifactSummaries,
  planArtifactModuleId,
  readLatestPlanArtifact,
  readPlanArtifactIndex,
  readPlanArtifactVersion,
  resolveLatestPlanArtifactVersion,
  writeNextPlanArtifactVersion,
  writePlanArtifactVersion,
  type PlanArtifactIndexStateV1,
  type PlanArtifactStoragePaths
} from "./plan-artifact-storage.js";
export { renderPlanArtifactMarkdown } from "./render-plan-artifact-markdown.js";
export {
  formatPlanArtifactInstancePath,
  normalizePlanArtifactDraft,
  validatePlanArtifactDocument,
  validatePlanArtifactDraftInput,
  type NormalizePlanArtifactDraftOptions,
  type PlanArtifactValidationError,
  type ValidatePlanArtifactFailure,
  type ValidatePlanArtifactResult,
  type ValidatePlanArtifactSuccess
} from "./validate-plan-artifact.js";
export {
  PLAN_ARTIFACT_PHASE_DESCRIPTION_MAX_WORDS,
  PLAN_ARTIFACT_PHASE_KEY_RE,
  countDescriptionWords,
  resolvePlanArtifactPhaseProposal,
  resolveNextEmptyNumericPhaseKey,
  type PlanArtifactPhaseProposal,
  type PlanArtifactPhaseProposalFinding,
  type ResolvePlanArtifactPhaseProposalInput,
  type ResolvePlanArtifactPhaseProposalResult
} from "./resolve-plan-artifact-phase-proposal.js";
export {
  resolvePlanArtifactReviewProfile,
  reviewPlanArtifact,
  type PlanArtifactCoverageMap,
  type PlanArtifactCoverageSliceStatus,
  type PlanArtifactReviewFinding,
  type PlanArtifactReviewSeverity,
  type PlanArtifactReviewWaiver,
  type ReviewPlanArtifactOptions,
  type ReviewPlanArtifactResult
} from "./review-plan-artifact.js";
