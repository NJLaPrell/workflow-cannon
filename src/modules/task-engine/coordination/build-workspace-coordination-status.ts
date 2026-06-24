import { spawnSync } from "node:child_process";
import * as path from "node:path";
import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type {
  WorkspaceCoordinationAuthorityRole,
  WorkspaceCoordinationPosture,
  WorkspaceCoordinationStatusV1
} from "../../../contracts/workspace-coordination-status.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";
import {
  detectWorkspaceEditLeaseSuspectFlags,
  gatherCheckoutFingerprint,
  leaseFilePathFromCommonDir,
  readLeaseFile,
  summarizeWorkspaceEditLeaseStatus,
  type WorkspaceEditLeaseSuspectFlag
} from "./workspace-edit-lease.js";
import { resolveTaskStateAuthorityPosture } from "../task-state-authority.js";

const PORCELAIN_CAP = 500;

function runGit(workspacePath: string, argv: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync("git", argv, {
    cwd: workspacePath,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  return {
    code: typeof r.status === "number" ? r.status : 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? ""
  };
}

function resolveGitPath(workspacePath: string, raw: string | null): string | null {
  if (!raw || raw.trim().length === 0) {
    return null;
  }
  const t = raw.trim();
  if (path.isAbsolute(t)) {
    return path.normalize(t);
  }
  return path.normalize(path.join(workspacePath, t));
}

function classifyAuthority(ctx: ModuleLifecycleContext): {
  role: WorkspaceCoordinationAuthorityRole;
  posture: ReturnType<typeof resolveTaskStateAuthorityPosture>;
} {
  const posture = resolveTaskStateAuthorityPosture(ctx);
  if (posture.classification === "authority") {
    return { role: "integration_authority", posture };
  }
  if (posture.classification === "worker") {
    return { role: "worker", posture };
  }
  return { role: "unknown", posture };
}

function readLeaseSlice(
  commonDir: string | null,
  currentFingerprint: ReturnType<typeof gatherCheckoutFingerprint> | null
): WorkspaceCoordinationStatusV1["lease"] {
  const leaseFilePath = commonDir
    ? leaseFilePathFromCommonDir(commonDir)
    : "(no-git-common-dir)/workflow-cannon/leases/workspace-edit.json";
  if (!commonDir) {
    return {
      schemaVersion: 1,
      leaseFilePath,
      status: "lease-free",
      present: false,
      active: false,
      staleOrInvalid: false,
      expiresAt: null,
      holder: null,
      invalidReason: null,
      suspectFlags: []
    };
  }
  const status = summarizeWorkspaceEditLeaseStatus(leaseFilePath);
  const parsed = readLeaseFile(leaseFilePath);
  let suspectFlags: WorkspaceEditLeaseSuspectFlag[] = [];
  if (parsed.ok && status.active && currentFingerprint) {
    suspectFlags = detectWorkspaceEditLeaseSuspectFlags(parsed.lease, currentFingerprint);
  } else if (status.present && status.staleOrInvalid) {
    suspectFlags = ["lease:stale_or_invalid"];
  }
  return {
    schemaVersion: 1,
    leaseFilePath,
    status: status.state,
    present: status.present,
    active: status.active,
    staleOrInvalid: status.staleOrInvalid,
    expiresAt: status.expiresAt,
    holder: status.holder,
    invalidReason: status.invalidReason,
    suspectFlags
  };
}

function pickPosture(input: {
  gitOk: boolean;
  detached: boolean;
  taskDbDirty: boolean;
  dirtyLines: number;
  lease: WorkspaceCoordinationStatusV1["lease"];
  authority: WorkspaceCoordinationAuthorityRole;
}): WorkspaceCoordinationPosture {
  // Precedence is deterministic: git safety, dirty local state, active lease drift, ordinary lease state, branch role.
  if (!input.gitOk) {
    return "unknown_git";
  }
  if (input.detached) {
    return "detached_head";
  }
  if (input.taskDbDirty) {
    return "dirty_task_db";
  }
  if (input.dirtyLines > 0) {
    return "dirty_workspace";
  }
  if (input.lease.active && input.lease.suspectFlags.length > 0) {
    return "lease_suspect";
  }
  if (input.lease.active) {
    return "lease_held";
  }
  if (input.lease.present && input.lease.staleOrInvalid) {
    return "stale_lease";
  }
  if (input.authority === "worker") {
    return "worker_branch";
  }
  return "safe";
}

/**
 * Compose coordination posture for the visible checkout (read-only; no SQLite opens).
 */
export function buildWorkspaceCoordinationStatus(ctx: ModuleLifecycleContext): WorkspaceCoordinationStatusV1 {
  const workspacePath = path.resolve(ctx.workspacePath);
  const generatedAt = new Date().toISOString();
  const suspectFlags: string[] = [];
  const top = runGit(workspacePath, ["rev-parse", "--show-toplevel"]);
  let gitOk = top.code === 0;
  if (!gitOk) {
    suspectFlags.push("git:not_a_repository");
  }
  const worktreePath = gitOk ? path.normalize(top.stdout.trim()) : null;

  const commonRaw =
    gitOk && top.code === 0
      ? runGit(workspacePath, ["rev-parse", "--git-common-dir"])
      : { code: 1, stdout: "", stderr: "" };
  if (commonRaw.code !== 0) {
    gitOk = false;
    suspectFlags.push("git:common_dir_failed");
  }
  const gitCommonDir = gitOk ? resolveGitPath(workspacePath, commonRaw.stdout.trim()) : null;

  let branch: string | null = null;
  let headSha: string | null = null;
  let detachedHead = false;
  if (gitOk) {
    const sym = runGit(workspacePath, ["symbolic-ref", "-q", "HEAD"]);
    if (sym.code === 0 && sym.stdout.trim().startsWith("refs/heads/")) {
      branch = sym.stdout.trim().slice("refs/heads/".length);
    } else {
      detachedHead = true;
    }
    const h = runGit(workspacePath, ["rev-parse", "HEAD"]);
    if (h.code === 0) {
      headSha = h.stdout.trim();
    } else {
      suspectFlags.push("git:head_failed");
      gitOk = false;
    }
  }

  const porcelain = gitOk ? runGit(workspacePath, ["status", "--porcelain"]) : { code: 1, stdout: "", stderr: "" };
  if (porcelain.code !== 0 && gitOk) {
    suspectFlags.push("git:status_failed");
    gitOk = false;
  }
  const lines = gitOk ? porcelain.stdout.split("\n").filter((l) => l.trim().length > 0) : [];
  const capped = lines.length > PORCELAIN_CAP;
  const dirtyManifest = { lineCount: Math.min(lines.length, PORCELAIN_CAP), capped };
  const currentFingerprint = gitOk ? gatherCheckoutFingerprint(workspacePath) : null;

  const taskDatabaseRelativePath = planningSqliteDatabaseRelativePath(ctx);
  const dbRel = taskDatabaseRelativePath.replace(/\\/g, "/");
  let taskDatabaseGitDirty = false;
  if (gitOk) {
    const dbStat = runGit(workspacePath, ["status", "--porcelain", "--", dbRel]);
    if (dbStat.code === 0) {
      taskDatabaseGitDirty = dbStat.stdout.split("\n").some((l) => l.trim().length > 0);
    }
  }

  const authorityResolution = classifyAuthority(ctx);
  const authorityRole = authorityResolution.role;
  const lease = readLeaseSlice(gitCommonDir, currentFingerprint);
  suspectFlags.push(...lease.suspectFlags);

  const posture = pickPosture({
    gitOk,
    detached: detachedHead,
    taskDbDirty: taskDatabaseGitDirty,
    dirtyLines: dirtyManifest.lineCount,
    lease,
    authority: authorityRole
  });

  return {
    schemaVersion: 1,
    generatedAt,
    workspacePath,
    worktreePath,
    gitCommonDir,
    branch,
    headSha,
    detachedHead,
    authorityRole,
    posture,
    taskDatabaseRelativePath,
    taskDatabaseGitDirty,
    dirtyManifest,
    lease,
    taskStateAuthority: authorityResolution.posture,
    suspectFlags
  };
}
