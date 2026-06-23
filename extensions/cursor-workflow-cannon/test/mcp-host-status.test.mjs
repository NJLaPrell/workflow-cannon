import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMcpSetupSnippet,
  findWorkflowCannonMcpEntry,
  pathsMatchWorkspace,
  resolveMcpHostStatusFromInputs
} from "../dist/mcp/mcp-config-parse-core.js";
import {
  formatMcpAgentReadModeLabel,
  formatMcpAvailabilityLabel
} from "../dist/mcp/mcp-status-types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, "fixtures/mcp-config");

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(fixtureDir, name), "utf8"));
}

test("buildMcpSetupSnippet includes absolute workspace path", () => {
  const snippet = buildMcpSetupSnippet("/tmp/wc-workspace");
  assert.match(snippet, /wk-mcp/);
  assert.match(snippet, /\/tmp\/wc-workspace/);
});

test("findWorkflowCannonMcpEntry prefers project config", () => {
  const project = loadFixture("project-configured.json");
  const match = findWorkflowCannonMcpEntry(project, null);
  assert.equal(match?.serverName, "workflow-cannon");
  assert.equal(match?.configSource, "project");
  assert.equal(match?.workspaceArg, "/tmp/wc-workspace");
});

test("resolveMcpHostStatusFromInputs: not_configured when no servers", () => {
  const status = resolveMcpHostStatusFromInputs({
    workspaceRoot: "/tmp/wc-workspace",
    projectConfig: { mcpServers: {} },
    userConfig: undefined
  });
  assert.equal(status.availability, "not_configured");
  assert.equal(status.agentReadMode, "cli-fallback");
  assert.ok(status.guidance.some((line) => /does not provide live MCP access/i.test(line)));
});

test("resolveMcpHostStatusFromInputs: available when workspace matches", () => {
  const status = resolveMcpHostStatusFromInputs({
    workspaceRoot: "/tmp/wc-workspace",
    projectConfig: loadFixture("project-configured.json")
  });
  assert.equal(status.availability, "available");
  assert.equal(status.agentReadMode, "mcp-first");
});

test("resolveMcpHostStatusFromInputs: wrong_workspace when paths differ", () => {
  const status = resolveMcpHostStatusFromInputs({
    workspaceRoot: "/tmp/wc-workspace",
    projectConfig: loadFixture("project-wrong-workspace.json")
  });
  assert.equal(status.availability, "wrong_workspace");
  assert.equal(status.agentReadMode, "cli-fallback");
  assert.ok(status.guidance.some((line) => /CLI fallback/i.test(line)));
});

test("resolveMcpHostStatusFromInputs: unavailable when probe fails", () => {
  const status = resolveMcpHostStatusFromInputs({
    workspaceRoot: "/tmp/wc-workspace",
    projectConfig: loadFixture("project-configured.json"),
    probe: { attempted: true, healthy: false, error: "initialize timeout" }
  });
  assert.equal(status.availability, "unavailable");
  assert.equal(status.agentReadMode, "cli-fallback");
});

test("pathsMatchWorkspace is case-insensitive on Windows", () => {
  if (process.platform !== "win32") {
    assert.equal(pathsMatchWorkspace("/tmp/A", "/tmp/a"), false);
    return;
  }
  assert.equal(pathsMatchWorkspace("C:\\Proj", "c:\\proj"), true);
});

test("formatters expose non-misleading labels", () => {
  assert.match(formatMcpAvailabilityLabel("available"), /Configured/i);
  assert.equal(formatMcpAgentReadModeLabel("mcp-first"), "MCP-first");
  assert.equal(formatMcpAgentReadModeLabel("cli-fallback"), "CLI fallback");
});
