/**
 * Validates fixtures/cae/bundles against schemas/cae/effective-activation-bundle.v1.json (T843).
 */
import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas/cae/effective-activation-bundle.v1.json");
const bundlesRoot = path.join(root, "fixtures/cae/bundles");

describe("CAE effective-activation-bundle schema (v1)", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const validate = ajv.compile(schema);

  it("accepts fixtures/cae/bundles/valid/minimal.json", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(bundlesRoot, "valid", "minimal.json"), "utf8")
    );
    assert.equal(validate(data), true, ajv.errorsText(validate.errors));
  });
});
