import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { CanonicalStateHead } from "../../../contracts/canonical-state-sync-backend.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import { isGitRepository } from "../task-state-git/git-io.js";
import type { TaskStateGitManifestV1 } from "../task-state-git/types.js";
import { assessSnapshotTailFromManifest } from "../task-state-git/task-state-snapshot-tail-health.js";
import { isCanonicalSyncHeadFailure } from "../sync-backends/canonical-state-sync-backend.js";
import { createGitEventLogBackendFromContext } from "../sync-backends/git-event-log-backend.js";
import {
  deriveTaskStateSyncState,
  readLocalAppliedSequence
} from "./task-state-sync-status.js";
import { openPlanningStoresForTaskStateCache } from "./task-state-cache-runtime-shared.js";
import {
  readTaskStateProjectionMeta,
  taskStateProjectionMetaTableAvailable,
  type TaskStateProjectionSyncStatus
} from "./task-state-projection-meta-store.js";
import {
  canonicalEventOutboxTableAvailable,
  getOutboxStatus
} from "./canonical-event-outbox-store.js";
import type { TaskStateSyncState } from "./task-state-sync-status.js";

export type TaskStateLocalProjection = "fresh" | "behind" | "conflict" | "rebuilding" | "offline";
export type TaskStateStatusRecommendedAction =
  | "none"
  | "wait"
  | "hydrate"
  | "resolve-conflict"
  | "run-publish";

export type TaskStateOutboxStatusView = {
  pending: number;
  publishing: number;
  failed: number;
  conflict: number;
  oldestPendingAgeMs: number;
  latestPublishedAt: string | null;
};

function parseIsoMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function gitRefFromDiagnostics(diagnostics: Record<string, unknown> | undefined): string | null {
  const git = diagnostics?.git as { ref?: string } | undefined;
  return typeof git?.ref === "string" && git.ref.trim() ? git.ref.trim() : null;
}

function deriveLocalProjection(args: {
  syncState: TaskStateSyncState;
  projectionSyncStatus: TaskStateProjectionSyncStatus | null;
  localAppliedSequence: number | null;
  remoteLatestSequence: number | null;
  outbox: TaskStateOutboxStatusView;
}): TaskStateLocalProjection {
  const localSeq = typeof args.localAppliedSequence === "number" ? args.localAppliedSequence : 0;
  const remoteSeq = typeof args.remoteLatestSequence === "number" ? args.remoteLatestSequence : 0;
  const localAhead = localSeq > remoteSeq;
  const hasPending = args.outbox.pending > 0 || args.outbox.publishing > 0;
  const hasFailed = args.outbox.failed > 0 || args.outbox.conflict > 0;

  if (args.syncState === "missing") {
    return "offline";
  }
  if (args.projectionSyncStatus === "rebuilding") {
    return "rebuilding";
  }
  if (args.projectionSyncStatus === "corrupt") {
    return "conflict";
  }
  if (args.syncState === "behind") {
    return "behind";
  }
  if (args.projectionSyncStatus === "stale") {
    return "behind";
  }
  if (hasFailed) {
    return "conflict";
  }
  if (args.syncState === "conflict") {
    if (localAhead && hasPending) {
      // Queue mode: local projection can legitimately lead remote while outbox drains.
      return "fresh";
    }
    return "conflict";
  }
  return "fresh";
}

function deriveRecommendedAction(args: {
  localProjection: TaskStateLocalProjection;
  outbox: TaskStateOutboxStatusView;
  remoteBehind: boolean;
}): TaskStateStatusRecommendedAction {
  if (args.outbox.failed > 0 || args.outbox.conflict > 0 || args.localProjection === "conflict") {
    return "resolve-conflict";
  }
  if (args.localProjection === "behind" || args.localProjection === "rebuilding") {
    return "hydrate";
  }
  if (args.outbox.pending > 0 || args.outbox.publishing > 0) {
    return "wait";
  }
  if (args.remoteBehind) {
    return "run-publish";
  }
  return "none";
}

