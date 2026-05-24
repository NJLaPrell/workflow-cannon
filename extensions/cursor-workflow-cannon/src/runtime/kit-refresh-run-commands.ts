/** Kit `run` commands treated as dashboard refresh reads (may pause during drawer mutations). */
export const KIT_REFRESH_RUN_COMMANDS = new Set([
  "dashboard-summary",
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
  "clear-agent-activity"
]);

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

/** Coalesce key for pending refresh jobs (same command → keep newest only). */
export function kitRefreshCoalesceKey(commandName: string): string {
  return commandName;
}

export function kitRefreshPausedResult(): {
  ok: false;
  code: string;
  message: string;
} {
  return {
    ok: false,
    code: KIT_REFRESH_PAUSED_CODE,
    message: "Dashboard refresh paused while a mutating drawer action runs"
  };
}
