import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { TASK_STATE_GIT_BRANCH, TASK_STATE_MANIFEST_RELATIVE } from "../task-state-git/constants.js";
import { digestTaskStateCanonicalJson } from "../task-state-git/integrity.js";
import {
  isGitRepository,
  removeGitWorktree,
  resolveTaskStateGitRef,
  runGit
} from "../task-state-git/git-io.js";
import { resolveSnapshotContentRelativePath, resolveSnapshotMetaRelativePath } from "../task-state-git/layout.js";
import { readTaskStateBranchLayout } from "../task-state-git/read-branch-layout.js";
import type { TaskStateGitManifestV1, TaskStateGitSnapshotMetaV1 } from "../task-state-git/types.js";
import { computeManifestDigest } from "../task-state-git/validate-manifest.js";
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

  if (!isGitRepository(ctx.workspacePath)) {
    return { ok: false, code: "not-a-git-repo", message: "task-state-snapshot requires a git workspace" };
  }

  const resolved = resolveTaskStateGitRef(ctx.workspacePath, branch);
  if ("missing" in resolved) {
    return {
      ok: false,
      code: "task-state-branch-missing",
      message: `Branch ${branch} missing; run task-state-init first`
    };
  }

  const layoutRead = readTaskStateBranchLayout(ctx.workspacePath, resolved.ref, resolved.tipSha);
  if (!layoutRead.ok) {
    return { ok: false, code: layoutRead.code, message: layoutRead.message };
  }

  const planning = await openPlanningStoresForTaskStateCache(ctx);
  const document = planning.sqliteDual.taskDocument;
  const snapshotContent = buildSnapshotContentFromSqlite(document);
  const contentDigest = digestTaskStateCanonicalJson(snapshotContent);
  const throughSequence = layoutRead.layout.manifest.head.latestSequence;
  const throughEventId = layoutRead.layout.manifest.head.latestEventId ?? "none";

  const snapshotMeta: TaskStateGitSnapshotMetaV1 = {
    schemaVersion: 1,
    snapshotId,
    throughSequence,
    throughEventId,
    recordedAt: new Date().toISOString(),
    contentPath: resolveSnapshotContentRelativePath(snapshotId),
    contentDigest,
    taskCount: document.tasks.length
  };

  const nextManifest: TaskStateGitManifestV1 = {
    ...layoutRead.layout.manifest,
    head: {
      ...layoutRead.layout.manifest.head,
      latestSnapshotId: snapshotId
    }
  };
  nextManifest.manifestDigest = computeManifestDigest(nextManifest);

  const preview = {
    schemaVersion: 1,
    dryRun,
    branch,
    snapshotId,
    throughSequence,
    contentDigest,
    taskCount: document.tasks.length
  };

  if (dryRun) {
    return {
      ok: true,
      code: "task-state-snapshot-dry-run",
      message: "Dry run: would write snapshot files on canonical branch",
      data: preview
    };
  }

  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), "wk-task-state-snapshot-"));
  try {
    const add = runGit(ctx.workspacePath, ["worktree", "add", "--detach", worktreePath, resolved.tipSha]);
    if (!add.ok) {
      return {
        ok: false,
        code: "task-state-worktree-failed",
        message: add.stderr || add.stdout || "worktree add failed"
      };
    }
    const contentAbs = path.join(worktreePath, resolveSnapshotContentRelativePath(snapshotId));
    const metaAbs = path.join(worktreePath, resolveSnapshotMetaRelativePath(snapshotId));
    const manifestAbs = path.join(worktreePath, TASK_STATE_MANIFEST_RELATIVE);
    for (const abs of [contentAbs, metaAbs]) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
    }
    fs.writeFileSync(contentAbs, `${JSON.stringify(snapshotContent, null, 2)}\n`, "utf8");
    fs.writeFileSync(metaAbs, `${JSON.stringify(snapshotMeta, null, 2)}\n`, "utf8");
    fs.writeFileSync(manifestAbs, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
    runGit(worktreePath, ["add", "task-state"]);
    const commit = runGit(worktreePath, ["commit", "-m", `chore(task-state): snapshot ${snapshotId}`]);
    if (!commit.ok) {
      return {
        ok: false,
        code: "task-state-snapshot-commit-failed",
        message: commit.stderr || commit.stdout || "commit failed"
      };
    }
    const commitSha = runGit(worktreePath, ["rev-parse", "HEAD"]).stdout.trim();
    runGit(ctx.workspacePath, ["branch", "-f", branch, commitSha]);
    const push = runGit(ctx.workspacePath, ["push", "-u", "origin", branch]);
    if (!push.ok) {
      return {
        ok: false,
        code: "task-state-snapshot-push-failed",
        message: push.stderr || push.stdout || "push failed"
      };
    }
  } finally {
    removeGitWorktree(ctx.workspacePath, worktreePath);
  }

  return {
    ok: true,
    code: "task-state-snapshot-created",
    message: `Created snapshot ${snapshotId} on ${branch}`,
    data: preview
  };
}
