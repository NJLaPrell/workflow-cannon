import {
  formatMcpAgentReadModeLabel,
  formatMcpAvailabilityLabel,
  type McpHostStatus
} from "../../mcp/mcp-status-types.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function availabilityPillClass(availability: McpHostStatus["availability"]): string {
  switch (availability) {
    case "available":
      return "wc-mcp-pill wc-mcp-pill--available";
    case "wrong_workspace":
      return "wc-mcp-pill wc-mcp-pill--wrong";
    case "unavailable":
      return "wc-mcp-pill wc-mcp-pill--unavailable";
    default:
      return "wc-mcp-pill wc-mcp-pill--not-configured";
  }
}

function readModePillClass(mode: McpHostStatus["agentReadMode"]): string {
  return mode === "mcp-first" ? "wc-mcp-pill wc-mcp-pill--mcp-first" : "wc-mcp-pill wc-mcp-pill--cli-fallback";
}

function kvRow(label: string, val: string): string {
  return (
    '<div class="wc-status-kv"><span class="wc-status-kv-label">' +
    escapeHtml(label) +
    '</span><span class="wc-status-kv-val">' +
    val +
    "</span></div>"
  );
}

function renderGuidanceList(guidance: string[]): string {
  if (guidance.length === 0) {
    return "";
  }
  const items = guidance.map((line) => "<li>" + escapeHtml(line) + "</li>").join("");
  return '<ul class="wc-mcp-guidance muted">' + items + "</ul>";
}

/** Inner MCP status card body (embedded in Status tab). */
export function renderMcpStatusEmbed(status: McpHostStatus): string {
  const availabilityLabel = formatMcpAvailabilityLabel(status.availability);
  const readModeLabel = formatMcpAgentReadModeLabel(status.agentReadMode);
  const configSource =
    status.configSource && status.configSource !== "none"
      ? status.configSource === "project"
        ? "Project MCP config"
        : "User MCP config"
      : "No MCP config found";

  const serverLine =
    status.serverName && status.serverName.trim().length > 0
      ? kvRow("Server entry", "<code>" + escapeHtml(status.serverName) + "</code>")
      : "";

  const configuredRoot =
    status.configuredWorkspaceRoot && status.configuredWorkspaceRoot.trim().length > 0
      ? kvRow("Configured workspace", "<code>" + escapeHtml(status.configuredWorkspaceRoot) + "</code>")
      : "";

  const probeLine =
    status.probe?.attempted === true
      ? kvRow(
          "Health probe",
          escapeHtml(status.probe.healthy ? "Initialize OK" : status.probe.error ?? "Failed")
        )
      : kvRow("Health probe", '<span class="muted">Not run — config-only check</span>');

  return (
    '<div class="dash-mcp-status dash-mcp-status--embedded" data-wc-mcp-status="' +
    escapeHtmlAttr(status.availability) +
    '" aria-label="Workflow Cannon MCP status">' +
    "<p><b>MCP</b> " +
    '<span class="' +
    availabilityPillClass(status.availability) +
    '" role="status">' +
    escapeHtml(availabilityLabel) +
    "</span> " +
    '<span class="' +
    readModePillClass(status.agentReadMode) +
    '" role="status">' +
    escapeHtml(readModeLabel) +
    "</span></p>" +
    '<div class="wc-status-kv-block">' +
    kvRow("Agent read mode", escapeHtml(readModeLabel)) +
    kvRow("Config source", escapeHtml(configSource)) +
    kvRow("Extension workspace", "<code>" + escapeHtml(status.extensionWorkspaceRoot) + "</code>") +
    configuredRoot +
    serverLine +
    probeLine +
    "</div>" +
    renderGuidanceList(status.guidance) +
    '<details class="wc-mcp-setup-details">' +
    "<summary>Copy MCP setup snippet</summary>" +
    '<pre class="wc-mcp-setup-snippet"><code>' +
    escapeHtml(status.setupSnippet) +
    "</code></pre>" +
    '<p class="muted">Paste into <code>.cursor/mcp.json</code> (project) or your user MCP config. See <code>.ai/MCP-SETUP.md</code> in the repo for platform steps.</p>' +
    "</details>" +
    "</div>"
  );
}

/** Status tab section wrapper for MCP host posture. */
export function renderMcpStatusSectionHtml(status?: McpHostStatus | null): string {
  if (!status) {
    return (
      '<section class="dash-card dash-status-mcp" aria-label="MCP setup and status">' +
      '<p><b>MCP</b> <span class="muted">Checking configuration…</span></p>' +
      '<p class="muted">The extension inspects local MCP config only — it does not invoke MCP tools from this panel.</p>' +
      "</section>"
    );
  }
  return (
    '<section class="dash-card dash-status-mcp" aria-label="MCP setup and status">' + renderMcpStatusEmbed(status) + "</section>"
  );
}
