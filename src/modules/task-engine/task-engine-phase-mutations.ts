import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { OpenedPlanningStores } from "./persistence/planning-open.js";
import type { TaskStore } from "./persistence/store.js";
import { isGitTaskStateCanonicalAuthority } from "./persistence/task-state-canonical-authority.js";
import { finalizeCanonicalUpdateTask } from "./persistence/task-state-canonical-mutation-hook.js";
import type { TaskEntity } from "./types.js";
import {
  digestPayload,
  findIdempotentMutation,
  mutationEvidence,
  nowIso,
  planningConcurrencySaveOpts,
  readIdempotencyValue
} from "./mutation-utils.js";
import { validateKnownTaskTypeRequirements } from "./task-type-validation.js";
import {
  enforcePlanningGenerationPolicy,
  getPlanningGenerationPolicy,
  mergePlanningGenerationPolicyWarnings
} from "./planning-config.js";
import { parseLeadingPhaseOrdinal, phaseLadderBlocksBeforeCurrent } from "./phase-resolution.js";

const PHASE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._\-]{0,63}$/;

function validatePhaseKey(raw: string): string | null {
  const t = raw.trim();
  if (!t || !PHASE_KEY_RE.test(t)) {
    return null;
  }
  return t;
}

export async function runAssignTaskPhase(args: {
  store: TaskStore;
  ctx: ModuleLifecycleContext;
  planning: OpenedPlanningStores;
  strictValidationError: (store: TaskStore, effective: Record<string, unknown> | undefined) => string | null;
  actor: string | undefined;
  rawArgs: Record<string, unknown>;
  /** Canonical workspace kit phase (digits). When set with numeric phaseKey, assignments sort-before-current are rejected. */
  canonicalWorkspacePhaseKey?: string | null;
}): Promise<ModuleCommandResult> {
  const { store, ctx, planning, strictValidationError, actor, rawArgs, canonicalWorkspacePhaseKey } = args;
  const taskId = typeof rawArgs.taskId === "string" ? rawArgs.taskId.trim() : "";
  const pkRaw = typeof rawArgs.phaseKey === "string" ? rawArgs.phaseKey : "";
  const phaseKey = validatePhaseKey(pkRaw);
  const phaseExplicit =
    typeof rawArgs.phase === "string" && rawArgs.phase.trim().length > 0 ? rawArgs.phase.trim() : undefined;

  if (!taskId) {
    return { ok: false, code: "invalid-task-schema", message: "assign-task-phase requires taskId" };
  }
  if (!phaseKey) {
    return {
      ok: false,
      code: "invalid-task-schema",
      message:
        "assign-task-phase requires phaseKey (non-empty; letters, digits, dot, underscore, hyphen; max 64 chars)"
    };
  }

  const assignedOrd = parseLeadingPhaseOrdinal(phaseKey);
  const wsOrd =
    canonicalWorkspacePhaseKey !== undefined && canonicalWorkspacePhaseKey !== null
      ? parseLeadingPhaseOrdinal(canonicalWorkspacePhaseKey)
      : null;
  if (
    phaseLadderBlocksBeforeCurrent(ctx.effectiveConfig as Record<string, unknown> | undefined) &&
    assignedOrd !== null &&
    wsOrd !== null &&
    assignedOrd < wsOrd
  ) {
    return {
      ok: false,
      code: "phase-target-before-current-workspace-phase",
      message: `assign-task-phase rejects '${phaseKey}' because its leading phase number (${assignedOrd}) is before workspace current kit phase (${canonicalWorkspacePhaseKey}); use an opaque key without a leading digit only when maintainer policy allows out-of-ladder buckets`
    };
  }

  const phaseLabel = phaseExplicit ?? `Phase ${phaseKey}`;
  const updates: Pick<TaskEntity, "phase" | "phaseKey"> = { phase: phaseLabel, phaseKey };
  const clientMutationId = readIdempotencyValue(rawArgs);
  const task = store.getTask(taskId);
  if (!task) {
    return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
  }

  const payloadDigest = digestPayload({ taskId, command: "assign-task-phase", phaseKey, phase: phaseLabel });
  if (clientMutationId) {
    const prior = findIdempotentMutation(store, "assign-task-phase", taskId, clientMutationId);
    if (prior) {
      if (prior.payloadDigest !== payloadDigest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different assign-task-phase payload on ${taskId}`
        };
      }
      return {
        ok: true,
        code: "task-phase-assign-idempotent-replay",
        message: `Idempotent assign-task-phase replay for '${taskId}'`,
        data: { task, replayed: true } as Record<string, unknown>
      };
    }
  }

  const assignGate = enforcePlanningGenerationPolicy(
    getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    rawArgs
  );
  if (!assignGate.ok) {
    return { ok: false, code: assignGate.code, message: assignGate.message };
  }

  const updatedTask: TaskEntity = { ...task, ...updates, updatedAt: nowIso() };
  const knownTypeValidationError = validateKnownTaskTypeRequirements(updatedTask);
  if (knownTypeValidationError) {
    return { ok: false, code: knownTypeValidationError.code, message: knownTypeValidationError.message };
  }
  store.updateTask(updatedTask);
  store.addMutationEvidence(
    mutationEvidence("assign-task-phase", taskId, actor, {
      phaseKey,
      phase: phaseLabel,
      clientMutationId,
      payloadDigest
    })
  );
  const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
  if (strictIssue) {
    return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
  }
  const gitCanonical = isGitTaskStateCanonicalAuthority(ctx);
  if (!gitCanonical) {
    await store.save(planningConcurrencySaveOpts(rawArgs));
  }
  const canonicalUpdate = await finalizeCanonicalUpdateTask({
    ctx,
    store,
    planning,
    task: updatedTask,
    changedFields: ["phase", "phaseKey"],
    commandName: "assign-task-phase",
    clientMutationId,
    actor,
    policyApproval: rawArgs.policyApproval as { confirmed: boolean; rationale: string } | undefined
  });
  if (canonicalUpdate && !canonicalUpdate.ok) {
    return canonicalUpdate;
  }
  if (gitCanonical) {
    await store.load();
  }
  const assignData: Record<string, unknown> = { task: updatedTask };
  mergePlanningGenerationPolicyWarnings(assignData, assignGate.warnings);
  return {
    ok: true,
    code: "task-phase-assigned",
    message: `Assigned phase '${phaseKey}' on task '${taskId}'`,
    data: assignData
  };
}

export async function runClearTaskPhase(args: {
  store: TaskStore;
  ctx: ModuleLifecycleContext;
  planning: OpenedPlanningStores;
  strictValidationError: (store: TaskStore, effective: Record<string, unknown> | undefined) => string | null;
  actor: string | undefined;
  rawArgs: Record<string, unknown>;
}): Promise<ModuleCommandResult> {
  const { store, ctx, planning, strictValidationError, actor, rawArgs } = args;
  const taskId = typeof rawArgs.taskId === "string" ? rawArgs.taskId.trim() : "";
  if (!taskId) {
    return { ok: false, code: "invalid-task-schema", message: "clear-task-phase requires taskId" };
  }

  const clientMutationId = readIdempotencyValue(rawArgs);
  const task = store.getTask(taskId);
  if (!task) {
    return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
  }

  const payloadDigest = digestPayload({ taskId, command: "clear-task-phase" });
  if (clientMutationId) {
    const prior = findIdempotentMutation(store, "clear-task-phase", taskId, clientMutationId);
    if (prior) {
      if (prior.payloadDigest !== payloadDigest) {
        return {
          ok: false,
          code: "idempotency-key-conflict",
          message: `clientMutationId '${clientMutationId}' was already used for a different clear-task-phase payload on ${taskId}`
        };
      }
      return {
        ok: true,
        code: "task-phase-clear-idempotent-replay",
        message: `Idempotent clear-task-phase replay for '${taskId}'`,
        data: { task, replayed: true } as Record<string, unknown>
      };
    }
  }

  const clearGate = enforcePlanningGenerationPolicy(
    getPlanningGenerationPolicy({
      effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
    }),
    rawArgs
  );
  if (!clearGate.ok) {
    return { ok: false, code: clearGate.code, message: clearGate.message };
  }

  const updatedTask: TaskEntity = { ...task, updatedAt: nowIso() };
  delete updatedTask.phase;
  delete updatedTask.phaseKey;

  const knownTypeValidationError = validateKnownTaskTypeRequirements(updatedTask);
  if (knownTypeValidationError) {
    return { ok: false, code: knownTypeValidationError.code, message: knownTypeValidationError.message };
  }
  store.updateTask(updatedTask);
  store.addMutationEvidence(
    mutationEvidence("clear-task-phase", taskId, actor, {
      clientMutationId,
      payloadDigest
    })
  );
  const strictIssue = strictValidationError(store, ctx.effectiveConfig as Record<string, unknown> | undefined);
  if (strictIssue) {
    return { ok: false, code: "strict-task-validation-failed", message: strictIssue };
  }
  const gitCanonical = isGitTaskStateCanonicalAuthority(ctx);
  if (!gitCanonical) {
    await store.save(planningConcurrencySaveOpts(rawArgs));
  }
  const canonicalUpdate = await finalizeCanonicalUpdateTask({
    ctx,
    store,
    planning,
    task: updatedTask,
    changedFields: ["phase", "phaseKey"],
    commandName: "clear-task-phase",
    clientMutationId,
    actor,
    policyApproval: rawArgs.policyApproval as { confirmed: boolean; rationale: string } | undefined
  });
  if (canonicalUpdate && !canonicalUpdate.ok) {
    return canonicalUpdate;
  }
  if (gitCanonical) {
    await store.load();
  }
  const clearData: Record<string, unknown> = { task: updatedTask };
  mergePlanningGenerationPolicyWarnings(clearData, clearGate.warnings);
  return {
    ok: true,
    code: "task-phase-cleared",
    message: `Cleared phase fields on task '${taskId}'`,
    data: clearData
  };
}
