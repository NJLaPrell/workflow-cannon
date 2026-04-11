/**
 * Read-only CAE commands against SQLite registry (**T899** D5 smoke).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { contextActivationModule } from "../dist/index.js";

const root = process.cwd();
const eff = {
  tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" },
  kit: { cae: { registryStore: "sqlite" } }
};
const ctx = { runtimeVersion: "0.1", workspacePath: root, effectiveConfig: eff };

test("cae-list-artifacts ok against SQLite registry", async () => {
  const r = await contextActivationModule.onCommand(
    { name: "cae-list-artifacts", args: { schemaVersion: 1, limit: 5 } },
    ctx
  );
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.data.artifactIds));
  assert.ok(r.data.artifactIds.length > 0);
});

test("cae-health includes registry counts when registry ok", async () => {
  const r = await contextActivationModule.onCommand({ name: "cae-health", args: { schemaVersion: 1 } }, ctx);
  assert.equal(r.ok, true);
  if (r.data.registryStatus === "ok") {
    assert.ok(typeof r.data.artifactCount === "number");
    assert.ok(typeof r.data.activationCount === "number");
    assert.ok(typeof r.data.registryStore === "string");
  }
});
