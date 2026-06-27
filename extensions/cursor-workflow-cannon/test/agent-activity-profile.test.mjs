import test from "node:test";
import assert from "node:assert/strict";
import {
  mapCursorSubagentTypeToDefinitionId,
  thinkingLevelFromModelSlug,
  extractTaskIdFromText
} from "../dist/runtime/agent-activity-profile.js";

test("mapCursorSubagentTypeToDefinitionId maps known Cursor subagent types", () => {
  assert.equal(mapCursorSubagentTypeToDefinitionId("generalPurpose"), "task-worker");
  assert.equal(mapCursorSubagentTypeToDefinitionId("explore"), "explorer");
  assert.equal(mapCursorSubagentTypeToDefinitionId("shell"), "shell-worker");
});

test("thinkingLevelFromModelSlug parses thinking suffixes", () => {
  assert.equal(thinkingLevelFromModelSlug("claude-opus-4-8-thinking-high"), "High");
  assert.equal(thinkingLevelFromModelSlug("gpt-5.5-high"), "High");
  assert.equal(thinkingLevelFromModelSlug("composer-2.5-fast"), "Fast");
});

test("extractTaskIdFromText finds task ids in prompts", () => {
  assert.equal(extractTaskIdFromText("Deliver T100401 in the repo"), "T100401");
  assert.equal(extractTaskIdFromText("no task here"), null);
});
