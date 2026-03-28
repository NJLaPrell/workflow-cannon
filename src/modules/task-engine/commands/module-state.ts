import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { UnifiedStateDb } from "../../../core/state/unified-state-db.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";

export async function handleModuleState(
  args: Record<string, unknown>,
  ctx: ModuleLifecycleContext,
  commandName: string
): Promise<ModuleCommandResult> {
  const unified = new UnifiedStateDb(ctx.workspacePath, planningSqliteDatabaseRelativePath(ctx));
  if (commandName === "list-module-states") {
    return {
      ok: true,
      code: "module-states-listed",
      message: "Listed module state rows",
      data: { rows: unified.listModuleStates() }
    };
  }
  const moduleId = typeof args.moduleId === "string" ? args.moduleId.trim() : "";
  if (!moduleId) {
    return { ok: false, code: "invalid-task-schema", message: "get-module-state requires moduleId" };
  }
  const row = unified.getModuleState(moduleId);
  return row
    ? {
        ok: true,
        code: "module-state-read",
        message: `Read module state for ${moduleId}`,
        data: { row }
      }
    : {
        ok: false,
        code: "task-not-found",
        message: `No module state found for '${moduleId}'`
      };
}
