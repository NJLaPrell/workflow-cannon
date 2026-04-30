import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  CLI_REMEDIATION_DOCS
} from "../../../core/cli-remediation.js";
import { POLICY_APPROVAL_TWO_LANES_DOC } from "../../../core/policy.js";
import { buildRunArgsSchemaOnlyPayload } from "../../../core/run-args-pilot-validation.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import { getPlanningGenerationPolicy } from "../planning-config.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import { getAllowedTransitionsFrom } from "../transitions.js";
import { dependencyBlockersForAction, readPlanString } from "./task-intent-commands.js";

function withPlanField(sampleArgs: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  return Object.hasOwn(sampleArgs, key) ? sampleArgs : { ...sampleArgs, [key]: value };
}

function buildReadyRunArgs(
  schemaPayload: Record<string, unknown>,
  commandName: string,
  args: Record<string, unknown>,
  planningGeneration: number,
  planningPolicy: string
): Record<string, unknown> {
  let readyArgs =
    schemaPayload.sampleArgs && typeof schemaPayload.sampleArgs === "object" && !Array.isArray(schemaPayload.sampleArgs)
      ? { ...(schemaPayload.sampleArgs as Record<string, unknown>) }
      : {};
  const taskId = readPlanString(args, "taskId");
  const action = readPlanString(args, "action");
  if (taskId) {
    readyArgs = withPlanField(readyArgs, "taskId", taskId);
  }
  if (action) {
    readyArgs = withPlanField(readyArgs, "action", action);
  }
  const planning = schemaPayload.planningGeneration as Record<string, unknown> | undefined;
  if (planningPolicy === "require" && planning?.cliPrelude === true) {
    readyArgs = withPlanField(readyArgs, "expectedPlanningGeneration", planningGeneration);
  }
  const idempotency = schemaPayload.idempotency as Record<string, unknown> | undefined;
  if (idempotency?.clientMutationId === true) {
    readyArgs = withPlanField(readyArgs, "clientMutationId", `${commandName}-<stable-retry-key>`);
  }
  const policy = schemaPayload.policy as Record<string, unknown> | undefined;
  if (policy?.jsonApprovalRequired === true) {
    readyArgs = withPlanField(readyArgs, "policyApproval", {
      confirmed: true,
      rationale: "<human-approved rationale>"
    });
  }
  return readyArgs;
}

export function buildAgentMutationPlan(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  args: Record<string, unknown>
): ModuleCommandResult {
  const commandName = readPlanString(args, "commandName");
  if (!commandName) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "agent-mutation-plan requires commandName.",
      remediation: { instructionPath: "src/modules/task-engine/instructions/agent-mutation-plan.md" }
    };
  }

  const schemaPayload = buildRunArgsSchemaOnlyPayload(commandName);
  if (!schemaPayload) {
    return {
      ok: false,
      code: "unknown-command",
      message: `No schema-only metadata found for workspace-kit run command '${commandName}'.`,
      remediation: { docPath: CLI_REMEDIATION_DOCS.agentCliMap }
    };
  }

  const planningGeneration = planning.sqliteDual.getPlanningGeneration();
  const planningPolicy = getPlanningGenerationPolicy({
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  const readyArgs = buildReadyRunArgs(schemaPayload, commandName, args, planningGeneration, planningPolicy);
  const readyArgv = `workspace-kit run ${commandName} '${JSON.stringify(readyArgs)}'`;
  const data: Record<string, unknown> = {
    schemaVersion: 1,
    commandName,
    schemaOnly: schemaPayload,
    policy: {
      ...(schemaPayload.policy as Record<string, unknown> | undefined),
      approvalLane: "JSON policyApproval in the run args object",
      envApprovalApplies: false,
      envApprovalWarning: `WORKSPACE_KIT_POLICY_APPROVAL does not approve workspace-kit run commands; use JSON policyApproval. See ${POLICY_APPROVAL_TWO_LANES_DOC}.`
    },
    planning: {
      planningGeneration,
      planningGenerationPolicy: planningPolicy,
      expectedPlanningGenerationRequired:
        planningPolicy === "require" &&
        (schemaPayload.planningGeneration as Record<string, unknown> | undefined)?.cliPrelude === true,
      expectedPlanningGenerationValue: planningGeneration
    },
    idempotency: {
      ...(schemaPayload.idempotency as Record<string, unknown> | undefined),
      recommendation:
        (schemaPayload.idempotency as Record<string, unknown> | undefined)?.clientMutationId === true
          ? "Use a stable clientMutationId when retrying after ambiguous command output."
          : "No clientMutationId field is declared for this command schema."
    },
    readyRun: {
      args: readyArgs,
      argv: readyArgv
    },
    remediation: {
      instructionPath: schemaPayload.instructionPath,
      remediationContract: schemaPayload.remediationContract
    }
  };

  if (commandName === "run-transition") {
    const taskId = readPlanString(args, "taskId");
    const requestedAction = readPlanString(args, "action");
    const task = taskId ? planning.taskStore.getTask(taskId) : undefined;
    if (!taskId) {
      data.lifecycle = { requested: false, message: "Pass taskId to include task-specific allowedActions." };
    } else if (!task) {
      data.lifecycle = {
        requested: true,
        taskId,
        found: false,
        validNow: false,
        message: `Task '${taskId}' was not found.`
      };
    } else {
      const allowedActions = getAllowedTransitionsFrom(task.status).map((entry) => ({
        action: entry.action,
        targetStatus: entry.to
      }));
      const blockers = dependencyBlockersForAction(task, requestedAction, planning.taskStore.getAllTasks());
      const lifecycleAllowed = requestedAction
        ? allowedActions.some((entry) => entry.action === requestedAction)
        : null;
      data.lifecycle = {
        requested: true,
        taskId,
        found: true,
        taskStatus: task.status,
        allowedActions,
        requestedAction: requestedAction ?? null,
        lifecycleAllowed,
        dependencyBlockers: blockers,
        validNow: lifecycleAllowed === true && blockers.length === 0
      };
    }
  }

  attachPolicyMeta(data, ctx, planningGeneration);
  return {
    ok: true,
    code: "agent-mutation-plan",
    message: `Prepared mutation plan for workspace-kit run ${commandName}`,
    data
  };
}
