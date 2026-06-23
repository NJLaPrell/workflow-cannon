import { CLI_REMEDIATION_DOCS } from "../core/cli-remediation.js";
import {
  createCommandRegistryRuntime,
  ModuleCommandRouter,
  ModuleCommandRouterError
} from "../core/module-command-router.js";
import { resolveRegistryAndConfig } from "../core/module-registry-resolve.js";
import { cliPerfTracer } from "../core/cli-perf-trace.js";

import {
  appendPolicyTrace,
  isSensitiveModuleCommandForEffective,
  parsePolicyApproval,
  parsePolicyApprovalFromEnv,
  AGENT_CLI_MAP_HUMAN_DOC,
  POLICY_APPROVAL_TWO_LANES_DOC,
  POLICY_RUN_ENV_LANE_MISMATCH_DETAIL,
  resolveActorWithFallback,
  resolvePolicyOperationIdForCommand,
  resolveCommandExecutionPolicy,
  type PolicyApprovalPayload,
  type PolicyOperationId,
  type CommandExecutionPolicy
} from "../core/policy.js";
import { getSessionGrant, recordSessionGrant, resolveSessionId } from "../core/session-policy.js";
import { createKitLifecycleHookBus } from "../core/kit-lifecycle-hooks.js";
import { persistCaeTraceIfEnabled } from "../core/cae/cae-kit-sqlite.js";
import { mergeCaeIntoCommandResult, runCaeCliPreflight } from "../core/cae/cae-run-preflight.js";
import { applyResponseTemplateApplication } from "../core/response-template-shaping.js";
import { getAtPath } from "../core/workspace-kit-config.js";
import {
  buildRunArgsSchemaOnlyPayload,
  enforcePlanningGenerationCliPrelude,
  validatePilotRunCommandArgs
} from "../core/run-args-pilot-validation.js";
import { defaultRegistryModules } from "../modules/index.js";
import { TaskEngineError } from "../modules/task-engine/transitions.js";
import { tryAutoCheckpointBeforeRun } from "../modules/checkpoints/checkpoint-auto.js";
import { promptSensitiveRunApproval } from "./interactive-policy.js";
import { releaseTranscriptHookLockFromEnv } from "../core/transcript-completion-hook.js";
import { storeCaeSession } from "../modules/context-activation/trace-store.js";
import { cliDiscoveryEnvelope } from "../core/cli-discovery.js";
import { buildRunCommandCatalogPayload } from "./run-command-catalog.js";
import { createRunInvocationId, emitRunInvocationJson } from "./run-invocation-output.js";
import { resolveTaskSyncCommandAlias } from "../core/task-sync-command-aliases.js";
import { peelRunArgv, policyDeniedBody } from "./run-helpers.js";

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

export type RunCommandAdapterOptions = {
  createRuntime?: typeof createCommandRegistryRuntime;
};

