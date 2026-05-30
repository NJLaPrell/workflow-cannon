import type Database from "better-sqlite3";
import type {
  DashboardTaskStateDisplayState,
  DashboardTaskStateLocalProjection,
  DashboardTaskStateProjectionSummary
} from "../../../contracts/dashboard-summary-run.js";
import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { runTaskStateStatus } from "../persistence/task-state-status-runtime.js";
import {
  readTaskStateProjectionMeta,
  taskStateProjectionMetaTableAvailable,
  type TaskStateProjectionSyncStatus
} from "../persistence/task-state-projection-meta-store.js";
import type { TaskStateSyncState } from "../persistence/task-state-sync-status.js";

const DEFAULT_OUTBOX: DashboardTaskStateProjectionSummary["outbox"] = {
  pending: 0,
  publishing: 0,
  failed: 0,
  conflict: 0,
  oldestPendingAgeMs: 0,
  latestPublishedAt: null
};

const DEFAULT_REMOTE: DashboardTaskStateProjectionSummary["remote"] = {
  branch: "workflow-cannon/task-state",
  behind: false,
  remoteLatestSequence: null,
  remoteTipSha: null,
  lastPublishedAt: null
};

const EMPTY: DashboardTaskStateProjectionSummary = {
  schemaVersion: 1,
  available: false,
  backend: null,
  appliedSequence: null,
  sourceCommit: null,
  syncStatus: null,
  updatedAt: null,
  displayState: "offline",
  remediation: "Task-state projection metadata is unavailable (kit SQLite user_version < 28).",
  gitSyncState: null,
  localProjection: "offline",
  outbox: { ...DEFAULT_OUTBOX },
  remote: { ...DEFAULT_REMOTE },
  recommendedAction: "none"
};

export function resolveTaskStateDisplayState(input: {
  gitSyncState: TaskStateSyncState | null;
  projectionSyncStatus: TaskStateProjectionSyncStatus | null;
  localProjection?: DashboardTaskStateLocalProjection | null;
  outbox?: DashboardTaskStateProjectionSummary["outbox"] | null;
  recommendedAction?: DashboardTaskStateProjectionSummary["recommendedAction"] | null;
  notGitRepo?: boolean;
}): { displayState: DashboardTaskStateDisplayState; remediation: string | null } {
  if (input.notGitRepo || input.localProjection === "offline") {
    return {
      displayState: "offline",
      remediation: "Task-state git sync requires a git workspace with the canonical branch."
    };
  }

  const git = input.gitSyncState;
  if (git === "missing") {
    return {
      displayState: "offline",
      remediation:
        "Canonical workflow-cannon/task-state branch is missing locally. Run background sync or Workflow Cannon: Sync Task State (Git)."
    };
  }
  const outbox = input.outbox ?? DEFAULT_OUTBOX;
  const hasOutboxError = outbox.failed > 0 || outbox.conflict > 0;
  if (hasOutboxError || input.localProjection === "conflict" || git === "conflict") {
    const recovery =
      input.recommendedAction === "resolve-conflict"
        ? "Run recovery once queue contention/conflicts are resolved."
        : "Repair the cache or resolve the conflict before continuing.";
    return {
      displayState: "conflict",
      remediation: `Local sync has conflict/failed outbox entries. ${recovery}`
    };
  }
  if (
    git === "behind" ||
    input.localProjection === "behind" ||
    input.localProjection === "rebuilding"
  ) {
    const recovery =
      input.recommendedAction === "hydrate"
        ? "Run task-state-hydrate/apply-task-state-events when background sync does not catch up."
        : "Background sync will catch up.";
    return {
      displayState: "behind",
      remediation: `Git branch has newer events than this machine. ${recovery}`
    };
  }

  const ps = input.projectionSyncStatus;
  if (ps === "stale" || ps === "corrupt" || ps === "rebuilding") {
    return {
      displayState: "behind",
      remediation:
        "Local projection is behind the canonical event log. Run apply-task-state-events or wait for background sync."
    };
  }

  if (outbox.pending > 0 || outbox.publishing > 0) {
    return {
      displayState: "syncing",
      remediation: "Pending local events are queued for publish; no manual recovery is required."
    };
  }

  return { displayState: "current", remediation: null };
}

