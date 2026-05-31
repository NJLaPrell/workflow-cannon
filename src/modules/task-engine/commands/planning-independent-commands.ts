/**
 * Routes task-engine commands that do not require opening the planning/task SQLite stores.
 * Keeps {@link ../task-engine-internal.ts task-engine-internal} on-command wiring thin.
 */
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { resolveTaskSyncCommandAlias } from "../../../core/task-sync-command-aliases.js";
import { readKitSqliteUserVersion } from "../../../core/state/workspace-kit-sqlite.js";
import { UnifiedStateDb } from "../../../core/state/unified-state-db.js";
import { runClassifyKitState } from "../kit-state-classifier.js";
import { runMigrateTaskPersistence } from "../persistence/migrate-task-persistence-runtime.js";
import { runBackupPlanningSqlite } from "../persistence/backup-planning-sqlite-runtime.js";
import { runApplyTaskStateEvents } from "../persistence/apply-task-state-events-runtime.js";
import { runRepairTaskStateCache } from "../persistence/repair-task-state-cache-runtime.js";
import { runRebuildTaskStateCache } from "../persistence/rebuild-task-state-cache-runtime.js";
import { runTaskStateHydrate } from "../persistence/task-state-hydrate-runtime.js";
import { runTaskStateInit } from "../persistence/task-state-init-runtime.js";
import { runTaskStateStatus } from "../persistence/task-state-status-runtime.js";
import { runTaskStateVerify } from "../persistence/task-state-verify-runtime.js";
import { runTaskStatePublish } from "../persistence/task-state-publish-runtime.js";
import { runTaskStateSnapshot } from "../persistence/task-state-snapshot-runtime.js";
import { runTaskStateCompact } from "../persistence/task-state-compact-runtime.js";
import { runTaskStateMigrateBaseline } from "../persistence/task-state-migrate-baseline-runtime.js";
import { runPlanningStateMigrateBaseline } from "../persistence/planning-state-migrate-baseline-runtime.js";
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
import { runListPhaseCatalog } from "../phase-catalog-commands-runtime.js";
import { runWorkspaceCoordinationStatus } from "../workspace-coordination-status-runtime.js";
import {
  runClaimWorkspaceEditLease,
  runHeartbeatWorkspaceEditLease,
  runReleaseWorkspaceEditLease,
  runWorkspaceEditStatus
} from "../workspace-edit-lease-commands-runtime.js";
import {
  runInstallGitHooksCommand,
  runUninstallGitHooksCommand
} from "./git-policy-hooks-commands.js";
import { runCheckTaskStoreCommit } from "../persistence/check-task-store-commit-runtime.js";
import { runGetLastOutput } from "./get-last-output-command.js";
import {
  runDashboardServiceSnapshot,
  runDashboardServiceStart,
  runDashboardServiceStatus,
  runDashboardServiceStop
} from "../../../services/dashboard-service/lifecycle-runtime.js";

