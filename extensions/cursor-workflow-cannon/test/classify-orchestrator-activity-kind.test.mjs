import test from "node:test";
import assert from "node:assert/strict";

import { classifyOrchestratorActivityKind } from "../dist/runtime/classify-orchestrator-activity-kind.js";

test("classifyOrchestratorActivityKind is idle when no subagents are active", () => {
  assert.equal(classifyOrchestratorActivityKind({ activeSubagentCount: 0 }), "awaiting_instruction");
});

test("classifyOrchestratorActivityKind is delegating when subagents are active", () => {
  assert.equal(classifyOrchestratorActivityKind({ activeSubagentCount: 1 }), "delegating_task");
  assert.equal(classifyOrchestratorActivityKind({ activeSubagentCount: 3 }), "delegating_task");
});
