import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import {
  gitFetchTaskStateBranch,
  isGitRepository,
  resolveTaskStateGitRef
} from "../task-state-git/git-io.js";
import { readTaskStateBranchLayout } from "../task-state-git/read-branch-layout.js";
import {
  deriveTaskStateSyncState,
  readLocalAppliedSequence
} from "./task-state-sync-status.js";
import { openPlanningStoresForTaskStateCache } from "./task-state-cache-runtime-shared.js";
import { readTaskStateProjectionMeta, taskStateProjectionMetaTableAvailable } from "./task-state-projection-meta-store.js";

export async function runTaskStateStatus(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const fetch = args.fetch === true;
  const branch =
    typeof args.branch === "string" && args.branch.trim() ? args.branch.trim() : TASK_STATE_GIT_BRANCH;

  if (!isGitRepository(ctx.workspacePath)) {
    return {
      ok: false,
      code: "not-a-git-repo",
      message: "task-state-status requires a git workspace",
      data: { schemaVersion: 1, syncState: "missing" as const }
    };
  }

  let fetchResult: { ok: boolean; stderr?: string } | undefined;
  if (fetch) {
    const fr = gitFetchTaskStateBranch(ctx.workspacePath, branch);
    fetchResult = { ok: fr.ok, stderr: fr.stderr || undefined };
  }

  const resolved = resolveTaskStateGitRef(ctx.workspacePath, branch);
  let remoteLatestSequence: number | null = null;
  let remoteTipSha: string | null = null;
  let manifestHead: Record<string, unknown> | null = null;

  if (!("missing" in resolved)) {
    remoteTipSha = resolved.tipSha;
    const layout = readTaskStateBranchLayout(ctx.workspacePath, resolved.ref, resolved.tipSha);
    if (layout.ok) {
      remoteLatestSequence = layout.layout.manifest.head.latestSequence;
      manifestHead = layout.layout.manifest.head as unknown as Record<string, unknown>;
    }
  }

  const planning = await openPlanningStoresForTaskStateCache(ctx);
  const db = planning.sqliteDual.getDatabase();
  const metaAvailable = taskStateProjectionMetaTableAvailable(db);
  const projectionMeta = metaAvailable ? readTaskStateProjectionMeta(db) : null;
  const localAppliedSequence = readLocalAppliedSequence(projectionMeta);

  const { syncState, reason } = deriveTaskStateSyncState({
    branchResolvable: !("missing" in resolved),
    remoteLatestSequence,
    localAppliedSequence,
    remoteTipSha,
    localSourceCommit: projectionMeta?.sourceCommit ?? null
  });

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
      gitRef: "missing" in resolved ? null : resolved.ref,
      remoteTipSha,
      remoteLatestSequence,
      localAppliedSequence,
      projectionMeta,
      manifestHead,
      triedRefs: "missing" in resolved ? resolved.tried : undefined
    }
  };
}
