/** T100820 — planner MCP output budget registrations (architecture D3). */
import assert from "node:assert/strict";
import test from "node:test";

import {
  MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET,
  MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET,
  MCP_TOOL_OUTPUT_BYTE_BUDGETS,
  PLANNER_MCP_READ_TOOL_NAMES,
  resolveToolOutputByteBudget
} from "../dist/mcp/index.js";

test("planner MCP read tools are registered in MCP_TOOL_OUTPUT_BYTE_BUDGETS", () => {
  for (const toolName of PLANNER_MCP_READ_TOOL_NAMES) {
    assert.equal(
      typeof MCP_TOOL_OUTPUT_BYTE_BUDGETS[toolName],
      "number",
      `${toolName} has explicit output budget`
    );
    assert.ok(MCP_TOOL_OUTPUT_BYTE_BUDGETS[toolName] > 0, `${toolName} budget is positive`);
  }
});

test("planner-packet uses 20 KiB budget per architecture D3", () => {
  assert.equal(MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET, 20 * 1024);
  assert.equal(
    MCP_TOOL_OUTPUT_BYTE_BUDGETS["workflow-cannon.planner-packet"],
    MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET
  );
  assert.equal(
    resolveToolOutputByteBudget("workflow-cannon.planner-packet"),
    MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET
  );
});

test("planner satellite read tools use 16 KiB budget per architecture D3", () => {
  const satelliteTools = PLANNER_MCP_READ_TOOL_NAMES.filter(
    (name) => name !== "workflow-cannon.planner-packet"
  );

  assert.equal(MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET, 16 * 1024);

  for (const toolName of satelliteTools) {
    assert.equal(
      MCP_TOOL_OUTPUT_BYTE_BUDGETS[toolName],
      MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET,
      `${toolName} uses satellite budget`
    );
    assert.equal(
      resolveToolOutputByteBudget(toolName),
      MCP_PLANNER_SATELLITE_OUTPUT_BYTE_BUDGET
    );
  }
});

test("PLANNER_MCP_READ_TOOL_NAMES lists all five v1 planner read tools", () => {
  assert.deepEqual([...PLANNER_MCP_READ_TOOL_NAMES], [
    "workflow-cannon.planner-packet",
    "workflow-cannon.list-ideas",
    "workflow-cannon.get-plan-artifact",
    "workflow-cannon.plan-review-packet",
    "workflow-cannon.finalize-preview-packet"
  ]);
});
