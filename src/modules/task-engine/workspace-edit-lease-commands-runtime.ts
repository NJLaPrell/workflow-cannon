import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { randomUUID as nodeRandomUuid } from "node:crypto";
import {
  clampExtendSeconds,
  defaultTtlMs,
  deleteLeaseBestEffort,
  gatherCheckoutFingerprint,
  isLeaseExpired,
  leaseFilePathFromCommonDir,
  parseIsoOrNull,
  readLeaseFile,
  resolveGitCommonDir,
  writeLeaseAtomic,
  type WorkspaceEditLeaseAlternatives,
  type WorkspaceEditLeaseV1
} from "./coordination/workspace-edit-lease.js";

function strArg(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function leaseDenied(
  code: string,
  message: string,
  leasePath: string,
  alternatives: WorkspaceEditLeaseAlternatives[],
  current?: WorkspaceEditLeaseV1
): ModuleCommandResult {
  return {
    ok: false,
    code,
    message,
    data: {
      schemaVersion: 1,
      leaseFilePath: leasePath,
      alternatives,
      currentLease: current ?? null
    }
  };
}

export function runWorkspaceEditStatus(
  ctx: ModuleLifecycleContext,
  _args: Record<string, unknown>
): ModuleCommandResult {
  const workspacePath = ctx.workspacePath;
  const common = resolveGitCommonDir(workspacePath);
  const leasePath = common ? leaseFilePathFromCommonDir(common) : "(no-git-common-dir)/workflow-cannon/leases/workspace-edit.json";
  if (!common) {
    return {
      ok: true,
      code: "workspace-edit-status",
      message: "No git repository — no workspace edit lease path",
      data: {
        schemaVersion: 1,
        leaseFilePath: leasePath,
        present: false,
        active: false,
        staleOrInvalid: false,
        expiresAt: null as string | null,
        document: null as WorkspaceEditLeaseV1 | null
      }
    };
  }
  const parsed = readLeaseFile(leasePath);
  if (!parsed.ok) {
    const present = parsed.reason !== "missing";
    return {
      ok: true,
      code: "workspace-edit-status",
      message: present ? "Lease file missing or unreadable" : "No lease file",
      data: {
        schemaVersion: 1,
        leaseFilePath: leasePath,
        present,
        active: false,
        staleOrInvalid: present,
        expiresAt: null,
        document: null
      }
    };
  }
  const { lease } = parsed;
  const exp = parseIsoOrNull(lease.expiresAt);
  const expired = exp == null || exp <= Date.now();
  return {
    ok: true,
    code: "workspace-edit-status",
    message: expired ? "Lease present but expired or invalid window" : "Lease active",
    data: {
      schemaVersion: 1,
      leaseFilePath: leasePath,
      present: true,
      active: !expired,
      staleOrInvalid: expired,
      expiresAt: lease.expiresAt,
      document: lease
    }
  };
}

export function runClaimWorkspaceEditLease(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): ModuleCommandResult {
  const workspacePath = ctx.workspacePath;
  const agentSessionId = strArg(args, "agentSessionId");
  if (!agentSessionId) {
    return { ok: false, code: "invalid-run-args", message: "claim-workspace-edit-lease requires agentSessionId" };
  }
  const taskId = strArg(args, "taskId");
  const common = resolveGitCommonDir(workspacePath);
  if (!common) {
    return { ok: false, code: "workspace-edit-lease-no-git", message: "Not a git repository (cannot resolve git common dir)" };
  }
  const leasePath = leaseFilePathFromCommonDir(common);
  const ttlMs = defaultTtlMs(args.leaseTtlSeconds);
  const now = new Date();
  const nowIso = now.toISOString();
  const fp = gatherCheckoutFingerprint(workspacePath);
  if (!fp.worktreePath) {
    return { ok: false, code: "workspace-edit-lease-no-git", message: "Could not resolve git worktree root" };
  }

  const existing = readLeaseFile(leasePath);
  if (existing.ok) {
    const cur = existing.lease;
    const active = !isLeaseExpired(cur.expiresAt);
    if (active) {
      if (cur.agentSessionId !== agentSessionId) {
        return leaseDenied(
          "workspace-edit-lease-held",
          "Another session holds the workspace edit lease",
          leasePath,
          ["wait", "read_only_plan", "release_if_holder"],
          cur
        );
      }
      const next: WorkspaceEditLeaseV1 = {
        ...cur,
        taskId: taskId ?? cur.taskId,
        heartbeatAt: nowIso,
        expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        dirtyManifest: fp.dirtyManifest,
        branch: fp.branch,
        headSha: fp.headSha,
        worktreePath: fp.worktreePath
      };
      writeLeaseAtomic(leasePath, next);
      return {
        ok: true,
        code: "workspace-edit-lease-renewed",
        message: "Renewed workspace edit lease for the same session",
        data: { schemaVersion: 1, lease: next, leaseFilePath: leasePath, renewed: true }
      };
    }
  }

  const lease: WorkspaceEditLeaseV1 = {
    schemaVersion: 1,
    leaseId: nodeRandomUuid(),
    agentSessionId,
    taskId: taskId ?? null,
    branch: fp.branch,
    headSha: fp.headSha,
    worktreePath: fp.worktreePath,
    dirtyManifest: fp.dirtyManifest,
    claimedAt: nowIso,
    heartbeatAt: nowIso,
    expiresAt: new Date(now.getTime() + ttlMs).toISOString()
  };
  writeLeaseAtomic(leasePath, lease);
  return {
    ok: true,
    code: "workspace-edit-lease-claimed",
    message: "Claimed workspace edit lease",
    data: { schemaVersion: 1, lease, leaseFilePath: leasePath, renewed: false }
  };
}

export function runHeartbeatWorkspaceEditLease(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): ModuleCommandResult {
  const workspacePath = ctx.workspacePath;
  const agentSessionId = strArg(args, "agentSessionId");
  if (!agentSessionId) {
    return { ok: false, code: "invalid-run-args", message: "heartbeat-workspace-edit-lease requires agentSessionId" };
  }
  const common = resolveGitCommonDir(workspacePath);
  if (!common) {
    return { ok: false, code: "workspace-edit-lease-no-git", message: "Not a git repository (cannot resolve git common dir)" };
  }
  const leasePath = leaseFilePathFromCommonDir(common);
  const parsed = readLeaseFile(leasePath);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "workspace-edit-lease-missing",
      message: "No lease to heartbeat — claim first",
      data: { schemaVersion: 1, leaseFilePath: leasePath, alternatives: ["read_only_plan"] satisfies WorkspaceEditLeaseAlternatives[] }
    };
  }
  const cur = parsed.lease;
  if (cur.agentSessionId !== agentSessionId) {
    const expired = isLeaseExpired(cur.expiresAt);
    return leaseDenied(
      "workspace-edit-lease-held",
      expired ? "Lease expired but still held by a different session id on disk" : "Another session holds the workspace edit lease",
      leasePath,
      expired ? ["recover_stale_lease", "wait"] : ["wait", "read_only_plan"],
      cur
    );
  }
  if (isLeaseExpired(cur.expiresAt)) {
    return {
      ok: false,
      code: "workspace-edit-lease-expired",
      message: "Lease expired — reclaim with claim-workspace-edit-lease",
      data: { schemaVersion: 1, leaseFilePath: leasePath, currentLease: cur, alternatives: ["recover_stale_lease", "read_only_plan"] }
    };
  }
  const extendSec = clampExtendSeconds(args.extendLeaseSeconds, 600);
  const base = parseIsoOrNull(cur.expiresAt) ?? Date.now();
  const next: WorkspaceEditLeaseV1 = {
    ...cur,
    heartbeatAt: new Date().toISOString(),
    expiresAt: new Date(base + extendSec * 1000).toISOString()
  };
  writeLeaseAtomic(leasePath, next);
  return {
    ok: true,
    code: "workspace-edit-lease-heartbeat",
    message: "Heartbeat applied",
    data: { schemaVersion: 1, lease: next, leaseFilePath: leasePath }
  };
}

