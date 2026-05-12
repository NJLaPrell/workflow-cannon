import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const PORCELAIN_CAP = 500;

export type WorkspaceEditLeaseDirtyManifest = {
  lineCount: number;
  capped: boolean;
};

/** Persisted under `$GIT_COMMON_DIR/workflow-cannon/leases/workspace-edit.json`. */
export type WorkspaceEditLeaseV1 = {
  schemaVersion: 1;
  leaseId: string;
  agentSessionId: string;
  taskId: string | null;
  branch: string | null;
  headSha: string | null;
  worktreePath: string;
  dirtyManifest: WorkspaceEditLeaseDirtyManifest;
  claimedAt: string;
  heartbeatAt: string;
  expiresAt: string;
};

export type WorkspaceEditLeaseAlternatives = "wait" | "read_only_plan" | "release_if_holder" | "recover_stale_lease";

export type WorkspaceEditLeaseStatusKind = "lease-free" | "lease-held-by-me" | "lease-held-by-other" | "stale-invalid";

export type WorkspaceEditLeaseSuspectFlag =
  | "lease:branch_drift"
  | "lease:head_drift"
  | "lease:worktree_path_drift"
  | "lease:dirty_manifest_drift"
  | "lease:stale_or_invalid";

export type WorkspaceEditLeaseHolderSummary = {
  agentSessionId: string;
  taskId: string | null;
  expiresAt: string;
};

export type WorkspaceEditLeaseStatusV1 = {
  schemaVersion: 1;
  state: WorkspaceEditLeaseStatusKind;
  present: boolean;
  active: boolean;
  staleOrInvalid: boolean;
  expiresAt: string | null;
  holder: WorkspaceEditLeaseHolderSummary | null;
  heldByCaller: boolean | null;
  invalidReason: string | null;
};

