import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { CLI_REMEDIATION_INSTRUCTIONS } from "../../../core/cli-remediation.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { planningGenPolicyGate } from "../planning-generation-gate.js";
import { runSynthesizeTranscriptChurnCommand } from "../synthesize-transcript-churn-runtime.js";

export async function runSynthesizeTranscriptChurnOnCommand(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const pgSyn = planningGenPolicyGate(
    ctx,
    args as Record<string, unknown>,
    CLI_REMEDIATION_INSTRUCTIONS.synthesizeTranscriptChurn,
    planning.sqliteDual.getPlanningGeneration()
  );
  if (pgSyn.block) {
    return pgSyn.block;
  }
  const res = await runSynthesizeTranscriptChurnCommand(ctx, args as Record<string, unknown>);
  if (res.ok && res.data && typeof res.data === "object") {
    attachPolicyMeta(
      res.data as Record<string, unknown>,
      ctx,
      planning.sqliteDual.getPlanningGeneration(),
      pgSyn.warnings
    );
  }
  return res;
}
