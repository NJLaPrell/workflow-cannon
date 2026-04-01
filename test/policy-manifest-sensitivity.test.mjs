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

for (const row of manifest) {
  test(`builtin manifest policySensitivity matches policy.ts for ${row.name}`, () => {
    const sensitiveDefaultArgs = isSensitiveModuleCommand(row.name, {});
    const sensitiveDryRun = isSensitiveModuleCommand(row.name, { options: { dryRun: true } });

    if (row.policySensitivity === "non-sensitive") {
      assert.equal(sensitiveDefaultArgs, false, "non-sensitive commands must not map to an operation in policy.ts");
    } else if (row.policySensitivity === "sensitive") {
      assert.equal(sensitiveDefaultArgs, true);
      assert.equal(sensitiveDryRun, true);
    } else {
      assert.equal(row.policySensitivity, "sensitive-with-dryrun");
      assert.equal(sensitiveDefaultArgs, true);
      assert.equal(sensitiveDryRun, false, "doc dryRun must waive sensitivity");
    }
  });
}

test("extraSensitiveModuleCommands upgrades list-tasks to dynamic-sensitive", () => {
  const eff = { policy: { extraSensitiveModuleCommands: ["list-tasks"] } };
  assert.equal(isSensitiveModuleCommandForEffective("list-tasks", {}, eff), true);
  assert.equal(resolvePolicyOperationIdForCommand("list-tasks", eff), "policy.dynamic-sensitive");
});
