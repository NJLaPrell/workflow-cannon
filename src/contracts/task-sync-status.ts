/**
 * Versioned wire contract for canonical task-state sync (GET /task-sync/status, POST /task-sync/flush).
 * Distinguishes Git alignment and outbox posture from dashboard slice freshness.
 */

export const TASK_SYNC_STATUS_SCHEMA_VERSION = 1 as const;
export const TASK_SYNC_FLUSH_RESULT_SCHEMA_VERSION = 1 as const;

export type TaskSyncState = "missing" | "current" | "behind" | "conflict";

export type TaskSyncLocalProjection = "fresh" | "behind" | "conflict" | "rebuilding" | "offline";

export type TaskSyncRecommendedAction =
  | "none"
  | "wait"
  | "hydrate"
  | "resolve-conflict"
  | "run-publish";

export type TaskSyncOutboxCounts = {
  pending: number;
  publishing: number;
  failed: number;
  conflict: number;
  oldestPendingAgeMs: number;
  latestPublishedAt: string | null;
};

export type TaskSyncStatusV1 = {
  schemaVersion: typeof TASK_SYNC_STATUS_SCHEMA_VERSION;
  generatedAt: string;
  syncState: TaskSyncState;
  reason: string;
  localProjection: TaskSyncLocalProjection;
  recommendedAction: TaskSyncRecommendedAction;
  branch: string;
  remoteLatestSequence: number | null;
  localAppliedSequence: number | null;
  outbox: TaskSyncOutboxCounts;
};

export type TaskSyncFlushResultV1 = {
  schemaVersion: typeof TASK_SYNC_FLUSH_RESULT_SCHEMA_VERSION;
  generatedAt: string;
  ok: boolean;
  code: string;
  enabled: boolean;
  publishedCount: number;
  conflictCount: number;
  failedCount: number;
  deferredCount: number;
};
