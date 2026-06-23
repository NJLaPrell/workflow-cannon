#!/usr/bin/env node

import path from "node:path";

import { runMcpStdioServer } from "./server.js";
import { resolveMcpDebugLogging } from "./debug-logging.js";

const workspacePath = resolveWorkspacePath(process.argv.slice(2), process.env);
const debugLogging = resolveMcpDebugLogging(process.env);

runMcpStdioServer({ workspacePath, debugLogging }).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

function resolveWorkspacePath(argv: string[], env: NodeJS.ProcessEnv): string {
  const workspaceArg = readWorkspaceArg(argv);
  return path.resolve(workspaceArg ?? env.WORKFLOW_CANNON_MCP_WORKSPACE ?? process.cwd());
}

function readWorkspaceArg(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--workspace" || value === "--workspace-root") {
      return argv[index + 1];
    }
    if (value.startsWith("--workspace=")) {
      return value.slice("--workspace=".length);
    }
    if (value.startsWith("--workspace-root=")) {
      return value.slice("--workspace-root=".length);
    }
  }
  return undefined;
}
