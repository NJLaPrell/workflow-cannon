import assert from "node:assert/strict";
import test from "node:test";

import {
  BRAINSTORM_ROLLUP_SORT_DIRECTION,
  BRAINSTORM_ROLLUP_SORT_FIELD,
  BRAINSTORM_SCORE_BAND_AMBER_MAX,
  BRAINSTORM_SCORE_BAND_GREEN_MIN,
  BRAINSTORM_SCORE_BAND_RED_MAX,
  brainstormScoreBandCssClass,
  normalizeScore1to10ForBands,
  scoreBandForKind,
  scoreBandForNormalizedScore
} from "../extensions/cursor-workflow-cannon/src/views/shared/brainstorm-score-colors.ts";

test("score bands follow 0-33 red, 34-66 amber, 67-100 green", () => {
  assert.equal(BRAINSTORM_SCORE_BAND_RED_MAX, 33);
  assert.equal(BRAINSTORM_SCORE_BAND_AMBER_MAX, 66);
  assert.equal(BRAINSTORM_SCORE_BAND_GREEN_MIN, 67);
  assert.equal(scoreBandForNormalizedScore(0), "red");
  assert.equal(scoreBandForNormalizedScore(33), "red");
  assert.equal(scoreBandForNormalizedScore(34), "amber");
  assert.equal(scoreBandForNormalizedScore(66), "amber");
  assert.equal(scoreBandForNormalizedScore(67), "green");
  assert.equal(scoreBandForNormalizedScore(100), "green");
});

test("high-is-good kinds map higher scores to greener bands", () => {
  assert.equal(scoreBandForKind(2, "value"), "red");
  assert.equal(scoreBandForKind(9, "value"), "green");
  assert.equal(scoreBandForKind(20, "priority"), "red");
  assert.equal(scoreBandForKind(80, "priority"), "green");
});

test("low-is-good kinds map lower scores to greener bands", () => {
  assert.equal(scoreBandForKind(2, "risk"), "green");
  assert.equal(scoreBandForKind(9, "risk"), "red");
  assert.equal(scoreBandForKind(2, "effort"), "green");
  assert.equal(scoreBandForKind(9, "effort"), "red");
});

test("normalizeScore1to10ForBands maps 1 and 10 to band endpoints", () => {
  assert.equal(normalizeScore1to10ForBands(1), 0);
  assert.equal(normalizeScore1to10ForBands(10), 100);
});

test("rollup sort order is priorityScore descending", () => {
  assert.equal(BRAINSTORM_ROLLUP_SORT_FIELD, "priorityScore");
  assert.equal(BRAINSTORM_ROLLUP_SORT_DIRECTION, "desc");
});

test("brainstormScoreBandCssClass returns named css classes", () => {
  assert.match(brainstormScoreBandCssClass(80, "priority"), /^wc-brainstorm-score-/);
});
