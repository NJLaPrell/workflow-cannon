import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { resolveAgentBootstrapOrSnapshot } from "./agent-session-commands.js";
import { buildAgentMutationPlan } from "./agent-mutation-plan-commands.js";
import { runApplyTaskBatchCommand } from "./apply-task-batch-command.js";
import { resolveFeatureRegistryReadoutCommands } from "./feature-registry-readout-commands.js";
import { resolveFeatureTaxonomyRuntimeCommands } from "./task-feature-taxonomy-runtime-commands.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { resolvePhaseDeliveryReadoutCommands } from "./phase-delivery-readout-commands.js";
import { runTransitionOnCommand } from "./run-transition-on-command.js";
import { runSynthesizeTranscriptChurnOnCommand } from "./synthesize-transcript-churn-on-command.js";
import { resolveTaskArchiveDependencyCommands } from "./task-archive-dependency-commands.js";
import { resolveTaskEngineReadoutTail } from "./task-engine-readout-tail.js";
import { runClaimNextTaskIntent, runTaskIntentTransition } from "./task-intent-commands.js";
import { resolveTaskPhaseCommands } from "./task-phase-on-command.js";
import { runTaskRowMutationCommands } from "./task-row-mutation-commands.js";
import { runWishlistStoreCommandWithPlanningPolicyMeta } from "./task-engine-wishlist-on-command.js";

/**
 * Task Engine commands that require opened planning stores (`openPlanningStores`).
 */
export async function dispatchTaskEnginePlanningCommands(
  command: { name: string; args?: Record<string, unknown> },
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore
): Promise<ModuleCommandResult> {
  const args = command.args ?? {};

  const agentBootstrapOrSnapshot = await resolveAgentBootstrapOrSnapshot(command, ctx, planning);
  if (agentBootstrapOrSnapshot !== null) {
    return agentBootstrapOrSnapshot;
  }

  const phaseDeliveryReadout = await resolvePhaseDeliveryReadoutCommands(command, ctx, planning);
  if (phaseDeliveryReadout !== null) {
    return phaseDeliveryReadout;
  }

  if (command.name === "agent-mutation-plan") {
    return buildAgentMutationPlan(ctx, planning, args as Record<string, unknown>);
  }

  if (command.name === "claim-next-task") {
    return runClaimNextTaskIntent(ctx, planning, args as Record<string, unknown>);
  }

  if (command.name === "start-task" || command.name === "complete-task") {
    return runTaskIntentTransition(command.name, ctx, planning, args as Record<string, unknown>);
  }

  const featureRegistryReadout = resolveFeatureRegistryReadoutCommands(command, ctx, planning);
  if (featureRegistryReadout !== null) {
    return featureRegistryReadout;
  }

  const featureTaxonomyRuntime = await resolveFeatureTaxonomyRuntimeCommands(command, ctx);
  if (featureTaxonomyRuntime !== null) {
    return featureTaxonomyRuntime;
  }

  if (command.name === "run-transition") {
    return await runTransitionOnCommand(ctx, planning, store, args as Record<string, unknown>);
  }

  if (command.name === "synthesize-transcript-churn") {
    return await runSynthesizeTranscriptChurnOnCommand(ctx, planning, args as Record<string, unknown>);
  }

  const rowMutations = await runTaskRowMutationCommands(command, ctx, planning, store);
  if (rowMutations !== null) {
    return rowMutations;
  }

  if (command.name === "apply-task-batch") {
    return runApplyTaskBatchCommand(ctx, planning, store, args as Record<string, unknown>);
  }

  const phaseMutation = await resolveTaskPhaseCommands(command, ctx, planning, store);
  if (phaseMutation !== null) {
    return phaseMutation;
  }

  const archiveDep = await resolveTaskArchiveDependencyCommands(command, ctx, planning, store);
  if (archiveDep !== null) {
    return archiveDep;
  }

  const readoutTail = await resolveTaskEngineReadoutTail(command, ctx, planning, store);
  if (readoutTail !== null) {
    return readoutTail;
  }

  const wishlistResult = runWishlistStoreCommandWithPlanningPolicyMeta(
    command.name,
    args as Record<string, unknown>,
    ctx,
    store,
    planning
  );
  if (wishlistResult !== undefined) {
    return wishlistResult;
  }

  return {
    ok: false,
    code: "unsupported-command",
    message: `Task Engine does not support command '${command.name}'`
  };
}
