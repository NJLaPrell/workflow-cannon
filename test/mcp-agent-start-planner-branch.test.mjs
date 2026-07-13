/**
 * T100864 — merge contract gate: agent_start planner routing smoke (WBS-11 / D2).
 * Re-run mandatory after WBS-7 (T100822 list-ideas MCP) and WBS-10 (T100825 finalize-preview-packet MCP).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  handleMcpRequest,
  invokePlannerPacket,
  MCP_TOOL_OUTPUT_BYTE_BUDGETS,
  PLANNER_MCP_READ_TOOL_NAMES,
  PLANNER_PACKET_TOOL_NAME
} from "../dist/mcp/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firstRunFixture = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "fixtures/ideas/empty-inventory-first-run.fixture.json"), "utf8")
);

const AGENT_START_TOOL_NAME = "workflow-cannon.agent_start";

/** Frozen v1 planner MCP read tool names — must match PLANNER_MCP_READ_TOOL_NAMES export. */
const FROZEN_PLANNER_MCP_TOOL_NAMES = [...firstRunFixture.frozenMcpToolNames];
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

test("frozen planner MCP tool names remain unchanged (WBS-7 / WBS-10 contract gate)", () => {
  assert.deepEqual([...PLANNER_MCP_READ_TOOL_NAMES], FROZEN_PLANNER_MCP_TOOL_NAMES);
  assert.deepEqual(FROZEN_PLANNER_MCP_TOOL_NAMES, [
    "workflow-cannon.planner-packet",
    "workflow-cannon.list-ideas",
    "workflow-cannon.get-plan-artifact",
    "workflow-cannon.plan-review-packet",
    "workflow-cannon.finalize-preview-packet"
  ]);
});

test("planner-packet smoke returns frozen first-run contract on empty workspace", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mcp-agent-start-planner-packet-smoke-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });

  const { createCommandRegistryRuntime } = await import("../dist/core/module-command-router.js");
  const { defaultRegistryModules } = await import("../dist/modules/index.js");
  const { resolveRegistryAndConfig } = await import("../dist/core/module-registry-resolve.js");
  const { resolveActorWithFallback } = await import("../dist/core/policy.js");

  const { registry, effective } = await resolveRegistryAndConfig(workspace, defaultRegistryModules, {});
  const actor = await resolveActorWithFallback(workspace, {}, process.env);
  const runtime = createCommandRegistryRuntime(registry, {
    ctx: {
      runtimeVersion: "0.1",
      workspacePath: workspace,
      effectiveConfig: effective,
      resolvedActor: actor,
      moduleRegistry: registry
    }
  });

  const out = await invokePlannerPacket(runtime, {});
  assert.equal(out.ok, true, out.message);
  assert.equal(out.data.goldenPathStage, firstRunFixture.plannerPacket.firstRun.goldenPathStage);
  assert.equal(
    out.data.recommendedNextCommand.command,
    firstRunFixture.plannerPacket.firstRun.recommendedNextCommand
  );
  assert.equal(out.data.idea, undefined);
  assert.equal(typeof out.data.planningGeneration, "number");
});

test("agent_start exposes workflows.planner routing when ideas module is enabled", async () => {
  const payload = await callAgentStart();
  const planner = payload.workflows?.planner;
  assert.ok(planner, "workflows.planner branch is present");
  assert.equal(planner.enabled, true);
  assert.match(planner.whenToUse, /Idea→Plan→Tasks/);
  assert.equal(planner.nextTool, PLANNER_PACKET_TOOL_NAME);
  assert.match(planner.cliFallbackPointer, /get-planner-flow-status/);
  assert.deepEqual(planner.mcpToolNames, FROZEN_PLANNER_MCP_TOOL_NAMES);
  assert.deepEqual(planner.mcpToolNames, [...PLANNER_MCP_READ_TOOL_NAMES]);
});

test("agent_start planner routing lists all v1 planner MCP tools without packet duplication", async () => {
  const payload = await callAgentStart();
  const planner = payload.workflows.planner;
  assert.equal(planner.mcpToolNames.length, FROZEN_PLANNER_MCP_TOOL_NAMES.length);
  for (const toolName of FROZEN_PLANNER_MCP_TOOL_NAMES) {
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
