import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNarrowPhaseRosterRows,
  buildPhaseRosterRowsWhenNoCurrent,
  detectPhaseCloseoutOrderingRisk,
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

test("buildNarrowPhaseRosterRows picks latest delivered, current, and all undelivered phases", () => {
  const slice = { currentKitPhase: "87", nextKitPhase: "88", canonicalPhaseKey: "87" };
  const phases = [
    { phaseKey: "85", shortDescription: "A", inCatalog: true },
    { phaseKey: "86", shortDescription: "B", inCatalog: true },
    { phaseKey: "87", shortDescription: "C", inCatalog: true },
    { phaseKey: "88", shortDescription: "D", inCatalog: true },
    { phaseKey: "89", shortDescription: "E", inCatalog: true }
  ];
  const r = buildNarrowPhaseRosterRows(phases, slice, ["86"]);
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.rows.map((x) => ({ k: x.phaseKey, s: x.status })),
    [
      { k: "86", s: "delivered" },
      { k: "87", s: "current" },
      { k: "85", s: "future" },
      { k: "88", s: "next" },
      { k: "89", s: "future" }
    ]
  );
});

test("buildNarrowPhaseRosterRows treats legacy delivered ordinals as delivered", () => {
  const slice = { currentKitPhase: "114", nextKitPhase: "115", canonicalPhaseKey: "114" };
  const phases = [
    { phaseKey: "105", shortDescription: "Legacy", inCatalog: true },
    { phaseKey: "106", shortDescription: "Evidence", inCatalog: true },
    { phaseKey: "108", shortDescription: "Backfill", inCatalog: true },
    { phaseKey: "114", shortDescription: "Current", inCatalog: true },
    { phaseKey: "115", shortDescription: "Next", inCatalog: true }
  ];
  const r = buildNarrowPhaseRosterRows(phases, slice, ["106"], 105);
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.rows.map((x) => ({ k: x.phaseKey, s: x.status })),
    [
      { k: "106", s: "delivered" },
      { k: "114", s: "current" },
      { k: "108", s: "future" },
      { k: "115", s: "next" }
    ]
  );
});

test("buildNarrowPhaseRosterRows includes undelivered backlog below workspace current as future", () => {
  const slice = { currentKitPhase: "114", nextKitPhase: "115", canonicalPhaseKey: "114" };
  const phases = [
    { phaseKey: "106", shortDescription: "Done", inCatalog: true },
    { phaseKey: "108", shortDescription: "Backfill", inCatalog: true },
    { phaseKey: "113", shortDescription: "Skipped", inCatalog: true },
    { phaseKey: "114", shortDescription: "Current", inCatalog: true },
    { phaseKey: "115", shortDescription: "Next", inCatalog: true }
  ];
  const r = buildNarrowPhaseRosterRows(phases, slice, ["106"]);
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.rows.map((x) => ({ k: x.phaseKey, s: x.status })),
    [
      { k: "106", s: "delivered" },
      { k: "114", s: "current" },
      { k: "108", s: "future" },
      { k: "113", s: "future" },
      { k: "115", s: "next" }
    ]
  );
});

test("buildNarrowPhaseRosterRows synthesizes current when missing from catalog", () => {
  const slice = { currentKitPhase: "87" };
  const phases = [
    { phaseKey: "84", shortDescription: null, inCatalog: false },
    { phaseKey: "86", shortDescription: null, inCatalog: false },
    { phaseKey: "88", shortDescription: null, inCatalog: false }
  ];
  const r = buildNarrowPhaseRosterRows(phases, slice, ["86"]);
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.rows.map((x) => x.phaseKey),
    ["86", "87", "84", "88"]
  );
  assert.equal(r.rows[0].status, "delivered");
  assert.equal(r.rows[1].status, "current");
  assert.equal(r.rows[1].inCatalog, false);
});

test("buildPhaseRosterRowsWhenNoCurrent hides explicit delivered phases even with active queue work", () => {
  const slice = { currentKitPhase: null, nextKitPhase: "116" };
  const phases = [
    { phaseKey: "107", shortDescription: "Shipped", inCatalog: true },
    { phaseKey: "108", shortDescription: "WIP", inCatalog: true },
    { phaseKey: "109", shortDescription: "Active", inCatalog: true },
    { phaseKey: "116", shortDescription: "Next", inCatalog: true }
  ];
  const rows = buildPhaseRosterRowsWhenNoCurrent(
    phases,
    slice,
    ["107", "108"],
    115,
    ["108", "109"]
  );
  assert.deepEqual(
    rows.map((x) => ({ k: x.phaseKey, s: x.status })),
    [
      { k: "108", s: "delivered" },
      { k: "109", s: "future" },
      { k: "116", s: "next" }
    ]
  );
});

