import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Explicit maintainer approval to commit the live planning SQLite file (recovery / migration). */
export const TASK_STORE_COMMIT_APPROVAL_RELATIVE =
  ".workspace-kit/policy/task-store-sqlite-commit-approval.json";

export const TASK_STORE_SQLITE_STAGED_WITHOUT_APPROVAL = "task-store-sqlite-staged-without-approval";

const TASK_STORE_PATH_GLOB = ".workspace-kit/tasks/";

function parseConfirmedApprovalFile(approvalPath: string): boolean {
  if (!fs.existsSync(approvalPath)) {
    return false;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(approvalPath, "utf8")) as {
      confirmed?: boolean;
      expiresAt?: string;
    };
    if (parsed.confirmed !== true) {
      return false;
    }
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) < Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** True when an operator marked an intentional task-store SQLite commit (recovery / migration). */
export function hasTaskStoreCommitApproval(workspacePath: string): boolean {
  const envRaw = process.env.WORKSPACE_KIT_TASK_STORE_COMMIT_APPROVAL?.trim();
  if (envRaw) {
    try {
      const parsed = JSON.parse(envRaw) as { confirmed?: boolean };
      if (parsed.confirmed === true) {
        return true;
      }
    } catch {
      /* fall through */
    }
  }
  return parseConfirmedApprovalFile(path.join(workspacePath, TASK_STORE_COMMIT_APPROVAL_RELATIVE));
}

export function listGitStagedPaths(workspacePath: string): string[] {
  const out = spawnSync("git", ["-C", workspacePath, "diff", "--cached", "--name-only", "--diff-filter=ACM"], {
    encoding: "utf8"
  });
  if (out.status !== 0) {
    return [];
  }
  return (out.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizePosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** Paths under `.workspace-kit/tasks/` that look like live SQLite artifacts (db + wal/shm). */
export function isTaskStoreSqliteGitPath(relativePath: string): boolean {
  const norm = normalizePosix(relativePath);
  if (!norm.startsWith(TASK_STORE_PATH_GLOB)) {
    return false;
  }
  return /\.db(-wal|-shm)?$/.test(norm);
}

/** Staged paths that match the configured planning DB or sibling wal/shm under tasks/. */
export function filterStagedTaskStoreSqlitePaths(
  stagedPaths: string[],
  sqliteDatabaseRelativePath: string
): string[] {
  const dbNorm = normalizePosix(sqliteDatabaseRelativePath.replace(/^\.\//, ""));
  const dbBase = path.posix.basename(dbNorm);
  const dbDir = path.posix.dirname(dbNorm);
  return stagedPaths.filter((rel) => {
    const norm = normalizePosix(rel);
    if (norm === dbNorm) {
      return true;
    }
    if (isTaskStoreSqliteGitPath(norm)) {
      if (path.posix.dirname(norm) === dbDir && path.posix.basename(norm).startsWith(dbBase)) {
        return true;
      }
    }
    return false;
  });
}

export type TaskStoreGitCommitIssue = {
  path: string;
  reason: string;
  stagedPaths: string[];
};

export function collectTaskStoreSqliteStagedIssues(args: {
  workspacePath: string;
  sqliteDatabaseRelativePath: string;
}): TaskStoreGitCommitIssue[] {
  if (hasTaskStoreCommitApproval(args.workspacePath)) {
    return [];
  }
  const staged = listGitStagedPaths(args.workspacePath);
  const hits = filterStagedTaskStoreSqlitePaths(staged, args.sqliteDatabaseRelativePath);
  if (hits.length === 0) {
    return [];
  }
  const relDb = args.sqliteDatabaseRelativePath;
  return [
    {
      path: relDb,
      stagedPaths: hits,
      reason: `${TASK_STORE_SQLITE_STAGED_WITHOUT_APPROVAL}: staged live planning SQLite (${hits.join(", ")}) — unstage, use export/backup commands, or write ${TASK_STORE_COMMIT_APPROVAL_RELATIVE} with {"confirmed":true,"rationale":"…"} (optional expiresAt); env WORKSPACE_KIT_TASK_STORE_COMMIT_APPROVAL for one-shot; run wk run check-task-store-commit '{}'`
    }
  ];
}
