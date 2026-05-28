import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemasDir = path.join(root, "schemas", "planning");
const fixturesDir = path.join(root, "fixtures", "planning");

function loadValidator() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const wbsSchema = JSON.parse(
    fs.readFileSync(path.join(schemasDir, "plan-artifact-wbs-item.v1.schema.json"), "utf8")
  );
  const planSchema = JSON.parse(
    fs.readFileSync(path.join(schemasDir, "plan-artifact.v1.schema.json"), "utf8")
  );
  ajv.addSchema(wbsSchema);
  ajv.addSchema(planSchema);
  const validate = ajv.getSchema(planSchema.$id);
  assert.ok(validate, "plan-artifact.v1 schema should register");
  return validate;
}

describe("plan-artifact.v1 JSON Schema", () => {
  const validate = loadValidator();

  it("validates minimal fixture", () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "plan-artifact-minimal.valid.v1.json"), "utf8")
    );
    assert.equal(validate(doc), true, validate.errors?.map((e) => e.message).join("; "));
  });

  it("rejects empty goals", () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "plan-artifact-minimal.valid.v1.json"), "utf8")
    );
    doc.goals = [];
    assert.equal(validate(doc), false);
  });

  it("rejects empty identity title", () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "plan-artifact-minimal.valid.v1.json"), "utf8")
    );
    doc.identity.title = "";
    assert.equal(validate(doc), false);
  });

  it("rejects wrong schemaVersion", () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "plan-artifact-minimal.valid.v1.json"), "utf8")
    );
    doc.schemaVersion = 2;
    assert.equal(validate(doc), false);
  });

  it("accepts idea provenance fields", () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "plan-artifact-minimal.valid.v1.json"), "utf8")
    );
    doc.provenance.sourceIdeaId = "I123";
    doc.provenance.previousPlanArtifacts = ["plan-artifact:old-1", "plan-artifact:old-2"];
    assert.equal(validate(doc), true, validate.errors?.map((e) => e.message).join("; "));
  });

  it("rejects empty idea provenance values", () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "plan-artifact-minimal.valid.v1.json"), "utf8")
    );
    doc.provenance.sourceIdeaId = "";
    doc.provenance.previousPlanArtifacts = [""];
    assert.equal(validate(doc), false);
  });
});