/** Read-only projection cursor + git alignment for dashboard (no git fetch). */
export async function buildDashboardTaskStateProjectionSummary(
  ctx: ModuleLifecycleContext,
  db: Database.Database | undefined
): Promise<DashboardTaskStateProjectionSummary> {
  if (!db || !taskStateProjectionMetaTableAvailable(db)) {
    return { ...EMPTY };
  }

  const meta = readTaskStateProjectionMeta(db);
  const statusResult = await runTaskStateStatus(ctx, { fetch: false });
  const notGitRepo = statusResult.code === "not-a-git-repo";
  const statusData =
    statusResult.data && typeof statusResult.data === "object"
      ? (statusResult.data as Record<string, unknown>)
      : null;
  const gitSyncState =
    notGitRepo || !statusData
      ? null
      : (typeof statusData.syncState === "string"
          ? (statusData.syncState as TaskStateSyncState)
          : null);
  const outboxRaw =
    statusData?.outbox && typeof statusData.outbox === "object" ? (statusData.outbox as Record<string, unknown>) : null;
  const outbox = {
    pending:
      typeof outboxRaw?.pending === "number" && Number.isFinite(outboxRaw.pending)
        ? outboxRaw.pending
        : 0,
    publishing:
      typeof outboxRaw?.publishing === "number" && Number.isFinite(outboxRaw.publishing)
        ? outboxRaw.publishing
        : 0,
    failed:
      typeof outboxRaw?.failed === "number" && Number.isFinite(outboxRaw.failed)
        ? outboxRaw.failed
        : 0,
    conflict:
      typeof outboxRaw?.conflict === "number" && Number.isFinite(outboxRaw.conflict)
        ? outboxRaw.conflict
        : 0,
    oldestPendingAgeMs:
      typeof outboxRaw?.oldestPendingAgeMs === "number" &&
      Number.isFinite(outboxRaw.oldestPendingAgeMs)
        ? outboxRaw.oldestPendingAgeMs
        : 0,
    latestPublishedAt:
      typeof outboxRaw?.latestPublishedAt === "string" && outboxRaw.latestPublishedAt.trim()
        ? outboxRaw.latestPublishedAt
        : null
  };
  const remoteRaw =
    statusData?.remote && typeof statusData.remote === "object" ? (statusData.remote as Record<string, unknown>) : null;
  const remote = {
    branch:
      typeof remoteRaw?.branch === "string" && remoteRaw.branch.trim()
        ? remoteRaw.branch.trim()
        : DEFAULT_REMOTE.branch,
    behind: remoteRaw?.behind === true,
    remoteLatestSequence:
      typeof remoteRaw?.remoteLatestSequence === "number" && Number.isFinite(remoteRaw.remoteLatestSequence)
        ? remoteRaw.remoteLatestSequence
        : null,
    remoteTipSha:
      typeof remoteRaw?.remoteTipSha === "string" && remoteRaw.remoteTipSha.trim()
        ? remoteRaw.remoteTipSha.trim()
        : null,
    lastPublishedAt:
      typeof remoteRaw?.lastPublishedAt === "string" && remoteRaw.lastPublishedAt.trim()
        ? remoteRaw.lastPublishedAt.trim()
        : null
  };
  const localProjectionRaw =
    typeof statusData?.localProjection === "string" ? statusData.localProjection.trim() : "";
  const localProjection: DashboardTaskStateLocalProjection =
    localProjectionRaw === "fresh" ||
    localProjectionRaw === "behind" ||
    localProjectionRaw === "conflict" ||
    localProjectionRaw === "rebuilding" ||
    localProjectionRaw === "offline"
      ? localProjectionRaw
      : notGitRepo
        ? "offline"
        : "fresh";
  const recommendedActionRaw =
    typeof statusData?.recommendedAction === "string" ? statusData.recommendedAction.trim() : "";
  const recommendedAction =
    recommendedActionRaw === "none" ||
    recommendedActionRaw === "wait" ||
    recommendedActionRaw === "hydrate" ||
    recommendedActionRaw === "resolve-conflict" ||
    recommendedActionRaw === "run-publish"
      ? recommendedActionRaw
      : "none";

  const projectionSyncStatus = meta?.syncStatus ?? "empty";
  const { displayState, remediation } = resolveTaskStateDisplayState({
    gitSyncState,
    projectionSyncStatus,
    localProjection,
    outbox,
    recommendedAction,
    notGitRepo
  });

  if (!meta) {
    return {
      schemaVersion: 1,
      available: true,
      backend: "git-event-log",
      appliedSequence: 0,
      sourceCommit: null,
      syncStatus: "empty",
      updatedAt: null,
      displayState,
      remediation,
      gitSyncState,
      localProjection,
      outbox,
      remote,
      recommendedAction
    };
  }

  return {
    schemaVersion: 1,
    available: true,
    backend: meta.backend,
    appliedSequence: meta.appliedSequence,
    sourceCommit: meta.sourceCommit,
    syncStatus: meta.syncStatus,
    updatedAt: meta.updatedAt,
    displayState,
    remediation,
    gitSyncState,
    localProjection,
    outbox,
    remote,
    recommendedAction
  };
}
