import crypto from "node:crypto";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { openPlanningStores } from "./persistence/planning-open.js";
import { planningConcurrencySaveOpts } from "./mutation-utils.js";
import type { TaskEntity } from "./types.js";
import { validateKnownTaskTypeRequirements } from "./task-type-validation.js";
import { TRANSCRIPT_CHURN_TASK_TYPE } from "./transcript-churn.js";
import { CLI_REMEDIATION_INSTRUCTIONS } from "../../core/cli-remediation.js";

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

/**
 * Convert **`transcript_churn` / `research`** → **`improvement` / `proposed`** after investigation.
 * Caller must enforce **`planningGenerationPolicy`** (see task-engine-internal).
 */
export async function runSynthesizeTranscriptChurnCommand(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const taskId = typeof args.taskId === "string" ? args.taskId.trim() : "";
  const synthesis = args.synthesis;
  if (!taskId || !synthesis || typeof synthesis !== "object" || Array.isArray(synthesis)) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "synthesize-transcript-churn requires taskId and synthesis object",
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.synthesizeTranscriptChurn }
    };
  }
  const syn = synthesis as Record<string, unknown>;
  if (
    !isNonEmptyString(syn.approach) ||
    !Array.isArray(syn.technicalScope) ||
    !Array.isArray(syn.acceptanceCriteria) ||
    !syn.metadata ||
    typeof syn.metadata !== "object" ||
    Array.isArray(syn.metadata)
  ) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "synthesis requires approach, technicalScope[], acceptanceCriteria[], metadata{}",
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.synthesizeTranscriptChurn }
    };
  }
  const metaIn = syn.metadata as Record<string, unknown>;
  if (!isNonEmptyString(metaIn.issue) || !isNonEmptyString(metaIn.supportingReasoning)) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: "synthesis.metadata requires non-empty issue and supportingReasoning strings",
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.synthesizeTranscriptChurn }
    };
  }

  const planning = await openPlanningStores(ctx);
  const store = planning.taskStore;

  const task = store.getTask(taskId);
  if (!task) {
    return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
  }
  if (task.type !== TRANSCRIPT_CHURN_TASK_TYPE || task.status !== "research") {
    return {
      ok: false,
      code: "invalid-task-schema",
      message: `synthesize-transcript-churn requires type '${TRANSCRIPT_CHURN_TASK_TYPE}' and status 'research' (got '${task.type}' / '${task.status}')`
    };
  }

  const priorMeta =
    task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
      ? { ...(task.metadata as Record<string, unknown>) }
      : {};
  const researchForensics = typeof priorMeta.issue === "string" ? priorMeta.issue : "";

  const proposedSolutions =
    Array.isArray(metaIn.proposedSolutions) && metaIn.proposedSolutions.length > 0
      ? (metaIn.proposedSolutions as unknown[]).filter((x): x is string => isNonEmptyString(x))
      : Array.isArray(priorMeta.proposedSolutions)
        ? (priorMeta.proposedSolutions as unknown[]).filter((x): x is string => isNonEmptyString(x))
        : [];

  const nextMeta: Record<string, unknown> = {
    ...priorMeta,
    researchForensicsSnapshot: researchForensics,
    issue: (metaIn.issue as string).trim(),
    supportingReasoning: (metaIn.supportingReasoning as string).trim(),
    synthesizedFromTranscriptChurn: true
  };
  if (proposedSolutions.length > 0) {
    nextMeta.proposedSolutions = proposedSolutions;
  }

  const next: TaskEntity = {
    ...task,
    type: "improvement",
    status: "proposed",
    title: isNonEmptyString(syn.title) ? (syn.title as string).trim() : task.title,
    approach: (syn.approach as string).trim(),
    technicalScope: (syn.technicalScope as unknown[]).filter((x): x is string => isNonEmptyString(x)),
    acceptanceCriteria: (syn.acceptanceCriteria as unknown[]).filter((x): x is string => isNonEmptyString(x)),
    metadata: nextMeta,
    updatedAt: new Date().toISOString()
  };

  const verr = validateKnownTaskTypeRequirements(next);
  if (verr) {
    return { ok: false, code: verr.code, message: verr.message };
  }

  store.updateTask(next);
  const ts = next.updatedAt;
  store.addEvidence({
    transitionId: `${taskId}-${ts}-${crypto.randomUUID().slice(0, 8)}`,
    taskId,
    fromState: "research",
    toState: "proposed",
    action: "synthesize-transcript-churn",
    guardResults: [{ allowed: true, guardName: "synthesize-transcript-churn" }],
    dependentsUnblocked: [],
    timestamp: ts,
    actor: typeof args.actor === "string" ? args.actor : ctx.resolvedActor
  });

  await store.save(planningConcurrencySaveOpts(args));

  return {
    ok: true,
    code: "transcript-churn-synthesized",
    message: `${taskId}: transcript_churn/research → improvement/proposed`,
    data: { task: store.getTask(taskId) }
  };
}
