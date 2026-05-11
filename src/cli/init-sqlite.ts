import fs from "node:fs/promises";
import path from "node:path";
import type { ModuleLifecycleContext } from "../contracts/module-contract.js";
import { resolveRegistryAndConfig } from "../core/module-registry-resolve.js";
import { defaultRegistryModules } from "../modules/index.js";
import { openPlanningStores } from "../core/planning/index.js";
import { planningSqliteDatabaseRelativePath } from "../modules/task-engine/planning-config.js";

export type EnsurePlanningStoresResult = {
  ok: boolean;
  relativeDbPath: string;
  warnings: string[];
  message?: string;
};

/**
 * Open / migrate the SQLite planning database via the same path used by module runtime (creates file when missing).
 */
export async function ensurePlanningStoresInitialized(cwd: string): Promise<EnsurePlanningStoresResult> {
  const warnings: string[] = [];
  try {
    const { effective } = await resolveRegistryAndConfig(cwd, defaultRegistryModules);
    const ctx = {
      workspacePath: cwd,
      effectiveConfig: effective as Record<string, unknown>,
      runtimeVersion: "0"
    } as ModuleLifecycleContext;
    const rel = planningSqliteDatabaseRelativePath(ctx);
    let databaseAlreadyExists = true;
    try {
      await fs.access(path.join(cwd, rel));
    } catch {
      databaseAlreadyExists = false;
    }
    const stores = await openPlanningStores(ctx);
    if (!databaseAlreadyExists) {
      await stores.taskStore.save();
    }
    stores.sqliteDual.closeDatabase();
    return { ok: true, relativeDbPath: rel, warnings };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      relativeDbPath: ".workspace-kit/tasks/workspace-kit.db",
      warnings,
      message
    };
  }
}
