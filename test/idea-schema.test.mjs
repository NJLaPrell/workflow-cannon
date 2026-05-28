import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas/idea.schema.json");

function compileIdeaSchema() {
  const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  return { ajv, validate: ajv.compile(schema) };
}

test("idea schema accepts a persisted idea record", () => {
  const { ajv, validate } = compileIdeaSchema();
  const validIdea = {
    id: "I001",
    title: "Try planner chat from Ideas",
    note: "Capture before converting to a plan artifact.",
    status: "open",
    sortOrder: 0,
    linkedPlanArtifact: "plan-ideas-001",
    previousPlanArtifacts: ["plan-ideas-000"],
    createdAt: "2026-05-27T12:00:00.000Z",
    updatedAt: "2026-05-27T12:00:00.000Z"
  };

  assert.equal(validate(validIdea), true, ajv.errorsText(validate.errors));
});

test("idea schema rejects task ids", () => {
  const { validate } = compileIdeaSchema();

  assert.equal(
    validate({
      id: "T100528",
      title: "Wrong id family",
      status: "open",
      sortOrder: 0,
      createdAt: "2026-05-27T12:00:00.000Z",
      updatedAt: "2026-05-27T12:00:00.000Z"
    }),
    false
  );
});
