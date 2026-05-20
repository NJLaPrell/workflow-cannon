import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { CLI_REMEDIATION_INSTRUCTIONS } from "../../../core/cli-remediation.js";
import {
  isRunLogTableAvailable,
  readLatestRunLogRow,
  readRunLogByInvocationId
} from "../../../core/state/kit-run-log-sqlite.js";

export function runGetLastOutput(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): ModuleCommandResult {
  const invocationId = typeof args.invocationId === "string" ? args.invocationId.trim() : "";
  const last = args.last === true;

  if ((invocationId.length > 0 && last) || (invocationId.length === 0 && !last)) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: 'get-last-output requires exactly one of invocationId (string) or last:true',
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.getLastOutput }
    };
  }

  if (!isRunLogTableAvailable(ctx.workspacePath, ctx.effectiveConfig)) {
    return {
      ok: false,
      code: "run-log-disabled",
      message: "Run log table is not available in the planning database (migration not applied or persistence disabled)",
      remediation: { instructionPath: "src/modules/task-engine/instructions/get-last-output.md" }
    };
  }

  const row = last
    ? readLatestRunLogRow({ workspacePath: ctx.workspacePath, effectiveConfig: ctx.effectiveConfig })
    : readRunLogByInvocationId({
        workspacePath: ctx.workspacePath,
        effectiveConfig: ctx.effectiveConfig,
        invocationId
      });

  if (!row) {
    return {
      ok: false,
      code: "invocation-not-found",
      message: last
        ? "No completed invocations found in run log"
        : `No run log row for invocationId '${invocationId}'`,
      remediation: { instructionPath: "src/modules/task-engine/instructions/get-last-output.md" }
    };
  }

  return {
    ok: true,
    code: "run-log-output-read",
    message: last ? "Read most recent run log entry" : `Read run log for invocation ${row.invocationId}`,
    data: {
      invocationId: row.invocationId,
      command: row.command,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      ok: row.ok,
      code: row.code,
      args: row.args,
      response: row.response
    }
  };
}
