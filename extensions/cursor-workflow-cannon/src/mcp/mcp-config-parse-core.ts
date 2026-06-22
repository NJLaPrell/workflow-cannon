import path from "node:path";
import type { McpAgentReadMode, McpAvailability, McpConfigSource, McpHostStatus } from "./mcp-status-types.js";

export type McpServerEntry = {
  command?: unknown;
  args?: unknown;
  cwd?: unknown;
  env?: unknown;
};

export type ParsedMcpServerMatch = {
  serverName: string;
  entry: McpServerEntry;
  workspaceArg?: string;
  configSource: McpConfigSource;
};

/** Build a Cursor-ready MCP JSON snippet for the given workspace root. */
export function buildMcpSetupSnippet(workspaceRoot: string): string {
  const abs = path.resolve(workspaceRoot);
  const snippet = {
    mcpServers: {
      "workflow-cannon": {
        command: "pnpm",
        args: ["exec", "wk-mcp", "--workspace", abs],
        cwd: abs
      }
    }
  };
  return JSON.stringify(snippet, null, 2);
}

export function normalizeWorkspacePath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return "";
  }
  return path.resolve(trimmed);
}

export function pathsMatchWorkspace(a: string, b: string): boolean {
  const na = normalizeWorkspacePath(a);
  const nb = normalizeWorkspacePath(b);
  if (na.length === 0 || nb.length === 0) {
    return false;
  }
  if (process.platform === "win32") {
    return na.toLowerCase() === nb.toLowerCase();
  }
  return na === nb;
}

function readArgs(entry: McpServerEntry): string[] {
  if (!Array.isArray(entry.args)) {
    return [];
  }
  return entry.args.map((arg) => String(arg ?? "").trim()).filter((arg) => arg.length > 0);
}

function isWorkflowCannonMcpServer(serverName: string, entry: McpServerEntry): boolean {
  const nameLower = serverName.toLowerCase();
  if (nameLower.includes("workflow-cannon") || nameLower.includes("wk-mcp")) {
    return true;
  }
  const cmd = String(entry.command ?? "").toLowerCase();
  const argsJoined = readArgs(entry).join(" ").toLowerCase();
  return cmd.includes("wk-mcp") || argsJoined.includes("wk-mcp");
}

export function extractWorkspaceArgFromEntry(entry: McpServerEntry): string | undefined {
  const args = readArgs(entry);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--workspace" && i + 1 < args.length) {
      return args[i + 1];
    }
    if (arg.startsWith("--workspace=")) {
      return arg.slice("--workspace=".length);
    }
  }
  if (typeof entry.cwd === "string" && entry.cwd.trim().length > 0) {
    return entry.cwd.trim();
  }
  return undefined;
}

function parseMcpServers(raw: unknown): Record<string, McpServerEntry> | null {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return null;
  }
  const servers = (raw as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    return null;
  }
  return servers as Record<string, McpServerEntry>;
}

/** Find the first Workflow Cannon MCP server entry across project and user config. */
export function findWorkflowCannonMcpEntry(
  projectConfig: unknown,
  userConfig: unknown
): ParsedMcpServerMatch | null {
  const sources: Array<{ source: McpConfigSource; raw: unknown }> = [
    { source: "project", raw: projectConfig },
    { source: "user", raw: userConfig }
  ];
  for (const { source, raw } of sources) {
    const servers = parseMcpServers(raw);
    if (!servers) {
      continue;
    }
    for (const [serverName, entry] of Object.entries(servers)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      if (isWorkflowCannonMcpServer(serverName, entry)) {
        return {
          serverName,
          entry,
          workspaceArg: extractWorkspaceArgFromEntry(entry),
          configSource: source
        };
      }
    }
  }
  return null;
}

function guidanceForAvailability(
  availability: McpAvailability,
  workspaceRoot: string,
  configuredWorkspaceRoot?: string
): string[] {
  switch (availability) {
    case "not_configured":
      return [
        "No Workflow Cannon MCP server (`wk-mcp`) was found in project or user MCP config.",
        "Add the setup snippet below to `.cursor/mcp.json` (project) or your user MCP config.",
        "Agents should use CLI reads (`pnpm exec wk run …`) until MCP is configured — the extension does not provide live MCP access."
      ];
    case "wrong_workspace":
      return [
        configuredWorkspaceRoot
          ? `MCP is configured for ${configuredWorkspaceRoot}, but this workspace is ${workspaceRoot}.`
          : "MCP `--workspace` does not match this Workflow Cannon workspace.",
        "Update `--workspace` and `cwd` in your MCP server entry to the install root shown on this tab.",
        "Until fixed, treat agent context as CLI fallback — do not assume MCP tools target this folder."
      ];
    case "unavailable":
      return [
        "Workflow Cannon MCP appears configured for this workspace but could not be verified.",
        "Confirm `pnpm exec wk-mcp --workspace …` starts cleanly and appears in your editor MCP tool list.",
        "Use CLI JSON reads when MCP is unreachable — tool descriptions embed matching fallbacks."
      ];
    case "available":
      return [
        "MCP config matches this workspace. Connection health is managed by your editor host.",
        "Prefer MCP for read-only packets when tools are listed and fresh; fall back to CLI for mutations and policy gates."
      ];
    default:
      return [];
  }
}

