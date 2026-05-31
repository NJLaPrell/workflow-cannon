export type {
  CanonicalStateCompactInput,
  CanonicalStateSnapshotInput,
  CanonicalStateSyncBackend,
  CanonicalStateSyncEvent,
  CanonicalSyncHeadFailure,
  PublishCanonicalEventsInput
} from "./canonical-state-sync-backend.js";
export {
  assertCanonicalStateSyncBackend,
  isCanonicalSyncHeadFailure,
  toCanonicalStateEventEnvelope
} from "./canonical-state-sync-backend.js";
export type {
  GitBackendMethodMap,
  GitDerivedCommandMap,
  GitMethodCompatEntry
} from "./git-method-compat.js";
export {
  GIT_DERIVED_COMMAND_COMPAT,
  GIT_EVENT_LOG_BACKEND_COMPAT
} from "./git-method-compat.js";
export type { GitEventLogBackendOptions } from "./git-event-log-backend.js";
export {
  createGitEventLogBackend,
  createGitEventLogBackendFromContext,
  envelopesToCanonicalEvents,
  GIT_EVENT_LOG_BACKEND_ID,
  GitEventLogBackend,
  publishEventsViaGitBackend
} from "./git-event-log-backend.js";
export type { LocalOnlySnapshotRecord, LocalOnlyEventStore } from "./local-only-event-store.js";
export {
  createEmptyLocalOnlyHead,
  createLocalOnlyEventStore,
  localOnlyRevisionForSequence,
  updateLocalOnlyHead
} from "./local-only-event-store.js";
export type { LocalOnlyReplayProjection } from "./local-only-projection.js";
export {
  planningVersionsFromProjection,
  projectionRowsForEvents,
  replayLocalOnlyEvents,
  taskVersionsFromProjection
} from "./local-only-projection.js";
export type {
  CreateLocalOnlyBackendOptions,
  LocalOnlyBackendDiagnostics
} from "./local-only-backend.js";
export {
  LOCAL_ONLY_BACKEND_ID,
  classifyLocalOnlyEventBatch,
  createLocalOnlyBackend,
  isLocalOnlyBackend,
  isPlanningOnlyEventBatch,
  localOnlyDiagnostics
} from "./local-only-backend.js";
export type { LocalOnlySyncStatusV1 } from "./local-only-status.js";
export { LOCAL_ONLY_SYNC_STATUS_SCHEMA_VERSION, buildLocalOnlySyncStatus } from "./local-only-status.js";
export type { AssessLocalOnlyCloseoutInput, LocalOnlyCloseoutWarning } from "./local-only-closeout.js";
export {
  LOCAL_ONLY_CLOSEOUT_WARNING_CODE,
  assessLocalOnlyCloseoutWarning
} from "./local-only-closeout.js";
export type {
  BuildPhaseProjectionCountGuardInput,
  DoctorPhaseProjectionCountIssue,
  PhaseProjectionCountGuardFinding,
  PhaseProjectionCountGuardFindingCode,
  PhaseProjectionCountGuardReport
} from "./git-event-log-phase-projection-guard.js";
export {
  PHASE_PROJECTION_COUNT_REGRESSION_CODE,
  PHASE_PROJECTION_LOCAL_EXCEEDS_REMOTE_CODE,
  PHASE_PROJECTION_REMOTE_UNREADABLE_CODE,
  PHASE_PROJECTION_VERIFY_SCHEMA_FAILURES_CODE,
  buildPhaseProjectionCountGuard,
  buildPhaseProjectionCountGuardAsync,
  collectDoctorPhaseProjectionCountIssues,
  isPhaseProjectionCountGuardActive,
  isPhaseProjectionCountGuardActiveForContext
} from "./git-event-log-phase-projection-guard.js";
export type {
  BackendConformanceHarnessOptions,
  BackendConformanceReport,
  BackendConformanceScenario,
  BackendConformanceScenarioResult
} from "./backend-conformance-harness.js";
export {
  BackendConformanceError,
  draftTaskCreatedEvent,
  draftTaskUpdatedEvent,
  runBackendConformanceHarness
} from "./backend-conformance-harness.js";
