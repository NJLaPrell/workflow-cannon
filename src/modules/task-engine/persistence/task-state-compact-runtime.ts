import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import { isGitRepository, resolveTaskStateGitRef } from "../task-state-git/git-io.js";
import { readTaskStateBranchLayout } from "../task-state-git/read-branch-layout.js";

export async function runTaskStateCompact(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun !== false;
  const branch =
    typeof args.branch === "string" && args.branch.trim() ? args.branch.trim() : TASK_STATE_GIT_BRANCH;

  if (!isGitRepository(ctx.workspacePath)) {
    return { ok: false, code: "not-a-git-repo", message: "task-state-compact requires a git workspace" };
  }

  const resolved = resolveTaskStateGitRef(ctx.workspacePath, branch);
  if ("missing" in resolved) {
    return {
      ok: false,
      code: "task-state-branch-missing",
      message: `Branch ${branch} missing`
    };
  }

  const layoutRead = readTaskStateBranchLayout(ctx.workspacePath, resolved.ref, resolved.tipSha);
  if (!layoutRead.ok) {
    return { ok: false, code: layoutRead.code, message: layoutRead.message };
  }

  const retention = layoutRead.layout.manifest.retention;
  const segmentCount = layoutRead.layout.eventSegmentPaths.length;
  const latestSnapshotId = layoutRead.layout.manifest.head.latestSnapshotId;

  const plan = {
    schemaVersion: 1,
    dryRun,
    branch,
    latestSequence: layoutRead.layout.manifest.head.latestSequence,
    latestSnapshotId,
    segmentCount,
    retentionMaxEventSegments: retention?.maxEventSegments ?? null,
    retentionMaxSnapshots: retention?.maxSnapshots ?? null,
    wouldRetainSegments: segmentCount,
    note:
      dryRun
        ? "Compaction dry-run only; pass dryRun:false with policyApproval to apply (not yet implemented)."
        : "Apply compaction is not implemented; use task-state-snapshot plus manual retention policy review."
  };

  if (!dryRun) {
    return {
      ok: false,
      code: "task-state-compact-apply-not-implemented",
      message: "Compaction apply is not implemented; run with dryRun:true (default) to review retention plan",
      data: plan
    };
  }

  return {
    ok: true,
    code: "task-state-compact-dry-run",
    message: "Compaction dry-run: retention plan computed",
    data: plan
  };
}
