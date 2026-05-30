import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type {
  TaskSyncFlushResultV1,
  TaskSyncLocalProjection,
  TaskSyncOutboxCounts,
  TaskSyncRecommendedAction,
  TaskSyncState,
  TaskSyncStatusV1
} from "../../contracts/task-sync-status.js";
import {
  TASK_SYNC_FLUSH_RESULT_SCHEMA_VERSION,
  TASK_SYNC_STATUS_SCHEMA_VERSION
} from "../../contracts/task-sync-status.js";
import { CanonicalEventOutboxPublisher } from "../../modules/task-engine/persistence/canonical-event-outbox-publisher.js";
import { openCanonicalEventOutboxRuntime } from "../../modules/task-engine/persistence/canonical-event-outbox-runtime.js";
import { runTaskStateStatus } from "../../modules/task-engine/persistence/task-state-status-runtime.js";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapOutbox(raw: unknown): TaskSyncOutboxCounts {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    pending: typeof o.pending === "number" ? o.pending : 0,
    publishing: typeof o.publishing === "number" ? o.publishing : 0,
    failed: typeof o.failed === "number" ? o.failed : 0,
    conflict: typeof o.conflict === "number" ? o.conflict : 0,
    oldestPendingAgeMs: typeof o.oldestPendingAgeMs === "number" ? o.oldestPendingAgeMs : 0,
    latestPublishedAt: typeof o.latestPublishedAt === "string" ? o.latestPublishedAt : null
  };
}

export function mapTaskStateStatusDataToWire(data: Record<string, unknown>): TaskSyncStatusV1 {
  return {
    schemaVersion: TASK_SYNC_STATUS_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    syncState: asString(data.syncState, "missing") as TaskSyncState,
    reason: asString(data.reason, "Task sync status unavailable."),
    localProjection: asString(data.localProjection, "offline") as TaskSyncLocalProjection,
    recommendedAction: asString(data.recommendedAction, "none") as TaskSyncRecommendedAction,
    branch: asString(data.branch, "workflow-cannon/task-state"),
    remoteLatestSequence: asNumberOrNull(data.remoteLatestSequence),
    localAppliedSequence: asNumberOrNull(data.localAppliedSequence),
    outbox: mapOutbox(data.outbox)
  };
}

export async function readTaskSyncStatus(ctx: ModuleLifecycleContext): Promise<TaskSyncStatusV1> {
  const result = await runTaskStateStatus(ctx, {});
  const data =
    result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};
  return mapTaskStateStatusDataToWire(data);
}

export async function flushTaskSyncOutbox(ctx: ModuleLifecycleContext): Promise<TaskSyncFlushResultV1> {
  const generatedAt = new Date().toISOString();
  try {
    const runtime = await openCanonicalEventOutboxRuntime(ctx);
    try {
      const publisher = new CanonicalEventOutboxPublisher({
        ctx,
        repository: runtime.repository
      });
      const cycle = await publisher.runCycle();
      const ok =
        cycle.publishedCount > 0 ||
        (cycle.enabled && cycle.pendingRowsFetched === 0 && cycle.publishCode === null);
      const code =
        cycle.publishCode ??
        (cycle.publishedCount > 0
          ? "task-sync-flushed"
          : cycle.enabled
            ? "task-sync-nothing-to-flush"
            : "task-sync-flush-disabled");
      return {
        schemaVersion: TASK_SYNC_FLUSH_RESULT_SCHEMA_VERSION,
        generatedAt,
        ok,
        code,
        enabled: cycle.enabled,
        publishedCount: cycle.publishedCount,
        conflictCount: cycle.conflictCount,
        failedCount: cycle.failedCount,
        deferredCount: cycle.deferredCount
      };
    } finally {
      runtime.close();
    }
  } catch {
    return {
      schemaVersion: TASK_SYNC_FLUSH_RESULT_SCHEMA_VERSION,
      generatedAt,
      ok: false,
      code: "task-sync-flush-unavailable",
      enabled: false,
      publishedCount: 0,
      conflictCount: 0,
      failedCount: 0,
      deferredCount: 0
    };
  }
}
