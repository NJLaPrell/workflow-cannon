import assert from "node:assert/strict";
import test from "node:test";

import { CAE_ENFORCEMENT_BLOCK_ALLOWLIST, findCaeEnforcementBlock } from "../dist/index.js";

test("CAE enforcement allowlist pilot (enable-plugin + phase70 policy bundle)", () => {
  assert.ok(CAE_ENFORCEMENT_BLOCK_ALLOWLIST.length >= 1);
  const bundle = {
    schemaVersion: 1,
    families: {
      policy: [{ activationId: "cae.activation.policy.phase70-playbook" }],
      think: [],
      do: [],
      review: []
    }
  };
  assert.ok(findCaeEnforcementBlock("enable-plugin", bundle));
  assert.equal(findCaeEnforcementBlock("enable-plugin", { schemaVersion: 1, families: { policy: [], think: [], do: [], review: [] } }), null);
});
