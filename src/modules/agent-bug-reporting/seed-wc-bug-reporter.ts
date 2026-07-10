import type Database from "better-sqlite3";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores } from "../../core/planning/index.js";
import { TaskEngineError } from "../task-engine/transitions.js";
import { readOptionalExpectedPlanningGeneration } from "../task-engine/mutation-utils.js";
import {
  getPlanningGenerationPolicy,
  mergePlanningGenerationPolicyWarnings
} from "../task-engine/planning-config.js";
import {
  assertSubagentKitSchema,
  getDefinitionById,
  insertDefinition,
  updateDefinition
} from "../subagents/subagent-store.js";
import {
  WC_BUG_REPORTER_SEED,
  WC_BUG_REPORTER_SUBAGENT_ID,
  buildWcBugReporterRegisterArgs,
  buildSeedWcBugReporterPayload
} from "./subagent-seed/wc-bug-reporter-seed.js";

function readAnyTaskId(db: Database.Database): string | undefined {
  const row = db.prepare("SELECT id FROM task_engine_tasks ORDER BY id LIMIT 1").get() as
    | { id: string }
    | undefined;
  return row?.id;
}

/**
 * Seed `wc-bug-reporter` into kit SQLite via the subagents definition store.
 * Preview by default; pass `apply: true` to persist (upsert non-retired definition).
 */
export async function runSeedWcBugReporterCommand(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const preview = args.apply !== true;
  const payload = buildSeedWcBugReporterPayload(
    typeof args.expectedPlanningGeneration === "number"
      ? Math.trunc(args.expectedPlanningGeneration)
      : undefined
  );

  if (preview) {
    return {
      ok: true,
      code: "wc-bug-reporter-seed-preview",
      message: `Preview seed for '${WC_BUG_REPORTER_SUBAGENT_ID}' — re-run with apply:true to register`,
      data: {
        responseSchemaVersion: 1,
        mode: "preview",
        subagentId: WC_BUG_REPORTER_SUBAGENT_ID,
        ...payload
      }
    };
  }

  let planning;
  try {
    planning = await openPlanningStores(ctx);
  } catch (err: unknown) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: "storage-read-error",
      message: `Failed to open planning stores: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Materialize / migrate the kit DB before reading user_version off-disk.
  const db = planning.sqliteDual.getDatabase();
  const schemaOk = assertSubagentKitSchema(planning.sqliteDual.dbPath);
  if (!schemaOk.ok) {
    return { ok: false, code: "invalid-task-schema", message: schemaOk.message };
  }
  const policy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  let exp = readOptionalExpectedPlanningGeneration(args);
  const warnings: string[] = [];
  if (policy === "require" && exp === undefined) {
    exp = planning.sqliteDual.getPlanningGeneration();
    warnings.push("auto-filled expectedPlanningGeneration from current planning generation");
  }

  const seed = WC_BUG_REPORTER_SEED;
  const ts = new Date().toISOString();
  const persistTaskId = readAnyTaskId(db);
  try {
    planning.sqliteDual.withTransaction(
      () => {
        const existing = getDefinitionById(db, WC_BUG_REPORTER_SUBAGENT_ID);
        if (existing?.retired) {
          throw new TaskEngineError(
            "invalid-transition",
            `Subagent '${WC_BUG_REPORTER_SUBAGENT_ID}' is retired; register a new subagentId`
          );
        }
        if (existing) {
          updateDefinition(db, {
            id: WC_BUG_REPORTER_SUBAGENT_ID,
            displayName: seed.displayName,
            description: seed.description,
            allowedCommands: [...seed.allowedCommands],
            metadata: { ...seed.metadata },
            now: ts
          });
        } else {
          insertDefinition(db, {
            id: WC_BUG_REPORTER_SUBAGENT_ID,
            displayName: seed.displayName,
            description: seed.description,
            allowedCommands: [...seed.allowedCommands],
            metadata: { ...seed.metadata },
            now: ts
          });
        }
      },
      {
        expectedPlanningGeneration: exp,
        persistScope: "incremental",
        ...(persistTaskId ? { dirtyTaskIds: [persistTaskId] } : {})
      }
    );
  } catch (err: unknown) {
    if (err instanceof TaskEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }

  const def = getDefinitionById(db, WC_BUG_REPORTER_SUBAGENT_ID)!;
  const data: Record<string, unknown> = {
    responseSchemaVersion: 1,
    mode: "applied",
    subagentId: WC_BUG_REPORTER_SUBAGENT_ID,
    subagent: def,
    registerArgs: buildWcBugReporterRegisterArgs(),
    planningGeneration: planning.sqliteDual.getPlanningGeneration(),
    planningGenerationPolicy: policy
  };
  mergePlanningGenerationPolicyWarnings(data, warnings);

  return {
    ok: true,
    code: "wc-bug-reporter-seeded",
    message: `Registered '${WC_BUG_REPORTER_SUBAGENT_ID}' from module seed`,
    data
  };
}
