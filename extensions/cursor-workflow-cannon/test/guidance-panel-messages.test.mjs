import test from "node:test";
import assert from "node:assert/strict";

import { buildGuidanceMutationActionResultMessage } from "../dist/views/guidance/guidance-panel-messages.js";

test("buildGuidanceMutationActionResultMessage returns bounded stale-state actions", () => {
  const message = buildGuidanceMutationActionResultMessage("cae-update-draft-activation", {
    ok: false,
    code: "cae-stale-state",
    message: "Registry state is stale."
  });

  assert.equal(message.type, "actionResult");
  assert.equal(message.ok, false);
  assert.equal(message.text, "Registry state is stale.");
  assert.deepEqual(message.actions, [
    { label: "Refresh", action: "refresh" },
    { label: "Review Changes", action: "select-audit" }
  ]);
});

test("buildGuidanceMutationActionResultMessage keeps non-stale failures passive", () => {
  const message = buildGuidanceMutationActionResultMessage("cae-update-draft-activation", {
    ok: false,
    code: "cae-registry-schema-invalid"
  });

  assert.equal(message.ok, false);
  assert.equal(message.text, "cae-registry-schema-invalid");
  assert.deepEqual(message.actions, []);
});

test("buildGuidanceMutationActionResultMessage preserves successful command copy", () => {
  const message = buildGuidanceMutationActionResultMessage("cae-create-workspace-artifact", {
    ok: true,
    message: "cae-create-workspace-artifact completed with 1 warning."
  });

  assert.equal(message.ok, true);
  assert.equal(message.text, "cae-create-workspace-artifact completed with 1 warning.");
  assert.deepEqual(message.actions, []);
});
