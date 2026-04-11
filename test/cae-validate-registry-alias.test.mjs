/**
 * cae-validate-registry alias (**T898**).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { contextActivationModule } from "../dist/index.js";

const root = process.cwd();

test("cae-validate-registry returns same shape as registry validate path", async () => {
  const eff = {
    tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" },
    kit: { cae: { registryStore: "sqlite" } }
  };
  const a = await contextActivationModule.onCommand(
    { name: "cae-registry-validate", args: { schemaVersion: 1 } },
    { runtimeVersion: "0.1", workspacePath: root, effectiveConfig: eff }
  );
  const b = await contextActivationModule.onCommand(
    { name: "cae-validate-registry", args: { schemaVersion: 1 } },
    { runtimeVersion: "0.1", workspacePath: root, effectiveConfig: eff }
  );
  assert.equal(a.ok, b.ok);
  if (a.ok && b.ok) {
    assert.equal(a.code, "cae-registry-validate-ok");
    assert.equal(b.code, "cae-registry-validate-ok");
    assert.equal(a.data.registryContentHash, b.data.registryContentHash);
  }
});
