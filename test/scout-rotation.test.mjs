import test from "node:test";
import assert from "node:assert/strict";
import {
  deterministicUnit,
  nextScoutQuadrant,
  pickAdversarialLens,
  pickPrimaryLens,
  pickQuestionStem,
  pickTargetZone,
  pickWeightedIndex,
  SCOUT_LENS_BUCKETS,
  SCOUT_ROTATION_WEIGHTS
} from "../dist/modules/improvement/scout-rotation.js";

test("deterministicUnit: stable for same seed", () => {
  const a = deterministicUnit("scout-ci");
  const b = deterministicUnit("scout-ci");
  assert.equal(a, b);
  assert.ok(a >= 0 && a < 1);
});

test("pickWeightedIndex: 40/30/20/10 partition covers unit interval", () => {
  assert.equal(pickWeightedIndex(SCOUT_ROTATION_WEIGHTS, 0.0001), 0);
  assert.equal(pickWeightedIndex(SCOUT_ROTATION_WEIGHTS, 0.39), 0);
  assert.equal(pickWeightedIndex(SCOUT_ROTATION_WEIGHTS, 0.41), 1);
  assert.equal(pickWeightedIndex(SCOUT_ROTATION_WEIGHTS, 0.71), 2);
  assert.equal(pickWeightedIndex(SCOUT_ROTATION_WEIGHTS, 0.73), 2);
  assert.equal(pickWeightedIndex(SCOUT_ROTATION_WEIGHTS, 0.93), 3);
  assert.equal(pickWeightedIndex(SCOUT_ROTATION_WEIGHTS, 0.95), 3);
});

test("nextScoutQuadrant: deterministic from seed", () => {
  assert.equal(nextScoutQuadrant("fixed-seed-for-ci"), nextScoutQuadrant("fixed-seed-for-ci"));
});

test("pickPrimaryLens returns member of quadrant bucket", () => {
  const q = 2;
  const lens = pickPrimaryLens(q, "s", []);
  assert.ok(SCOUT_LENS_BUCKETS[q].includes(lens));
});

test("pickTargetZone and pickQuestionStem return known catalog strings", () => {
  const z = pickTargetZone("z", []);
  assert.ok(typeof z === "string" && z.length > 0);
  const stem = pickQuestionStem("st", []);
  assert.ok(stem.includes("?") || stem.length > 20);
});

test("pickAdversarialLens differs from primary when pool allows", () => {
  const primary = "determinism";
  const adv = pickAdversarialLens(primary, "adv-seed", []);
  assert.notEqual(adv, primary);
});
