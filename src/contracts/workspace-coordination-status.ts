/**
 * Read-only workspace coordination posture for agents and the Cursor extension.
 * Emitted by `workspace-coordination-status` and embedded in `dashboard-summary.systemStatus`.
 */

export type WorkspaceCoordinationAuthorityRole =
  | "integration_authority"
  | "worker"
  | "unknown";

export type WorkspaceCoordinationPosture =
  | "unknown_git"
  | "detached_head"
  | "dirty_task_db"
  | "dirty_workspace"
  | "lease_held"
  | "stale_lease"
  | "worker_branch"
  | "safe";

export type WorkspaceCoordinationLeaseStatus = "lease-free" | "lease-held-by-me" | "lease-held-by-other" | "stale-invalid";

export type WorkspaceCoordinationLeaseHolder = {
  agentSessionId: string;
  taskId: string | null;
  expiresAt: string;
};

export type WorkspaceCoordinationLeaseSlice = {
  schemaVersion: 1;
  /** Resolved path under `gitCommonDir` (clone-local coordination). */
  leaseFilePath: string;
  status: WorkspaceCoordinationLeaseStatus;
  present: boolean;
  /** Lease JSON existed and parsed with a future `expiresAt`. */
  active: boolean;
  /** File present but expired or unreadable JSON. */
  staleOrInvalid: boolean;
  expiresAt: string | null;
  holder: WorkspaceCoordinationLeaseHolder | null;
  invalidReason: string | null;
};

export type WorkspaceCoordinationDirtyManifest = {
  /** Number of porcelain lines (tracked + untracked signals); capped for payload size. */
  lineCount: number;
  capped: boolean;
};

/**
 * Stable read-only snapshot — no task lifecycle mutations.
 * `schemaVersion` **1** initial contract.
 */
export type WorkspaceCoordinationStatusV1 = {
  schemaVersion: 1;
  generatedAt: string;
  workspacePath: string;
  worktreePath: string | null;
  gitCommonDir: string | null;
  branch: string | null;
  headSha: string | null;
  detachedHead: boolean;
  authorityRole: WorkspaceCoordinationAuthorityRole;
  posture: WorkspaceCoordinationPosture;
  taskDatabaseRelativePath: string;
  taskDatabaseGitDirty: boolean;
  dirtyManifest: WorkspaceCoordinationDirtyManifest;
  lease: WorkspaceCoordinationLeaseSlice;
  suspectFlags: string[];
};
