import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";
import { evaluateTaskStateProjectionHealth } from "./task-state-projection-health.js";
import { runRebuildTaskStateCache } from "./rebuild-task-state-cache-runtime.js";
import { openPlanningStoresForTaskStateCache } from "./task-state-cache-runtime-shared.js";
import path from "node:path";
import fs from "node:fs";

/** Detect stale/corrupt projection and rebuild from canonical log without mutating the log. */
export async function runRepairTaskStateCache(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;
  const autoRebuild = args.autoRebuild !== false;
  const eventLogRelativePath =
    typeof args.eventLogRelativePath === "string" && args.eventLogRelativePath.trim()
      ? args.eventLogRelativePath.trim()
      : undefined;

  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dbAbs = path.resolve(ctx.workspacePath, dbRel);
  if (!fs.existsSync(dbAbs)) {
    return {
      ok: false,
      code: "storage-read-error",
      message: `Planning database not found at ${path.relative(ctx.workspacePath, dbAbs) || dbAbs}`
    };
  }

  const planning = await openPlanningStoresForTaskStateCache(ctx);
  const db = planning.sqliteDual.getDatabase();
  const health = evaluateTaskStateProjectionHealth(ctx.workspacePath, db, eventLogRelativePath);

  if (health.code === "projection-fresh" || health.code === "projection-empty") {
    return {
      ok: true,
      code: "task-state-projection-healthy",
      message: health.message,
      data: { schemaVersion: 1, dryRun, health }
    };
  }

  if (health.code === "projection-stale") {
    return {
      ok: true,
      code: "task-state-projection-stale",
      message: `${health.message} — prefer apply-task-state-events for incremental catch-up`,
      data: {
        schemaVersion: 1,
        dryRun,
        health,
        recommendedCommand: health.recommendedCommand
      }
    };
  }

  if (dryRun) {
    return {
      ok: true,
      code: "task-state-cache-repair-dry-run",
      message: `Dry run: would rebuild projection (${health.code})`,
      data: { schemaVersion: 1, dryRun, health, autoRebuild }
    };
  }

  if (!autoRebuild) {
    return {
      ok: false,
      code: "task-state-projection-repair-required",
      message: health.message,
      data: { schemaVersion: 1, health, recommendedCommand: health.recommendedCommand }
    };
  }

  return runRebuildTaskStateCache(ctx, {
    ...args,
    dryRun: false,
    eventLogRelativePath
  });
}
