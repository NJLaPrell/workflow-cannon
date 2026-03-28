import type { ModuleInstructionEntry } from "./module-contract.js";

/**
 * Single-row command declaration for a module: instruction catalog metadata plus optional
 * policy binding for Tier A/B `workspace-kit run` sensitivity (see `docs/maintainers/POLICY-APPROVAL.md`).
 *
 * Phase 20: policy bindings are assembled in `src/core/policy.ts` from per-module `policy-sensitive-commands.ts`
 * files so operation ids are not duplicated alongside `COMMAND_TO_OPERATION`.
 *
 * Future: merge `ModuleInstructionEntry` generation from the same manifest rows (see `docs/maintainers/module-build-guide.md`).
 */
export type ModuleCommandManifestRow = ModuleInstructionEntry & {
  /**
   * When set, this command requires JSON `policyApproval` (or session grant) for `workspace-kit run`
   * when sensitive per `isSensitiveModuleCommand` rules in `src/core/policy.ts`.
   */
  policyOperationId?: string;
};