export function runReleaseWorkspaceEditLease(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): ModuleCommandResult {
  const workspacePath = ctx.workspacePath;
  const agentSessionId = strArg(args, "agentSessionId");
  const recoverStale = args.recoverStaleLease === true;
  if (!agentSessionId && !recoverStale) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "release-workspace-edit-lease requires agentSessionId or recoverStaleLease:true"
    };
  }
  const common = resolveGitCommonDir(workspacePath);
  if (!common) {
    return { ok: false, code: "workspace-edit-lease-no-git", message: "Not a git repository (cannot resolve git common dir)" };
  }
  const leasePath = leaseFilePathFromCommonDir(common);
  const parsed = readLeaseFile(leasePath);
  if (!parsed.ok) {
    return {
      ok: true,
      code: "workspace-edit-lease-released",
      message: "No lease file (idempotent)",
      data: { schemaVersion: 1, leaseFilePath: leasePath, released: false }
    };
  }
  const cur = parsed.lease;
  const expired = isLeaseExpired(cur.expiresAt);
  if (agentSessionId && cur.agentSessionId === agentSessionId) {
    deleteLeaseBestEffort(leasePath);
    return {
      ok: true,
      code: "workspace-edit-lease-released",
      message: "Released workspace edit lease",
      data: { schemaVersion: 1, leaseFilePath: leasePath, released: true, priorLease: cur }
    };
  }
  if (recoverStale && !expired) {
    return leaseDenied(
      "workspace-edit-lease-held",
      "recoverStaleLease refused while lease is still active",
      leasePath,
      ["wait", "release_if_holder"],
      cur
    );
  }
  if (recoverStale && expired) {
    deleteLeaseBestEffort(leasePath);
    return {
      ok: true,
      code: "workspace-edit-lease-stale-recovered",
      message: "Removed stale workspace edit lease",
      data: { schemaVersion: 1, leaseFilePath: leasePath, released: true, priorLease: cur, recoveredStale: true }
    };
  }
  return leaseDenied(
    "workspace-edit-lease-held",
    "Cannot release lease held by another session",
    leasePath,
    expired ? (["recover_stale_lease", "wait", "read_only_plan"] as WorkspaceEditLeaseAlternatives[]) : ["wait", "read_only_plan", "release_if_holder"],
    cur
  );
}
