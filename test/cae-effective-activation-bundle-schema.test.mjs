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

  const validDir = path.join(bundlesRoot, "valid");
  for (const name of fs.readdirSync(validDir).filter((f) => f.endsWith(".json"))) {
    it(`accepts fixtures/cae/bundles/valid/${name}`, () => {
      const data = JSON.parse(fs.readFileSync(path.join(validDir, name), "utf8"));
      assert.equal(validate(data), true, `${name}: ${ajv.errorsText(validate.errors)}`);
    });
  }
});
