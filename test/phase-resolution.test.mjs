import test from "node:test";
import assert from "node:assert/strict";

import { resolveCanonicalPhase } from "../dist/modules/task-engine/phase-resolution.js";

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
