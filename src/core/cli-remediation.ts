/**
 * Repo-relative remediation hints for workspace-kit run JSON failures (Phase 52 / T625).
 * Agent-facing paths use .ai/ and src/modules/.../instructions/; maintainer mirrors are optional docAnchors.
 */

import type { CliRemediation } from "../contracts/module-contract.js";

export const CLI_REMEDIATION_INSTRUCTIONS = {
  runTransition: "src/modules/task-engine/instructions/run-transition.md",
  createTask: "src/modules/task-engine/instructions/create-task.md",
  applyTaskBatch: "src/modules/task-engine/instructions/apply-task-batch.md",
  persistPlanningExecutionDrafts:
    "src/modules/task-engine/instructions/persist-planning-execution-drafts.md",
  updateTask: "src/modules/task-engine/instructions/update-task.md",
  dashboardSummary: "src/modules/task-engine/instructions/dashboard-summary.md",
  createWishlist: "src/modules/task-engine/instructions/create-wishlist.md",
  archiveTask: "src/modules/task-engine/instructions/archive-task.md",
  addDependency: "src/modules/task-engine/instructions/add-dependency.md",
  generateRecommendations: "src/modules/improvement/instructions/generate-recommendations.md",
  synthesizeTranscriptChurn: "src/modules/task-engine/instructions/synthesize-transcript-churn.md",
  dismissPhaseNote: "src/modules/task-engine/instructions/dismiss-phase-note.md",
  supersedePhaseNote: "src/modules/task-engine/instructions/supersede-phase-note.md",
  completionPreflight: "src/modules/task-engine/instructions/completion-preflight.md",
  harvestDeliveryEvidence: "src/modules/task-engine/instructions/harvest-delivery-evidence.md",
  waitForPrChecks: "src/modules/task-engine/instructions/wait-for-pr-checks.md",
  recommendValidation: "src/modules/task-engine/instructions/recommend-validation.md",
  improvementDedupeExplain: "src/modules/task-engine/instructions/improvement-dedupe-explain.md",
  improvementWorkflowSummary: "src/modules/task-engine/instructions/improvement-workflow-summary.md",
  agentMutationPlan: "src/modules/task-engine/instructions/agent-mutation-plan.md",
  getWorkspaceStatus: "src/modules/task-engine/instructions/get-workspace-status.md",
} as const;

/** Primary agent doc paths (`.ai/`). Use as `remediation.docPath` for routine agent work. */
export const CLI_REMEDIATION_DOCS = {
  policyApproval: ".ai/POLICY-APPROVAL.md",
  agentCliMap: ".ai/AGENT-CLI-MAP.md",
  agentCliMapExtended: ".ai/AGENT-CLI-MAP.extended.md",
  planningGeneration: ".ai/AGENT-CLI-MAP.extended.md",
  remediationContract: ".ai/runbooks/agent-task-engine-ergonomics.md",
  workspaceStatus: ".ai/runbooks/workspace-status-sqlite.md",
  taskPersistence: ".ai/runbooks/task-persistence-operator.md"
} as const;

/** Maintainer-depth mirrors; surface only as secondary `docAnchors` when needed. */
export const CLI_REMEDIATION_MAINTAINER_DOCS = {
  policyApproval: "docs/maintainers/POLICY-APPROVAL.md",
  agentCliMap: "docs/maintainers/AGENT-CLI-MAP.md",
  planningGenerationAdr: "docs/maintainers/adrs/ADR-planning-generation-optimistic-concurrency.md",
  remediationContract: "docs/maintainers/adrs/ADR-cli-error-remediation-contract.md",
  workspaceStatus: "docs/maintainers/runbooks/workspace-status-sqlite.md",
  taskPersistence: "docs/maintainers/runbooks/task-persistence-operator.md",
  runtimeRunArgsPilot: "docs/maintainers/adrs/ADR-runtime-run-args-validation-pilot.md"
} as const;

/** Stable codes surfaced on doctor --agent-instruction-surface for agents. */
export type ErrorRemediationCatalogEntry = {
  code: string;
  instructionPath?: string;
  docPath?: string;
  docAnchors?: string[];
};

export function buildAgentCliRemediation(parts: {
  instructionPath?: string;
  agentDocPath?: string;
  maintainerDocPath?: string;
}): CliRemediation {
  const remediation: CliRemediation = {};
  if (parts.instructionPath) {
    remediation.instructionPath = parts.instructionPath;
  }
  if (parts.agentDocPath) {
    remediation.docPath = parts.agentDocPath;
  }
  if (parts.maintainerDocPath) {
    remediation.docAnchors = [parts.maintainerDocPath];
  }
  return remediation;
}

export function buildErrorRemediationCatalog(): ErrorRemediationCatalogEntry[] {
  return [
    {
      code: "policy-denied",
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.agentMutationPlan,
      docPath: CLI_REMEDIATION_DOCS.policyApproval,
      docAnchors: [CLI_REMEDIATION_MAINTAINER_DOCS.policyApproval]
    },
    {
      code: "phase-note-critical-policy-approval-required",
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.dismissPhaseNote,
      docPath: CLI_REMEDIATION_DOCS.policyApproval,
      docAnchors: [CLI_REMEDIATION_MAINTAINER_DOCS.policyApproval]
    },
    {
      code: "planning-generation-required",
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.runTransition,
      docPath: CLI_REMEDIATION_DOCS.planningGeneration,
      docAnchors: [CLI_REMEDIATION_MAINTAINER_DOCS.planningGenerationAdr]
    },
    {
      code: "planning-generation-mismatch",
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.runTransition,
      docPath: CLI_REMEDIATION_DOCS.planningGeneration,
      docAnchors: [CLI_REMEDIATION_MAINTAINER_DOCS.planningGenerationAdr]
    },
    {
      code: "invalid-run-args",
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.runTransition,
      docPath: CLI_REMEDIATION_DOCS.agentCliMap,
      docAnchors: [CLI_REMEDIATION_MAINTAINER_DOCS.agentCliMap]
    },
    {
      code: "unknown-command",
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.agentMutationPlan,
      docPath: CLI_REMEDIATION_DOCS.agentCliMap,
      docAnchors: [CLI_REMEDIATION_MAINTAINER_DOCS.agentCliMap]
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
      docPath: CLI_REMEDIATION_DOCS.agentCliMap,
      docAnchors: [CLI_REMEDIATION_MAINTAINER_DOCS.agentCliMap]
    },
    {
      code: "kit-phase-config-workspace-status-mismatch",
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.getWorkspaceStatus,
      docPath: CLI_REMEDIATION_DOCS.workspaceStatus,
      docAnchors: [CLI_REMEDIATION_MAINTAINER_DOCS.workspaceStatus]
    },
    {
      code: "kit-workspace-status-row-missing",
      docPath: CLI_REMEDIATION_DOCS.taskPersistence,
      docAnchors: [CLI_REMEDIATION_MAINTAINER_DOCS.taskPersistence]
    }
  ];
}
