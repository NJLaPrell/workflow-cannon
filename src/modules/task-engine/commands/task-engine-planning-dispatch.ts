import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { resolveAgentBootstrapOrSnapshot, resolveAgentSessionRecordCommands } from "./agent-session-commands.js";
import { buildAgentMutationPlan } from "./agent-mutation-plan-commands.js";
import { buildCompletionPreflight } from "./completion-preflight-commands.js";
import { buildImprovementDedupeExplain } from "./improvement-dedupe-explain-commands.js";
import { buildImprovementWorkflowSummary } from "./improvement-workflow-summary-commands.js";
import { buildRecommendValidation } from "./recommend-validation-commands.js";
import { buildHarvestDeliveryEvidence } from "./harvest-delivery-evidence-commands.js";
import { buildWaitForPrChecks } from "./wait-for-pr-checks-commands.js";
import { buildReleaseStatus } from "./release-status-commands.js";
import { runApplyTaskBatchCommand } from "./apply-task-batch-command.js";
import { resolveAgentActivityCommands } from "./agent-activity-commands.js";
import { resolveAgentDefinitionCommands } from "./agent-definition-commands.js";
import { resolveFeatureRegistryReadoutCommands } from "./feature-registry-readout-commands.js";
import { resolveFeatureTaxonomyRuntimeCommands } from "./task-feature-taxonomy-runtime-commands.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { resolvePhaseDeliveryReadoutCommands } from "./phase-delivery-readout-commands.js";
import { runUpsertPhaseCatalogEntry } from "../phase-catalog-commands-runtime.js";
import {
  resolveMaintainerDeliveryPolicyCommand,
  resolveTaskIntakePolicyCommand
} from "./policy-resolve-commands.js";
import { resolvePhaseJournalCommands } from "./phase-journal-commands.js";
import { runTransitionOnCommand } from "./run-transition-on-command.js";
import { runSynthesizeTranscriptChurnOnCommand } from "./synthesize-transcript-churn-on-command.js";
import { resolveTaskArchiveDependencyCommands } from "./task-archive-dependency-commands.js";
import { resolveTaskEngineReadoutTail } from "./task-engine-readout-tail.js";
import { runBatchTransitionCommand } from "./batch-transition-on-command.js";
import { runReportDefectCommand } from "./report-defect-on-command.js";
import { runSyncTaskStoreAfterMergeCommand } from "./sync-task-store-after-merge-command.js";
import { isTaskIntentCommand, runClaimNextTaskIntent, runTaskIntentTransition } from "./task-intent-commands.js";
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

  const agentActivity = resolveAgentActivityCommands(command, ctx, planning);
  if (agentActivity !== null) {
    return agentActivity;
  }

  const agentDefinition = resolveAgentDefinitionCommands(command, ctx, planning);
  if (agentDefinition !== null) {
    return agentDefinition;
  }

  const agentBootstrapOrSnapshot = await resolveAgentBootstrapOrSnapshot(command, ctx, planning);
  if (agentBootstrapOrSnapshot !== null) {
    return agentBootstrapOrSnapshot;
  }

  const agentSessionRecord = resolveAgentSessionRecordCommands(command, ctx, planning);
  if (agentSessionRecord !== null) {
    return agentSessionRecord;
  }

  const phaseDeliveryReadout = await resolvePhaseDeliveryReadoutCommands(command, ctx, planning);
  if (phaseDeliveryReadout !== null) {
    return phaseDeliveryReadout;
  }

  if (command.name === "upsert-phase-catalog-entry") {
    return runUpsertPhaseCatalogEntry(ctx, planning, store, args as Record<string, unknown>);
  }

  const maintainerDeliveryPolicy = resolveMaintainerDeliveryPolicyCommand(command, ctx, planning);
  if (maintainerDeliveryPolicy !== null) {
    return maintainerDeliveryPolicy;
  }

  const taskIntakePolicy = resolveTaskIntakePolicyCommand(command, ctx, planning);
  if (taskIntakePolicy !== null) {
    return taskIntakePolicy;
  }

  const phaseJournal = await resolvePhaseJournalCommands(command, ctx, planning, store);
  if (phaseJournal !== null) {
    return phaseJournal;
  }

  if (command.name === "agent-mutation-plan") {
    return buildAgentMutationPlan(ctx, planning, args as Record<string, unknown>);
  }

  if (command.name === "completion-preflight") {
    return buildCompletionPreflight(ctx, planning, store, args as Record<string, unknown>);
  }

  if (command.name === "recommend-validation") {
    return buildRecommendValidation(ctx, planning, store, args as Record<string, unknown>);
  }

  if (command.name === "harvest-delivery-evidence") {
    return await buildHarvestDeliveryEvidence(ctx, planning, store, args as Record<string, unknown>);
  }

  if (command.name === "wait-for-pr-checks") {
    return buildWaitForPrChecks(ctx, planning, args as Record<string, unknown>);
  }

  if (command.name === "release-status") {
    return await buildReleaseStatus(ctx, planning, store, args as Record<string, unknown>);
  }

  if (command.name === "improvement-dedupe-explain") {
    return buildImprovementDedupeExplain(ctx, planning, store, args as Record<string, unknown>);
  }

  if (command.name === "improvement-workflow-summary") {
    return buildImprovementWorkflowSummary(ctx, planning, store);
  }

  if (command.name === "claim-next-task") {
    return runClaimNextTaskIntent(ctx, planning, args as Record<string, unknown>);
  }

  if (isTaskIntentCommand(command.name)) {
    return runTaskIntentTransition(command.name, ctx, planning, args as Record<string, unknown>);
  }

  if (command.name === "report-defect") {
    return runReportDefectCommand(ctx, planning, store, args as Record<string, unknown>);
  }

  if (command.name === "sync-task-store-after-merge") {
    return runSyncTaskStoreAfterMergeCommand(ctx, args as Record<string, unknown>);
  }

  if (command.name === "batch-transition") {
    return runBatchTransitionCommand(ctx, planning, store, args as Record<string, unknown>);
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
