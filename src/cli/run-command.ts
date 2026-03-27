import { ModuleRegistry } from "../core/module-registry.js";
import { ModuleCommandRouter } from "../core/module-command-router.js";
import {
  appendPolicyTrace,
  isSensitiveModuleCommandForEffective,
  parsePolicyApproval,
  AGENT_CLI_MAP_HUMAN_DOC,
  POLICY_APPROVAL_HUMAN_DOC,
  resolveActorWithFallback,
  resolvePolicyOperationIdForCommand,
  type PolicyApprovalPayload
} from "../core/policy.js";
import { getSessionGrant, recordSessionGrant, resolveSessionId } from "../core/session-policy.js";
import { applyResponseTemplateApplication } from "../core/response-template-shaping.js";
import { resolveWorkspaceConfigWithLayers } from "../core/workspace-kit-config.js";
import { documentationModule } from "../modules/documentation/index.js";
import { taskEngineModule } from "../modules/task-engine/index.js";
import { approvalsModule } from "../modules/approvals/index.js";
import { planningModule } from "../modules/planning/index.js";
import { improvementModule } from "../modules/improvement/index.js";
import { workspaceConfigModule } from "../modules/workspace-config/index.js";
import { promptSensitiveRunApproval } from "./interactive-policy.js";

export type RunCommandIo = {
  writeLine: (message: string) => void;
  writeError: (message: string) => void;
  /** Test hook: return one line of simulated stdin for interactive policy approval */
  readStdinLine?: () => Promise<string | null>;
};

export type RunCommandExitCodes = {
  success: number;
  validationFailure: number;
  usageError: number;
  internalError: number;
};

