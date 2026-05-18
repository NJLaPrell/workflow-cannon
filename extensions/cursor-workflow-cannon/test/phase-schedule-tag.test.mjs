import test from "node:test";
import assert from "node:assert/strict";
import {
  phaseScheduleTagLabel,
  resolvePhaseScheduleTag,
  renderPhaseScheduleTagHtml
} from "../dist/views/phase-schedule-tag.js";

test("resolvePhaseScheduleTag classifies relative to workspace current and next", () => {
  const focus = { currentKitPhase: "99", nextKitPhase: "100" };
  assert.equal(resolvePhaseScheduleTag("98", focus), "delivered");
  assert.equal(resolvePhaseScheduleTag("99", focus), "current");
  assert.equal(resolvePhaseScheduleTag("100", focus), "next");
  assert.equal(resolvePhaseScheduleTag("101", focus), "future");
});

test("phaseScheduleTagLabel capitalizes schedule kinds", () => {
  assert.equal(phaseScheduleTagLabel("delivered"), "Delivered");
  assert.equal(phaseScheduleTagLabel("current"), "Current");
  assert.equal(phaseScheduleTagLabel("next"), "Next");
  assert.equal(phaseScheduleTagLabel("future"), "Future");
});

test("renderPhaseScheduleTagHtml uses wc-phase-tag classes", () => {
  const html = renderPhaseScheduleTagHtml("next");
  assert.match(html, /wc-phase-tag wc-phase-tag-next/);
  assert.match(html, />Next</);
});
