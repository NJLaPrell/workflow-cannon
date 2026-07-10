import type { DashboardAgentStatusKind } from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";

/**
 * Classify the Cursor orchestrator lease from transcript bridge context.
 *
 * Parent transcript mtime alone must NOT imply `working_task` — Cursor often
 * touches the parent JSONL after a turn finishes, which previously flashed the
 * dashboard as "active" for up to `activeSubagentWindowSeconds` with no agents.
 */
export function classifyOrchestratorActivityKind(input: {
  activeSubagentCount: number;
}): DashboardAgentStatusKind {
  return input.activeSubagentCount > 0 ? "delegating_task" : "awaiting_instruction";
}
