import type { ModuleInstructionEntry } from "./module-contract.js";

/**
 * Row shape for builtin commands (see `builtin-run-command-manifest.json` + `builtin-run-command-manifest.ts`).
 * Module registrations use `builtinInstructionEntriesForModule()`; policy and response-template layers read the same JSON.
 */
export type ModuleCommandManifestRow = ModuleInstructionEntry & {
  moduleId: string;
  /**
   * When set, this command requires JSON `policyApproval` (or session grant) for `workspace-kit run`
   * when sensitive per `isSensitiveModuleCommand` rules in `src/core/policy.ts`.
   */
  policyOperationId?: string;
  /**
   * When set, resolved before global `responseTemplates.defaultTemplateId` (after explicit args and `commandOverrides`).
   */
  defaultResponseTemplateId?: string;
};
