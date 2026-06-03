import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  CLI_REMEDIATION_DOCS,
  CLI_REMEDIATION_INSTRUCTIONS
} from "../../../core/cli-remediation.js";
import { parsePolicyApproval } from "../../../core/policy.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { validateDeliveryEvidenceMetadata } from "../delivery-evidence.js";
import { harvestDeliveryEvidencePreview } from "../harvest-delivery-evidence-runtime.js";
import {
  buildDeliveryEvidencePolicyContext,
  resolveMaintainerDeliveryPolicy
} from "../maintainer-delivery-policy-resolver.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { planningGenPolicyGate } from "../planning-generation-gate.js";
import { mutationEvidence, nowIso, planningConcurrencySaveOpts } from "../mutation-utils.js";
import type { TaskStore } from "../persistence/store.js";
import { buildRecommendValidation } from "./recommend-validation-commands.js";
import {
  clearAgentActivityBestEffort,
  recordCommandBoundaryActivityBestEffort
} from "../agent-activity-recorder.js";

const INSTRUCTION = "src/modules/task-engine/instructions/harvest-delivery-evidence.md";

function readTaskId(args: Record<string, unknown>): string | undefined {
  return typeof args.taskId === "string" && args.taskId.trim().length > 0 ? args.taskId.trim() : undefined;
}

function readValidationCommandsFromArgs(
  args: Record<string, unknown>
): Array<{ command: string; result?: string; exitCode?: number }> | undefined {
  const raw = args.validationCommands;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const out: Array<{ command: string; result?: string; exitCode?: number }> = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const r = row as Record<string, unknown>;
    const command = typeof r.command === "string" && r.command.trim() ? r.command.trim() : null;
    if (!command) {
      continue;
    }
    const exitCode = typeof r.exitCode === "number" ? r.exitCode : undefined;
    const result = typeof r.result === "string" ? r.result : undefined;
    out.push({ command, ...(exitCode !== undefined ? { exitCode } : { result }) });
  }
  return out.length > 0 ? out : undefined;
}

