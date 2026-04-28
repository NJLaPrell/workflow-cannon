export type {
  TaskEntity,
  TaskStatus,
  TaskPriority,
  TaskStoreDocument,
  TransitionEvidence,
  TransitionGuard,
  TransitionContext,
  GuardResult,
  TaskEngineError as TaskEngineErrorType,
  TaskEngineErrorCode,
  TaskAdapter,
  TaskAdapterCapability,
  NextActionSuggestion,
  BlockingAnalysisEntry,
  TaskMutationEvidence,
  TaskMutationType
} from "./types.js";

export { TaskStore } from "./persistence/store.js";
export { TransitionService } from "./service.js";
export {
  TaskEngineError,
  TransitionValidator,
  isTransitionAllowed,
  getTransitionAction,
  resolveTargetState,
  getAllowedTransitionsFrom,
  stateValidityGuard,
  dependencyCheckGuard
} from "./transitions.js";
export {
  DELIVERY_EVIDENCE_METADATA_KEY,
  DELIVERY_WAIVER_METADATA_KEY,
  buildPhaseDeliveryPreflight,
  createDeliveryEvidenceGuard,
  evaluateDeliveryEvidence,
  isPhaseDeliveryTask,
  readDeliveryEvidenceEnforcementMode
} from "./delivery-evidence.js";
export { buildReleaseEvidenceManifest } from "./release-evidence-manifest.js";
export { classifyKitStatePath } from "./kit-state-classifier.js";
export type { KitStateClassification } from "./kit-state-classifier.js";
export type {
  DeliveryEvidenceEnforcementMode,
  DeliveryEvidenceEvaluation,
  DeliveryEvidenceViolation
} from "./delivery-evidence.js";
export {
  filterTasksByQueueNamespace,
  getNextActions,
  getTaskQueueNamespace,
  isImprovementLikeTask
} from "./suggestions.js";
export { buildQueueGitAlignmentReport, probeGitHead } from "./queue/queue-git-alignment.js";
export { readWorkspaceStatusSnapshot } from "./dashboard/dashboard-status.js";
export { WishlistStore } from "./persistence/wishlist-store.js";
export type { WishlistItem, WishlistStatus, WishlistStoreDocument } from "./wishlist/wishlist-types.js";
export {
  validateWishlistIntakePayload,
  validateWishlistUpdatePayload,
  buildWishlistItemFromIntake,
  WISHLIST_ID_RE
} from "./wishlist/wishlist-validation.js";
export { openPlanningStores } from "./persistence/planning-open.js";
export type { OpenedPlanningStores } from "./persistence/planning-open.js";
export { SqliteDualPlanningStore } from "./persistence/sqlite-dual-planning.js";
export {
  getTaskPersistenceBackend,
  planningSqliteDatabaseRelativePath,
  planningTaskStoreRelativePath
} from "./planning-config.js";

export { taskEngineModule } from "./task-engine-internal.js";
