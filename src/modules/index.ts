/**
 * Default module bundle + selective re-exports. Policy: see `docs/maintainers/module-build-guide.md` (Barrel export policy).
 */
import type { WorkflowModule } from "../contracts/module-contract.js";
import { agentBehaviorModule } from "./agent-behavior/index.js";
import { approvalsModule } from "./approvals/index.js";
import { documentationModule } from "./documentation/index.js";
import { improvementModule } from "./improvement/index.js";
import { planningModule } from "./planning/index.js";
import { pluginsModule } from "./plugins/index.js";
import { skillsModule } from "./skills/index.js";
import { subagentsModule } from "./subagents/index.js";
import { teamExecutionModule } from "./team-execution/index.js";
import { taskEngineModule } from "./task-engine/index.js";
import { workspaceConfigModule } from "./workspace-config/index.js";

export const defaultRegistryModules: WorkflowModule[] = [
  workspaceConfigModule,
  documentationModule,
  agentBehaviorModule,
  skillsModule,
  pluginsModule,
  subagentsModule,
  teamExecutionModule,
  taskEngineModule,
  approvalsModule,
  planningModule,
  improvementModule
];

export {
  agentBehaviorModule,
  BUILTIN_PROFILES,
  DEFAULT_BUILTIN_PROFILE_ID,
  mergeDimensions,
  validateBehaviorProfile
} from "./agent-behavior/index.js";
export { approvalsModule } from "./approvals/index.js";
export { documentationModule } from "./documentation/index.js";
export type {
  DocumentationConflict,
  DocumentationGenerateOptions,
  DocumentationGenerateResult,
  DocumentationGenerationEvidence,
  DocumentationValidationIssue
} from "./documentation/types.js";
export { improvementModule, buildImprovementTaskPayload } from "./improvement/index.js";
export { pluginsModule } from "./plugins/index.js";
export { skillsModule } from "./skills/index.js";
export { subagentsModule } from "./subagents/index.js";
export { teamExecutionModule } from "./team-execution/index.js";
export {
  computeHeuristicConfidence,
  HEURISTIC_1_ADMISSION_THRESHOLD,
  shouldAdmitRecommendation,
  type ConfidenceResult,
  type ConfidenceSignals,
  type EvidenceKind
} from "./improvement/confidence.js";
export { workspaceConfigModule } from "./workspace-config/index.js";
export { planningModule } from "./planning/index.js";
export {
  taskEngineModule,
  TaskStore,
  SqliteDualPlanningStore,
  openPlanningStores,
  TransitionService,
  TaskEngineError,
  TransitionValidator,
  isTransitionAllowed,
  getTransitionAction,
  resolveTargetState,
  getAllowedTransitionsFrom,
  stateValidityGuard,
  dependencyCheckGuard,
  buildQueueGitAlignmentReport,
  filterTasksByQueueNamespace,
  getNextActions,
  getTaskQueueNamespace,
  probeGitHead
} from "./task-engine/index.js";
export type {
  TaskEntity,
  TaskStatus,
  TaskPriority,
  TaskStoreDocument,
  TransitionEvidence,
  TransitionGuard,
  TransitionContext,
  GuardResult,
  TaskEngineErrorCode,
  TaskAdapter,
  TaskAdapterCapability,
  NextActionSuggestion,
  BlockingAnalysisEntry
} from "./task-engine/index.js";
export type { WishlistItem, WishlistStatus, WishlistStoreDocument } from "./task-engine/index.js";
export {
  WishlistStore,
  validateWishlistIntakePayload,
  validateWishlistUpdatePayload,
  buildWishlistItemFromIntake,
  WISHLIST_ID_RE
} from "./task-engine/index.js";