export async function buildHarvestDeliveryEvidence(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const taskId = readTaskId(args);
  const task = taskId ? store.getTask(taskId) : undefined;
  if (taskId && !task) {
    return { ok: false, code: "task-not-found", message: `Task '${taskId}' not found` };
  }

  const dryRun = args.apply !== true;
  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const activityLease = taskId
    ? recordCommandBoundaryActivityBestEffort(ctx, planning, {
        command: "harvest-delivery-evidence",
        kind: "validating",
        taskId,
        details: {
          validationLabel: dryRun ? `task ${taskId} delivery evidence preview` : `task ${taskId} delivery evidence`
        }
      })
    : null;

  try {
    if (!dryRun) {
      if (!taskId || !task) {
        return {
          ok: false,
          code: "invalid-run-args",
          message: "harvest-delivery-evidence apply requires taskId.",
          remediation: { instructionPath: INSTRUCTION }
        };
      }
      if (!parsePolicyApproval(args)) {
        return {
          ok: false,
          code: "policy-approval-required",
          message: "harvest-delivery-evidence apply requires JSON policyApproval on the run argv.",
          remediation: {
            instructionPath: INSTRUCTION,
            docPath: CLI_REMEDIATION_DOCS.policyApproval
          }
        };
      }
      const pg = planningGenPolicyGate(ctx, args, INSTRUCTION, planningGeneration);
      if (pg.block) {
        return pg.block;
      }
    }

    const resolved = resolveMaintainerDeliveryPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined,
    task: task ?? null,
    taskId: taskId ?? null,
    phaseKey: task ? undefined : typeof args.phaseKey === "string" ? args.phaseKey : null
  });
  const policyContext = buildDeliveryEvidencePolicyContext({
    resolvedPolicy: resolved.resolvedPolicy,
    warnings: resolved.warnings
  });

    let validationCommands = readValidationCommandsFromArgs(args);
    if (!validationCommands && taskId) {
      const rec = buildRecommendValidation(ctx, planning, store, { taskId });
      if (rec.ok && rec.data && typeof rec.data === "object") {
        const hint = (rec.data as Record<string, unknown>).deliveryEvidenceHint;
        if (hint && typeof hint === "object" && !Array.isArray(hint)) {
          const cmds = (hint as Record<string, unknown>).validationCommands;
          if (Array.isArray(cmds)) {
            validationCommands = cmds
              .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
              .map((row) => ({
                command: String(row.command ?? ""),
                result: typeof row.result === "string" ? row.result : "success"
              }))
              .filter((row) => row.command.length > 0);
          }
        }
      }
    }

    const preview = harvestDeliveryEvidencePreview({
    workspacePath: ctx.workspacePath,
    branchName:
      typeof args.branchName === "string" && args.branchName.trim() ? args.branchName.trim() : null,
    baseBranch:
      typeof args.baseBranch === "string" && args.baseBranch.trim()
        ? args.baseBranch.trim()
        : resolved.resolvedPolicy.phaseIntegrationBranch,
    mergeSha: typeof args.mergeSha === "string" && args.mergeSha.trim() ? args.mergeSha.trim() : null,
    validationCommands,
    policyOptions: policyContext
    });

    const data: Record<string, unknown> = {
    schemaVersion: preview.schemaVersion,
    taskId: taskId ?? null,
    dryRun,
    deliveryEvidence: preview.deliveryEvidence,
    missingFields: preview.missingFields,
    signalStatus: preview.signalStatus,
    remediationCommands: preview.remediationCommands,
    evidenceValidation: preview.validation,
    resolvedPolicy: {
      profileName: resolved.resolvedPolicy.profileName,
      phaseIntegrationBranch: resolved.resolvedPolicy.phaseIntegrationBranch,
      evidenceMode: resolved.resolvedPolicy.evidenceMode
    },
    remediation: {
      instructionPath: INSTRUCTION,
      docPath: CLI_REMEDIATION_DOCS.agentCliMap
    }
    };

    if (dryRun) {
      attachPolicyMeta(data, ctx, planningGeneration);
      return {
        ok: true,
        code: "harvest-delivery-evidence-preview",
        message:
          preview.missingFields.length === 0
            ? "Delivery evidence preview is complete for apply."
            : `Delivery evidence preview missing ${preview.missingFields.length} field(s).`,
        data
      };
    }

    if (!preview.validation.ok) {
      attachPolicyMeta(data, ctx, planningGeneration);
      return {
        ok: false,
        code: "invalid-evidence",
        message: `harvest-delivery-evidence apply rejected harvested evidence: ${preview.validation.message}`,
        data: {
          ...data,
          missingFields: preview.validation.missingFields,
          validationCode: preview.validation.code
        },
        remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.updateTask }
      };
    }

    const actor =
      typeof args.actor === "string"
        ? args.actor
        : ctx.resolvedActor !== undefined
          ? ctx.resolvedActor
          : undefined;
    const updatedTask = {
      ...task!,
      metadata: {
        ...(task!.metadata ?? {}),
        deliveryEvidence: preview.deliveryEvidence
      },
      updatedAt: nowIso()
    };
    const revalidate = validateDeliveryEvidenceMetadata(updatedTask.metadata?.deliveryEvidence, policyContext);
    if (!revalidate.ok) {
      return {
        ok: false,
        code: "invalid-evidence",
        message: revalidate.message,
        data: { missingFields: revalidate.missingFields }
      };
    }

    store.updateTask(updatedTask);
    store.addMutationEvidence(
      mutationEvidence("update-task", taskId!, actor, {
        source: "harvest-delivery-evidence",
        applied: true,
        missingFieldCount: 0
      })
    );
    await store.save(planningConcurrencySaveOpts(args as Record<string, unknown>));

    attachPolicyMeta(data, ctx, planningGeneration);
    return {
      ok: true,
      code: "harvest-delivery-evidence-applied",
      message: `Applied metadata.deliveryEvidence to ${taskId}`,
      data: { ...data, task: updatedTask, applied: true }
    };
  } finally {
    if (activityLease) {
      clearAgentActivityBestEffort(ctx, planning, {
        activityId: activityLease.activityId,
        agentId: activityLease.agentId,
        sessionId: activityLease.sessionId
      });
    }
  }
}
