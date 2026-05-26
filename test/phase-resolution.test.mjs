import test from "node:test";
import assert from "node:assert/strict";

import { resolveCanonicalPhase, resolveLegacyDeliveredMaxOrdinal, resolvePhaseScheduleRelation, isPhaseLegacyDeliveredByOrdinal } from "../dist/modules/task-engine/phase-resolution.js";

test("resolveCanonicalPhase prefers workspace status over config", () => {
  const r = resolveCanonicalPhase({
    effectiveConfig: { kit: { currentPhaseNumber: 99 } },
    workspaceStatus: {
      currentKitPhase: "67 — foo",
      nextKitPhase: null,
      activeFocus: null,
      lastUpdated: null,
      blockers: [],
      pendingDecisions: [],
      nextAgentActions: []
    }
  });
  assert.equal(r.canonicalPhaseKey, "67");
  assert.equal(r.source, "workspace-status");
  assert.equal(r.configMatchesWorkspaceStatus, false);
});

test("resolveCanonicalPhase falls back to config when workspace status has no phase digits", () => {
  const r = resolveCanonicalPhase({
    effectiveConfig: { kit: { currentPhaseNumber: 42 } },
    workspaceStatus: null
  });
  assert.equal(r.canonicalPhaseKey, "42");
  assert.equal(r.source, "config");
  assert.equal(r.configMatchesWorkspaceStatus, null);
});

test("resolvePhaseScheduleRelation orders numeric phase keys against workspace current", () => {
  assert.equal(
    resolvePhaseScheduleRelation({ taskPhaseKey: "87", workspacePhaseKey: "87" }),
    "current"
  );
  assert.equal(
    resolvePhaseScheduleRelation({ taskPhaseKey: "88", workspacePhaseKey: "87" }),
    "future"
  );
  assert.equal(
    resolvePhaseScheduleRelation({ taskPhaseKey: "86", workspacePhaseKey: "87" }),
    "past"
  );
});

test("resolveLegacyDeliveredMaxOrdinal reads kit.phaseDelivery.legacyDeliveredMaxOrdinal", () => {
  assert.equal(
    resolveLegacyDeliveredMaxOrdinal({ kit: { phaseDelivery: { legacyDeliveredMaxOrdinal: 105 } } }),
    105
  );
  assert.equal(resolveLegacyDeliveredMaxOrdinal({}), null);
});

test("isPhaseLegacyDeliveredByOrdinal matches leading ordinals within ceiling", () => {
  assert.equal(isPhaseLegacyDeliveredByOrdinal("105", 105), true);
  assert.equal(isPhaseLegacyDeliveredByOrdinal("0", 105), true);
  assert.equal(isPhaseLegacyDeliveredByOrdinal("106", 105), false);
  assert.equal(isPhaseLegacyDeliveredByOrdinal("custom", 105), false);
});
