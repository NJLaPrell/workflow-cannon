import type Database from "better-sqlite3";
import type {
  DashboardTaskStateDisplayState,
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
  gitSyncState: null
};

export function resolveTaskStateDisplayState(input: {
  gitSyncState: TaskStateSyncState | null;
  projectionSyncStatus: TaskStateProjectionSyncStatus | null;
  notGitRepo?: boolean;
}): { displayState: DashboardTaskStateDisplayState; remediation: string | null } {
  if (input.notGitRepo) {
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
  if (git === "conflict") {
    return {
      displayState: "conflict",
      remediation:
        "Local projection disagrees with the git branch. Repair the cache or resolve the conflict before continuing."
    };
  }
  if (git === "behind") {
    return {
      displayState: "behind",
      remediation:
        "Git branch has newer events than this machine. Background sync will catch up, or run Workflow Cannon: Sync Task State (Git)."
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
  const gitSyncState =
    notGitRepo || !statusResult.data
      ? null
      : (typeof statusResult.data.syncState === "string"
          ? (statusResult.data.syncState as TaskStateSyncState)
          : null);

  const projectionSyncStatus = meta?.syncStatus ?? "empty";
  const { displayState, remediation } = resolveTaskStateDisplayState({
    gitSyncState,
    projectionSyncStatus,
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
      gitSyncState
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
    gitSyncState
  };
}
