import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import { createGitEventLogBackendFromContext } from "../sync-backends/git-event-log-backend.js";
import type { TaskStateSnapshotContentV1 } from "../task-state-git/snapshot-projection.js";
import { buildSnapshotContentFromSqlite } from "./task-state-init-runtime.js";
import { openPlanningStoresForTaskStateCache } from "./task-state-cache-runtime-shared.js";

export async function runTaskStateSnapshot(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;
  const branch =
    typeof args.branch === "string" && args.branch.trim() ? args.branch.trim() : TASK_STATE_GIT_BRANCH;
  const snapshotId =
    typeof args.snapshotId === "string" && args.snapshotId.trim()
      ? args.snapshotId.trim()
      : `snap-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const backend = createGitEventLogBackendFromContext(ctx, {
    branch,
    buildSnapshotContent: async (): Promise<TaskStateSnapshotContentV1> => {
      const planning = await openPlanningStoresForTaskStateCache(ctx);
      return buildSnapshotContentFromSqlite(planning.sqliteDual.taskDocument) as TaskStateSnapshotContentV1;
    }
  });

  const result = await backend.snapshot!({ dryRun, snapshotId });

  const preview = {
    schemaVersion: 1,
    dryRun: result.dryRun,
    branch,
    snapshotId: result.snapshotId,
    throughSequence: result.throughSequence,
    contentDigest: result.contentDigest,
    taskCount: result.taskCount ?? 0
  };

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      data: preview
    };
  }

  return {
    ok: true,
    code: result.code,
    message: result.message,
    data: preview
  };
}
