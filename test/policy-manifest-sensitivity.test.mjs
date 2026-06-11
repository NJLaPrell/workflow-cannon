import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isSensitiveModuleCommand,
  isSensitiveModuleCommandForEffective,
  resolvePolicyOperationIdForCommand,
  resolveCommandExecutionPolicy
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
  if (commandName === "prepare-release-artifacts") {
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
  if (commandName === "prepare-release-artifacts") {
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

test("resolveCommandExecutionPolicy resolves command execution metadata and policies correctly", () => {
  // 1. Mutation command resolves to mutation class policy
  const mutationPolicy = resolveCommandExecutionPolicy("run-transition");
  assert.equal(mutationPolicy.class, "mutation");
  assert.equal(mutationPolicy.allowAutoCheckpoint, true);
  assert.equal(mutationPolicy.allowCaePreflight, true);
  assert.equal(mutationPolicy.allowLifecycleHooks, true);
  assert.equal(mutationPolicy.persistRunLog, true);
  assert.equal(mutationPolicy.requiresPolicy, true);
  assert.equal(mutationPolicy.storeOpenMode, "full");

  // 2. Read command resolves to read class policy
  const readPolicy = resolveCommandExecutionPolicy("list-tasks");
  assert.equal(readPolicy.class, "read");
  assert.equal(readPolicy.allowAutoCheckpoint, false);
  assert.equal(readPolicy.allowCaePreflight, true);
  assert.equal(readPolicy.allowLifecycleHooks, true);
  assert.equal(readPolicy.persistRunLog, true);
  assert.equal(readPolicy.requiresPolicy, true);
  assert.equal(readPolicy.storeOpenMode, "readOnly");

  // 3. Hot read command resolves to read_hot class policy
  const readHotPolicy = resolveCommandExecutionPolicy("dashboard-terminal-tasks");
  assert.equal(readHotPolicy.class, "read_hot");
  assert.equal(readHotPolicy.allowAutoCheckpoint, false);
  assert.equal(readHotPolicy.allowCaePreflight, false);
  assert.equal(readHotPolicy.allowLifecycleHooks, false);
  assert.equal(readHotPolicy.persistRunLog, false);
  assert.equal(readHotPolicy.requiresPolicy, false);
  assert.equal(readHotPolicy.storeOpenMode, "readOnly");

  // 4. Unknown command defaults to mutation class policy (safe fallback)
  const unknownPolicy = resolveCommandExecutionPolicy("some-unknown-nonsense-command");
  assert.equal(unknownPolicy.class, "mutation");
  assert.equal(unknownPolicy.allowAutoCheckpoint, true);
  assert.equal(unknownPolicy.allowCaePreflight, true);
  assert.equal(unknownPolicy.allowLifecycleHooks, true);
  assert.equal(unknownPolicy.persistRunLog, true);
  assert.equal(unknownPolicy.requiresPolicy, true);
  assert.equal(unknownPolicy.storeOpenMode, "full");
});

