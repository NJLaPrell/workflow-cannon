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
});
