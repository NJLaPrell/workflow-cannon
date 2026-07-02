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
  assert.match(playbook, /Do not.*invent a different question sequence/i);
  assert.match(playbook, /human companion only/i);

  for (const command of ["start-brainstorm-session", "update-brainstorm-session", "complete-brainstorm"]) {
    assert.match(playbook, new RegExp(command), `missing command reference: ${command}`);
  }

  assert.match(playbook, /T-shirt size.*complexity/is);
  assert.match(playbook, /high-complexity.*M/i);
  assert.match(playbook, /brainstorm-score-colors\.ts/);
  assert.doesNotMatch(playbook, /valueScore = \(valueImpact/);
});
