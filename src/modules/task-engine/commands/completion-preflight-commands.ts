import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  CLI_REMEDIATION_DOCS,
  CLI_REMEDIATION_INSTRUCTIONS
} from "../../../core/cli-remediation.js";
import {
  createDeliveryEvidenceGuard,
  evaluateDeliveryEvidence,
  readDeliveryEvidenceEnforcementMode
} from "../delivery-evidence.js";
import {
  buildDeliveryEvidencePolicyContext,
  resolveMaintainerDeliveryPolicy
} from "../maintainer-delivery-policy-resolver.js";
import { humanGateResumeCommand, isHumanGateStatus } from "../human-gate.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { TaskStore } from "../persistence/store.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { TransitionService } from "../service.js";
import { createTaskIntakeAcceptGuard } from "../task-intake-mutation-policy.js";
import { resolveTargetState, getAllowedTransitionsFrom } from "../transitions.js";
import type { GuardResult, TaskEntity } from "../types.js";

export type CompletionPreflightFinding = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  guardName?: string;
  remediationCommand?: string;
};

function readTaskId(args: Record<string, unknown>): string | undefined {
  return typeof args.taskId === "string" && args.taskId.trim().length > 0 ? args.taskId.trim() : undefined;
}

function finding(
  severity: CompletionPreflightFinding["severity"],
  code: string,
  message: string,
  remediationCommand?: string,
  guardName?: string
): CompletionPreflightFinding {
  return { severity, code, message, ...(guardName ? { guardName } : {}), ...(remediationCommand ? { remediationCommand } : {}) };
}

function guardFinding(guard: GuardResult, task: TaskEntity, planningGeneration: number): CompletionPreflightFinding | null {
  if (guard.allowed) {
    return null;
  }
  const code = guard.code ?? "guard-rejected";
  if (guard.guardName === "dependency-check" || code === "dependency-unsatisfied") {
    const deps = (task.dependsOn ?? []).join(", ");
    return finding(
      "error",
      code,
      guard.message ?? `Dependencies not satisfied: ${deps}`,
      `pnpm exec wk run get-task '{"taskId":"${task.id}"}'`,
      guard.guardName
    );
  }
  if (guard.guardName === "delivery-evidence" || code.startsWith("delivery-evidence")) {
    return finding(
      "error",
      code,
      guard.message ?? "Delivery evidence missing or invalid for complete.",
      `pnpm exec wk run update-task '{"taskId":"${task.id}","metadata":{"deliveryEvidence":{}},"expectedPlanningGeneration":${planningGeneration},"policyApproval":{"confirmed":true,"rationale":"attach delivery evidence"}}'`,
      guard.guardName
    );
  }
  if (guard.guardName === "single-task-in-progress") {
    return finding(
      "error",
      code,
      guard.message ?? "Another task is in progress.",
      `pnpm exec wk run list-tasks '{"status":"in_progress"}'`,
      guard.guardName
    );
  }
  if (guard.guardName === "state-validity" || code === "invalid-transition") {
    const allowed = getAllowedTransitionsFrom(task.status)
      .map((e) => e.action)
      .join(", ");
    return finding(
      "error",
      code,
      guard.message ?? `Cannot complete from status '${task.status}'.`,
      allowed.length > 0
        ? `pnpm exec wk run run-transition '{"taskId":"${task.id}","action":"${allowed.split(", ")[0] ?? "start"}","expectedPlanningGeneration":${planningGeneration},"policyApproval":{"confirmed":true,"rationale":"preflight remediation"}}'`
        : undefined,
      guard.guardName
    );
  }
  return finding(
    "error",
    code,
    guard.message ?? `Guard '${guard.guardName}' blocked completion.`,
    `pnpm exec wk run get-task '{"taskId":"${task.id}"}'`,
    guard.guardName
  );
}

