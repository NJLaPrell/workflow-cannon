/**
 * Backend-agnostic canonical state sync contract (Phase 125 / T-BE-201).
 * Wire and result shapes shared by Git, local-only, and future hosted backends.
 * Git-specific fields belong in {@link CanonicalStateSyncDiagnostics}, not these types.
 */

import type { TaskSyncState } from "./task-sync-status.js";

export const CANONICAL_STATE_SYNC_BACKEND_CONTRACT_VERSION = 1 as const;

/** Monotonic event sequence within a single canonical log stream (0 = genesis). */
export type CanonicalStateSequence = number;

/** Opaque backend cursor — commit SHA for Git, revision token for hosted APIs. */
export type CanonicalStateBackendRevision = string;

/** Stable event identifier within the canonical log. */
export type CanonicalStateEventId = string;

/** Minimal event envelope for fetch/publish payloads (full bodies live in task-engine). */
export type CanonicalStateEventEnvelopeV1 = {
  schemaVersion: number;
  eventId: CanonicalStateEventId;
  sequence: CanonicalStateSequence;
  parentEventId: CanonicalStateEventId | null;
  recordedAt: string;
  kind: string;
  payload?: unknown;
};

/** Remote canonical head — no branch names, refs, or VCS concepts. */
export type CanonicalStateHead = {
  contractVersion: typeof CANONICAL_STATE_SYNC_BACKEND_CONTRACT_VERSION;
  latestSequence: CanonicalStateSequence;
  latestEventId: CanonicalStateEventId | null;
  backendRevision: CanonicalStateBackendRevision;
  latestSnapshotId: string | null;
  recordedAt: string;
};

export type CanonicalTaskVersionRow = {
  taskId: string;
  version: number;
};

export type CanonicalPlanningVersionRow = {
  /** Planning domain key, e.g. `workspace` or module-scoped id. */
  domain: string;
  version: number;
};

export type CanonicalSyncConflictDetail = {
  code: string;
  message: string;
  retryable: boolean;
  taskId?: string;
  expectedVersion?: number;
  actualVersion?: number;
  /** Backend-specific context (git tip SHA, segment path, etc.). */
  diagnostics?: CanonicalStateSyncDiagnostics;
};

export type CanonicalSyncFailure = {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
  conflict?: CanonicalSyncConflictDetail;
  diagnostics?: CanonicalStateSyncDiagnostics;
};

export type FetchEventsInput = {
  /** Return events with sequence strictly greater than this value. */
  afterSequence?: CanonicalStateSequence;
  /** Upper bound inclusive; omit to read through head. */
  throughSequence?: CanonicalStateSequence;
  limit?: number;
  /** When true, backends may refresh remote state before reading. */
  refresh?: boolean;
};

export type FetchEventsSuccess = {
  ok: true;
  head: CanonicalStateHead;
  events: CanonicalStateEventEnvelopeV1[];
  taskVersions: CanonicalTaskVersionRow[];
  planningVersions: CanonicalPlanningVersionRow[];
  diagnostics?: CanonicalStateSyncDiagnostics;
};

export type FetchEventsResult = FetchEventsSuccess | CanonicalSyncFailure;

export type PublishEventsInput = {
  events: CanonicalStateEventEnvelopeV1[];
  expectedHead: {
    backendRevision: CanonicalStateBackendRevision;
    latestSequence: CanonicalStateSequence;
  };
  expectedTaskVersions: Record<string, number>;
  expectedPlanningVersions?: Record<string, number>;
  maxAttempts?: number;
};

export type PublishEventsSuccess = {
  ok: true;
  head: CanonicalStateHead;
  publishedEvents: CanonicalStateEventEnvelopeV1[];
  attempts: number;
  diagnostics?: CanonicalStateSyncDiagnostics;
};

export type PublishEventsResult = PublishEventsSuccess | CanonicalSyncFailure;

export type CanonicalStateVerifyFinding = {
  code: string;
  message: string;
  path?: string;
};

export type CanonicalStateVerifyResult = {
  passed: boolean;
  findingCount: number;
  findings: CanonicalStateVerifyFinding[];
  diagnostics?: CanonicalStateSyncDiagnostics;
};

export type CanonicalStateCompactResult = {
  ok: boolean;
  code: string;
  message: string;
  dryRun: boolean;
  latestSequence: CanonicalStateSequence;
  latestSnapshotId: string | null;
  retainedEventSegmentCount: number;
  diagnostics?: CanonicalStateSyncDiagnostics;
};

export type CanonicalStateSnapshotResult = {
  ok: boolean;
  code: string;
  message: string;
  dryRun: boolean;
  snapshotId: string;
  throughSequence: CanonicalStateSequence;
  throughEventId: CanonicalStateEventId;
  contentDigest: string;
  taskCount?: number;
  head: CanonicalStateHead;
  diagnostics?: CanonicalStateSyncDiagnostics;
};

/** Backend-specific operator context — Git branch/ref/sha, hosted tenant ids, etc. */
export type CanonicalStateSyncDiagnostics = Record<string, unknown>;

/**
 * Alignment between a local projection cursor and {@link CanonicalStateHead}.
 * Values mirror {@link TaskSyncState} for dashboard / GET /task-sync/status wiring.
 */
export type CanonicalSyncAlignmentState = TaskSyncState;
