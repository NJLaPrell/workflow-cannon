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
  if (command.name === "migrate-task-persistence") {
    return runMigrateTaskPersistence(ctx, args as Record<string, unknown>);
  }
  if (command.name === "task-persistence-readiness") {
    return runTaskPersistenceReadiness(ctx, args as Record<string, unknown>);
  }
  if (command.name === "backup-planning-sqlite") {
    return runBackupPlanningSqlite(ctx, args as Record<string, unknown>);
  }
  if (command.name === "rebuild-task-state-cache") {
    return runRebuildTaskStateCache(ctx, args as Record<string, unknown>);
  }
  if (command.name === "apply-task-state-events") {
    return runApplyTaskStateEvents(ctx, args as Record<string, unknown>);
  }
  if (command.name === "repair-task-state-cache") {
    return runRepairTaskStateCache(ctx, args as Record<string, unknown>);
  }
  if (command.name === "task-state-status") {
    return runTaskStateStatus(ctx, args as Record<string, unknown>);
  }
  if (command.name === "task-state-hydrate") {
    return runTaskStateHydrate(ctx, args as Record<string, unknown>);
  }
  if (command.name === "task-state-init") {
    return runTaskStateInit(ctx, args as Record<string, unknown>);
  }
  if (command.name === "task-state-verify") {
    return runTaskStateVerify(ctx, args as Record<string, unknown>);
  }
  if (command.name === "task-state-publish") {
    return runTaskStatePublish(ctx, args as Record<string, unknown>);
  }
  if (command.name === "task-state-snapshot") {
    return runTaskStateSnapshot(ctx, args as Record<string, unknown>);
  }
  if (command.name === "task-state-compact") {
    return runTaskStateCompact(ctx, args as Record<string, unknown>);
  }
  if (command.name === "task-state-migrate-baseline") {
    return runTaskStateMigrateBaseline(ctx, args as Record<string, unknown>);
  }
  if (command.name === "planning-state-migrate-baseline") {
    return runPlanningStateMigrateBaseline(ctx, args as Record<string, unknown>);
  }
  if (command.name === "get-kit-persistence-map") {
    return runGetKitPersistenceMap(ctx);
  }
  if (command.name === "update-workspace-phase-snapshot") {
    return runUpdateWorkspacePhaseSnapshot(ctx, args as Record<string, unknown>);
  }
  if (command.name === "list-phase-catalog") {
    return runListPhaseCatalog(ctx);
  }
  if (command.name === "get-workspace-status") {
    return runGetWorkspaceStatus(ctx, args as Record<string, unknown>);
  }
  if (command.name === "get-last-output") {
    return runGetLastOutput(ctx, args as Record<string, unknown>);
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
  if (command.name === "claim-workspace-edit-lease") {
    return runClaimWorkspaceEditLease(ctx, args as Record<string, unknown>);
  }
  if (command.name === "heartbeat-workspace-edit-lease") {
    return runHeartbeatWorkspaceEditLease(ctx, args as Record<string, unknown>);
  }
  if (command.name === "release-workspace-edit-lease") {
    return runReleaseWorkspaceEditLease(ctx, args as Record<string, unknown>);
  }
  if (command.name === "workspace-edit-status") {
    return runWorkspaceEditStatus(ctx, args as Record<string, unknown>);
  }
  if (command.name === "workspace-coordination-status") {
    return runWorkspaceCoordinationStatus(ctx);
  }
  if (command.name === "install-git-hooks") {
    return runInstallGitHooksCommand(ctx);
  }
  if (command.name === "uninstall-git-hooks") {
    return runUninstallGitHooksCommand(ctx);
  }
  if (command.name === "check-task-store-commit") {
    return runCheckTaskStoreCommit(ctx);
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
  if (command.name === "dashboard-service-start") {
    return runDashboardServiceStart(ctx);
  }
  if (command.name === "dashboard-service-stop") {
    return runDashboardServiceStop(ctx);
  }
  if (command.name === "dashboard-service-status") {
    return runDashboardServiceStatus(ctx);
  }
  if (command.name === "dashboard-service-snapshot") {
    return runDashboardServiceSnapshot(ctx);
  }

  return null;
}
