export type McpAvailability = "available" | "unavailable" | "not_configured" | "wrong_workspace";

export type McpAgentReadMode = "mcp-first" | "cli-fallback";

export type McpConfigSource = "project" | "user" | "none";

export type McpHostStatus = {
  schemaVersion: 1;
  availability: McpAvailability;
  agentReadMode: McpAgentReadMode;
  extensionWorkspaceRoot: string;
  configuredWorkspaceRoot?: string;
  configSource?: McpConfigSource;
  serverName?: string;
  probe?: {
    attempted: boolean;
    healthy?: boolean;
    error?: string;
  };
  setupSnippet: string;
  guidance: string[];
};

/** Operator-facing availability label — never implies live host connection. */
export function formatMcpAvailabilityLabel(availability: McpAvailability): string {
  switch (availability) {
    case "available":
      return "Configured for this workspace";
    case "unavailable":
      return "Unavailable";
    case "not_configured":
      return "Not configured";
    case "wrong_workspace":
      return "Wrong workspace";
    default:
      return "Unknown";
  }
}

export function formatMcpAgentReadModeLabel(mode: McpAgentReadMode): string {
  return mode === "mcp-first" ? "MCP-first" : "CLI fallback";
}