export async function handleRunCommand(
  cwd: string,
  args: string[],
  io: RunCommandIo,
  codes: RunCommandExitCodes,
  adapters: RunCommandAdapterOptions = {}
): Promise<number> {
  cliPerfTracer.startSpan("handleRunCommand:start");
  // Start high-level CLI wrapper span and count process spawns
  cliPerfTracer.startSpan("cli-wrapper");
  const spawnCount = (parseInt(process.env.DASHBOARD_CLI_PROCESS_SPAWN_COUNT ?? "0") || 0) + 1;
  process.env.DASHBOARD_CLI_PROCESS_SPAWN_COUNT = String(spawnCount);
  try {
  const { writeLine, writeError } = io;
  const createRuntime = adapters.createRuntime ?? createCommandRegistryRuntime;
  const invocationId = createRunInvocationId();
  const runStartedAt = new Date().toISOString();

  const peeled = peelRunArgv(args.slice(1));
  const outputFileRequest = peeled.outputFile;
  let execPolicy: CommandExecutionPolicy | undefined;
  let effectiveForRunLog: Record<string, unknown> | undefined;
  let commandForRunLog: string | undefined;
  let argsForRunLog: Record<string, unknown> = {};
  const emitJson = async (body: Record<string, unknown>) => {
    const persistLog = execPolicy ? execPolicy.persistRunLog : true;
    await cliPerfTracer.spanAsync("emitRunInvocationJson", () =>
      emitRunInvocationJson(writeLine, cwd, body, {
        invocationId,
        outputFileRequest,
        persistRunLog: (commandForRunLog && persistLog)
          ? {
              effectiveConfig: effectiveForRunLog,
              command: commandForRunLog,
              commandArgs: argsForRunLog,
              startedAt: runStartedAt
            }
          : undefined
      })
    );
  };

  let { jsonCatalog, rest } = peeled;
  let subcommand: string | undefined = rest[0];
  if (subcommand === "list-commands") {
    jsonCatalog = true;
    subcommand = undefined;
  } else if (peeled.listCommands) {
    jsonCatalog = true;
  }
  const schemaOnlyFlag =
    typeof rest[1] === "string" && (rest[1] === "--schema-only" || rest[1] === "-S");

  let commandArgs: Record<string, unknown> = {};
  if (subcommand && rest[1] && !schemaOnlyFlag) {
    const parseResult = cliPerfTracer.span("parseRunCommandArgs", () => {
      try {
        const parsed = JSON.parse(rest[1]);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return { ok: true, parsed };
        } else {
          return { ok: false, error: "Command args must be a JSON object." };
        }
      } catch {
        return { ok: false, error: `Invalid JSON args: ${rest[1]}` };
      }
    });
    if (!parseResult.ok) {
      writeError(parseResult.error!);
      return codes.usageError;
    }
    commandArgs = parseResult.parsed!;
  }

  const invocationConfig =
    typeof commandArgs.config === "object" &&
    commandArgs.config !== null &&
    !Array.isArray(commandArgs.config)
      ? (commandArgs.config as Record<string, unknown>)
      : {};

  let registry: any;
  let router: ModuleCommandRouter;
  let effective: Record<string, unknown>;
  try {
    const resolved = await cliPerfTracer.spanAsync("resolveRegistryAndConfig", () =>
      resolveRegistryAndConfig(cwd, defaultRegistryModules, invocationConfig)
    );
    registry = resolved.registry;
    effective = resolved.effective as Record<string, unknown>;
    effectiveForRunLog = effective;
    router = cliPerfTracer.span("ModuleCommandRouter:new", () => new ModuleCommandRouter(registry));
    if (subcommand) {
      subcommand = router.describeCommand(subcommand)
        ? subcommand
        : resolveTaskSyncCommandAlias(subcommand);
      execPolicy = resolveCommandExecutionPolicy(subcommand);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeError(`Module registry / config resolution failed: ${message}`);
    return codes.validationFailure;
  }

  if (subcommand && schemaOnlyFlag) {
    const descriptor = router.describeCommand(subcommand);
    if (!descriptor) {
      const names = router.listCommands().map((command) => command.name);
      await emitJson({
        ok: false,
        code: "unknown-command",
        message: `Unknown command '${subcommand}'. Run 'workspace-kit run --list-commands' for the command catalog.`,
        details: { availableCommands: names },
        remediation: { docPath: CLI_REMEDIATION_DOCS.agentCliMap },
        discovery: cliDiscoveryEnvelope()
      });
      return codes.validationFailure;
    }
    const payload = buildRunArgsSchemaOnlyPayload(subcommand, {
      name: descriptor.name,
      moduleId: descriptor.moduleId,
      instructionPath: descriptor.instructionFile,
      description: descriptor.description
    });
    if (!payload) {
      await emitJson({
        ok: false,
        code: "schema-only-unsupported",
        message: `Command '${subcommand}' is executable but has no schema-only metadata. This is a command contract bug.`,
        remediation: {
          instructionPath: "src/modules/task-engine/instructions/agent-mutation-plan.md",
          docPath: CLI_REMEDIATION_DOCS.agentCliMap
        },
        discovery: cliDiscoveryEnvelope()
      });
      return codes.validationFailure;
    }
    await emitJson({ ...payload, discovery: cliDiscoveryEnvelope() });
    return codes.success;
  }

  if (subcommand) {
    const pilotErr = cliPerfTracer.span("validateRunArgs", () =>
      validatePilotRunCommandArgs(subcommand!, commandArgs, effective)
    );
    if (pilotErr) {
      await emitJson(pilotErr as Record<string, unknown>);
      return codes.validationFailure;
    }
    const planPrelude = cliPerfTracer.span("planningGenerationPrelude", () =>
      enforcePlanningGenerationCliPrelude(subcommand!, commandArgs, effective)
    );
    if (planPrelude) {
      await emitJson(planPrelude as Record<string, unknown>);
      return codes.validationFailure;
    }
  }

  if (subcommand === "apply-skill") {
    commandArgs = normalizeApplySkillArgs(commandArgs);
  }

  if (subcommand) {
    commandForRunLog = subcommand;
    argsForRunLog = commandArgs;
  }

  if (!subcommand && jsonCatalog) {
    await emitJson({
      ...buildRunCommandCatalogPayload(router, effective),
      discovery: cliDiscoveryEnvelope()
    });
    return codes.success;
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
      `Schema discovery: workspace-kit run <command> --schema-only  (JSON Schema or permissive fallback + sample args + policy metadata for every executable command).`
    );
    writeLine(
      `JSON catalog (agents): workspace-kit run --list-commands  (alias: run list-commands '{}', run --json) — stable command list + policy hints.`
    );
    writeLine(
      `Instruction files: src/modules/<module>/instructions/<command>.md — sensitive runs need JSON policyApproval (not env WORKSPACE_KIT_POLICY_APPROVAL); see ${POLICY_APPROVAL_TWO_LANES_DOC}.`
    );
    writeLine(
      `Agent CLI map: .ai/AGENT-CLI-MAP.md (navigation) + .ai/agent-cli-snippets/ (per-command schema-only JSON); maintainer depth: ${AGENT_CLI_MAP_HUMAN_DOC}.`
    );
    return codes.success;
  }

  try {
  const actor = await cliPerfTracer.spanAsync("resolveEffectiveActor", () =>
    resolveActorWithFallback(cwd, commandArgs, process.env)
  );

  let resolvedSensitiveApproval: PolicyApprovalPayload | undefined;
  let interactiveSessionFollowup = false;
  let sessionId: string = "default";
  let policyOp: PolicyOperationId | undefined;
  let explicitPolicyApproval: PolicyApprovalPayload | undefined;
  let hasPolicyApprovalField = false;

  const runPolicyCheck = execPolicy ? execPolicy.requiresPolicy : true;

  const policyCheckResult = runPolicyCheck
    ? await cliPerfTracer.spanAsync("policy/session grant checks", async () => {
        const sensitive = isSensitiveModuleCommandForEffective(subcommand!, commandArgs, effective);
        sessionId = resolveSessionId(process.env);
        policyOp = resolvePolicyOperationIdForCommand(subcommand!, effective);
        explicitPolicyApproval = parsePolicyApproval(commandArgs);
        hasPolicyApprovalField = Object.hasOwn(commandArgs, "policyApproval");
        let resolvedApproval: PolicyApprovalPayload | undefined = explicitPolicyApproval;
        let followup = false;

        if (sensitive) {
          if (!resolvedApproval && policyOp) {
            const grant = await getSessionGrant(cwd, policyOp, sessionId, effective);
            if (grant) {
              resolvedApproval = { confirmed: true, rationale: grant.rationale };
            }
          }
          if (!resolvedApproval && policyOp) {
            const interactive = await promptSensitiveRunApproval(
              { writeError, readStdinLine: io.readStdinLine },
              policyOp,
              `run ${subcommand}`,
              process.env
            );
            if (interactive?.kind === "deny") {
              await cliPerfTracer.spanAsync("policy trace append", () =>
                appendPolicyTrace(cwd, {
                  timestamp: new Date().toISOString(),
                  operationId: policyOp!,
                  command: `run ${subcommand}`,
                  actor,
                  allowed: false,
                  message: "interactive policy approval denied"
                })
              );
              return {
                ok: false,
                policyOp,
                hasPolicyApprovalField,
                denyKind: "interactive" as const
              };
            }
            if (interactive?.kind === "approve") {
              const rationale =
                interactive.scope === "session" ? "interactive-approval-session" : "interactive-approval-once";
              resolvedApproval = {
                confirmed: true,
                rationale,
                ...(interactive.scope === "session" ? { scope: "session" } : {})
              };
              followup = interactive.scope === "session";
            }
          }
          if (!resolvedApproval) {
            if (policyOp) {
              await cliPerfTracer.spanAsync("policy trace append", () =>
                appendPolicyTrace(cwd, {
                  timestamp: new Date().toISOString(),
                  operationId: policyOp!,
                  command: `run ${subcommand}`,
                  actor,
                  allowed: false,
                  message: hasPolicyApprovalField
                    ? "invalid policyApproval in JSON args"
                    : "missing policyApproval in JSON args"
                })
              );
            }
            return {
              ok: false,
              policyOp,
              hasPolicyApprovalField,
              denyKind: "missing-or-invalid" as const
            };
          }
        }
        return { ok: true, resolvedApproval, followup, sensitive, policyOp };
      })
    : { ok: true, resolvedApproval: undefined, followup: false, sensitive: false, policyOp: undefined };

  if (!policyCheckResult.ok) {
    if (policyCheckResult.denyKind === "interactive") {
      await emitJson(
        policyDeniedBody({
          policyOp: policyCheckResult.policyOp,
          message: "Sensitive command denied at interactive policy prompt.",
          hint: `Set WORKSPACE_KIT_INTERACTIVE_APPROVAL=off or pass policyApproval in JSON. See ${POLICY_APPROVAL_TWO_LANES_DOC}.`,
          wrongEnvLane: false,
          subcommand,
          hasPolicyApprovalField: !!policyCheckResult.hasPolicyApprovalField
        })
      );
      return codes.validationFailure;
    } else {
      const envApprovalPresent = Boolean(parsePolicyApprovalFromEnv(process.env));
      const wrongEnvLane = envApprovalPresent && !policyCheckResult.hasPolicyApprovalField;
      const baseHint =
        policyCheckResult.policyOp != null
          ? `Operation ${policyCheckResult.policyOp} requires explicit JSON policyApproval (or session grant / TTY interactive approval). Details: ${POLICY_APPROVAL_TWO_LANES_DOC}`
          : "Check policy.extraSensitiveModuleCommands and pass policyApproval in JSON args.";
      const msg = wrongEnvLane
        ? `Sensitive run denied: ${POLICY_RUN_ENV_LANE_MISMATCH_DETAIL} See ${POLICY_APPROVAL_TWO_LANES_DOC}.`
        : policyCheckResult.hasPolicyApprovalField
          ? 'Invalid policyApproval in JSON args. Use {"policyApproval":{"confirmed":true,"rationale":"why","scope":"session"}} (scope optional) or a session grant. See remediationDoc.'
          : 'Missing policyApproval in JSON args. Example: {"policyApproval":{"confirmed":true,"rationale":"why","scope":"session"}}. See remediationDoc.';
      await emitJson(
        policyDeniedBody({
          policyOp: policyCheckResult.policyOp,
          message: msg,
          hint: wrongEnvLane ? POLICY_RUN_ENV_LANE_MISMATCH_DETAIL : baseHint,
          wrongEnvLane,
          subcommand,
          hasPolicyApprovalField: !!policyCheckResult.hasPolicyApprovalField
        })
      );
      return codes.validationFailure;
    }
  }

  resolvedSensitiveApproval = policyCheckResult.resolvedApproval;
  interactiveSessionFollowup = policyCheckResult.followup as boolean;
  const sensitive = policyCheckResult.sensitive as boolean;
  policyOp = policyCheckResult.policyOp;

  const ctx = {
    runtimeVersion: "0.1" as const,
    workspacePath: cwd,
    effectiveConfig: effective,
    resolvedActor: actor,
    moduleRegistry: registry
  };
  const runtime = createRuntime(registry, { ctx });

  const runCheckpoint = execPolicy ? execPolicy.allowAutoCheckpoint : true;
  const autoCheckpoint = runCheckpoint
    ? await cliPerfTracer.spanAsync("tryAutoCheckpointBeforeRun", () =>
        tryAutoCheckpointBeforeRun({
          workspacePath: cwd,
          effectiveConfig: effective,
          subcommand: subcommand!,
          actor
        })
      )
    : { ok: true as const, skippedReason: "checkpoint-skipped" };
  if (!autoCheckpoint.ok) {
    await emitJson({
      ok: false,
      code: autoCheckpoint.code,
      message: autoCheckpoint.message
    });
    return codes.validationFailure;
  }

  const runHooks = execPolicy ? execPolicy.allowLifecycleHooks : true;
  const hookBus = runHooks
    ? cliPerfTracer.span("lifecycle hook bus setup", () =>
        createKitLifecycleHookBus(cwd, effective)
      )
    : undefined;
  if (runHooks && hookBus && hookBus.isEnabled()) {
    const preCmd = await cliPerfTracer.spanAsync("lifecycle hook bus setup", () =>
      hookBus.emitBeforeModuleCommand(subcommand!, commandArgs)
    );
    if (preCmd.denied && hookBus.getMode() === "enforce") {
      await cliPerfTracer.spanAsync("lifecycle hook bus setup", () =>
        hookBus.emitAfterModuleCommand(subcommand!, false, "hook-denied")
      );
      await emitJson({
        ok: false,
        code: "hook-denied",
        message: preCmd.denied.reason
      });
      return codes.validationFailure;
    }
    if (preCmd.commandArgsPatch && hookBus.getMode() === "enforce") {
      Object.assign(commandArgs, preCmd.commandArgsPatch);
    }
  }

  const runCae = execPolicy ? execPolicy.allowCaePreflight : true;
  const caePre = runCae
    ? cliPerfTracer.span("CAE preflight", () =>
        runCaeCliPreflight({
          workspacePath: cwd,
          effective,
          subcommand: subcommand!,
          commandArgs,
          router
        })
      )
    : { shadowAttach: null, enforcementDenial: null, traceToStore: null };
  if (runCae && caePre.traceToStore) {
    cliPerfTracer.span("CAE preflight", () => {
      storeCaeSession(caePre.traceToStore!.traceId, {
        bundle: caePre.traceToStore!.bundle,
        trace: caePre.traceToStore!.trace
      });
    });
    const persistShadowPreflight =
      getAtPath(effective, "kit.cae.persistence") === true &&
      getAtPath(effective, "kit.cae.runtime.persistShadowPreflight") === true;
    cliPerfTracer.span("CAE preflight", () =>
      persistCaeTraceIfEnabled(
        cwd,
        effective,
        persistShadowPreflight,
        caePre.traceToStore!.traceId,
        caePre.traceToStore!.trace,
        caePre.traceToStore!.bundle
      )
    );
  }
  if (runCae && caePre.enforcementDenial) {
    const denied = cliPerfTracer.span("applyResponseTemplate", () =>
      applyResponseTemplateApplication(
        subcommand!,
        commandArgs,
        caePre.enforcementDenial!,
        effective
      )
    );
    await emitJson(denied as Record<string, unknown>);
    return codes.validationFailure;
  }

  try {
    const rawResult = await cliPerfTracer.spanAsync("runtime.invoke", () =>
      runtime.invoke({ name: subcommand, args: commandArgs })
    );
    if (sensitive && resolvedSensitiveApproval && policyOp) {
      const rehearsal =
        subcommand === "generate-recommendations" && commandArgs.dryRun === true ? "policy-rehearsal" : null;
      const traceMessage =
        rehearsal && rawResult.message
          ? `${rehearsal} ${rawResult.message}`
          : rehearsal
            ? rehearsal
            : rawResult.message;
      await cliPerfTracer.spanAsync("policy trace append", () =>
        appendPolicyTrace(cwd, {
          timestamp: new Date().toISOString(),
          operationId: policyOp!,
          command: `run ${subcommand}`,
          actor,
          allowed: true,
          rationale: resolvedSensitiveApproval!.rationale,
          commandOk: rawResult.ok,
          message: traceMessage
        })
      );
      const recordSession =
        rawResult.ok &&
        (explicitPolicyApproval?.scope === "session" || interactiveSessionFollowup);
      if (recordSession) {
        await recordSessionGrant(
          cwd,
          policyOp,
          sessionId,
          resolvedSensitiveApproval!.rationale,
          effective
        );
      }
    }
    const withCae = mergeCaeIntoCommandResult(rawResult, caePre.shadowAttach);
    const hasExplicitTemplateRequest =
      typeof commandArgs.responseTemplateId === "string" ||
      typeof commandArgs.responseTemplateDirective === "string" ||
      typeof commandArgs.instructionTemplateDirective === "string" ||
      typeof commandArgs.instruction === "string";

    const skipTemplateShaping = execPolicy?.class === "read_hot" && !hasExplicitTemplateRequest;

    const result = skipTemplateShaping
      ? withCae
      : cliPerfTracer.span("applyResponseTemplate", () =>
          applyResponseTemplateApplication(subcommand!, commandArgs, withCae, effective)
        );

    if (runHooks && hookBus && hookBus.isEnabled()) {
      await hookBus.emitAfterModuleCommand(subcommand!, rawResult.ok, rawResult.code);
    }
    await emitJson(result as Record<string, unknown>);
    return result.ok ? codes.success : codes.validationFailure;
  } catch (error) {
    if (error instanceof TaskEngineError) {
      const body: Record<string, unknown> = {
        ok: false,
        code: error.code,
        message: error.message
      };
      if (error.details && Object.keys(error.details).length > 0) {
        body.data = error.details;
      }
      if (error.code === "planning-generation-mismatch" || error.code === "planning-generation-required") {
        body.remediation = {
          docPath: CLI_REMEDIATION_DOCS.planningGeneration,
          instructionPath: "src/modules/task-engine/instructions/run-transition.md"
        };
      }
      if (runHooks && hookBus && hookBus.isEnabled()) {
        await hookBus.emitAfterModuleCommand(subcommand, false, error.code);
      }
      await emitJson(body);
      return codes.validationFailure;
    }
    if (runHooks && hookBus && hookBus.isEnabled()) {
      const code =
        error instanceof ModuleCommandRouterError
          ? error.code
          : error instanceof Error
            ? error.name
            : "internal-error";
      await hookBus.emitAfterModuleCommand(subcommand, false, code);
    }
    if (error instanceof ModuleCommandRouterError) {
      await emitJson({
        ok: false,
        code: error.code,
        message: error.message,
        remediation:
          error.code === "unknown-command"
            ? {
                docPath: CLI_REMEDIATION_DOCS.agentCliMap,
                docAnchors: [
                  "doctor --agent-instruction-surface",
                  "workspace-kit run --list-commands"
                ]
              }
            : { docPath: CLI_REMEDIATION_DOCS.agentCliMap },
        discovery: cliDiscoveryEnvelope()
      });
      return codes.validationFailure;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeError(`Module command failed: ${message}`);
    return codes.internalError;
  }
  } finally {
    releaseTranscriptHookLockFromEnv();
  }
  } finally {
    cliPerfTracer.endSpan("cli-wrapper");
    cliPerfTracer.endSpan("handleRunCommand:start");
    cliPerfTracer.flush();
  }
}