export async function handleRunCommand(
  cwd: string,
  args: string[],
  io: RunCommandIo,
  codes: RunCommandExitCodes
): Promise<number> {
  const { writeLine, writeError } = io;

  const allModules = [
    workspaceConfigModule,
    documentationModule,
    taskEngineModule,
    approvalsModule,
    planningModule,
    improvementModule
  ];
  const registry = new ModuleRegistry(allModules);
  const router = new ModuleCommandRouter(registry);

  const subcommand = args[1];
  if (!subcommand) {
    const commands = router.listCommands();
    writeLine("Available module commands:");
    for (const cmd of commands) {
      const desc = cmd.description ? ` — ${cmd.description}` : "";
      writeLine(`  ${cmd.name} (${cmd.moduleId})${desc}`);
    }
    writeLine("");
    writeLine(`Usage: workspace-kit run <command> [json-args]`);
    writeLine(
      `Instruction files: src/modules/<module>/instructions/<command>.md — policy-sensitive runs need JSON policyApproval (${POLICY_APPROVAL_HUMAN_DOC}).`
    );
    writeLine(`Agent-oriented tier table + copy-paste patterns: ${AGENT_CLI_MAP_HUMAN_DOC}.`);
    return codes.success;
  }

  let commandArgs: Record<string, unknown> = {};
  if (args[2]) {
    try {
      const parsed = JSON.parse(args[2]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        commandArgs = parsed as Record<string, unknown>;
      } else {
        writeError("Command args must be a JSON object.");
        return codes.usageError;
      }
    } catch {
      writeError(`Invalid JSON args: ${args[2]}`);
      return codes.usageError;
    }
  }

  const invocationConfig =
    typeof commandArgs.config === "object" &&
    commandArgs.config !== null &&
    !Array.isArray(commandArgs.config)
      ? (commandArgs.config as Record<string, unknown>)
      : {};

  let effective: Record<string, unknown>;
  try {
    const resolved = await resolveWorkspaceConfigWithLayers({
      workspacePath: cwd,
      registry,
      invocationConfig
    });
    effective = resolved.effective;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeError(`Config resolution failed: ${message}`);
    return codes.validationFailure;
  }

  const actor = await resolveActorWithFallback(cwd, commandArgs, process.env);
  const sensitive = isSensitiveModuleCommandForEffective(subcommand, commandArgs, effective);
  const sessionId = resolveSessionId(process.env);
  const policyOp = resolvePolicyOperationIdForCommand(subcommand, effective);
  const explicitPolicyApproval = parsePolicyApproval(commandArgs);
  const hasPolicyApprovalField = Object.hasOwn(commandArgs, "policyApproval");
  let resolvedSensitiveApproval: PolicyApprovalPayload | undefined = explicitPolicyApproval;
  let interactiveSessionFollowup = false;

  if (sensitive) {
    if (!resolvedSensitiveApproval && policyOp) {
      const grant = await getSessionGrant(cwd, policyOp, sessionId);
      if (grant) {
        resolvedSensitiveApproval = { confirmed: true, rationale: grant.rationale };
      }
    }
    if (!resolvedSensitiveApproval && policyOp) {
      const interactive = await promptSensitiveRunApproval(
        { writeError, readStdinLine: io.readStdinLine },
        policyOp,
        `run ${subcommand}`,
        process.env
      );
      if (interactive?.kind === "deny") {
        await appendPolicyTrace(cwd, {
          timestamp: new Date().toISOString(),
          operationId: policyOp,
          command: `run ${subcommand}`,
          actor,
          allowed: false,
          message: "interactive policy approval denied"
        });
        writeLine(
          JSON.stringify(
            {
              ok: false,
              code: "policy-denied",
              operationId: policyOp,
              remediationDoc: POLICY_APPROVAL_HUMAN_DOC,
              message: "Sensitive command denied at interactive policy prompt.",
              hint: `Set WORKSPACE_KIT_INTERACTIVE_APPROVAL=off or pass policyApproval in JSON. See ${POLICY_APPROVAL_HUMAN_DOC}.`
            },
            null,
            2
          )
        );
        return codes.validationFailure;
      }
      if (interactive?.kind === "approve") {
        const rationale =
          interactive.scope === "session" ? "interactive-approval-session" : "interactive-approval-once";
        resolvedSensitiveApproval = {
          confirmed: true,
          rationale,
          ...(interactive.scope === "session" ? { scope: "session" } : {})
        };
        interactiveSessionFollowup = interactive.scope === "session";
      }
    }
    if (!resolvedSensitiveApproval) {
      if (policyOp) {
        await appendPolicyTrace(cwd, {
          timestamp: new Date().toISOString(),
          operationId: policyOp,
          command: `run ${subcommand}`,
          actor,
          allowed: false,
          message: hasPolicyApprovalField
            ? "invalid policyApproval in JSON args"
            : "missing policyApproval in JSON args"
        });
      }
      writeLine(
        JSON.stringify(
          {
            ok: false,
            code: "policy-denied",
            operationId: policyOp ?? null,
            remediationDoc: POLICY_APPROVAL_HUMAN_DOC,
            message: hasPolicyApprovalField
              ? 'Sensitive command received an invalid policyApproval object. Use {"policyApproval":{"confirmed":true,"rationale":"why","scope":"session"}} (scope optional) or use an existing session grant for this operation.'
              : 'Sensitive command requires policyApproval in JSON args (or an existing session grant for this operation). Example: {"policyApproval":{"confirmed":true,"rationale":"why","scope":"session"}}. See remediationDoc for env vs JSON approval surfaces.',
            hint:
              policyOp != null
                ? `Operation ${policyOp} requires explicit approval; WORKSPACE_KIT_POLICY_APPROVAL is not read for workspace-kit run. Optional: set WORKSPACE_KIT_INTERACTIVE_APPROVAL=on in a TTY for a prompt (see ${POLICY_APPROVAL_HUMAN_DOC}).`
                : "Operation could not be mapped to policyOperationId; check policy.extraSensitiveModuleCommands and pass policyApproval in JSON args."
          },
          null,
          2
        )
      );
      return codes.validationFailure;
    }
  }

  const ctx = {
    runtimeVersion: "0.1" as const,
    workspacePath: cwd,
    effectiveConfig: effective,
    resolvedActor: actor,
    moduleRegistry: registry
  };

  try {
    const rawResult = await router.execute(subcommand, commandArgs, ctx);
    if (sensitive && resolvedSensitiveApproval && policyOp) {
      await appendPolicyTrace(cwd, {
        timestamp: new Date().toISOString(),
        operationId: policyOp,
        command: `run ${subcommand}`,
        actor,
        allowed: true,
        rationale: resolvedSensitiveApproval.rationale,
        commandOk: rawResult.ok,
        message: rawResult.message
      });
      const recordSession =
        rawResult.ok &&
        (explicitPolicyApproval?.scope === "session" || interactiveSessionFollowup);
      if (recordSession) {
        await recordSessionGrant(
          cwd,
          policyOp,
          sessionId,
          resolvedSensitiveApproval.rationale
        );
      }
    }
    const result = applyResponseTemplateApplication(subcommand, commandArgs, rawResult, effective);
    writeLine(JSON.stringify(result, null, 2));
    return result.ok ? codes.success : codes.validationFailure;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(`Module command failed: ${message}`);
    return codes.internalError;
  }
}