function deriveAgentReadMode(availability: McpAvailability): McpAgentReadMode {
  return availability === "available" ? "mcp-first" : "cli-fallback";
}

export type ResolveMcpHostStatusInput = {
  workspaceRoot: string;
  projectConfig?: unknown;
  userConfig?: unknown;
  probe?: McpHostStatus["probe"];
};

/** Pure resolver — config inspection only unless probe is supplied by the host. */
export function resolveMcpHostStatusFromInputs(input: ResolveMcpHostStatusInput): McpHostStatus {
  const workspaceRoot = normalizeWorkspacePath(input.workspaceRoot);
  const setupSnippet = buildMcpSetupSnippet(workspaceRoot || input.workspaceRoot || ".");

  if (workspaceRoot.length === 0) {
    return {
      schemaVersion: 1,
      availability: "not_configured",
      agentReadMode: "cli-fallback",
      extensionWorkspaceRoot: input.workspaceRoot,
      configSource: "none",
      setupSnippet,
      guidance: [
        "Workflow Cannon workspace root could not be resolved.",
        "Open the repository folder containing `.workspace-kit/manifest.json`.",
        "MCP setup and agent reads require a detected workspace — use CLI only until then."
      ]
    };
  }

  const match = findWorkflowCannonMcpEntry(input.projectConfig, input.userConfig);
  if (!match) {
    return {
      schemaVersion: 1,
      availability: "not_configured",
      agentReadMode: "cli-fallback",
      extensionWorkspaceRoot: workspaceRoot,
      configSource: "none",
      setupSnippet,
      guidance: guidanceForAvailability("not_configured", workspaceRoot)
    };
  }

  const configuredWorkspaceRoot = match.workspaceArg
    ? normalizeWorkspacePath(match.workspaceArg)
    : undefined;

  if (!configuredWorkspaceRoot) {
    return {
      schemaVersion: 1,
      availability: "unavailable",
      agentReadMode: "cli-fallback",
      extensionWorkspaceRoot: workspaceRoot,
      configuredWorkspaceRoot: undefined,
      configSource: match.configSource,
      serverName: match.serverName,
      setupSnippet,
      guidance: [
        `MCP server "${match.serverName}" is registered but has no --workspace or cwd.`,
        "Add an explicit `--workspace` argument pointing at this install root.",
        "Agents must use CLI fallback until workspace binding is explicit."
      ]
    };
  }

  if (!pathsMatchWorkspace(configuredWorkspaceRoot, workspaceRoot)) {
    return {
      schemaVersion: 1,
      availability: "wrong_workspace",
      agentReadMode: "cli-fallback",
      extensionWorkspaceRoot: workspaceRoot,
      configuredWorkspaceRoot,
      configSource: match.configSource,
      serverName: match.serverName,
      setupSnippet,
      guidance: guidanceForAvailability("wrong_workspace", workspaceRoot, configuredWorkspaceRoot)
    };
  }

  const command = String(match.entry.command ?? "").trim();
  if (command.length === 0) {
    return {
      schemaVersion: 1,
      availability: "unavailable",
      agentReadMode: "cli-fallback",
      extensionWorkspaceRoot: workspaceRoot,
      configuredWorkspaceRoot,
      configSource: match.configSource,
      serverName: match.serverName,
      setupSnippet,
      guidance: guidanceForAvailability("unavailable", workspaceRoot, configuredWorkspaceRoot)
    };
  }

  let availability: McpAvailability = "available";
  if (input.probe?.attempted && input.probe.healthy === false) {
    availability = "unavailable";
  }

  return {
    schemaVersion: 1,
    availability,
    agentReadMode: deriveAgentReadMode(availability),
    extensionWorkspaceRoot: workspaceRoot,
    configuredWorkspaceRoot,
    configSource: match.configSource,
    serverName: match.serverName,
    probe: input.probe,
    setupSnippet,
    guidance: guidanceForAvailability(availability, workspaceRoot, configuredWorkspaceRoot)
  };
}
