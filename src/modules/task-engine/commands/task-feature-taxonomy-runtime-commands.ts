import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { runBackfillTaskFeatureLinks } from "../persistence/backfill-task-feature-links-runtime.js";
import { runExportFeatureTaxonomyJson } from "../persistence/export-feature-taxonomy-json-runtime.js";

/**
 * Feature-registry maintenance commands that do not need the main task row dispatch chain order.
 * Returns **`null`** when the command name is not handled here.
 */
export async function resolveFeatureTaxonomyRuntimeCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext
): Promise<ModuleCommandResult | null> {
  const args = command.args ?? {};
  if (command.name === "backfill-task-feature-links") {
    return await runBackfillTaskFeatureLinks(ctx, args as Record<string, unknown>);
  }
  if (command.name === "export-feature-taxonomy-json") {
    return await runExportFeatureTaxonomyJson(ctx, args as Record<string, unknown>);
  }
  return null;
}
