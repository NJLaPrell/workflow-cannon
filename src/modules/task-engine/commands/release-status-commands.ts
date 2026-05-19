import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { buildReleaseStatusSnapshot } from "../release-status-runtime.js";
import { runPhaseStatus } from "../workspace-status-commands-runtime.js";
import type { TaskEntity } from "../types.js";

const INSTRUCTION = "src/modules/task-engine/instructions/release-status.md";

export async function buildReleaseStatus(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: { getActiveTasks(): TaskEntity[] },
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const phaseRes = await runPhaseStatus(ctx, args, {
    tasks: store.getActiveTasks(),
    db: planning.sqliteDual.getDatabase(),
    dbPath: planning.sqliteDual.dbPath
  });

  if (!phaseRes.ok || !phaseRes.data) {
    return {
      ok: false,
      code: "release-status-phase-unavailable",
      message: phaseRes.message ?? "release-status could not read phase-status",
      remediation: { instructionPath: INSTRUCTION }
    };
  }

  const phaseData = phaseRes.data as Record<string, unknown>;
  const currentPhase =
    typeof phaseData.currentKitPhase === "string" ? phaseData.currentKitPhase : null;
  const nextPhase = typeof phaseData.nextKitPhase === "string" ? phaseData.nextKitPhase : null;

  const snapshot = buildReleaseStatusSnapshot({
    workspacePath: ctx.workspacePath,
    currentPhase,
    nextPhase
  });

  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const data: Record<string, unknown> = {
    ...snapshot,
    canonicalPhase: phaseData.canonicalPhase ?? null,
    exportStatus: phaseData.exportStatus ?? null,
    remediation: { instructionPath: INSTRUCTION }
  };
  attachPolicyMeta(data, ctx, planningGeneration);

  return {
    ok: true,
    code: "release-status",
    message: snapshot.degraded.length
      ? `Release status snapshot (${snapshot.degraded.length} degraded signal(s))`
      : "Release status snapshot",
    data
  };
}
