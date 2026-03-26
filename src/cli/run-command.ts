import { ModuleRegistry } from "../core/module-registry.js";
import { ModuleCommandRouter } from "../core/module-command-router.js";
import {
  appendPolicyTrace,
  isSensitiveModuleCommandForEffective,
  parsePolicyApproval,
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

export type RunCommandIo = {
  writeLine: (message: string) => void;
  writeError: (message: string) => void;
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
    writeLine("Usage: workspace-kit run <command> [json-args]");
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
  let resolvedSensitiveApproval: PolicyApprovalPayload | undefined = explicitPolicyApproval;

  if (sensitive) {
    if (!resolvedSensitiveApproval && policyOp) {
      const grant = await getSessionGrant(cwd, policyOp, sessionId);
      if (grant) {
        resolvedSensitiveApproval = { confirmed: true, rationale: grant.rationale };
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
          message: "missing policyApproval in JSON args"
        });
      }
      writeLine(
        JSON.stringify(
          {
            ok: false,
            code: "policy-denied",
            message:
              'Sensitive command requires policyApproval in JSON args (or an existing session grant for this operation): {"policyApproval":{"confirmed":true,"rationale":"why","scope":"session"}}'
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
      if (explicitPolicyApproval?.scope === "session" && rawResult.ok) {
        await recordSessionGrant(cwd, policyOp, sessionId, explicitPolicyApproval.rationale);
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
