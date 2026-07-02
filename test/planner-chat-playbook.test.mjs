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
  "planner-chat.md"
);

test("planner-chat playbook documents locked session and command decisions", () => {
  const playbook = fs.readFileSync(playbookPath, "utf8");

  for (const command of [
    "start-idea-planning",
    "update-idea-planning-session",
    "draft-plan-artifact",
    "review-plan-artifact",
    "accept-plan-artifact",
    "finalize-plan-to-phase"
  ]) {
    assert.match(playbook, new RegExp(command), `missing command reference: ${command}`);
  }

  for (const status of ["draft_ready", "needs_revision", "approval_ready", "completed"]) {
    assert.match(playbook, new RegExp(status), `missing session status: ${status}`);
  }

  assert.match(playbook, /Default planning profile.*minimal/is);
  assert.match(playbook, /Warnings do not block acceptance/i);
  assert.match(playbook, /Do not.*move the session to `completed` after draft persistence/i);
  assert.match(playbook, /Approval and finalization are separate/i);
  assert.match(playbook, /Dry-run first/i);
  assert.match(playbook, /one WBS row to one task draft/i);
  assert.match(playbook, /unified IdeaPlan document/i);
  assert.match(playbook, /schemas\/ideas\/states/);
});
