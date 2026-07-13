import test from "node:test";
import assert from "node:assert/strict";

import {
  IDEA_PLAN_STATUS_INPUTS,
  IDEA_PLAN_STATUSES,
  isIdeaPlanStatusTransitionAllowed,
  normalizeIdeaPlanStatus,
  parseIdeaPlanStatus
} from "../dist/modules/planning/idea-plan/idea-plan-types.js";
import {
  IdeaPlanStatusTransitionError,
  assertIdeaPlanStatusTransitionAllowed,
  enforceIdeaPlanStatusTransition
} from "../dist/modules/planning/idea-plan/idea-plan-status-machine.js";

test("parseIdeaPlanStatus accepts all ten status inputs", () => {
  const expected = {
    idea: "idea",
    brainstorming: "brainstorming",
    planning: "planning",
    reviewed: "reviewed",
    accepted: "accepted",
    delivered: "delivered",
    cancelled: "cancelled",
    open: "idea",
    planned: "accepted"
  };

  for (const input of IDEA_PLAN_STATUS_INPUTS) {
    assert.equal(parseIdeaPlanStatus(input), expected[input], `parse ${input}`);
    assert.equal(normalizeIdeaPlanStatus(input), expected[input], `normalize ${input}`);
  }
});

test("enforceIdeaPlanStatusTransition allows documented valid transitions", () => {
  assert.equal(enforceIdeaPlanStatusTransition("idea", "brainstorming"), "brainstorming");
  assert.equal(enforceIdeaPlanStatusTransition("idea", "planning"), "planning");
  assert.equal(enforceIdeaPlanStatusTransition("brainstorming", "planning"), "planning");
  assert.equal(enforceIdeaPlanStatusTransition("planning", "reviewed"), "reviewed");
  assert.equal(enforceIdeaPlanStatusTransition("reviewed", "accepted"), "accepted");
  assert.equal(enforceIdeaPlanStatusTransition("accepted", "delivered"), "delivered");
  assert.equal(enforceIdeaPlanStatusTransition("accepted", "cancelled"), "cancelled");
  assert.equal(enforceIdeaPlanStatusTransition("cancelled", "brainstorming"), "brainstorming");
  assert.equal(enforceIdeaPlanStatusTransition("cancelled", "planning"), "planning");
});

test("enforceIdeaPlanStatusTransition normalizes legacy aliases before checking", () => {
  assert.equal(enforceIdeaPlanStatusTransition("open", "brainstorming"), "brainstorming");
  assert.equal(enforceIdeaPlanStatusTransition("idea", "planning"), "planning");
  assert.equal(enforceIdeaPlanStatusTransition("planned", "delivered"), "delivered");
});

test("assertIdeaPlanStatusTransitionAllowed rejects invalid transitions with clear errors", () => {
  const invalidPairs = [
    ["idea", "delivered"],
    ["brainstorming", "reviewed"],
    ["delivered", "accepted"]
  ];

  for (const [from, to] of invalidPairs) {
    assert.throws(
      () => assertIdeaPlanStatusTransitionAllowed(from, to),
      (error) => {
        assert.ok(error instanceof IdeaPlanStatusTransitionError);
        assert.equal(error.from, normalizeIdeaPlanStatus(from));
        assert.equal(error.to, normalizeIdeaPlanStatus(to));
        assert.match(error.message, /not allowed/);
        return true;
      },
      `${from} -> ${to}`
    );
    assert.equal(isIdeaPlanStatusTransitionAllowed(from, to), false);
  }
});

test("every canonical status transition is enforced consistently", () => {
  for (const from of IDEA_PLAN_STATUSES) {
    for (const to of IDEA_PLAN_STATUSES) {
      const allowed = isIdeaPlanStatusTransitionAllowed(from, to);
      if (allowed) {
        assert.doesNotThrow(() => assertIdeaPlanStatusTransitionAllowed(from, to));
      } else {
        assert.throws(() => assertIdeaPlanStatusTransitionAllowed(from, to), IdeaPlanStatusTransitionError);
      }
    }
  }
});
