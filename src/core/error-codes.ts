/**
 * Cross-module error / response code catalog.
 *
 * Every string literal used as a `code` field in a ModuleCommandResult should
 * be a member of one of the typed unions below.  Modules may define their own
 * domain-specific subsets (e.g. TaskEngineErrorCode) but those subsets should
 * be assignable to the top-level ResponseCode type.
 */

// ---------------------------------------------------------------------------
// Shared / cross-cutting codes
// ---------------------------------------------------------------------------

export type SharedErrorCode =
  | "unsupported-command"
  | "unknown-command"
  | "internal-error"
  | "policy-denied"
  | "storage-read-error"
  | "storage-write-error";

// ---------------------------------------------------------------------------
// Task Engine
// ---------------------------------------------------------------------------

export type TaskEngineSuccessCode =
  | "transition-applied"
  | "task-created"
  | "task-updated"
  | "task-archived"
  | "task-retrieved"
  | "tasks-listed"
  | "task-create-idempotent-replay"
  | "task-update-idempotent-replay"
  | "ready-queue-retrieved"
  | "next-actions-retrieved"
  | "task-engine-model-explained"
  | "task-summary"
  | "blocked-summary"
  | "dashboard-summary"
  | "dependency-added"
  | "dependency-removed"
  | "dependency-graph"
  | "task-history"
  | "recent-task-activity"
  | "module-states-listed"
  | "module-state-read"
  | "wishlist-created"
  | "wishlist-listed"
  | "wishlist-retrieved"
  | "wishlist-updated"
  | "wishlist-converted";

export type TaskEngineErrorCode =
  | "invalid-transition"
  | "guard-rejected"
  | "dependency-unsatisfied"
  | "task-not-found"
  | "duplicate-task-id"
  | "invalid-task-schema"
  | "invalid-task-type-requirements"
  | "invalid-task-update"
  | "invalid-task-id-format"
  | "task-archived"
  | "dependency-cycle"
  | "duplicate-dependency"
  | "idempotency-key-conflict"
  | "strict-task-validation-failed"
  | "storage-read-error"
  | "storage-write-error"
  | "invalid-adapter"
  | "import-parse-error";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type ConfigSuccessCode =
  | "config-list"
  | "config-get"
  | "config-set"
  | "config-unset"
  | "config-validated"
  | "config-explained"
  | "config-resolved"
  | "config-docs-generated";

export type ConfigErrorCode =
  | "config-set-failed"
  | "invalid-config-path";

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export type PlanningSuccessCode =
  | "planning-types-listed"
  | "planning-ready-with-warnings"
  | "planning-critical-unknowns"
  | "planning-adaptive-unknowns"
  | "planning-questions"
  | "planning-response-ready"
  | "planning-wishlist-ready"
  | "planning-artifact-created"
  | "planning-rules-explained";

export type PlanningErrorCode =
  | "invalid-planning-type"
  | "invalid-planning-output-mode"
  | "invalid-planning-artifact";

// ---------------------------------------------------------------------------
// Improvement / Transcript
// ---------------------------------------------------------------------------

export type ImprovementSuccessCode =
  | "recommendations-generated"
  | "transcripts-synced"
  | "transcripts-ingested"
  | "transcript-automation-status"
  | "lineage-queried";

export type ImprovementErrorCode =
  | "generate-failed"
  | "sync-failed"
  | "ingest-failed"
  | "invalid-args"
  | "source-read-error"
  | "retry-exhausted"
  | "copy-error";

// ---------------------------------------------------------------------------
// Response template
// ---------------------------------------------------------------------------

export type ResponseTemplateErrorCode =
  | "response-template-conflict"
  | "response-template-invalid";

// ---------------------------------------------------------------------------
// Composite types
// ---------------------------------------------------------------------------

export type SuccessCode =
  | TaskEngineSuccessCode
  | ConfigSuccessCode
  | PlanningSuccessCode
  | ImprovementSuccessCode;

export type ErrorCode =
  | SharedErrorCode
  | TaskEngineErrorCode
  | ConfigErrorCode
  | PlanningErrorCode
  | ImprovementErrorCode
  | ResponseTemplateErrorCode;

/** Every code that can appear in a ModuleCommandResult.code field. */
export type ResponseCode = SuccessCode | ErrorCode;
