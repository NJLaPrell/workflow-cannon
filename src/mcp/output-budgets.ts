export interface McpOutputBudgetOptions {
  maxToolResponseBytes?: number;
}

/** Minimum enforced output budget for any MCP tool or resource. */
export const MCP_MIN_OUTPUT_BYTE_BUDGET = 1_000;

/** Fallback when a tool name is missing from the explicit budget map (should not happen). */
export const MCP_DEFAULT_OUTPUT_BYTE_BUDGET = 24_000;

/** Primary planner bootstrap read tool budget (architecture D3). */
export const MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET = 20 * 1024;

/** Satellite planner read tool budget (architecture D3). */
export const MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET = 16 * 1024;

/**
 * v1 planner MCP read tools registered before tool handlers ship (WBS-6+).
 * Budget map must include every name before server registration merges.
 */
export const PLANNER_MCP_READ_TOOL_NAMES = [
  "workflow-cannon.planner-packet",
  "workflow-cannon.list-ideas",
  "workflow-cannon.get-plan-artifact",
  "workflow-cannon.plan-review-packet",
  "workflow-cannon.finalize-preview-packet"
] as const;

export type PlannerMcpReadToolName = (typeof PLANNER_MCP_READ_TOOL_NAMES)[number];

export interface McpExpansionRef {
  kind: "cli" | "workspace-file";
  command?: string;
  workspaceRelativePath?: string;
}

/**
 * Explicit per-tool output byte budgets. Every MCP tool must appear here.
 */
export const MCP_TOOL_OUTPUT_BYTE_BUDGETS: Readonly<Record<string, number>> = {
  "workflow-cannon.agent_start": 6 * 1024,
  "workflow-cannon.capabilities": 12 * 1024,
  "workflow-cannon.phase-release-orchestration-state": 16 * 1024,
  "workflow-cannon.agent-execution-packet": 20 * 1024,
  "workflow-cannon.assignment-reconciliation-preflight": 16 * 1024,
  "workflow-cannon.phase-drain-delta": 12 * 1024,
  "workflow-cannon.phase-release-state": 18 * 1024,
  "workflow-cannon.release-closeout-result": 18 * 1024,
  "workflow-cannon.cae-guidance-preview": 8 * 1024,
  "workflow-cannon.cae-evaluate": 8 * 1024,
  "workflow-cannon.cae-explain": 8 * 1024,
  "workflow-cannon.cae-get-trace": 8 * 1024,
  "workflow-cannon.cae-recent-traces": 8 * 1024,
  "workflow-cannon.memory-list": 8 * 1024,
  "workflow-cannon.memory-precedence": 8 * 1024,
  // Planner read tools (v1 — handlers register in WBS-6+; budgets per architecture D3)
  "workflow-cannon.planner-packet": MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET,
  "workflow-cannon.list-ideas": MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET,
  "workflow-cannon.get-plan-artifact": MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET,
  "workflow-cannon.plan-review-packet": MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET,
  "workflow-cannon.finalize-preview-packet": MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET,
  // Mutation tools (opt-in via WORKFLOW_CANNON_MCP_MUTATION_TOOLS=1)
  "workflow-cannon.run-transition": 12 * 1024,
  "workflow-cannon.write-memory": 8 * 1024
};

/**
 * Explicit per-resource output byte budgets. Every static MCP resource URI must appear here.
 */
export const MCP_RESOURCE_OUTPUT_BYTE_BUDGETS: Readonly<Record<string, number>> = {
  "workflow-cannon://resources/mcp-freshness-policy": 12 * 1024,
  "workflow-cannon://resources/mcp-adapter-boundary": 12 * 1024
};

export function resolveToolOutputByteBudget(toolName: string, options: McpOutputBudgetOptions = {}): number {
  if (typeof options.maxToolResponseBytes === "number") {
    return Math.max(MCP_MIN_OUTPUT_BYTE_BUDGET, options.maxToolResponseBytes);
  }
  const configured = MCP_TOOL_OUTPUT_BYTE_BUDGETS[toolName];
  return Math.max(MCP_MIN_OUTPUT_BYTE_BUDGET, configured ?? MCP_DEFAULT_OUTPUT_BYTE_BUDGET);
}

export function resolveResourceOutputByteBudget(uri: string): number {
  const configured = MCP_RESOURCE_OUTPUT_BYTE_BUDGETS[uri];
  return Math.max(MCP_MIN_OUTPUT_BYTE_BUDGET, configured ?? MCP_DEFAULT_OUTPUT_BYTE_BUDGET);
}

export function listToolOutputByteBudgets(): Record<string, number> {
  return { ...MCP_TOOL_OUTPUT_BYTE_BUDGETS };
}

export function listResourceOutputByteBudgets(): Record<string, number> {
  return { ...MCP_RESOURCE_OUTPUT_BYTE_BUDGETS };
}

export function buildCliExpansionRef(command: string): McpExpansionRef {
  return { kind: "cli", command };
}

export function buildWorkspaceFileExpansionRef(workspaceRelativePath: string): McpExpansionRef {
  return { kind: "workspace-file", workspaceRelativePath };
}

export function summarizeOversizedText(text: string, maxChars = 400): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}…[truncated:${text.length - maxChars}:additional-chars]`;
}
