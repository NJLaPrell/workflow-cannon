/**
 * Validates fixtures/cae/evaluation-context against schemas/cae/evaluation-context.v1.json (T842).
 */
import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas/cae/evaluation-context.v1.json");
const rootDir = path.join(root, "fixtures/cae/evaluation-context");

describe("CAE evaluation-context schema (v1)", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const validate = ajv.compile(schema);

  function loadDir(sub) {
    const dir = path.join(rootDir, sub);
    return fs.readdirSync(dir).map((name) => ({
      name,
      data: JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))
    }));
  }

  it("accepts fixtures under valid/", () => {
    for (const { name, data } of loadDir("valid")) {
      assert.equal(validate(data), true, `${name}: ${ajv.errorsText(validate.errors)}`);
    }
  });

  it("rejects fixtures under invalid/", () => {
    for (const { name, data } of loadDir("invalid")) {
      assert.equal(validate(data), false, `${name} should fail schema`);
    }
  });
});
