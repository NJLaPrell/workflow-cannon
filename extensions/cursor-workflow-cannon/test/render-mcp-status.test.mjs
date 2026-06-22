import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveMcpHostStatusFromInputs } from "../dist/mcp/mcp-config-parse-core.js";
import { renderMcpStatusSectionHtml } from "../dist/views/dashboard/render-mcp-status.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function statusFromFixture(fixtureName, workspaceRoot) {
  const projectConfig = JSON.parse(
    readFileSync(path.join(__dirname, "fixtures/mcp-config", fixtureName), "utf8")
  );
  return resolveMcpHostStatusFromInputs({ workspaceRoot, projectConfig });
}

test("renderMcpStatusSectionHtml includes data-wc-mcp-status for availability states", () => {
  const notConfigured = resolveMcpHostStatusFromInputs({
    workspaceRoot: "/tmp/wc-workspace",
    projectConfig: { mcpServers: {} }
  });
  const wrongWorkspace = statusFromFixture("project-wrong-workspace.json", "/tmp/wc-workspace");

  for (const [expectedAttr, status] of [
    ["not_configured", notConfigured],
    ["wrong_workspace", wrongWorkspace]
  ]) {
    const html = renderMcpStatusSectionHtml(status);
    assert.match(html, /data-wc-mcp-status/);
    assert.match(html, new RegExp(`data-wc-mcp-status="${expectedAttr}"`));
    assert.match(html, /dash-status-mcp/);
  }
});

test("renderMcpStatusSectionHtml shows MCP-first and configured copy when available", () => {
  const status = statusFromFixture("project-configured.json", "/tmp/wc-workspace");
  const html = renderMcpStatusSectionHtml(status);
  assert.match(html, /MCP-first/);
  assert.match(html, /Configured for this workspace/);
  assert.match(html, /wc-mcp-setup-snippet/);
});

test("renderMcpStatusSectionHtml empty state does not imply live MCP access", () => {
  const html = renderMcpStatusSectionHtml(null);
  assert.match(html, /Checking configuration/i);
  assert.match(html, /does not invoke MCP tools/i);
});

test("renderMcpStatusSectionHtml not_configured renders explicit guidance", () => {
  const status = resolveMcpHostStatusFromInputs({
    workspaceRoot: "/tmp/wc-workspace",
    projectConfig: undefined,
    userConfig: undefined
  });
  const html = renderMcpStatusSectionHtml(status);
  assert.match(html, /Not configured|not configured/i);
  assert.match(html, /wc-mcp-guidance/);
  assert.match(html, /CLI/i);
});
