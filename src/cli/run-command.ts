import { CLI_REMEDIATION_DOCS } from "../core/cli-remediation.js";
import { ModuleCommandRouter, ModuleCommandRouterError } from "../core/module-command-router.js";
import { resolveRegistryAndConfig } from "../core/module-registry-resolve.js";
import {
  appendPolicyTrace,
  isSensitiveModuleCommandForEffective,
  parsePolicyApproval,
  parsePolicyApprovalFromEnv,
  AGENT_CLI_MAP_HUMAN_DOC,
  POLICY_APPROVAL_HUMAN_DOC,
  POLICY_APPROVAL_TWO_LANES_DOC,
  POLICY_RUN_ENV_LANE_MISMATCH_DETAIL,
  resolveActorWithFallback,
  resolvePolicyOperationIdForCommand,
  type PolicyApprovalPayload
} from "../core/policy.js";
import { getSessionGrant, recordSessionGrant, resolveSessionId } from "../core/session-policy.js";
import { createKitLifecycleHookBus } from "../core/kit-lifecycle-hooks.js";
import { applyResponseTemplateApplication } from "../core/response-template-shaping.js";
import {
  buildRunArgsSchemaOnlyPayload,
  enforcePlanningGenerationCliPrelude,
  validatePilotRunCommandArgs
} from "../core/run-args-pilot-validation.js";
import { defaultRegistryModules } from "../modules/index.js";
import { promptSensitiveRunApproval } from "./interactive-policy.js";
import { releaseTranscriptHookLockFromEnv } from "../core/transcript-completion-hook.js";

