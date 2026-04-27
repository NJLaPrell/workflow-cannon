import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { readProjectConfigDocument, writeProjectConfigDocument } from "../../core/workspace-kit-config.js";
import {
  applyWorkspacePhaseSnapshotToYaml,
  parseWorkspaceKitStatusYaml,
  WORKSPACE_KIT_STATUS_YAML_RELATIVE
} from "./dashboard/dashboard-status.js";
import { parseKitPhaseNumberFromYaml } from "./phase-resolution.js";
import {
  formatWorkspaceStatusDbExportYaml,
  openSqliteDualForWorkspaceStatus,
  patchWorkspaceStatus,
  readKitWorkspaceStatusRow,
  workspaceStatusTableAvailable,
  writeWorkspaceStatusDbExport
} from "./persistence/workspace-status-store.js";

const COMPATIBILITY_WARNING =
  "update-workspace-phase-snapshot is a compatibility shim; prefer set-current-phase for phase rollover and phase-status for reads";

async function writeCompatibilityYaml(abs: string, yaml: string): Promise<void> {
  const tmpPath = `${abs}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  try {
    await fs.writeFile(tmpPath, yaml, "utf8");
    await fs.rename(tmpPath, abs);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      /* best-effort */
    }
    throw err;
  }
}

function patchProjectConfigPhaseHint(doc: Record<string, unknown>, phaseNumber: number): Record<string, unknown> {
  const next: Record<string, unknown> = { ...doc };
  const kit =
    doc.kit && typeof doc.kit === "object" && !Array.isArray(doc.kit) ? { ...(doc.kit as Record<string, unknown>) } : {};
  kit.currentPhaseNumber = phaseNumber;
  kit.currentPhaseLabel = `Phase ${phaseNumber}`;
  next.kit = kit;
  return next;
}

function compatibilityStorageFailure(code: string, message: string): ModuleCommandResult {
  return {
    ok: false,
    code,
    message,
    data: {
      compatibilityWarning: COMPATIBILITY_WARNING,
      repairHint: "Run phase-status to inspect drift, then use set-current-phase for the SQLite-first repair."
    } as Record<string, unknown>
  };
}

/** Atomic update of `current_kit_phase` / `next_kit_phase` in workspace-kit-status.yaml. */
export async function runUpdateWorkspacePhaseSnapshot(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;

  let currentKitPhase: string | undefined;
  let nextKitPhase: string | null | undefined;

  if (Object.hasOwn(args, "currentKitPhase")) {
    const v = args.currentKitPhase;
    if (v === null) {
      return { ok: false, code: "invalid-task-schema", message: "currentKitPhase cannot be null" };
    }
    if (typeof v !== "string") {
      return { ok: false, code: "invalid-task-schema", message: "currentKitPhase must be a string when provided" };
    }
    currentKitPhase = v;
  }

  if (Object.hasOwn(args, "nextKitPhase")) {
    const v = args.nextKitPhase;
    if (v === null) {
      nextKitPhase = null;
    } else if (typeof v === "string") {
      nextKitPhase = v;
    } else {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: "nextKitPhase must be a string or JSON null when provided"
      };
    }
  }

  if (currentKitPhase === undefined && nextKitPhase === undefined) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message:
        "update-workspace-phase-snapshot requires currentKitPhase and/or nextKitPhase (string); use null for nextKitPhase to remove the line"
    };
  }

  const updates: { currentKitPhase?: string; nextKitPhase?: string | null } = {};
  if (currentKitPhase !== undefined) {
    updates.currentKitPhase = currentKitPhase;
  }
  if (nextKitPhase !== undefined) {
    updates.nextKitPhase = nextKitPhase;
  }

  const abs = path.join(ctx.workspacePath, WORKSPACE_KIT_STATUS_YAML_RELATIVE);
  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch {
    return {
      ok: false,
      code: "storage-read-error",
      message: `Cannot read ${WORKSPACE_KIT_STATUS_YAML_RELATIVE}`
    };
  }

  const before = parseWorkspaceKitStatusYaml(raw);
  const applied = applyWorkspacePhaseSnapshotToYaml(raw, updates);
  if (!applied.ok) {
    return { ok: false, code: "invalid-transition", message: applied.message };
  }

  if (dryRun) {
    const after = parseWorkspaceKitStatusYaml(applied.yaml);
    return {
      ok: true,
      code: "workspace-phase-snapshot-dry-run",
      message: "Dry run — no file write",
      data: {
        dryRun: true,
        fileRelativePath: WORKSPACE_KIT_STATUS_YAML_RELATIVE,
        snapshotBefore: before,
        snapshotAfter: after,
        compatibilityWarning: COMPATIBILITY_WARNING,
        recommendedCommand:
          currentKitPhase !== undefined
            ? "workspace-kit run set-current-phase '{\"currentKitPhase\":\"<phase>\",\"expectedWorkspaceRevision\":<revision>}'"
            : "workspace-kit run set-current-phase '{\"currentKitPhase\":\"<current>\",\"nextKitPhase\":\"<next>\",\"expectedWorkspaceRevision\":<revision>}'"
      } as Record<string, unknown>
    };
  }

  const after = parseWorkspaceKitStatusYaml(applied.yaml);
  let sqliteMirror: { beforeRevision: number; afterRevision: number } | null = null;
  let delegatedCommand: Record<string, unknown> | null = null;
  let exportRelativePath: string | null = null;

  try {
    const dual = openSqliteDualForWorkspaceStatus(ctx);
    const db = dual.getDatabase();
    if (workspaceStatusTableAvailable(db)) {
      if (currentKitPhase !== undefined) {
        const row = readKitWorkspaceStatusRow(db);
        if (!row) {
          return compatibilityStorageFailure("storage-read-error", "kit_workspace_status row missing");
        }
        const phaseKey = parseKitPhaseNumberFromYaml(currentKitPhase);
        if (!phaseKey) {
          return {
            ok: false,
            code: "invalid-task-schema",
            message: "currentKitPhase must begin with a positive phase number (for example \"72\")"
          };
        }
        const patch = {
          currentKitPhase,
          lastUpdated: new Date().toISOString(),
          ...(nextKitPhase !== undefined ? { nextKitPhase } : {})
        };
        sqliteMirror = patchWorkspaceStatus(db, {
          expectedWorkspaceRevision: row.workspaceRevision,
          patch,
          actor: "workspace-kit",
          command: "set-current-phase",
          eventKind: "set_current_phase",
          details: { compatibilityCommand: "update-workspace-phase-snapshot" }
        });
        const updated = readKitWorkspaceStatusRow(db);
        if (!updated) {
          return compatibilityStorageFailure("storage-read-error", "Updated SQLite but could not re-read workspace status");
        }
        const configBefore = await readProjectConfigDocument(ctx.workspacePath);
        await writeProjectConfigDocument(ctx.workspacePath, patchProjectConfigPhaseHint(configBefore, Number(phaseKey)));
        exportRelativePath = writeWorkspaceStatusDbExport(ctx, formatWorkspaceStatusDbExportYaml(updated));
        delegatedCommand = {
          name: "set-current-phase",
          code: "set-current-phase-updated",
          message: "Applied set-current-phase compatibility semantics"
        };
      } else {
        const row = readKitWorkspaceStatusRow(db);
        if (!row) {
          return compatibilityStorageFailure("storage-read-error", "kit_workspace_status row missing");
        }
        sqliteMirror = patchWorkspaceStatus(db, {
          expectedWorkspaceRevision: row.workspaceRevision,
          patch: { nextKitPhase },
          actor: "workspace-kit",
          command: "update-workspace-phase-snapshot",
          eventKind: "phase_snapshot_compat_next_patch",
          details: { compatibilityWarning: COMPATIBILITY_WARNING }
        });
        const updated = readKitWorkspaceStatusRow(db);
        if (!updated) {
          return compatibilityStorageFailure("storage-read-error", "Updated SQLite but could not re-read workspace status");
        }
        exportRelativePath = writeWorkspaceStatusDbExport(ctx, formatWorkspaceStatusDbExportYaml(updated));
      }
    }
  } catch (e) {
    return {
      ok: false,
      code: "storage-write-error",
      message: `Refused to update ${WORKSPACE_KIT_STATUS_YAML_RELATIVE} because SQLite/export compatibility update failed first: ${(e as Error).message}`,
      data: {
        compatibilityWarning: COMPATIBILITY_WARNING,
        repairHint: "Run phase-status to inspect drift, then use set-current-phase for the SQLite-first repair."
      } as Record<string, unknown>
    };
  }

  try {
    await writeCompatibilityYaml(abs, applied.yaml);
  } catch (err) {
    return {
      ok: false,
      code: "storage-write-error",
      message: `Updated SQLite/export but failed to write compatibility YAML ${WORKSPACE_KIT_STATUS_YAML_RELATIVE}: ${(err as Error).message}`,
      data: {
        compatibilityWarning: COMPATIBILITY_WARNING,
        repairHint: "SQLite remains authoritative; run phase-status to inspect drift before retrying compatibility YAML repair."
      } as Record<string, unknown>
    };
  }

  return {
    ok: true,
    code: "workspace-phase-snapshot-updated",
    message: `Updated compatibility phase snapshot fields in ${WORKSPACE_KIT_STATUS_YAML_RELATIVE}`,
    data: {
      dryRun: false,
      fileRelativePath: WORKSPACE_KIT_STATUS_YAML_RELATIVE,
      snapshotBefore: before,
      snapshotAfter: after,
      sqliteMirror,
      delegatedCommand,
      exportRelativePath,
      compatibilityWarning: COMPATIBILITY_WARNING,
      recommendedCommand:
        "workspace-kit run set-current-phase '{\"currentKitPhase\":\"<phase>\",\"nextKitPhase\":\"<next>\",\"expectedWorkspaceRevision\":<revision>}'"
    } as Record<string, unknown>
  };
}
