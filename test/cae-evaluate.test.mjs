/**
 * CAE evaluator (T860).
 */
import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateActivationBundle } from "../dist/core/cae/cae-evaluate.js";
import { loadCaeRegistry } from "../dist/core/cae/cae-registry-load.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("CAE evaluateActivationBundle (T860)", () => {
  it("produces schema-valid bundle + trace for fixture context", () => {
    const ctx = JSON.parse(
      fs.readFileSync(path.join(root, "fixtures/cae/evaluation-context/valid/minimal.json"), "utf8")
    );
    const regRes = loadCaeRegistry(root);
    assert.equal(regRes.ok, true);
    const { bundle, trace, traceId } = evaluateActivationBundle(ctx, regRes.value, { evalMode: "live" });
    assert.equal(traceId, bundle.traceId);

    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const bundleSchema = JSON.parse(
      fs.readFileSync(path.join(root, "schemas/cae/effective-activation-bundle.v1.json"), "utf8")
    );
    const traceSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/cae/trace.v1.json"), "utf8"));
    const vB = ajv.compile(bundleSchema);
    const vT = ajv.compile(traceSchema);
    assert.equal(vB(bundle), true, ajv.errorsText(vB.errors));
    assert.equal(vT(trace), true, ajv.errorsText(vT.errors));

    assert.ok(bundle.families.do.length >= 1);
    assert.ok(bundle.families.policy.length >= 1);
  });

  it("is deterministic for fixed inputs", () => {
    const ctx = JSON.parse(
      fs.readFileSync(path.join(root, "fixtures/cae/evaluation-context/valid/minimal.json"), "utf8")
    );
    const regRes = loadCaeRegistry(root);
    assert.equal(regRes.ok, true);
    const a = evaluateActivationBundle(ctx, regRes.value);
    const b = evaluateActivationBundle(ctx, regRes.value);
    assert.deepEqual(a.bundle, b.bundle);
    assert.deepEqual(a.trace, b.trace);
  });
});
