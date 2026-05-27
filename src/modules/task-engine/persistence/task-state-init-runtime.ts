import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { admitTaskStateEventStream } from "../task-state-events/event-admission.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import {
  DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE,
  readTaskStateEventLogJsonl,
  resolveTaskStateEventLogPath
} from "../task-state-events/task-state-event-log-io.js";
import { TASK_STATE_GIT_BRANCH, TASK_STATE_MANIFEST_RELATIVE } from "../task-state-git/constants.js";
import { createDefaultTaskStateGitManifest } from "../task-state-git/manifest-defaults.js";
import {
  isGitRepository,
  remoteBranchHeadSha,
  removeGitWorktree,
  resolveTaskStateGitRef,
  runGit
} from "../task-state-git/git-io.js";
import { digestTaskStateCanonicalJson } from "../task-state-git/integrity.js";
import {
  resolveEventSegmentRelativePath,
  resolveSnapshotContentRelativePath,
  resolveSnapshotMetaRelativePath
} from "../task-state-git/layout.js";
import type { TaskStateGitSnapshotMetaV1 } from "../task-state-git/types.js";
import { openPlanningStoresForTaskStateCache } from "./task-state-cache-runtime-shared.js";

const DEFAULT_SNAPSHOT_ID = "bootstrap";

function maxEventSequence(events: TaskStateEventV1[]): {
  latestSequence: number;
  latestEventId: string | null;
} {
  if (events.length === 0) {
    return { latestSequence: 0, latestEventId: null };
  }
  let latestSequence = 0;
  let latestEventId: string | null = null;
  for (const event of events) {
    if (event.sequence > latestSequence) {
      latestSequence = event.sequence;
      latestEventId = event.eventId;
    }
  }
  return { latestSequence, latestEventId };
}

export function buildSnapshotContentFromSqlite(document: {
  tasks: unknown[];
  transitionLog: unknown[];
  mutationLog?: unknown[];
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    projectionKind: "task-store-document",
    tasks: document.tasks,
    transitions: document.transitionLog,
    mutations: document.mutationLog ?? []
  };
}

function writeBranchLayoutFiles(
  worktreeRoot: string,
  input: {
    manifestJson: string;
    segmentRelativePath: string;
    segmentBody: string;
    snapshotId: string;
    snapshotContentJson: string;
    snapshotMetaJson: string;
  }
): void {
  const manifestAbs = path.join(worktreeRoot, TASK_STATE_MANIFEST_RELATIVE);
  const segmentAbs = path.join(worktreeRoot, input.segmentRelativePath);
  const snapshotContentAbs = path.join(worktreeRoot, resolveSnapshotContentRelativePath(input.snapshotId));
  const snapshotMetaAbs = path.join(worktreeRoot, resolveSnapshotMetaRelativePath(input.snapshotId));
  for (const abs of [manifestAbs, segmentAbs, snapshotContentAbs, snapshotMetaAbs]) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
  }
  fs.writeFileSync(manifestAbs, input.manifestJson, "utf8");
  fs.writeFileSync(segmentAbs, input.segmentBody, "utf8");
  fs.writeFileSync(snapshotContentAbs, input.snapshotContentJson, "utf8");
  fs.writeFileSync(snapshotMetaAbs, input.snapshotMetaJson, "utf8");
}

