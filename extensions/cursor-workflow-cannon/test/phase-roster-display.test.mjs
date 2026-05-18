import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNarrowPhaseRosterRows,
  parseLeadingDigitsOrdinal,
  parseLeadingPhaseOrdinalFromKey,
  phaseRosterStatusLabel
} from "../dist/views/phase-roster-display.js";

test("parseLeadingDigitsOrdinal reads leading digits", () => {
  assert.equal(parseLeadingDigitsOrdinal("87"), 87);
  assert.equal(parseLeadingDigitsOrdinal("88 (rollout)"), 88);
  assert.equal(parseLeadingDigitsOrdinal("alpha"), null);
});

test("parseLeadingPhaseOrdinalFromKey matches phase keys", () => {
  assert.equal(parseLeadingPhaseOrdinalFromKey("91"), 91);
  assert.equal(parseLeadingPhaseOrdinalFromKey("91-notes"), 91);
  assert.equal(parseLeadingPhaseOrdinalFromKey("custom"), null);
});

test("phaseRosterStatusLabel maps statuses", () => {
  assert.equal(phaseRosterStatusLabel("delivered"), "Delivered");
  assert.equal(phaseRosterStatusLabel("current"), "Current");
  assert.equal(phaseRosterStatusLabel("next"), "Next");
  assert.equal(phaseRosterStatusLabel("future"), "Future");
});

test("buildNarrowPhaseRosterRows picks delivered max past, current, all future", () => {
  const slice = { currentKitPhase: "87", nextKitPhase: "88", canonicalPhaseKey: "87" };
  const phases = [
    { phaseKey: "85", shortDescription: "A", inCatalog: true },
    { phaseKey: "86", shortDescription: "B", inCatalog: true },
    { phaseKey: "87", shortDescription: "C", inCatalog: true },
    { phaseKey: "88", shortDescription: "D", inCatalog: true },
    { phaseKey: "89", shortDescription: "E", inCatalog: true }
  ];
  const r = buildNarrowPhaseRosterRows(phases, slice);
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.rows.map((x) => ({ k: x.phaseKey, s: x.status })),
    [
      { k: "86", s: "delivered" },
      { k: "87", s: "current" },
      { k: "88", s: "next" },
      { k: "89", s: "future" }
    ]
  );
});

test("buildNarrowPhaseRosterRows skips older delivered when a closer past exists", () => {
  const slice = { currentKitPhase: "87" };
  const phases = [
    { phaseKey: "84", shortDescription: null, inCatalog: false },
    { phaseKey: "86", shortDescription: null, inCatalog: false },
    { phaseKey: "88", shortDescription: null, inCatalog: false }
  ];
  const r = buildNarrowPhaseRosterRows(phases, slice);
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.rows.map((x) => x.phaseKey),
    ["86", "87", "88"]
  );
  assert.equal(r.rows[0].status, "delivered");
  assert.equal(r.rows[1].status, "current");
  assert.equal(r.rows[1].inCatalog, false);
});

test("buildNarrowPhaseRosterRows returns no-workspace-ordinal when phase not parseable", () => {
  const r = buildNarrowPhaseRosterRows(
    [{ phaseKey: "1", shortDescription: null, inCatalog: true }],
    { currentKitPhase: "rolling", canonicalPhaseKey: null }
  );
  assert.equal(r.ok, false);
});
