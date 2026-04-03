import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { readOptionalExpectedPlanningGeneration } from "./mutation-utils.js";

export type TaskPersistenceBackend = "sqlite";

/** SQLite planning row optimistic-lock enforcement for mutating commands (see ADR-planning-generation-optimistic-concurrency.md). */
export type PlanningGenerationPolicy = "off" | "warn" | "require";

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

export function getPlanningGenerationPolicy(ctx: {
  effectiveConfig?: Record<string, unknown>;
}): PlanningGenerationPolicy {
  const tasks = ctx.effectiveConfig?.tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
    return "off";
  }
  const raw = (tasks as Record<string, unknown>).planningGenerationPolicy;
  if (raw === "warn" || raw === "require") {
    return raw;
  }
  return "off";
}

export type PlanningGenerationPolicyGateResult =
  | { ok: true; warnings?: string[] }
  | { ok: false; code: "planning-generation-required"; message: string };

/** Gate mutating planning-store commands when tasks.planningGenerationPolicy is warn or require. */
export function enforcePlanningGenerationPolicy(
  policy: PlanningGenerationPolicy,
  args: Record<string, unknown>
): PlanningGenerationPolicyGateResult {
  const hasToken = readOptionalExpectedPlanningGeneration(args) !== undefined;
  if (policy === "require" && !hasToken) {
    return {
      ok: false,
      code: "planning-generation-required",
      message:
        "tasks.planningGenerationPolicy is 'require': include expectedPlanningGeneration from a prior read (planningGeneration on responses); retry after re-read when you get planning-generation-mismatch"
    };
  }
  if (policy === "warn" && !hasToken) {
    return {
      ok: true,
      warnings: [
        "tasks.planningGenerationPolicy is 'warn': expectedPlanningGeneration omitted — last-writer-wins; pass the token from your last read for strong consistency"
      ]
    };
  }
  return { ok: true };
}

export function mergePlanningGenerationPolicyWarnings(
  data: Record<string, unknown>,
  warnings: string[] | undefined
): void {
  if (!warnings?.length) {
    return;
  }
  const prior = data.planningGenerationPolicyWarnings;
  const merged = [
    ...(Array.isArray(prior) ? prior.filter((x): x is string => typeof x === "string") : []),
    ...warnings
  ];
  data.planningGenerationPolicyWarnings = merged;
}