export function runGit(workspacePath: string, argv: string[]): { code: number; stdout: string; stderr: string } {
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

export function resolveGitPath(workspacePath: string, raw: string | null): string | null {
  if (!raw || raw.trim().length === 0) {
    return null;
  }
  const t = raw.trim();
  if (path.isAbsolute(t)) {
    return path.normalize(t);
  }
  return path.normalize(path.join(workspacePath, t));
}

export function resolveGitCommonDir(workspacePath: string): string | null {
  const top = runGit(workspacePath, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) {
    return null;
  }
  const common = runGit(workspacePath, ["rev-parse", "--git-common-dir"]);
  if (common.code !== 0) {
    return null;
  }
  return resolveGitPath(workspacePath, common.stdout.trim());
}

export function leaseFilePathFromCommonDir(gitCommonDir: string): string {
  return path.join(gitCommonDir, "workflow-cannon", "leases", "workspace-edit.json");
}

export function gatherCheckoutFingerprint(workspacePath: string): {
  worktreePath: string | null;
  branch: string | null;
  headSha: string | null;
  dirtyManifest: WorkspaceEditLeaseDirtyManifest;
} {
  const top = runGit(workspacePath, ["rev-parse", "--show-toplevel"]);
  const worktreePath = top.code === 0 ? path.normalize(top.stdout.trim()) : null;
  let branch: string | null = null;
  let headSha: string | null = null;
  if (top.code === 0) {
    const sym = runGit(workspacePath, ["symbolic-ref", "-q", "HEAD"]);
    if (sym.code === 0 && sym.stdout.trim().startsWith("refs/heads/")) {
      branch = sym.stdout.trim().slice("refs/heads/".length);
    }
    const h = runGit(workspacePath, ["rev-parse", "HEAD"]);
    if (h.code === 0) {
      headSha = h.stdout.trim();
    }
  }
  const porcelain = runGit(workspacePath, ["status", "--porcelain"]);
  const lines =
    porcelain.code === 0 ? porcelain.stdout.split("\n").filter((l) => l.trim().length > 0) : [];
  const capped = lines.length > PORCELAIN_CAP;
  return {
    worktreePath,
    branch,
    headSha,
    dirtyManifest: { lineCount: Math.min(lines.length, PORCELAIN_CAP), capped }
  };
}

export function detectWorkspaceEditLeaseSuspectFlags(
  lease: WorkspaceEditLeaseV1,
  current: ReturnType<typeof gatherCheckoutFingerprint>
): WorkspaceEditLeaseSuspectFlag[] {
  const flags: WorkspaceEditLeaseSuspectFlag[] = [];
  if (lease.branch !== current.branch) {
    flags.push("lease:branch_drift");
  }
  if (lease.headSha !== current.headSha) {
    flags.push("lease:head_drift");
  }
  const leaseWorktree = path.normalize(lease.worktreePath);
  const currentWorktree = current.worktreePath ? path.normalize(current.worktreePath) : null;
  if (leaseWorktree !== currentWorktree) {
    flags.push("lease:worktree_path_drift");
  }
  if (
    lease.dirtyManifest.lineCount !== current.dirtyManifest.lineCount ||
    lease.dirtyManifest.capped !== current.dirtyManifest.capped
  ) {
    flags.push("lease:dirty_manifest_drift");
  }
  return flags;
}

export function parseIsoOrNull(iso: unknown): number | null {
  if (typeof iso !== "string" || iso.trim().length === 0) {
    return null;
  }
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function isLeaseExpired(expiresAt: string): boolean {
  const t = parseIsoOrNull(expiresAt);
  if (t == null) {
    return true;
  }
  return t <= Date.now();
}

export function summarizeWorkspaceEditLeaseStatus(
  leasePath: string,
  callerAgentSessionId?: string | null
): WorkspaceEditLeaseStatusV1 {
  const parsed = readLeaseFile(leasePath);
  if (!parsed.ok) {
    const present = parsed.reason !== "missing";
    return {
      schemaVersion: 1,
      state: present ? "stale-invalid" : "lease-free",
      present,
      active: false,
      staleOrInvalid: present,
      expiresAt: null,
      holder: null,
      heldByCaller: null,
      invalidReason: present ? parsed.reason : null
    };
  }
  const { lease } = parsed;
  const active = !isLeaseExpired(lease.expiresAt);
  const holder = {
    agentSessionId: lease.agentSessionId,
    taskId: lease.taskId,
    expiresAt: lease.expiresAt
  };
  if (!active) {
    return {
      schemaVersion: 1,
      state: "stale-invalid",
      present: true,
      active: false,
      staleOrInvalid: true,
      expiresAt: lease.expiresAt,
      holder,
      heldByCaller: callerAgentSessionId ? lease.agentSessionId === callerAgentSessionId : null,
      invalidReason: "expired"
    };
  }
  const heldByCaller = callerAgentSessionId ? lease.agentSessionId === callerAgentSessionId : null;
  return {
    schemaVersion: 1,
    state: heldByCaller ? "lease-held-by-me" : "lease-held-by-other",
    present: true,
    active: true,
    staleOrInvalid: false,
    expiresAt: lease.expiresAt,
    holder,
    heldByCaller,
    invalidReason: null
  };
}

export function readLeaseFile(leasePath: string): { ok: true; lease: WorkspaceEditLeaseV1 } | { ok: false; reason: string } {
  if (!fs.existsSync(leasePath)) {
    return { ok: false, reason: "missing" };
  }
  let body: string;
  try {
    body = fs.readFileSync(leasePath, "utf8");
  } catch (e) {
    return { ok: false, reason: `read_error:${(e as Error).message}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "invalid_shape" };
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return { ok: false, reason: "bad_schema_version" };
  }
  const leaseId = typeof o.leaseId === "string" ? o.leaseId.trim() : "";
  const agentSessionId = typeof o.agentSessionId === "string" ? o.agentSessionId.trim() : "";
  const taskId = typeof o.taskId === "string" && o.taskId.trim().length > 0 ? o.taskId.trim() : null;
  const branch =
    o.branch === null || o.branch === undefined
      ? null
      : typeof o.branch === "string"
        ? o.branch.trim() || null
        : null;
  const headSha =
    o.headSha === null || o.headSha === undefined
      ? null
      : typeof o.headSha === "string"
        ? o.headSha.trim() || null
        : null;
  const worktreePath = typeof o.worktreePath === "string" ? o.worktreePath.trim() : "";
  const dm = o.dirtyManifest;
  const dirtyManifest =
    dm && typeof dm === "object" && !Array.isArray(dm)
      ? {
          lineCount: typeof (dm as { lineCount?: unknown }).lineCount === "number" ? (dm as { lineCount: number }).lineCount : 0,
          capped: (dm as { capped?: unknown }).capped === true
        }
      : { lineCount: 0, capped: false };
  const claimedAt = typeof o.claimedAt === "string" ? o.claimedAt : "";
  const heartbeatAt = typeof o.heartbeatAt === "string" ? o.heartbeatAt : "";
  const expiresAt = typeof o.expiresAt === "string" ? o.expiresAt : "";
  if (!leaseId || !agentSessionId || !worktreePath || !claimedAt || !heartbeatAt || !expiresAt) {
    return { ok: false, reason: "missing_required_fields" };
  }
  if (parseIsoOrNull(expiresAt) == null || parseIsoOrNull(claimedAt) == null || parseIsoOrNull(heartbeatAt) == null) {
    return { ok: false, reason: "bad_timestamps" };
  }
  return {
    ok: true,
    lease: {
      schemaVersion: 1,
      leaseId,
      agentSessionId,
      taskId,
      branch,
      headSha,
      worktreePath,
      dirtyManifest,
      claimedAt,
      heartbeatAt,
      expiresAt
    }
  };
}

export function writeLeaseAtomic(leasePath: string, lease: WorkspaceEditLeaseV1): void {
  const dir = path.dirname(leasePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.workspace-edit-lease-${randomUUID()}.tmp`);
  const payload = `${JSON.stringify(lease, null, 2)}\n`;
  fs.writeFileSync(tmp, payload, "utf8");
  try {
    fs.unlinkSync(leasePath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      throw e;
    }
  }
  fs.renameSync(tmp, leasePath);
}

export function deleteLeaseBestEffort(leasePath: string): boolean {
  try {
    fs.unlinkSync(leasePath);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return true;
    }
    return false;
  }
}

export function defaultTtlMs(argsTtl: unknown): number {
  const n = typeof argsTtl === "number" && Number.isFinite(argsTtl) ? argsTtl : Number(argsTtl);
  if (Number.isFinite(n) && n > 0 && n <= 86_400) {
    return Math.floor(n * 1000);
  }
  return 1_800_000;
}

export function clampExtendSeconds(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(n), 86_400);
}
