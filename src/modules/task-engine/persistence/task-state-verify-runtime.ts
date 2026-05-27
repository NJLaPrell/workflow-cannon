import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { TASK_STATE_GIT_BRANCH, TASK_STATE_ROOT_DIR } from "../task-state-git/constants.js";
import {
  isGitRepository,
  resolveTaskStateGitRef,
  runGit
} from "../task-state-git/git-io.js";
import {
  readEventSegmentsJsonl,
  readTaskStateBranchLayout,
  segmentPathsThroughHead
} from "../task-state-git/read-branch-layout.js";
import { verifyTaskStateLayoutInWorkspace, verifyTaskStateLayoutOnDisk } from "../task-state-git/verify-layout.js";

function materializeGitLayoutToTemp(
  workspacePath: string,
  ref: string
): { ok: true; tempRoot: string } | { ok: false; code: string; message: string } {
  const tipSha = runGit(workspacePath, ["rev-parse", ref]).stdout.trim();
  const layoutRead = readTaskStateBranchLayout(workspacePath, ref, tipSha);
  if (!layoutRead.ok) {
    return layoutRead;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wk-task-state-verify-"));
  const segmentPaths =
    layoutRead.layout.eventSegmentPaths.length > 0
      ? layoutRead.layout.eventSegmentPaths
      : segmentPathsThroughHead(layoutRead.layout.manifest);

  const manifestText = runGit(workspacePath, ["show", `${ref}:${TASK_STATE_ROOT_DIR}/manifest.json`]).stdout;
  if (!manifestText) {
    return { ok: false, code: "task-state-manifest-missing", message: "Could not read manifest from git ref" };
  }
  fs.mkdirSync(path.join(tempRoot, TASK_STATE_ROOT_DIR), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, TASK_STATE_ROOT_DIR, "manifest.json"), `${manifestText}\n`, "utf8");

  const eventsRead = readEventSegmentsJsonl(workspacePath, ref, segmentPaths);
  if (!eventsRead.ok) {
    return { ok: false, code: eventsRead.code, message: eventsRead.message };
  }

  for (const segmentPath of segmentPaths) {
    const show = runGit(workspacePath, ["show", `${ref}:${segmentPath}`]);
    if (!show.ok) {
      return {
        ok: false,
        code: "task-state-event-segment-missing",
        message: `Missing segment ${segmentPath}`
      };
    }
    const abs = path.join(tempRoot, segmentPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const text = show.stdout;
    fs.writeFileSync(abs, text.endsWith("\n") ? text : `${text ? `${text}\n` : ""}`, "utf8");
  }

  const snapshotId = layoutRead.layout.manifest.head.latestSnapshotId;
  if (snapshotId) {
    const contentPath = `${TASK_STATE_ROOT_DIR}/snapshots/${snapshotId}.json`;
    const metaPath = `${TASK_STATE_ROOT_DIR}/snapshots/${snapshotId}.meta.json`;
    for (const rel of [contentPath, metaPath]) {
      const show = runGit(workspacePath, ["show", `${ref}:${rel}`]);
      if (show.ok && show.stdout) {
        const abs = path.join(tempRoot, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, show.stdout.endsWith("\n") ? show.stdout : `${show.stdout}\n`, "utf8");
      }
    }
  }

  return { ok: true, tempRoot };
}

export async function runTaskStateVerify(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const branch =
    typeof args.branch === "string" && args.branch.trim() ? args.branch.trim() : TASK_STATE_GIT_BRANCH;
  const layoutRoot =
    typeof args.layoutRoot === "string" && args.layoutRoot.trim()
      ? path.resolve(ctx.workspacePath, args.layoutRoot.trim())
      : ctx.workspacePath;
  const source =
    typeof args.source === "string" && args.source.trim() ? args.source.trim() : "auto";

  let verifyResult;
  let sourceUsed: string;
  let tempRoot: string | null = null;

  try {
    if (source === "local") {
      sourceUsed = layoutRoot;
      verifyResult = verifyTaskStateLayoutOnDisk(layoutRoot);
    } else if (source === "git") {
      if (!isGitRepository(ctx.workspacePath)) {
        return {
          ok: false,
          code: "not-a-git-repo",
          message: "task-state-verify with source=git requires a git workspace"
        };
      }
      const resolved = resolveTaskStateGitRef(ctx.workspacePath, branch);
      if ("missing" in resolved) {
        return {
          ok: true,
          code: "task-state-verify-failed",
          message: `Branch ${branch} is not available`,
          data: {
            schemaVersion: 1,
            passed: false,
            findingCount: 1,
            findings: [{ code: "branch-missing", message: `Branch ${branch} is not available` }],
            source: "git",
            branch
          }
        };
      }
      const materialized = materializeGitLayoutToTemp(ctx.workspacePath, resolved.ref);
      if (!materialized.ok) {
        return { ok: false, code: materialized.code, message: materialized.message };
      }
      tempRoot = materialized.tempRoot;
      sourceUsed = `git:${resolved.ref}`;
      verifyResult = verifyTaskStateLayoutOnDisk(tempRoot);
    } else {
      // auto: prefer git branch when present, else local workspace task-state/
      if (isGitRepository(ctx.workspacePath)) {
        const resolved = resolveTaskStateGitRef(ctx.workspacePath, branch);
        if (!("missing" in resolved)) {
          const materialized = materializeGitLayoutToTemp(ctx.workspacePath, resolved.ref);
          if (materialized.ok) {
            tempRoot = materialized.tempRoot;
            sourceUsed = `git:${resolved.ref}`;
            verifyResult = verifyTaskStateLayoutOnDisk(tempRoot);
          } else {
            sourceUsed = layoutRoot;
            verifyResult = verifyTaskStateLayoutOnDisk(layoutRoot);
          }
        } else {
          sourceUsed = layoutRoot;
          verifyResult = verifyTaskStateLayoutInWorkspace(layoutRoot);
        }
      } else {
        sourceUsed = layoutRoot;
        verifyResult = verifyTaskStateLayoutInWorkspace(layoutRoot);
      }
    }
  } finally {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  return {
    ok: true,
    code: verifyResult.passed ? "task-state-verify-passed" : "task-state-verify-failed",
    message: verifyResult.passed
      ? "Task-state layout verification passed"
      : `Task-state layout verification found ${verifyResult.findingCount} issue(s)`,
    data: {
      schemaVersion: 1,
      passed: verifyResult.passed,
      findingCount: verifyResult.findingCount,
      findings: verifyResult.findings,
      source: sourceUsed,
      branch
    }
  };
}