export async function runTaskStateInit(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;
  const overwriteExisting = args.overwriteExisting === true;
  const push = args.push !== false;
  const branch =
    typeof args.branch === "string" && args.branch.trim() ? args.branch.trim() : TASK_STATE_GIT_BRANCH;
  const snapshotId =
    typeof args.snapshotId === "string" && args.snapshotId.trim()
      ? args.snapshotId.trim()
      : DEFAULT_SNAPSHOT_ID;

  if (!isGitRepository(ctx.workspacePath)) {
    return { ok: false, code: "not-a-git-repo", message: "task-state-init requires a git workspace" };
  }

  const localRef = resolveTaskStateGitRef(ctx.workspacePath, branch);
  const remoteSha = remoteBranchHeadSha(ctx.workspacePath, branch);
  const branchExists = !("missing" in localRef) || remoteSha !== null;

  if (branchExists && !overwriteExisting) {
    return {
      ok: false,
      code: "task-state-branch-exists",
      message: `Refusing to overwrite existing task-state branch ${branch}; pass overwriteExisting:true with policyApproval`,
      data: {
        schemaVersion: 1,
        branch,
        localRef: "missing" in localRef ? null : localRef,
        remoteSha,
        remediation: "Set overwriteExisting:true only when intentionally replacing canonical remote history."
      }
    };
  }

  const planning = await openPlanningStoresForTaskStateCache(ctx);
  const document = planning.sqliteDual.taskDocument;
  const snapshotContent = buildSnapshotContentFromSqlite(document);
  const contentDigest = digestTaskStateCanonicalJson(snapshotContent);

  const rawEvents = readTaskStateEventLogJsonl(ctx.workspacePath);
  const admitted = admitTaskStateEventStream(rawEvents);
  if (!admitted.ok) {
    return {
      ok: false,
      code: "task-state-event-admission-rejected",
      message: admitted.error.message,
      data: { admissionCode: admitted.error.code }
    };
  }
  const { latestSequence, latestEventId } = maxEventSequence(admitted.events);
  const segmentRelativePath = resolveEventSegmentRelativePath(0);
  const segmentLines =
    admitted.events.length > 0
      ? admitted.events.map((event) => JSON.stringify(event))
      : [];
  const segmentBody =
    segmentLines.length > 0
      ? `${segmentLines.join("\n")}\n`
      : "# task-state event segment 0 — canonical JSONL (one TaskStateEventV1 per line)\n";

  const recordedAt = new Date().toISOString();
  const snapshotMeta: TaskStateGitSnapshotMetaV1 = {
    schemaVersion: 1,
    snapshotId,
    throughSequence: latestSequence,
    throughEventId: latestEventId ?? "bootstrap",
    recordedAt,
    contentPath: resolveSnapshotContentRelativePath(snapshotId),
    contentDigest,
    taskCount: document.tasks.length
  };

  const manifest = createDefaultTaskStateGitManifest({
    head: {
      latestSequence,
      latestEventId,
      latestSegmentPath: segmentRelativePath,
      latestSnapshotId: snapshotId
    }
  });

  const preview = {
    schemaVersion: 1,
    dryRun,
    branch,
    overwriteExisting,
    push,
    snapshotId,
    taskCount: document.tasks.length,
    eventCount: admitted.events.length,
    latestSequence,
    segmentRelativePath,
    manifestRelativePath: TASK_STATE_MANIFEST_RELATIVE,
    localBranchExists: !("missing" in localRef),
    remoteSha
  };

  if (dryRun) {
    return {
      ok: true,
      code: "task-state-init-dry-run",
      message: "Dry run: would bootstrap task-state branch from SQLite projection",
      data: preview
    };
  }

  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), "wk-task-state-init-"));
  let commitSha: string | null = null;
  let pushOk = false;
  let pushStderr: string | undefined;

  try {
    const add = runGit(ctx.workspacePath, ["worktree", "add", "-B", branch, worktreePath, "HEAD"]);
    if (!add.ok) {
      return {
        ok: false,
        code: "task-state-worktree-failed",
        message: `git worktree add failed: ${add.stderr || add.stdout}`,
        data: preview
      };
    }

    writeBranchLayoutFiles(worktreePath, {
      manifestJson: `${JSON.stringify(manifest, null, 2)}\n`,
      segmentRelativePath,
      segmentBody,
      snapshotId,
      snapshotContentJson: `${JSON.stringify(snapshotContent, null, 2)}\n`,
      snapshotMetaJson: `${JSON.stringify(snapshotMeta, null, 2)}\n`
    });

    runGit(worktreePath, ["add", "task-state"]);
    const commit = runGit(worktreePath, [
      "commit",
      "-m",
      `chore(task-state): bootstrap ${branch} from SQLite projection`
    ]);
    if (!commit.ok) {
      return {
        ok: false,
        code: "task-state-init-commit-failed",
        message: commit.stderr || commit.stdout || "commit failed",
        data: preview
      };
    }
    commitSha = runGit(worktreePath, ["rev-parse", "HEAD"]).stdout.trim() || null;

    if (push) {
      const pushArgs = overwriteExisting && remoteSha ? ["push", "--force-with-lease", "-u", "origin", branch] : ["push", "-u", "origin", branch];
      const pushed = runGit(ctx.workspacePath, pushArgs);
      pushOk = pushed.ok;
      pushStderr = pushed.stderr || undefined;
      if (!pushed.ok) {
        return {
          ok: false,
          code: "task-state-init-push-failed",
          message: pushed.stderr || pushed.stdout || "git push failed",
          data: { ...preview, commitSha, pushStderr }
        };
      }
    }
  } finally {
    removeGitWorktree(ctx.workspacePath, worktreePath);
  }

  return {
    ok: true,
    code: "task-state-init-complete",
    message: `Bootstrapped ${branch} from SQLite task projection`,
    data: {
      ...preview,
      commitSha,
      pushOk,
      pushStderr,
      contentDigest,
      manifestDigest: manifest.manifestDigest
    }
  };
}
