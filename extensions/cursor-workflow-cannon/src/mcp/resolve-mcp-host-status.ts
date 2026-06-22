import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findWorkflowCannonRoot } from "../workspace-detect.js";
import { resolveMcpHostStatusFromInputs } from "./mcp-config-parse-core.js";
import type { McpHostStatus } from "./mcp-status-types.js";

function readJsonFileIfExists(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    if (raw.trim().length === 0) {
      return undefined;
    }
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function projectMcpConfigPaths(workspaceRoot: string): string[] {
  return [
    path.join(workspaceRoot, ".cursor", "mcp.json"),
    path.join(workspaceRoot, ".vscode", "mcp.json")
  ];
}

function userMcpConfigPath(): string {
  return path.join(os.homedir(), ".cursor", "mcp.json");
}

/** Read MCP host config files and resolve dashboard status for the active WC workspace. */
export function resolveMcpHostStatus(workspaceRootOverride?: string | null): McpHostStatus {
  const workspaceRoot =
    (workspaceRootOverride && workspaceRootOverride.trim().length > 0
      ? workspaceRootOverride.trim()
      : findWorkflowCannonRoot()) ?? "";

  let projectConfig: unknown;
  for (const configPath of projectMcpConfigPaths(workspaceRoot || process.cwd())) {
    const parsed = readJsonFileIfExists(configPath);
    if (parsed !== undefined) {
      projectConfig = parsed;
      break;
    }
  }

  const userConfig = readJsonFileIfExists(userMcpConfigPath());

  return resolveMcpHostStatusFromInputs({
    workspaceRoot: workspaceRoot || process.cwd(),
    projectConfig,
    userConfig
  });
}
