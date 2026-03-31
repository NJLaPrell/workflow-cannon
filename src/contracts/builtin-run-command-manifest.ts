import type { ModuleInstructionEntry } from "./module-contract.js";
import manifestJson from "./builtin-run-command-manifest.json" with { type: "json" };

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
  policyOperationId?: string;
  defaultResponseTemplateId?: string;
  requiresPeers?: string[];
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
