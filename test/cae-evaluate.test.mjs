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

    assert.ok(bundle.families.policy.length >= 1);
    // `do` may be empty when policy activations claim the same artifact ids (policy wins).
  });

  it("shadow mode emits shadowObservation + evaluationPipelineMode", () => {
    const ctx = JSON.parse(
      fs.readFileSync(path.join(root, "fixtures/cae/evaluation-context/valid/minimal.json"), "utf8")
    );
    const regRes = loadCaeRegistry(root);
    assert.equal(regRes.ok, true);
    const { bundle } = evaluateActivationBundle(ctx, regRes.value, { evalMode: "shadow" });
    assert.equal(bundle.evaluationPipelineMode, "shadow");
    assert.ok(bundle.shadowObservation);
    assert.ok(Array.isArray(bundle.shadowObservation.wouldActivate));
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const bundleSchema = JSON.parse(
      fs.readFileSync(path.join(root, "schemas/cae/effective-activation-bundle.v1.json"), "utf8")
    );
    const vB = ajv.compile(bundleSchema);
    assert.equal(vB(bundle), true, ajv.errorsText(vB.errors));
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

  it("phase-journal activations attach cae.runbook.phase-journal-operator regardless of phaseKey", () => {
    const ctx = {
      schemaVersion: 1,
      task: {
        taskId: "T100041",
        status: "in_progress",
        phaseKey: "104"
      },
      command: {
        name: "run-transition",
        moduleId: "task-engine",
        argvSummary: '{"taskId":"T100041","action":"complete"}'
      },
      workspace: {
        currentKitPhase: "104",
        nextKitPhase: "105",
        workspaceRootFingerprint: "sha256:testphasejournal"
      },
      governance: {
        policyApprovalRequired: true,
        approvalTierHint: "A",
        policySurface: "run-json"
      },
      queue: {
        readyQueueDepth: 1,
        suggestedNextTaskId: null
      },
      mapSignals: null
    };
    const regRes = loadCaeRegistry(root);
    assert.equal(regRes.ok, true);
    const { bundle } = evaluateActivationBundle(ctx, regRes.value, { evalMode: "live" });
    const journalId = "cae.runbook.phase-journal-operator";
    const thinkArts =
      bundle.families.think?.flatMap((row) => row.artifactIds ?? []) ?? [];
    assert.ok(
      thinkArts.includes(journalId),
      "expected phase-journal operator artifact in think bundle for run-transition"
    );

    const ctxGet = { ...ctx, command: { ...ctx.command, name: "get-phase-context" } };
    const b2 = evaluateActivationBundle(ctxGet, regRes.value, { evalMode: "live" });
    const think2 =
      b2.bundle.families.think?.flatMap((row) => row.artifactIds ?? []) ?? [];
    assert.ok(think2.includes(journalId), "expected journal artifact for get-phase-context");

    const ctxAdd = { ...ctx, command: { ...ctx.command, name: "add-phase-note" } };
    const b3 = evaluateActivationBundle(ctxAdd, regRes.value, { evalMode: "live" });
    const doArts3 =
      b3.bundle.families.do?.flatMap((row) => row.artifactIds ?? []) ?? [];
    assert.ok(
      doArts3.includes(journalId),
      "expected journal artifact in do bundle for add-phase-note"
    );
  });

  it("run-transition surfaces cae.playbook.improvement-discovery in review bundle", () => {
    const ctx = {
      schemaVersion: 1,
      task: { taskId: "T100305", status: "in_progress", phaseKey: "101" },
      command: {
        name: "run-transition",
        moduleId: "task-engine",
        argvSummary: '{"taskId":"T100305","action":"complete"}'
      },
      workspace: {
        currentKitPhase: "101",
        nextKitPhase: "102",
        workspaceRootFingerprint: "sha256:testimprovementdiscovery"
      },
      governance: {
        policyApprovalRequired: true,
        approvalTierHint: "A",
        policySurface: "run-json"
      },
      queue: { readyQueueDepth: 0, suggestedNextTaskId: null },
      mapSignals: null
    };
    const regRes = loadCaeRegistry(root);
    assert.equal(regRes.ok, true);
    const { bundle } = evaluateActivationBundle(ctx, regRes.value, { evalMode: "live" });
    const reviewArts =
      bundle.families.review?.flatMap((row) => row.artifactIds ?? []) ?? [];
    assert.ok(
      reviewArts.includes("cae.playbook.improvement-discovery"),
      "expected improvement-discovery playbook in review bundle for run-transition"
    );
  });
});
