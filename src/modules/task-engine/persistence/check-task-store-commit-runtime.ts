import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  collectTaskStoreSqliteStagedIssues,
  hasTaskStoreCommitApproval,
  TASK_STORE_COMMIT_APPROVAL_RELATIVE,
  TASK_STORE_SQLITE_STAGED_WITHOUT_APPROVAL
} from "../../../core/task-store-git-commit-policy.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";

export function runCheckTaskStoreCommit(ctx: ModuleLifecycleContext): ModuleCommandResult {
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const issues = collectTaskStoreSqliteStagedIssues({
    workspacePath: ctx.workspacePath,
    sqliteDatabaseRelativePath: dbRel
  });
  if (issues.length === 0) {
    return {
      ok: true,
      code: "task-store-commit-check-passed",
      message: hasTaskStoreCommitApproval(ctx.workspacePath)
        ? "No staged planning SQLite paths (commit approval marker is set)"
        : "No staged planning SQLite paths",
      data: {
        schemaVersion: 1,
        sqliteDatabaseRelativePath: dbRel,
        stagedPaths: [],
        approvalFileRelative: TASK_STORE_COMMIT_APPROVAL_RELATIVE,
        hasCommitApproval: hasTaskStoreCommitApproval(ctx.workspacePath)
      }
    };
  }
  const hit = issues[0]!;
  return {
    ok: false,
    code: TASK_STORE_SQLITE_STAGED_WITHOUT_APPROVAL,
    message: `Staged live planning SQLite without approval: ${hit.stagedPaths.join(", ")}`,
    data: {
      schemaVersion: 1,
      sqliteDatabaseRelativePath: dbRel,
      stagedPaths: hit.stagedPaths,
      approvalFileRelative: TASK_STORE_COMMIT_APPROVAL_RELATIVE,
      hasCommitApproval: false,
      issues
    }
  };
}