export function buildCompletionPreflight(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore,
  args: Record<string, unknown>
): ModuleCommandResult {
  const taskId = readTaskId(args);
  if (!taskId) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "completion-preflight requires taskId.",
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.completionPreflight }
    };
  }

  const task = store.getTask(taskId);
  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const findings: CompletionPreflightFinding[] = [];

  if (!task) {
    findings.push(
      finding("error", "task-not-found", `Task '${taskId}' was not found.`, `pnpm exec wk run create-task --help`)
    );
    const data: Record<string, unknown> = { schemaVersion: 1, taskId, passed: false, findings };
    attachPolicyMeta(data, ctx, planningGeneration);
    return {
      ok: true,
      code: "completion-preflight",
      message: `Completion preflight for ${taskId}: blocked (task not found)`,
      data
    };
  }

  if (task.status === "completed") {
    findings.push(finding("info", "already-completed", `Task '${taskId}' is already completed.`));
  } else if (task.status === "cancelled") {
    findings.push(finding("error", "task-cancelled", `Task '${taskId}' is cancelled.`));
  } else if (isHumanGateStatus(task.status)) {
    findings.push(
      finding(
        "error",
        "human-gate-active",
        `Task '${taskId}' is awaiting human action (${task.status}).`,
        humanGateResumeCommand(task)
      )
    );
  } else {
    const targetState = resolveTargetState(task.status, "complete");
    if (!targetState) {
      const allowed = getAllowedTransitionsFrom(task.status)
        .map((e) => `${e.action}→${e.to}`)
        .join(", ");
      findings.push(
        finding(
          "error",
          "invalid-transition",
          `Action 'complete' is not valid from '${task.status}'. Allowed: ${allowed || "none"}.`,
          allowed
            ? `pnpm exec wk run run-transition '{"taskId":"${task.id}","action":"${getAllowedTransitionsFrom(task.status)[0]?.action ?? "start"}","expectedPlanningGeneration":${planningGeneration},"policyApproval":{"confirmed":true,"rationale":"preflight"}}'`
            : undefined
        )
      );
    } else {
      const deliveryEvidenceMode = readDeliveryEvidenceEnforcementMode(
        ctx.effectiveConfig as Record<string, unknown> | undefined
      );
      const service = new TransitionService(store, [
        createTaskIntakeAcceptGuard({ effectiveConfig: ctx.effectiveConfig as Record<string, unknown> }),
        createDeliveryEvidenceGuard({
          enforcementMode: deliveryEvidenceMode,
          resolvePolicyContext: (t) => {
            const resolved = resolveMaintainerDeliveryPolicy({ effectiveConfig: ctx.effectiveConfig, task: t });
            return buildDeliveryEvidencePolicyContext(resolved);
          }
        })
      ]);
      const validation = service.getValidator().validate(task, "completed", {
        allTasks: store.getAllTasks(),
        timestamp: new Date().toISOString(),
        actor: typeof args.actor === "string" ? args.actor : undefined
      });
      for (const guard of validation.guardResults) {
        const f = guardFinding(guard, task, planningGeneration);
        if (f) {
          findings.push(f);
        }
      }
      const evidenceEval = evaluateDeliveryEvidence(task, {});
      if (!evidenceEval.satisfied && deliveryEvidenceMode !== "off") {
        const violation = evidenceEval.violations[0];
        if (!findings.some((f) => f.guardName === "delivery-evidence")) {
          findings.push(
            finding(
              deliveryEvidenceMode === "enforce" ? "error" : "warning",
              violation?.code ?? "delivery-evidence-missing",
              violation?.message ?? "Delivery evidence or waiver required before complete.",
              `pnpm exec wk run update-task '{"taskId":"${task.id}","metadata":{"deliveryEvidence":{}},"expectedPlanningGeneration":${planningGeneration},"policyApproval":{"confirmed":true,"rationale":"attach delivery evidence"}}'`
            )
          );
        }
      }
    }
  }

  const blocking = findings.filter((f) => f.severity === "error");
  const passed = blocking.length === 0 && task.status !== "cancelled";
  const data: Record<string, unknown> = {
    schemaVersion: 1,
    taskId,
    taskStatus: task.status,
    passed,
    findings,
    completeWhenClear: passed
      ? `pnpm exec wk run run-transition '{"taskId":"${taskId}","action":"complete","expectedPlanningGeneration":${planningGeneration},"policyApproval":{"confirmed":true,"rationale":"acceptance criteria met"}}'`
      : undefined,
    remediation: {
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.completionPreflight,
      docPath: CLI_REMEDIATION_DOCS.agentCliMap
    }
  };
  attachPolicyMeta(data, ctx, planningGeneration);
  return {
    ok: true,
    code: "completion-preflight",
    message: passed
      ? `Completion preflight passed for ${taskId}`
      : `Completion preflight found ${blocking.length} blocker(s) for ${taskId}`,
    data
  };
}
