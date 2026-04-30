/**
 * Routes task-engine commands that do not require opening the planning/task SQLite stores.
 * Keeps {@link ../task-engine-internal.ts task-engine-internal} on-command wiring thin.
 */
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { readKitSqliteUserVersion } from "../../../core/state/workspace-kit-sqlite.js";
import { UnifiedStateDb } from "../../../core/state/unified-state-db.js";
import { runClassifyKitState } from "../kit-state-classifier.js";
import { runMigrateTaskPersistence } from "../persistence/migrate-task-persistence-runtime.js";
import { runBackupPlanningSqlite } from "../persistence/backup-planning-sqlite-runtime.js";
import { runGetKitPersistenceMap } from "../persistence/kit-persistence-map-runtime.js";
import { runTaskPersistenceReadiness } from "../persistence/task-persistence-readiness.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";
import { runUpdateWorkspacePhaseSnapshot } from "../update-workspace-phase-snapshot-runtime.js";
import {
  runExportWorkspaceStatus,
  runGetWorkspaceStatus,
  runSetCurrentPhase,
  runUpdateWorkspaceStatus,
  runWorkspaceStatusHistory
} from "../workspace-status-commands-runtime.js";

/** If non-null, dispatch should return immediately (command fully handled without planning stores). */
export async function routeTaskEngineBeforeOpenPlanningStores(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext
): Promise<ModuleCommandResult | null> {
  const args = command.args ?? {};
  if (command.name === "migrate-task-persistence") {
    return runMigrateTaskPersistence(ctx, args as Record<string, unknown>);
  }
  if (command.name === "task-persistence-readiness") {
    return runTaskPersistenceReadiness(ctx, args as Record<string, unknown>);
  }
  if (command.name === "backup-planning-sqlite") {
    return runBackupPlanningSqlite(ctx, args as Record<string, unknown>);
  }
  if (command.name === "get-kit-persistence-map") {
    return runGetKitPersistenceMap(ctx);
  }
  if (command.name === "update-workspace-phase-snapshot") {
    return runUpdateWorkspacePhaseSnapshot(ctx, args as Record<string, unknown>);
  }
  if (command.name === "get-workspace-status") {
    return runGetWorkspaceStatus(ctx, args as Record<string, unknown>);
  }
  if (command.name === "classify-kit-state") {
    return runClassifyKitState(ctx, args as Record<string, unknown>);
  }
  if (command.name === "update-workspace-status") {
    return runUpdateWorkspaceStatus(ctx, args as Record<string, unknown>);
  }
  if (command.name === "set-current-phase") {
    return runSetCurrentPhase(ctx, args as Record<string, unknown>);
  }
  if (command.name === "export-workspace-status") {
    return runExportWorkspaceStatus(ctx, args as Record<string, unknown>);
  }
  if (command.name === "workspace-status-history") {
    return runWorkspaceStatusHistory(ctx, args as Record<string, unknown>);
  }
  if (command.name === "list-module-states" || command.name === "get-module-state") {
    const unified = new UnifiedStateDb(ctx.workspacePath, planningSqliteDatabaseRelativePath(ctx));
    const dbAbs = unified.dbPath;
    let kitSqliteUserVersion: number | null = null;
    try {
      const fs = await import("node:fs");
      if (fs.existsSync(dbAbs)) {
        kitSqliteUserVersion = readKitSqliteUserVersion(dbAbs);
      }
    } catch {
      kitSqliteUserVersion = null;
    }
    if (command.name === "list-module-states") {
      return {
        ok: true,
        code: "module-states-listed",
        message: "Listed module state rows",
        data: { rows: unified.listModuleStates(), kitSqliteUserVersion }
      };
    }
    const moduleId = typeof args.moduleId === "string" ? args.moduleId.trim() : "";
    if (!moduleId) {
      return { ok: false, code: "invalid-task-schema", message: "get-module-state requires moduleId" };
    }
    const row = unified.getModuleState(moduleId);
    return row
      ? {
          ok: true,
          code: "module-state-read",
          message: `Read module state for ${moduleId}`,
          data: { row }
        }
      : {
          ok: false,
          code: "task-not-found",
          message: `No module state found for '${moduleId}'`
        };
  }

  return null;
}