/** Default apply-skill preview mode for policy (dryRun true when omitted). */
function normalizeApplySkillArgs(args: Record<string, unknown>): Record<string, unknown> {
  const next = { ...args };
  const opt =
    typeof next.options === "object" && next.options !== null && !Array.isArray(next.options)
      ? { ...(next.options as Record<string, unknown>) }
      : {};
  if (!Object.hasOwn(opt, "dryRun")) {
    opt.dryRun = true;
  }
  next.options = opt;
  return next;
}

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

  const subcommand = args[1];
  const schemaOnlyFlag =
    typeof args[2] === "string" && (args[2] === "--schema-only" || args[2] === "-S");

  if (subcommand && schemaOnlyFlag) {
    const payload = buildRunArgsSchemaOnlyPayload(subcommand);
    if (!payload) {
      writeLine(
        JSON.stringify(
          {
            ok: false,
            code: "schema-only-unsupported",
            message: `No bundled JSON schema sample for '${subcommand}'. Task-engine commands in schemas/pilot-run-args.snapshot.json are supported; other modules may lack a published args schema yet.`,
            remediation: { docPath: "docs/maintainers/adrs/ADR-runtime-run-args-validation-pilot.md" }
          },
          null,
          2
        )
      );
      return codes.validationFailure;
    }
    writeLine(JSON.stringify(payload, null, 2));
    return codes.success;
  }

  let commandArgs: Record<string, unknown> = {};
  if (subcommand && args[2]) {
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

  let registry;
  let router;
  let effective: Record<string, unknown>;
  try {
    const resolved = await resolveRegistryAndConfig(cwd, defaultRegistryModules, invocationConfig);
    registry = resolved.registry;
    effective = resolved.effective as Record<string, unknown>;
    router = new ModuleCommandRouter(registry);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeError(`Module registry / config resolution failed: ${message}`);
    return codes.validationFailure;
  }

  if (subcommand) {
    const pilotErr = validatePilotRunCommandArgs(subcommand, commandArgs, effective);
    if (pilotErr) {
      writeLine(JSON.stringify(pilotErr, null, 2));
      return codes.validationFailure;
    }
    const planPrelude = enforcePlanningGenerationCliPrelude(subcommand, commandArgs, effective);
    if (planPrelude) {
      writeLine(JSON.stringify(planPrelude, null, 2));
      return codes.validationFailure;
    }
  }

  if (subcommand === "apply-skill") {
    commandArgs = normalizeApplySkillArgs(commandArgs);
  }

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
      `Task-engine schema: workspace-kit run <command> --schema-only  (JSON Schema + sample args for commands listed in schemas/pilot-run-args.snapshot.json).`
    );
    writeLine(
      `Instruction files: src/modules/<module>/instructions/<command>.md — sensitive runs need JSON policyApproval (not env WORKSPACE_KIT_POLICY_APPROVAL); see ${POLICY_APPROVAL_TWO_LANES_DOC}.`
    );
    writeLine(`Agent-oriented tier table + copy-paste patterns: ${AGENT_CLI_MAP_HUMAN_DOC}.`);
    return codes.success;
  }

  try {
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
              remediation: { docPath: CLI_REMEDIATION_DOCS.policyApproval },
              message: "Sensitive command denied at interactive policy prompt.",
              hint: `Set WORKSPACE_KIT_INTERACTIVE_APPROVAL=off or pass policyApproval in JSON. See ${POLICY_APPROVAL_TWO_LANES_DOC}.`
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
      const envApprovalPresent = Boolean(parsePolicyApprovalFromEnv(process.env));
      const wrongEnvLane = envApprovalPresent && !hasPolicyApprovalField;
      const baseHint =
        policyOp != null
          ? `Operation ${policyOp} requires explicit JSON policyApproval (or session grant / TTY interactive approval). Details: ${POLICY_APPROVAL_TWO_LANES_DOC}`
          : "Check policy.extraSensitiveModuleCommands and pass policyApproval in JSON args.";
      writeLine(
        JSON.stringify(
          {
            ok: false,
            code: "policy-denied",
            operationId: policyOp ?? null,
            remediationDoc: POLICY_APPROVAL_HUMAN_DOC,
            remediation: { docPath: CLI_REMEDIATION_DOCS.policyApproval },
            message: wrongEnvLane
              ? `Sensitive run denied: ${POLICY_RUN_ENV_LANE_MISMATCH_DETAIL} See ${POLICY_APPROVAL_TWO_LANES_DOC}.`
              : hasPolicyApprovalField
                ? 'Invalid policyApproval in JSON args. Use {"policyApproval":{"confirmed":true,"rationale":"why","scope":"session"}} (scope optional) or a session grant. See remediationDoc.'
                : 'Missing policyApproval in JSON args. Example: {"policyApproval":{"confirmed":true,"rationale":"why","scope":"session"}}. See remediationDoc.',
            hint: wrongEnvLane ? POLICY_RUN_ENV_LANE_MISMATCH_DETAIL : baseHint
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

  const hookBus = createKitLifecycleHookBus(cwd, effective);
  if (hookBus.isEnabled()) {
    const preCmd = await hookBus.emitBeforeModuleCommand(subcommand, commandArgs);
    if (preCmd.denied && hookBus.getMode() === "enforce") {
      await hookBus.emitAfterModuleCommand(subcommand, false, "hook-denied");
      writeLine(
        JSON.stringify(
          {
            ok: false,
            code: "hook-denied",
            message: preCmd.denied.reason
          },
          null,
          2
        )
      );
      return codes.validationFailure;
    }
    if (preCmd.commandArgsPatch && hookBus.getMode() === "enforce") {
      Object.assign(commandArgs, preCmd.commandArgsPatch);
    }
  }

  try {
    const rawResult = await router.execute(subcommand, commandArgs, ctx);
    if (sensitive && resolvedSensitiveApproval && policyOp) {
      const rehearsal =
        subcommand === "generate-recommendations" && commandArgs.dryRun === true ? "policy-rehearsal" : null;
      const traceMessage =
        rehearsal && rawResult.message
          ? `${rehearsal} ${rawResult.message}`
          : rehearsal
            ? rehearsal
            : rawResult.message;
      await appendPolicyTrace(cwd, {
        timestamp: new Date().toISOString(),
        operationId: policyOp,
        command: `run ${subcommand}`,
        actor,
        allowed: true,
        rationale: resolvedSensitiveApproval.rationale,
        commandOk: rawResult.ok,
        message: traceMessage
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
    if (hookBus.isEnabled()) {
      await hookBus.emitAfterModuleCommand(subcommand, rawResult.ok, rawResult.code);
    }
    writeLine(JSON.stringify(result, null, 2));
    return result.ok ? codes.success : codes.validationFailure;
  } catch (error) {
    if (hookBus.isEnabled()) {
      const code =
        error instanceof ModuleCommandRouterError
          ? error.code
          : error instanceof Error
            ? error.name
            : "internal-error";
      await hookBus.emitAfterModuleCommand(subcommand, false, code);
    }
    if (error instanceof ModuleCommandRouterError) {
      writeLine(
        JSON.stringify(
          {
            ok: false,
            code: error.code,
            message: error.message,
            remediation:
              error.code === "unknown-command"
                ? {
                    docPath: CLI_REMEDIATION_DOCS.agentCliMap,
                    docAnchors: ["doctor --agent-instruction-surface", "workspace-kit run (no subcommand lists commands)"]
                  }
                : { docPath: CLI_REMEDIATION_DOCS.agentCliMap }
          },
          null,
          2
        )
      );
      return codes.validationFailure;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeError(`Module command failed: ${message}`);
    return codes.internalError;
  }
  } finally {
    releaseTranscriptHookLockFromEnv();
  }
}
