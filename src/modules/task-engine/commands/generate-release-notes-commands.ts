import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { buildReleaseNotes } from "../generate-release-notes-runtime.js";
import type { TaskEntity } from "../types.js";

const INSTRUCTION = "src/modules/task-engine/instructions/generate-release-notes.md";

export function buildGenerateReleaseNotes(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: { getActiveTasks(): TaskEntity[] },
  args: Record<string, unknown>
): ModuleCommandResult {
  const tasks = store.getActiveTasks();
  const db = planning.sqliteDual.getDatabase();

  let phaseKey: string | null = null;
  if (typeof args.phaseKey === "string" && args.phaseKey.trim()) {
    phaseKey = args.phaseKey.trim();
  } else {
    const row = db
      .prepare("SELECT current_phase_key FROM kit_workspace_status WHERE id = 1")
      .get() as { current_phase_key: string | null } | undefined;
    phaseKey = row?.current_phase_key ?? null;
  }

  const planningGeneration = planning.sqliteDual.getPlanningGeneration();

  const result = buildReleaseNotes({
    workspacePath: ctx.workspacePath,
    tasks,
    commandArgs: args,
    phaseKey,
    planningGeneration
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      data: result.details,
      remediation: { instructionPath: INSTRUCTION }
    };
  }

  const data: Record<string, unknown> = { ...result.data };
  attachPolicyMeta(data, ctx, planningGeneration);

  return {
    ok: true,
    code: "generate-release-notes",
    message: `Generated release notes for ${result.data.sourceTaskCount} task(s) in phase ${result.data.phaseKey}`,
    data
  };
}
