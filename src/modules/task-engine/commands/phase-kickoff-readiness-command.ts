import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import type { TaskStore } from "../persistence/store.js";
import { readWorkspaceStatusSnapshotFromDual } from "../persistence/workspace-status-store.js";
import { resolveCanonicalPhase } from "../phase-resolution.js";
import { buildPhaseKickoffReadiness } from "../phase-kickoff-readiness-runtime.js";

export async function runPhaseKickoffReadinessCommand(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const workspaceStatus = readWorkspaceStatusSnapshotFromDual(planning.sqliteDual);
  const phaseRes = resolveCanonicalPhase({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    workspaceStatus
  });
  const phaseKey =
    typeof args.phaseKey === "string" && args.phaseKey.trim().length > 0
      ? args.phaseKey.trim()
      : phaseRes.canonicalPhaseKey;

  const packet = await buildPhaseKickoffReadiness({
    ctx,
    planning,
    store,
    commandArgs: args,
    phaseKey
  });

  const data: Record<string, unknown> = {
    ...packet,
    canonicalPhase: phaseRes
  };
  attachPolicyMeta(data, ctx, planning.sqliteDual.getPlanningGeneration());

  const passed = packet.passed === true;
  const findingCount = typeof packet.findingCount === "number" ? packet.findingCount : 0;

  return {
    ok: true,
    code: "phase-kickoff-readiness",
    message: passed
      ? `Phase kickoff readiness passed for phase ${phaseKey ?? "(none)"}`
      : `Phase kickoff readiness found ${findingCount} finding(s) for phase ${phaseKey ?? "(none)"}`,
    data,
    remediation: { instructionPath: "src/modules/task-engine/instructions/phase-kickoff-readiness.md" }
  };
}
