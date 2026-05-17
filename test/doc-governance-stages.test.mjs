import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REQUIRED_DOC_GOVERNANCE_STAGE_IDS } from "../scripts/doc-governance-stage-ids.mjs";

describe("doc-governance-stage-ids", () => {
  it("includes core documentation gates", () => {
    assert.ok(REQUIRED_DOC_GOVERNANCE_STAGE_IDS.includes("documentation-data"));
    assert.ok(REQUIRED_DOC_GOVERNANCE_STAGE_IDS.includes("ai-to-docs-drift"));
    assert.ok(REQUIRED_DOC_GOVERNANCE_STAGE_IDS.includes("doc-lifecycle-report"));
  });
});
