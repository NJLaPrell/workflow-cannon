/**
 * WP-5.1 / T100465 — accept-plan-artifact instruction registration and argv guards.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { planningModule } from "../dist/index.js";
import { buildRunArgsSchemaOnlyPayload } from "../dist/core/run-args-pilot-validation.js";
import {
  BUILTIN_RUN_COMMAND_MANIFEST,
  builtinInstructionEntriesForModule
} from "../dist/contracts/builtin-run-command-manifest.js";
import { isSensitiveModuleCommand } from "../dist/core/policy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const instructionPath = path.join(
  root,
  "src/modules/planning/instructions/accept-plan-artifact.md"
);

const SAMPLE_APPROVAL = {
  schemaVersion: 1,
  confirmed: true,
  approvedVersion: 1,
  approvedAt: "2026-05-27T07:00:00.000Z",
  approvedBy: "operator@example.com",
  planRef: "plan-artifact:550e8400-e29b-41d4-a716-446655440000"
};

describe("accept-plan-artifact instruction (T100465)", () => {
  it("is registered on the planning module manifest", () => {
    const row = BUILTIN_RUN_COMMAND_MANIFEST.find((r) => r.name === "accept-plan-artifact");
    assert.ok(row);
    assert.equal(row.moduleId, "planning");
    assert.equal(row.policyOperationId, "planning.accept-plan-artifact");
    assert.equal(row.policySensitivity, "sensitive");
    const entries = builtinInstructionEntriesForModule("planning");
    assert.ok(entries.some((e) => e.name === "accept-plan-artifact"));
  });

  it("instruction file includes schema-only agent capsule and example JSON", () => {
    const text = fs.readFileSync(instructionPath, "utf8");
    assert.ok(text.includes("agentCapsule|v=1|command=accept-plan-artifact"));
    assert.ok(text.includes("--schema-only"));
    assert.ok(text.includes('"approvalRecord"'));
    assert.ok(text.includes('"policyApproval"'));
  });

  it("buildRunArgsSchemaOnlyPayload returns permissive schema", () => {
    const payload = buildRunArgsSchemaOnlyPayload("accept-plan-artifact");
    assert.ok(payload);
    assert.equal(payload.ok, true);
    assert.equal(payload.code, "run-args-schema");
    assert.equal(payload.command, "accept-plan-artifact");
    assert.equal(payload.schemaSource, "manifest-permissive-fallback");
    assert.equal(payload.policy.operationId, "planning.accept-plan-artifact");
  });

  it("is always Tier B (sensitive)", () => {
    assert.equal(isSensitiveModuleCommand("accept-plan-artifact", {}), true);
    assert.equal(isSensitiveModuleCommand("accept-plan-artifact", { strict: false }), true);
  });

  it("stub handler validates planId and approvalRecord argv", async () => {
    const missingPlan = await planningModule.onCommand(
      { name: "accept-plan-artifact", args: { approvalRecord: SAMPLE_APPROVAL } },
      { runtimeVersion: "0.1", workspacePath: root }
    );
    assert.equal(missingPlan.ok, false);
    assert.equal(missingPlan.code, "invalid-run-args");

    const missingRecord = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: { planId: "550e8400-e29b-41d4-a716-446655440000" }
      },
      { runtimeVersion: "0.1", workspacePath: root }
    );
    assert.equal(missingRecord.ok, false);
    assert.equal(missingRecord.code, "invalid-run-args");

    const stub = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: "550e8400-e29b-41d4-a716-446655440000",
          approvalRecord: SAMPLE_APPROVAL
        }
      },
      { runtimeVersion: "0.1", workspacePath: root }
    );
    assert.equal(stub.ok, false);
    assert.equal(stub.code, "plan-artifact-command-not-implemented");
    assert.ok(stub.remediation?.instructionPath?.includes("accept-plan-artifact.md"));
  });
});
