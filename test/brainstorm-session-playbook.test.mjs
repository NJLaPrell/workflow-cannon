import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const playbookPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".ai",
  "playbooks",
  "brainstorm-session.md"
);

test("brainstorm-session companion defers to schema agentDirective as authoritative", () => {
  const playbook = fs.readFileSync(playbookPath, "utf8");

  assert.match(playbook, /agentDirective.*authoritative/is);
  assert.match(playbook, /brainstorming\.schema\.json/);
  assert.match(playbook, /do not.*invent a different scoring question sequence/i);
  assert.match(playbook, /human companion/i);

  for (const command of ["start-brainstorm-session", "update-brainstorm-session", "complete-brainstorm"]) {
    assert.match(playbook, new RegExp(command), `missing command reference: ${command}`);
  }

  assert.match(playbook, /T-shirt size.*complexity/is);
  assert.match(playbook, /high-complexity.*M/i);
  assert.match(playbook, /brainstorm-score-colors\.ts/);
  assert.match(playbook, /Feature And Function Clarification/i);
  assert.match(playbook, /Propose → ask → persist/i);
  assert.match(playbook, /never one-shot the session/i);
  assert.match(playbook, /optional.*secondary/i);
  assert.match(playbook, /Session Completion And Planning Gates/i);
  assert.match(playbook, /continue this session/i);
  assert.match(playbook, /start a new brainstorm session/i);
  assert.match(playbook, /operatorConfirmedBrainstormComplete/);
  assert.doesNotMatch(playbook, /valueScore = \(valueImpact/);
});
