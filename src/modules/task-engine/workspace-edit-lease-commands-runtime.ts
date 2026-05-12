import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { randomUUID as nodeRandomUuid } from "node:crypto";
import {
  clampExtendSeconds,
  defaultTtlMs,
  deleteLeaseBestEffort,
  detectWorkspaceEditLeaseSuspectFlags,
  gatherCheckoutFingerprint,
  isLeaseExpired,
  leaseFilePathFromCommonDir,
  parseIsoOrNull,
  readLeaseFile,
  resolveGitCommonDir,
  summarizeWorkspaceEditLeaseStatus,
  writeLeaseAtomic,
  type WorkspaceEditLeaseSuspectFlag,
  type WorkspaceEditLeaseAlternatives,
  type WorkspaceEditLeaseV1
} from "./coordination/workspace-edit-lease.js";

function strArg(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function boolArg(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true;
}

function boundedNumberArg(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const raw = args[key];
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), min), max);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function leaseWaitReady(state: string | undefined): boolean {
  return state === "lease-free" || state === "lease-held-by-me" || state === "stale-invalid";
}

function leaseDenied(
  code: string,
  message: string,
  leasePath: string,
  alternatives: WorkspaceEditLeaseAlternatives[],
  current?: WorkspaceEditLeaseV1,
  callerAgentSessionId?: string | null
): ModuleCommandResult {
  const leaseStatus = summarizeWorkspaceEditLeaseStatus(leasePath, callerAgentSessionId);
  return {
    ok: false,
    code,
    message,
    data: {
      schemaVersion: 1,
      leaseFilePath: leasePath,
      alternatives,
      recommendedNextAction: alternatives[0] ?? "read_only_plan",
      holder: leaseStatus.holder,
      leaseStatus,
      currentLease: current ?? null
    }
  };
}

export function runWorkspaceEditStatus(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): ModuleCommandResult {
  const workspacePath = ctx.workspacePath;
  const agentSessionId = strArg(args, "agentSessionId");
  const common = resolveGitCommonDir(workspacePath);
  const leasePath = common ? leaseFilePathFromCommonDir(common) : "(no-git-common-dir)/workflow-cannon/leases/workspace-edit.json";
  if (!common) {
    const leaseStatus = {
      schemaVersion: 1 as const,
      state: "lease-free" as const,
      present: false,
      active: false,
      staleOrInvalid: false,
      expiresAt: null as string | null,
      holder: null,
      heldByCaller: null,
      invalidReason: null
    };
    return {
      ok: true,
      code: "workspace-edit-status",
      message: "No git repository — no workspace edit lease path",
      data: {
        schemaVersion: 1,
        leaseFilePath: leasePath,
        leaseStatus,
        status: leaseStatus.state,
        present: false,
        active: false,
        staleOrInvalid: false,
        expiresAt: null as string | null,
        suspect: false,
        suspectFlags: [] as WorkspaceEditLeaseSuspectFlag[],
        document: null as WorkspaceEditLeaseV1 | null
      }
    };
  }
  const leaseStatus = summarizeWorkspaceEditLeaseStatus(leasePath, agentSessionId);
  const parsed = readLeaseFile(leasePath);
  if (!parsed.ok) {
    return {
      ok: true,
      code: "workspace-edit-status",
      message: leaseStatus.present ? "Lease file missing or unreadable" : "No lease file",
      data: {
        schemaVersion: 1,
        leaseFilePath: leasePath,
        leaseStatus,
        status: leaseStatus.state,
        present: leaseStatus.present,
        active: false,
        staleOrInvalid: leaseStatus.staleOrInvalid,
        expiresAt: null,
        suspect: leaseStatus.staleOrInvalid,
        suspectFlags: leaseStatus.staleOrInvalid ? (["lease:stale_or_invalid"] as WorkspaceEditLeaseSuspectFlag[]) : [],
        document: null
      }
    };
  }
  const { lease } = parsed;
  const suspectFlags = leaseStatus.active
    ? detectWorkspaceEditLeaseSuspectFlags(lease, gatherCheckoutFingerprint(workspacePath))
    : (["lease:stale_or_invalid"] as WorkspaceEditLeaseSuspectFlag[]);
  return {
    ok: true,
    code: "workspace-edit-status",
    message: leaseStatus.staleOrInvalid ? "Lease present but expired or invalid window" : "Lease active",
    data: {
      schemaVersion: 1,
      leaseFilePath: leasePath,
      leaseStatus,
      status: leaseStatus.state,
      present: true,
      active: leaseStatus.active,
      staleOrInvalid: leaseStatus.staleOrInvalid,
      expiresAt: lease.expiresAt,
      suspect: suspectFlags.length > 0,
      suspectFlags,
      document: lease
    }
  };
}

export async function waitForWorkspaceEditLease(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult | null> {
  if (!boolArg(args, "waitForLease")) {
    return null;
  }
  const agentSessionId = strArg(args, "agentSessionId");
  if (!agentSessionId) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "waitForLease requires agentSessionId so holder comparisons are meaningful"
    };
  }
  const timeoutMs = boundedNumberArg(args, "waitForLeaseTimeoutMs", 30_000, 0, 300_000);
  const pollMs = boundedNumberArg(args, "waitForLeasePollMs", 1_000, 50, 60_000);
  const startedAt = Date.now();
  let attempts = 0;
  let lastStatus = runWorkspaceEditStatus(ctx, { agentSessionId });
  while (true) {
    attempts += 1;
    const status = lastStatus.data?.leaseStatus as { state?: string; holder?: unknown } | undefined;
    if (lastStatus.ok && leaseWaitReady(status?.state)) {
      return {
        ok: true,
        code: "workspace-edit-lease-wait-ready",
        message: "Workspace edit lease is available for this session",
        data: {
          schemaVersion: 1,
          waited: Date.now() > startedAt,
          attempts,
          elapsedMs: Date.now() - startedAt,
          timeoutMs,
          pollMs,
          holder: status?.holder ?? null,
          leaseStatus: lastStatus.data?.leaseStatus ?? null
        }
      };
    }
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      return {
        ok: false,
        code: "workspace-edit-lease-wait-timeout",
        message: "Timed out waiting for workspace edit lease",
        data: {
          schemaVersion: 1,
          attempts,
          elapsedMs,
          timeoutMs,
          pollMs,
          holder: status?.holder ?? null,
          leaseStatus: lastStatus.data?.leaseStatus ?? null
        }
      };
    }
    await sleep(Math.min(pollMs, timeoutMs - elapsedMs));
    lastStatus = runWorkspaceEditStatus(ctx, { agentSessionId });
  }
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
          cur,
          agentSessionId
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
      cur,
      agentSessionId
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
      cur,
      agentSessionId
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
    cur,
    agentSessionId
  );
}
