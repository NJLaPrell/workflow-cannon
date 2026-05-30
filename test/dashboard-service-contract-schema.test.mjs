/**
 * Validates dashboard service HTTP/SSE contract schemas (T100594).
 */
import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(root, "schemas", name), "utf8"));
}

function makeAjv() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addSchema(loadSchema("dashboard-service-snapshot.v1.json"));
  ajv.addSchema(loadSchema("dashboard-service-event.v1.json"));
  ajv.addSchema(loadSchema("runtime-service-status.v1.json"));
  ajv.addSchema(loadSchema("task-sync-status.v1.json"));
  ajv.addSchema(loadSchema("task-sync-flush-result.v1.json"));
  return ajv;
}

describe("dashboard service contract schemas", () => {
  it("accepts a minimal snapshot payload", () => {
    const ajv = makeAjv();
    const validate = ajv.getSchema("https://workflow-cannon.dev/schemas/dashboard-service-snapshot.v1.json");
    assert.ok(validate);
    const sample = {
      schemaVersion: 1,
      serviceVersion: "0.99.19",
      generatedAt: "2026-05-30T02:00:00.000Z",
      generation: 1,
      planningGeneration: 4253,
      slices: {
        overview: {
          status: "fresh",
          updatedAt: "2026-05-30T02:00:00.000Z",
          source: "dashboard-summary:overview",
          value: { schemaVersion: 7 }
        }
      }
    };
    assert.equal(validate(sample), true, JSON.stringify(validate.errors));
  });

  it("accepts snapshot, slice, and error SSE events", () => {
    const ajv = makeAjv();
    const validate = ajv.getSchema("https://workflow-cannon.dev/schemas/dashboard-service-event.v1.json");
    assert.ok(validate);
    const events = [
      {
        type: "dashboard.snapshot.updated",
        generation: 2,
        changedSlices: ["queue"],
        updatedAt: "2026-05-30T02:00:01.000Z"
      },
      {
        type: "dashboard.slice.updated",
        generation: 3,
        slice: "queue",
        updatedAt: "2026-05-30T02:00:02.000Z"
      },
      {
        type: "dashboard.service.error",
        message: "slice refresh failed",
        code: "slice-refresh-failed"
      }
    ];
    for (const event of events) {
      assert.equal(validate(event), true, JSON.stringify(validate.errors));
    }
  });

  it("accepts runtime service status and task sync wire payloads", () => {
    const ajv = makeAjv();
    const statusValidate = ajv.getSchema(
      "https://workflow-cannon.dev/schemas/runtime-service-status.v1.json"
    );
    const syncValidate = ajv.getSchema("https://workflow-cannon.dev/schemas/task-sync-status.v1.json");
    const flushValidate = ajv.getSchema(
      "https://workflow-cannon.dev/schemas/task-sync-flush-result.v1.json"
    );
    assert.ok(statusValidate);
    assert.ok(syncValidate);
    assert.ok(flushValidate);

    assert.equal(
      statusValidate({
        schemaVersion: 1,
        generatedAt: "2026-05-30T19:00:00.000Z",
        serviceVersion: "0.99.21",
        health: "ok",
        uptimeMs: 42,
        sseClients: 0,
        dashboard: {
          generation: 1,
          planningGeneration: 4379,
          staleSlices: [],
          failingSlices: [],
          lastSnapshotAt: "2026-05-30T19:00:00.000Z"
        }
      }),
      true,
      JSON.stringify(statusValidate.errors)
    );

    assert.equal(
      syncValidate({
        schemaVersion: 1,
        generatedAt: "2026-05-30T19:00:00.000Z",
        syncState: "current",
        reason: "Local projection matches branch head sequence.",
        localProjection: "fresh",
        recommendedAction: "none",
        branch: "workflow-cannon/task-state",
        remoteLatestSequence: 600,
        localAppliedSequence: 600,
        outbox: {
          pending: 0,
          publishing: 0,
          failed: 0,
          conflict: 0,
          oldestPendingAgeMs: 0,
          latestPublishedAt: null
        }
      }),
      true,
      JSON.stringify(syncValidate.errors)
    );

    assert.equal(
      flushValidate({
        schemaVersion: 1,
        generatedAt: "2026-05-30T19:00:00.000Z",
        ok: true,
        code: "task-sync-nothing-to-flush",
        enabled: true,
        publishedCount: 0,
        conflictCount: 0,
        failedCount: 0,
        deferredCount: 0
      }),
      true,
      JSON.stringify(flushValidate.errors)
    );
  });
});
