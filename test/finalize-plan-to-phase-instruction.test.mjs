import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

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

  it("instruction file includes schema-only agent capsule", () => {
    const text = fs.readFileSync(instructionPath, "utf8");
    assert.ok(text.includes("agentCapsule|v=1|command=finalize-plan-to-phase"));
    assert.ok(text.includes("--schema-only"));
    assert.ok(text.includes("Preview or persist"));
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

  it("is Tier C for preview and Tier B for persist", () => {
    assert.equal(isSensitiveModuleCommand("finalize-plan-to-phase", { dryRun: true }), false);
    assert.equal(isSensitiveModuleCommand("finalize-plan-to-phase", {}), false);
    assert.equal(isSensitiveModuleCommand("finalize-plan-to-phase", { dryRun: false }), true);
  });
});