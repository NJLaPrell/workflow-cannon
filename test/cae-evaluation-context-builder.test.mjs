/**
 * CAE evaluation context builder (T859).
 */
import Ajv2020 from "ajv/dist/2020.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CAE_GLOBAL_TASK_ID,
  buildEvaluationContext,
  CaeEvaluationContextBuilderError,
  canonicalizeEvaluationContextForHash,
  deriveArgvSummary
} from "../dist/core/cae/evaluation-context-builder.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas/cae/evaluation-context.v1.json");

describe("CAE evaluation context builder (T859)", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const validate = ajv.compile(schema);

  it("matches fixtures/cae/evaluation-context/valid/minimal.json shape", () => {
    const expected = JSON.parse(
      fs.readFileSync(path.join(root, "fixtures/cae/evaluation-context/valid/minimal.json"), "utf8")
    );
    const ctx = buildEvaluationContext({
      taskRow: {
        id: "T842",
        status: "in_progress",
        phaseKey: "70",
        title: "Evaluation context contract v1",
        tags: ["cae"],
        metadata: {
          specPath: "tasks/cae/specs/T842.md",
          risk: "medium"
        }
      },
      command: {
        name: "get-task",
        moduleId: "task-engine",
        argvSummary: '{"taskId":"T842"}'
      },
      workspace: {
        currentKitPhase: "70",
        nextKitPhase: "71",
        workspaceRootFingerprint: "sha256:deadbeef"
      },
      governance: {
        policyApprovalRequired: false,
        approvalTierHint: "C",
        policySurface: "run-json"
      },
      queue: {
        readyQueueDepth: 12,
        suggestedNextTaskId: "T843"
      }
    });
    assert.deepEqual(ctx, expected);
    assert.equal(validate(ctx), true, ajv.errorsText(validate.errors));
  });

  it("uses global task sentinel when task row missing", () => {
    const ctx = buildEvaluationContext({
      taskRow: null,
      command: { name: "list-tasks" },
      workspace: { currentKitPhase: "68" },
      governance: {
        policyApprovalRequired: false,
        approvalTierHint: "C"
      },
      queue: { readyQueueDepth: 0 }
    });
    assert.equal(ctx.task.taskId, CAE_GLOBAL_TASK_ID);
    assert.equal(ctx.task.phaseKey, "68");
    assert.equal(validate(ctx), true, ajv.errorsText(validate.errors));
  });

  it("rejects unknown task.metadata keys", () => {
    assert.throws(
      () =>
        buildEvaluationContext({
          taskRow: {
            id: "T001",
            status: "ready",
            phaseKey: "1",
            metadata: { evilKey: "nope" }
          },
          command: { name: "x" },
          workspace: { currentKitPhase: "1" },
          governance: { policyApprovalRequired: false, approvalTierHint: "C" },
          queue: { readyQueueDepth: 0 }
        }),
      (e) => e instanceof CaeEvaluationContextBuilderError && e.code === "cae-context-metadata-unknown-key"
    );
  });

  it("deriveArgvSummary strips policyApproval", () => {
    const s = deriveArgvSummary({
      taskId: "T1",
      policyApproval: { confirmed: true, rationale: "secret" }
    });
    assert.ok(s);
    assert.ok(!s.includes("secret"));
    assert.ok(s.includes("T1"));
  });

  it("canonicalizeEvaluationContextForHash is stable under key order", () => {
    const a = buildEvaluationContext({
      taskRow: { id: "T1", status: "ready", phaseKey: "1" },
      command: { name: "a" },
      workspace: { currentKitPhase: "1" },
      governance: { policyApprovalRequired: false, approvalTierHint: "C" },
      queue: { readyQueueDepth: 1 }
    });
    const b = buildEvaluationContext({
      taskRow: { id: "T1", status: "ready", phaseKey: "1" },
      command: { name: "a" },
      workspace: { currentKitPhase: "1" },
      governance: { policyApprovalRequired: false, approvalTierHint: "C" },
      queue: { readyQueueDepth: 1 }
    });
    assert.equal(canonicalizeEvaluationContextForHash(a), canonicalizeEvaluationContextForHash(b));
  });
});
