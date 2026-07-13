import test from "node:test";
import assert from "node:assert/strict";

import { IDEA_PLAN_STATUS_INPUTS } from "../dist/modules/planning/idea-plan/idea-plan-types.js";
import { isIdeaStatusInput, parseIdeaStatus } from "../dist/modules/planning/idea-row/idea-store.js";

test("parseIdeaStatus accepts all nine status inputs", () => {
  const sqliteMapped = {
    idea: "open",
    brainstorming: undefined,
    planning: "planning",
    reviewed: undefined,
    accepted: "planned",
    delivered: undefined,
    open: "open",
    planned: "planned"
  };

  for (const input of IDEA_PLAN_STATUS_INPUTS) {
    assert.equal(isIdeaStatusInput(input), true, `isIdeaStatusInput ${input}`);
    assert.equal(parseIdeaStatus(input), sqliteMapped[input], `parseIdeaStatus ${input}`);
  }
});

test("parseIdeaStatus rejects unknown values", () => {
  assert.equal(parseIdeaStatus("invalid"), undefined);
  assert.equal(parseIdeaStatus(""), undefined);
  assert.equal(parseIdeaStatus(null), undefined);
});
