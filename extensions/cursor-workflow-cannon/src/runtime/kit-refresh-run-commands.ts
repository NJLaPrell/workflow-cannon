/** Kit `run` commands treated as dashboard refresh reads (may pause during drawer mutations). */
export const KIT_REFRESH_RUN_COMMANDS = new Set([
  "dashboard-summary",
  "dashboard-bootstrap-slices",
  "list-phase-notes",
  "get-phase-context",
  "cae-authoring-summary"
]);

/** Kit `run` commands that mutate planning state — mutation lane preempts refresh backlog. */
export const KIT_MUTATION_RUN_COMMANDS = new Set([
  "run-transition",
  "assign-task-phase",
  "set-current-phase",
  "clear-task-phase",
  "upsert-phase-catalog-entry",
  "register-assignment",
  "submit-assignment-handoff",
  "update-workspace-phase-snapshot",
  "update-workspace-status",
  "set-agent-activity",
  "clear-agent-activity",
  "create-idea",
  "update-idea",
  "delete-idea",
  "reorder-ideas",
  "accept-plan-artifact",
  "review-plan-artifact",
  "finalize-plan-to-phase",
  "cancel-plan-artifact",
  "delete-plan-artifact"
]);

/** Default exec timeout for dashboard refresh reads (ms). */
export const KIT_REFRESH_RUN_TIMEOUT_MS = 30_000;

/** Default exec timeout for mutation lane commands (git canonical publish can exceed 30s). */
export const KIT_MUTATION_RUN_TIMEOUT_MS = 90_000;

export type KitRunLane = "mutation" | "refresh";

export const KIT_REFRESH_PAUSED_CODE = "extension-refresh-paused";

export function isKitRefreshRunCommand(commandName: string): boolean {
  return KIT_REFRESH_RUN_COMMANDS.has(commandName);
}

export function isKitMutationRunCommand(commandName: string): boolean {
  return KIT_MUTATION_RUN_COMMANDS.has(commandName);
}

/** Lane for queue scheduling — refresh reads coalesce; everything else runs mutation lane. */
export function kitRunLaneForCommand(commandName: string): KitRunLane {
  return isKitRefreshRunCommand(commandName) ? "refresh" : "mutation";
}

/** Coalesce key for pending refresh jobs (same command + args for dashboard-summary → keep newest only). */
export function kitRefreshCoalesceKey(
  commandName: string,
  args?: Record<string, unknown>
): string {
  if (commandName === "dashboard-summary") {
    const projection = typeof args?.projection === "string" ? args.projection.trim() : "full";
    return `dashboard-summary:${projection}`;
  }
  if (commandName === "dashboard-bootstrap-slices") {
    const slices = Array.isArray(args?.slices)
      ? [...args.slices].map(String).sort().join(",")
      : "default";
    return `dashboard-bootstrap-slices:${slices}`;
  }
  return commandName;
}

/** Per-command child-process timeout for `workspace-kit run` invocations from the extension. */
export function kitRunTimeoutMsForCommand(commandName: string): number {
  return kitRunLaneForCommand(commandName) === "mutation"
    ? KIT_MUTATION_RUN_TIMEOUT_MS
    : KIT_REFRESH_RUN_TIMEOUT_MS;
}

export function kitRefreshPausedResult(message?: string): {
  ok: false;
  code: string;
  message: string;
} {
  return {
    ok: false,
    code: KIT_REFRESH_PAUSED_CODE,
    message: message ?? "Dashboard refresh paused while a mutating drawer action runs"
  };
}

/**
 * Empty-stdout `extension-json-parse` after exit 1 — common when a kit child is killed
 * mid-flight (refresh preempt) or the process exits after writing state but before JSON lands.
 * Callers that already mutated should verify durable state before treating this as failure.
 */
export function isLostKitCliOutput(result: {
  ok?: boolean;
  code?: string;
  message?: string;
}): boolean {
  if (result.ok === false && result.code === "extension-json-parse") {
    const msg = String(result.message ?? "");
    return /exit 1;/.test(msg) && /stdout:\s*(?:;|$)/.test(msg);
  }
  return false;
}

/** Refresh reads aborted by pause/preempt — callers should keep the last good dashboard paint. */
export function isKitRefreshRunAborted(result: {
  ok?: boolean;
  code?: string;
  message?: string;
}): boolean {
  if (result.code === KIT_REFRESH_PAUSED_CODE) {
    return true;
  }
  return isLostKitCliOutput(result);
}
