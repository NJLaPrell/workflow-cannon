import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isSensitiveModuleCommand,
  isSensitiveModuleCommandForEffective,
  resolvePolicyOperationIdForCommand
} from "../dist/index.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "../src/contracts/builtin-run-command-manifest.json"), "utf8")
);

/** Args that exercise the mutating path for commands with Tier C waivers in policy.ts. */
function defaultSensitiveProbeArgs(commandName) {
  if (commandName === "draft-plan-artifact") {
    return { persist: true };
  }
  if (commandName === "review-plan-artifact") {
    return { recordReview: true };
  }
  if (commandName === "finalize-plan-to-phase") {
    return { dryRun: false };
  }
  return {};
}

/** Args that waive sensitive-with-dryrun per policy.ts (doc dryRun or command-specific Tier C). */
function waivedSensitiveProbeArgs(commandName) {
  if (commandName === "draft-plan-artifact") {
    return { persist: false };
  }
  if (commandName === "review-plan-artifact") {
    return { recordReview: false };
  }
  if (commandName === "finalize-plan-to-phase") {
    return { dryRun: true };
  }
  return { options: { dryRun: true } };
}

for (const row of manifest) {
  test(`builtin manifest policySensitivity matches policy.ts for ${row.name}`, () => {
    const sensitiveDefaultArgs = isSensitiveModuleCommand(row.name, defaultSensitiveProbeArgs(row.name));
    const sensitiveDryRun = isSensitiveModuleCommand(row.name, waivedSensitiveProbeArgs(row.name));

    if (row.policySensitivity === "non-sensitive") {
      assert.equal(sensitiveDefaultArgs, false, "non-sensitive commands must not map to an operation in policy.ts");
    } else if (row.policySensitivity === "sensitive") {
      assert.equal(sensitiveDefaultArgs, true);
      assert.equal(sensitiveDryRun, true);
    } else {
      assert.equal(row.policySensitivity, "sensitive-with-dryrun");
      assert.equal(sensitiveDefaultArgs, true);
      assert.equal(sensitiveDryRun, false, "dryRun / Tier C waive paths must not require policyApproval");
    }
  });
}

test("extraSensitiveModuleCommands upgrades list-tasks to dynamic-sensitive", () => {
  const eff = { policy: { extraSensitiveModuleCommands: ["list-tasks"] } };
  assert.equal(isSensitiveModuleCommandForEffective("list-tasks", {}, eff), true);
  assert.equal(resolvePolicyOperationIdForCommand("list-tasks", eff), "policy.dynamic-sensitive");
});
