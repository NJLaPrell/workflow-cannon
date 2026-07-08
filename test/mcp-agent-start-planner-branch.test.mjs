/** T100826 — agent_start lightweight planner routing branch (WBS-11 / D2). */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  handleMcpRequest,
  MCP_TOOL_OUTPUT_BYTE_BUDGETS,
  PLANNER_MCP_READ_TOOL_NAMES,
  PLANNER_PACKET_TOOL_NAME
} from "../dist/mcp/index.js";

const AGENT_START_TOOL_NAME = "workflow-cannon.agent_start";
const PACKET_FIELD_KEYS = new Set([
  "packetKind",
  "agentDirective",
  "wbsPreview",
  "idea",
  "session",
  "recommendedNextCommand",
  "planRef",
  "goldenPathStage"
]);

async function callAgentStart(options = {}) {
  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "agent-start-planner-branch",
      method: "tools/call",
      params: {
        name: AGENT_START_TOOL_NAME,
        arguments: {}
      }
    },
    options
  );
  assert.equal(response?.result.isError, false);
  return JSON.parse(response?.result.content.at(0).text);
}

test("agent_start exposes workflows.planner routing when ideas module is enabled", async () => {
  const payload = await callAgentStart();
  const planner = payload.workflows?.planner;
  assert.ok(planner, "workflows.planner branch is present");
  assert.equal(planner.enabled, true);
  assert.match(planner.whenToUse, /Idea→Plan→Tasks/);
  assert.equal(planner.nextTool, PLANNER_PACKET_TOOL_NAME);
  assert.match(planner.cliFallbackPointer, /get-planner-flow-status/);
  assert.deepEqual(planner.mcpToolNames, [...PLANNER_MCP_READ_TOOL_NAMES]);
});

test("agent_start planner routing lists all v1 planner MCP tools without packet duplication", async () => {
  const payload = await callAgentStart();
  const planner = payload.workflows.planner;
  assert.equal(planner.mcpToolNames.length, 5);
  for (const toolName of PLANNER_MCP_READ_TOOL_NAMES) {
    assert.ok(planner.mcpToolNames.includes(toolName), `lists ${toolName}`);
  }
  for (const key of PACKET_FIELD_KEYS) {
    assert.equal(planner[key], undefined, `does not duplicate planner-packet field ${key}`);
  }
  assert.equal(payload.packetKind, undefined);
  assert.equal(payload.agentDirective, undefined);
});

test("agent_start planner routing branch stays within six kilobyte budget", async () => {
  const payload = await callAgentStart();
  const text = JSON.stringify(payload);
  const byteBudget = MCP_TOOL_OUTPUT_BYTE_BUDGETS[AGENT_START_TOOL_NAME];
  assert.equal(byteBudget, 6 * 1024);
  assert.ok(
    Buffer.byteLength(text, "utf8") <= byteBudget,
    `agent_start payload ${Buffer.byteLength(text, "utf8")} bytes exceeds ${byteBudget}`
  );
  assert.notEqual(payload.oversized, true);
});

test("agent_start planner routing is disabled when ideas module is off", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mcp-agent-start-planner-disabled-"));
  await mkdir(path.join(workspace, ".workspace-kit"), { recursive: true });
  await writeFile(
    path.join(workspace, ".workspace-kit/config.json"),
    JSON.stringify({ modules: { disabled: ["ideas"] } }),
    "utf8"
  );
  await writeFile(
    path.join(workspace, "package.json"),
    JSON.stringify({ name: "@workflow-cannon/workspace-kit" }),
    "utf8"
  );

  const payload = await callAgentStart({ workspacePath: workspace });
  const planner = payload.workflows.planner;
  assert.equal(planner.enabled, false);
  assert.equal(planner.nextTool, undefined);
  assert.equal(planner.mcpToolNames, undefined);
  assert.match(planner.whenToUse, /disabled/i);
});
