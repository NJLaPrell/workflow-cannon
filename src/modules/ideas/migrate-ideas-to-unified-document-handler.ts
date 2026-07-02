import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { attachPolicyMeta } from "../task-engine/attach-planning-response-meta.js";
import { planningGenPolicyGate } from "../task-engine/planning-generation-gate.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { migrateIdeasToUnifiedDocument } from "./migrate-ideas-to-unified-document.js";

export async function runMigrateIdeasToUnifiedDocument(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  instructionPath: string
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun !== false;

  let planning;
  try {
    planning = await openPlanningStores(ctx);
  } catch (err) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: "storage-read-error",
      message: `Failed to open planning stores: ${(err as Error).message}`
    };
  }

  const workspacePath = ctx.workspacePath ?? process.cwd();
  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const pg = planningGenPolicyGate(ctx, args, instructionPath, planningGeneration);
  if (pg.block) {
    return pg.block;
  }

  const result = migrateIdeasToUnifiedDocument({
    workspacePath,
    db: planning.sqliteDual.getDatabase(),
    dryRun
  });

  if (result.dataLossReported) {
    const data: Record<string, unknown> = {
      responseSchemaVersion: 1,
      ...result
    };
    attachPolicyMeta(data, ctx, planningGeneration, pg.warnings);
    return {
      ok: false,
      code: "migration-data-loss",
      message: `Migration ${dryRun ? "dry-run " : ""}reported unreadable legacy artifacts`,
      data
    };
  }

  const data: Record<string, unknown> = {
    responseSchemaVersion: 1,
    ...result
  };
  attachPolicyMeta(data, ctx, planningGeneration, pg.warnings);
  return {
    ok: true,
    code: dryRun ? "ideas-unified-migration-dry-run" : "ideas-unified-migration-applied",
    message: dryRun
      ? `Dry-run: ${result.ideaCount} idea(s) inspected; ${result.outcomes.length} outcome(s)`
      : `Migrated ${result.outcomes.filter((o) => o.action !== "skipped").length} idea(s) to unified documents`,
    data
  };
}
