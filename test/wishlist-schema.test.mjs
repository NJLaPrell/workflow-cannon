import assert from "node:assert/strict";
import test from "node:test";

import {
  validateWishlistIntakePayload,
  validateWishlistUpdatePayload,
  WISHLIST_ID_RE
} from "../dist/modules/task-engine/wishlist/wishlist-validation.js";

test("WISHLIST_ID_RE accepts W1 and W42", () => {
  assert.equal(WISHLIST_ID_RE.test("W1"), true);
  assert.equal(WISHLIST_ID_RE.test("W42"), true);
  assert.equal(WISHLIST_ID_RE.test("T1"), false);
  assert.equal(WISHLIST_ID_RE.test("Wx1"), false);
});

test("validateWishlistIntakePayload rejects phase", () => {
  const r = validateWishlistIntakePayload({
    id: "W1",
    phase: "Phase 1",
    title: "t",
    problemStatement: "p",
    expectedOutcome: "e",
    impact: "i",
    constraints: "c",
    successSignals: "s",
    requestor: "r",
    evidenceRef: "ev"
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("phase")));
});

test("validateWishlistIntakePayload requires all fields", () => {
  const r = validateWishlistIntakePayload({
    id: "W1",
    title: "t"
  });
  assert.equal(r.ok, false);
});

test("validateWishlistUpdatePayload rejects phase in updates", () => {
  const r = validateWishlistUpdatePayload({ phase: "x" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 1);
});
