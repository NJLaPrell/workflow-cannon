/**
 * Validates CAE read-only CLI argv + success data schemas (T847).
 */
import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemas = {
  evaluationContext: path.join(root, "schemas/cae/evaluation-context.v1.json"),
  registryEntry: path.join(root, "schemas/cae/registry-entry.v1.json"),
  activationDefinition: path.join(root, "schemas/cae/activation-definition.schema.json"),
  effectiveBundle: path.join(root, "schemas/cae/effective-activation-bundle.v1.json"),
  trace: path.join(root, "schemas/cae/trace.v1.json"),
  explainResponse: path.join(root, "schemas/cae/explain-response.v1.json"),
  cliRequests: path.join(root, "schemas/cae/cli-read-only-requests.v1.json"),
  cliData: path.join(root, "schemas/cae/cli-read-only-data.v1.json")
};

function loadSchema(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function makeAjvWithCaeStack() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  for (const key of [
    "evaluationContext",
    "registryEntry",
    "activationDefinition",
    "effectiveBundle",
    "trace",
    "explainResponse",
    "cliRequests",
    "cliData"
  ]) {
    ajv.addSchema(loadSchema(schemas[key]));
  }
  return ajv;
}

function compileDef(ajv, schemaId, defName) {
  return ajv.compile({
    $ref: `${schemaId}#/$defs/${defName}`
  });
}

const REQ_ID = "https://workflow-cannon.dev/schemas/cae/cli-read-only-requests.v1.json";
const DATA_ID = "https://workflow-cannon.dev/schemas/cae/cli-read-only-data.v1.json";

describe("CAE cli-read-only-requests schema (v1)", () => {
  const ajv = makeAjvWithCaeStack();
  const validDir = path.join(root, "fixtures/cae/cli-requests/valid");

  const cases = [
    ["list-artifacts.json", "caeListArtifactsRequest"],
    ["get-artifact.json", "caeGetArtifactRequest"],
    ["list-activations.json", "caeListActivationsRequest"],
    ["get-activation.json", "caeGetActivationRequest"],
    ["evaluate.json", "caeEvaluateRequest"],
    ["explain-by-trace.json", "caeExplainByTraceRequest"],
    ["explain-by-replay.json", "caeExplainByReplayRequest"],
    ["health.json", "caeHealthRequest"],
    ["conflicts.json", "caeConflictsRequest"],
    ["get-trace.json", "caeGetTraceRequest"]
  ];

  for (const [file, def] of cases) {
    it(`accepts valid/${file} against ${def}`, () => {
      const validate = compileDef(ajv, REQ_ID, def);
      const data = JSON.parse(fs.readFileSync(path.join(validDir, file), "utf8"));
      assert.equal(validate(data), true, `${file}: ${ajv.errorsText(validate.errors)}`);
    });
  }

  it("caeExplainRequest oneOf accepts both branches", () => {
    const validate = compileDef(ajv, REQ_ID, "caeExplainRequest");
    const a = JSON.parse(fs.readFileSync(path.join(validDir, "explain-by-trace.json"), "utf8"));
    const b = JSON.parse(fs.readFileSync(path.join(validDir, "explain-by-replay.json"), "utf8"));
    assert.equal(validate(a), true, ajv.errorsText(validate.errors));
    assert.equal(validate(b), true, ajv.errorsText(validate.errors));
  });

  it("rejects explain payload with both traceId and evaluationContext", () => {
    const validate = compileDef(ajv, REQ_ID, "caeExplainRequest");
    const bad = {
      schemaVersion: 1,
      traceId: "cae.trace.x",
      evaluationContext: JSON.parse(
        fs.readFileSync(path.join(root, "fixtures/cae/evaluation-context/valid/minimal.json"), "utf8")
      )
    };
    assert.equal(validate(bad), false);
  });
});

describe("CAE cli-read-only-data schema (v1)", () => {
  const ajv = makeAjvWithCaeStack();

  it("accepts caeListArtifactsData", () => {
    const validate = compileDef(ajv, DATA_ID, "caeListArtifactsData");
    const ok = validate({
      schemaVersion: 1,
      artifactIds: ["cae.playbook.machine-playbooks"],
      nextCursor: null
    });
    assert.equal(ok, true, ajv.errorsText(validate.errors));
  });

  it("accepts caeGetArtifactData", () => {
    const validate = compileDef(ajv, DATA_ID, "caeGetArtifactData");
    const artifact = JSON.parse(
      fs.readFileSync(path.join(root, "fixtures/cae/registry-entries/valid/playbook-machine-playbooks.json"), "utf8")
    );
    assert.equal(validate({ schemaVersion: 1, artifact }), true, ajv.errorsText(validate.errors));
  });

  it("accepts caeGetActivationData", () => {
    const validate = compileDef(ajv, DATA_ID, "caeGetActivationData");
    const activation = JSON.parse(
      fs.readFileSync(path.join(root, "fixtures/cae/activations/valid/valid-policy-phase70.json"), "utf8")
    );
    assert.equal(validate({ schemaVersion: 1, activation }), true, ajv.errorsText(validate.errors));
  });

  it("accepts caeEvaluateData (composed bundle + trace)", () => {
    const validate = compileDef(ajv, DATA_ID, "caeEvaluateData");
    const bundle = JSON.parse(
      fs.readFileSync(path.join(root, "fixtures/cae/bundles/valid/minimal.json"), "utf8")
    );
    const trace = JSON.parse(fs.readFileSync(path.join(root, "fixtures/cae/trace/valid/minimal.json"), "utf8"));
    trace.traceId = bundle.traceId;
    const ok = validate({
      schemaVersion: 1,
      traceId: bundle.traceId,
      bundle,
      trace,
      ephemeral: true
    });
    assert.equal(ok, true, ajv.errorsText(validate.errors));
  });

  it("accepts caeExplainData", () => {
    const validate = compileDef(ajv, DATA_ID, "caeExplainData");
    const explanation = JSON.parse(
      fs.readFileSync(path.join(root, "fixtures/cae/explain/valid/summary.json"), "utf8")
    );
    assert.equal(validate({ schemaVersion: 1, explanation }), true, ajv.errorsText(validate.errors));
  });

  it("accepts caeHealthData", () => {
    const validate = compileDef(ajv, DATA_ID, "caeHealthData");
    const ok = validate({
      schemaVersion: 1,
      caeEnabled: false,
      registryStatus: "absent",
      issues: [{ code: "cae.registry.missing", detail: "stub" }]
    });
    assert.equal(ok, true, ajv.errorsText(validate.errors));
  });

  it("accepts caeConflictsData", () => {
    const validate = compileDef(ajv, DATA_ID, "caeConflictsData");
    const bundle = JSON.parse(
      fs.readFileSync(path.join(root, "fixtures/cae/bundles/valid/minimal.json"), "utf8")
    );
    const ok = validate({
      schemaVersion: 1,
      traceId: bundle.traceId,
      conflictShadowSummary: bundle.conflictShadowSummary
    });
    assert.equal(ok, true, ajv.errorsText(validate.errors));
  });

  it("accepts caeGetTraceData", () => {
    const validate = compileDef(ajv, DATA_ID, "caeGetTraceData");
    const trace = JSON.parse(
      fs.readFileSync(path.join(root, "fixtures/cae/trace/valid/merge-lifecycle-sample.json"), "utf8")
    );
    assert.equal(validate({ schemaVersion: 1, trace, ephemeral: true }), true, ajv.errorsText(validate.errors));
  });
});
