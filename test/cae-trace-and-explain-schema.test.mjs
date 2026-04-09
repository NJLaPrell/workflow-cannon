/**
 * Validates CAE trace + explain-response fixtures (T846).
 */
import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const traceSchemaPath = path.join(root, "schemas/cae/trace.v1.json");
const explainSchemaPath = path.join(root, "schemas/cae/explain-response.v1.json");
const traceFixtures = path.join(root, "fixtures/cae/trace");
const explainFixtures = path.join(root, "fixtures/cae/explain");

describe("CAE trace schema (v1)", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const schema = JSON.parse(fs.readFileSync(traceSchemaPath, "utf8"));
  const validate = ajv.compile(schema);

  const validDir = path.join(traceFixtures, "valid");
  for (const name of fs.readdirSync(validDir).filter((f) => f.endsWith(".json"))) {
    it(`accepts fixtures/cae/trace/valid/${name}`, () => {
      const data = JSON.parse(fs.readFileSync(path.join(validDir, name), "utf8"));
      assert.equal(validate(data), true, `${name}: ${ajv.errorsText(validate.errors)}`);
    });
  }

  it("rejects unknown top-level keys", () => {
    const bad = {
      schemaVersion: 1,
      traceId: "cae.trace.bad",
      events: [],
      extra: true
    };
    assert.equal(validate(bad), false);
  });

  it("rejects eventType outside cae.trace namespace", () => {
    const bad = {
      schemaVersion: 1,
      traceId: "cae.trace.bad",
      events: [{ seq: 0, eventType: "nope.not.trace", payload: {} }]
    };
    assert.equal(validate(bad), false);
  });
});

describe("CAE explain-response schema (v1)", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const schema = JSON.parse(fs.readFileSync(explainSchemaPath, "utf8"));
  const validate = ajv.compile(schema);

  const validDir = path.join(explainFixtures, "valid");
  for (const name of fs.readdirSync(validDir).filter((f) => f.endsWith(".json"))) {
    it(`accepts fixtures/cae/explain/valid/${name}`, () => {
      const data = JSON.parse(fs.readFileSync(path.join(validDir, name), "utf8"));
      assert.equal(validate(data), true, `${name}: ${ajv.errorsText(validate.errors)}`);
    });
  }

  it("rejects missing textStability", () => {
    const bad = {
      schemaVersion: 1,
      traceId: "cae.trace.x",
      level: "summary",
      summaryText: "hi"
    };
    assert.equal(validate(bad), false);
  });
});

describe("CAE trace artifact stub resolves", () => {
  it("stub-trace-event.schema.json $ref loads trace.v1", () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const traceSchema = JSON.parse(fs.readFileSync(traceSchemaPath, "utf8"));
    ajv.addSchema(traceSchema);
    const stubPath = path.join(root, "tasks/cae/artifacts/stub-trace-event.schema.json");
    const stub = JSON.parse(fs.readFileSync(stubPath, "utf8"));
    const validate = ajv.compile(stub);
    const minimal = JSON.parse(
      fs.readFileSync(path.join(traceFixtures, "valid", "minimal.json"), "utf8")
    );
    assert.equal(validate(minimal), true, ajv.errorsText(validate.errors));
  });
});
