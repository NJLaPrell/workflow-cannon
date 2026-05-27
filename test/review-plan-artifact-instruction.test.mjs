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
  "src/modules/planning/instructions/review-plan-artifact.md"
);

describe("review-plan-artifact instruction (T100459)", () => {
  it("is registered on the planning module manifest", () => {
    const row = BUILTIN_RUN_COMMAND_MANIFEST.find((r) => r.name === "review-plan-artifact");
    assert.ok(row);
    assert.equal(row.moduleId, "planning");
    assert.equal(row.policyOperationId, "planning.review-plan-artifact");
    assert.equal(row.policySensitivity, "sensitive-with-dryrun");
    const entries = builtinInstructionEntriesForModule("planning");
    assert.ok(entries.some((e) => e.name === "review-plan-artifact"));
  });

  it("instruction file includes schema-only agent capsule", () => {
    const text = fs.readFileSync(instructionPath, "utf8");
    assert.ok(text.includes("agentCapsule|v=1|command=review-plan-artifact"));
    assert.ok(text.includes("--schema-only"));
  });

  it("buildRunArgsSchemaOnlyPayload returns permissive schema", () => {
    const payload = buildRunArgsSchemaOnlyPayload("review-plan-artifact");
    assert.ok(payload);
    assert.equal(payload.ok, true);
    assert.equal(payload.code, "run-args-schema");
    assert.equal(payload.command, "review-plan-artifact");
    assert.equal(payload.schemaSource, "manifest-permissive-fallback");
    assert.equal(payload.policy.operationId, "planning.review-plan-artifact");
  });

  it("is Tier C when recordReview is false", () => {
    assert.equal(isSensitiveModuleCommand("review-plan-artifact", { recordReview: false }), false);
    assert.equal(isSensitiveModuleCommand("review-plan-artifact", {}), false);
    assert.equal(isSensitiveModuleCommand("review-plan-artifact", { recordReview: true }), true);
  });

  it("handler validates planId or artifact argv", async () => {
    const missing = await planningModule.onCommand(
      { name: "review-plan-artifact", args: {} },
      { runtimeVersion: "0.1", workspacePath: root }
    );
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "invalid-run-args");

    const notFound = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: { planId: "550e8400-e29b-41d4-a716-446655440000", profile: "minimal" }
      },
      { runtimeVersion: "0.1", workspacePath: root }
    );
    assert.equal(notFound.ok, false);
    assert.equal(notFound.code, "plan-artifact-not-found");
  });
});
