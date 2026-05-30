import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapServiceSnapshotToDashboardSnapshot } from "../dist/views/dashboard/dashboard-service-mapper.js";

describe("dashboard service mapper", () => {
  it("maps service snapshot into extension store shape with planningGeneration", () => {
    const mapped = mapServiceSnapshotToDashboardSnapshot({
      schemaVersion: 1,
      serviceVersion: "0.99.19",
      generatedAt: "2026-05-30T03:00:00.000Z",
      generation: 3,
      planningGeneration: 4267,
      slices: {
        overview: {
          status: "fresh",
          updatedAt: "2026-05-30T03:00:00.000Z",
          source: "dashboard-summary:overview",
          value: { schemaVersion: 7, planningGeneration: 4267, readyQueueCount: 2 }
        }
      }
    });
    assert.equal(mapped.planningGeneration, 4267);
    assert.equal(mapped.slices.overview.status, "fresh");
    assert.equal(mapped.slices.overview.value?.readyQueueCount, 2);
  });
});
