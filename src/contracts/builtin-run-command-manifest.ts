import type { ModuleInstructionEntry } from "./module-contract.js";
import manifestJson from "./builtin-run-command-manifest.json" with { type: "json" };

export type CommandExecutionClass =
  | "read_hot"
  | "read"
  | "mutation"
  | "operator"
  | "debug";

export type CommandExecutionPolicy = {
  class: CommandExecutionClass;
  allowAutoCheckpoint: boolean;
  allowCaePreflight: boolean;
  allowLifecycleHooks: boolean;
  persistRunLog: boolean;
  requiresPolicy: boolean;
  storeOpenMode?: "none" | "readOnly" | "full";
};

/**
 * Single source of truth for shipped `workspace-kit run` commands: module ownership, instruction file,
 * optional policy operation id, and optional default response-template id (before global config default).
 *
 * Data: `builtin-run-command-manifest.json` (validated by `scripts/check-builtin-command-manifest.mjs`).
 */
export type BuiltinRunCommandManifestRow = {
  moduleId: string;
  name: string;
  file: string;
  description?: string;
  /**
   * Shipped policy classification for `workspace-kit run` (validated in CI).
   * Must stay aligned with `isSensitiveModuleCommand` / dry-run rules in `src/core/policy.ts`.
   */
  policySensitivity: "non-sensitive" | "sensitive" | "sensitive-with-dryrun";
  policyOperationId?: string;
  defaultResponseTemplateId?: string;
  requiresPeers?: string[];
  executionClass?: CommandExecutionClass;
};

export const BUILTIN_RUN_COMMAND_MANIFEST = manifestJson as BuiltinRunCommandManifestRow[];

const defaultTemplateByCommand = (() => {
  const m = new Map<string, string>();
  for (const row of BUILTIN_RUN_COMMAND_MANIFEST) {
    const id = row.defaultResponseTemplateId?.trim();
    if (id) {
      m.set(row.name, id);
    }
  }
  return m;
})();

/** Default response template id for a command (manifest layer), if declared. */
export function getBuiltinCommandDefaultTemplateId(commandName: string): string | undefined {
  return defaultTemplateByCommand.get(commandName);
}

/** Manifest row for one shipped `workspace-kit run` command, if declared. */
export function getBuiltinRunCommandManifestRow(
  commandName: string
): BuiltinRunCommandManifestRow | undefined {
  const ALIASES: Record<string, string> = {
    "task-state-status": "task-sync-status",
    "task-state-hydrate": "task-sync-hydrate",
    "task-state-init": "task-sync-init",
    "task-state-verify": "task-sync-verify",
    "task-state-publish": "task-sync-publish",
    "task-state-snapshot": "task-sync-snapshot",
    "task-state-compact": "task-sync-compact"
  };
  const resolved = ALIASES[commandName] ?? commandName;
  return BUILTIN_RUN_COMMAND_MANIFEST.find((row) => row.name === resolved);
}

/** Instruction catalog entries for one module — use in `WorkflowModule.registration.instructions.entries`. */
export function builtinInstructionEntriesForModule(moduleId: string): ModuleInstructionEntry[] {
  return BUILTIN_RUN_COMMAND_MANIFEST.filter((r) => r.moduleId === moduleId).map((r) => {
    const e: ModuleInstructionEntry = {
      name: r.name,
      file: r.file,
      description: r.description
    };
    if (r.requiresPeers?.length) {
      e.requiresPeers = [...r.requiresPeers];
    }
    return e;
  });
}

export function resolveCommandExecutionPolicy(commandName: string): CommandExecutionPolicy {
  const row = getBuiltinRunCommandManifestRow(commandName);
  const cls = row?.executionClass ?? "mutation";

  switch (cls) {
    case "read_hot":
      return {
        class: "read_hot",
        allowAutoCheckpoint: false,
        allowCaePreflight: false,
        allowLifecycleHooks: false,
        persistRunLog: false,
        requiresPolicy: false,
        storeOpenMode: "readOnly"
      };
    case "read":
      return {
        class: "read",
        allowAutoCheckpoint: false,
        allowCaePreflight: true,
        allowLifecycleHooks: true,
        persistRunLog: true,
        requiresPolicy: true,
        storeOpenMode: "readOnly"
      };
    case "operator":
      return {
        class: "operator",
        allowAutoCheckpoint: true,
        allowCaePreflight: true,
        allowLifecycleHooks: true,
        persistRunLog: true,
        requiresPolicy: true,
        storeOpenMode: "full"
      };
    case "debug":
      return {
        class: "debug",
        allowAutoCheckpoint: false,
        allowCaePreflight: true,
        allowLifecycleHooks: true,
        persistRunLog: false,
        requiresPolicy: false,
        storeOpenMode: "readOnly"
      };
    case "mutation":
    default:
      return {
        class: "mutation",
        allowAutoCheckpoint: true,
        allowCaePreflight: true,
        allowLifecycleHooks: true,
        persistRunLog: true,
        requiresPolicy: true,
        storeOpenMode: "full"
      };
  }
}

