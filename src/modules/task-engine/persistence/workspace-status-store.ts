import fs from "node:fs";
import path from "node:path";
import type DatabaseCtor from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { readKitSqliteUserVersion } from "../../../core/state/workspace-kit-sqlite.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";
import { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";
import { TaskEngineError } from "../transitions.js";
import type { WorkspaceStatusSnapshot } from "../dashboard/dashboard-status.js";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

/** Non-authoritative export path (ADR: optional YAML export window). */
export const WORKSPACE_STATUS_DB_EXPORT_RELATIVE =
  "docs/maintainers/data/workspace-kit-status.db-export.yaml";

export type KitWorkspaceStatusPublic = {
  workspaceRevision: number;
  currentKitPhase: string | null;
  nextKitPhase: string | null;
  activeFocus: string | null;
  lastUpdated: string | null;
  blockers: string[];
  pendingDecisions: string[];
  nextAgentActions: string[];
  updatedAt: string;
};

function tableExists(db: SqliteDb, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

/** Open dual store so YAML seed + migrations run before workspace-status IO. */
export function openSqliteDualForWorkspaceStatus(ctx: ModuleLifecycleContext): SqliteDualPlanningStore {
  const dual = new SqliteDualPlanningStore(ctx.workspacePath, planningSqliteDatabaseRelativePath(ctx));
  dual.loadFromDisk();
  return dual;
}

export function workspaceStatusTableAvailable(db: SqliteDb): boolean {
  try {
    const v = typeof db.name === "string" ? readKitSqliteUserVersion(db.name) : 0;
    return v >= 10 && tableExists(db, "kit_workspace_status");
  } catch {
    return false;
  }
}

export function readKitWorkspaceStatusRow(db: SqliteDb): KitWorkspaceStatusPublic | null {
  if (!workspaceStatusTableAvailable(db)) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT workspace_revision, current_kit_phase, next_kit_phase, active_focus, last_updated,
              blockers_json, pending_decisions_json, next_agent_actions_json, updated_at
       FROM kit_workspace_status WHERE id = 1`
    )
    .get() as
    | {
        workspace_revision: number;
        current_kit_phase: string | null;
        next_kit_phase: string | null;
        active_focus: string | null;
        last_updated: string | null;
        blockers_json: string;
        pending_decisions_json: string;
        next_agent_actions_json: string;
        updated_at: string;
      }
    | undefined;
  if (!row) {
    return null;
  }
  const parseArr = (s: string): string[] => {
    try {
      const v = JSON.parse(s) as unknown;
      return Array.isArray(v) ? (v as string[]).map((x) => String(x)) : [];
    } catch {
      return [];
    }
  };
  return {
    workspaceRevision: Number(row.workspace_revision) || 0,
    currentKitPhase: row.current_kit_phase,
    nextKitPhase: row.next_kit_phase,
    activeFocus: row.active_focus,
    lastUpdated: row.last_updated,
    blockers: parseArr(row.blockers_json),
    pendingDecisions: parseArr(row.pending_decisions_json),
    nextAgentActions: parseArr(row.next_agent_actions_json),
    updatedAt: row.updated_at
  };
}

export function kitWorkspaceStatusPublicToSnapshot(row: KitWorkspaceStatusPublic): WorkspaceStatusSnapshot {
  return {
    currentKitPhase: row.currentKitPhase,
    nextKitPhase: row.nextKitPhase,
    activeFocus: row.activeFocus,
    lastUpdated: row.lastUpdated,
    blockers: row.blockers,
    pendingDecisions: row.pendingDecisions,
    nextAgentActions: row.nextAgentActions
  };
}

/** Prefer kit SQLite workspace status (v10+). No YAML read. */
export function readWorkspaceStatusSnapshotFromDual(dual: SqliteDualPlanningStore): WorkspaceStatusSnapshot | null {
  const db = dual.getDatabase();
  return readWorkspaceStatusSnapshotFromKitSqliteDb(db);
}

/**
 * Read `kit_workspace_status` into a dashboard snapshot (user_version ≥ 10).
 * Safe on a readonly better-sqlite3 handle (no migrations).
 */
export function readWorkspaceStatusSnapshotFromKitSqliteDb(db: SqliteDb): WorkspaceStatusSnapshot | null {
  if (!workspaceStatusTableAvailable(db)) {
    return null;
  }
  const row = readKitWorkspaceStatusRow(db);
  if (!row) {
    return null;
  }
  return kitWorkspaceStatusPublicToSnapshot(row);
}

export type WorkspaceStatusUpdatePatch = {
  currentKitPhase?: string | null;
  nextKitPhase?: string | null;
  activeFocus?: string | null;
  lastUpdated?: string | null;
  blockers?: string[];
  pendingDecisions?: string[];
  nextAgentActions?: string[];
};

/**
 * Replace workspace status from a full YAML snapshot (e.g. after phase-snapshot file write).
 * Bumps revision and appends an audit event.
 */
export function replaceWorkspaceStatusFromSnapshot(
  db: SqliteDb,
  snap: WorkspaceStatusSnapshot,
  event: { kind: string; actor?: string | null; command?: string | null }
): { beforeRevision: number; afterRevision: number } {
  if (!workspaceStatusTableAvailable(db)) {
    throw new TaskEngineError(
      "storage-write-error",
      "kit_workspace_status is not available (upgrade kit SQLite to user_version 10+)"
    );
  }
  const cur = readKitWorkspaceStatusRow(db);
  if (!cur) {
    throw new TaskEngineError("storage-read-error", "kit_workspace_status row missing");
  }
  const beforeRevision = cur.workspaceRevision;
  const afterRevision = beforeRevision + 1;
  const now = new Date().toISOString();
  const blockers_json = JSON.stringify(snap.blockers);
  const pending_decisions_json = JSON.stringify(snap.pendingDecisions);
  const next_agent_actions_json = JSON.stringify(snap.nextAgentActions);
  const details = JSON.stringify({ source: event.kind });

  db.transaction(() => {
    db.prepare(
      `UPDATE kit_workspace_status SET
        workspace_revision = ?,
        current_kit_phase = ?,
        next_kit_phase = ?,
        active_focus = ?,
        last_updated = ?,
        blockers_json = ?,
        pending_decisions_json = ?,
        next_agent_actions_json = ?,
        updated_at = ?
      WHERE id = 1`
    ).run(
      afterRevision,
      snap.currentKitPhase,
      snap.nextKitPhase,
      snap.activeFocus,
      snap.lastUpdated,
      blockers_json,
      pending_decisions_json,
      next_agent_actions_json,
      now
    );
    db.prepare(
      `INSERT INTO kit_workspace_status_events (
        created_at, event_kind, actor, command, revision_before, revision_after, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      now,
      event.kind,
      event.actor ?? null,
      event.command ?? null,
      beforeRevision,
      afterRevision,
      details
    );
  })();
  return { beforeRevision, afterRevision };
}

