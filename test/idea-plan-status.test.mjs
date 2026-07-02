import test from "node:test";
import assert from "node:assert/strict";

import {
  IDEA_PLAN_STATUSES,
  IDEA_PLAN_STATUS_TRANSITIONS,
  isIdeaPlanStatus,
  isIdeaPlanStatusTransitionAllowed
} from "../dist/modules/ideas/idea-plan-types.js";

const FORWARD_CHAIN = [
  "idea",
  "brainstorming",
  "planning",
  "reviewed",
  "accepted",
  "delivered"
];

test("IDEA_PLAN_STATUSES defines all six lifecycle states", () => {
  assert.deepEqual([...IDEA_PLAN_STATUSES], FORWARD_CHAIN);
});

test("isIdeaPlanStatus accepts known states and rejects unknown values", () => {
  for (const status of IDEA_PLAN_STATUSES) {
    assert.equal(isIdeaPlanStatus(status), true);
  }
  assert.equal(isIdeaPlanStatus("open"), false);
  assert.equal(isIdeaPlanStatus(""), false);
});

test("isIdeaPlanStatusTransitionAllowed accepts documented valid transitions", () => {
  assert.equal(isIdeaPlanStatusTransitionAllowed("idea", "brainstorming"), true);
  assert.equal(isIdeaPlanStatusTransitionAllowed("brainstorming", "planning"), true);
  assert.equal(isIdeaPlanStatusTransitionAllowed("brainstorming", "brainstorming"), true);
  assert.equal(isIdeaPlanStatusTransitionAllowed("planning", "reviewed"), true);
  assert.equal(isIdeaPlanStatusTransitionAllowed("reviewed", "accepted"), true);
  assert.equal(isIdeaPlanStatusTransitionAllowed("reviewed", "planning"), true);
  assert.equal(isIdeaPlanStatusTransitionAllowed("accepted", "delivered"), true);
  assert.equal(isIdeaPlanStatusTransitionAllowed("delivered", "delivered"), true);
});

test("isIdeaPlanStatusTransitionAllowed rejects invalid transitions", () => {
  const invalidPairs = [
    ["idea", "planning"],
    ["idea", "delivered"],
    ["brainstorming", "reviewed"],
    ["planning", "accepted"],
    ["reviewed", "delivered"],
    ["accepted", "planning"],
    ["delivered", "accepted"],
    ["delivered", "idea"]
  ];

  for (const [from, to] of invalidPairs) {
    assert.equal(
      isIdeaPlanStatusTransitionAllowed(from, to),
      false,
      `${from} -> ${to} should be disallowed`
    );
  }
});

test("every transition table target is a valid IdeaPlanStatus", () => {
  for (const from of IDEA_PLAN_STATUSES) {
    for (const to of IDEA_PLAN_STATUS_TRANSITIONS[from]) {
      assert.equal(isIdeaPlanStatus(to), true, `${from} lists invalid target ${to}`);
    }
  }
});
