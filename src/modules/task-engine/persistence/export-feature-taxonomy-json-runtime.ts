import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { isPathWithinRoot } from "../../documentation/runtime-config.js";
import {
  documentationDataDir,
  validateFeatureTaxonomyData,
  type FeatureTaxonomyData
} from "../../documentation/data-schema-validate.js";
import {
  featureRegistryActiveOnConnection,
  listRegistryComponents,
  listRegistryFeatures,
  readSqliteUserVersion
} from "./feature-registry-queries.js";
import { openPlanningStores } from "./planning-open.js";
import { TaskEngineError } from "../transitions.js";

const DEFAULT_TAXONOMY_REL = join("src", "modules", "documentation", "data", "feature-taxonomy.json");

export async function runExportFeatureTaxonomyJson(
  ctx: ModuleLifecycleContext,
  rawArgs: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = rawArgs.dryRun === true;
  const outRel =
    typeof rawArgs.outputRelativePath === "string" && rawArgs.outputRelativePath.trim().length > 0
      ? rawArgs.outputRelativePath.trim()
      : DEFAULT_TAXONOMY_REL.replace(/\\/g, "/");
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
  if (!featureRegistryActiveOnConnection(db)) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: `export-feature-taxonomy-json requires kit SQLite user_version >= 5 (current ${readSqliteUserVersion(db)})`
    };
  }
  const rows = listRegistryFeatures(db);
  if (rows.length === 0) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "Feature registry is empty; cannot export taxonomy JSON"
    };
  }
  const compLabel = new Map(listRegistryComponents(db).map((c) => [c.id, c.displayName]));
  const payload: FeatureTaxonomyData = {
    schemaVersion: 1,
    features: rows.map((f) => ({
      category: compLabel.get(f.componentId) ?? f.componentId,
      slug: f.id,
      name: f.name,
      covers: f.covers
    }))
  };
  const v = validateFeatureTaxonomyData(payload);
  if (!v.ok) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: `Exported taxonomy failed validation: ${v.errors.join("; ")}`
    };
  }
  const absOut = resolve(ctx.workspacePath, outRel);
  const dataDir = resolve(documentationDataDir(ctx.workspacePath));
  if (!dryRun && !isPathWithinRoot(absOut, dataDir)) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: `outputRelativePath must stay under documentation data directory (${dataDir})`
    };
  }
  if (!dryRun) {
    await writeFile(absOut, `${JSON.stringify(v.data, null, 2)}\n`, "utf8");
  }
  return {
    ok: true,
    code: "feature-taxonomy-exported",
    message: dryRun ? `Dry run: would write ${outRel} (${v.data.features.length} features)` : `Wrote ${outRel}`,
    data: {
      dryRun,
      path: outRel,
      featureCount: v.data.features.length
    } as Record<string, unknown>
  };
}
