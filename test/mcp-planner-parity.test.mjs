/** T100832 — planner MCP parity CI gate (WBS-30). Aggregates WBS-12 / T100827–WBS-29 / T100831. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PLANNER_MCP_READ_TOOL_NAMES } from "../dist/mcp/index.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));

/** Per-tool parity suites merged only at this gate (see WBS-30 / I011 plan). */
export const PLANNER_MCP_PARITY_MODULES = [
  {
    wbsId: "WBS-12",
    taskId: "T100827",
    file: "mcp-planner-packet-parity.test.mjs",
    tool: "workflow-cannon.planner-packet"
  },
  {
    wbsId: "WBS-26",
    taskId: "T100828",
    file: "mcp-list-ideas-parity.test.mjs",
    tool: "workflow-cannon.list-ideas"
  },
  {
    wbsId: "WBS-27",
    taskId: "T100829",
    file: "mcp-get-plan-artifact-parity.test.mjs",
    tool: "workflow-cannon.get-plan-artifact"
  },
  {
    wbsId: "WBS-28",
    taskId: "T100830",
    file: "mcp-plan-review-packet-parity.test.mjs",
    tool: "workflow-cannon.plan-review-packet"
  },
  {
    wbsId: "WBS-29",
    taskId: "T100831",
    file: "mcp-finalize-preview-packet-parity.test.mjs",
    tool: "workflow-cannon.finalize-preview-packet"
  }
];

test("planner MCP parity gate — all five per-tool suites are present on disk", () => {
  for (const mod of PLANNER_MCP_PARITY_MODULES) {
    const filePath = path.join(testDir, mod.file);
    assert.ok(existsSync(filePath), `${mod.taskId} (${mod.wbsId}) missing parity suite: ${mod.file}`);
  }
});

test("planner MCP parity gate — modules align with PLANNER_MCP_READ_TOOL_NAMES", () => {
  const toolsFromModules = PLANNER_MCP_PARITY_MODULES.map((mod) => mod.tool);
  assert.deepEqual(toolsFromModules, [...PLANNER_MCP_READ_TOOL_NAMES]);
});

await import("./mcp-planner-packet-parity.test.mjs");
await import("./mcp-list-ideas-parity.test.mjs");
await import("./mcp-get-plan-artifact-parity.test.mjs");
await import("./mcp-plan-review-packet-parity.test.mjs");
await import("./mcp-finalize-preview-packet-parity.test.mjs");
