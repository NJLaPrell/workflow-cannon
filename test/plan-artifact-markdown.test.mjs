import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "fixtures/planning");
const schemasDir = path.join(root, "schemas/planning");

const { renderPlanArtifactMarkdown } = await import(
  path.join(root, "dist/core/planning/render-plan-artifact-markdown.js")
);

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function loadGolden(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

function loadPlanSchemaValidator() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemasDir, "plan-artifact-wbs-item.v1.schema.json"), "utf8")));
  const planSchema = JSON.parse(fs.readFileSync(path.join(schemasDir, "plan-artifact.v1.schema.json"), "utf8"));
  ajv.addSchema(planSchema);
  return ajv.getSchema(planSchema.$id);
}

describe("renderPlanArtifactMarkdown", () => {
  const validate = loadPlanSchemaValidator();

  it("renders minimal fixture matching golden snapshot", () => {
    const plan = loadJson("plan-artifact-minimal.valid.v1.json");
    assert.equal(validate(plan), true);
    const md = renderPlanArtifactMarkdown(plan);
    assert.equal(md, loadGolden("plan-artifact-minimal.rendered.md"));
    assert.ok(!md.includes("## User stories"));
    assert.ok(!md.includes("## Architecture"));
  });

  it("renders full-feature fixture matching golden snapshot", () => {
    const plan = loadJson("plan-artifact-full-feature.valid.v1.json");
    assert.equal(validate(plan), true);
    const md = renderPlanArtifactMarkdown(plan);
    assert.equal(md, loadGolden("plan-artifact-full-feature.rendered.md"));
    assert.ok(md.includes("## User stories"));
    assert.ok(md.includes("## Architecture"));
    assert.ok(md.includes("## UI / UX direction"));
    assert.ok(md.includes("WBS-2"));
  });
});