/**
 * Patch workspace status with optimistic concurrency on `expectedWorkspaceRevision`.
 */
export function patchWorkspaceStatus(
  db: SqliteDb,
  args: {
    expectedWorkspaceRevision: number;
    patch: WorkspaceStatusUpdatePatch;
    actor?: string | null;
    command?: string | null;
    eventKind?: string;
    details?: Record<string, unknown>;
  }
): { beforeRevision: number; afterRevision: number } {
  if (!workspaceStatusTableAvailable(db)) {
    throw new TaskEngineError(
      "storage-write-error",
      "kit_workspace_status is not available (upgrade kit SQLite to user_version 10+)"
    );
  }
  const cur = readKitWorkspaceStatusRow(db);
  if (!cur) {
    throw new TaskEngineError("storage-read-error", "kit_workspace_status row missing");
  }
  if (cur.workspaceRevision !== args.expectedWorkspaceRevision) {
    throw new TaskEngineError(
      "workspace-revision-mismatch",
      `expectedWorkspaceRevision ${args.expectedWorkspaceRevision} does not match current workspace revision ${cur.workspaceRevision}`
    );
  }
  const p = args.patch;
  const next: KitWorkspaceStatusPublic = {
    workspaceRevision: cur.workspaceRevision + 1,
    currentKitPhase: Object.hasOwn(p, "currentKitPhase") ? p.currentKitPhase! : cur.currentKitPhase,
    nextKitPhase: Object.hasOwn(p, "nextKitPhase") ? p.nextKitPhase! : cur.nextKitPhase,
    activeFocus: Object.hasOwn(p, "activeFocus") ? p.activeFocus! : cur.activeFocus,
    lastUpdated: Object.hasOwn(p, "lastUpdated") ? p.lastUpdated! : cur.lastUpdated,
    blockers: p.blockers !== undefined ? p.blockers : cur.blockers,
    pendingDecisions: p.pendingDecisions !== undefined ? p.pendingDecisions : cur.pendingDecisions,
    nextAgentActions: p.nextAgentActions !== undefined ? p.nextAgentActions : cur.nextAgentActions,
    updatedAt: new Date().toISOString()
  };

  const now = next.updatedAt;
  const details = JSON.stringify({ patchKeys: Object.keys(p), ...(args.details ?? {}) });
  const eventKind = args.eventKind ?? "update_workspace_status";

  db.transaction(() => {
    db.prepare(
      `UPDATE kit_workspace_status SET
        workspace_revision = ?,
        current_kit_phase = ?,
        next_kit_phase = ?,
        active_focus = ?,
        last_updated = ?,
        blockers_json = ?,
        pending_decisions_json = ?,
        next_agent_actions_json = ?,
        updated_at = ?
      WHERE id = 1`
    ).run(
      next.workspaceRevision,
      next.currentKitPhase,
      next.nextKitPhase,
      next.activeFocus,
      next.lastUpdated,
      JSON.stringify(next.blockers),
      JSON.stringify(next.pendingDecisions),
      JSON.stringify(next.nextAgentActions),
      now
    );
    db.prepare(
      `INSERT INTO kit_workspace_status_events (
        created_at, event_kind, actor, command, revision_before, revision_after, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(now, eventKind, args.actor ?? null, args.command ?? null, cur.workspaceRevision, next.workspaceRevision, details);
  })();
  return { beforeRevision: cur.workspaceRevision, afterRevision: next.workspaceRevision };
}

export function findWorkspaceStatusEventByClientMutationId(
  db: SqliteDb,
  command: string,
  clientMutationId: string
): { payloadDigest?: string; revisionBefore: number; revisionAfter: number } | null {
  if (!workspaceStatusTableAvailable(db)) {
    return null;
  }
  const rows = db
    .prepare(
      `SELECT revision_before, revision_after, details_json
       FROM kit_workspace_status_events
       WHERE command = ?
       ORDER BY id DESC`
    )
    .all(command) as Array<{ revision_before: number; revision_after: number; details_json: string }>;
  for (const row of rows) {
    try {
      const details = JSON.parse(row.details_json) as Record<string, unknown>;
      if (details.clientMutationId !== clientMutationId) {
        continue;
      }
      return {
        payloadDigest: typeof details.payloadDigest === "string" ? details.payloadDigest : undefined,
        revisionBefore: Number(row.revision_before) || 0,
        revisionAfter: Number(row.revision_after) || 0
      };
    } catch {
      /* Ignore malformed historical details. */
    }
  }
  return null;
}

export function listWorkspaceStatusEvents(db: SqliteDb, limit: number): Array<Record<string, unknown>> {
  if (!workspaceStatusTableAvailable(db)) {
    return [];
  }
  const lim = Math.min(Math.max(limit, 1), 500);
  return db
    .prepare(
      `SELECT id, created_at, event_kind, actor, command, revision_before, revision_after, details_json
       FROM kit_workspace_status_events
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(lim) as Array<Record<string, unknown>>;
}

/** Build a small YAML document from DB row (export / dry-run). */
export function formatWorkspaceStatusDbExportYaml(row: KitWorkspaceStatusPublic): string {
  const esc = (s: string): string => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const lines: string[] = [
    "# Generated by workspace-kit run export-workspace-status — not authoritative; see ADR-workspace-status-sqlite-authority-v1.",
    "schema_version: 1",
    `current_kit_phase: "${row.currentKitPhase === null ? "" : esc(row.currentKitPhase)}"`,
    `next_kit_phase: "${row.nextKitPhase === null ? "" : esc(row.nextKitPhase)}"`,
    `last_updated: "${row.lastUpdated === null ? "" : esc(row.lastUpdated)}"`,
    `active_focus: "${row.activeFocus === null ? "" : esc(row.activeFocus)}"`
  ];
  if (row.blockers.length === 0) {
    lines.push("blockers: []");
  } else {
    lines.push("blockers:");
    for (const b of row.blockers) {
      lines.push(`  - "${esc(b)}"`);
    }
  }
  if (row.pendingDecisions.length === 0) {
    lines.push("pending_decisions: []");
  } else {
    lines.push("pending_decisions:");
    for (const b of row.pendingDecisions) {
      lines.push(`  - "${esc(b)}"`);
    }
  }
  if (row.nextAgentActions.length === 0) {
    lines.push("next_agent_actions: []");
  } else {
    lines.push("next_agent_actions:");
    for (const b of row.nextAgentActions) {
      lines.push(`  - "${esc(b)}"`);
    }
  }
  lines.push(`# workspace_revision: ${row.workspaceRevision}`);
  lines.push(`# updated_at: "${esc(row.updatedAt)}"`);
  lines.push("");
  return lines.join("\n");
}

export function writeWorkspaceStatusDbExport(ctx: ModuleLifecycleContext, yamlBody: string): string {
  const abs = path.join(ctx.workspacePath, WORKSPACE_STATUS_DB_EXPORT_RELATIVE);
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${abs}.${Math.random().toString(36).slice(2, 10)}.tmp`;
  try {
    fs.writeFileSync(tmp, yamlBody, "utf8");
    fs.renameSync(tmp, abs);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* */
    }
    throw e;
  }
  return WORKSPACE_STATUS_DB_EXPORT_RELATIVE;
}
