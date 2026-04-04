import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  featureRegistryActiveOnConnection,
  readSqliteUserVersion,
  resolveKnownFeatureSlugSet
} from "./feature-registry-queries.js";
import { openPlanningStores } from "./planning-open.js";
import { TaskEngineError } from "../transitions.js";
import { TASK_ENGINE_TASKS_TABLE } from "../../../core/state/workspace-kit-sqlite.js";

function parseFeaturesJson(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined || raw === "" || raw === "[]") {
    return [];
  }
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) {
      return [];
    }
    return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

export async function runBackfillTaskFeatureLinks(
  ctx: ModuleLifecycleContext,
  rawArgs: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = rawArgs.dryRun === true;
  let planning: Awaited<ReturnType<typeof openPlanningStores>>;
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
  const db = planning.sqliteDual.getDatabase();
  if (!planning.sqliteDual.relationalTasksEnabled) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "backfill-task-feature-links requires relational task rows (migrate-task-persistence sqlite-blob-to-relational)"
    };
  }
  if (!featureRegistryActiveOnConnection(db)) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: `backfill-task-feature-links requires kit SQLite user_version >= 5 (current ${readSqliteUserVersion(db)})`
    };
  }
  const known = resolveKnownFeatureSlugSet(db);
  const rows = db.prepare(`SELECT id, features_json FROM ${TASK_ENGINE_TASKS_TABLE}`).all() as {
    id: string;
    features_json: string | null;
  }[];
  const unknownByTask: Record<string, string[]> = {};
  let linked = 0;
  let cleared = 0;
  for (const r of rows) {
    const slugs = parseFeaturesJson(r.features_json);
    if (slugs.length === 0) {
      continue;
    }
    const knownSlugs = slugs.filter((s) => known.has(s));
    const unknown = slugs.filter((s) => !known.has(s));
    if (unknown.length > 0) {
      unknownByTask[r.id] = unknown;
    }
    if (!dryRun && knownSlugs.length > 0) {
      const ins = db.prepare(
        `INSERT OR IGNORE INTO task_engine_task_features (task_id, feature_id) VALUES (?,?)`
      );
      for (const s of knownSlugs) {
        const info = ins.run(r.id, s);
        if (info.changes > 0) {
          linked += 1;
        }
      }
      db.prepare(`UPDATE ${TASK_ENGINE_TASKS_TABLE} SET features_json = '[]' WHERE id = ?`).run(r.id);
      cleared += 1;
    }
  }
  if (!dryRun && (linked > 0 || cleared > 0)) {
    planning.sqliteDual.loadFromDisk();
    await planning.taskStore.load();
  }
  return {
    ok: true,
    code: "task-feature-backfill",
    message: dryRun
      ? `Dry run: ${rows.filter((r) => parseFeaturesJson(r.features_json).length > 0).length} tasks with legacy features_json`
      : `Backfilled junction links (${linked} inserts); cleared features_json on ${cleared} task row(s)`,
    data: {
      dryRun,
      linkedPairCount: linked,
      clearedTaskRows: cleared,
      unknownSlugsByTaskId: unknownByTask
    } as Record<string, unknown>
  };
}
