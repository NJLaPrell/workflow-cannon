import type { ModuleCommandRouter } from "../core/module-command-router.js";
import {
  isSensitiveModuleCommandForEffective,
  resolvePolicyOperationIdForCommand
} from "../core/policy.js";

export function buildRunCommandCatalogPayload(
  router: ModuleCommandRouter,
  effective: Record<string, unknown>
): Record<string, unknown> {
  const commands = router.listCommands().map((cmd) => ({
    name: cmd.name,
    moduleId: cmd.moduleId,
    summary: cmd.description ?? null,
    instructionPath: cmd.instructionFile,
    schemaOnlyHint: `pnpm exec wk run ${cmd.name} --schema-only '{}'`,
    jsonApprovalRequired: isSensitiveModuleCommandForEffective(cmd.name, {}, effective),
    policyOperationId: resolvePolicyOperationIdForCommand(cmd.name, effective)
  }));
  return {
    ok: true,
    code: "run-command-catalog",
    schemaVersion: 1,
    data: {
      canonicalInvokeHint: "pnpm exec wk run",
      discoverSchemaOnly: "pnpm exec wk run <command> --schema-only '{}'",
      snippetIndex: ".ai/agent-cli-snippets/INDEX.json",
      commands
    }
  };
}
