import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";

export type TaskPersistenceBackend = "sqlite";

/** Runtime persistence is SQLite-only; config must not set `tasks.persistenceBackend` to `json`. */
export function getTaskPersistenceBackend(
  _config: Record<string, unknown> | undefined
): TaskPersistenceBackend {
  return "sqlite";
}

export function planningTaskStoreRelativePath(ctx: {
  effectiveConfig?: Record<string, unknown>;
}): string | undefined {
  const tasks = ctx.effectiveConfig?.tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
    return undefined;
  }
  const p = (tasks as Record<string, unknown>).storeRelativePath;
  return typeof p === "string" && p.trim().length > 0 ? p.trim() : undefined;
}

export function planningWishlistStoreRelativePath(ctx: {
  effectiveConfig?: Record<string, unknown>;
}): string | undefined {
  const tasks = ctx.effectiveConfig?.tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
    return undefined;
  }
  const p = (tasks as Record<string, unknown>).wishlistStoreRelativePath;
  return typeof p === "string" && p.trim().length > 0 ? p.trim() : undefined;
}

export function planningSqliteDatabaseRelativePath(ctx: ModuleLifecycleContext): string {
  const tasks = ctx.effectiveConfig?.tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
    return ".workspace-kit/tasks/workspace-kit.db";
  }
  const p = (tasks as Record<string, unknown>).sqliteDatabaseRelativePath;
  return typeof p === "string" && p.trim().length > 0
    ? p.trim()
    : ".workspace-kit/tasks/workspace-kit.db";
}

export function planningStrictValidationEnabled(ctx: {
  effectiveConfig?: Record<string, unknown>;
}): boolean {
  const tasks = ctx.effectiveConfig?.tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
    return false;
  }
  return (tasks as Record<string, unknown>).strictValidation === true;
}
