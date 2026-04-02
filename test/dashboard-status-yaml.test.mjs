import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  applyWorkspacePhaseSnapshotToYaml,
  parseWorkspaceKitStatusYaml
} from "../dist/modules/task-engine/dashboard-status.js";

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

test("applyWorkspacePhaseSnapshotToYaml replaces phase lines only", () => {
  const raw = `schema_version: 1
current_kit_phase: "1"
next_kit_phase: "2"
active_focus: "keep me"
`;
  const out = applyWorkspacePhaseSnapshotToYaml(raw, { currentKitPhase: "99", nextKitPhase: "100" });
  assert.equal(out.ok, true);
  assert.match(out.yaml, /current_kit_phase: "99"/);
  assert.match(out.yaml, /next_kit_phase: "100"/);
  assert.match(out.yaml, /active_focus: "keep me"/);
  const s = parseWorkspaceKitStatusYaml(out.yaml);
  assert.equal(s.currentKitPhase, "99");
  assert.equal(s.nextKitPhase, "100");
});

test("applyWorkspacePhaseSnapshotToYaml escapes quotes in values", () => {
  const raw = `current_kit_phase: "1"
next_kit_phase: "2"
`;
  const out = applyWorkspacePhaseSnapshotToYaml(raw, { currentKitPhase: 'say "hi"' });
  assert.equal(out.ok, true);
  assert.match(out.yaml, /current_kit_phase: "say \\"hi\\""/);
});

test("applyWorkspacePhaseSnapshotToYaml removes next_kit_phase when nextKitPhase is null", () => {
  const raw = `current_kit_phase: "1"
next_kit_phase: "2"
other: x
`;
  const out = applyWorkspacePhaseSnapshotToYaml(raw, { nextKitPhase: null });
  assert.equal(out.ok, true);
  assert.match(out.yaml, /current_kit_phase: "1"/);
  assert.doesNotMatch(out.yaml, /next_kit_phase/);
  const s = parseWorkspaceKitStatusYaml(out.yaml);
  assert.equal(s.nextKitPhase, null);
});

test("applyWorkspacePhaseSnapshotToYaml rejects empty updates", () => {
  const r = applyWorkspacePhaseSnapshotToYaml("current_kit_phase: \"1\"\n", {});
  assert.equal(r.ok, false);
});
