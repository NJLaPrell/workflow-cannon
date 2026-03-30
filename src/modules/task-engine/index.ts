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

export { TaskStore } from "./store.js";
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
export { getNextActions, isImprovementLikeTask } from "./suggestions.js";
export { readWorkspaceStatusSnapshot } from "./dashboard-status.js";
export { WishlistStore } from "./wishlist-store.js";
export type { WishlistItem, WishlistStatus, WishlistStoreDocument } from "./wishlist-types.js";
export {
  validateWishlistIntakePayload,
  validateWishlistUpdatePayload,
  buildWishlistItemFromIntake,
  WISHLIST_ID_RE
} from "./wishlist-validation.js";
export { openPlanningStores } from "./planning-open.js";
export {
  getTaskPersistenceBackend,
  planningSqliteDatabaseRelativePath,
  planningTaskStoreRelativePath,
  planningWishlistStoreRelativePath
} from "./planning-config.js";

export { taskEngineModule } from "./task-engine-internal.js";
