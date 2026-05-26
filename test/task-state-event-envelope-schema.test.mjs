import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateTaskStateEventEnvelope } from "../dist/modules/task-engine/task-state-events/validate-envelope.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(
  root,
  "src/modules/task-engine/task-state-events/fixtures"
);

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

test("fixtures validate as TaskStateEventEnvelopeV1", () => {
  for (const file of ["valid-envelope-genesis.v1.json", "valid-envelope-with-parent.v1.json"]) {
    const parsed = loadFixture(file);
    const result = validateTaskStateEventEnvelope(parsed);
    assert.equal(result.ok, true, file);
    assert.equal(result.data.schemaVersion, 1);
    assert.equal(typeof result.data.eventId, "string");
    assert.equal(typeof result.data.sequence, "number");
  }
});

test("validateTaskStateEventEnvelope rejects missing command.name", () => {
  const bad = loadFixture("valid-envelope-genesis.v1.json");
  delete bad.command.name;
  const result = validateTaskStateEventEnvelope(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("command") || e.includes("name")));
});

test("validateTaskStateEventEnvelope rejects invalid argvDigest", () => {
  const bad = loadFixture("valid-envelope-genesis.v1.json");
  bad.command.argvDigest = "not-a-sha256";
  const result = validateTaskStateEventEnvelope(bad);
  assert.equal(result.ok, false);
});
