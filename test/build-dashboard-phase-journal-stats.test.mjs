import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardPhaseJournalStats,
  PHASE_JOURNAL_SILENCE_COMPLETED_THRESHOLD
} from "../dist/modules/task-engine/dashboard/build-dashboard-phase-journal-stats.js";

test("buildDashboardPhaseJournalStats returns unavailable when db is null", () => {
  const stats = buildDashboardPhaseJournalStats({
    db: null,
    currentKitPhase: "100",
    completedDeliveryTaskCount: 5
  });
  assert.equal(stats.schemaVersion, 1);
  assert.equal(stats.available, false);
  assert.equal(stats.currentPhase.silenceWarning, false);
});

test("PHASE_JOURNAL_SILENCE_COMPLETED_THRESHOLD is at least 1", () => {
  assert.ok(PHASE_JOURNAL_SILENCE_COMPLETED_THRESHOLD >= 1);
});
