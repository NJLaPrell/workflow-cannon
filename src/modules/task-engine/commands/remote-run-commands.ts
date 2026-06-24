import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";

const REMOTE_RUN_STATUSES = new Set([
  "queued",
  "running",
  "needs_input",
  "completed",
  "failed",
  "cancelled",
  "handed_off"
]);

function readOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function readOptionalLimit(args: Record<string, unknown>): number {
  const raw = args.limit;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 50;
  }
  return Math.min(200, Math.max(1, Math.floor(raw)));
}

/**
 * Phase 1 read stub — spec + empty projection until SQLite persistence (Phase 2).
 * See `.ai/adrs/ADR-cursor-remote-agent-handoff-v1.md`.
 */
export function runListRemoteRunsCommand(
  _ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): ModuleCommandResult {
  const taskId = readOptionalString(args, "taskId");
  const status = readOptionalString(args, "status");
  const hostProvider = readOptionalString(args, "hostProvider") ?? "cursor";
  const limit = readOptionalLimit(args);

  if (status && !REMOTE_RUN_STATUSES.has(status)) {
    return {
      ok: false,
      code: "invalid-run-args",
      message:
        "list-remote-runs: status must be one of queued | running | needs_input | completed | failed | cancelled | handed_off"
    };
  }

  if (hostProvider !== "cursor") {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "list-remote-runs: hostProvider must be cursor in v1"
    };
  }

  const filters: Record<string, unknown> = { hostProvider, limit };
  if (taskId) {
    filters.taskId = taskId;
  }
  if (status) {
    filters.status = status;
  }

  return {
    ok: true,
    code: "remote-runs-listed",
    message:
      "Phase 1 read stub: no remote runs persisted yet (persistence none). See ADR-cursor-remote-agent-handoff-v1.",
    data: {
      schemaVersion: 1,
      count: 0,
      runs: [],
      persistence: "none",
      filters,
      implementationPhase: 1,
      schemaPath: "schemas/remote-run-metadata.v1.json",
      adrPath: ".ai/adrs/ADR-cursor-remote-agent-handoff-v1.md"
    }
  };
}
