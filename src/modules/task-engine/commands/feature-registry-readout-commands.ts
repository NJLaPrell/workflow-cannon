import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import {
  featureRegistryActiveOnConnection,
  listRegistryComponents,
  listRegistryFeatures
} from "../persistence/feature-registry-queries.js";

/** `list-components` / `list-features` — read-only registry rows. */
export function resolveFeatureRegistryReadoutCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores
): ModuleCommandResult | null {
  const args = command.args ?? {};

  if (command.name === "list-components") {
    const db = planning.sqliteDual.getDatabase();
    if (!featureRegistryActiveOnConnection(db)) {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: "list-components requires kit SQLite user_version >= 5 (relational feature registry)"
      };
    }
    const components = listRegistryComponents(db);
    const data: Record<string, unknown> = { components, count: components.length };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "feature-components-listed",
      message: `${components.length} component(s)`,
      data
    };
  }

  if (command.name === "list-features") {
    const db = planning.sqliteDual.getDatabase();
    if (!featureRegistryActiveOnConnection(db)) {
      return {
        ok: false,
        code: "invalid-task-schema",
        message: "list-features requires kit SQLite user_version >= 5 (relational feature registry)"
      };
    }
    const componentId = typeof args.componentId === "string" ? args.componentId.trim() : undefined;
    const features = listRegistryFeatures(db, componentId);
    const data: Record<string, unknown> = {
      features,
      count: features.length,
      componentId: componentId ?? null
    };
    attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());
    return {
      ok: true,
      code: "feature-rows-listed",
      message: `${features.length} feature(s)`,
      data
    };
  }

  return null;
}
