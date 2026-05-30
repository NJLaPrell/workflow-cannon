import path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { CanonicalStateVerifyResult } from "../../../contracts/canonical-state-sync-backend.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import { isGitRepository } from "../task-state-git/git-io.js";
import { verifyTaskStateLayoutInWorkspace, verifyTaskStateLayoutOnDisk } from "../task-state-git/verify-layout.js";
import { isCanonicalSyncHeadFailure } from "../sync-backends/canonical-state-sync-backend.js";
import { createGitEventLogBackendFromContext } from "../sync-backends/git-event-log-backend.js";

function gitRefFromDiagnostics(diagnostics: CanonicalStateVerifyResult["diagnostics"]): string | null {
  const git = diagnostics?.git as { ref?: string } | undefined;
  return typeof git?.ref === "string" && git.ref.trim() ? git.ref.trim() : null;
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

  let verifyResult: CanonicalStateVerifyResult;
  let sourceUsed: string;

  if (source === "local") {
    sourceUsed = layoutRoot;
    const local = verifyTaskStateLayoutOnDisk(layoutRoot);
    verifyResult = {
      passed: local.passed,
      findingCount: local.findingCount,
      findings: local.findings.map((finding) => ({
        code: String(finding.code),
        message: finding.message,
        path: finding.path
      }))
    };
  } else if (source === "git") {
    if (!isGitRepository(ctx.workspacePath)) {
      return {
        ok: false,
        code: "not-a-git-repo",
        message: "task-state-verify with source=git requires a git workspace"
      };
    }
    const backend = createGitEventLogBackendFromContext(ctx, { branch });
    const head = await backend.readHead();
    if (isCanonicalSyncHeadFailure(head)) {
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
    verifyResult = await backend.verify!();
    sourceUsed = gitRefFromDiagnostics(verifyResult.diagnostics) ?? `git:${branch}`;
  } else {
    // auto: prefer git branch when present, else local workspace task-state/
    if (isGitRepository(ctx.workspacePath)) {
      const backend = createGitEventLogBackendFromContext(ctx, { branch });
      const head = await backend.readHead();
      if (!isCanonicalSyncHeadFailure(head)) {
        verifyResult = await backend.verify!();
        sourceUsed = gitRefFromDiagnostics(verifyResult.diagnostics) ?? `git:${branch}`;
      } else {
        sourceUsed = layoutRoot;
        const local = verifyTaskStateLayoutInWorkspace(layoutRoot);
        verifyResult = {
          passed: local.passed,
          findingCount: local.findingCount,
          findings: local.findings.map((finding) => ({
            code: String(finding.code),
            message: finding.message,
            path: finding.path
          }))
        };
      }
    } else {
      sourceUsed = layoutRoot;
      const local = verifyTaskStateLayoutInWorkspace(layoutRoot);
      verifyResult = {
        passed: local.passed,
        findingCount: local.findingCount,
        findings: local.findings.map((finding) => ({
          code: String(finding.code),
          message: finding.message,
          path: finding.path
        }))
      };
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