test("buildPhaseRosterRowsWhenNoCurrent prefers lastDeliveredPhaseKey over higher ordinals", () => {
  const slice = { currentKitPhase: null, nextKitPhase: null };
  const phases = [
    { phaseKey: "132", shortDescription: "Latest ship", inCatalog: true },
    { phaseKey: "144", shortDescription: "Older ship", inCatalog: true },
    { phaseKey: "145", shortDescription: "Upcoming", inCatalog: true }
  ];
  const rows = buildPhaseRosterRowsWhenNoCurrent(
    phases,
    slice,
    ["132", "144"],
    120,
    ["145"],
    "132"
  );
  assert.deepEqual(
    rows.map((x) => ({ k: x.phaseKey, s: x.status })),
    [
      { k: "132", s: "delivered" },
      { k: "145", s: "future" }
    ]
  );
});

test("buildPhaseRosterRowsWhenNoCurrent hides superseded catalog gaps below latest delivered", () => {
  const slice = { currentKitPhase: null, nextKitPhase: null };
  const phases = [
    { phaseKey: "132", shortDescription: "Latest ship", inCatalog: true },
    { phaseKey: "134", shortDescription: "Drained gap", inCatalog: true },
    { phaseKey: "135", shortDescription: "Empty placeholder", inCatalog: true },
    { phaseKey: "137", shortDescription: "Another drained gap", inCatalog: true },
    { phaseKey: "145", shortDescription: "Upcoming", inCatalog: true }
  ];
  const rows = buildPhaseRosterRowsWhenNoCurrent(
    phases,
    slice,
    ["132", "134", "137", "139", "140", "143", "144"],
    120,
    ["145"]
  );
  assert.deepEqual(
    rows.map((x) => ({ k: x.phaseKey, s: x.status })),
    [
      { k: "144", s: "delivered" },
      { k: "145", s: "future" }
    ]
  );
});

test("buildNarrowPhaseRosterRows returns no-workspace-ordinal when phase not parseable", () => {
  const r = buildNarrowPhaseRosterRows(
    [{ phaseKey: "1", shortDescription: null, inCatalog: true }],
    { currentKitPhase: "rolling", canonicalPhaseKey: null }
  );
  assert.equal(r.ok, false);
});

test("resolveWorkspacePhaseOrdinal ignores config hint when SQLite workspace phase is unset", async () => {
  const { resolveWorkspacePhaseOrdinal } = await import("../dist/views/phase-roster-display.js");
  assert.equal(
    resolveWorkspacePhaseOrdinal({
      currentKitPhase: null,
      workspaceStatusPhaseKey: null,
      canonicalPhaseKey: "119"
    }),
    null
  );
  assert.equal(
    resolveWorkspacePhaseOrdinal({
      currentKitPhase: "119",
      workspaceStatusPhaseKey: "119",
      canonicalPhaseKey: "119"
    }),
    119
  );
});

test("detectPhaseCloseoutOrderingRisk when later phases are delivered", () => {
  const phases = [
    { phaseKey: "118", shortDescription: "CI", inCatalog: true },
    { phaseKey: "119", shortDescription: "Sync", inCatalog: true },
    { phaseKey: "120", shortDescription: "Expand", inCatalog: true }
  ];
  const risk = detectPhaseCloseoutOrderingRisk({
    currentKitPhase: "118",
    phases,
    deliveredPhaseKeys: [],
    legacyDeliveredMaxOrdinal: 120
  });
  assert.ok(risk);
  assert.equal(risk.currentOrdinal, 118);
  assert.deepEqual(risk.laterDeliveredPhaseKeys, ["119", "120"]);
  assert.match(risk.message, /phase-closeout-ordering-recovery/);
});

test("detectPhaseCloseoutOrderingRisk returns null when aligned", () => {
  const phases = [
    { phaseKey: "118", shortDescription: "CI", inCatalog: true },
    { phaseKey: "119", shortDescription: "Sync", inCatalog: true }
  ];
  assert.equal(
    detectPhaseCloseoutOrderingRisk({
      currentKitPhase: "119",
      phases,
      deliveredPhaseKeys: ["118"],
      legacyDeliveredMaxOrdinal: 118
    }),
    null
  );
});