/** If non-null, dispatch should return immediately (command fully handled without planning stores). */
export async function routeTaskEngineBeforeOpenPlanningStores(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext
): Promise<ModuleCommandResult | null> {
  const args = command.args ?? {};
  const name = resolveTaskSyncCommandAlias(command.name);
  if (name === "migrate-task-persistence") {
    return runMigrateTaskPersistence(ctx, args as Record<string, unknown>);
  }
  if (name === "task-persistence-readiness") {
    return runTaskPersistenceReadiness(ctx, args as Record<string, unknown>);
  }
  if (name === "backup-planning-sqlite") {
    return runBackupPlanningSqlite(ctx, args as Record<string, unknown>);
  }
  if (name === "rebuild-task-state-cache") {
    return runRebuildTaskStateCache(ctx, args as Record<string, unknown>);
  }
  if (name === "apply-task-state-events") {
    return runApplyTaskStateEvents(ctx, args as Record<string, unknown>);
  }
  if (name === "repair-task-state-cache") {
    return runRepairTaskStateCache(ctx, args as Record<string, unknown>);
  }
  if (name === "task-sync-status") {
    return runTaskStateStatus(ctx, args as Record<string, unknown>);
  }
  if (name === "task-sync-hydrate") {
    return runTaskStateHydrate(ctx, args as Record<string, unknown>);
  }
  if (name === "task-sync-init") {
    return runTaskStateInit(ctx, args as Record<string, unknown>);
  }
  if (name === "task-sync-verify") {
    return runTaskStateVerify(ctx, args as Record<string, unknown>);
  }
  if (name === "task-sync-publish") {
    return runTaskStatePublish(ctx, args as Record<string, unknown>);
  }
  if (name === "task-sync-snapshot") {
    return runTaskStateSnapshot(ctx, args as Record<string, unknown>);
  }
  if (name === "task-sync-compact") {
    return runTaskStateCompact(ctx, args as Record<string, unknown>);
  }
  if (name === "task-state-migrate-baseline") {
    return runTaskStateMigrateBaseline(ctx, args as Record<string, unknown>);
  }
  if (name === "planning-state-migrate-baseline") {
    return runPlanningStateMigrateBaseline(ctx, args as Record<string, unknown>);
  }
  if (name === "get-kit-persistence-map") {
    return runGetKitPersistenceMap(ctx);
  }
  if (name === "update-workspace-phase-snapshot") {
    return runUpdateWorkspacePhaseSnapshot(ctx, args as Record<string, unknown>);
  }
  if (name === "list-phase-catalog") {
    return runListPhaseCatalog(ctx);
  }
  if (name === "get-workspace-status") {
    return runGetWorkspaceStatus(ctx, args as Record<string, unknown>);
  }
  if (name === "get-last-output") {
    return runGetLastOutput(ctx, args as Record<string, unknown>);
  }
  if (name === "classify-kit-state") {
    return runClassifyKitState(ctx, args as Record<string, unknown>);
  }
  if (name === "update-workspace-status") {
    return runUpdateWorkspaceStatus(ctx, args as Record<string, unknown>);
  }
  if (name === "set-current-phase") {
    return runSetCurrentPhase(ctx, args as Record<string, unknown>);
  }
  if (name === "export-workspace-status") {
    return runExportWorkspaceStatus(ctx, args as Record<string, unknown>);
  }
  if (name === "workspace-status-history") {
    return runWorkspaceStatusHistory(ctx, args as Record<string, unknown>);
  }
  if (name === "claim-workspace-edit-lease") {
    return runClaimWorkspaceEditLease(ctx, args as Record<string, unknown>);
  }
  if (name === "heartbeat-workspace-edit-lease") {
    return runHeartbeatWorkspaceEditLease(ctx, args as Record<string, unknown>);
  }
  if (name === "release-workspace-edit-lease") {
    return runReleaseWorkspaceEditLease(ctx, args as Record<string, unknown>);
  }
  if (name === "workspace-edit-status") {
    return runWorkspaceEditStatus(ctx, args as Record<string, unknown>);
  }
  if (name === "workspace-coordination-status") {
    return runWorkspaceCoordinationStatus(ctx);
  }
  if (name === "install-git-hooks") {
    return runInstallGitHooksCommand(ctx);
  }
  if (name === "uninstall-git-hooks") {
    return runUninstallGitHooksCommand(ctx);
  }
  if (name === "check-task-store-commit") {
    return runCheckTaskStoreCommit(ctx);
  }
  if (name === "list-module-states" || name === "get-module-state") {
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
    if (name === "list-module-states") {
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
  if (name === "dashboard-service-start") {
    return runDashboardServiceStart(ctx);
  }
  if (name === "dashboard-service-stop") {
    return runDashboardServiceStop(ctx);
  }
  if (name === "dashboard-service-status") {
    return runDashboardServiceStatus(ctx);
  }
  if (name === "dashboard-service-snapshot") {
    return runDashboardServiceSnapshot(ctx);
  }

  return null;
}