export async function runTaskStateStatus(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const fetch = args.fetch === true;
  const branch =
    typeof args.branch === "string" && args.branch.trim() ? args.branch.trim() : TASK_STATE_GIT_BRANCH;

  if (!isGitRepository(ctx.workspacePath)) {
    const outbox: TaskStateOutboxStatusView = {
      pending: 0,
      publishing: 0,
      failed: 0,
      conflict: 0,
      oldestPendingAgeMs: 0,
      latestPublishedAt: null
    };
    return {
      ok: false,
      code: "not-a-git-repo",
      message: "task-state-status requires a git workspace",
      data: {
        schemaVersion: 1,
        syncState: "missing" as const,
        localProjection: "offline" as const,
        outbox,
        remote: {
          branch,
          behind: false,
          remoteLatestSequence: null,
          remoteTipSha: null,
          lastPublishedAt: null
        },
        recommendedAction: "none" as const
      }
    };
  }

  const backend = createGitEventLogBackendFromContext(ctx, { branch });
  let fetchResult: { ok: boolean; stderr?: string } | undefined;
  let head = await backend.readHead();
  let gitRef: string | null = null;

  if (fetch) {
    const fetched = await backend.fetchEvents({ refresh: true });
    if (fetched.ok) {
      head = fetched.head;
      gitRef = gitRefFromDiagnostics(fetched.diagnostics as Record<string, unknown> | undefined);
      fetchResult = { ok: true };
    } else {
      fetchResult = { ok: false, stderr: fetched.message };
    }
  } else if (!isCanonicalSyncHeadFailure(head)) {
    const fetched = await backend.fetchEvents({ refresh: false });
    if (fetched.ok) {
      gitRef = gitRefFromDiagnostics(fetched.diagnostics as Record<string, unknown> | undefined);
    }
  }

  let resolvedHead: CanonicalStateHead | null = null;
  if (!isCanonicalSyncHeadFailure(head)) {
    resolvedHead = head;
  }
  const branchResolvable = resolvedHead !== null;
  let remoteLatestSequence: number | null = null;
  let remoteTipSha: string | null = null;
  let manifestHead: Record<string, unknown> | null = null;

  if (resolvedHead) {
    remoteTipSha = resolvedHead.backendRevision;
    remoteLatestSequence = resolvedHead.latestSequence;
    manifestHead = {
      latestSequence: resolvedHead.latestSequence,
      latestEventId: resolvedHead.latestEventId,
      latestSnapshotId: resolvedHead.latestSnapshotId
    };
  }

  const planning = await openPlanningStoresForTaskStateCache(ctx);
  const db = planning.sqliteDual.getDatabase();
  const metaAvailable = taskStateProjectionMetaTableAvailable(db);
  const projectionMeta = metaAvailable ? readTaskStateProjectionMeta(db) : null;
  const localAppliedSequence = readLocalAppliedSequence(projectionMeta);
  const outboxSnapshot = canonicalEventOutboxTableAvailable(db) ? getOutboxStatus(db) : null;
  const oldestPendingMs = parseIsoMs(outboxSnapshot?.oldestPendingCreatedAt ?? null);
  const outbox: TaskStateOutboxStatusView = {
    pending: outboxSnapshot?.counts.pending ?? 0,
    publishing: outboxSnapshot?.counts.publishing ?? 0,
    failed: outboxSnapshot?.counts.failed ?? 0,
    conflict: outboxSnapshot?.counts.conflict ?? 0,
    oldestPendingAgeMs:
      oldestPendingMs === null ? 0 : Math.max(0, Date.now() - oldestPendingMs),
    latestPublishedAt: outboxSnapshot?.latestPublishedAt ?? null
  };

  const { syncState, reason } = deriveTaskStateSyncState({
    branchResolvable,
    remoteLatestSequence,
    localAppliedSequence,
    remoteTipSha,
    localSourceCommit: projectionMeta?.sourceCommit ?? null
  });
  const localProjection = deriveLocalProjection({
    syncState,
    projectionSyncStatus: projectionMeta?.syncStatus ?? null,
    localAppliedSequence,
    remoteLatestSequence,
    outbox
  });
  const remoteBehind =
    typeof localAppliedSequence === "number" &&
    typeof remoteLatestSequence === "number" &&
    localAppliedSequence > remoteLatestSequence;
  const recommendedAction = deriveRecommendedAction({
    localProjection,
    outbox,
    remoteBehind
  });

  let snapshotTail = null;
  if (resolvedHead && gitRef && manifestHead) {
    const manifest = {
      head: {
        latestSequence: resolvedHead.latestSequence,
        latestEventId: resolvedHead.latestEventId,
        latestSnapshotId: resolvedHead.latestSnapshotId
      }
    } as TaskStateGitManifestV1;
    snapshotTail = assessSnapshotTailFromManifest(ctx.workspacePath, gitRef, manifest);
  }

  return {
    ok: true,
    code: "task-state-status-read",
    message: `Task-state sync: ${syncState}`,
    data: {
      schemaVersion: 1,
      syncState,
      reason,
      branch,
      fetchRequested: fetch,
      fetchResult,
      gitRef: branchResolvable ? gitRef : null,
      remoteTipSha,
      remoteLatestSequence,
      localAppliedSequence,
      projectionMeta,
      manifestHead,
      localProjection,
      outbox,
      remote: {
        branch,
        behind: remoteBehind,
        remoteLatestSequence,
        remoteTipSha,
        lastPublishedAt: outbox.latestPublishedAt
      },
      recommendedAction,
      snapshotTail,
      snapshotRecommendation: snapshotTail?.recommendedCommand ?? null
    }
  };
}
