export { approvalsModule } from "./approvals/index.js";
export { documentationModule } from "./documentation/index.js";
export type {
  DocumentationConflict,
  DocumentationGenerateOptions,
  DocumentationGenerateResult,
  DocumentationGenerationEvidence,
  DocumentationValidationIssue
} from "./documentation/types.js";
export { improvementModule } from "./improvement/index.js";
export { planningModule } from "./planning/index.js";
export {
  taskEngineModule,
  TaskStore,
  TransitionService,
  TaskEngineError,
  TransitionValidator,
  isTransitionAllowed,
  getTransitionAction,
  resolveTargetState,
  getAllowedTransitionsFrom,
  stateValidityGuard,
  dependencyCheckGuard,
  generateTasksMd,
  importTasksFromMarkdown,
  getNextActions
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
