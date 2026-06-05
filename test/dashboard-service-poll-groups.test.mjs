import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DASHBOARD_SERVICE_POLL_INTERVAL_MS,
  dashboardServiceSliceNamesForPollGroup,
  listDashboardServicePollGroups
} from "../dist/services/dashboard-service/poll-groups.js";

describe("dashboard service poll groups", () => {
  it("uses handoff tier intervals", () => {
    assert.equal(DASHBOARD_SERVICE_POLL_INTERVAL_MS.critical, 2000);
    assert.equal(DASHBOARD_SERVICE_POLL_INTERVAL_MS.queue, 5000);
    assert.equal(DASHBOARD_SERVICE_POLL_INTERVAL_MS.ops, 10000);
    assert.equal(DASHBOARD_SERVICE_POLL_INTERVAL_MS.status, 30000);
  });

  it("maps slices to poll groups", () => {
    assert.deepEqual(dashboardServiceSliceNamesForPollGroup("critical").sort(), [
      "agent",
      "overview",
      "phase",
      "planArtifact"
    ]);
    assert.deepEqual(dashboardServiceSliceNamesForPollGroup("live").sort(), ["agentActivity"]);
    assert.deepEqual(dashboardServiceSliceNamesForPollGroup("queue").sort(), ["ideas", "queue"]);
    assert.ok(dashboardServiceSliceNamesForPollGroup("manual").includes("cae"));
    assert.equal(listDashboardServicePollGroups().length, 5);
  });
});
