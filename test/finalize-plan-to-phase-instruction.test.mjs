/**
 * WP-6.1 / T100468 — finalize-plan-to-phase instruction registration and argv guards.
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
  "src/modules/planning/instructions/finalize-plan-to-phase.md"
);

describe("finalize-plan-to-phase instruction (T100468)", () => {
  it("is registered on the planning module manifest", () => {
    const row = BUILTIN_RUN_COMMAND_MANIFEST.find((r) => r.name === "finalize-plan-to-phase");
    assert.ok(row);
    assert.equal(row.moduleId, "planning");
    assert.equal(row.policyOperationId, "planning.finalize-plan-to-phase");
    assert.equal(row.policySensitivity, "sensitive-with-dryrun");
    const entries = builtinInstructionEntriesForModule("planning");
    assert.ok(entries.some((e) => e.name === "finalize-plan-to-phase"));
  });

  it("instruction file includes schema-only agent capsule and dry-run/persist examples", () => {
    const text = fs.readFileSync(instructionPath, "utf8");
    assert.ok(text.includes("agentCapsule|v=1|command=finalize-plan-to-phase"));
    assert.ok(text.includes("--schema-only"));
    assert.ok(text.includes('"dryRun":true'));
    assert.ok(text.includes('"dryRun":false'));
    assert.ok(text.includes('"policyApproval"'));
    assert.ok(text.includes("plan-artifact-not-accepted"));
  });

  it("buildRunArgsSchemaOnlyPayload returns permissive schema", () => {
    const payload = buildRunArgsSchemaOnlyPayload("finalize-plan-to-phase");
    assert.ok(payload);
    assert.equal(payload.ok, true);
    assert.equal(payload.code, "run-args-schema");
    assert.equal(payload.command, "finalize-plan-to-phase");
    assert.equal(payload.schemaSource, "manifest-permissive-fallback");
    assert.equal(payload.policy.operationId, "planning.finalize-plan-to-phase");
  });

  it("is Tier C when dryRun is true or omitted; Tier B when dryRun is false", () => {
    assert.equal(isSensitiveModuleCommand("finalize-plan-to-phase", { dryRun: true }), false);
    assert.equal(isSensitiveModuleCommand("finalize-plan-to-phase", {}), false);
    assert.equal(isSensitiveModuleCommand("finalize-plan-to-phase", { dryRun: false }), true);
  });

  it("stub handler validates planId and returns plan-artifact-not-found", async () => {
    const missingPlan = await planningModule.onCommand(
      { name: "finalize-plan-to-phase", args: { dryRun: true } },
      { runtimeVersion: "0.1", workspacePath: root }
    );
    assert.equal(missingPlan.ok, false);
    assert.equal(missingPlan.code, "invalid-run-args");

    const notFound = await planningModule.onCommand(
      {
        name: "finalize-plan-to-phase",
        args: { planId: "550e8400-e29b-41d4-a716-446655440000", dryRun: true }
      },
      { runtimeVersion: "0.1", workspacePath: root }
    );
    assert.equal(notFound.ok, false);
    assert.equal(notFound.code, "plan-artifact-not-found");
  });
});
