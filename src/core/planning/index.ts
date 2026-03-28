/**
 * Shared planning-domain exports for cross-module consumers.
 *
 * **Planning persistence** (task + wishlist stores, SQLite/JSON) lives in `src/modules/task-engine/`.
 * The **`planning` module** (`src/modules/planning/`) is the CLI interview surface (`build-plan`, …).
 * This facade keeps non-task-engine modules from importing deep task-engine paths; implementations stay in task-engine.
 */
export { openPlanningStores } from "../../modules/task-engine/planning-open.js";
export { TaskStore } from "../../modules/task-engine/store.js";
export { WishlistStore } from "../../modules/task-engine/wishlist-store.js";
export { TransitionService } from "../../modules/task-engine/service.js";
export { validateKnownTaskTypeRequirements } from "../../modules/task-engine/task-type-validation.js";
export {
  buildWishlistItemFromIntake,
  validateWishlistIntakePayload,
  validateWishlistUpdatePayload,
  WISHLIST_ID_RE
} from "../../modules/task-engine/wishlist-validation.js";
export type {
  TaskEntity,
  TaskPriority,
  TaskStatus,
  TransitionEvidence,
  TransitionGuard,
  TransitionContext,
  GuardResult
} from "../../modules/task-engine/types.js";
export type { WishlistItem, WishlistStatus, WishlistConversionDecomposition } from "../../modules/task-engine/wishlist-types.js";
export {
  persistBuildPlanSession,
  clearBuildPlanSession,
  readBuildPlanSession,
  toDashboardPlanningSession,
  type BuildPlanSessionSnapshotV1,
  type DashboardPlanningSessionV1
} from "./build-plan-session-file.js";
