/**
 * Repo-relative remediation hints for workspace-kit run JSON failures (Phase 52 / T625).
 * Paths are stable across npm installs when resolved from the published package root.
 */

export const CLI_REMEDIATION_INSTRUCTIONS = {
  runTransition: "src/modules/task-engine/instructions/run-transition.md",
  createTask: "src/modules/task-engine/instructions/create-task.md",
  updateTask: "src/modules/task-engine/instructions/update-task.md",
  dashboardSummary: "src/modules/task-engine/instructions/dashboard-summary.md",
  createWishlist: "src/modules/task-engine/instructions/create-wishlist.md",
  archiveTask: "src/modules/task-engine/instructions/archive-task.md",
  addDependency: "src/modules/task-engine/instructions/add-dependency.md",
  generateRecommendations: "src/modules/improvement/instructions/generate-recommendations.md"
} as const;

export const CLI_REMEDIATION_DOCS = {
  policyApproval: "docs/maintainers/POLICY-APPROVAL.md",
  agentCliMap: "docs/maintainers/AGENT-CLI-MAP.md",
  planningGenerationAdr: "docs/maintainers/adrs/ADR-planning-generation-optimistic-concurrency.md",
  remediationContract: "docs/maintainers/adrs/ADR-cli-error-remediation-contract.md"
} as const;

/** Stable codes surfaced on doctor --agent-instruction-surface for agents. */
export type ErrorRemediationCatalogEntry = {
  code: string;
  instructionPath?: string;
  docPath?: string;
};

export function buildErrorRemediationCatalog(): ErrorRemediationCatalogEntry[] {
  return [
    {
      code: "policy-denied",
      docPath: CLI_REMEDIATION_DOCS.policyApproval,
      instructionPath: undefined
    },
    {
      code: "planning-generation-required",
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.runTransition,
      docPath: CLI_REMEDIATION_DOCS.planningGenerationAdr
    },
    {
      code: "planning-generation-mismatch",
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.runTransition,
      docPath: CLI_REMEDIATION_DOCS.planningGenerationAdr
    },
    {
      code: "invalid-run-args",
      docPath: CLI_REMEDIATION_DOCS.agentCliMap,
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.runTransition
    },
    {
      code: "unknown-command",
      docPath: CLI_REMEDIATION_DOCS.agentCliMap
    },
    {
      code: "generate-failed",
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.generateRecommendations
    },
    {
      code: "invalid-task-schema",
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.createWishlist
    },
    {
      code: "peer-module-disabled",
      docPath: CLI_REMEDIATION_DOCS.agentCliMap
    }
  ];
}
