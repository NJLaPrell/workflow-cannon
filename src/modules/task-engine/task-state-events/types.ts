/** Canonical git-backed task-state event log — shared envelope (Phase 114 S1.1). */

export const TASK_STATE_EVENT_ENVELOPE_SCHEMA_VERSION = 1 as const;

export type TaskStateEventEnvelopeSchemaVersion = typeof TASK_STATE_EVENT_ENVELOPE_SCHEMA_VERSION;

export type TaskStateEventActorSource = "git-config" | "explicit" | "system";

/** Who recorded the event (aligned with transition `actor` and git config). */
export type TaskStateEventActorV1 = {
  id: string;
  source?: TaskStateEventActorSource;
  /** Optional agent/session correlation (Cursor thread, CI job id, etc.). */
  sessionId?: string;
};

/** `workspace-kit run` command context for the mutation that produced the event. */
export type TaskStateEventCommandMetadataV1 = {
  name: string;
  moduleId?: string;
  invocationId?: string;
  /** SHA-256 hex digest of canonical argv JSON (same family as `payloadDigest`). */
  argvDigest?: string;
};

/** Repo/workspace fingerprint at record time — not authoritative over git refs. */
export type TaskStateEventWorkspaceIdentityV1 = {
  gitHeadSha?: string;
  workspaceRoot?: string;
  phaseKey?: string;
};

/**
 * Common envelope for every canonical task-state event in the git event log.
 * Event-specific bodies (lifecycle, mutation, projection) attach in later WBS slices.
 */
export type TaskStateEventEnvelopeV1 = {
  schemaVersion: TaskStateEventEnvelopeSchemaVersion;
  eventId: string;
  /** Monotonic sequence within a single log stream (0 = genesis). */
  sequence: number;
  /** Previous event in the stream; `null` only for the first event. */
  parentEventId: string | null;
  recordedAt: string;
  actor: TaskStateEventActorV1;
  clientMutationId?: string;
  command: TaskStateEventCommandMetadataV1;
  workspace?: TaskStateEventWorkspaceIdentityV1;
};
