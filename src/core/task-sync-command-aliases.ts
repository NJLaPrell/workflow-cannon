/**
 * Backend-neutral `task-sync-*` CLI names with `task-state-*` recovery aliases (T100622).
 * Canonical manifest/router names are `task-sync-*`; legacy git-oriented names remain callable.
 */

/** Recovery alias → canonical command name (registered in manifest). */
export const TASK_SYNC_RECOVERY_ALIASES: Readonly<Record<string, string>> = {
  "task-state-status": "task-sync-status",
  "task-state-hydrate": "task-sync-hydrate",
  "task-state-init": "task-sync-init",
  "task-state-verify": "task-sync-verify",
  "task-state-publish": "task-sync-publish",
  "task-state-snapshot": "task-sync-snapshot",
  "task-state-compact": "task-sync-compact"
};

const CANONICAL_TASK_SYNC_COMMANDS = new Set(Object.values(TASK_SYNC_RECOVERY_ALIASES));

/** Resolve recovery alias to canonical `task-sync-*` name; passthrough otherwise. */
export function resolveTaskSyncCommandAlias(commandName: string): string {
  return TASK_SYNC_RECOVERY_ALIASES[commandName] ?? commandName;
}

export function isTaskSyncCanonicalCommand(commandName: string): boolean {
  return CANONICAL_TASK_SYNC_COMMANDS.has(commandName);
}

export function isTaskSyncRecoveryAlias(commandName: string): boolean {
  return Object.hasOwn(TASK_SYNC_RECOVERY_ALIASES, commandName);
}
