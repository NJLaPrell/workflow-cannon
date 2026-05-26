import type { TaskStateEventKindV1 } from "./event-payloads.js";

/** Envelope + payload schema generation admitted to the canonical git log (Phase 114 S1). */
export const TASK_STATE_EVENT_LOG_SUPPORTED_SCHEMA_VERSION = 1 as const;

/** Explicit versioning policy for operators and agents (machine canon). */
export const TASK_STATE_EVENT_LOG_SCHEMA_POLICY =
  "Append only events with envelope.schemaVersion === 1 and kind in TASK_STATE_EVENT_LOG_SUPPORTED_KINDS. " +
  "Reject unknown kinds, unsupported schemaVersion, duplicate clientMutationId in the same stream, " +
  "and lifecycle transitions that disagree with replayed task status or workspace-kit transition table. " +
  "Future schema bumps require a new log segment or migration runbook — do not coerce v2+ into v1 validators.";

export const TASK_STATE_EVENT_LOG_SUPPORTED_KINDS: readonly TaskStateEventKindV1[] = [
  "task.created",
  "task.updated",
  "task.transitioned",
  "task.batch_applied"
] as const;
