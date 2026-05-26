import test from "node:test";
import assert from "node:assert/strict";
import {
  phaseScheduleTagLabel,
  resolvePhaseScheduleTag,
  renderPhaseScheduleTagHtml
} from "../dist/views/phase-schedule-tag.js";

test("resolvePhaseScheduleTag classifies relative to workspace current and next", () => {
  const focus = { currentKitPhase: "99", nextKitPhase: "100" };
  assert.equal(resolvePhaseScheduleTag("98", focus), "future");
  assert.equal(resolvePhaseScheduleTag("99", focus), "current");
  assert.equal(resolvePhaseScheduleTag("100", focus), "next");
  assert.equal(resolvePhaseScheduleTag("101", focus), "future");
});

test("resolvePhaseScheduleTag prefers delivered over stale nextKitPhase", () => {
  const focus = {
    currentKitPhase: "114",
    nextKitPhase: "106",
    releasedPhaseKeys: new Set(["106"])
  };
  assert.equal(resolvePhaseScheduleTag("106", focus), "delivered");
});

test("resolvePhaseScheduleTag skips next when canonical next is absent from roster", () => {
  const focus = {
    currentKitPhase: "114",
    nextKitPhase: "115",
    knownRosterPhaseKeys: new Set(["114", "116"])
  };
  assert.equal(resolvePhaseScheduleTag("115", focus), "future");
  assert.equal(resolvePhaseScheduleTag("116", focus), "future");
});

test("resolvePhaseScheduleTag treats legacy delivered ordinals as delivered", () => {
  const focus = {
    currentKitPhase: "114",
    nextKitPhase: "115",
    legacyDeliveredMaxOrdinal: 105
  };
  assert.equal(resolvePhaseScheduleTag("105", focus), "delivered");
  assert.equal(resolvePhaseScheduleTag("106", focus), "future");
  assert.equal(resolvePhaseScheduleTag("108", focus), "future");
});

test("resolvePhaseScheduleTag marks rolled-out phases delivered; undelivered backlog stays future", () => {
  const focus = {
    currentKitPhase: "114",
    nextKitPhase: "115",
    releasedPhaseKeys: new Set(["107"])
  };
  assert.equal(resolvePhaseScheduleTag("107", focus), "delivered");
  assert.equal(resolvePhaseScheduleTag("108", focus), "future");
  assert.equal(resolvePhaseScheduleTag("113", focus), "future");
});

test("phaseScheduleTagLabel capitalizes schedule kinds", () => {
  assert.equal(phaseScheduleTagLabel("delivered"), "Delivered");
  assert.equal(phaseScheduleTagLabel("current"), "Current");
  assert.equal(phaseScheduleTagLabel("next"), "Next");
  assert.equal(phaseScheduleTagLabel("future"), "Future");
});

test("resolvePhaseScheduleTag keeps active queue phases from delivered tag", () => {
  const focus = {
    currentKitPhase: null,
    nextKitPhase: "116",
    releasedPhaseKeys: new Set(["108"]),
    legacyDeliveredMaxOrdinal: 115,
    activeQueuePhaseKeys: new Set(["108", "109"])
  };
  assert.equal(resolvePhaseScheduleTag("108", focus), "future");
  assert.equal(resolvePhaseScheduleTag("109", focus), "future");
  assert.equal(resolvePhaseScheduleTag("107", focus), "delivered");
});

test("renderPhaseScheduleTagHtml uses wc-phase-tag classes", () => {
  const html = renderPhaseScheduleTagHtml("next");
  assert.match(html, /wc-phase-tag wc-phase-tag-next/);
  assert.match(html, />Next</);
});
