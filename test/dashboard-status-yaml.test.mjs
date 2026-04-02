import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseWorkspaceKitStatusYaml } from "../dist/modules/task-engine/dashboard-status.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

test("parseWorkspaceKitStatusYaml reads lists from real workspace-kit-status.yaml", () => {
  const raw = readFileSync(
    path.join(repoRoot, "docs/maintainers/data/workspace-kit-status.yaml"),
    "utf8"
  );
  const s = parseWorkspaceKitStatusYaml(raw);
  assert.ok(s.currentKitPhase != null && s.currentKitPhase.length > 0);
  assert.ok(Array.isArray(s.blockers));
  assert.ok(Array.isArray(s.pendingDecisions));
  assert.ok(Array.isArray(s.nextAgentActions));
  assert.ok(s.nextAgentActions.length >= 1);
});

test("parseWorkspaceKitStatusYaml handles empty blockers array inline", () => {
  const raw = "blockers: []\npending_decisions: []\nnext_agent_actions:\n  - \"hi\"\n";
  const s = parseWorkspaceKitStatusYaml(raw);
  assert.deepEqual(s.blockers, []);
  assert.deepEqual(s.pendingDecisions, []);
  assert.deepEqual(s.nextAgentActions, ["hi"]);
});
