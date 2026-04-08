import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";
import { TaskEngineError } from "./transitions.js";
import {
  formatWorkspaceStatusDbExportYaml,
  listWorkspaceStatusEvents,
  openSqliteDualForWorkspaceStatus,
  patchWorkspaceStatus,
  readKitWorkspaceStatusRow,
  workspaceStatusTableAvailable,
  writeWorkspaceStatusDbExport,
  WORKSPACE_STATUS_DB_EXPORT_RELATIVE,
  type WorkspaceStatusUpdatePatch
} from "./persistence/workspace-status-store.js";

function asStringArray(v: unknown): string[] | undefined {
  if (v === undefined) {
    return undefined;
  }
  if (!Array.isArray(v)) {
    return undefined;
  }
  return v.map((x) => String(x));
}

export async function runGetWorkspaceStatus(
  ctx: ModuleLifecycleContext,
  _args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  try {
    const dual = openSqliteDualForWorkspaceStatus(ctx);
    const db = dual.getDatabase();
    const uv = readKitSqliteUserVersion(dual.dbPath);
    const row = readKitWorkspaceStatusRow(db);
    if (!workspaceStatusTableAvailable(db) || row === null) {
      return {
        ok: true,
        code: "workspace-status-unavailable",
        message: "kit_workspace_status not present (SQLite user_version < 10 or missing row)",
        data: { kitSqliteUserVersion: uv, workspaceStatus: null }
      };
    }
    return {
      ok: true,
      code: "workspace-status-read",
      message: "Read kit workspace status row",
      data: { kitSqliteUserVersion: uv, workspaceStatus: row }
    };
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return {
      ok: false,
      code: "storage-read-error",
      message: `Failed to read workspace status: ${(e as Error).message}`
    };
  }
}

export async function runUpdateWorkspaceStatus(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const revRaw = args.expectedWorkspaceRevision;
  if (typeof revRaw !== "number" || !Number.isInteger(revRaw) || revRaw < 0) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "update-workspace-status requires expectedWorkspaceRevision (non-negative integer)"
    };
  }
  const patch: WorkspaceStatusUpdatePatch = {};
  if (Object.hasOwn(args, "currentKitPhase")) {
    const v = args.currentKitPhase;
    if (v !== null && typeof v !== "string") {
      return { ok: false, code: "invalid-task-schema", message: "currentKitPhase must be string or null" };
    }
    patch.currentKitPhase = v as string | null;
  }
  if (Object.hasOwn(args, "nextKitPhase")) {
    const v = args.nextKitPhase;
    if (v !== null && typeof v !== "string") {
      return { ok: false, code: "invalid-task-schema", message: "nextKitPhase must be string or null" };
    }
    patch.nextKitPhase = v as string | null;
  }
  if (Object.hasOwn(args, "activeFocus")) {
    const v = args.activeFocus;
    if (v !== null && typeof v !== "string") {
      return { ok: false, code: "invalid-task-schema", message: "activeFocus must be string or null" };
    }
    patch.activeFocus = v as string | null;
  }
  if (Object.hasOwn(args, "lastUpdated")) {
    const v = args.lastUpdated;
    if (v !== null && typeof v !== "string") {
      return { ok: false, code: "invalid-task-schema", message: "lastUpdated must be string or null" };
    }
    patch.lastUpdated = v as string | null;
  }
  const b = asStringArray(args.blockers);
  if (args.blockers !== undefined && b === undefined) {
    return { ok: false, code: "invalid-task-schema", message: "blockers must be an array of strings when provided" };
  }
  if (b) {
    patch.blockers = b;
  }
  const pd = asStringArray(args.pendingDecisions);
  if (args.pendingDecisions !== undefined && pd === undefined) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "pendingDecisions must be an array of strings when provided"
    };
  }
  if (pd) {
    patch.pendingDecisions = pd;
  }
  const na = asStringArray(args.nextAgentActions);
  if (args.nextAgentActions !== undefined && na === undefined) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "nextAgentActions must be an array of strings when provided"
    };
  }
  if (na) {
    patch.nextAgentActions = na;
  }
  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "update-workspace-status requires at least one mutable field besides expectedWorkspaceRevision"
    };
  }

  const actor = typeof args.actor === "string" ? args.actor : null;
  const command = typeof args.command === "string" ? args.command : "update-workspace-status";

  try {
    const dual = openSqliteDualForWorkspaceStatus(ctx);
    const db = dual.getDatabase();
    const before = readKitWorkspaceStatusRow(db);
    const { beforeRevision, afterRevision } = patchWorkspaceStatus(db, {
      expectedWorkspaceRevision: revRaw,
      patch,
      actor,
      command
    });
    const after = readKitWorkspaceStatusRow(db);
    return {
      ok: true,
      code: "workspace-status-updated",
      message: "Updated kit workspace status",
      data: {
        beforeRevision,
        afterRevision,
        workspaceStatusBefore: before,
        workspaceStatusAfter: after
      }
    };
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return {
      ok: false,
      code: "storage-write-error",
      message: `Failed to update workspace status: ${(e as Error).message}`
    };
  }
}

export async function runExportWorkspaceStatus(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;
  try {
    const dual = openSqliteDualForWorkspaceStatus(ctx);
    const db = dual.getDatabase();
    const row = readKitWorkspaceStatusRow(db);
    if (!workspaceStatusTableAvailable(db) || row === null) {
      return {
        ok: false,
        code: "workspace-status-unavailable",
        message: "kit_workspace_status not available for export"
      };
    }
    const yamlBody = formatWorkspaceStatusDbExportYaml(row);
    if (dryRun) {
      return {
        ok: true,
        code: "workspace-status-export-dry-run",
        message: "Dry run — no file write",
        data: {
          dryRun: true,
          fileRelativePath: WORKSPACE_STATUS_DB_EXPORT_RELATIVE,
          yamlBody
        }
      };
    }
    const written = writeWorkspaceStatusDbExport(ctx, yamlBody);
    return {
      ok: true,
      code: "workspace-status-exported",
      message: `Wrote non-authoritative export to ${written}`,
      data: {
        dryRun: false,
        fileRelativePath: written,
        workspaceRevision: row.workspaceRevision
      }
    };
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return {
      ok: false,
      code: "storage-write-error",
      message: `Failed to export workspace status: ${(e as Error).message}`
    };
  }
}

export async function runWorkspaceStatusHistory(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  let limit = 50;
  if (args.limit !== undefined) {
    if (typeof args.limit !== "number" || !Number.isInteger(args.limit)) {
      return { ok: false, code: "invalid-task-schema", message: "limit must be an integer when provided" };
    }
    limit = args.limit;
  }
  try {
    const dual = openSqliteDualForWorkspaceStatus(ctx);
    const db = dual.getDatabase();
    const events = listWorkspaceStatusEvents(db, limit);
    return {
      ok: true,
      code: "workspace-status-history",
      message: "Listed workspace status events",
      data: { events, limit }
    };
  } catch (e) {
    if (e instanceof TaskEngineError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return {
      ok: false,
      code: "storage-read-error",
      message: `Failed to list workspace status history: ${(e as Error).message}`
    };
  }
}
