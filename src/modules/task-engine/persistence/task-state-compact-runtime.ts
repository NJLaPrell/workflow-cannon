import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import { createGitEventLogBackendFromContext } from "../sync-backends/git-event-log-backend.js";

export async function runTaskStateCompact(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun !== false;
  const branch =
    typeof args.branch === "string" && args.branch.trim() ? args.branch.trim() : TASK_STATE_GIT_BRANCH;

  const backend = createGitEventLogBackendFromContext(ctx, { branch });
  const result = await backend.compact!({ dryRun });

  const gitDiag = result.diagnostics?.git as
    | { branch?: string; retentionMaxEventSegments?: number | null; retentionMaxSnapshots?: number | null }
    | undefined;
  const plan = {
    schemaVersion: 1,
    dryRun: result.dryRun,
    branch: gitDiag?.branch ?? branch,
    latestSequence: result.latestSequence,
    latestSnapshotId: result.latestSnapshotId,
    segmentCount: result.retainedEventSegmentCount,
    retentionMaxEventSegments: gitDiag?.retentionMaxEventSegments ?? null,
    retentionMaxSnapshots: gitDiag?.retentionMaxSnapshots ?? null,
    wouldRetainSegments: result.retainedEventSegmentCount,
    note:
      dryRun
        ? "Compaction dry-run only; pass dryRun:false with policyApproval to apply (not yet implemented)."
        : "Apply compaction is not implemented; use task-state-snapshot plus manual retention policy review."
  };

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      data: plan
    };
  }

  return {
    ok: true,
    code: result.code,
    message: result.message,
    data: plan
  };
}
